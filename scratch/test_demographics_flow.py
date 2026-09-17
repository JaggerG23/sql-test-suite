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

    profile_dir = os.path.abspath("scratch/test_demo_profile")
    os.makedirs(profile_dir, exist_ok=True)

    browser_proc = subprocess.Popen([
        browser_bin,
        "--headless=new",
        "--remote-debugging-port=9444",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank"
    ])
    time.sleep(2)

    try:
        req = urllib.request.urlopen("http://127.0.0.1:9444/json")
        tabs = json.loads(req.read().decode('utf-8'))
        tab = next((t for t in tabs if t.get("type") == "page"), tabs[0])
        ws_url = tab["webSocketDebuggerUrl"]
        s = create_ws_client(ws_url)

        print("\n--- STEP 1: Navigate to participant.html ---")
        send_cdp(s, "Page.navigate", {"url": "http://localhost:8000/participant.html"}, 1)
        time.sleep(2)

        # Clear any prior demographics in this profile
        eval_js(s, """
        (() => {
            if (window.app && window.app.analytics) {
                window.app.analytics.demographics = {};
                localStorage.removeItem(window.app.analytics.demographicsKey);
            }
            if (window.app && window.app.humanResolver) {
                window.app.humanResolver.intakeCompleted = false;
            }
        })()
        """, 2)
        send_cdp(s, "Page.navigate", {"url": "http://localhost:8000/participant.html"}, 3)
        time.sleep(2)

        intake_present = eval_js(s, "Boolean(document.getElementById('intake-form'))", 4)
        print("Intake form present:", intake_present)
        assert intake_present is True, "Expected intake form to be displayed"

        # Check the exact question labels
        labels = eval_js(s, """
        (() => {
            const labels = Array.from(document.querySelectorAll('#intake-form label')).map(l => l.innerText.replace('*', '').trim());
            return labels;
        })()
        """, 5)
        print("Rendered Form Labels:", labels)

        expected_labels = [
            "How old are you?",
            "What is your gender",
            "How many total years of programming experience do you have?",
            "What is your highest level of education?",
            "How many years of studying or working with databases do you have?",
            "What is your primary language (i.e., the language you speak at home)?",
            "What is your country of origin?",
            "Do you identify as having a disability or other chronic condition?"
        ]

        for exp in expected_labels:
            matched = any(exp.lower() in (l or "").lower() for l in labels)
            print(f"  Checking '{exp}': {'FOUND' if matched else 'MISSING'}")
            assert matched, f"Expected label '{exp}' not found in {labels}"

        # Verify dropdown controls exist
        has_lang_dropdown = eval_js(s, "Boolean(document.getElementById('intake-primary-language'))", 6)
        has_country_dropdown = eval_js(s, "Boolean(document.getElementById('intake-country'))", 7)
        has_disability_dropdown = eval_js(s, "Boolean(document.getElementById('intake-disability'))", 8)
        print(f"  Dropdowns present -> Language: {has_lang_dropdown}, Country: {has_country_dropdown}, Disability: {has_disability_dropdown}")
        assert has_lang_dropdown and has_country_dropdown and has_disability_dropdown, "Missing dropdown elements!"

        # Verify input fields
        coding_type = eval_js(s, "document.getElementById('intake-coding-exp').tagName", 9)
        db_type = eval_js(s, "document.getElementById('intake-db-exp').tagName", 10)
        print(f"  Field types -> Coding Exp: {coding_type}, DB Exp: {db_type}")
        assert coding_type.upper() == 'INPUT'
        assert db_type.upper() == 'INPUT'

        print("\n--- STEP 2: Test validation prevents incomplete submission ---")
        eval_js(s, "document.getElementById('btn-start-experiment').click()", 12)
        time.sleep(0.5)
        val_msg_visible = eval_js(s, "document.getElementById('intake-validation-msg').style.display !== 'none'", 13)
        print("Validation message displayed for empty form:", val_msg_visible)
        assert val_msg_visible is True

        print("\n--- STEP 3: Complete all 8 demographic fields and submit ---")
        eval_js(s, """
        (() => {
            document.getElementById('intake-age').value = '28';
            document.getElementById('intake-gender').value = 'Female';
            document.getElementById('intake-coding-exp').value = '3.5';
            document.getElementById('intake-education').value = "Masters Degree";
            document.getElementById('intake-db-exp').value = '2';
            document.getElementById('intake-primary-language').value = 'Spanish';
            document.getElementById('intake-country').value = 'Mexico';
            document.getElementById('intake-disability').value = 'Prefer not to disclose';
            document.getElementById('btn-start-experiment').click();
        })()
        """, 14)
        time.sleep(2)

        has_study_q1 = eval_js(s, "Boolean(document.getElementById('opt-btn-0'))", 15)
        print("Study Question 1 displayed after completing intake:", has_study_q1)
        assert has_study_q1 is True

        demo_saved = eval_js(s, "window.app.analytics.getDemographics()", 16)
        print("Demographics saved in analytics:", demo_saved)
        assert demo_saved['age'] == '28'
        assert demo_saved['gender'] == 'Female'
        assert demo_saved['codingExp'] == '3.5'
        assert demo_saved['education'] == "Masters Degree"
        assert demo_saved['dbExp'] == '2'
        assert demo_saved['primaryLanguage'] == 'Spanish'
        assert demo_saved['countryOfOrigin'] == 'Mexico'
        assert demo_saved['disability'] == 'Prefer not to disclose'

        print("\n--- STEP 4: Answer Question 1 and verify telemetry export ---")
        eval_js(s, "window.app.humanResolver.selectOption(0)", 17)
        time.sleep(1)

        # Trigger CSV generation formatting test
        csv_headers = eval_js(s, "window.app.analytics.getCSVHeaders()", 18)
        print("CSV Headers:", csv_headers)
        assert 'Primary Language' in csv_headers
        assert 'Country of Origin' in csv_headers
        assert 'Disability Status' in csv_headers
        assert 'Highest Level of Education' in csv_headers

        sample_row = eval_js(s, "window.app.analytics.formatCSVRow(window.app.analytics.getAllResponses()[0])", 19)
        print("Sample CSV Row:", sample_row)
        assert 'Spanish' in sample_row
        assert 'Mexico' in sample_row

        print("\nALL DEMOGRAPHIC TESTS PASSED SUCCESSFULLY!")

    finally:
        browser_proc.terminate()
        server_proc.terminate()

if __name__ == "__main__":
    main()
