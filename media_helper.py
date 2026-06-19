import ctypes
import http.server
import socketserver
import json
import urllib.request
import urllib.error

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
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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

    def do_POST(self):
        if self.path == '/spotify-proxy':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                req_data = json.loads(post_data.decode('utf-8'))
                target_url = req_data.get('url')
                target_method = req_data.get('method', 'GET').upper()
                target_headers = req_data.get('headers', {})
                target_body = req_data.get('body', None)
                
                # Setup request
                req = urllib.request.Request(
                    url=target_url,
                    method=target_method
                )
                
                # Copy headers
                for k, v in target_headers.items():
                    req.add_header(k, v)
                
                # Make sure we encode body bytes correctly
                data_bytes = None
                if target_body is not None:
                    if isinstance(target_body, str):
                        data_bytes = target_body.encode('utf-8')
                    else:
                        data_bytes = json.dumps(target_body).encode('utf-8')
                
                # Send request
                try:
                    with urllib.request.urlopen(req, data=data_bytes, timeout=10) as resp:
                        resp_data = resp.read()
                        resp_status = resp.status
                        resp_headers = dict(resp.getheaders())
                except urllib.error.HTTPError as e:
                    resp_data = e.read()
                    resp_status = e.code
                    resp_headers = dict(e.headers)
                except urllib.error.URLError as e:
                    self.send_response(500)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e.reason)}).encode('utf-8'))
                    return
                
                # Return response
                self.send_response(resp_status)
                self.send_header('Access-Control-Allow-Origin', '*')
                
                # Forward Content-Type from Spotify if available
                content_type = resp_headers.get('Content-Type') or resp_headers.get('content-type') or 'application/json'
                self.send_header('Content-Type', content_type)
                self.end_headers()
                self.wfile.write(resp_data)
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Not Found"}).encode('utf-8'))


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
