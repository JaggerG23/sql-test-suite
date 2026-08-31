import subprocess
import json
import time
import urllib.request
import urllib.parse
import os
import socket
import struct
import base64

def create_ws_client(ws_url):
    parsed = urllib.parse.urlparse(ws_url)
    host = parsed.hostname
    port = parsed.port or 80
    path = parsed.path

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(10.0)
    s.connect((host, port))

    sec_key = base64.b64encode(os.urandom(16)).decode('utf-8')
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {sec_key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n\r\n"
    )
    s.sendall(req.encode('utf-8'))
    resp = s.recv(4096)
    assert b"101 " in resp
    return s

def ws_send(s, text):
    data = text.encode('utf-8')
    length = len(data)
    frame = bytearray([0x81])
    mask_key = os.urandom(4)
    if length <= 125:
        frame.append(0x80 | length)
    elif length <= 65535:
        frame.append(0x80 | 126)
        frame.extend(struct.pack("!H", length))
    else:
        frame.append(0x80 | 127)
        frame.extend(struct.pack("!Q", length))
    frame.extend(mask_key)
    masked_data = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(data))
    frame.extend(masked_data)
    s.sendall(frame)

def ws_recv(s):
    buf = bytearray()
    while True:
        chunk = s.recv(4096)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) < 2:
            continue
        first_byte = buf[0]
        second_byte = buf[1]
        masked = bool(second_byte & 0x80)
        payload_len = second_byte & 0x7F
        offset = 2
        if payload_len == 126:
            if len(buf) < 4: continue
            payload_len = struct.unpack("!H", buf[2:4])[0]
            offset = 4
        elif payload_len == 127:
            if len(buf) < 10: continue
            payload_len = struct.unpack("!Q", buf[2:10])[0]
            offset = 10
        if masked:
            mask = buf[offset:offset+4]
            offset += 4
        if len(buf) < offset + payload_len:
            continue
        payload = buf[offset:offset+payload_len]
        if masked:
            payload = bytearray(b ^ mask[i % 4] for i, b in enumerate(payload))
        return payload.decode('utf-8')

_msg_counter = 0
def eval_js(s, expr, await_promise=False):
    global _msg_counter
    _msg_counter += 1
    msg_id = _msg_counter
    params = {"expression": expr, "returnByValue": True}
    if await_promise:
        params["awaitPromise"] = True
    msg = json.dumps({"id": msg_id, "method": "Runtime.evaluate", "params": params})
    ws_send(s, msg)
    start_t = time.time()
    while time.time() - start_t < 10:
        raw = ws_recv(s)
        try:
            res = json.loads(raw)
            if res.get("id") == msg_id:
                if "exceptionDetails" in res.get("result", {}):
                    print("JS Exception:", res["result"]["exceptionDetails"])
                return res.get("result", {}).get("result", {}).get("value")
        except Exception:
            pass
    raise TimeoutError(f"eval_js timed out for: {expr[:50]}")

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge_path):
    edge_path = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'

def run_browser_session(url, cdp_port, user_dir, test_fn):
    cmd = [
        edge_path,
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        f'--remote-debugging-port={cdp_port}',
        f'--user-data-dir={user_dir}',
        url
    ]
    proc = subprocess.Popen(cmd)
    s = None
    try:
        ws_url = None
        for _ in range(25):
            try:
                resp = urllib.request.urlopen(f"http://127.0.0.1:{cdp_port}/json", timeout=2)
                pages = json.loads(resp.read().decode('utf-8'))
                if pages:
                    matched = [p for p in pages if p.get('type') == 'page' and ('localhost' in p.get('url', '') or '127.0.0.1' in p.get('url', '')) and not p.get('url', '').startswith('edge://')]
                    if matched:
                        ws_url = matched[0]['webSocketDebuggerUrl']
                        break
            except Exception:
                pass
            time.sleep(0.5)

        assert ws_url is not None, f"Failed to get WebSocket for port {cdp_port}"
        s = create_ws_client(ws_url)
        time.sleep(2.0)
        test_fn(s)
    finally:
        if s:
            try: s.close()
            except Exception: pass
        proc.terminate()
        proc.wait()

print("=======================================================================", flush=True)
print("     TESTING GITHUB PAGES & STATIC HOSTING TELEMETRY PIPELINE          ", flush=True)
print("=======================================================================\n", flush=True)

