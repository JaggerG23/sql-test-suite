import subprocess
import json
import time
import urllib.request
import urllib.parse
import os
import socket
import struct
import base64
import sys

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
        b2 = buf[1]
        payload_len = b2 & 0x7F
        idx = 2
        if payload_len == 126:
            if len(buf) < 4:
                continue
            payload_len = struct.unpack("!H", buf[2:4])[0]
            idx = 4
        elif payload_len == 127:
            if len(buf) < 10:
                continue
            payload_len = struct.unpack("!Q", buf[2:10])[0]
            idx = 10
        if len(buf) >= idx + payload_len:
            return buf[idx:idx + payload_len].decode('utf-8', errors='ignore')
    return ""

def send_cdp(s, method, params=None, msg_id=1):
    payload = {"id": msg_id, "method": method, "params": params or {}}
    ws_send(s, json.dumps(payload))
    t0 = time.time()
    while time.time() - t0 < 10:
        raw = ws_recv(s)
        try:
            res = json.loads(raw)
            if res.get("id") == msg_id:
                return res
        except Exception:
            pass
    raise TimeoutError(f"CDP command {method} timed out")

def eval_js(s, expr, msg_id=100):
    res = send_cdp(s, "Runtime.evaluate", {
        "expression": expr,
        "returnByValue": True,
        "awaitPromise": True
    }, msg_id)
    r = res.get("result", {})
    if "exceptionDetails" in r:
        print("JS Exception:", r["exceptionDetails"])
    return r.get("result", {}).get("value")

def main():
    # 1. Start python server
    server_proc = subprocess.Popen([sys.executable, "server.py"], cwd=os.getcwd())
    time.sleep(1)

    # 2. Launch browser
    chrome_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    ]
    browser_bin = next((p for p in chrome_paths if os.path.exists(p)), None)
    if not browser_bin:
        print("No browser binary found!")
        server_proc.terminate()
        sys.exit(1)

    profile_dir = os.path.abspath("scratch/test_reset_profile")
    os.makedirs(profile_dir, exist_ok=True)

    browser_proc = subprocess.Popen([
        browser_bin,
        "--headless=new",
        "--remote-debugging-port=9333",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank"
    ])
    time.sleep(2)

    try:
        req = urllib.request.urlopen("http://127.0.0.1:9333/json")
        tabs = json.loads(req.read().decode('utf-8'))
        tab = next((t for t in tabs if t.get("type") == "page"), tabs[0])
        ws_url = tab["webSocketDebuggerUrl"]
        s = create_ws_client(ws_url)

        print("\n--- TEST 1: Open participant.html without prior demographics ---")
        send_cdp(s, "Page.navigate", {"url": "http://localhost:8000/participant.html"}, 1)
        time.sleep(2)

        # Ensure localStorage has NO demographics for fresh test
        eval_js(s, """
        (() => {
            window.app.analytics.demographics = {};
            localStorage.removeItem(window.app.analytics.demographicsKey);
            window.app.humanResolver.intakeCompleted = false;
        })()
        """, 2)
        # Reload participant page with fresh state
        send_cdp(s, "Page.navigate", {"url": "http://localhost:8000/participant.html"}, 3)
        time.sleep(2)

        intake_present = eval_js(s, "Boolean(document.getElementById('intake-form'))", 4)
        has_study_q1 = eval_js(s, "Boolean(document.getElementById('opt-btn-0'))", 5)
        print("  -> Intake form is present before demographics:", intake_present)
        print("  -> Study Question 1 is hidden before demographics:", not has_study_q1)
        assert intake_present is True, "Expected intake form to be displayed"
        assert has_study_q1 is False, "Study should NOT be shown before demographics are collected!"

        # Attempt to bypass intake by jumping to Question 5
        eval_js(s, "window.app.loadIncrementalQuestion(5)", 6)
        time.sleep(1)
        intake_still_present = eval_js(s, "Boolean(document.getElementById('intake-form'))", 7)
        has_study_q5 = eval_js(s, "Boolean(document.getElementById('opt-btn-0'))", 8)
        print("  -> Bypass attempt blocked, still on intake:", intake_still_present and not has_study_q5)
        assert intake_still_present is True
        assert has_study_q5 is False

        print("\n--- TEST 2: Submit demographic data and load study ---")
        eval_js(s, """
        (() => {
            document.getElementById('intake-age').value = '25';
            document.getElementById('intake-gender').selectedIndex = 1;
            document.getElementById('intake-academic-standing').selectedIndex = 2;
            document.getElementById('intake-coding-exp').selectedIndex = 2;
            document.getElementById('intake-db-exp').selectedIndex = 2;
            document.getElementById('intake-query-exp').selectedIndex = 1;
            document.getElementById('btn-start-experiment').click();
        })()
        """, 9)
        time.sleep(2)

        has_study_q1_after = eval_js(s, "Boolean(document.getElementById('opt-btn-0'))", 10)
        demo_saved = eval_js(s, "window.app.analytics.getDemographics()", 11)
        print("  -> Study Question 1 rendered after demographics submitted:", has_study_q1_after)
        print("  -> Saved demographics in analytics:", demo_saved)
        assert has_study_q1_after is True
        assert demo_saved is not None
        assert demo_saved['age'] == '25'
        assert demo_saved['gender'] == 'Male'

        print("\n--- TEST 3: Answer Question 1 & Question 2 ---")
        # Answer Q1
        eval_js(s, "window.app.humanResolver.selectOption(0)", 12)
        time.sleep(0.5)
        eval_js(s, "window.app.humanResolver.nextQuestion()", 13)
        time.sleep(1.5)
        # Answer Q2
        eval_js(s, "window.app.humanResolver.selectOption(1)", 14)
        time.sleep(0.5)

        total_resp_before = eval_js(s, "window.app.analytics.getAllResponses().length", 15)
        pid = eval_js(s, "window.app.analytics.participantId", 16)
        print(f"  -> Participant {pid} responses logged: {total_resp_before}")
        assert total_resp_before == 2

        print("\n--- TEST 4: Reset Test (Ensure previous entry data is NOT wiped) ---")
        # Trigger resetParticipantTest without confirmation popup
        eval_js(s, """
        (async () => {
            // Mock confirm to true
            const origConfirm = window.confirm;
            window.confirm = () => true;
            await window.app.resetParticipantTest();
            window.confirm = origConfirm;
        })()
        """, 17)
        time.sleep(1.5)

        total_resp_after = eval_js(s, "window.app.analytics.getAllResponses().length", 18)
        demo_after = eval_js(s, "window.app.analytics.getDemographics()", 19)
        print(f"  -> Total responses in analytics after Reset Test: {total_resp_after}")
        print(f"  -> Demographics after Reset Test: {demo_after}")
        assert total_resp_after == 2, f"Expected 2 responses to be preserved, but got {total_resp_after}!"
        assert demo_after is not None, "Demographics should be preserved!"

        print("\n[ALL TESTS PASSED SUCCESSFULLY!]")

    finally:
        browser_proc.terminate()
        server_proc.terminate()

if __name__ == "__main__":
    main()
