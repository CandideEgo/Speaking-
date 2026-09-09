# Brings up the yt-dlp POT toolchain: a proxy relay plus the bgutil POT provider.
#
# WHY THE RELAY EXISTS
# --------------------
# The bgutil POT plugin forwards yt-dlp's own --proxy value into the provider
# container's /get_pot request body (see getpot_bgutil_http.py: 'proxy':
# request.request_proxy). Our upstream proxy listens on 127.0.0.1:7897 only, so
# the container receives "127.0.0.1:7897", resolves it to *itself*, and every POT
# fetch dies on ECONNREFUSED. Without a PO Token YouTube forces SABR streaming,
# yt-dlp skips every format, and downloads spin until the 600s timeout.
#
# So the proxy address has to be one string that resolves correctly BOTH on the
# host and inside the container. socat gives us that: it publishes on all host
# interfaces and forwards to host.docker.internal:7897.
#
# WHY THIS SCRIPT INSTEAD OF A HARDCODED IP
# -----------------------------------------
# The address is the host's LAN IP, which is DHCP-assigned and changes when the
# machine moves networks. Hardcoding it in .env silently breaks the pipeline
# after any network change. This script discovers the current IP and writes it
# into backend/.env, so recovery is one command instead of a debugging session.
#
# Usage:  pwsh -File scripts/setup_pot_proxy.ps1
# Run it after a network change, a Docker restart, or a reboot.

$ErrorActionPreference = "Stop"

$RELAY_PORT = 7898
$UPSTREAM_PORT = 7897
$POT_PORT = 4416

$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$envFile = Join-Path $repoRoot "backend\.env"

# --- 1. find the host's current LAN IP -------------------------------------
# Pick the IP of the interface holding the default route: Hyper-V / WSL / vEthernet
# adapters also have IPv4 addresses, and those are not reachable from containers.
$defaultRoute = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric |
    Select-Object -First 1
if (-not $defaultRoute) {
    Write-Error "No default route found — is the machine online?"
    exit 1
}
$hostIp = (Get-NetIPAddress -InterfaceIndex $defaultRoute.ifIndex -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -ne "127.0.0.1" } |
    Select-Object -First 1).IPAddress
if (-not $hostIp) {
    Write-Error "Could not determine the LAN IP for interface $($defaultRoute.ifIndex)."
    exit 1
}
Write-Host "Host LAN IP: $hostIp"

$proxyUrl = "http://${hostIp}:${RELAY_PORT}"

# --- 2. (re)start the socat relay ------------------------------------------
docker rm -f proxy-relay 2>$null | Out-Null
docker run -d --name proxy-relay --restart unless-stopped `
    -p "${RELAY_PORT}:${RELAY_PORT}" `
    alpine/socat:latest `
    "TCP-LISTEN:${RELAY_PORT},fork,reuseaddr" "TCP:host.docker.internal:${UPSTREAM_PORT}" | Out-Null
Start-Sleep -Seconds 3

# --- 3. (re)start the POT provider ----------------------------------------
# Its own env proxy is only used for the very first token; every later request
# carries the proxy forwarded by the plugin. Both point at the relay.
docker rm -f bgutil-provider 2>$null | Out-Null
docker run -d --name bgutil-provider --restart unless-stopped --init `
    -p "127.0.0.1:${POT_PORT}:${POT_PORT}" `
    -e HTTP_PROXY="$proxyUrl" -e HTTPS_PROXY="$proxyUrl" `
    -e http_proxy="$proxyUrl" -e https_proxy="$proxyUrl" `
    brainicism/bgutil-ytdlp-pot-provider | Out-Null
Start-Sleep -Seconds 5

# --- 4. verify the relay from BOTH sides ----------------------------------
# Checking only one side is how the 2026-09-08 false positive happened: the
# provider generated a token at startup from its env, then failed on every
# subsequent request with the plugin-forwarded address.
$hostOk = $false
try {
    $r = Invoke-WebRequest -Uri "https://www.youtube.com" -Proxy $proxyUrl -TimeoutSec 12 -UseBasicParsing
    $hostOk = ($r.StatusCode -eq 200)
} catch { }
Write-Host "  relay reachable from host:      $hostOk"

$containerCode = docker run --rm --net="container:bgutil-provider" curlimages/curl:latest `
    -s --max-time 12 -x $proxyUrl -o /dev/null -w "%{http_code}" https://www.youtube.com/ 2>$null
