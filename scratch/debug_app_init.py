import subprocess
import urllib.request
import json
import socket
import base64
import time
import os
import sys

def ws_handshake(sock, host, port, path):
    key = base64.b64encode(os.urandom(16)).decode('utf-8')
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(req.encode('utf-8'))
    resp = b""
    while b"\r\n\r\n" not in resp:
        resp += sock.recv(1024)
    if b"101 " not in resp:
        raise RuntimeError("Handshake failed: " + resp.decode('utf-8', errors='ignore'))

def ws_send(sock, msg):
    payload = msg.encode('utf-8')
    length = len(payload)
    frame = bytearray([0x81])
    mask_key = os.urandom(4)
    if length <= 125:
        frame.append(0x80 | length)
    elif length <= 65535:
        frame.append(0x80 | 126)
        frame.extend(length.to_bytes(2, 'big'))
    else:
        frame.append(0x80 | 127)
        frame.extend(length.to_bytes(8, 'big'))
    frame.extend(mask_key)
    masked_payload = bytearray(payload[i] ^ mask_key[i % 4] for i in range(length))
    frame.extend(masked_payload)
    sock.sendall(frame)

def ws_recv(sock):
    def read_bytes(n):
        buf = b""
        while len(buf) < n:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                raise EOFError("Socket closed")
            buf += chunk
        return buf

    b1, b2 = read_bytes(2)
    masked = bool(b2 & 0x80)
    length = b2 & 0x7F
    if length == 126:
        length = int.from_bytes(read_bytes(2), 'big')
    elif length == 127:
        length = int.from_bytes(read_bytes(8), 'big')

    mask = read_bytes(4) if masked else None
    data = read_bytes(length)
    if masked:
        data = bytes(data[i] ^ mask[i % 4] for i in range(length))
    return data.decode('utf-8', errors='ignore')

def create_ws_client(ws_url):
    clean_url = ws_url.replace("ws://", "")
    host_port, path = clean_url.split("/", 1)
    host, port = host_port.split(":")
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((host, int(port)))
    ws_handshake(s, host, port, "/" + path)
    return s

msg_counter = 0
def eval_js(s, expr):
    global msg_counter
    msg_counter += 1
    msg_id = msg_counter
    req = {
        "id": msg_id,
        "method": "Runtime.evaluate",
        "params": {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": True
        }
    }
    ws_send(s, json.dumps(req))
    while True:
        resp = json.loads(ws_recv(s))
        if resp.get("id") == msg_id:
            result = resp.get("result", {})
            if "exceptionDetails" in result:
                print("JS Exception Details:", result["exceptionDetails"], flush=True)
            return result.get("result", {}).get("value")

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge_path):
    edge_path = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'

cmd = [
    edge_path,
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9229',
    '--user-data-dir=C:\\Users\\fragm\\.gemini\\antigravity-ide\\scratch\\sql-randomized-test-suite\\scratch\\debug_profile',
    'http://localhost:8000/participant.html'
]
proc = subprocess.Popen(cmd)
time.sleep(2)
try:
    resp = urllib.request.urlopen("http://127.0.0.1:9229/json", timeout=2)
    pages = json.loads(resp.read().decode('utf-8'))
    ws_url = None
    for p in pages:
        if p.get('type') == 'page' and 'localhost' in p.get('url', ''):
            ws_url = p['webSocketDebuggerUrl']
            break
    
    print("Connecting to ws:", ws_url)
    s = create_ws_client(ws_url)
    
    # Enable Console and Runtime
    ws_send(s, json.dumps({"id": 999, "method": "Runtime.enable"}))
    ws_send(s, json.dumps({"id": 998, "method": "Log.enable"}))
    
    time.sleep(1)
    print("Checking scripts in DOM:", eval_js(s, "(() => Array.from(document.querySelectorAll('script')).map(x => x.src))()"))
    print("Fetching and evaling app.js directly:")
    diag_res = eval_js(s, """
    (async () => {
        try {
            const resp = await fetch('js/app.js?v=11');
            const code = await resp.text();
            try {
                eval(code);
                return 'EVAL SUCCESS: QueryExperimentApp is ' + typeof window.QueryExperimentApp;
            } catch (evalErr) {
                return 'EVAL SYNTAX/RUNTIME ERROR: ' + evalErr.stack;
            }
        } catch (fetchErr) {
            return 'FETCH ERROR: ' + fetchErr.stack;
        }
    })()
    """)
    print("Diag Result:", diag_res)
finally:
    proc.terminate()
