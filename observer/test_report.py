import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('report',pathlib.Path(__file__).with_name('report.py'))
r=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

class ReportTests(unittest.TestCase):
    def test_explicit_text_only_with_native_identity(self):
        with tempfile.TemporaryDirectory() as d:
            raw={'done':'Проверил форму','current':'Исправляю ошибку','next':'Запущу проверку'}
            packet=r.envelope(raw,'native-thread',d)
            self.assertEqual(packet['thread_id'],'native-thread')
            self.assertEqual(set(packet),{'done','current','next','thread_id','cwd','event_id','timestamp'})
            self.assertEqual(packet['current'],raw['current'])
    def test_reject_missing_identity_text_controls_oversize_and_extra_fields(self):
        with tempfile.TemporaryDirectory() as d:
            valid={'done':'','current':'','next':''}
            for body,thread in [(valid,None),({**valid,'prompt':'private'},'id'),({**valid,'done':'x'*281},'id'),({**valid,'done':'a\nb'},'id'),({**valid,'next':[]},'id'),({**valid,'done':'😀'*141},'id'),({**valid,'next':'a\u2028b'},'id')]:
                with self.assertRaises(ValueError):r.envelope(body,thread,d)
    def test_fixed_local_destination_proxy_and_redirect_block(self):
        with tempfile.TemporaryDirectory() as d:
            token=pathlib.Path(d)/'token';token.write_text('test-only-token')
            packet=r.envelope({'done':'','current':'','next':''},'id',d)
            with patch.object(r.urllib.request,'build_opener') as build:
                build.return_value.open.return_value.__enter__.return_value.read.return_value=b'{"accepted":true}'
                r.deliver(packet,{'scopes':[d],'token_file':str(token)})
                call=build.return_value.open.call_args
                self.assertEqual(call.args[0].full_url,'http://127.0.0.1:4312/api/observer/report')
                self.assertEqual(call.kwargs['timeout'],1)
            self.assertIsNone(r.NoRedirect().redirect_request(None,None,302,'',{},'https://example.com'))

if __name__ == '__main__':unittest.main()
