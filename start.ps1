# start.ps1 — Start all Speaking services on Windows
# Prerequisites: Python 3.10+, Node.js 20+, FFmpeg in PATH, Docker Desktop running

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ProjectDir "backend"
$FrontendDir = Join-Path $ProjectDir "frontend"
$LogsDir = Join-Path $ProjectDir "logs"

# Resolve venv Python
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    Write-Host "ERROR: venv not found at $VenvPython" -ForegroundColor Red
    Write-Host "Run: cd backend && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

# Create logs directory
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

function Kill-Port($port) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $conn) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
    if ($conn) { Start-Sleep -Milliseconds 500 }
}

Write-Host "=== Speaking - starting all services ===" -ForegroundColor Cyan

# 1. Infra (DB + Redis via Docker)
Write-Host "[infra] starting..." -ForegroundColor Yellow

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: docker not found. Is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

# Try starting existing containers first, fall back to compose up
$existing = docker ps -a --filter "name=speaking-db-1" --filter "name=speaking-redis-1" --format "{{.Names}}" 2>$null
if ($existing -match "speaking-db-1" -and $existing -match "speaking-redis-1") {
    docker start speaking-db-1 speaking-redis-1 2>$null
    if ($LASTEXITCODE -ne 0) {
        docker compose -f (Join-Path $ProjectDir "docker-compose.dev.yml") up -d
    }
} else {
    docker compose -f (Join-Path $ProjectDir "docker-compose.dev.yml") up -d
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: failed to start infra containers. Is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

# 2. Database migrations
Write-Host "[db] running migrations..." -ForegroundColor Yellow
Push-Location $BackendDir
try {
    $env:PYTHONPATH = $BackendDir
    & $VenvPython -m alembic upgrade head
} finally {
    Pop-Location
}

# 3. Backend (uvicorn)
Write-Host "[backend] starting on :8000..." -ForegroundColor Yellow
Kill-Port 8000
$backendLog = Join-Path $LogsDir "backend.log"
$backendErr = Join-Path $LogsDir "backend_err.log"
Start-Process -FilePath $VenvPython `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload" `
    -WorkingDirectory $BackendDir `
    -RedirectStandardOutput $backendLog `
    -RedirectStandardError $backendErr `
    -NoNewWindow
Write-Host "  logs -> $backendLog"

# 4. Celery (--pool=solo for Windows compatibility)
Write-Host "[celery] starting worker (pool=solo)..." -ForegroundColor Yellow
$celeryLog = Join-Path $LogsDir "celery.log"
$celeryErr = Join-Path $LogsDir "celery_err.log"
Start-Process -FilePath $VenvPython `
    -ArgumentList "-m", "celery", "-A", "app.tasks.celery_app", "worker", "--pool=solo", "--loglevel=info" `
    -WorkingDirectory $BackendDir `
    -RedirectStandardOutput $celeryLog `
    -RedirectStandardError $celeryErr `
    -NoNewWindow
Write-Host "  logs -> $celeryLog"

# 5. Frontend
Write-Host "[frontend] cleaning .next cache..." -ForegroundColor Yellow
$nextCache = Join-Path $FrontendDir ".next"
if (Test-Path $nextCache) {
    Remove-Item -Recurse -Force $nextCache
}

Kill-Port 3000
Write-Host "[frontend] starting on :3000..." -ForegroundColor Yellow
$frontendLog = Join-Path $LogsDir "frontend.log"
$frontendErr = Join-Path $LogsDir "frontend_err.log"
Start-Process -FilePath "cmd" `
    -ArgumentList "/c", "npm", "run", "dev" `
    -WorkingDirectory $FrontendDir `
    -RedirectStandardOutput $frontendLog `
    -RedirectStandardError $frontendErr `
    -NoNewWindow
Write-Host "  logs -> $frontendLog"

Write-Host ""
Write-Host "=== All services started ===" -ForegroundColor Green
Write-Host "  Backend  -> http://localhost:8000/docs"
Write-Host "  Frontend -> http://localhost:3000"
Write-Host "  Logs     -> $LogsDir\"
Write-Host ""
Write-Host "Containers: docker ps --filter name=speaking"
