import ctypes
import http.server
import socketserver
import json

PORT = 18888

# Windows Virtual Key Codes for Media Controls
VK_MEDIA_NEXT_TRACK = 0xB0
VK_MEDIA_PREV_TRACK = 0xB1
VK_MEDIA_PLAY_PAUSE = 0xB3

def send_media_key(code):
    # Press key
    ctypes.windll.user32.keybd_event(code, 0, 0, 0)
    # Release key
    ctypes.windll.user32.keybd_event(code, 0, 2, 0)

class MediaKeyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress logging to keep console clean
        return

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-type', 'application/json')
        self.end_headers()

        path = self.path
        response = {"status": "success"}

        if path == '/playpause':
            send_media_key(VK_MEDIA_PLAY_PAUSE)
            response["action"] = "playpause"
        elif path == '/next':
            send_media_key(VK_MEDIA_NEXT_TRACK)
            response["action"] = "next"
        elif path == '/prev':
            send_media_key(VK_MEDIA_PREV_TRACK)
            response["action"] = "prev"
        else:
            response["status"] = "error"
            response["message"] = "Invalid endpoint"

        self.wfile.write(json.dumps(response).encode('utf-8'))

if __name__ == "__main__":
    # Allow address reuse to avoid port busy errors on restart
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("127.0.0.1", PORT), MediaKeyHandler) as httpd:
            print(f"Media key server running on port {PORT}...")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping media key server.")
    except Exception as e:
        print(f"Error: {e}")
