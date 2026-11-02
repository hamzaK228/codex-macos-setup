#!/usr/bin/env python3
"""Build an explicit, sanitized setup payload; never export Codex account/session state."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import os

REPO = Path(__file__).resolve().parents[1]
SKIP = {'.git', 'node_modules', '__pycache__', '.venv', '.cache', '.data', 'dist', 'allure-results', 'test-results', '.DS_Store'}
TEXT = {'.md', '.txt', '.py', '.sh', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.toml', '.yaml', '.yml', '.css', '.html', '.csv', '.xml', '.svg', '.cmd', '.ps1'}

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source-home', type=Path, default=Path.home())
    ap.add_argument('--pixel-source', type=Path)
    args = ap.parse_args()
    home = args.source_home.resolve()
    pixel = (args.pixel_source or home / '.local/share/pixel-agents').resolve()
    stage = Path(tempfile.mkdtemp(prefix='.snapshot-', dir=REPO))
    for name in ['payload', 'vendor', 'observer', 'snapshot.json']:
        if (REPO / name).is_symlink(): raise ValueError('Generated output cannot be a symlink')
    (stage / 'observer').mkdir()
    (stage / 'payload').mkdir()
    for name in ['open-office.py', 'test_open_office.py']:
        if (REPO / 'observer' / name).is_file(): shutil.copy2(REPO / 'observer' / name, stage / 'observer' / name)
    skipped = []
    replacements = [(str(home / '.codex'), '__CODEX_HOME__'), (str(home / '.local/share/pixel-agents-codex'), '__INSTALL_ROOT__/observer'), (str(home / '.local/share/pixel-agents'), '__INSTALL_ROOT__/pixel-agents'), (str(home), '~')]
    def copy(source, target, sanitize=True):
        if source.is_symlink() or not source.is_file():
            raise ValueError(f'Nonregular export source: {source.name}')
        data = source.read_bytes()
        if data[:4] in [b'\x7fELF', b'\xcf\xfa\xed\xfe', b'\xce\xfa\xed\xfe', b'\xfe\xed\xfa\xcf', b'\xca\xfe\xba\xbe'] or data[:2] == b'MZ':
            skipped.append(str(source.relative_to(home)) if source.is_relative_to(home) else source.name)
            return
        if sanitize and (source.suffix.lower() in TEXT or source.name in ['AGENTS.md', 'LICENSE', 'NOTICE']):
            text = data.decode('utf-8')
            for old, new in replacements: text = text.replace(old, new)
            data = text.encode()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        target.chmod(0o755 if source.stat().st_mode & 0o111 else 0o644)
    skills = home / '.codex/skills'
    skill_names=[]
    for source in sorted(skills.iterdir()):
        if source.name.startswith('.') or not (source / 'SKILL.md').is_file(): continue
        skill_names.append(source.name)
        for file in source.rglob('*'):
            rel = file.relative_to(source)
            if any(part in SKIP for part in rel.parts) or file.name.startswith('.env') or file.suffix in ['.pyc', '.pem', '.key']: continue
            if file.is_file(): copy(file, stage / 'payload/skills' / source.name / rel)
    profiles=[]
    for file in sorted((home / '.codex/agents').glob('agency_*.toml')):
        copy(file, stage / 'payload/agents' / file.name); profiles.append(file.stem)
    files = subprocess.check_output(['git', '-C', str(pixel), 'ls-files', '-co', '--exclude-standard'], text=True).splitlines()
    for name in sorted(set(files)):
        rel=Path(name)
        if rel.is_absolute() or '..' in rel.parts or any(part in SKIP | {'.github', '.vscode', '.husky'} for part in rel.parts) or rel.name.startswith('.env'): continue
        copy(pixel / rel, stage / 'vendor/pixel-agents' / rel)
    for name in ['forward.py', 'report.py', 'test_forward.py', 'test_report.py']:
        copy(home / '.local/share/pixel-agents-codex' / name, stage / 'observer' / name)
        file=stage/'observer'/name
        file.write_text(file.read_text().replace('#!/usr/bin/python3', '#!/usr/bin/env python3'))
    policy = (home / '.codex/AGENTS.md').read_text()
    policy = policy.replace(str(home / '.codex'), '__CODEX_HOME__').replace(str(home / '.local/share/pixel-agents-codex'), '__INSTALL_ROOT__/observer').replace('/usr/bin/python3', '__PYTHON__')
    policy = policy.replace('__PYTHON__ __INSTALL_ROOT__/observer/report.py', '__PYTHON__ "__INSTALL_ROOT__/observer/report.py"')
    (stage/'payload/AGENTS.template.md').write_text('<!-- BEGIN codex-office-kit -->\n' + policy.strip() + '\n<!-- END codex-office-kit -->\n')
    cli = stage/'vendor/pixel-agents/server/src/codexObserverCli.ts'
    cli.write_text(cli.read_text().replace("path.join(os.homedir(), '.codex', '.codex-global-state.json')", "path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), '.codex-global-state.json')"))
    (stage/'snapshot.json').write_text(json.dumps({'format':1, 'skills':skill_names, 'profileCount':len(profiles), 'profiles':profiles, 'pixelAgentsUpstream':{'repository':'https://github.com/pixel-agents-hq/pixel-agents','commit':subprocess.check_output(['git','-C',str(pixel),'rev-parse','HEAD'],text=True).strip()}, 'nativeBinariesExcluded':skipped, 'excluded':['account credentials','Codex config.toml','chat and session history','private projects','task data','API keys','Telegram configuration','plugin cache and installed connections']}, ensure_ascii=False,indent=2)+'\n')
    for name in ['payload/skills', 'payload/agents']:
        (stage / name).mkdir(parents=True, exist_ok=True)
    swapped = []
    try:
        for name in ['payload', 'vendor', 'observer', 'snapshot.json']:
            target, new, old = REPO / name, stage / name, stage / ('previous-' + name)
            if target.exists(): os.replace(target, old)
            try: os.replace(new, target)
            except BaseException:
                if old.exists(): os.replace(old, target)
                raise
            swapped.append((target, old))
    except BaseException:
        for target, old in reversed(swapped):
            if target.is_dir(): shutil.rmtree(target)
            else: target.unlink()
            if old.exists(): os.replace(old, target)
        raise
    shutil.rmtree(stage)
    print(json.dumps({'skills':len(skill_names),'profiles':len(profiles),'nativeBinariesExcluded':len(skipped)}))
if __name__=='__main__': main()
