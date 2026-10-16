#!/usr/bin/env python
"""Upload a large file to the SeeWord production host over SFTP (password auth).

    SW_HOST=<ip> SW_PW=<password> python upload.py <local_path> <remote_path>

Resumable and self-healing: reconnects on connection drops and continues from the
remote offset. That is safe because SFTP writes are position-based and
acknowledged, so the remote size is always a valid resume point. Progress prints
every 10 seconds.

Run from Git Bash with MSYS_NO_PATHCONV=1, or the remote path is rewritten into
C:/Program Files/Git/... before this script ever sees it. Pass the local path in
Windows form (C:/Users/...) for the same reason.
"""
import os
import sys
import time

import paramiko

HOST = os.environ.get("SW_HOST", "47.122.109.52")
USER = os.environ.get("SW_USER", "root")
PORT = int(os.environ.get("SW_PORT", "22"))

if len(sys.argv) < 3:
    sys.exit(__doc__)
local, remote = sys.argv[1], sys.argv[2]
total = os.path.getsize(local)
pw = os.environ["SW_PW"]
CHUNK = 1 << 20  # 1 MiB
MAX_TRIES = 40

start = time.time()


def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        HOST, port=PORT, username=USER, password=pw,
        timeout=25, banner_timeout=25, auth_timeout=25,
        look_for_keys=False, allow_agent=False,
    )
    c.get_transport().set_keepalive(15)
    return c


def remote_size(sftp):
    try:
        return sftp.stat(remote).st_size
    except OSError:
        return 0


client = None
for attempt in range(1, MAX_TRIES + 1):
    try:
        if client is not None:
            client.close()
        client = connect()
        sftp = client.open_sftp()
        offset = remote_size(sftp)
        if offset >= total:
            sftp.close()
            break
        if offset:
            print(f"[try {attempt}] resuming from {offset:,} / {total:,} bytes", flush=True)
        rf = sftp.open(remote, "r+b" if offset else "wb")
        rf.seek(offset)
        sent = last_sent = offset
        tick = time.time()
        with open(local, "rb") as lf:
            lf.seek(offset)
            while True:
                buf = lf.read(CHUNK)
                if not buf:
                    break
                rf.write(buf)
                sent += len(buf)
                now = time.time()
                if now - tick >= 10:
                    rate = (sent - last_sent) / (now - tick)
                    eta = (total - sent) / rate if rate > 0 else float("inf")
                    print(f"{100.0*sent/total:5.1f}%  {sent/1e6:7.1f}/{total/1e6:.1f} MB  "
                          f"{rate/1024:6.0f} KB/s  ETA {eta/60:4.1f} min", flush=True)
                    tick, last_sent = now, sent
        rf.close()
        sftp.close()
        if remote_size(client.open_sftp()) >= total:
            break
        print(f"[try {attempt}] short write, retrying", flush=True)
    except Exception as exc:  # any transport error here is retryable
        print(f"[try {attempt}] {type(exc).__name__}: {exc} — reconnecting", flush=True)
        time.sleep(3)
else:
    print("GAVE UP after max tries", flush=True)
    sys.exit(1)

final = client.open_sftp().stat(remote).st_size
client.close()
print(f"DONE {final:,} / {total:,} bytes in {(time.time()-start)/60:.1f} min", flush=True)
sys.exit(0 if final == total else 1)
