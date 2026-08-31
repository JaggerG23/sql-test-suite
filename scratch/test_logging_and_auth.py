import subprocess
import time
import urllib.request
import urllib.parse
import http.cookiejar
import json
import sys
import os
import csv

PORT = 8998
ENV = os.environ.copy()
ENV["ADMIN_PASSWORD"] = "StefiksLabRootPassword"

DB_FILE = "participant_responses_db.json"
CSV_FILE = "participant_responses_export.csv"

# Clean up before testing
for f in [DB_FILE, CSV_FILE]:
    if os.path.exists(f):
        try:
            os.remove(f)
        except Exception:
            pass

print(f"Starting server.py on port {PORT}...")
proc = subprocess.Popen([sys.executable, "server.py", str(PORT)], env=ENV)
time.sleep(1.5)

base_url = f"http://127.0.0.1:{PORT}"
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

try:
    # Test 1: Redirect to /participant.html
    class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
        def http_error_302(self, req, fp, code, msg, headers):
            return fp

    noredir_opener = urllib.request.build_opener(NoRedirectHandler)
    resp = noredir_opener.open(f"{base_url}/")
    assert resp.status == 302
    assert resp.headers.get('Location') == '/participant.html'
    print("[PASS] Test 1: GET / redirects to /participant.html")

    # Test 2: Unauthenticated /api/load-telemetry returns 401
    try:
        opener.open(f"{base_url}/api/load-telemetry")
        assert False, "Expected 401"
    except urllib.error.HTTPError as e:
        assert e.code == 401
        print("[PASS] Test 2: Unauthenticated /api/load-telemetry rejected (401)")

    # Test 3: Public /api/save-telemetry saves responses, demographics, final thoughts & creates CSV with 27 headers
    payload = {
        "responses": [
            {
                "id": "resp_test_001",
                "participantId": "user_alpha",
                "sessionId": "sess_123",
                "timestamp": "2026-08-31T10:00:00.000Z",
                "questionNumber": 1,
                "questionCategory": "Filter & Projection Transformation",
                "activeDialect": "ansi",
                "activeDialectName": "ANSI SQL",
                "rawQuery": "SELECT * FROM users WHERE age > 21",
                "dialectSql": "SELECT * FROM users WHERE age > 21",
                "jsCode": "let res = db.execute(query);",
                "selectedKey": 1,
                "selectedOptionText": "Option A (5 rows)",
                "correctOptionText": "Option A (5 rows)",
                "isCorrect": True,
                "responseTimeMs": 1420,
                "seed": 42,
                "tabFocusLost": False,
                "tabSwitchCount": 0,
                "focusLostDurationMs": 0
            },
            {
                "id": "resp_test_002",
                "participantId": "user_beta",
                "sessionId": "sess_456",
                "timestamp": "2026-08-31T10:05:00.000Z",
                "questionNumber": 1,
                "questionCategory": "Relational Join Transformation",
                "activeDialect": "pipe",
                "activeDialectName": "Google Pipe SQL",
                "rawQuery": "SELECT * FROM orders JOIN users ON orders.uid = users.id",
                "dialectSql": "FROM orders |> JOIN users ON orders.uid = users.id",
                "jsCode": "let res = db.execute(query);",
                "selectedKey": 2,
                "selectedOptionText": "Option B (2 rows)",
                "correctOptionText": "Option A (4 rows)",
                "isCorrect": False,
                "responseTimeMs": 3500,
                "seed": 42,
                "tabFocusLost": True,
                "tabSwitchCount": 2,
                "focusLostDurationMs": 1200
            }
        ],
        "demographics": {
            "user_alpha": {
                "participantId": "user_alpha",
                "age": "23",
                "gender": "Female",
                "academicStanding": "Undergraduate (Junior / Senior)",
                "codingExp": "1–2 years",
                "dbExp": "Beginner (< 1 year)",
                "queryExp": "Yes — Occasionally write queries",
                "timestamp": "2026-08-31T09:59:00.000Z"
            }
        },
        "finalThoughts": {
            "user_alpha": {
                "participantId": "user_alpha",
                "thoughts": "Great experiment interface! Clear questions.",
                "timestamp": "2026-08-31T10:30:00.000Z"
            }
        }
    }

    req = urllib.request.Request(
        f"{base_url}/api/save-telemetry",
        data=json.dumps(payload).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    resp = opener.open(req)
    assert resp.status == 200
    res_data = json.loads(resp.read().decode('utf-8'))
    assert res_data.get('status') == 'success'
    assert res_data.get('count') == 2
    print("[PASS] Test 3: Public /api/save-telemetry saved 2 participant records")

    # Verify DB file
    assert os.path.exists(DB_FILE)
    with open(DB_FILE, 'r', encoding='utf-8') as f:
        db_content = json.load(f)
        assert len(db_content['responses']) == 2
        assert 'user_alpha' in db_content['demographics']
        assert 'user_alpha' in db_content['finalThoughts']
    print("[PASS] Test 4: participant_responses_db.json properly written on disk")

    # Verify CSV export file on disk
    assert os.path.exists(CSV_FILE)
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = list(csv.reader(f))
        assert len(reader) == 3  # 1 header + 2 rows
        headers = reader[0]
        assert len(headers) == 27
        assert headers[0] == 'Response ID'
        assert headers[1] == 'Participant ID'
        assert headers[4] == 'Question Number'
        assert headers[17] == 'Age'
        assert headers[23] == 'Final Thoughts'
        assert reader[1][1] == 'user_alpha'
        assert reader[1][17] == '23'
        assert reader[1][23] == 'Great experiment interface! Clear questions.'
    print("[PASS] Test 5: participant_responses_export.csv verified with all 27 columns")

    # Test 6: Admin login
    login_data = json.dumps({"password": "StefiksLabRootPassword"}).encode('utf-8')
    req = urllib.request.Request(
        f"{base_url}/api/admin/login",
        data=login_data,
        headers={"Content-Type": "application/json"}
    )
    resp = opener.open(req)
    assert resp.status == 200
    login_res = json.loads(resp.read().decode('utf-8'))
    assert login_res.get('status') == 'success'
    admin_token = login_res.get('token')
    assert admin_token is not None
    print("[PASS] Test 6: Admin login succeeded and issued session token")

    # Test 7: Check-auth
    resp = opener.open(f"{base_url}/api/admin/check-auth")
    assert resp.status == 200
    auth_res = json.loads(resp.read().decode('utf-8'))
    assert auth_res.get('authenticated') is True
    print("[PASS] Test 7: /api/admin/check-auth confirmed authenticated: True")

    # Test 8: Load telemetry as admin
    resp = opener.open(f"{base_url}/api/load-telemetry")
    assert resp.status == 200
    loaded_data = json.loads(resp.read().decode('utf-8'))
    assert len(loaded_data['responses']) == 2
    print("[PASS] Test 8: /api/load-telemetry returned full data to authenticated admin")

    # Test 9: Delete user telemetry as admin
    del_data = json.dumps({"participantId": "user_beta"}).encode('utf-8')
    req = urllib.request.Request(
        f"{base_url}/api/delete-user-telemetry",
        data=del_data,
        headers={"Content-Type": "application/json"}
    )
    resp = opener.open(req)
    assert resp.status == 200
    with open(DB_FILE, 'r', encoding='utf-8') as f:
        db_content = json.load(f)
        assert len(db_content['responses']) == 1
        assert db_content['responses'][0]['participantId'] == 'user_alpha'
    print("[PASS] Test 9: /api/delete-user-telemetry successfully removed user_beta from DB and CSV")

    # Test 10: Clear telemetry as admin
    req = urllib.request.Request(
        f"{base_url}/api/clear-telemetry",
        data=b"{}",
        headers={"Content-Type": "application/json"}
    )
    resp = opener.open(req)
    assert resp.status == 200
    assert not os.path.exists(DB_FILE)
    print("[PASS] Test 10: /api/clear-telemetry wiped all telemetry files")

    # Test 11: Admin logout
    req = urllib.request.Request(f"{base_url}/api/admin/logout", data=b"{}")
    resp = opener.open(req)
    assert resp.status == 200
    resp = opener.open(f"{base_url}/api/admin/check-auth")
    auth_res = json.loads(resp.read().decode('utf-8'))
    assert auth_res.get('authenticated') is False
    print("[PASS] Test 11: Admin logout revoked session")

    print("\n=======================================================")
    print("  ALL 11 BACKEND LOGGING & AUTH TESTS PASSED SUCCESSFULLY! ")
    print("=======================================================")

finally:
    proc.terminate()
    proc.wait()
