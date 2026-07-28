import base64
import ctypes
from ctypes import wintypes
import http.server
import json
import logging
from logging.handlers import RotatingFileHandler
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

PORT = 18888
APP_NAME = "LivelyLyricsWallpaper"
DATA_DIR = os.path.join(os.environ.get("LOCALAPPDATA", os.path.dirname(os.path.abspath(__file__))), APP_NAME)
CONFIG_FILE = os.path.join(DATA_DIR, "spotify_config.json")
LOG_FILE = os.path.join(DATA_DIR, "helper.log")
LEGACY_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "spotify_config.json")
MAX_BODY_BYTES = 64 * 1024
SECRET_FIELDS = {"spotify_token", "spotify_refresh_token", "spotify_code_verifier"}

VK_MEDIA_NEXT_TRACK = 0xB0
VK_MEDIA_PREV_TRACK = 0xB1
VK_MEDIA_PLAY_PAUSE = 0xB3
MEDIA_KEYS = {
    "next": VK_MEDIA_NEXT_TRACK,
    "prev": VK_MEDIA_PREV_TRACK,
    "playpause": VK_MEDIA_PLAY_PAUSE,
}
SPOTIFY_COMMANDS = {
    "play": ("play", "PUT"),
    "pause": ("pause", "PUT"),
    "next": ("next", "POST"),
    "previous": ("previous", "POST"),
}

def is_allowed_origin(origin):
    if not origin or origin == "null":
        return True
    if origin.startswith("file://"):
        return True
    try:
        parsed = urllib.parse.urlsplit(origin)
    except ValueError:
        return False
    hostname = (parsed.hostname or "").lower().rstrip(".")
    return (
        parsed.scheme in {"http", "https"}
        and (hostname in {"localhost", "127.0.0.1", "::1"} or hostname.endswith(".localhost"))
    )


os.makedirs(DATA_DIR, exist_ok=True)
logger = logging.getLogger(APP_NAME)
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)


class DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def _to_blob(data):
    buffer = ctypes.create_string_buffer(data)
    blob = DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    return blob, buffer


def protect_secret(value):
    if not value or str(value).startswith("dpapi:"):
        return value
    raw = str(value).encode("utf-8")
    input_blob, input_buffer = _to_blob(raw)
    output_blob = DataBlob()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    if not crypt32.CryptProtectData(
        ctypes.byref(input_blob), APP_NAME, None, None, None, 0, ctypes.byref(output_blob)
    ):
        raise ctypes.WinError()
    try:
        encrypted = ctypes.string_at(output_blob.pbData, output_blob.cbData)
        return "dpapi:" + base64.b64encode(encrypted).decode("ascii")
    finally:
        kernel32.LocalFree(output_blob.pbData)
        del input_buffer


def unprotect_secret(value):
    if not value or not str(value).startswith("dpapi:"):
        return value
    encrypted = base64.b64decode(str(value)[6:])
    input_blob, input_buffer = _to_blob(encrypted)
    output_blob = DataBlob()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    if not crypt32.CryptUnprotectData(
        ctypes.byref(input_blob), None, None, None, None, 0, ctypes.byref(output_blob)
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData).decode("utf-8")
    finally:
        kernel32.LocalFree(output_blob.pbData)
        del input_buffer


def load_config():
    source = CONFIG_FILE
    if not os.path.exists(source) and os.path.exists(LEGACY_CONFIG_FILE):
        source = LEGACY_CONFIG_FILE
    if not os.path.exists(source):
        return {}
    try:
        with open(source, "r", encoding="utf-8") as handle:
            config = json.load(handle)
        needs_migration = source != CONFIG_FILE or any(config.get(key) and not str(config[key]).startswith("dpapi:") for key in SECRET_FIELDS)
        for key in SECRET_FIELDS:
            if key in config:
                config[key] = unprotect_secret(config[key])
        if needs_migration:
            save_config(config)
        return config
    except Exception as error:
        logger.error("config_load_failed type=%s", type(error).__name__)
        return {}


def save_config(config):
    stored = dict(config)
    for key in SECRET_FIELDS:
        if stored.get(key):
            stored[key] = protect_secret(stored[key])
    temporary = CONFIG_FILE + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(stored, handle, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, CONFIG_FILE)


def send_media_key(code):
    ctypes.windll.user32.keybd_event(code, 0, 0, 0)
    ctypes.windll.user32.keybd_event(code, 0, 2, 0)


