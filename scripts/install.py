#!/usr/bin/env python3
"""Portable Codex payload installer. Python 3.11+, standard library only."""
from __future__ import annotations
import argparse
import ast
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import secrets
import shlex
import shutil
import stat
import subprocess
import sys
import tempfile
import uuid

BEGIN = '<!-- BEGIN codex-office-kit -->'
END = '<!-- END codex-office-kit -->'
EVENTS = {'SessionStart', 'SubagentStart', 'PreToolUse', 'PostToolUse', 'PermissionRequest',
          'UserPromptSubmit', 'SubagentStop', 'Stop', 'Interrupt', 'SessionEnd'}


def safe(path: Path) -> Path:
    path = Path(os.path.abspath(path.expanduser()))
    for part in (path, *path.parents):
        if part.is_symlink():
            raise ValueError(f'Symlink refused: {part}')
    return path


def read_json(path: Path) -> dict:
    safe(path)
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f'Expected JSON object: {path}')
    return value


def merged_policy(existing: str, template: str) -> str:
    if existing.count(BEGIN) != existing.count(END) or existing.count(BEGIN) > 1:
        raise ValueError('Malformed managed AGENTS block')
    template = template.strip()
    if template.startswith(BEGIN) and template.endswith(END):
        template = template[len(BEGIN):-len(END)].strip()
    if BEGIN in template or END in template:
        raise ValueError('Malformed template managed block')
    block = BEGIN + '\n' + template + '\n' + END
    if BEGIN in existing:
        start, end = existing.index(BEGIN), existing.index(END)
        if end < start:
            raise ValueError('Malformed managed AGENTS block')
        return existing[:start] + block + existing[end + len(END):]
    return existing.rstrip() + ('\n\n' if existing.strip() else '') + block + '\n'


