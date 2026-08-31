import subprocess
import os
import time

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge_path):
    edge_path = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'

user_data_dir = r'C:\Users\fragm\.gemini\antigravity-ide\scratch\edge_user_data_test'

def test_page_dom(url, name):
    cmd = [
        edge_path,
        '--headless',
        '--disable-gpu',
        f'--user-data-dir={user_data_dir}',
        '--dump-dom',
        url
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    dom = res.stdout
    print(f"=== {name} ({url}) ===")
    print(f"DOM Length: {len(dom)}")
    return dom

# Test 1: Participant page DOM
participant_dom = test_page_dom('http://localhost:8000/participant.html', 'Participant Page')
assert 'human-challenge-container' in participant_dom
assert 'Database Language Study' in participant_dom or 'intake-form' in participant_dom
print("[PASS] Participant page rendered properly with intake form container!")

# Test 2: Index page initial locked DOM
index_dom = test_page_dom('http://localhost:8000/index.html', 'Index Page Initial')
assert 'admin-login-overlay' in index_dom or 'Admin Dashboard Restricted' in index_dom
print("[PASS] Index page shows restricted admin overlay as expected!")
