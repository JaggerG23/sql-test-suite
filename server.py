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
import re
import math
from http.cookies import SimpleCookie
from datetime import datetime
from zoneinfo import ZoneInfo

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, "telemetry_events.jsonl")
DB_FILE = os.path.join(BASE_DIR, "participant_responses_db.json")
CSV_FILE = os.path.join(BASE_DIR, "participant_responses_export.csv")
EXTRA_CREDIT_FILE = os.path.join(BASE_DIR, "extra_credit_emails.csv")

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "StefiksLabRootPassword")

def get_admin_token():
    return hashlib.sha256(ADMIN_PASSWORD.encode('utf-8')).hexdigest()

db_lock = threading.Lock()
email_lock = threading.Lock()

def append_extra_credit_email(email, course=""):
    """Appends an email and course identifier to a completely separate, isolated CSV file with zero linkage to telemetry."""
    clean_email = email.strip().lower()
    clean_course = (course or "").strip().upper()
    with email_lock:
        file_exists = os.path.exists(EXTRA_CREDIT_FILE) and os.path.getsize(EXTRA_CREDIT_FILE) > 0
        existing_entries = set()
        needs_upgrade = False
        existing_rows = []

        if file_exists:
            with open(EXTRA_CREDIT_FILE, 'r', encoding='utf-8') as f:
                reader = csv.reader(f)
                header = next(reader, None)
                if header and (len(header) < 2 or 'course' not in [h.lower() for h in header]):
                    needs_upgrade = True
                for row in reader:
                    if row and row[0].strip():
                        em = row[0].strip().lower()
                        cs = row[1].strip() if len(row) > 1 else ""
                        existing_entries.add((em, cs))
                        existing_rows.append([em, cs])

        if needs_upgrade:
            with open(EXTRA_CREDIT_FILE, 'w', encoding='utf-8', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['Email', 'Course'])
                for r in existing_rows:
                    writer.writerow(r)

        if (clean_email, clean_course) not in existing_entries:
            with open(EXTRA_CREDIT_FILE, 'a', encoding='utf-8', newline='') as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(['Email', 'Course'])
                writer.writerow([clean_email, clean_course])
        return True

def migrate_legacy_txt_emails():
    """Migrates any legacy extra_credit_emails.txt into extra_credit_emails.csv safely."""
    legacy_file = os.path.join(BASE_DIR, "extra_credit_emails.txt")
    if os.path.exists(legacy_file) and os.path.getsize(legacy_file) > 0:
        try:
            with open(legacy_file, 'r', encoding='utf-8') as f:
                for line in f:
                    candidate = line.strip()
                    if '@' in candidate and '.' in candidate:
                        parts = candidate.split(',', 1)
                        if len(parts) == 2:
                            append_extra_credit_email(parts[0].strip(), parts[1].strip())
                        else:
                            append_extra_credit_email(parts[0].strip(), "")
        except Exception as e:
            print(f"Notice: legacy email migration exception: {e}")

CSV_HEADERS = [
    'response_id', 'participant_id', 'session_id', 'timestamp_iso',
    'question_number', 'trial_block', 'question_category',
    'assigned_group', 'assigned_group_id', 'host_language',
    'syntax_dialect_id', 'syntax_dialect_name',
    'is_correct', 'response_time_ms', 'response_time_s', 'log_response_time',
    'tab_focus_lost', 'valid_trial', 'tab_switch_count', 'focus_lost_duration_ms',
    'answer_change_count',
    'selected_key', 'selected_option', 'correct_option',
    'age', 'gender', 'gender_label', 'gender_male', 'gender_female',
    'education', 'education_label', 'has_college_degree',
    'coding_exp_years', 'has_coding_exp',
    'db_exp_years', 'has_db_exp',
    'primary_language', 'is_english_primary',
    'country_of_origin', 'is_country_us',
    'disability_status', 'has_disability',
    'final_thoughts', 'raw_query', 'dialect_sql', 'code_snippet'
]

