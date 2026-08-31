import subprocess
import json
import time
import urllib.request
import urllib.parse
import os
import socket
import struct
import base64
import csv
import sys

PORT = 8000
DB_FILE = "participant_responses_db.json"
CSV_FILE = "participant_responses_export.csv"

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
        f'--remote-debugging-port={cdp_port}',
        f'--user-data-dir={user_dir}',
        url
    ]
    proc = subprocess.Popen(cmd)
    s = None
    try:
        ws_url = None
        for _ in range(20):
            try:
                resp = urllib.request.urlopen(f"http://127.0.0.1:{cdp_port}/json", timeout=2)
                pages = json.loads(resp.read().decode('utf-8'))
                if pages:
                    matched = [p for p in pages if p.get('type') == 'page' and ('localhost' in p.get('url', '') or '127.0.0.1' in p.get('url', ''))]
                    if matched:
                        ws_url = matched[0]['webSocketDebuggerUrl']
                        break
                    elif pages[0].get('webSocketDebuggerUrl'):
                        ws_url = pages[0]['webSocketDebuggerUrl']
            except Exception:
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
print("              STARTING FULL SUITE VERIFICATION                         ", flush=True)
print("=======================================================================\n", flush=True)

# ---------------------------------------------------------
# Test Part 1: Admin Login Modal Dismissal in Edge Browser
# ---------------------------------------------------------
def test_admin_unlock(s):
    print("--- [TEST 1: Admin Dashboard Lock & Overlay Dismissal] ---", flush=True)
    # Wait for page scripts
    for _ in range(25):
        if eval_js(s, "Boolean(window.adminAuth)"):
            break
        time.sleep(0.5)

    # Ensure locked state
    eval_js(s, """
    (async () => {
        await window.adminAuth.handleLogout();
    })()
    """, await_promise=True)
    time.sleep(0.5)

    is_locked = eval_js(s, "Boolean(document.getElementById('admin-login-overlay')) && document.body.classList.contains('admin-locked')")
    print("  -> Admin lock overlay is active before login:", is_locked, flush=True)
    assert is_locked is True

    # Unlock with password
    print("  -> Submitting password 'StefiksLabRootPassword'...", flush=True)
    eval_js(s, """
    (async () => {
        const passInput = document.getElementById('admin-pass-input');
        passInput.value = 'StefiksLabRootPassword';
        await window.adminAuth.handleLogin();
    })()
    """, await_promise=True)
    time.sleep(1.0)

    has_overlay = eval_js(s, "Boolean(document.getElementById('admin-login-overlay'))")
    print("  -> Has admin login overlay after login (should be False):", has_overlay, flush=True)
    assert has_overlay is False

    is_body_locked = eval_js(s, "document.body.classList.contains('admin-locked')")
    print("  -> Is body locked after login (should be False):", is_body_locked, flush=True)
    assert is_body_locked is False

    display_val = eval_js(s, "window.getComputedStyle(document.querySelector('.app-container')).display")
    print("  -> .app-container display style:", display_val, flush=True)
    assert display_val == 'flex'
    print("[PASS] Test 1 Succeeded: Admin modal cleanly disappears and Dashboard is interactive!\n", flush=True)

run_browser_session(
    'http://localhost:8000/index.html',
    9231,
    r'C:\Users\fragm\.gemini\antigravity-ide\scratch\edge_profile_admin_test',
    test_admin_unlock
)

