# Reverse tunnel: this host (workstation / GPU box) -> production.
#
# The production backend cannot dial into a home NAT, so this host opens the SSH
# connection and asks the production sshd to listen on the compose network's
# gateway address:
#
#   prod backend --> <compose-gw-ip>:4400 --ssh -R--> 127.0.0.1:4400 (adapter)
#
# See ../README.md ("独立网关主机") for the matching production-side account and
# Match block. Reconnects forever.
#
# Runs without elevation under either NSSM or Task Scheduler:
#
#   schtasks /Create /TN SeeWordGatewayTunnel /SC ONLOGON /F `
#     /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\Fuwei\speaking\deploy\v2-gateway\gateway_tunnel.ps1"
#
# NSSM (needs admin, runs as SYSTEM — copy the key to a machine-wide path and set
# GATEWAY_TUNNEL_KEY / GATEWAY_KNOWN_HOSTS):
#
#   nssm install SeeWordGatewayTunnel powershell.exe -NoProfile -ExecutionPolicy Bypass -File <this file>

$ErrorActionPreference = "Continue"

$prodHost = if ($env:PROD_HOST) { $env:PROD_HOST } else { "47.122.109.52" }
$tunnelUser = if ($env:TUNNEL_USER) { $env:TUNNEL_USER } else { "gwtunnel" }
$port = if ($env:GATEWAY_ADAPTER_PORT) { $env:GATEWAY_ADAPTER_PORT } else { "4400" }
$listenIp = if ($env:GATEWAY_LISTEN_IP) { $env:GATEWAY_LISTEN_IP } else { "172.19.0.1" }

# ssh.exe: prefer the Windows-shipped one so a service has no PATH surprises.
$ssh = Join-Path $env:SystemRoot "System32\OpenSSH\ssh.exe"
if (-not (Test-Path $ssh)) { $ssh = "ssh" }

# Key / known_hosts: an interactive task finds them under the user profile; a
# SYSTEM service has no profile, so fall back to the machine-wide location.
$key = $env:GATEWAY_TUNNEL_KEY
if (-not $key) {
    foreach ($candidate in @(
        (Join-Path $env:USERPROFILE ".ssh\gw_tunnel_ed25519"),
        (Join-Path $env:ProgramData "seeword\gateway_tunnel_ed25519")
    )) {
        if ($candidate -and (Test-Path $candidate)) { $key = $candidate; break }
    }
}
if (-not $key -or -not (Test-Path $key)) {
    Write-Error "Tunnel key not found. Set GATEWAY_TUNNEL_KEY."
    exit 1
}

$knownHosts = $env:GATEWAY_KNOWN_HOSTS
if (-not $knownHosts) {
    $base = if ($env:USERPROFILE) { $env:USERPROFILE } else { $env:ProgramData }
    $knownHosts = Join-Path $base ".ssh\known_hosts"
}

$log = $env:GATEWAY_TUNNEL_LOG
if (-not $log -and $env:USERPROFILE) {
    $log = Join-Path $env:USERPROFILE ".seeword\gateway-tunnel.log"
}
function Write-Log([string]$message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')][tunnel] $message"
    Write-Output $line
    if ($log) {
        try {
            $dir = Split-Path -Parent $log
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
            Add-Content -Path $log -Value $line -Encoding utf8
        } catch { }
    }
}

while ($true) {
    Write-Log "starting $ssh -R ${listenIp}:${port}:127.0.0.1:${port} -> $tunnelUser@$prodHost"
    & $ssh -N `
        -R "${listenIp}:${port}:127.0.0.1:${port}" `
        -i $key `
        -o UserKnownHostsFile="$knownHosts" `
        -o ServerAliveInterval=15 `
        -o ServerAliveCountMax=3 `
        -o ExitOnForwardFailure=yes `
        -o StrictHostKeyChecking=accept-new `
        "$tunnelUser@$prodHost"
    Write-Log "ssh exited (code $LASTEXITCODE); reconnecting in 5s"
    Start-Sleep -Seconds 5
}