def request_url(url, method="GET", headers=None, body=None, timeout=10):
    request = urllib.request.Request(url=url, method=method, headers=headers or {})
    data = body.encode("utf-8") if isinstance(body, str) else body
    try:
        with urllib.request.urlopen(request, data=data, timeout=timeout) as response:
            return response.status, response.read(), dict(response.getheaders())
    except urllib.error.HTTPError as error:
        return error.code, error.read(), dict(error.headers)


def refresh_access_token(config, force=False):
    token = config.get("spotify_token", "")
    expires_at = int(config.get("spotify_token_expires_at", 0) or 0)
    if token and not force and time.time() * 1000 < expires_at - 60_000:
        return token

    refresh_token = config.get("spotify_refresh_token", "")
    client_id = config.get("spotify_client_id", "")
    if not refresh_token or not client_id:
        return token

    payload = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
    })
    status, body, _ = request_url(
        "https://accounts.spotify.com/api/token",
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        body=payload,
    )
    if status != 200:
        logger.warning("spotify_refresh_failed status=%s", status)
        return token

    data = json.loads(body.decode("utf-8"))
    config.update({
        "spotify_token": data["access_token"],
        "spotify_refresh_token": data.get("refresh_token", refresh_token),
        "spotify_token_expires_at": int(time.time() * 1000) + int(data["expires_in"]) * 1000,
    })
    save_config(config)
    logger.info("spotify_refresh_ok")
    return config["spotify_token"]


def spotify_request(path, method="GET"):
    config = load_config()
    token = refresh_access_token(config)
    if not token:
        return 401, json.dumps({"error": "not_connected"}).encode("utf-8"), {}

    url = "https://api.spotify.com/v1/me/player" + path
    headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
    status, body, response_headers = request_url(url, method=method, headers=headers)
    if status == 401 and config.get("spotify_refresh_token"):
        token = refresh_access_token(config, force=True)
        headers["Authorization"] = "Bearer " + token
        status, body, response_headers = request_url(url, method=method, headers=headers)
    return status, body, response_headers


def exchange_spotify_code(code):
    config = load_config()
    client_id = config.get("spotify_client_id", "")
    verifier = config.get("spotify_code_verifier", "")
    if not client_id or not verifier:
        return 400, {"error": "missing_pkce_session"}

    payload = urllib.parse.urlencode({
        "client_id": client_id,
        "grant_type": "authorization_code",
        "code": urllib.parse.unquote(code),
        "redirect_uri": "http://127.0.0.1:8888/",
        "code_verifier": verifier,
    })
    status, body, _ = request_url(
        "https://accounts.spotify.com/api/token",
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        body=payload,
    )
    if status != 200:
        try:
            return status, json.loads(body.decode("utf-8"))
        except Exception:
            return status, {"error": "token_exchange_failed"}

    data = json.loads(body.decode("utf-8"))
    config.update({
        "spotify_token": data["access_token"],
        "spotify_refresh_token": data.get("refresh_token", ""),
        "spotify_token_expires_at": int(time.time() * 1000) + int(data["expires_in"]) * 1000,
    })
    config.pop("spotify_code_verifier", None)
    save_config(config)
    logger.info("spotify_exchange_ok")
    return 200, {"connected": True, "client_id": client_id}