def parse_num(val, default=0.0):
    if val is None or val == '':
        return default
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().lower()
    if 'none' in s or s.startswith('no '):
        return 0.0
    if '< 1' in s or '<1' in s:
        return 0.5
    range_match = re.search(r'(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)', s)
    if range_match:
        return round((float(range_match.group(1)) + float(range_match.group(2))) / 2.0, 2)
    match = re.search(r'(\d+(?:\.\d+)?)', s)
    if match:
        return float(match.group(1))
    return default

def parse_age(val):
    if val is None or val == '':
        return ''
    match = re.search(r'\d+', str(val))
    return int(match.group(0)) if match else ''

GENDER_LABELS = {
    0: 'Male',
    1: 'Female',
    2: 'Non-binary',
    3: 'Other',
    4: 'Prefer not to say'
}

EDUCATION_LABELS = {
    0: 'High School / GED',
    1: 'Some college / university',
    2: 'Associate Degree',
    3: 'Bachelor Degree',
    4: 'Masters Degree',
    5: 'Ph. D.',
    6: 'Other'
}

def parse_education_info(val):
    if val is None or val == '':
        return {'code': '', 'label': '', 'has_degree': 0}
    s = str(val).strip().lower()
    if s.isdigit():
        code = int(s)
        label = EDUCATION_LABELS.get(code, 'Other')
        return {'code': code, 'label': label, 'has_degree': 1 if (3 <= code <= 5) else 0}
    if 'ph' in s or 'doctor' in s or 'postdoc' in s:
        code = 5
    elif 'master' in s or 'graduate' in s:
        code = 4
    elif 'bachelor' in s or 'junior' in s or 'senior' in s:
        code = 3
    elif 'associate' in s:
        code = 2
    elif 'some college' in s or 'freshman' in s or 'sophomore' in s or 'undergrad' in s:
        code = 1
    elif 'high school' in s or 'ged' in s or 'diploma' in s:
        code = 0
    else:
        code = 6
    return {'code': code, 'label': EDUCATION_LABELS.get(code, 'Other'), 'has_degree': 1 if (3 <= code <= 5) else 0}

def parse_gender_info(val):
    if val is None or val == '':
        return {'code': '', 'label': '', 'is_male': 0, 'is_female': 0}
    s = str(val).strip().lower()
    if s.isdigit():
        code = int(s)
        label = GENDER_LABELS.get(code, 'Other')
        return {'code': code, 'label': label, 'is_male': 1 if code == 0 else 0, 'is_female': 1 if code == 1 else 0}
    if s == 'male' or s == 'm':
        code = 0
    elif s == 'female' or s == 'f':
        code = 1
    elif 'non-binary' in s or 'nonbinary' in s or 'third' in s:
        code = 2
    elif 'prefer not' in s:
        code = 4
    else:
        code = 3
    return {'code': code, 'label': GENDER_LABELS.get(code, 'Other'), 'is_male': 1 if code == 0 else 0, 'is_female': 1 if code == 1 else 0}

def parse_language_info(val):
    s = str(val or '').strip().lower()
    is_eng = 1 if 'english' in s else 0
    return {'language': val or '', 'is_english': is_eng}

def parse_country_info(val):
    s = str(val or '').strip().lower()
    is_us = 1 if ('united states' in s or s == 'usa' or s == 'us' or 'u.s.' in s) else 0
    return {'country': val or '', 'is_us': is_us}

def parse_disability_info(val):
    s = str(val or '').strip().lower()
    has_dis = 1 if (s and 'none' not in s and s != 'no' and 'prefer not' not in s) else 0
    return {'disability': val or '', 'has_disability': has_dis}

