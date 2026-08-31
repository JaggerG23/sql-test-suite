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
    s.settimeout(5.0)
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

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if not os.path.exists(edge_path):
    edge_path = r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'

cmd = [
    edge_path,
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9261',
    '--user-data-dir=C:\\Users\\fragm\\.gemini\\antigravity-ide\\scratch\\edge_profile_check',
    'http://localhost:8000/participant.html'
]
proc = subprocess.Popen(cmd)
time.sleep(2.5)

try:
    resp = urllib.request.urlopen("http://127.0.0.1:9261/json", timeout=2)
    pages = json.loads(resp.read().decode('utf-8'))
    print("CDP Pages:", [(p.get('url'), p.get('type')) for p in pages])
    ws_url = pages[0]['webSocketDebuggerUrl']
    s = create_ws_client(ws_url)

    # Enable Console & Runtime
    ws_send(s, json.dumps({"id": 1, "method": "Runtime.enable"}))
    ws_send(s, json.dumps({"id": 2, "method": "Console.enable"}))
    ws_send(s, json.dumps({"id": 3, "method": "Log.enable"}))

    # Evaluate window properties
    ws_send(s, json.dumps({"id": 4, "method": "Runtime.evaluate", "params": {"expression": "Boolean(window.app)"}}))

    start = time.time()
    while time.time() - start < 5:
        try:
            msg = ws_recv(s)
            parsed = json.loads(msg)
            print("RECV:", parsed)
        except Exception as e:
            print("Recv err:", e)
            break
finally:
    proc.terminate()
    proc.wait()