def json_bytes(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


class Installer:
    def __init__(self, source: Path, home: Path, codex_home: Path, install_root: Path, dry_run=False):
        self.source, self.home = safe(source), safe(home)
        self.codex_home, self.root = safe(codex_home), safe(install_root)
        if (self.codex_home == self.source or self.source in self.codex_home.parents or
                self.codex_home in self.source.parents):
            raise ValueError('Codex home must be separate from source checkout')
        for target in (self.codex_home, self.root):
            if target == self.home or target in self.home.parents:
                raise ValueError('Install destinations must be dedicated directories, not home or its ancestors')
        if self.root == self.source or self.source in self.root.parents or self.root in self.source.parents:
            raise ValueError('Install root must be separate from source checkout')
        if self.root == self.codex_home or self.codex_home in self.root.parents or self.root in self.codex_home.parents:
            raise ValueError('Codex home and install root must be separate')
        self.dry_run = dry_run
        self.writes: dict[Path, tuple[bytes, int]] = {}
        self.backup = self.codex_home / 'office-kit-backups' / (datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8])

    def queue(self, target: Path, data: bytes, mode=0o644):
        target = safe(target)
        if target.exists() and not target.is_file():
            raise ValueError(f'Expected regular file: {target}')
        for parent in target.parents:
            if parent.exists() and not parent.is_dir():
                raise ValueError(f'Expected directory: {parent}')
        self.writes[target] = data, mode

    def render(self, data: bytes) -> bytes:
        try:
            value = data.decode('utf-8')
        except UnicodeDecodeError:
            return data
        return (value.replace('__CODEX_HOME__', str(self.codex_home))
                .replace('__INSTALL_ROOT__', str(self.root))
                .replace('__PYTHON__', shlex.quote(sys.executable))).encode()

    def tree(self, source: Path, destination: Path):
        safe(source)
        if not source.is_dir():
            raise ValueError(f'Missing payload directory: {source}')
        for directory, dirs, files in os.walk(source, followlinks=False):
            for name in dirs + files:
                safe(Path(directory) / name)
            for name in sorted(files):
                src = Path(directory) / name
                if not src.is_file():
                    raise ValueError(f'Nonregular payload: {src}')
                self.queue(destination / src.relative_to(source), self.render(src.read_bytes()),
                           0o755 if src.stat().st_mode & 0o111 else 0o644)

    def payload(self):
        self.tree(self.source / 'payload/skills', self.codex_home / 'skills')
        self.tree(self.source / 'payload/agents', self.codex_home / 'agents')
        self.rehash_agency_manifest()
        policy = safe(self.source / 'payload/AGENTS.template.md')
        target = safe(self.codex_home / 'AGENTS.md')
        existing = target.read_text() if target.exists() else ''
        self.queue(target, merged_policy(existing, self.render(policy.read_bytes()).decode()).encode())

    def rehash_agency_manifest(self):
        refs = self.codex_home / 'skills/agency-team/references'
        target = refs / 'manifest.json'
        if target not in self.writes:
            return
        manifest = json.loads(self.writes[target][0])
        for entry in manifest['profiles']:
            name = entry['name']
            reference = Path(entry['reference'])
            if (not re.fullmatch(r'[A-Za-z0-9_-]+', name) or reference.is_absolute() or
                    '..' in reference.parts):
                raise ValueError('Unsafe agency manifest path')
            profile = self.codex_home / 'agents' / (name + '.toml')
            source = refs / reference
            if profile not in self.writes or source not in self.writes:
                raise ValueError(f'Agency manifest payload missing: {name}')
            for key, original_key, path in (
                    ('profileSha256', 'exportedProfileSha256', profile),
                    ('sourceSha256', 'upstreamSourceSha256', source)):
                digest = hashlib.sha256(self.writes[path][0]).hexdigest()
                if digest != entry[key]:
                    entry.setdefault(original_key, entry[key])
                    entry[key] = digest
            entry['file'] = str(profile)
        self.queue(target, json_bytes(manifest))

    def observer(self):
        self.tree(self.source / 'observer', self.root / 'observer')
        config_dir = safe(self.home / '.config/pixel-agents-codex')
        config_path = config_dir / 'config.json'
        if config_path.exists():
            config = read_json(config_path)
            token_path = safe(Path(config.get('token_file', '')))
            scopes = config.get('scopes')
            if (not isinstance(scopes, list) or not scopes or
                    any(not isinstance(s, str) or not Path(s).is_absolute() for s in scopes) or
                    not Path(config.get('token_file', '')).is_absolute() or not token_path.is_file() or
                    not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', token_path.read_text().strip()) or token_path.stat().st_mode & 0o077):
                raise ValueError('Existing observer config/token invalid; repair it explicitly before installing')
        else:
            token_path = config_dir / 'token'
            if token_path.exists():
                raise ValueError('Existing observer token without config; refusing overwrite')
            self.queue(token_path, (secrets.token_hex(32) + '\n').encode(), 0o600)
            self.queue(config_path, json_bytes({'token_file': str(token_path), 'scopes': ['/']}), 0o600)
        hooks_path = safe(self.codex_home / 'hooks.json')
        hooks = read_json(hooks_path) if hooks_path.exists() else {}
        mapping = hooks.setdefault('hooks', {})
        if not isinstance(mapping, dict):
            raise ValueError('hooks must be an object')
        command = shlex.join([sys.executable, str(self.root / 'observer/forward.py')])
        # Read the supplied forwarder as data; never import or execute it here.
        module = ast.parse((self.source / 'observer/forward.py').read_text())
        supported = None
        for node in module.body:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'EVENTS' for t in node.targets):
                supported = ast.literal_eval(node.value)
        if not isinstance(supported, set) or not supported or not supported <= EVENTS:
            raise ValueError('Unexpected observer lifecycle events')
        for event in sorted(supported):
            groups = mapping.setdefault(event, [])
            if not isinstance(groups, list):
                raise ValueError(f'hooks.{event} must be an array')
            if not any(isinstance(g, dict) and any(isinstance(h, dict) and h.get('command') == command
                       for h in (g.get('hooks') if isinstance(g.get('hooks'), list) else [])) for g in groups):
                groups.append({'hooks': [{'type': 'command', 'command': command, 'timeout': 2}]})
        self.queue(hooks_path, json_bytes(hooks))

    def apply(self):
        changed = 0
        for path, (data, mode) in self.writes.items():
            safe(path)
            same = path.exists() and path.read_bytes() == data
            if same and stat.S_IMODE(path.stat().st_mode) == mode:
                continue
            changed += 1
            if self.dry_run:
                continue
            if path.exists() and not same:
                backup = safe(self.backup / str(path).lstrip('/'))
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, backup)
                backup.chmod(0o600)
            path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(prefix='.office-kit-', dir=path.parent)
            try:
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(data)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.chmod(tmp, mode)
                os.replace(tmp, path)
            finally:
                if os.path.exists(tmp):
                    os.unlink(tmp)
        print(f'{"Would update" if self.dry_run else "Updated"} {changed} files.')
        return changed


