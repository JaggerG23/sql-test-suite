import http.server
import socketserver
import json
import os
import sys
import csv
import secrets
import urllib.parse
import threading
from http.cookies import SimpleCookie

PORT = 8000
DB_FILE = "participant_responses_db.json"
CSV_FILE = "participant_responses_export.csv"

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "StefiksLabRootPassword")
ACTIVE_ADMIN_SESSIONS = set()

# Global lock to ensure thread safety for concurrent file I/O
db_lock = threading.Lock()

CSV_HEADERS = [
    'Response ID',
    'Participant ID',
    'Session ID',
    'Timestamp (ISO)',
    'Question Number',
    'Question Category',
    'Syntax Dialect ID',
    'Syntax Dialect Name',
    'Selected Key (1-4)',
    'Selected Option',
    'Correct Option',
    'Is Correct',
    'Response Time (ms)',
    'Random Seed',
    'Tab Focus Lost',
    'Tab Switch Count',
    'Focus Lost Duration (ms)',
    'Age',
    'Gender',
    'Academic Standing',
    'Coding Experience',
    'Database Experience',
    'Query Writing Experience',
    'Final Thoughts',
    'Raw SQL Query',
    'Dialect SQL Query',
    'JS Code Snippet'
]

def parse_cookies(cookie_header):
    if not cookie_header:
        return {}
    cookie = SimpleCookie()
    try:
        cookie.load(cookie_header)
        return {k: v.value for k, v in cookie.items()}
    except Exception:
        return {}

def load_db_data():
    """Loads database data. Assumes caller holds db_lock if necessary."""
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading DB: {e}")
    return {"responses": [], "demographics": {}, "finalThoughts": {}}

def save_db_data(db_data):
    """Saves database data to JSON and exports CSV. Assumes caller holds db_lock."""
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(db_data, f, indent=2)
    export_csv(db_data)

def export_csv(db_data):
    """Exports DB data to CSV. Assumes caller holds db_lock."""
    responses = db_data.get('responses', [])
    demographics = db_data.get('demographics', {})
    final_thoughts = db_data.get('finalThoughts', {})

    if not responses:
        if os.path.exists(CSV_FILE):
            try:
                os.remove(CSV_FILE)
            except Exception:
                pass
        return

    with open(CSV_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADERS)
        for r in responses:
            pid = r.get('participantId', '')
            demo = demographics.get(pid, {})
            thought_obj = final_thoughts.get(pid, {})
            writer.writerow([
                r.get('id', ''),
                pid,
                r.get('sessionId', ''),
                r.get('timestamp', ''),
                r.get('questionNumber', ''),
                r.get('questionCategory', ''),
                r.get('activeDialect', ''),
                r.get('activeDialectName', ''),
                r.get('selectedKey', ''),
                r.get('selectedOptionText', ''),
                r.get('correctOptionText', ''),
                'TRUE' if r.get('isCorrect') else 'FALSE',
                r.get('responseTimeMs', 0),
                r.get('seed', ''),
                'TRUE' if r.get('tabFocusLost') else 'FALSE',
                r.get('tabSwitchCount', 0),
                r.get('focusLostDurationMs', 0),
                demo.get('age', ''),
                demo.get('gender', ''),
                demo.get('academicStanding', ''),
                demo.get('codingExp', ''),
                demo.get('dbExp', ''),
                demo.get('queryExp', ''),
                thought_obj.get('thoughts', ''),
                r.get('rawQuery', ''),
                r.get('dialectSql', r.get('rawQuery', '')),
                r.get('jsCode', r.get('incompleteQuery', ''))
            ])

