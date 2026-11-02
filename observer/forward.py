#!/usr/bin/env python3
"""Forward scoped Codex lifecycle metadata; never forward prompt/tool contents."""
import json
import pathlib
import time
import urllib.request
import uuid

CONFIG = pathlib.Path.home() / '.config/pixel-agents-codex/config.json'
EVENTS = {'SessionStart','SubagentStart','PreToolUse','PostToolUse','PermissionRequest','UserPromptSubmit','SubagentStop','Stop','Interrupt','SessionEnd'}
FIELDS = {'hook_event_name','session_id','turn_id','tool_name','tool_use_id','agent_id','agent_type'}

def metadata(raw, scopes):
    if not isinstance(raw, dict) or raw.get('hook_event_name') not in EVENTS:
        return None
    source_cwd = raw.get('cwd')
    if not isinstance(source_cwd, str) or not source_cwd or not pathlib.Path(source_cwd).is_absolute():
        return None
    cwd = pathlib.Path(source_cwd).resolve(strict=True)
    if not any(cwd == root or root in cwd.parents for root in map(lambda p: pathlib.Path(p).resolve(strict=True), scopes)):
        return None
    event = {}
    for field in FIELDS:
        value = raw.get(field)
        if value is not None:
            if not isinstance(value, str) or not value or len(value) > 4096 or any(ord(c) < 32 for c in value):
                return None
            event[field] = value
    if not event.get('session_id'):
        return None
    event.update(cwd=str(cwd), event_id=str(uuid.uuid4()), timestamp=time.time_ns() // 1_000_000)
    return event

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def forward(raw, config):
    event = metadata(raw, config['scopes'])
    if event is None:
        return
    token = pathlib.Path(config['token_file']).read_text().strip()
    request = urllib.request.Request('http://127.0.0.1:4312/api/hooks/codex', data=json.dumps(event).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, method='POST')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=0.8) as response:
        response.read(1024)

def main():
    import sys
    try:
        content = sys.stdin.buffer.read(1_048_577)
        if len(content) <= 1_048_576:
            forward(json.loads(content), json.loads(CONFIG.read_text()))
    except Exception:
        pass  # Optional observer must never stop Codex or leak source metadata.
    print('{}')

if __name__ == '__main__':
    main()