def to_binary(val):
    if val is True or val == 1 or str(val).strip().upper() in ('TRUE', '1', 'T'):
        return 1
    return 0

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
    """Exports reconstructed state to CSV formatted for immediate ANOVA / statistical analysis."""
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

            # Response correctness & timing metrics (1s and 0s)
            is_correct_val = to_binary(r.get('isCorrect'))
            
            raw_rt_ms = r.get('responseTimeMs', 0)
            try:
                rt_ms = int(raw_rt_ms) if raw_rt_ms is not None else 0
            except:
                rt_ms = 0
            rt_s = round(rt_ms / 1000.0, 3)
            log_rt = round(math.log(max(rt_ms, 1)), 4)

            # Focus and trial validity (1s and 0s)
            tab_focus_lost_val = to_binary(r.get('tabFocusLost'))
            valid_trial_val = 1 if tab_focus_lost_val == 0 else 0

            # Answer change count
            try:
                ans_change_cnt = int(r.get('answerChangeCount', 0))
            except:
                ans_change_cnt = 0

            # Trial sequence & block (1 to 4)
            raw_q_num = r.get('questionNumber', 1)
            try:
                q_num = int(raw_q_num)
            except:
                q_num = 1
            if q_num <= 15: trial_block = 1
            elif q_num <= 30: trial_block = 2
            elif q_num <= 45: trial_block = 3
            else: trial_block = 4

            # Group and Dialect
            assigned_group = r.get('assignedGroupName', r.get('assignedGroup', demo.get('assignedGroupName', demo.get('assignedGroup', ''))))
            assigned_group_id = r.get('assignedGroupId', demo.get('assignedGroupId', ''))
            if not assigned_group_id and assigned_group:
                ag_lower = str(assigned_group).lower()
                if 'group a' in ag_lower: assigned_group_id = 'group_a'
                elif 'group b' in ag_lower: assigned_group_id = 'group_b'
                elif 'group c' in ag_lower: assigned_group_id = 'group_c'
                elif 'group d' in ag_lower: assigned_group_id = 'group_d'
                else: assigned_group_id = re.sub(r'[^a-z0-9]+', '_', ag_lower).strip('_')

            # Demographics parsing (numeric, ordinal & 1s/0s)
            raw_age = demo.get('age', '')
            age_val = parse_age(raw_age)

            gender_info = parse_gender_info(demo.get('gender', ''))
            edu_info = parse_education_info(demo.get('education', demo.get('highestEducation', demo.get('academicStanding', ''))))
            coding_years = parse_num(demo.get('codingExp', ''))
            db_years = parse_num(demo.get('dbExp', ''))
            lang_info = parse_language_info(demo.get('primaryLanguage', ''))
            country_info = parse_country_info(demo.get('countryOfOrigin', ''))
            dis_info = parse_disability_info(demo.get('disability', ''))

            writer.writerow([
                r.get('id', ''),
                pid,
                r.get('sessionId', ''),
                r.get('timestamp', ''),
                q_num,
                trial_block,
                r.get('questionCategory', ''),
                assigned_group,
                assigned_group_id,
                r.get('hostLanguage', demo.get('hostLanguage', '')),
                r.get('activeDialect', ''),
                r.get('activeDialectName', ''),
                is_correct_val,
                rt_ms,
                rt_s,
                log_rt,
                tab_focus_lost_val,
                valid_trial_val,
                r.get('tabSwitchCount', 0),
                r.get('focusLostDurationMs', 0),
                ans_change_cnt,
                r.get('selectedKey', ''),
                r.get('selectedOptionText', ''),
                r.get('correctOptionText', ''),
                age_val,
                gender_info['code'],
                gender_info['label'],
                gender_info['is_male'],
                gender_info['is_female'],
                edu_info['code'],
                edu_info['label'],
                edu_info['has_degree'],
                coding_years,
                1 if coding_years > 0 else 0,
                db_years,
                1 if db_years > 0 else 0,
                lang_info['language'],
                lang_info['is_english'],
                country_info['country'],
                country_info['is_us'],
                dis_info['disability'],
                dis_info['has_disability'],
                thought_obj.get('thoughts', ''),
                r.get('rawQuery', ''),
                r.get('dialectSql', r.get('rawQuery', '')),
                r.get('codeSnippet', r.get('jsCode', r.get('incompleteQuery', '')))
            ])
        temp_name = f.name
    os.replace(temp_name, CSV_FILE)

