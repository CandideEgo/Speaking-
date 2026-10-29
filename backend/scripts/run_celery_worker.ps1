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
# install, so resolve an interpreter explicitly. Order: $env:SEEWORD_PYTHON
# (absolute path override) → this checkout's backend/.venv → python.exe on PATH.
$python = $env:SEEWORD_PYTHON
if (-not $python) {
    $venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) { $python = $venvPython }
}
if (-not $python) {
    $onPath = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($onPath) { $python = $onPath.Source }
}
if (-not $python -or -not (Test-Path $python)) {
    Write-Error "python not found. Set SEEWORD_PYTHON to an absolute path, create backend\.venv, or put python.exe on PATH."
    exit 1
}

# -Q celery is load-bearing: without it Celery consumes every queue declared in
# celery_app.conf.task_queues, including transcription_gpu. This machine has no
# GPU path in the cloud worker, so it would steal transcription tasks away from
# the GPU worker and fall back to slow CPU Whisper.
& $python -m celery -A app.tasks.celery_app worker --queues=celery --loglevel=info --pool=solo
