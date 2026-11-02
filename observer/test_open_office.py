import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('open_office', Path(__file__).with_name('open-office.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class OpenOfficeTest(unittest.TestCase):
    def test_configured_token_path_and_private_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory) / 'Friend Home'
            config = home / '.config/pixel-agents-codex/config.json'
            config.parent.mkdir(parents=True)
            token = home / 'alternate-token'
            token.write_text('test-token-for-office-1234')
            token.chmod(0o600)
            config.write_text(json.dumps({'token_file': str(token)}))
            self.assertTrue(module.office_url(home).endswith('test-token-for-office-1234'))
            token.chmod(0o644)
            with self.assertRaises(ValueError): module.office_url(home)

if __name__ == '__main__': unittest.main()
