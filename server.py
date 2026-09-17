import http.server
import socketserver
import json
import os
import sys
import csv
import hashlib
import tempfile
import threading
import urllib.parse
from http.cookies import SimpleCookie
from datetime import datetime
from zoneinfo import ZoneInfo

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, "telemetry_events.jsonl")
DB_FILE = os.path.join(BASE_DIR, "participant_responses_db.json")
CSV_FILE = os.path.join(BASE_DIR, "participant_responses_export.csv")

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "StefiksLabRootPassword")

def get_admin_token():
    return hashlib.sha256(ADMIN_PASSWORD.encode('utf-8')).hexdigest()

db_lock = threading.Lock()

CSV_HEADERS = [
    'Response ID', 'Participant ID', 'Session ID', 'Timestamp (ISO)',
    'Question Number', 'Question Category', 'Assigned Group', 'Host Language',
    'Syntax Dialect ID', 'Syntax Dialect Name', 'Selected Key (1-4)', 'Selected Option',
    'Correct Option', 'Is Correct', 'Response Time (ms)', 'Random Seed',
    'Tab Focus Lost', 'Tab Switch Count', 'Focus Lost Duration (ms)',
    'Age', 'Gender', 'Highest Level of Education', 'Programming Experience',
    'Database Experience', 'Primary Language', 'Country of Origin', 'Disability Status',
    'Final Thoughts', 'Raw SQL Query', 'Dialect SQL Query', 'Code Snippet'
]

def parse_cookies(cookie_header):
    if not cookie_header: return {}
    cookie = SimpleCookie()
    try:
        cookie.load(cookie_header)
        return {k: v.value for k, v in cookie.items()}
    except Exception: return {}

def append_event(event_type, data):
    """Appends an event to the append-only JSONL log file. Caller should hold db_lock."""
    event = {"type": event_type, "data": data}
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(json.dumps(event) + '\n')