def preflight():
    for tool in ('node', 'npm', 'git'):
        if not shutil.which(tool):
            raise ValueError(f'{tool} missing. Install Node.js 22+ (including npm) and Git, then retry.')
    version = tuple(int(n) for n in subprocess.check_output(['node', '--version'], text=True).strip().lstrip('v').split('.')[:2])
    if version < (22, 12):
        raise ValueError('Node.js 22.12+ required. Install it, then retry.')


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--codex-home', type=Path, default=Path.home() / '.codex')
    p.add_argument('--install-root', type=Path, default=Path.home() / '.local/share/codex-office-kit')
    p.add_argument('--skills-only', action='store_true', help='Install skills, agents and managed policy only')
    p.add_argument('--no-start', action='store_true', help='Build office and write LaunchAgent without loading it')
    p.add_argument('--dry-run', action='store_true', help='Validate and report without writes, network or services')
    return p


def main(argv=None):
    if sys.version_info < (3, 11):
        raise ValueError('Python 3.11+ required')
    args = parser().parse_args(argv)
    source = Path(__file__).absolute().parent.parent
    installer = Installer(source, Path.home(), args.codex_home, args.install_root, args.dry_run)
    installer.payload()
    if not args.skills_only:
        preflight()
        installer.observer()
        installer.tree(source / 'vendor/pixel-agents', installer.root / 'pixel-agents')
        prepare_launchagent(installer)
    installer.apply()
    if not args.skills_only and not args.dry_run:
        build_office(installer.root / 'pixel-agents')
        if sys.platform == 'darwin' and not args.no_start:
            start_launchagent(installer)
        print('Approve the native hooks in Codex settings. The installer does not grant hook trust.')
    return 0


# Office build/launch functions kept separate so isolated tests never execute vendor code.
def build_office(root: Path):
    safe(root / 'node_modules')
    safe(root / 'dist')
    if (root / 'dist').exists():
        for path in (root / 'dist').rglob('*'):
            safe(path)
    subprocess.run(['npm', 'ci', '--ignore-scripts'], cwd=root, check=True)
    subprocess.run(['npm', 'run', 'build:webview'], cwd=root, check=True)
    subprocess.run([str(root / 'node_modules/.bin/esbuild'), 'server/src/codexObserverCli.ts', '--bundle',
                    '--platform=node', '--format=cjs', '--packages=external', '--outfile=dist/codex-observer.cjs'], cwd=root, check=True)
    shutil.copytree(root / 'webview-ui/public/assets', root / 'dist/assets', dirs_exist_ok=True)


def prepare_launchagent(installer: Installer):
    node = shutil.which('node')
    if not node:
        raise ValueError('Node.js missing')
    config = installer.home / '.config/pixel-agents-codex/config.json'
    cfg = read_json(config) if config.exists() else {'token_file': str(config.parent / 'token'), 'scopes': ['/']}
    token = cfg['token_file']
    arguments = [node, str(installer.root / 'pixel-agents/dist/codex-observer.cjs'), '--port', '4312']
    for scope in cfg['scopes']:
        arguments += ['--scope', scope]
    plist = {'Label': 'local.codex.pixel-office',
             'ProgramArguments': arguments,
             'EnvironmentVariables': {'PIXEL_CODEX_TOKEN_FILE': token, 'CODEX_HOME': str(installer.codex_home),
                                      'PATH': str(Path(node).parent) + ':/usr/bin:/bin:/usr/sbin:/sbin'},
             'WorkingDirectory': str(installer.root / 'pixel-agents'),
             'RunAtLoad': True, 'KeepAlive': True,
             'StandardOutPath': str(installer.root / 'office.log'),
             'StandardErrorPath': str(installer.root / 'office-error.log')}
    installer.queue(installer.home / 'Library/LaunchAgents/local.codex.pixel-office.plist', plistlib.dumps(plist))


def start_launchagent(installer: Installer):
    domain = f'gui/{os.getuid()}'
    plist = installer.home / 'Library/LaunchAgents/local.codex.pixel-office.plist'
    subprocess.run(['launchctl', 'bootout', f'{domain}/local.codex.pixel-office'], capture_output=True)
    subprocess.run(['launchctl', 'bootstrap', domain, str(plist)], check=True)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Install stopped: {error}', file=sys.stderr)
        raise SystemExit(1)
