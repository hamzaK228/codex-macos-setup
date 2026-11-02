import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).resolve().parents[1] / 'scripts/build_snapshot.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SnapshotTest(unittest.TestCase):
    def test_removed_sources_do_not_survive_reexport(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); home = base/'source'; output = base/'output'; pixel = base/'pixel'
            output.mkdir(); pixel.mkdir()
            files = {'.codex/skills/one/SKILL.md':'demo', '.codex/agents/agency_one.toml':'demo', '.codex/AGENTS.md':'policy'}
            for name in ['forward.py','report.py','test_forward.py','test_report.py']:
                files['.local/share/pixel-agents-codex/'+name] = '# demo'
            for name, data in files.items():
                target = home/name; target.parent.mkdir(parents=True, exist_ok=True); target.write_text(data)
            cli = pixel/'server/src/codexObserverCli.ts'; cli.parent.mkdir(parents=True); cli.write_text('demo')
            stale = pixel/'stale.txt'; stale.write_text('demo')
            subprocess.run(['git','init','-q',str(pixel)],check=True)
            subprocess.run(['git','-C',str(pixel),'add','.'],check=True)
            subprocess.run(['git','-C',str(pixel),'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture'],check=True)
            args = ['snapshot','--source-home',str(home),'--pixel-source',str(pixel)]
            with patch.object(module,'REPO',output), patch('sys.argv',args): module.main()
            (home/'.codex/skills/one/SKILL.md').unlink()
            (home/'.codex/agents/agency_one.toml').unlink()
            stale.unlink()
            subprocess.run(['git','-C',str(pixel),'rm','--cached','-q','stale.txt'],check=True)
            with patch.object(module,'REPO',output), patch('sys.argv',args): module.main()
            self.assertFalse((output/'payload/skills/one').exists())
            self.assertFalse((output/'payload/agents/agency_one.toml').exists())
            self.assertFalse((output/'vendor/pixel-agents/stale.txt').exists())
            self.assertEqual(json.loads((output/'snapshot.json').read_text())['profileCount'],0)

if __name__ == '__main__': unittest.main()
