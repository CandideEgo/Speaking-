# Start the local SeeWord checkout. No deployment or production connections.
$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
Set-Location -LiteralPath $repoRoot
$python = Join-Path $repoRoot 'backend\.venv\Scripts\python.exe'
$node = (Get-Command node.exe).Source
$logDir = Join-Path $repoRoot 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

function Test-LocalHealth([string]$Url) {
  try { return (Invoke-WebRequest $Url -TimeoutSec 3 -UseBasicParsing).StatusCode -eq 200 } catch { return $false }
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Start-Process -FilePath 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -WindowStyle Hidden
  $dockerReady = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 1
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break }
  }
  if (-not $dockerReady) { throw 'Docker Desktop is not ready. Start Docker Desktop, then run this script again.' }
}
docker start speaking-db-1 speaking-redis-1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Local DB/Redis containers were not started. Check docker-compose.dev.yml.' }

$env:PYTHONUTF8 = '1'
$env:ENV = 'development'
$env:DATABASE_URL = 'postgresql+asyncpg://seeword:seeword_dev@127.0.0.1:5432/seeword'
if (-not (Test-LocalHealth 'http://127.0.0.1:8000/health')) {
  Push-Location (Join-Path $repoRoot 'backend')
  try {
    & $python -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Local database migration failed.' }
  } finally { Pop-Location }
  Start-Process -FilePath $python -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000','--reload','--timeout-keep-alive','120' -WorkingDirectory (Join-Path $repoRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'redesign-backend.out.log') -RedirectStandardError (Join-Path $logDir 'redesign-backend.err.log')
}
if (-not (Test-LocalHealth 'http://localhost:3000/login')) {
  Start-Process -FilePath $node -ArgumentList 'node_modules/next/dist/bin/next','dev','--port','3000' -WorkingDirectory (Join-Path $repoRoot 'frontend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'redesign-frontend.out.log') -RedirectStandardError (Join-Path $logDir 'redesign-frontend.err.log')
}
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  if ((Test-LocalHealth 'http://127.0.0.1:8000/health') -and (Test-LocalHealth 'http://localhost:3000/login')) {
    Write-Host 'SeeWord ready: http://localhost:3000'
    exit 0
  }
  Start-Sleep -Seconds 1
}
throw 'Local services did not become healthy. Inspect logs/redesign-*.log.'
