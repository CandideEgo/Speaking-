"""Local OpenAI-compatible synthetic provider. Does not call any external service."""

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOCK = threading.Lock()
STATE = {"delay": 0.0, "unknown_usage": False, "hold": False, "started": 0, "completed": 0, "disconnected": 0}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # No prompts, completions, Authorization headers, or keys in logs.

    def _json(self, payload, code=200):
        encoded = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        with LOCK:
            snapshot = dict(STATE)
        self._json(snapshot)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        if self.path == "/control":
            with LOCK:
                if body.get("reset"):
                    STATE.update(started=0, completed=0, disconnected=0)
                for field in ("delay", "unknown_usage", "hold"):
                    if field in body:
                        STATE[field] = body[field]
                snapshot = dict(STATE)
            self._json(snapshot)
            return
        if self.path != "/v1/chat/completions":
            self._json({"error": {"message": "Synthetic endpoint does not exist"}}, 404)
            return
        with LOCK:
            STATE["started"] += 1
            delay, unknown = float(STATE["delay"]), bool(STATE["unknown_usage"])
        model = body.get("model", "synthetic-teaching")
        usage = {"prompt_tokens": 10, "completion_tokens": min(80, body.get("max_tokens", 128))}
        usage["total_tokens"] = usage["prompt_tokens"] + usage["completion_tokens"]
        base = {"id": "synthetic-completion", "created": int(time.time()), "model": model}
        try:
            expires = time.monotonic() + 20
            while time.monotonic() < expires:
                with LOCK:
                    held = STATE["hold"]
                if not held:
                    break
                time.sleep(0.02)
            if body.get("stream"):
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                first = {
                    **base,
                    "object": "chat.completion.chunk",
                    "choices": [{"index": 0, "delta": {"role": "assistant", "content": "{"}, "finish_reason": None}],
                }
                self.wfile.write(f"data: {json.dumps(first)}\n\n".encode())
                self.wfile.flush()
                time.sleep(delay)
                final = {
                    **base,
                    "object": "chat.completion.chunk",
                    "choices": [
                        {"index": 0, "delta": {"content": '"intent":"suggest_retry"}'}, "finish_reason": "stop"}
                    ],
                }
                self.wfile.write(f"data: {json.dumps(final)}\n\n".encode())
                if not unknown:
                    self.wfile.write(
                        f"data: {json.dumps({**base, 'object': 'chat.completion.chunk', 'choices': [], 'usage': usage})}\n\n".encode()
                    )
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            else:
                time.sleep(delay)
                response = {
                    **base,
                    "object": "chat.completion",
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": '{"intent":"suggest_retry"}'},
                            "finish_reason": "stop",
                        }
                    ],
                }
                if not unknown:
                    response["usage"] = usage
                self._json(response)
        except (BrokenPipeError, ConnectionResetError):
            with LOCK:
                STATE["disconnected"] += 1
        finally:
            # Simulate the provider completing billable work even after its
            # consumer disconnects. These are synthetic counters, not invoices.
            with LOCK:
                STATE["completed"] += 1


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 4010), Handler).serve_forever()