class MediaKeyHandler(http.server.BaseHTTPRequestHandler):
    server_version = "LivelyLyricsHelper/1.2"

    def log_message(self, format_string, *args):
        return

    def _origin_allowed(self):
        return is_allowed_origin(self.headers.get("Origin"))

    def _cors_origin(self):
        origin = self.headers.get("Origin")
        return origin if origin and self._origin_allowed() else "null"

    def _send_headers(self, status, content_type="application/json", extra=None):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", self._cors_origin())
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", content_type)
        for key, value in (extra or {}).items():
            if value is not None:
                self.send_header(key, str(value))
        self.end_headers()

    def _send_json(self, status, payload, extra=None):
        self._send_headers(status, extra=extra)
        if self.command != "HEAD" and status != 204:
            self.wfile.write(json.dumps(payload).encode("utf-8"))

    def _send_upstream(self, status, body, headers):
        retry_after = headers.get("Retry-After") or headers.get("retry-after")
        content_type = headers.get("Content-Type") or headers.get("content-type") or "application/json"
        self._send_headers(status, content_type=content_type, extra={"Retry-After": retry_after})
        if status != 204:
            self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError("invalid_content_length")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_OPTIONS(self):
        if not self._origin_allowed():
            self._send_json(403, {"error": "origin_not_allowed"})
            return
        self._send_headers(204)

    def do_GET(self):
        if not self._origin_allowed():
            self._send_json(403, {"error": "origin_not_allowed"})
            return

        if self.path == "/health":
            self._send_json(200, {"status": "ok", "version": "1.2"})
            return

        if self.path == "/spotify-status":
            config = load_config()
            self._send_json(200, {
                "connected": bool(config.get("spotify_refresh_token") or config.get("spotify_token")),
                "client_id": config.get("spotify_client_id", ""),
            })
            return

        if self.path == "/spotify-player":
            started = time.monotonic()
            try:
                status, body, headers = spotify_request("")
                logger.info("spotify_player status=%s latency_ms=%d", status, (time.monotonic() - started) * 1000)
                self._send_upstream(status, body, headers)
            except urllib.error.URLError as error:
                logger.warning("spotify_player_network_error type=%s", type(error.reason).__name__)
                self._send_json(503, {"error": "spotify_unavailable"})
            return

        self._send_json(404, {"error": "not_found"})

    def do_POST(self):
        if not self._origin_allowed():
            self._send_json(403, {"error": "origin_not_allowed"})
            return

        try:
            payload = self._read_json()
        except (ValueError, json.JSONDecodeError):
            self._send_json(400, {"error": "invalid_json"})
            return

        if self.path == "/media-command":
            action = str(payload.get("action", ""))
            if action not in MEDIA_KEYS:
                self._send_json(400, {"error": "invalid_action"})
                return
            send_media_key(MEDIA_KEYS[action])
            self._send_json(200, {"status": "ok", "action": action})
            return

        if self.path == "/spotify-auth/pkce":
            client_id = str(payload.get("client_id", "")).strip()
            verifier = str(payload.get("code_verifier", "")).strip()
            if not re.fullmatch(r"[A-Za-z0-9]{16,64}", client_id) or not 43 <= len(verifier) <= 128:
                self._send_json(400, {"error": "invalid_pkce_payload"})
                return
            config = load_config()
            config.update({"spotify_client_id": client_id, "spotify_code_verifier": verifier})
            save_config(config)
            self._send_json(200, {"status": "ok", "client_id": client_id})
            return

        if self.path == "/spotify-auth/exchange":
            code = str(payload.get("code", "")).strip()
            if not code:
                self._send_json(400, {"error": "missing_code"})
                return
            try:
                status, result = exchange_spotify_code(code)
                self._send_json(status, result)
            except urllib.error.URLError:
                self._send_json(503, {"error": "spotify_unavailable"})
            return

        if self.path == "/spotify-disconnect":
            config = load_config()
            client_id = config.get("spotify_client_id", "")
            save_config({"spotify_client_id": client_id} if client_id else {})
            self._send_json(200, {"connected": False})
            return

        if self.path == "/spotify-command":
            action = str(payload.get("action", ""))
            if action == "seek":
                position_ms = max(0, min(int(payload.get("position_ms", 0)), 24 * 60 * 60 * 1000))
                path, method = "/seek?position_ms=" + str(position_ms), "PUT"
            elif action in SPOTIFY_COMMANDS:
                endpoint, method = SPOTIFY_COMMANDS[action]
                path = "/" + endpoint
            else:
                self._send_json(400, {"error": "invalid_action"})
                return

            started = time.monotonic()
            try:
                status, body, headers = spotify_request(path, method=method)
                logger.info("spotify_command action=%s status=%s latency_ms=%d", action, status, (time.monotonic() - started) * 1000)
                self._send_upstream(status, body, headers)
            except urllib.error.URLError:
                self._send_json(503, {"error": "spotify_unavailable"})
            return

        self._send_json(404, {"error": "not_found"})


class ThreadingHttpServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    try:
        with ThreadingHttpServer(("127.0.0.1", PORT), MediaKeyHandler) as server:
            logger.info("helper_started port=%s", PORT)
            print(f"Lively Lyrics helper running on http://127.0.0.1:{PORT}")
            server.serve_forever()
    except KeyboardInterrupt:
        logger.info("helper_stopped")
    except OSError as error:
        logger.error("helper_start_failed error=%s", error)
        print(f"Could not start helper on port {PORT}: {error}")
