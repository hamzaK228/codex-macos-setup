"""Installer checks use isolated fake payloads and never run vendor code."""
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import stat
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('installer', Path(__file__).parents[1] / 'scripts/install.py')
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / 'source'
        self.home = self.base / 'friend home'
        self.home.mkdir()
        self.codex = self.home / 'custom codex'
        self.root = self.home / 'kit'
        self.file('payload/skills/demo/SKILL.md', 'disable-model-invocation: true\n__CODEX_HOME__ __INSTALL_ROOT__')
        self.file('payload/agents/developer.toml', 'path="__CODEX_HOME__/skills"')
        self.file('payload/AGENTS.template.md', m.BEGIN + '\n__PYTHON__ __INSTALL_ROOT__/observer/report.py\n' + m.END)
        self.file('observer/forward.py', "EVENTS = {'Stop', 'SessionStart'}\n")
        self.file('observer/report.py', '# helper')

    def file(self, rel, value):
        path = self.source / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value)
        return path

    def installer(self, dry=False):
        return m.Installer(self.source, self.home, self.codex, self.root, dry)

    def test_payload_templates_idempotency_backups_preserve_policy(self):
        self.codex.mkdir()
        (self.codex / 'AGENTS.md').write_text('Friend policy\n')
        target = self.codex / 'skills/demo/SKILL.md'
        target.parent.mkdir(parents=True)
        target.write_text('Old skill')
        original_source = (self.source / 'payload/skills/demo/SKILL.md').read_bytes()
        i = self.installer()
        i.payload()
        self.assertGreater(i.apply(), 0)
        self.assertIn(str(self.codex), target.read_text())
        self.assertIn('disable-model-invocation: true', target.read_text())
        policy = (self.codex / 'AGENTS.md').read_text()
        self.assertTrue(policy.startswith('Friend policy'))
        self.assertEqual(policy.count(m.BEGIN), 1)
        self.assertIn(str(self.root), policy)
        self.assertEqual((self.source / 'payload/skills/demo/SKILL.md').read_bytes(), original_source)
        backups = [p.read_text() for p in i.backup.rglob('*') if p.is_file()]
        self.assertIn('Old skill', backups)
        again = self.installer()
        again.payload()
        self.assertEqual(again.apply(), 0)
        self.assertFalse(again.backup.exists())

    def test_manifest_hashes_rendered_profiles_and_references(self):
        self.file('payload/agents/demo.toml', 'path="__CODEX_HOME__/skills"')
        self.file('payload/skills/agency-team/references/upstream/demo.md', '__CODEX_HOME__ source')
        manifest = {'profiles': [{'name': 'demo', 'file': '__CODEX_HOME__/agents/demo.toml',
                    'reference': 'upstream/demo.md', 'profileSha256': 'old-profile', 'sourceSha256': 'old-source'}]}
        self.file('payload/skills/agency-team/references/manifest.json', json.dumps(manifest))
        i = self.installer()
        i.payload()
        i.apply()
        refs = self.codex / 'skills/agency-team/references'
        entry = m.read_json(refs / 'manifest.json')['profiles'][0]
        self.assertEqual(entry['file'], str(self.codex / 'agents/demo.toml'))
        self.assertEqual(entry['profileSha256'], m.hashlib.sha256((self.codex / 'agents/demo.toml').read_bytes()).hexdigest())
        self.assertEqual(entry['sourceSha256'], m.hashlib.sha256((refs / 'upstream/demo.md').read_bytes()).hexdigest())
        self.assertEqual(entry['exportedProfileSha256'], 'old-profile')
        self.assertEqual(entry['upstreamSourceSha256'], 'old-source')
        self.assertEqual(json.loads((self.source / 'payload/skills/agency-team/references/manifest.json').read_text()), manifest)
        again = self.installer()
        again.payload()
        self.assertEqual(again.apply(), 0)

    def test_dry_run_no_mutations(self):
        before = sorted(str(p) for p in self.base.rglob('*'))
        i = self.installer(True)
        i.payload()
        i.observer()
        with patch.object(m.shutil, 'which', return_value='/opt/node/bin/node'):
            m.prepare_launchagent(i)
        self.assertGreater(i.apply(), 0)
        self.assertEqual(before, sorted(str(p) for p in self.base.rglob('*')))

    def test_hooks_token_permissions_and_retention(self):
        self.codex.mkdir()
        unrelated = {'hooks': [{'type': 'command', 'command': 'friend-command'}]}
        (self.codex / 'hooks.json').write_text(json.dumps({'custom': 'kept', 'hooks': {'Stop': [unrelated], 'Other': []}}))
        i = self.installer()
        i.observer()
        i.apply()
        config = m.read_json(self.home / '.config/pixel-agents-codex/config.json')
        token_path = Path(config['token_file'])
        token = token_path.read_text()
        self.assertEqual(config['scopes'], ['/'])
        self.assertEqual(stat.S_IMODE(token_path.stat().st_mode), 0o600)
        self.assertRegex(token.strip(), r'^[a-f0-9]{64}$')
        hooks = m.read_json(self.codex / 'hooks.json')
        self.assertEqual(hooks['custom'], 'kept')
        self.assertEqual(hooks['hooks']['Stop'][0], unrelated)
        self.assertEqual(len(hooks['hooks']['Stop']), 2)
        command = hooks['hooks']['Stop'][1]['hooks'][0]['command']
        self.assertIn(str(self.root / 'observer/forward.py'), command)
        again = self.installer()
        again.observer()
        self.assertEqual(again.apply(), 0)
        self.assertEqual(token_path.read_text(), token)
        token_path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'invalid'):
            self.installer().observer()

    def test_launchagent_quotes_via_argument_array_and_scopes(self):
        i = self.installer()
        i.observer()
        with patch.object(m.shutil, 'which', return_value='/opt/node 24/bin/node'):
            m.prepare_launchagent(i)
        path = self.home / 'Library/LaunchAgents/local.codex.pixel-office.plist'
        plist = plistlib.loads(i.writes[path][0])
        self.assertEqual(plist['ProgramArguments'][0], '/opt/node 24/bin/node')
        self.assertEqual(plist['ProgramArguments'][-4:], ['--port', '4312', '--scope', '/'])
        self.assertEqual(plist['EnvironmentVariables']['CODEX_HOME'], str(self.codex))

    def test_symlinks_and_malformed_policy_rejected(self):
        (self.home / 'linked').symlink_to(self.source, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            m.Installer(self.source, self.home, self.home / 'linked/codex', self.root)
        self.file('payload/skills/demo/link', 'x').unlink()
        (self.source / 'payload/skills/demo/link').symlink_to('/etc/passwd')
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            self.installer().payload()
        with self.assertRaisesRegex(ValueError, 'Malformed'):
            m.merged_policy(m.BEGIN, 'policy')

    def test_skills_only_cli_never_runs_dependencies_or_daemon(self):
        script = self.source / 'scripts/install.py'
        script.parent.mkdir()
        script.write_text('# fake module path')
        with patch.object(m, '__file__', str(script)), patch.object(m.Path, 'home', return_value=self.home), \
                patch.object(m, 'preflight', side_effect=AssertionError('must not preflight')), \
                patch.object(m, 'build_office', side_effect=AssertionError('must not build')), \
                patch.object(m, 'start_launchagent', side_effect=AssertionError('must not launch')):
            self.assertEqual(m.main(['--skills-only', '--codex-home', str(self.codex), '--install-root', str(self.root)]), 0)
        self.assertFalse((self.home / '.config').exists())


if __name__ == '__main__':
    unittest.main()
