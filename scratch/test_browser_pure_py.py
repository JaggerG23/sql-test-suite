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
    assert b"101 " in resp, f"Handshake failed: {resp.decode('utf-8', errors='ignore')}"
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

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge_path):
    edge_path = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'

user_data_dir = r'C:\Users\fragm\.gemini\antigravity-ide\scratch\edge_cdp_profile_clean'

cmd = [
    edge_path,
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    f'--user-data-dir={user_data_dir}',
    'about:blank'
]

proc = subprocess.Popen(cmd)
time.sleep(2.0)

def get_ws_url():
    for _ in range(15):
        try:
            resp = urllib.request.urlopen("http://127.0.0.1:9225/json", timeout=2)
            pages = json.loads(resp.read().decode('utf-8'))
            if pages:
                return pages[0]['webSocketDebuggerUrl']
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("Failed to connect to Edge debugging port 9225")

def send_cdp(s, method, params=None, msg_id=1):
    msg = json.dumps({"id": msg_id, "method": method, "params": params or {}})
    ws_send(s, msg)
    start_t = time.time()
    while time.time() - start_t < 10:
        raw = ws_recv(s)
        try:
            res = json.loads(raw)
            if res.get("id") == msg_id:
                return res
        except Exception:
            pass
    raise TimeoutError(f"CDP command {method} timed out")

