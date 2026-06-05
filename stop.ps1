# stop.ps1 — Stop all Speaking services on Windows

Write-Host "=== Speaking - stopping ===" -ForegroundColor Cyan

# Kill uvicorn, celery, next dev
$stopped = @()

Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match "uvicorn app.main:app"
} | Stop-Process -Force -ErrorAction SilentlyContinue
if ($?) { $stopped += "backend" }

Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match "celery -A app.tasks.celery_app"
} | Stop-Process -Force -ErrorAction SilentlyContinue
if ($?) { $stopped += "celery" }

# Frontend: kill node processes running next dev
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match "next dev"
} | Stop-Process -Force -ErrorAction SilentlyContinue
if ($?) { $stopped += "frontend" }

if ($stopped.Count -gt 0) {
    Write-Host "  Stopped: $($stopped -join ', ')" -ForegroundColor Green
} else {
    # Fallback: try by port
    Write-Host "  No named processes found, trying by port..." -ForegroundColor Yellow
    $ports = @(8000, 3000)
    foreach ($port in $ports) {
        $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($conn) {
            $pid = $conn[0].OwningProcess
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Write-Host "  Killed process on port $port (PID $pid)" -ForegroundColor Green
        }
    }
}

# Optionally stop infra
if ($args -contains "--infra") {
    $ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    docker compose -f (Join-Path $ProjectDir "docker-compose.dev.yml") down
    Write-Host "[infra] stopped" -ForegroundColor Green
}

Write-Host "=== Done ===" -ForegroundColor Cyan
