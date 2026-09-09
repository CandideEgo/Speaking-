# Loads .env into the process environment and starts the Celery worker.
#
# Registered as a NSSM Windows service ("SeeWordCelery") for the same reason
# run_gpu_worker.ps1 is: a worker started from an interactive shell dies with
# that shell, and the batch pipeline needs one that survives (2026-09-08: every
# nohup / Start-Process attempt was reaped mid-job, leaving videos stuck in
# 'processing'). NSSM restarts the script on exit; --pool=solo runs one job at
# a time, which is what the single GPU can handle anyway.

$ErrorActionPreference = "Stop"

# backend/ is the parent of this script's directory (scripts/).
$backendDir = Split-Path $PSScriptRoot -Parent
Set-Location $backendDir

$envFile = Join-Path $backendDir ".env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env not found at $envFile."
    exit 1
}

# Parse the .env file (key=value, skip blanks and # comments, split on first '=').
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -le 0) { return }
    $k = $line.Substring(0, $idx).Trim()
    $v = $line.Substring($idx + 1).Trim().Trim('"')
    Set-Item -Path ("Env:" + $k) -Value $v
}

# UTF-8 is mandatory on Windows: without it starlette's Config chokes on the
# non-ASCII comments in .env with a GBK UnicodeDecodeError.
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONPATH = "."

# The service runs as SYSTEM, whose PATH does not include the per-user Python
# install — spell the interpreter out (same reason .env.gpu-worker pins HF_HOME).
$python = "C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe"
if (-not (Test-Path $python)) {
    Write-Error "python not found at $python"
    exit 1
}

& $python -m celery -A app.tasks.celery_app worker --loglevel=info --pool=solo
