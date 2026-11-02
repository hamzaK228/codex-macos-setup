#!/usr/bin/env python3
"""Open this user's local office without printing its private URL."""
import json
from pathlib import Path
import re
import stat
import sys
import urllib.parse
import webbrowser


def office_url(home=None):
    home = Path.home() if home is None else Path(home)
    config = json.loads((home / '.config/pixel-agents-codex/config.json').read_text())
    token_file = Path(config['token_file'])
    if not token_file.is_absolute() or token_file.is_symlink():
        raise ValueError('Invalid private token file')
    info = token_file.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
        raise ValueError('Token file must be private')
    token = token_file.read_text().strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', token):
        raise ValueError('Invalid office token')
    return 'http://127.0.0.1:4312/?token=' + urllib.parse.quote(token)


if __name__ == '__main__':
    try:
        webbrowser.open(office_url())
    except (ValueError, OSError, KeyError):
        print('Office could not open. Check the local installation and private token configuration.', file=sys.stderr)
        raise SystemExit(1)
