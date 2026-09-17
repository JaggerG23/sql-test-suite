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
    server_proc = subprocess.Popen([sys.executable, "server.py"], cwd=os.getcwd())
    time.sleep(1)

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

    profile_dir = os.path.abspath("scratch/test_index_intake_profile")
    os.makedirs(profile_dir, exist_ok=True)

    browser_proc = subprocess.Popen([
        browser_bin,
        "--headless=new",
        "--remote-debugging-port=9555",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank"
    ])
    time.sleep(2)

    try:
        req = urllib.request.urlopen("http://127.0.0.1:9555/json")
        tabs = json.loads(req.read().decode('utf-8'))
        tab = next((t for t in tabs if t.get("type") == "page"), tabs[0])
        ws_url = tab["webSocketDebuggerUrl"]
        s = create_ws_client(ws_url)

        print("\n--- TEST 1: Visit /index.html and verify intake is required on Participant Test Suite ---")
        send_cdp(s, "Page.navigate", {"url": "http://localhost:8000/index.html"}, 1)
        time.sleep(2)

        # Ensure active tab is tab-human
        has_intake_on_index = eval_js(s, "Boolean(document.getElementById('intake-form'))", 2)
        has_study_q_on_index = eval_js(s, "Boolean(document.getElementById('opt-btn-0'))", 3)
        print("  -> Intake form rendered on index.html:", has_intake_on_index)
        print("  -> Study question hidden on index.html:", not has_study_q_on_index)
        assert has_intake_on_index is True, "Demographics intake form MUST be shown on index.html before study!"
        assert has_study_q_on_index is False, "Study questions must NOT be accessible before demographics!"

        # Verify Participant View link has target attributes
        link_href = eval_js(s, "document.getElementById('btn-participant-view-link') ? document.getElementById('btn-participant-view-link').href : ''", 4)
        print("  -> Participant View link href:", link_href)
        assert "participant.html" in link_href

        print("\n--- TEST 2: Navigate from /index.html to /participant.html via public link ---")
        # Click the link logic or navigate to participant.html
        eval_js(s, "document.getElementById('btn-participant-view-link').click()", 5)
        time.sleep(1)
        send_cdp(s, "Page.navigate", {"url": "http://localhost:8000/participant.html?new_participant=1"}, 6)
        time.sleep(2)

        has_intake_on_participant = eval_js(s, "Boolean(document.getElementById('intake-form'))", 7)
        has_study_q_on_participant = eval_js(s, "Boolean(document.getElementById('opt-btn-0'))", 8)
        print("  -> Intake form present on participant.html:", has_intake_on_participant)
        print("  -> Study question hidden before demographics on participant.html:", not has_study_q_on_participant)
        assert has_intake_on_participant is True, "Participant view MUST require demographics first!"
        assert has_study_q_on_participant is False, "Participant view must NOT show study before demographics!"

        print("\n--- TEST 3: Submit demographics on participant.html and advance study ---")
        eval_js(s, """
        (() => {
            document.getElementById('intake-age').value = '26';
            document.getElementById('intake-gender').value = 'Male';
            document.getElementById('intake-coding-exp').value = '4';
            document.getElementById('intake-education').value = 'Bachelor Degree';
            document.getElementById('intake-db-exp').value = '3';
            document.getElementById('intake-primary-language').value = 'English';
            document.getElementById('intake-country').value = 'United States';
            document.getElementById('intake-disability').value = 'No';
            document.getElementById('btn-start-experiment').click();
        })()
        """, 9)
        time.sleep(2)

        has_study_q1 = eval_js(s, "Boolean(document.getElementById('opt-btn-0'))", 10)
        print("  -> Study Question 1 displayed after completing demographics:", has_study_q1)
        assert has_study_q1 is True

        # Answer Question 1
        eval_js(s, "window.app.humanResolver.selectOption(0)", 11)
        time.sleep(1)
        total_resp = eval_js(s, "window.app.analytics.getAllResponses().length", 12)
        print(f"  -> Answered Q1 logged: {total_resp}")
        assert total_resp >= 1

        print("\n--- TEST 4: Participant visits /index.html (during the study) ---")
        # Participant navigates to /index.html
        send_cdp(s, "Page.navigate", {"url": "http://localhost:8000/index.html"}, 13)
        time.sleep(2)

        index_visited_at = eval_js(s, "localStorage.getItem('sql_study_index_visited_at')", 14)
        print("  -> Visiting index.html updated index_visited_at timestamp:", bool(index_visited_at))
        assert index_visited_at is not None

        print("\n--- TEST 5: Return to /participant.html - MUST be required to fill out demographics again! ---")
        send_cdp(s, "Page.navigate", {"url": "http://localhost:8000/participant.html"}, 15)
        time.sleep(2)

        has_intake_again = eval_js(s, "Boolean(document.getElementById('intake-form'))", 16)
        has_study_q_blocked = eval_js(s, "Boolean(document.getElementById('opt-btn-0'))", 17)
        print("  -> Demographics questionnaire forced again after index visit:", has_intake_again)
        print("  -> Study questions strictly blocked:", not has_study_q_blocked)
        assert has_intake_again is True, "User who visited index.html MUST be required to fill out demographics again!"
        assert has_study_q_blocked is False, "User who visited index.html MUST NOT be allowed to access study before refilling demographics!"

        # Attempt to bypass intake by jumping to Question 10
        eval_js(s, "window.app.loadIncrementalQuestion(10)", 18)
        time.sleep(1)
        still_on_intake = eval_js(s, "Boolean(document.getElementById('intake-form'))", 19)
        study_still_blocked = eval_js(s, "Boolean(document.getElementById('opt-btn-0'))", 20)
        print("  -> Bypass attempt blocked, still forced on intake:", still_on_intake and not study_still_blocked)
        assert still_on_intake is True
        assert study_still_blocked is False

        print("\n--- TEST 6: Fill out demographics again and verify study resumes ---")
        eval_js(s, """
        (() => {
            document.getElementById('intake-age').value = '26';
            document.getElementById('intake-gender').value = 'Male';
            document.getElementById('intake-coding-exp').value = '4';
            document.getElementById('intake-education').value = 'Bachelor Degree';
            document.getElementById('intake-db-exp').value = '3';
            document.getElementById('intake-primary-language').value = 'English';
            document.getElementById('intake-country').value = 'United States';
            document.getElementById('intake-disability').value = 'No';
            document.getElementById('btn-start-experiment').click();
        })()
        """, 21)
        time.sleep(2)

        study_unlocked = eval_js(s, "Boolean(document.getElementById('opt-btn-0'))", 22)
        print("  -> Study unlocked after re-filling demographics:", study_unlocked)
        assert study_unlocked is True

        print("\n[ALL INDEX INTAKE ENFORCEMENT TESTS PASSED SUCCESSFULLY!]")

    finally:
        browser_proc.terminate()
        server_proc.terminate()

if __name__ == "__main__":
    main()
