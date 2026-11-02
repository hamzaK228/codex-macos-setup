import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('client', Path(__file__).parents[1] / 'scripts/client.py')
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


class Handler(BaseHTTPRequestHandler):
    calls = []
    mode = 'ok'

    def log_message(self, *args):
        pass

    def do_GET(self):
        self.respond()

    def do_POST(self):
        self.respond()

    def respond(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        self.calls.append((self.path, self.headers.get('Authorization'), body))
        if self.mode == 'redirect':
            self.send_response(302)
            self.send_header('Location', 'http://192.0.2.1/private')
            self.end_headers()
            return
        if self.mode == 'error':
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b'private-prompt bearer-secret')
            return
        self.send_response(200)
        self.end_headers()
        if self.path.startswith('/v1/models'):
            rows = [{'id': 'test', 'available': True, 'execution_status': 'ready', 'secret': 'hidden'},
                    {'id': 'auto', 'available': True}]
            if self.path == '/v1/models':
                rows.append({'id': 'no-key', 'available': False, 'unavailable_reason': 'no_keys'})
            value = {'data': rows}
        elif self.command == 'POST':
            value = {'model': 'test-returned', 'choices': [{'message': {'content': 'answer bearer-secret'}}]}
        else:
            value = {'status': 'ok', 'private': 'hidden'}
        self.wfile.write(json.dumps(value).encode())


class ClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = 'http://127.0.0.1:%s' % cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        Handler.calls = []
        Handler.mode = 'ok'

    def run_cli(self, *args, stdin='private-prompt'):
        out, err = io.StringIO(), io.StringIO()
        with patch.dict(os.environ, {'FREELLMAPI_API_KEY': 'bearer-secret'}), \
                patch('sys.stdin', io.StringIO(stdin)), \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = client.main(['--url', self.origin, *args])
        return code, out.getvalue(), err.getvalue()

    def test_health_never_sends_auth_or_inference(self):
        code, out, err = self.run_cli('health')
        self.assertEqual(code, 0)
        self.assertEqual([r[0] for r in Handler.calls], ['/livez', '/readyz'])
        self.assertTrue(all(auth is None and not body for _, auth, body in Handler.calls))
        self.assertNotIn('hidden', out)

    def test_models_auth_and_filter(self):
        code, out, _ = self.run_cli('models')
        self.assertEqual(code, 0)
        self.assertEqual(Handler.calls[0][:2], ('/v1/models?available=true', 'Bearer bearer-secret'))
        self.assertNotIn('hidden', out)
        self.assertEqual(json.loads(out)['data'][1], {'id': 'auto', 'available': True})

    def test_all_models_preserves_unavailable_metadata(self):
        code, out, _ = self.run_cli('models', '--all')
        self.assertEqual(code, 0)
        self.assertEqual(Handler.calls[0][0], '/v1/models')
        rows = json.loads(out)['data']
        self.assertEqual(rows[-1], {'id': 'no-key', 'available': False, 'unavailable_reason': 'no_keys'})
        self.assertEqual(rows[1], {'id': 'auto', 'available': True})

    def test_unauthorized_ask_makes_no_request(self):
        code, _, err = self.run_cli('ask', '--model', 'test')
        self.assertEqual(code, 1)
        self.assertEqual(Handler.calls, [])
        self.assertIn('--allow-external', err)

    def test_authorized_ask_sends_only_stdin_and_redacts_key(self):
        code, out, err = self.run_cli('ask', '--model', 'test', '--allow-external')
        self.assertEqual(code, 0)
        self.assertEqual(len(Handler.calls), 1)
        payload = json.loads(Handler.calls[0][2])
        self.assertEqual(payload['messages'], [{'role': 'user', 'content': 'private-prompt'}])
        self.assertEqual(payload['max_tokens'], 1024)
        self.assertFalse(payload['stream'])
        self.assertNotIn('bearer-secret', out + err)
        self.assertIn('test-returned', out)

    def test_error_body_withheld_without_retry(self):
        Handler.mode = 'error'
        code, out, err = self.run_cli('ask', '--model', 'test', '--allow-external')
        self.assertEqual(code, 1)
        self.assertEqual(len(Handler.calls), 1)
        self.assertIn('503', err)
        self.assertNotIn('private-prompt', out + err)
        self.assertNotIn('bearer-secret', out + err)

    def test_redirect_rejected(self):
        Handler.mode = 'redirect'
        code, _, err = self.run_cli('models')
        self.assertEqual(code, 1)
        self.assertIn('302', err)
        self.assertEqual(len(Handler.calls), 1)

    def test_url_boundary(self):
        for origin in ('http://example.com', 'http://localhost:3001', 'http://127.0.0.1@192.0.2.1',
                       'http://127.0.0.1/path', 'https://127.0.0.1', 'http://127.0.0.1?x=1'):
            with self.subTest(origin=origin), self.assertRaises(client.ClientError):
                client.base_url(origin)
        self.assertEqual(client.base_url('http://[::1]:3001/'), 'http://[::1]:3001')

    def test_proxy_environment_ignored(self):
        with patch.dict(os.environ, {'http_proxy': 'http://192.0.2.1:1', 'no_proxy': ''}):
            self.assertEqual(client.request(self.origin, '/livez')['status'], 'ok')

    def test_protected_config_and_environment_precedence(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {}, clear=True):
            config = Path(folder) / 'client.env'
            config.write_text("FREELLMAPI_API_KEY='test-only'\n")
            config.chmod(0o600)
            self.assertEqual(client.load_key(config), 'test-only')
            config.chmod(0o644)
            with self.assertRaises(client.ClientError):
                client.load_key(config)
            link = Path(folder) / 'link'
            link.symlink_to(config)
            with self.assertRaises(client.ClientError):
                client.load_key(link)
            with patch.dict(os.environ, {'FREELLMAPI_API_KEY': 'env-wins'}):
                self.assertEqual(client.load_key(config), 'env-wins')

    def test_bad_config_does_not_execute_shell(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {}, clear=True):
            config = Path(folder) / 'client.env'
            config.write_text('export FREELLMAPI_API_KEY=$(false)\n')
            config.chmod(0o600)
            with self.assertRaises(client.ClientError):
                client.load_key(config)

    def test_config_url_is_loopback_and_used_for_models(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {}, clear=True):
            config = Path(folder) / 'client.env'
            config.write_text('FREELLMAPI_API_KEY=test-only\nFREELLMAPI_URL=' + self.origin + '\n')
            config.chmod(0o600)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(client.main(['--config', str(config), 'models']), 0)
            self.assertEqual(Handler.calls[0][1], 'Bearer test-only')
            config.write_text('FREELLMAPI_API_KEY=test-only\nFREELLMAPI_URL=http://192.0.2.1\n')
            with self.assertRaises(client.ClientError):
                client.load_key(config)


if __name__ == '__main__':
    unittest.main()
