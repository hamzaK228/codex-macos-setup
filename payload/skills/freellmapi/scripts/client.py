#!/usr/bin/env python3
"""Small loopback-only FreeLLMAPI client; no dependencies or implicit inference."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_CONFIG = Path.home() / '.config/freellmapi/client.env'
MAX_BYTES = 4 * 1024 * 1024


class ClientError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def base_url(value):
    try:
        parsed = urllib.parse.urlsplit(value)
        valid = (parsed.scheme == 'http' and parsed.hostname is not None
                 and ipaddress.ip_address(parsed.hostname).is_loopback
                 and parsed.username is None and parsed.password is None
                 and parsed.path in ('', '/') and not parsed.query
                 and not parsed.fragment)
        port = parsed.port
        if not valid or port == 0:
            raise ValueError()
    except ValueError:
        raise ClientError('Base URL must be an HTTP literal loopback origin.') from None
    return value.rstrip('/')


def load_key(config=DEFAULT_CONFIG, with_url=False):
    key = os.environ.get('FREELLMAPI_API_KEY')
    url = os.environ.get('FREELLMAPI_URL')
    if key is None:
        try:
            fd = os.open(config, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(fd, 'r', encoding='utf-8') as source:
                info = os.fstat(source.fileno())
                if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                        or stat.S_IMODE(info.st_mode) & 0o077):
                    raise ClientError('Credential file must be an owner-only regular file.')
                raw = source.read(16385)
            if len(raw) > 16384:
                raise ClientError('Credential file is too large.')
            values = {}
            for line in raw.splitlines():
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                name, separator, value = line.partition('=')
                if name not in ('FREELLMAPI_API_KEY', 'FREELLMAPI_URL') or not separator or name in values:
                    raise ClientError('Credential file accepts one API key and optional loopback URL.')
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                values[name] = value
            if 'FREELLMAPI_API_KEY' not in values:
                raise ClientError('Credential file must contain exactly one API key.')
            key = values['FREELLMAPI_API_KEY']
            url = url or values.get('FREELLMAPI_URL')
        except (OSError, UnicodeError):
            raise ClientError('Cannot read protected credentials; configure the environment or client.env.') from None
    if not key or len(key) > 4096 or any(ord(c) < 33 or ord(c) > 126 for c in key):
        raise ClientError('API key is missing or invalid.')
    url = base_url(url or 'http://127.0.0.1:3001')
    return (key, url) if with_url else key


def request(origin, path, key=None, payload=None, timeout=30):
    origin = base_url(origin)
    headers = {'Accept': 'application/json'}
    if key:
        headers['Authorization'] = 'Bearer ' + key
    data = None
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(origin + path, data=data, headers=headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(req, timeout=timeout) as response:
            raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ClientError('Response exceeded the size limit.')
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ClientError('Unexpected response shape.')
        return result
    except urllib.error.HTTPError as error:
        # Error bodies can contain prompts, provider keys or upstream traces.
        code = error.code
        error.close()
        raise ClientError('HTTP %s; response body withheld.' % code) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ClientError('Local service request failed or timed out.') from None
    except (ValueError, UnicodeError):
        raise ClientError('Local service returned invalid JSON.') from None


class Parser(argparse.ArgumentParser):
    def error(self, message):
        self.print_usage(sys.stderr)
        self.exit(2, 'Invalid arguments; use --help. Prompts belong on stdin or in a file.\n')


def main(argv=None):
    parser = Parser(description=__doc__)
    parser.add_argument('--url', help='Loopback origin; overrides environment/config')
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('health', help='Inspect local liveness and readiness without inference')
    models = commands.add_parser('models', help='List catalog entries marked available; not proof of inference readiness')
    models.add_argument('--all', action='store_true', help='Include unavailable catalog entries')
    ask = commands.add_parser('ask', help='Make one expressly authorized external model request')
    ask.add_argument('--model', required=True)
    ask.add_argument('--allow-external', action='store_true', help='Affirm authorization for this prompt and routing scope')
    ask.add_argument('--prompt-file', type=Path, help='Otherwise read the prompt from stdin')
    ask.add_argument('--max-tokens', type=int, default=1024)
    args = parser.parse_args(argv)
    try:
        origin = base_url(args.url or os.environ.get('FREELLMAPI_URL') or 'http://127.0.0.1:3001')
        key = None
        if args.command == 'health':
            result = {}
            failed = False
            for name, path in [('live', '/livez'), ('ready', '/readyz')]:
                try:
                    info = request(origin, path)
                    result[name] = {k: info[k] for k in ('status', 'ready_upstreams', 'stored_keys_decryptable') if k in info}
                except ClientError as error:
                    result[name] = {'error': str(error)}
                    failed = True
            print(json.dumps(result, ensure_ascii=False))
            return 1 if failed else 0
        if args.command == 'ask':
            if not args.allow_external:
                raise ClientError('Model calls require authorization and --allow-external.')
            if not 1 <= args.max_tokens <= 32768 or not args.model.strip() or len(args.model) > 256:
                raise ClientError('Invalid model or output token limit.')
        key, configured_url = load_key(args.config, with_url=True)
        origin = base_url(args.url or configured_url)
        if args.command == 'models':
            info = request(origin, '/v1/models' + ('' if args.all else '?available=true'), key)
            if not isinstance(info.get('data'), list):
                raise ClientError('Unexpected model list shape.')
            result = {'data': [{k: row[k] for k in ('id', 'owned_by', 'available', 'unavailable_reason', 'execution_status') if k in row}
                               for row in info['data'] if isinstance(row, dict)]}
        else:
            if args.prompt_file:
                with args.prompt_file.open(encoding='utf-8') as source:
                    prompt = source.read(MAX_BYTES + 1)
            else:
                if sys.stdin.isatty():
                    raise ClientError('Provide a prompt via stdin or --prompt-file.')
                prompt = sys.stdin.read(MAX_BYTES + 1)
            if not prompt.strip() or len(prompt.encode('utf-8')) > MAX_BYTES:
                raise ClientError('Prompt must be nonempty and at most 4 MiB.')
            info = request(origin, '/v1/chat/completions', key, {
                'model': args.model, 'messages': [{'role': 'user', 'content': prompt}],
                'stream': False, 'max_tokens': args.max_tokens}, timeout=120)
            try:
                result = {'model': info.get('model'), 'content': info['choices'][0]['message']['content']}
            except (KeyError, IndexError, TypeError):
                raise ClientError('Unexpected completion shape.') from None
        # Protect the connector credential even if a server echoes it in success output.
        print(json.dumps(result, ensure_ascii=False).replace(key, '[REDACTED]'))
        return 0
    except ClientError as error:
        print(str(error), file=sys.stderr)
        return 1
    except (OSError, UnicodeError):
        print('Cannot read prompt input.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
