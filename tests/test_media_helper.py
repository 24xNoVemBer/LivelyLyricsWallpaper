import os
import tempfile
import unittest
_TEST_RUNTIME = tempfile.TemporaryDirectory()
os.environ["LOCALAPPDATA"] = _TEST_RUNTIME.name


import media_helper


class MediaHelperTests(unittest.TestCase):
    def test_dpapi_round_trip(self):
        secret = "refresh-token-value"
        encrypted = media_helper.protect_secret(secret)
        self.assertTrue(encrypted.startswith("dpapi:"))
        self.assertNotIn(secret, encrypted)
        self.assertEqual(media_helper.unprotect_secret(encrypted), secret)

    def test_config_is_atomic_and_secrets_are_encrypted_at_rest(self):
        original_config_file = media_helper.CONFIG_FILE
        original_legacy_file = media_helper.LEGACY_CONFIG_FILE
        with tempfile.TemporaryDirectory() as directory:
            media_helper.CONFIG_FILE = os.path.join(directory, "spotify_config.json")
            media_helper.LEGACY_CONFIG_FILE = os.path.join(directory, "missing.json")
            try:
                media_helper.save_config({
                    "spotify_client_id": "client-id",
                    "spotify_refresh_token": "private-refresh-token",
                })
                with open(media_helper.CONFIG_FILE, "r", encoding="utf-8") as handle:
                    raw = handle.read()
                self.assertNotIn("private-refresh-token", raw)
                loaded = media_helper.load_config()
                self.assertEqual(loaded["spotify_refresh_token"], "private-refresh-token")
                self.assertEqual(loaded["spotify_client_id"], "client-id")
            finally:
                media_helper.CONFIG_FILE = original_config_file
                media_helper.LEGACY_CONFIG_FILE = original_legacy_file

    def test_only_allowlisted_commands_are_exposed(self):
        self.assertEqual(set(media_helper.MEDIA_KEYS), {"next", "prev", "playpause"})
        self.assertEqual(set(media_helper.SPOTIFY_COMMANDS), {"play", "pause", "next", "previous"})


    def test_lively_virtual_host_origin_is_allowed_safely(self):
        self.assertTrue(media_helper.is_allowed_origin("http://9627f64684ccaa6f.localhost"))
        self.assertTrue(media_helper.is_allowed_origin("https://preview.localhost:443"))
        self.assertTrue(media_helper.is_allowed_origin("http://127.0.0.1:18888"))
        self.assertTrue(media_helper.is_allowed_origin("null"))
        self.assertFalse(media_helper.is_allowed_origin("https://localhost.example.com"))
        self.assertFalse(media_helper.is_allowed_origin("http://127.0.0.1.evil.test"))
        self.assertFalse(media_helper.is_allowed_origin("https://example.com"))

if __name__ == "__main__":
    unittest.main()
