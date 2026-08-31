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
print("     VERIFYING ANSWERED COUNTER & ANALYTICS USER COUNT PARENTHESIS     ", flush=True)
print("=======================================================================\n", flush=True)

# -----------------------------------------------------------------------
# Test 1: Participant View Answered Counter from Q1 through Q60 to Final
# -----------------------------------------------------------------------
def test_participant_counter(s):
    print("--- [TEST 1: Participant View Navbar Answered Counter Progression] ---", flush=True)
    for _ in range(25):
        if eval_js(s, "Boolean(window.app && window.app.humanResolver)"):
            break
        time.sleep(0.3)

    # Initial state on intake screen
    nav_text = eval_js(s, "document.getElementById('nav-questions-counter').textContent.trim()")
    print("  -> Counter on intake screen:", nav_text, flush=True)
    assert nav_text == "0 / 60"

    # Fill and submit intake
    eval_js(s, """
    (() => {
        document.getElementById('intake-age').value = '22';
        document.getElementById('intake-gender').selectedIndex = 1;
        document.getElementById('intake-academic-standing').selectedIndex = 2;
        document.getElementById('intake-coding-exp').selectedIndex = 2;
        document.getElementById('intake-db-exp').selectedIndex = 2;
        document.getElementById('intake-query-exp').selectedIndex = 1;
        document.getElementById('btn-start-experiment').click();
    })()
    """)
    time.sleep(1.5)

    # Counter on Question 1 before answering
    nav_text = eval_js(s, "document.getElementById('nav-questions-counter').textContent.trim()")
    print("  -> Counter on Q1 before answering:", nav_text, flush=True)
    assert nav_text == "0 / 60"

    # Answer Q1
    eval_js(s, "window.app.humanResolver.selectOption(0)")
    nav_text = eval_js(s, "document.getElementById('nav-questions-counter').textContent.trim()")
    print("  -> Counter on Q1 immediately after answering:", nav_text, flush=True)
    assert nav_text == "1 / 60"

    # Advance to Q2
    eval_js(s, "window.app.humanResolver.nextQuestion()")
    time.sleep(1.0)
    nav_text = eval_js(s, "document.getElementById('nav-questions-counter').textContent.trim()")
    print("  -> Counter on Q2 before answering:", nav_text, flush=True)
    assert nav_text == "1 / 60"

    # Answer Q2
    eval_js(s, "window.app.humanResolver.selectOption(1)")
    nav_text = eval_js(s, "document.getElementById('nav-questions-counter').textContent.trim()")
    print("  -> Counter on Q2 immediately after answering:", nav_text, flush=True)
    assert nav_text == "2 / 60"

    # Simulate answering all 60 questions (questions 3 to 60)
    print("  -> Simulating answering questions 3 to 60...", flush=True)
    eval_js(s, """
    (async () => {
        const pid = window.app.analytics.participantId;
        for (let qNum = 3; qNum <= 60; qNum++) {
            window.app.analytics.logResponse({
                questionNumber: qNum,
                questionCategory: 'Filter & Projection Transformation',
                activeDialect: 'ansi',
                activeDialectName: 'ANSI SQL',
                rawQuery: 'SELECT 1;',
                selectedKey: 1,
                selectedOptionText: 'Option A (1 rows)',
                correctOptionText: 'Option A (1 rows)',
                isCorrect: true,
                responseTimeMs: 1200,
                seed: 42
            });
        }
        await window.app.loadIncrementalQuestion('final_thoughts');
    })()
    """, await_promise=True)
    time.sleep(1.5)

    # Counter on Final Thoughts screen
    nav_text = eval_js(s, "document.getElementById('nav-questions-counter').textContent.trim()")
    print("  -> Counter on Final Thoughts screen (Experiment Completed):", nav_text, flush=True)
    assert nav_text == "60 / 60", f"Expected '60 / 60' on Final Thoughts screen, got '{nav_text}'"
    print("[PASS] Test 1 Succeeded: Participant Answered counter correctly shows 60 / 60!\n", flush=True)

run_browser_session(
    'http://localhost:8000/participant.html',
    9241,
    r'C:\Users\fragm\.gemini\antigravity-ide\scratch\edge_profile_counter_test',
    test_participant_counter
)

# -----------------------------------------------------------------------
# Test 2: Admin Dashboard Tab Parenthesis Badge (Unique User IDs Count)
# -----------------------------------------------------------------------
def test_admin_badge(s):
    print("--- [TEST 2: Admin Analytics Tab Parenthesis Badge (Unique User IDs)] ---", flush=True)
    for _ in range(25):
        if eval_js(s, "Boolean(window.adminAuth && window.app)"):
            break
        time.sleep(0.3)

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

    # Check tab badge text
    badge_val = eval_js(s, "document.getElementById('resp-count-badge').textContent.trim()")
    unique_users = eval_js(s, "window.app.analytics.getAnalyticsSummary().uniqueParticipants")
    total_answers = eval_js(s, "window.app.analytics.getAnalyticsSummary().totalResponses")

    print(f"  -> Total answers logged: {total_answers}", flush=True)
    print(f"  -> Unique user IDs logged: {unique_users}", flush=True)
    print(f"  -> Tab parenthesis badge display: ({badge_val})", flush=True)

    assert int(badge_val) == unique_users, f"Expected tab badge to show unique users ({unique_users}), got ({badge_val})"
    print("[PASS] Test 2 Succeeded: Tab parenthesis badge shows number of unique User IDs saved!\n", flush=True)

run_browser_session(
    'http://localhost:8000/index.html',
    9242,
    r'C:\Users\fragm\.gemini\antigravity-ide\scratch\edge_profile_badge_test',
    test_admin_badge
)

print("=======================================================================", flush=True)
print("  ALL VERIFICATION TESTS COMPLETED AND VALIDATED WITH 100% SUCCESS!    ", flush=True)
print("=======================================================================", flush=True)
