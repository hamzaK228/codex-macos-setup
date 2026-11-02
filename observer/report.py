#!/usr/bin/env python3
"""Publish an explicit, short agent-authored work report to the local observer."""
import json
import os
import pathlib
import sys
import time
import urllib.request
import uuid

CONFIG = pathlib.Path.home() / '.config/pixel-agents-codex/config.json'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def envelope(raw, thread_id, cwd):
    if not isinstance(raw, dict) or set(raw) != {'done', 'current', 'next'}:
        raise ValueError('Expected done/current/next')
    for value in raw.values():
        if not isinstance(value, str) or len(value.encode('utf-16-le')) // 2 > 280 or any(ord(c) < 32 or ord(c) == 127 or c in "\u2028\u2029" for c in value):
            raise ValueError('Report fields must be single-line strings up to 280 characters')
    if not isinstance(thread_id, str) or not thread_id or len(thread_id) > 4096 or any(ord(c) < 32 or ord(c) == 127 for c in thread_id):
        raise ValueError('CODEX_THREAD_ID is required')
    if not pathlib.Path(cwd).is_absolute():
        raise ValueError('Absolute working directory required')
    return {**raw, 'thread_id': thread_id, 'cwd': str(pathlib.Path(cwd).resolve(strict=True)),
            'event_id': str(uuid.uuid4()), 'timestamp': time.time_ns() // 1_000_000}

def deliver(packet, config):
    cwd = pathlib.Path(packet['cwd'])
    if not any(cwd == root or root in cwd.parents for root in (pathlib.Path(p).resolve(strict=True) for p in config['scopes'])):
        raise ValueError('Working directory outside approved observer scope')
    token = pathlib.Path(config['token_file']).read_text().strip()
    req = urllib.request.Request('http://127.0.0.1:4312/api/observer/report', data=json.dumps(packet).encode(),
        headers={'Authorization': 'Bearer '+token, 'Content-Type':'application/json'}, method='POST')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(req, timeout=1) as response:
        result=json.loads(response.read(2048))
    if not result.get('accepted'):
        raise ValueError('Report not accepted')

def main():
    try:
        raw = sys.stdin.buffer.read(4097)
        if len(raw)>4096:
            raise ValueError('Report too large')
        packet=envelope(json.loads(raw),os.environ.get('CODEX_THREAD_ID'),os.getcwd())
        deliver(packet,json.loads(CONFIG.read_text()))
    except Exception:
        print('Office report not delivered; continue the task.',file=sys.stderr)
        return 1
    print('Office report updated.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
