import json
import urllib.request
import time
import socket
import hashlib
import base64
import struct
import subprocess

EDGE_URL = "http://127.0.0.1:9222"

class CDPClient:
    def __init__(self, ws_url):
        host_port, path = ws_url.replace("ws://", "").split("/", 1)
        host, port = host_port.split(":")
        self.sock = socket.create_connection((host, int(port)), timeout=10)
        key = base64.b64encode(b"0123456789abcdef").decode()
        req = (
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        res = self.sock.recv(4096)
        if b"101 Switching Protocols" not in res:
            raise ConnectionError("WebSocket handshake failed")

    def send(self, data):
        payload = data.encode() if isinstance(data, str) else data
        frame = bytearray([0x81])
        length = len(payload)
        mask_key = b"\x12\x34\x56\x78"
        if length < 126:
            frame.append(0x80 | length)
        elif length < 65536:
            frame.append(0x80 | 126)
            frame.extend(struct.pack(">H", length))
        else:
            frame.append(0x80 | 127)
            frame.extend(struct.pack(">Q", length))
        frame.extend(mask_key)
        masked = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(payload))
        frame.extend(masked)
        self.sock.sendall(frame)

    def recv(self):
        head = self.sock.recv(2)
        if not head:
            return ""
        length = head[1] & 0x7F
        if length == 126:
            length = struct.unpack(">H", self.sock.recv(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self.sock.recv(8))[0]
        data = bytearray()
        while len(data) < length:
            chunk = self.sock.recv(length - len(data))
            if not chunk:
                break
            data.extend(chunk)
        return data.decode('utf-8', errors='ignore')

    def close(self):
        self.sock.close()

def eval_js(s, expr):
    msg_id = int(time.time() * 1000) % 1000000
    req = {
        "id": msg_id,
        "method": "Runtime.evaluate",
        "params": {
            "expression": expr,
            "returnByValue": True
        }
    }
    s.send(json.dumps(req))
    while True:
        resp = json.loads(s.recv())
        if resp.get("id") == msg_id:
            result = resp.get("result", {})
            if "exceptionDetails" in result:
                print("JS Exception:", result["exceptionDetails"])
            return result.get("result", {}).get("value")

def main():
    tabs = json.loads(urllib.request.urlopen(f"{EDGE_URL}/json").read().decode('utf-8'))
    tab = next((t for t in tabs if "participant.html" in t.get("url", "") or "localhost" in t.get("url", "")), None)
    if not tab:
        print("No tab found, open Edge...")
        subprocess.Popen([
            "msedge",
            "--remote-debugging-port=9222",
            "--no-first-run",
            "--no-default-browser-check",
            "http://localhost:8000/participant.html"
        ])
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"{EDGE_URL}/json").read().decode('utf-8'))
        tab = next((t for t in tabs if "participant.html" in t.get("url", "")), tabs[0])

    ws_url = tab["webSocketDebuggerUrl"]
    s = CDPClient(ws_url)
    eval_js(s, "window.location.href = 'http://localhost:8000/participant.html'")
    time.sleep(1.5)

    print("Initial Nav Counter:", eval_js(s, "document.getElementById('nav-questions-counter').textContent"))
    print("Intake form present:", eval_js(s, "Boolean(document.getElementById('intake-form'))"))

    # Fill form
    eval_js(s, """
    (() => {
        document.getElementById('intake-age').value = '24';
        document.getElementById('intake-gender').value = 'Male';
        document.getElementById('intake-academic-standing').value = "Master's Student";
        document.getElementById('intake-coding-exp').value = "3–5 years";
        document.getElementById('intake-db-exp').value = "Intermediate (1–3 years)";
        document.getElementById('intake-query-exp').value = "Yes - Frequently write SQL / database queries";
    })()
    """)

    print("Form field values:", eval_js(s, """
    ({
        age: document.getElementById('intake-age').value,
        gender: document.getElementById('intake-gender').value,
        academic: document.getElementById('intake-academic-standing').value,
        coding: document.getElementById('intake-coding-exp').value,
        db: document.getElementById('intake-db-exp').value,
        query: document.getElementById('intake-query-exp').value
    })
    """))

    eval_js(s, "document.getElementById('btn-start-experiment').click()")
    time.sleep(1.5)
    print("Intake validation message:", eval_js(s, "document.getElementById('intake-validation-msg') ? document.getElementById('intake-validation-msg').textContent : 'none'"))
    print("opt-btn-0 present:", eval_js(s, "Boolean(document.getElementById('opt-btn-0'))"))
    print("Nav Counter after submit:", eval_js(s, "document.getElementById('nav-questions-counter').textContent"))

    # Click option 0
    eval_js(s, "document.getElementById('opt-btn-0').click()")
    time.sleep(0.5)
    print("Nav Counter after Q1 answer:", eval_js(s, "document.getElementById('nav-questions-counter').textContent"))

    s.close()

if __name__ == "__main__":
    main()
