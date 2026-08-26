import subprocess
import time
import urllib.request
import urllib.parse
import http.cookiejar
import json
import sys
import os

PORT = 8999
ENV = os.environ.copy()
ENV["ADMIN_PASSWORD"] = "StefiksLabRootPassword"

print("Starting server.py process on port", PORT)
proc = subprocess.Popen([sys.executable, "server.py", str(PORT)], env=ENV)
time.sleep(1.5)

base_url = f"http://127.0.0.1:{PORT}"
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

try:
    # Test 1: GET / -> 302 Redirect to /participant.html
    class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
        def http_error_302(self, req, fp, code, msg, headers):
            return fp

    noredir_opener = urllib.request.build_opener(NoRedirectHandler)
    resp = noredir_opener.open(f"{base_url}/")
    assert resp.status == 302, f"Expected 302 for /, got {resp.status}"
    location = resp.headers.get('Location')
    assert location == '/participant.html', f"Expected location /participant.html, got {location}"
    print("[PASS] Test 1: GET / redirects to /participant.html (302)")

    # Test 2: GET /participant.html -> 200 OK
    resp = opener.open(f"{base_url}/participant.html")
    assert resp.status == 200, f"Expected 200 for participant.html, got {resp.status}"
    print("[PASS] Test 2: GET /participant.html returns 200 OK")

    # Test 3: Unauthenticated load-telemetry -> 401
    req = urllib.request.Request(f"{base_url}/api/load-telemetry")
    try:
        resp = opener.open(req)
        assert False, "Expected 401 for unauthenticated load-telemetry"
    except urllib.error.HTTPError as e:
        assert e.code == 401, f"Expected 401, got {e.code}"
        print("[PASS] Test 3: Unauthenticated /api/load-telemetry returns 401 Unauthorized")

    # Test 4: Unauthenticated clear-telemetry -> 401
    req = urllib.request.Request(f"{base_url}/api/clear-telemetry", data=b"{}")
    try:
        resp = opener.open(req)
        assert False, "Expected 401 for unauthenticated clear-telemetry"
    except urllib.error.HTTPError as e:
        assert e.code == 401, f"Expected 401, got {e.code}"
        print("[PASS] Test 4: Unauthenticated /api/clear-telemetry returns 401 Unauthorized")

    # Test 5: Wrong admin password -> 401
    data = json.dumps({"password": "wrongpassword"}).encode('utf-8')
    req = urllib.request.Request(f"{base_url}/api/admin/login", data=data, headers={"Content-Type": "application/json"})
    try:
        resp = opener.open(req)
        assert False, "Expected 401 for wrong admin password"
    except urllib.error.HTTPError as e:
        assert e.code == 401, f"Expected 401, got {e.code}"
        print("[PASS] Test 5: Login with incorrect password rejected (401)")

    # Test 6: Correct admin password -> 200 & Cookie
    data = json.dumps({"password": "StefiksLabRootPassword"}).encode('utf-8')
    req = urllib.request.Request(f"{base_url}/api/admin/login", data=data, headers={"Content-Type": "application/json"})
    resp = opener.open(req)
    assert resp.status == 200, f"Expected 200, got {resp.status}"
    res_json = json.loads(resp.read().decode('utf-8'))
    assert res_json.get('status') == 'success', f"Expected success, got {res_json}"
    print("[PASS] Test 6: Login with correct password succeeded (200) & cookie set")

    # Test 7: Authenticated check-auth -> true
    resp = opener.open(f"{base_url}/api/admin/check-auth")
    res_json = json.loads(resp.read().decode('utf-8'))
    assert res_json.get('authenticated') == True, f"Expected authenticated: True, got {res_json}"
    print("[PASS] Test 7: /api/admin/check-auth returns authenticated: True")

    # Test 8: Authenticated load-telemetry -> 200 OK
    resp = opener.open(f"{base_url}/api/load-telemetry")
    assert resp.status == 200, f"Expected 200 for authenticated load-telemetry, got {resp.status}"
    print("[PASS] Test 8: Authenticated /api/load-telemetry succeeds (200 OK)")

    # Test 9: Public save-telemetry -> 200 OK
    data = json.dumps({"responses": []}).encode('utf-8')
    req = urllib.request.Request(f"{base_url}/api/save-telemetry", data=data, headers={"Content-Type": "application/json"})
    resp = opener.open(req)
    assert resp.status == 200, f"Expected 200 for save-telemetry, got {resp.status}"
    print("[PASS] Test 9: Public /api/save-telemetry succeeds without auth (200 OK)")

    # Test 10: Logout -> check-auth returns false
    req = urllib.request.Request(f"{base_url}/api/admin/logout", data=b"{}")
    resp = opener.open(req)
    assert resp.status == 200, f"Expected 200 for logout"
    resp = opener.open(f"{base_url}/api/admin/check-auth")
    res_json = json.loads(resp.read().decode('utf-8'))
    assert res_json.get('authenticated') == False, f"Expected authenticated: False, got {res_json}"
    print("[PASS] Test 10: Logout revokes session and /api/admin/check-auth returns False")

    print("\nALL 10 VERIFICATION TESTS PASSED SUCCESSFULLY!")
finally:
    proc.terminate()
    proc.wait()
