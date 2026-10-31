# GPU worker SSH tunnel keepalive: local 16379 -> cloud Redis 127.0.0.1:6379.
#
# Part of the standalone gpu-worker/ component (see ../README.md). The worker's
# REDIS_URL points at 127.0.0.1:16379 on this machine; this tunnel forwards that
# port to the cloud Redis, so the worker can consume the transcription_gpu queue
# and write the worker:gpu:heartbeat key without exposing Redis publicly.
#
# Reconnects automatically when ssh exits. Registered as a NSSM Windows
# service ("SeeWord GPU Tunnel") so the tunnel stays up across reboots and
# crashes.
#
# Requires a passwordless SSH key for the cloud host (ssh-keygen +
# ssh-copy-id / authorized_keys). The key lives in a machine-wide location
# ($env:SEEWORD_SSH_KEY, else %ProgramData%\seeword\id_ed25519) because the
# NSSM SYSTEM account has no user profile to resolve an SSH config/agent from.

$ErrorActionPreference = "Continue"

$keyPath = if ($env:SEEWORD_SSH_KEY) {
    $env:SEEWORD_SSH_KEY
} else {
    Join-Path $env:ProgramData "seeword\id_ed25519"
}
if (-not (Test-Path $keyPath)) {
    Write-Error "SSH key not found at $keyPath. Set SEEWORD_SSH_KEY or place the key at %ProgramData%\seeword\id_ed25519."
    exit 1
}

while ($true) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Output "[$ts][tunnel] starting ssh -L 16379:127.0.0.1:6379 admin@47.122.109.52"
    # -N: no remote command. ExitOnForwardFailure: exit (so we retry) if the
    # local port is already taken. ServerAlive*: detect a dead connection.
    # Use IP directly (not SSH alias) so NSSM SYSTEM account can resolve it.
    ssh -N `
        -L 16379:127.0.0.1:6379 `
        -i $keyPath `
        -o ServerAliveInterval=15 `
        -o ServerAliveCountMax=3 `
        -o ExitOnForwardFailure=yes `
        -o StrictHostKeyChecking=accept-new `
        admin@47.122.109.52
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Output "[$ts][tunnel] ssh exited (code $LASTEXITCODE); reconnecting in 5s"
    Start-Sleep -Seconds 5
}
