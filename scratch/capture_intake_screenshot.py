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

def main():
    server_cmd = [sys.executable, "server.py"]
    server_proc = subprocess.Popen(server_cmd, cwd=r"c:\Users\fragm\.gemini\antigravity-ide\scratch\sql-randomized-test-suite")
    time.sleep(1.5)

    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    ]
    browser_bin = next((p for p in edge_paths if os.path.exists(p)), None)
    user_data_dir = os.path.join(os.environ.get("TEMP", "."), "edge_screenshot_profile")

    browser_cmd = [
        browser_bin,
        "--headless=new",
        "--remote-debugging-port=9225",
        f"--user-data-dir={user_data_dir}",
        "--window-size=1440,900",
        "http://localhost:8000/participant.html?new_participant=1"
    ]
    browser_proc = subprocess.Popen(browser_cmd)
    time.sleep(2)

    try:
        req = urllib.request.urlopen("http://127.0.0.1:9225/json")
        tabs = json.loads(req.read().decode())
        target_tab = next((t for t in tabs if "participant.html" in t.get("url", "")), tabs[0])
        ws_url = target_tab["webSocketDebuggerUrl"]
        s = create_ws_client(ws_url)

        time.sleep(1.5)
        # Take screenshot of page
        res = send_cdp(s, "Page.captureScreenshot", {"format": "png"}, 10)
        img_data = base64.b64decode(res["result"]["data"])
        out_path = r"C:\Users\fragm\.gemini\antigravity-ide\brain\d0fa0262-f0a2-4f41-842d-1f5d8c3f9729\updated_demographics_box.png"
        with open(out_path, "wb") as f:
            f.write(img_data)
        print("Screenshot successfully captured:", out_path)
    finally:
        browser_proc.terminate()
        server_proc.terminate()

if __name__ == "__main__":
    main()