s = None
try:
    ws_url = get_ws_url()
    s = create_ws_client(ws_url)

    # 1. Test Admin Dashboard Lock & Modal Dismissal
    print("Navigating to http://localhost:8000/index.html...", flush=True)
    send_cdp(s, "Page.navigate", {"url": "http://localhost:8000/index.html"}, 1)
    time.sleep(2)

    res = send_cdp(s, "Runtime.evaluate", {
        "expression": "Boolean(document.getElementById('admin-login-overlay')) && document.body.classList.contains('admin-locked')"
    }, 2)
    print("Is admin locked overlay present before login:", res.get("result", {}).get("result", {}).get("value"), flush=True)
    assert res.get("result", {}).get("result", {}).get("value") is True

    print("Entering password 'StefiksLabRootPassword' and unlocking dashboard...", flush=True)
    send_cdp(s, "Runtime.evaluate", {
        "expression": """
        (async () => {
            const passInput = document.getElementById('admin-pass-input');
            passInput.value = 'StefiksLabRootPassword';
            await window.adminAuth.handleLogin();
        })()
        """,
        "awaitPromise": True
    }, 3)
    time.sleep(1)

    res = send_cdp(s, "Runtime.evaluate", {
        "expression": "Boolean(document.getElementById('admin-login-overlay'))"
    }, 4)
    has_overlay = res.get("result", {}).get("result", {}).get("value")
    print("Has admin login overlay after unlocking:", has_overlay, flush=True)
    assert has_overlay is False, f"Expected overlay to be removed from DOM, got {has_overlay}"

    res = send_cdp(s, "Runtime.evaluate", {
        "expression": "document.body.classList.contains('admin-locked')"
    }, 5)
    is_locked = res.get("result", {}).get("result", {}).get("value")
    print("Is body locked after unlocking:", is_locked, flush=True)
    assert is_locked is False

    res = send_cdp(s, "Runtime.evaluate", {
        "expression": "window.getComputedStyle(document.querySelector('.app-container')).display"
    }, 6)
    display_val = res.get("result", {}).get("result", {}).get("value")
    print(".app-container display style:", display_val, flush=True)
    assert display_val == 'flex'
    print("[PASS] Admin Dashboard unlocked cleanly! Login modal completely removed from DOM!\n", flush=True)

    # 2. Test Participant Flow
    print("Navigating to http://localhost:8000/participant.html...", flush=True)
    send_cdp(s, "Page.navigate", {"url": "http://localhost:8000/participant.html"}, 7)
    time.sleep(2)

    res = send_cdp(s, "Runtime.evaluate", {
        "expression": "Boolean(document.getElementById('intake-form'))"
    }, 8)
    has_intake = res.get("result", {}).get("result", {}).get("value")
    print("Has intake form on participant.html:", has_intake, flush=True)
    assert has_intake is True

    print("Submitting participant intake questionnaire...", flush=True)
    send_cdp(s, "Runtime.evaluate", {
        "expression": """
        (() => {
            document.getElementById('intake-age').value = '24';
            document.getElementById('intake-gender').selectedIndex = 1;
            document.getElementById('intake-academic-standing').selectedIndex = 3;
            document.getElementById('intake-coding-exp').selectedIndex = 2;
            document.getElementById('intake-db-exp').selectedIndex = 2;
            document.getElementById('intake-query-exp').selectedIndex = 1;
            document.getElementById('btn-start-experiment').click();
        })()
        """
    }, 9)
    time.sleep(2)

    res = send_cdp(s, "Runtime.evaluate", {
        "expression": "Boolean(document.getElementById('opt-btn-0'))"
    }, 10)
    has_q1 = res.get("result", {}).get("result", {}).get("value")
    print("Question 1 option cards rendered:", has_q1, flush=True)
    assert has_q1 is True

    print("Selecting option 1 for Question 1...", flush=True)
    send_cdp(s, "Runtime.evaluate", {
        "expression": "window.app.humanResolver.selectOption(0)"
    }, 11)
    time.sleep(0.5)

    print("Advancing to Question 2...", flush=True)
    send_cdp(s, "Runtime.evaluate", {
        "expression": "window.app.humanResolver.nextQuestion()"
    }, 12)
    time.sleep(1.5)

    print("Selecting option 2 for Question 2...", flush=True)
    send_cdp(s, "Runtime.evaluate", {
        "expression": "window.app.humanResolver.selectOption(1)"
    }, 13)
    time.sleep(0.5)

    res = send_cdp(s, "Runtime.evaluate", {
        "expression": "window.app.analytics.getAllResponses().length"
    }, 14)
    resp_count = res.get("result", {}).get("result", {}).get("value")
    print(f"Total responses recorded locally: {resp_count}", flush=True)
    assert resp_count == 2
    print("[PASS] Participant questions answered & logged successfully!\n", flush=True)

    # 3. Test Admin Analytics rendering
    print("Navigating back to http://localhost:8000/index.html...", flush=True)
    send_cdp(s, "Page.navigate", {"url": "http://localhost:8000/index.html"}, 15)
    time.sleep(2)

    # Unlock dashboard
    send_cdp(s, "Runtime.evaluate", {
        "expression": """
        (async () => {
            if (document.getElementById('admin-pass-input')) {
                document.getElementById('admin-pass-input').value = 'StefiksLabRootPassword';
                await window.adminAuth.handleLogin();
            }
        })()
        """,
        "awaitPromise": True
    }, 16)
    time.sleep(1)

    res = send_cdp(s, "Runtime.evaluate", {
        "expression": """
        (() => {
            const summary = window.app.analytics.getAnalyticsSummary();
            const userGroups = window.app.analytics.getResponsesGroupedByParticipant();
            const uids = Object.keys(userGroups);
            return {
                totalResponses: summary.totalResponses,
                uniqueParticipants: summary.uniqueParticipants,
                uids: uids
            };
        })()
        """
    }, 17)
    analytics_state = res.get("result", {}).get("result", {}).get("value")
    print("Admin Analytics State:", analytics_state, flush=True)
    assert analytics_state['totalResponses'] >= 2
    assert analytics_state['uniqueParticipants'] >= 1
    print("[PASS] Admin Dashboard Analytics Tab verified with live telemetry data!", flush=True)

    print("\n===================================================================", flush=True)
    print("  ALL END-TO-END BROWSER AUTOMATION TESTS COMPLETED SUCCESSFULLY!  ", flush=True)
    print("===================================================================", flush=True)

finally:
    if s:
        try:
            s.close()
        except Exception:
            pass
    proc.terminate()
    proc.wait()
