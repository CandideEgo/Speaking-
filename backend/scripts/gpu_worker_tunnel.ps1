# SSH tunnel keepalive: local 16379 -> cloud Redis 127.0.0.1:6379.
#
# Reconnects automatically when ssh exits. Registered as a NSSM Windows
# service ("SeeWord GPU Tunnel") so the tunnel stays up across reboots and
# crashes (DEV-FLOW 2026-07 Phase B3).
#
# Requires a passwordless SSH key for the `seeword` host alias
# (ssh-keygen + ssh-copy-id / authorized_keys). See GPU-WORKER-SETUP.md.

$ErrorActionPreference = "Continue"

while ($true) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Output "[$ts][tunnel] starting ssh -L 16379:127.0.0.1:6379 seeword"
    # -N: no remote command. ExitOnForwardFailure: exit (so we retry) if the
    # local port is already taken. ServerAlive*: detect a dead connection.
    ssh -N `
        -L 16379:127.0.0.1:6379 `
        -o ServerAliveInterval=15 `
        -o ServerAliveCountMax=3 `
        -o ExitOnForwardFailure=yes `
        seeword
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Output "[$ts][tunnel] ssh exited (code $LASTEXITCODE); reconnecting in 5s"
    Start-Sleep -Seconds 5
}