$containerOk = ($containerCode -eq "200")
Write-Host "  relay reachable from container: $containerOk (HTTP $containerCode)"

try {
    $ping = Invoke-RestMethod -Uri "http://127.0.0.1:${POT_PORT}/ping" -TimeoutSec 8
    Write-Host "  POT provider: v$($ping.version) up $([int]$ping.server_uptime)s"
} catch {
    Write-Error "POT provider /ping failed: $_"
    exit 1
}

if (-not ($hostOk -and $containerOk)) {
    Write-Error "Relay is not reachable from both sides — the pipeline will time out. Check that the upstream proxy on 127.0.0.1:$UPSTREAM_PORT is running."
    exit 1
}

# --- 5. write the address into backend/.env -------------------------------
# UTF-8 without BOM, explicitly: PowerShell 5's Set-Content defaults to the ANSI
# codepage (GBK here), which mangles the Chinese comments in these files into
# invalid byte sequences — python-dotenv then dies with UnicodeDecodeError and
# every worker fails to start (hit this on 2026-09-09). Get-Content -Raw reads
# UTF-8 fine; only the write side needs pinning.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Set-EnvProxy {
    param([string]$Path, [string]$Url)
    $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    if ($text -notmatch "(?m)^HTTP_PROXY=(.*?)(\r?\n|$)") { return $null }
    $old = $Matches[1]
    if ($old -ne $Url) {
        # backtick-escape $1 so PowerShell does not expand it as a variable
        $text = $text -replace "(?m)^HTTP_PROXY=.*?(\r?\n|`$)", "HTTP_PROXY=$Url`$1"
        [System.IO.File]::WriteAllText($Path, $text, $utf8NoBom)
    }
    return $old
}

$old = Set-EnvProxy -Path $envFile -Url $proxyUrl
if ($null -eq $old) {
    Write-Error "No HTTP_PROXY line in $envFile — add one manually."
    exit 1
} elseif ($old -eq $proxyUrl) {
    Write-Host "backend/.env already has HTTP_PROXY=$proxyUrl"
} else {
    Write-Host "backend/.env HTTP_PROXY: $old -> $proxyUrl"
}
# .env.gpu-worker carries its own copy for the NSSM-hosted GPU worker.
$gpuEnv = Join-Path $repoRoot "backend\.env.gpu-worker"
if (Test-Path $gpuEnv) {
    $oldGpu = Set-EnvProxy -Path $gpuEnv -Url $proxyUrl
    if ($null -ne $oldGpu -and $oldGpu -ne $proxyUrl) {
        Write-Host "backend/.env.gpu-worker HTTP_PROXY: $oldGpu -> $proxyUrl"
    } else {
        Write-Host "backend/.env.gpu-worker already has HTTP_PROXY=$proxyUrl"
    }
}

# Fail loudly if the write broke the encoding — a mangled .env stops every worker.
foreach ($f in @($envFile, $gpuEnv)) {
    if (-not (Test-Path $f)) { continue }
    try {
        $bytes = [System.IO.File]::ReadAllBytes($f)
        [System.Text.Encoding]::GetEncoding("utf-8", [System.Text.EncoderFallback]::ExceptionFallback,
            [System.Text.DecoderFallback]::ExceptionFallback).GetString($bytes) | Out-Null
    } catch {
        Write-Error "$f is no longer valid UTF-8 after the rewrite — restore it before starting the workers."
        exit 1
    }
}

Write-Host ""
Write-Host "Done. Restart the workers so they pick up the new address:"
Write-Host "  Restart-Service SeeWordCelery, SeeWordGpuWorker"
