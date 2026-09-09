# Runs the catalog batch driver (tmp/batch_process.py) under NSSM.
#
# Same reason run_celery_worker.ps1 exists: a driver started from an interactive
# shell gets reaped when that shell's command returns, which on 2026-09-08 left
# the queue half-consumed with items stranded in 'processing'. NSSM keeps it up.
#
# The driver is one-shot by design — it exits when the queue is drained. NSSM is
# configured with AppExit Default Exit so a clean finish does NOT get restarted.

$ErrorActionPreference = "Stop"

$backendDir = Split-Path $PSScriptRoot -Parent
Set-Location $backendDir

$envFile = Join-Path $backendDir ".env"
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -le 0) { return }
    $k = $line.Substring(0, $idx).Trim()
    $v = $line.Substring($idx + 1).Trim().Trim('"')
    Set-Item -Path ("Env:" + $k) -Value $v
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONPATH = "."

# SYSTEM's PATH lacks the per-user Python install — spell it out.
$python = "C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe"

& $python "tmp\batch_process.py"