def load_db_data():
    """Reconstructs state by chronologically replaying the append-only log."""
    db_data = {"responses": [], "demographics": {}, "finalThoughts": {}}
    if not os.path.exists(LOG_FILE):
        return db_data
        
    responses_map = {}
    
    try:
        with open(LOG_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line: continue
                try:
                    event = json.loads(line)
                    etype = event.get("type")
                    edata = event.get("data", {})
                    
                    if etype == "RESPONSE":
                        responses_map[edata.get('id')] = edata
                    elif etype == "DEMOGRAPHICS":
                        db_data['demographics'][edata.get('participantId')] = edata
                    elif etype == "FINAL_THOUGHT":
                        db_data['finalThoughts'][edata.get('participantId')] = edata
                    elif etype == "DELETE_USER":
                        pid = edata.get("participantId")
                        responses_map = {k: v for k, v in responses_map.items() if v.get('participantId') != pid}
                        if pid in db_data['demographics']: del db_data['demographics'][pid]
                        if pid in db_data['finalThoughts']: del db_data['finalThoughts'][pid]
                    elif etype == "CLEAR_ALL":
                        responses_map.clear()
                        db_data['demographics'].clear()
                        db_data['finalThoughts'].clear()
                except Exception:
                    continue
    except Exception as e:
        print(f"Error reading log: {e}")
        
    db_data['responses'] = list(responses_map.values())
    return db_data

def export_csv(db_data):
    """Exports reconstructed state to CSV for convenience."""
    responses = db_data.get('responses', [])
    demographics = db_data.get('demographics', {})
    final_thoughts = db_data.get('finalThoughts', {})

    if not responses:
        if os.path.exists(CSV_FILE):
            try: os.remove(CSV_FILE)
            except: pass
        return

    with tempfile.NamedTemporaryFile('w', dir=BASE_DIR, delete=False, newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADERS)
        for r in responses:
            pid = r.get('participantId', '')
            demo = demographics.get(pid, {})
            thought_obj = final_thoughts.get(pid, {})
            writer.writerow([
                r.get('id', ''), pid, r.get('sessionId', ''), r.get('timestamp', ''),
                r.get('questionNumber', ''), r.get('questionCategory', ''),
                r.get('assignedGroupName', r.get('assignedGroup', demo.get('assignedGroupName', demo.get('assignedGroup', '')))),
                r.get('hostLanguage', demo.get('hostLanguage', '')),
                r.get('activeDialect', ''), r.get('activeDialectName', ''),
                r.get('selectedKey', ''), r.get('selectedOptionText', ''),
                r.get('correctOptionText', ''), 'TRUE' if r.get('isCorrect') else 'FALSE',
                r.get('responseTimeMs', 0), r.get('seed', ''),
                'TRUE' if r.get('tabFocusLost') else 'FALSE', r.get('tabSwitchCount', 0),
                r.get('focusLostDurationMs', 0), demo.get('age', ''), demo.get('gender', ''),
                demo.get('education', demo.get('highestEducation', demo.get('academicStanding', ''))),
                demo.get('codingExp', ''), demo.get('dbExp', ''),
                demo.get('primaryLanguage', ''), demo.get('countryOfOrigin', ''), demo.get('disability', ''),
                thought_obj.get('thoughts', ''), r.get('rawQuery', ''),
                r.get('dialectSql', r.get('rawQuery', '')),
                r.get('codeSnippet', r.get('jsCode', r.get('incompleteQuery', '')))
            ])
        temp_name = f.name
    os.replace(temp_name, CSV_FILE)

class TelemetryHandler(http.server.SimpleHTTPRequestHandler):
    def is_admin_authenticated(self):
        cookies = parse_cookies(self.headers.get('Cookie', ''))
        token = cookies.get('admin_session')
        valid_token = get_admin_token()
        if token and token == valid_token: return True
        header_token = self.headers.get('X-Admin-Token')
        if header_token and header_token == valid_token: return True
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
            self.send_json(200, {"authenticated": self.is_admin_authenticated()})
            return

        if parsed_path == '/api/load-telemetry':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
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
                if payload.get('password', '') == ADMIN_PASSWORD:
                    token = get_admin_token()
                    self.send_json(200, {"status": "success", "token": token}, {
                        'Set-Cookie': f'admin_session={token}; Path=/; HttpOnly; SameSite=Lax'
                    })
                else:
                    self.send_json(401, {"status": "error", "message": "Invalid password"})
            except Exception as e:
                self.send_json(400, {"status": "error", "message": str(e)})
            return

        elif parsed_path == '/api/admin/logout':
            self.send_json(200, {"status": "success"}, {
                'Set-Cookie': 'admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
            })
            return

        elif parsed_path == '/api/save-telemetry':
            try:
                payload = json.loads(body.decode('utf-8'))
                
                with db_lock:
                    pst_now = datetime.now(ZoneInfo('America/Los_Angeles')).strftime('%Y-%m-%d %I:%M:%S %p PST')
                    # Handle new incremental payloads
                    if payload.get('newResponse'):
                        r = payload['newResponse']
                        print(f"[{pst_now}] Response logged: Participant={r.get('participantId')} Q={r.get('questionNumber')} Correct={r.get('isCorrect')}", flush=True)
                        append_event("RESPONSE", r)
                    if payload.get('newDemographic'):
                        append_event("DEMOGRAPHICS", payload['newDemographic'])
                    if payload.get('newFinalThought'):
                        append_event("FINAL_THOUGHT", payload['newFinalThought'])

                    # Support legacy arrays if old clients connect
                    for r in payload.get('responses', []):
                        print(f"[{pst_now}] Response logged (batch): Participant={r.get('participantId')} Q={r.get('questionNumber')} Correct={r.get('isCorrect')}", flush=True)
                        append_event("RESPONSE", r)
                    if payload.get('demographics'):
                        for k, v in payload['demographics'].items():
                            append_event("DEMOGRAPHICS", v)
                    if payload.get('finalThoughts'):
                        for k, v in payload['finalThoughts'].items():
                            append_event("FINAL_THOUGHT", v)

                    # Export CSV
                    db_data = load_db_data()
                    export_csv(db_data)

                self.send_json(200, {"status": "success", "count": len(db_data['responses'])})
            except Exception as e:
                print("Error saving telemetry:", e)
                self.send_json(400, {"status": "error", "message": str(e)})
            return

        elif parsed_path == '/api/delete-user-telemetry':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            try:
                payload = json.loads(body.decode('utf-8'))
                pid = payload.get('participantId')
                if not pid:
                    self.send_json(400, {"status": "error", "message": "Missing participantId"})
                    return

                with db_lock:
                    append_event("DELETE_USER", {"participantId": pid})
                    db_data = load_db_data()
                    export_csv(db_data)
                self.send_json(200, {"status": "success", "deletedParticipantId": pid})
            except Exception as e:
                self.send_json(400, {"status": "error", "message": str(e)})
            return

        elif parsed_path == '/api/clear-telemetry':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            try:
                with db_lock:
                    append_event("CLEAR_ALL", {})
                    if os.path.exists(CSV_FILE):
                        os.remove(CSV_FILE)
                self.send_json(200, {"status": "success"})
            except Exception as e:
                self.send_json(500, {"status": "error", "message": str(e)})
            return

        return super().do_POST()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server_address = ('', port)
    
    if hasattr(http.server, 'ThreadingHTTPServer'):
        ServerClass = http.server.ThreadingHTTPServer
    else:
        class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer): pass
        ServerClass = ThreadingHTTPServer

    httpd = ServerClass(server_address, TelemetryHandler)
    print(f"=========================================================")
    print(f"   SQL Test Suite Telemetry Server Started at:")
    print(f"   http://localhost:{port} (Threaded)")
    print(f"   APPEND-ONLY LOG: {os.path.abspath(LOG_FILE)}")
    print(f"=========================================================", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Server stopped.")
