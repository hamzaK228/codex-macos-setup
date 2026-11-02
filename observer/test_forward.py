import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('forward', pathlib.Path(__file__).with_name('forward.py'))
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)

class ForwardTests(unittest.TestCase):
    def test_metadata_drops_all_contents(self):
        with tempfile.TemporaryDirectory() as scope:
            raw = dict(hook_event_name='PreToolUse', session_id='s', cwd=scope, tool_use_id='t', tool_name='exec_command', tool_input={'cmd':'SECRET'}, tool_output='SECRET', transcript_path='/private', prompt='SECRET')
            event = f.metadata(raw, [scope])
            self.assertNotIn('SECRET', str(event))
            self.assertEqual(event['tool_use_id'], 't')
            self.assertNotIn('agent_id', event)
    def test_reject_outside_scope_and_controls(self):
        with tempfile.TemporaryDirectory() as scope:
            self.assertIsNone(f.metadata(dict(hook_event_name='Stop', session_id='s', cwd='/tmp'), [scope]))
            self.assertIsNone(f.metadata(dict(hook_event_name='Stop', session_id='s\n', cwd=scope), [scope]))
    def test_requires_source_absolute_cwd(self):
        with tempfile.TemporaryDirectory() as scope:
            for cwd in ['', '.', None]:
                self.assertIsNone(f.metadata(dict(hook_event_name='Stop', session_id='s', cwd=cwd), [scope]))

    def test_global_scope_includes_future_project(self):
        with tempfile.TemporaryDirectory() as root:
            future = pathlib.Path(root)/'new-project'
            future.mkdir()
            event=f.metadata(dict(hook_event_name='Stop',session_id='new',cwd=str(future),prompt='SECRET'), ['/'])
            self.assertEqual(event['cwd'],str(future))
            self.assertNotIn('SECRET',str(event))

    def test_no_proxy_redirect_or_custom_remote(self):
        with tempfile.TemporaryDirectory() as scope:
            token = pathlib.Path(scope)/'token'
            token.write_text('test-token')
            with patch.object(f.urllib.request, 'build_opener') as build:
                f.forward(dict(hook_event_name='Stop',session_id='s',cwd=scope), dict(scopes=[scope],token_file=str(token)))
                req = build.return_value.open.call_args.args[0]
                self.assertEqual(req.full_url,'http://127.0.0.1:4312/api/hooks/codex')
                self.assertEqual(build.return_value.open.call_args.kwargs['timeout'],0.8)
            self.assertIsNone(f.NoRedirect().redirect_request(None,None,302,'',{},'https://example.com'))

if __name__ == '__main__': unittest.main()