# -----------------------------------------------------------------------
# Test 1: Participant generates submission token and proof on static flow
# -----------------------------------------------------------------------
captured_token = None

def test_participant_token_export(s):
    global captured_token
    print("--- [TEST 1: Participant Submission Token Generation] ---", flush=True)
    for _ in range(30):
        val = eval_js(s, "Boolean(window.app && window.app.humanResolver)")
        if val is True:
            break
        time.sleep(0.5)

    time.sleep(1.0)
    # Fill and submit intake if present
    if eval_js(s, "Boolean(document.getElementById('intake-form'))"):
        eval_js(s, """
        (() => {
            document.getElementById('intake-age').value = '25';
            document.getElementById('intake-gender').selectedIndex = 1;
            document.getElementById('intake-academic-standing').selectedIndex = 3;
            document.getElementById('intake-coding-exp').selectedIndex = 2;
            document.getElementById('intake-db-exp').selectedIndex = 2;
            document.getElementById('intake-query-exp').selectedIndex = 1;
            document.getElementById('btn-start-experiment').click();
        })()
        """)
        time.sleep(1.5)

    # Answer Q1
    eval_js(s, "window.app.humanResolver.selectOption(0)")
    time.sleep(0.5)

    # Answer Q2
    eval_js(s, "window.app.humanResolver.nextQuestion()")
    time.sleep(1.0)
    eval_js(s, "window.app.humanResolver.selectOption(1)")
    time.sleep(0.5)

    # Advance to Final Thoughts
    eval_js(s, """
    (async () => {
        await window.app.loadIncrementalQuestion('final_thoughts');
    })()
    """, await_promise=True)
    time.sleep(1.5)

    # Save final thoughts if input is present
    eval_js(s, """
    (() => {
        const inp = document.getElementById('final-thoughts-input');
        if (inp) {
            inp.value = 'Great SQL experiment!';
            const btn = document.getElementById('btn-submit-final-thoughts');
            if (btn) btn.click();
        }
    })()
    """)
    time.sleep(0.5)

    # Generate token
    pid = eval_js(s, "window.app.analytics.participantId")
    captured_token = eval_js(s, f"window.app.analytics.getParticipantToken('{pid}')")
    print(f"  -> Generated Participant ID: {pid}", flush=True)
    print(f"  -> Generated Submission Token (Length: {len(captured_token)}): {captured_token[:40]}...", flush=True)
    assert captured_token is not None and len(captured_token) > 50
    print("[PASS] Test 1 Succeeded: Participant submission proof & token generated!\n", flush=True)

run_browser_session(
    'http://localhost:8000/participant.html',
    9251,
    r'C:\Users\fragm\.gemini\antigravity-ide\scratch\edge_profile_token_test',
    test_participant_token_export
)

