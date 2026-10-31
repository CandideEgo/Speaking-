# Loads .env.gpu-worker into the process environment and starts the GPU worker.
#
# This is the gpu-worker/ component's entry point (see ../README.md). Registered
# as a NSSM Windows service ("SeeWord GPU Worker") so transcription runs across
# reboots and crashes; NSSM restarts the script on exit, and Celery --pool=solo
# handles one job at a time.

$ErrorActionPreference = "Stop"

# gpu-worker/ is the parent of this script's directory (scripts/).
$rootDir = Split-Path $PSScriptRoot -Parent
Set-Location $rootDir

$envFile = Join-Path $rootDir ".env.gpu-worker"
if (-not (Test-Path $envFile)) {
    Write-Error ".env.gpu-worker not found at $envFile. Copy .env.gpu-worker.example and fill the secrets."
    exit 1
}

# Parse the .env file (key=value, skip blanks and # comments, split on first '=').
# These become process env vars; the worker's Settings reads them (env vars win
# over the .env.gpu-worker file, which it also reads from the cwd above).
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -le 0) { return }
    $k = $line.Substring(0, $idx).Trim()
    $v = $line.Substring($idx + 1).Trim().Trim('"')
    Set-Item -Path ("Env:" + $k) -Value $v
}

$python = Join-Path $rootDir ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Error "venv python not found at $python. Create it: python -m venv .venv && .venv\Scripts\pip install -r requirements.txt"
    exit 1
}

& $python "scripts\start_gpu_worker.py"
