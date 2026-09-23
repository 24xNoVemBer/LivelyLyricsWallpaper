import os
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
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

    def test_local_lyrics_import_lookup_delete_and_origin_guard(self):
        original_lyrics_dir = media_helper.LYRICS_DIR
        with tempfile.TemporaryDirectory() as directory:
            media_helper.LYRICS_DIR = os.path.join(directory, "lyrics")
            server = media_helper.ThreadingHttpServer(("127.0.0.1", 0), media_helper.MediaKeyHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_port}"

            def post(path, payload, origin="http://127.0.0.1:18888"):
                request = urllib.request.Request(
                    base + path,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json", "Origin": origin},
                    method="POST",
                )
                return urllib.request.urlopen(request, timeout=3)

            try:
                with urllib.request.urlopen(base + "/lyrics-import", timeout=3) as response:
                    self.assertIn(b"track-title", response.read())
                    self.assertIn("text/html", response.headers["Content-Type"])
                with urllib.request.urlopen(base + "/lyrics-import.js", timeout=3) as response:
                    self.assertIn(b"/lyrics-import", response.read())
                    self.assertIn("javascript", response.headers["Content-Type"])
                lyrics = "[00:01.00]Local line"
                with post("/lyrics-import", {"title": "Đô Trưởng", "artist": "Đạt G", "lyrics": lyrics}) as response:
                    self.assertEqual(response.status, 200)
                query = urllib.parse.urlencode({"title": "Do Truong", "artist": "Dat G"})
                request = urllib.request.Request(base + "/lyrics?" + query, headers={
                    "Origin": "http://9627f64684ccaa6f.localhost",
                })
                with urllib.request.urlopen(request, timeout=3) as response:
                    self.assertEqual(json.load(response)["lyrics"], lyrics)
                blocked_read = urllib.request.Request(base + "/lyrics?" + query, headers={"Origin": "null"})
                with self.assertRaises(urllib.error.HTTPError) as blocked:
                    urllib.request.urlopen(blocked_read, timeout=3)
                self.assertEqual(blocked.exception.code, 403)
                with urllib.request.urlopen(base + "/lyrics-list", timeout=3) as response:
                    self.assertEqual(len(json.load(response)["items"]), 1)
                with self.assertRaises(urllib.error.HTTPError) as blocked:
                    post("/lyrics-delete", {"title": "Đô Trưởng", "artist": "Đạt G"}, origin="null")
                self.assertEqual(blocked.exception.code, 403)
                with post("/lyrics-delete", {"title": "Đô Trưởng", "artist": "Đạt G"}) as response:
                    self.assertTrue(json.load(response)["deleted"])
                self.assertIsNone(media_helper.load_local_lyrics("Đô Trưởng", "Đạt G"))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)
                media_helper.LYRICS_DIR = original_lyrics_dir

if __name__ == "__main__":
    unittest.main()
