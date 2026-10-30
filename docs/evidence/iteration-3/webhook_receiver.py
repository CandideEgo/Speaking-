"""Tiny webhook receiver for the A09 alert drill.

Accepts POST /alert, appends the JSON body as one line to the file given as the
first argument (default /tmp/a09-webhook.jsonl), and answers the DingTalk-style
shape alert_service expects (HTTP 200 + errcode 0).

    python webhook_receiver.py /tmp/a09-webhook.jsonl 18080
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/a09-webhook.jsonl"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 18080


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 (http.server API)
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8", "replace")
        with open(OUT, "a", encoding="utf-8") as fh:
            fh.write(raw + "\n")
        body = json.dumps({"errcode": 0, "errmsg": "ok"}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # keep the console quiet
        pass


if __name__ == "__main__":
    print(f"listening on 127.0.0.1:{PORT} -> {OUT}", flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