# -----------------------------------------------------------------------
# Test 2: Admin Dashboard imports Token, JSON, and CSV data
# -----------------------------------------------------------------------
def test_admin_import_pipeline(s):
    global captured_token
    print("--- [TEST 2: Admin Dashboard Data Import Pipeline] ---", flush=True)
    for _ in range(30):
        val = eval_js(s, "Boolean(window.adminAuth && window.app)")
        if val is True:
            break
        time.sleep(0.5)

    time.sleep(1.0)
    # Unlock dashboard
    eval_js(s, """
    (async () => {
        if (document.getElementById('admin-pass-input')) {
            document.getElementById('admin-pass-input').value = 'StefiksLabRootPassword';
            await window.adminAuth.handleLogin();
        }
    })()
    """, await_promise=True)
    time.sleep(1.0)

    # Initial state
    init_users = eval_js(s, "window.app.analytics.getAnalyticsSummary().uniqueParticipants")
    print(f"  -> Initial unique users: {init_users}", flush=True)

    # 1. Test Token Import via UI
    print("  -> Testing Token Import in Admin UI...", flush=True)
    token_escaped = captured_token.replace('"', '\\"')
    eval_js(s, f"""
    (() => {{
        document.getElementById('import-token-input').value = '{token_escaped}';
        document.getElementById('btn-submit-token-import').click();
    }})()
    """)
    time.sleep(1.0)

    users_after_token = eval_js(s, "window.app.analytics.getAnalyticsSummary().uniqueParticipants")
    print(f"  -> Unique users after Token Import: {users_after_token}", flush=True)
    assert users_after_token >= 1

    # 2. Test JSON Object Import
    print("  -> Testing JSON Bulk Import...", flush=True)
    sample_json = json.dumps({
        "responses": [
            {
                "id": "resp_remote_001",
                "participantId": "user_remote_student_99",
                "sessionId": "sess_99",
                "timestamp": "2026-08-31T17:00:00.000Z",
                "questionNumber": 1,
                "questionCategory": "Join Query Transformation",
                "activeDialect": "ansi",
                "activeDialectName": "ANSI SQL",
                "rawQuery": "SELECT * FROM users;",
                "selectedKey": 1,
                "selectedOptionText": "Option A",
                "correctOptionText": "Option A",
                "isCorrect": True,
                "responseTimeMs": 3500,
                "seed": 999
            }
        ],
        "demographics": {
            "user_remote_student_99": {
                "participantId": "user_remote_student_99",
                "age": "21",
                "academicStanding": "Senior"
            }
        },
        "finalThoughts": {
            "user_remote_student_99": {
                "participantId": "user_remote_student_99",
                "thoughts": "Loved the query builder!"
            }
        }
    })

    escaped_json = json.dumps(sample_json)
    eval_js(s, f"window.app.analytics.importFromJSON({escaped_json})")
    eval_js(s, "window.app.renderAnalyticsDashboard()")

    summary = eval_js(s, "window.app.analytics.getAnalyticsSummary()")
    badge_val = eval_js(s, "document.getElementById('resp-count-badge').textContent.trim()")
    print(f"  -> Total responses after JSON import: {summary['totalResponses']}", flush=True)
    print(f"  -> Unique users after JSON import: {summary['uniqueParticipants']}", flush=True)
    print(f"  -> Tab parenthesis badge: ({badge_val})", flush=True)

    assert int(badge_val) == summary['uniqueParticipants']
    assert summary['uniqueParticipants'] >= 2

    # 3. Test CSV Import
    print("  -> Testing CSV Import...", flush=True)
    csv_sample = (
        '"Response ID","Participant ID","Session ID","Timestamp (ISO)","Question Number","Question Category","Syntax Dialect ID","Syntax Dialect Name","Selected Key (1-4)","Selected Option","Correct Option","Is Correct","Response Time (ms)","Random Seed","Tab Focus Lost","Tab Switch Count","Focus Lost Duration (ms)","Age","Gender","Academic Standing","Coding Experience","Database Experience","Query Writing Experience","Final Thoughts","Raw SQL Query","Dialect SQL Query","JS Code Snippet"\n'
        '"resp_csv_1","user_csv_student_88","sess_88","2026-08-31T17:10:00.000Z","1","Filter & Projection","pipe","Google SQL (Pipe Syntax)","2","Option B","Option B","TRUE","2400","100","FALSE","0","0","23","Female","Master\'s Student","2-5 years","Intermediate (1-3 years)","Yes - Occasionally","Interesting syntax","SELECT 1","|> SELECT 1","js"\n'
    )
    escaped_csv = json.dumps(csv_sample)
    eval_js(s, f"window.app.analytics.importFromCSV({escaped_csv})")
    eval_js(s, "window.app.renderAnalyticsDashboard()")

    summary_final = eval_js(s, "window.app.analytics.getAnalyticsSummary()")
    badge_final = eval_js(s, "document.getElementById('resp-count-badge').textContent.trim()")
    print(f"  -> Final total responses: {summary_final['totalResponses']}", flush=True)
    print(f"  -> Final unique users: {summary_final['uniqueParticipants']}", flush=True)
    print(f"  -> Tab parenthesis badge: ({badge_final})", flush=True)

    assert int(badge_final) == summary_final['uniqueParticipants']
    assert summary_final['uniqueParticipants'] >= 3

    print("[PASS] Test 2 Succeeded: Admin Dashboard seamlessly imports Tokens, JSON, and CSV files!\n", flush=True)

run_browser_session(
    'http://localhost:8000/index.html',
    9252,
    r'C:\Users\fragm\.gemini\antigravity-ide\scratch\edge_profile_admin_import_test',
    test_admin_import_pipeline
)

print("=======================================================================", flush=True)
print("  ALL STATIC & GITHUB PAGES PIPELINE TESTS PASSED WITH 100% SUCCESS!   ", flush=True)
print("=======================================================================", flush=True)
