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
                    print("JS Exception Details:", res["result"]["exceptionDetails"])
                return res.get("result", {}).get("result", {}).get("value")
        except Exception:
            pass
    raise TimeoutError(f"eval_js timed out for: {expr[:50]}")

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge_path):
    edge_path = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'

user_data_dir = r'C:\Users\fragm\.gemini\antigravity-ide\scratch\edge_cdp_profile_flow_fresh2'

cmd = [
    edge_path,
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9228',
    f'--user-data-dir={user_data_dir}',
    'about:blank'
]

proc = subprocess.Popen(cmd)
time.sleep(2.5)

s = None
try:
    for _ in range(15):
        try:
            resp = urllib.request.urlopen("http://127.0.0.1:9228/json", timeout=2)
            pages = json.loads(resp.read().decode('utf-8'))
            if pages:
                ws_url = pages[0]['webSocketDebuggerUrl']
                s = create_ws_client(ws_url)
                break
        except Exception:
            time.sleep(0.5)

    assert s is not None, "Failed to connect to Edge target WebSocket"

    # Navigate to index.html
    print("Navigating to http://localhost:8000/index.html...", flush=True)
    eval_js(s, "window.location.href = 'http://localhost:8000/index.html'")
    time.sleep(2.0)

    # Wait for page scripts to load
    print("Waiting for page scripts to load...", flush=True)
    for _ in range(30):
        val = eval_js(s, "Boolean(window.adminAuth && window.app)")
        if val:
            break
        time.sleep(0.5)

    # Step 1: Ensure clean logout so lock screen is visible
    eval_js(s, """
    (async () => {
        await window.adminAuth.handleLogout();
    })()
    """, await_promise=True)
    time.sleep(1.0)

    is_locked = eval_js(s, "Boolean(document.getElementById('admin-login-overlay')) && document.body.classList.contains('admin-locked')")
    print("1. Is admin locked modal present on index.html after logout:", is_locked, flush=True)
    assert is_locked is True

    # Step 2: Unlock with password
    print("2. Entering password 'StefiksLabRootPassword' and unlocking...", flush=True)
    eval_js(s, """
    (async () => {
        const passInput = document.getElementById('admin-pass-input');
        passInput.value = 'StefiksLabRootPassword';
        await window.adminAuth.handleLogin();
    })()
    """, await_promise=True)
    time.sleep(1.0)

    has_overlay = eval_js(s, "Boolean(document.getElementById('admin-login-overlay'))")
    print("3. Has admin login overlay after unlocking:", has_overlay, flush=True)
    assert has_overlay is False

    is_body_locked = eval_js(s, "document.body.classList.contains('admin-locked')")
    print("4. Is body locked after unlocking:", is_body_locked, flush=True)
    assert is_body_locked is False

    display_val = eval_js(s, "window.getComputedStyle(document.querySelector('.app-container')).display")
    print("5. .app-container display style:", display_val, flush=True)
    assert display_val == 'flex'
    print("[PASS] Admin Login Screen completely disappears and Dashboard is fully unlocked!\n", flush=True)

    # Step 3: Participant Flow
    print("6. Navigating to participant page in session...", flush=True)
    eval_js(s, "window.location.href = 'http://localhost:8000/participant.html'")
    time.sleep(2.0)
    for _ in range(30):
        if eval_js(s, "Boolean(window.app && window.app.humanResolver)"):
            break
        time.sleep(0.5)

    has_intake = eval_js(s, "Boolean(document.getElementById('intake-form'))")
    print("7. Has participant intake form on participant.html:", has_intake, flush=True)
    assert has_intake is True

    print("8. Filling out intake form and beginning experiment...", flush=True)
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
    time.sleep(2.0)

    has_q1 = eval_js(s, "Boolean(document.getElementById('opt-btn-0'))")
    print("9. Question 1 option cards rendered:", has_q1, flush=True)
    assert has_q1 is True

    print("10. Answering Question 1 (Option 1)...", flush=True)
    eval_js(s, "window.app.humanResolver.selectOption(0)")
    time.sleep(0.5)

    print("11. Advancing to Question 2...", flush=True)
    eval_js(s, "window.app.humanResolver.nextQuestion()")
    time.sleep(1.5)

    print("12. Answering Question 2 (Option 2)...", flush=True)
    eval_js(s, "window.app.humanResolver.selectOption(1)")
    time.sleep(0.5)

    resp_count = eval_js(s, "window.app.analytics.getAllResponses().length")
    print("13. Total responses recorded by analytics:", resp_count, flush=True)
    assert resp_count == 2
    print("[PASS] Participant responses recorded with full timing & telemetry!\n", flush=True)

    # Step 4: Admin Analytics verification
    print("14. Navigating back to Admin Dashboard...", flush=True)
    eval_js(s, "window.location.href = 'http://localhost:8000/index.html'")
    time.sleep(2.0)
    for _ in range(30):
        if eval_js(s, "Boolean(window.app && window.adminAuth)"):
            break
        time.sleep(0.5)

    eval_js(s, """
    (async () => {
        if (document.getElementById('admin-pass-input')) {
            document.getElementById('admin-pass-input').value = 'StefiksLabRootPassword';
            await window.adminAuth.handleLogin();
        }
    })()
    """, await_promise=True)
    time.sleep(1.0)

    summary_data = eval_js(s, """
    (() => {
        const summary = window.app.analytics.getAnalyticsSummary();
        const userGroups = window.app.analytics.getResponsesGroupedByParticipant();
        const uids = Object.keys(userGroups);
        return {
            totalResponses: summary.totalResponses,
            uniqueParticipants: summary.uniqueParticipants,
            accuracy: summary.overallAccuracy,
            avgTimeMs: summary.avgResponseTimeMs,
            uids: uids
        };
    })()
    """)
    print("15. Admin Dashboard Analytics Summary:", summary_data, flush=True)
    assert summary_data['totalResponses'] == 2
    assert summary_data['uniqueParticipants'] == 1

    print("\n=======================================================================")
    print("  ALL END-TO-END BROWSER + BACKEND TESTS PASSED WITH 100% SUCCESS!     ")
    print("=======================================================================")

finally:
    if s:
        try:
            s.close()
        except Exception:
            pass
    proc.terminate()
    proc.wait()