# ---------------------------------------------------------
# Test Part 2: Participant Intake & Question Telemetry Flow
# ---------------------------------------------------------
def test_participant_flow(s):
    print("--- [TEST 2: Participant Question Answering & Telemetry Logging] ---", flush=True)
    for _ in range(20):
        if eval_js(s, "Boolean(window.app && window.app.humanResolver)"):
            break
        time.sleep(0.3)

    has_intake = eval_js(s, "Boolean(document.getElementById('intake-form'))")
    print("  -> Intake questionnaire rendered on participant.html:", has_intake, flush=True)
    assert has_intake is True

    # Fill out intake questionnaire
    print("  -> Filling and submitting intake form...", flush=True)
    eval_js(s, """
    (() => {
        document.getElementById('intake-age').value = '24';
        document.getElementById('intake-gender').selectedIndex = 1;
        document.getElementById('intake-academic-standing').selectedIndex = 3;
        document.getElementById('intake-coding-exp').selectedIndex = 2;
        document.getElementById('intake-db-exp').selectedIndex = 2;
        document.getElementById('intake-query-exp').selectedIndex = 1;
        document.getElementById('btn-start-experiment').click();
    })()
    """)
    time.sleep(1.5)

    has_q1 = eval_js(s, "Boolean(document.getElementById('opt-btn-0'))")
    print("  -> Question 1 rendered:", has_q1, flush=True)
    assert has_q1 is True

    # Answer Q1
    print("  -> Answering Question 1 (Option 1)...", flush=True)
    eval_js(s, "window.app.humanResolver.selectOption(0)")
    time.sleep(0.5)

    # Next Q2
    print("  -> Advancing to Question 2...", flush=True)
    eval_js(s, "window.app.humanResolver.nextQuestion()")
    time.sleep(1.5)

    # Answer Q2
    print("  -> Answering Question 2 (Option 2)...", flush=True)
    eval_js(s, "window.app.humanResolver.selectOption(1)")
    time.sleep(0.5)

    # Verify telemetry in participant session
    resp_count = eval_js(s, "window.app.analytics.getAllResponses().length")
    print("  -> Participant response count logged locally:", resp_count, flush=True)
    assert resp_count == 2

    # Check demographic record in analytics
    demo_data = eval_js(s, "window.app.analytics.getDemographics()")
    print("  -> Logged demographics for participant:", demo_data, flush=True)
    assert demo_data['age'] == '24'
    assert demo_data['academicStanding'] == "Master's Student"

    # Check first response object structure
    first_resp = eval_js(s, "window.app.analytics.getAllResponses()[0]")
    print("  -> Sample logged response object keys:", list(first_resp.keys()), flush=True)
    assert 'questionNumber' in first_resp
    assert 'responseTimeMs' in first_resp
    assert 'dialectSql' in first_resp
    assert 'jsCode' in first_resp
    assert 'tabFocusLost' in first_resp

    print("[PASS] Test 2 Succeeded: Participant telemetry & timing logged with rich attributes!\n", flush=True)

run_browser_session(
    'http://localhost:8000/participant.html',
    9232,
    r'C:\Users\fragm\.gemini\antigravity-ide\scratch\edge_profile_part_test',
    test_participant_flow
)

# ---------------------------------------------------------
# Test Part 3: Verify Server DB and CSV 27 Columns
# ---------------------------------------------------------
print("--- [TEST 3: Disk Telemetry & CSV 27-Column Parity Check] ---", flush=True)
assert os.path.exists(DB_FILE), "DB file must exist"
assert os.path.exists(CSV_FILE), "CSV file must exist"

with open(DB_FILE, 'r', encoding='utf-8') as f:
    db = json.load(f)
    print(f"  -> Total responses in server DB: {len(db['responses'])}", flush=True)
    print(f"  -> Total participants with demographics: {len(db['demographics'])}", flush=True)
    assert len(db['responses']) >= 2

with open(CSV_FILE, 'r', encoding='utf-8') as f:
    rows = list(csv.reader(f))
    headers = rows[0]
    print(f"  -> Total columns in CSV file: {len(headers)}", flush=True)
    assert len(headers) == 27
    assert headers[0] == 'Response ID'
    assert headers[4] == 'Question Number'
    assert headers[17] == 'Age'
    assert headers[24] == 'Raw SQL Query'
    assert headers[25] == 'Dialect SQL Query'
    assert headers[26] == 'JS Code Snippet'
    print(f"  -> Sample CSV Row 1: {rows[1][:8]}...", flush=True)

print("[PASS] Test 3 Succeeded: Database persistence and 27-column CSV parity verified!\n", flush=True)

print("=======================================================================", flush=True)
print("  ALL 3 VERIFICATION STAGES PASSED COMPLETELY WITH ZERO ERRORS!        ", flush=True)
print("=======================================================================", flush=True)
