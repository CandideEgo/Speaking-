# Reverse SSH tunnel keepalive: cloud Docker gateway 172.19.0.1:7897 ->
# local Clash proxy 127.0.0.1:7897.
#
# The cloud celery/backend containers route YouTube traffic through this
# proxy (HTTP_PROXY=http://172.19.0.1:7897), so when this tunnel is down the
# pipeline cannot download/probe YouTube videos. Registered as a NSSM Windows
# service ("SeeWordProxyTunnel") so it stays up across reboots and crashes
# (video-pipeline-deep-dive-2026-08 P3).
#
# Cloud sshd must have GatewayPorts clientspecified (already set) so the
# explicit bind to 172.19.0.1 opens only on the Docker bridge, not on the
# public interface.
#
# Uses the IP directly (not the `seeword` alias). NSSM's SYSTEM account has no
# per-user ssh config or agent, so the key lives in a machine-wide location:
# $env:SEEWORD_SSH_KEY, else %ProgramData%\seeword\id_ed25519. ServerAlive*
# detects dead connections; ExitOnForwardFailure aborts (and retries) when the
# remote port is taken.

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
    Write-Output "[$ts][tunnel] starting ssh -R 172.19.0.1:7897:127.0.0.1:7897 admin@47.122.127.105"
    ssh -N `
        -R 172.19.0.1:7897:127.0.0.1:7897 `
        -i $keyPath `
        -o ServerAliveInterval=15 `
        -o ServerAliveCountMax=3 `
        -o ExitOnForwardFailure=yes `
        -o StrictHostKeyChecking=accept-new `
        admin@47.122.127.105
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Output "[$ts][tunnel] ssh exited (code $LASTEXITCODE); reconnecting in 5s"
    Start-Sleep -Seconds 5
}