class TelemetryHandler(http.server.SimpleHTTPRequestHandler):
    def is_admin_authenticated(self):
        cookies = parse_cookies(self.headers.get('Cookie', ''))
        token = cookies.get('admin_session')
        if token and token in ACTIVE_ADMIN_SESSIONS:
            return True
        header_token = self.headers.get('X-Admin-Token')
        if header_token and header_token in ACTIVE_ADMIN_SESSIONS:
            return True
        return False

    def send_json(self, status_code, data, extra_headers=None):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token, Authorization, Cookie')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token, Authorization, Cookie')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path).path

        if parsed_path in ('', '/'):
            self.send_response(302)
            self.send_header('Location', '/participant.html')
            self.end_headers()
            return

        if parsed_path == '/api/admin/check-auth':
            is_auth = self.is_admin_authenticated()
            self.send_json(200, {"authenticated": is_auth})
            return

        if parsed_path == '/api/load-telemetry':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized: Admin access required"})
                return

            with db_lock:
                data = load_db_data()

            self.send_json(200, data)
            return

        return super().do_GET()

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path).path
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'

        if parsed_path == '/api/admin/login':
            try:
                payload = json.loads(body.decode('utf-8'))
                password = payload.get('password', '')
                if password == ADMIN_PASSWORD:
                    token = secrets.token_hex(16)
                    ACTIVE_ADMIN_SESSIONS.add(token)
                    self.send_json(200, {"status": "success", "token": token}, {
                        'Set-Cookie': f'admin_session={token}; Path=/; HttpOnly; SameSite=Lax'
                    })
                else:
                    self.send_json(401, {"status": "error", "message": "Invalid admin password"})
            except Exception as e:
                self.send_json(400, {"status": "error", "message": str(e)})
            return

        elif parsed_path == '/api/admin/logout':
            cookies = parse_cookies(self.headers.get('Cookie', ''))
            token = cookies.get('admin_session')
            if token and token in ACTIVE_ADMIN_SESSIONS:
                ACTIVE_ADMIN_SESSIONS.remove(token)
            header_token = self.headers.get('X-Admin-Token')
            if header_token and header_token in ACTIVE_ADMIN_SESSIONS:
                ACTIVE_ADMIN_SESSIONS.remove(header_token)

            self.send_json(200, {"status": "success"}, {
                'Set-Cookie': 'admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
            })
            return

        elif parsed_path == '/api/save-telemetry':
            try:
                payload = json.loads(body.decode('utf-8'))
                
                with db_lock:
                    db_data = load_db_data()

                    # Merge responses deduplicated by unique ID
                    existing_map = {r.get('id'): r for r in db_data.get('responses', []) if r.get('id')}
                    for r in payload.get('responses', []):
                        if r.get('id'):
                            existing_map[r['id']] = r
                    if payload.get('newResponse') and payload['newResponse'].get('id'):
                        existing_map[payload['newResponse']['id']] = payload['newResponse']

                    db_data['responses'] = list(existing_map.values())

                    # Merge demographics
                    if payload.get('demographics'):
                        db_data['demographics'].update(payload['demographics'])
                    if payload.get('newDemographic') and payload['newDemographic'].get('participantId'):
                        db_data['demographics'][payload['newDemographic']['participantId']] = payload['newDemographic']

                    # Merge final thoughts
                    if payload.get('finalThoughts'):
                        db_data['finalThoughts'].update(payload['finalThoughts'])
                    if payload.get('newFinalThought') and payload['newFinalThought'].get('participantId'):
                        db_data['finalThoughts'][payload['newFinalThought']['participantId']] = payload['newFinalThought']

                    # Write to DB file and Export CSV
                    save_db_data(db_data)

                self.send_json(200, {"status": "success", "count": len(db_data['responses'])})
            except Exception as e:
                print("Error saving telemetry:", e)
                self.send_json(400, {"status": "error", "message": str(e)})
            return

        elif parsed_path == '/api/delete-user-telemetry':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized: Admin access required"})
                return

            try:
                payload = json.loads(body.decode('utf-8'))
                pid = payload.get('participantId')
                if not pid:
                    self.send_json(400, {"status": "error", "message": "Missing participantId"})
                    return

                with db_lock:
                    db_data = load_db_data()

                    db_data['responses'] = [r for r in db_data.get('responses', []) if r.get('participantId') != pid]
                    if pid in db_data.get('demographics', {}):
                        del db_data['demographics'][pid]
                    if pid in db_data.get('finalThoughts', {}):
                        del db_data['finalThoughts'][pid]

                    save_db_data(db_data)

                self.send_json(200, {"status": "success", "deletedParticipantId": pid})
            except Exception as e:
                self.send_json(400, {"status": "error", "message": str(e)})
            return

        elif parsed_path == '/api/clear-telemetry':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized: Admin access required"})
                return

            try:
                with db_lock:
                    if os.path.exists(DB_FILE):
                        os.remove(DB_FILE)
                    if os.path.exists(CSV_FILE):
                        os.remove(CSV_FILE)
                print("All telemetry data wiped successfully.")
                self.send_json(200, {"status": "success"})
            except Exception as e:
                self.send_json(500, {"status": "error", "message": str(e)})
            return

        return super().do_POST()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server_address = ('', port)
    
    # Use ThreadingHTTPServer for concurrent requests support
    if hasattr(http.server, 'ThreadingHTTPServer'):
        ServerClass = http.server.ThreadingHTTPServer
    else:
        class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
            pass
        ServerClass = ThreadingHTTPServer

    httpd = ServerClass(server_address, TelemetryHandler)
    print(f"=========================================================")
    print(f"   SQL Test Suite Telemetry Server Started at:")
    print(f"   http://localhost:{port} (Threaded)")
    print(f"   All logs will be saved to disk at:")
    print(f"   - {os.path.abspath(DB_FILE)}")
    print(f"   - {os.path.abspath(CSV_FILE)}")
    print(f"=========================================================", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Server stopped.")