class TelemetryHandler(http.server.SimpleHTTPRequestHandler):
    directory = BASE_DIR

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

        if parsed_path in ('/extra_credit_emails.csv', '/extra_credit_emails.txt', '/telemetry_events.jsonl', '/participant_responses_db.json'):
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return

        if parsed_path == '/api/admin/extra-credit-emails':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            records = []
            emails = []
            with email_lock:
                if os.path.exists(EXTRA_CREDIT_FILE):
                    with open(EXTRA_CREDIT_FILE, 'r', encoding='utf-8') as f:
                        reader = csv.reader(f)
                        header = next(reader, None)
                        for row in reader:
                            if row and row[0].strip():
                                em = row[0].strip()
                                cs = row[1].strip() if len(row) > 1 else ""
                                emails.append(em)
                                records.append({"email": em, "course": cs})
            self.send_json(200, {"status": "success", "records": records, "emails": emails, "count": len(records)})
            return

        if parsed_path == '/api/admin/download-extra-credit-emails':
            if not self.is_admin_authenticated():
                self.send_json(401, {"status": "error", "message": "Unauthorized"})
                return
            content = b""
            with email_lock:
                if os.path.exists(EXTRA_CREDIT_FILE):
                    with open(EXTRA_CREDIT_FILE, 'rb') as f:
                        content = f.read()
                else:
                    content = b"Email,Course\r\n"
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv; charset=utf-8')
            self.send_header('Content-Disposition', 'attachment; filename="extra_credit_emails.csv"')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
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
                        r.pop('seed', None)
                        r.pop('random_seed', None)
                        print(f"[{pst_now}] Response logged: Participant={r.get('participantId')} Q={r.get('questionNumber')} Correct={r.get('isCorrect')}", flush=True)
                        append_event("RESPONSE", r)
                    if payload.get('newDemographic'):
                        d = payload['newDemographic']
                        g_info = parse_gender_info(d.get('gender'))
                        if g_info['code'] != '':
                            d['gender'] = g_info['code']
                            d['genderLabel'] = g_info['label']
                        e_info = parse_education_info(d.get('education') or d.get('highestEducation') or d.get('academicStanding'))
                        if e_info['code'] != '':
                            d['education'] = e_info['code']
                            d['educationLabel'] = e_info['label']
                        append_event("DEMOGRAPHICS", d)
                    if payload.get('newFinalThought'):
                        append_event("FINAL_THOUGHT", payload['newFinalThought'])

                    # Support legacy arrays if old clients connect
                    for r in payload.get('responses', []):
                        r.pop('seed', None)
                        r.pop('random_seed', None)
                        print(f"[{pst_now}] Response logged (batch): Participant={r.get('participantId')} Q={r.get('questionNumber')} Correct={r.get('isCorrect')}", flush=True)
                        append_event("RESPONSE", r)
                    if payload.get('demographics'):
                        for k, v in payload['demographics'].items():
                            g_info = parse_gender_info(v.get('gender'))
                            if g_info['code'] != '':
                                v['gender'] = g_info['code']
                                v['genderLabel'] = g_info['label']
                            e_info = parse_education_info(v.get('education') or v.get('highestEducation') or v.get('academicStanding'))
                            if e_info['code'] != '':
                                v['education'] = e_info['code']
                                v['educationLabel'] = e_info['label']
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

        elif parsed_path == '/api/save-extra-credit-email':
            try:
                payload = json.loads(body.decode('utf-8'))
                email = payload.get('email', '').strip()
                course = payload.get('course', '').strip()
                if not email or '@' not in email or '.' not in email:
                    self.send_json(400, {"status": "error", "message": "Please provide a valid email address."})
                    return
                append_extra_credit_email(email, course)
                self.send_json(200, {"status": "success", "message": "Email and course identifier saved for extra credit."})
            except Exception as e:
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

    migrate_legacy_txt_emails()
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
