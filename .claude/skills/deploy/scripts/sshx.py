#!/usr/bin/env python
"""Run one command on the SeeWord production host over SSH (password auth).

    SW_HOST=<ip> SW_PW=<password> python sshx.py "<remote command>"

Streams stdout/stderr and exits with the remote exit status. Keepalive is on so
long silent steps (docker load, pg_dump) survive a NAT idle timeout.

SW_TIMEOUT (seconds, default 600) bounds the channel; raise it for `docker load`.
"""
import os
import sys

import paramiko

HOST = os.environ.get("SW_HOST", "47.122.109.52")
USER = os.environ.get("SW_USER", "root")
PORT = int(os.environ.get("SW_PORT", "22"))

if len(sys.argv) < 2:
    sys.exit(__doc__)
cmd = sys.argv[1]
pw = os.environ["SW_PW"]

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(
    HOST, port=PORT, username=USER, password=pw,
    timeout=25, banner_timeout=25, auth_timeout=25,
    look_for_keys=False, allow_agent=False,
)
client.get_transport().set_keepalive(15)

stdin, stdout, stderr = client.exec_command(
    cmd, timeout=int(os.environ.get("SW_TIMEOUT", "600"))
)
for line in iter(stdout.readline, ""):
    sys.stdout.write(line)
    sys.stdout.flush()
err = stderr.read().decode("utf-8", "replace")
if err:
    sys.stderr.write(err)

status = stdout.channel.recv_exit_status()
client.close()
sys.exit(status)
