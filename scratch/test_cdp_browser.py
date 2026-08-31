import subprocess
import json
import time
import urllib.request
import urllib.parse
import os
import websocket

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge_path):
    edge_path = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'

user_data_dir = r'C:\Users\fragm\.gemini\antigravity-ide\scratch\edge_cdp_profile'

cmd = [
    edge_path,
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    f'--user-data-dir={user_data_dir}',
    'about:blank'
]

proc = subprocess.Popen(cmd)
time.sleep(2)

def get_ws_url():
    resp = urllib.request.urlopen("http://127.0.0.1:9222/json")
    pages = json.loads(resp.read().decode('utf-8'))
    return pages[0]['webSocketDebuggerUrl']

def send_cdp(ws, method, params=None, msg_id=1):
    msg = {"id": msg_id, "method": method, "params": params or {}}
    ws.send(json.dumps(msg))
    while True:
        res = json.loads(ws.recv())
        if res.get("id") == msg_id:
            return res

try:
    ws_url = get_ws_url()
    ws = websocket.create_connection(ws_url)

    # 1. Navigate to index.html
    print("Navigating to http://localhost:8000/index.html...")
    send_cdp(ws, "Page.navigate", {"url": "http://localhost:8000/index.html"}, 1)
    time.sleep(2)

    # 2. Check if admin overlay exists and body has admin-locked
    res = send_cdp(ws, "Runtime.evaluate", {
        "expression": "Boolean(document.getElementById('admin-login-overlay')) && document.body.classList.contains('admin-locked')"
    }, 2)
    print("Is admin locked overlay present before login:", res.get("result", {}).get("result", {}).get("value"))
    assert res.get("result", {}).get("result", {}).get("value") is True

    # 3. Enter password and submit
    print("Entering password 'StefiksLabRootPassword' and submitting...")
    send_cdp(ws, "Runtime.evaluate", {
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

    # 4. Verify admin overlay is completely GONE and body is unlocked
    res = send_cdp(ws, "Runtime.evaluate", {
        "expression": "Boolean(document.getElementById('admin-login-overlay'))"
    }, 4)
    has_overlay = res.get("result", {}).get("result", {}).get("value")
    print("Has admin login overlay after unlocking:", has_overlay)
    assert has_overlay is False, f"Expected overlay to be removed, got {has_overlay}"

    res = send_cdp(ws, "Runtime.evaluate", {
        "expression": "document.body.classList.contains('admin-locked')"
    }, 5)
    is_locked = res.get("result", {}).get("result", {}).get("value")
    print("Is body locked after unlocking:", is_locked)
    assert is_locked is False

    # 5. Check if main workspace is visible
    res = send_cdp(ws, "Runtime.evaluate", {
        "expression": "window.getComputedStyle(document.querySelector('.app-container')).display"
    }, 6)
    display_val = res.get("result", {}).get("result", {}).get("value")
    print(".app-container display style:", display_val)
    assert display_val == 'flex'
    print("[PASS] Admin Dashboard unlocked cleanly! Login modal completely disappeared!")

    # 6. Navigate to participant.html
    print("\nNavigating to http://localhost:8000/participant.html...")
    send_cdp(ws, "Page.navigate", {"url": "http://localhost:8000/participant.html"}, 7)
    time.sleep(2.5)

    # 7. Check participant intake form
    res = send_cdp(ws, "Runtime.evaluate", {
        "expression": "Boolean(document.getElementById('intake-form'))"
    }, 8)
    has_intake = res.get("result", {}).get("result", {}).get("value")
    print("Has intake form on participant.html:", has_intake)
    assert has_intake is True

    # 8. Fill intake form and submit
    print("Submitting participant intake questionnaire...")
    send_cdp(ws, "Runtime.evaluate", {
        "expression": """
        (() => {
            document.getElementById('intake-age').value = '25';
            document.getElementById('intake-gender').value = 'Female';
            document.getElementById('intake-academic-standing').value = "Master's Student";
            document.getElementById('intake-coding-exp').value = '3–5 years';
            document.getElementById('intake-db-exp').value = 'Intermediate (1–3 years)';
            document.getElementById('intake-query-exp').value = 'Yes — Frequently write SQL / database queries';
            document.getElementById('intake-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        })()
        """
    }, 9)
    time.sleep(2)

    # 9. Verify Question 1 is loaded
    res = send_cdp(ws, "Runtime.evaluate", {
        "expression": "Boolean(document.getElementById('opt-btn-0'))"
    }, 10)
    has_q1 = res.get("result", {}).get("result", {}).get("value")
    print("Question 1 option cards rendered:", has_q1)
    assert has_q1 is True

    # 10. Select option 1 (Key 1)
    print("Selecting option 1 for Question 1...")
    send_cdp(ws, "Runtime.evaluate", {
        "expression": "window.app.humanResolver.selectOption(0)"
    }, 11)
    time.sleep(0.5)

    # 11. Advance to Question 2
    print("Advancing to Question 2...")
    send_cdp(ws, "Runtime.evaluate", {
        "expression": "window.app.humanResolver.nextQuestion()"
    }, 12)
    time.sleep(1.5)

    # Select option 2 for Question 2
    print("Selecting option 2 for Question 2...")
    send_cdp(ws, "Runtime.evaluate", {
        "expression": "window.app.humanResolver.selectOption(1)"
    }, 13)
    time.sleep(0.5)

    # Check local responses count
    res = send_cdp(ws, "Runtime.evaluate", {
        "expression": "window.app.analytics.getAllResponses().length"
    }, 14)
    resp_count = res.get("result", {}).get("result", {}).get("value")
    print(f"Total responses recorded locally: {resp_count}")
    assert resp_count == 2

    # 12. Switch back to index.html (Admin Dashboard) and verify real-time data
    print("\nNavigating back to http://localhost:8000/index.html...")
    send_cdp(ws, "Page.navigate", {"url": "http://localhost:8000/index.html"}, 15)
    time.sleep(2)

    # Unlock dashboard if session not persisted in test context
    send_cdp(ws, "Runtime.evaluate", {
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

    # Check that Analytics Dashboard renders the 2 logged questions and user folder
    res = send_cdp(ws, "Runtime.evaluate", {
        "expression": """
        (() => {
            const summary = window.app.analytics.getAnalyticsSummary();
            const userGroups = window.app.analytics.getResponsesGroupedByParticipant();
            const uids = Object.keys(userGroups);
            return {
                totalResponses: summary.totalResponses,
                uniqueParticipants: summary.uniqueParticipants,
                uids: uids,
                folderCount: document.querySelectorAll('.user-folder-card').length
            };
        })()
        """
    }, 17)
    analytics_state = res.get("result", {}).get("result", {}).get("value")
    print("Admin Analytics State:", analytics_state)
    assert analytics_state['totalResponses'] == 2
    assert analytics_state['uniqueParticipants'] == 1

    print("\n=======================================================")
    print("  ALL FULL-STACK CDP BROWSER VERIFICATIONS PASSED!     ")
    print("=======================================================")

finally:
    ws.close()
    proc.terminate()
    proc.wait()
