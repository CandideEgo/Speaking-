param([switch]$Stop)
$ErrorActionPreference = 'Stop'
$smokeRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path

# Resolve tools from PATH first, then their standard install locations — no
# user-specific absolute paths.
function Resolve-Executable {
    param([string]$Name, [string[]]$Fallbacks, [string]$Hint)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($candidate in $Fallbacks) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    throw "Unable to locate $Name. $Hint"
}

$dockerFallbacks = @()
if ($env:ProgramFiles) { $dockerFallbacks += (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe') }
$dockerExecutable = Resolve-Executable 'docker' $dockerFallbacks 'Install Docker Desktop or put docker.exe on PATH.'
$composeFile = Join-Path $smokeRoot 'docker-compose.smoke.yml'
if ($Stop) {
    & $dockerExecutable compose -f $composeFile down --volumes
    if ($LASTEXITCODE -ne 0) { throw 'Unable to stop the isolated smoke environment' }
    exit
}
$certificatePath = Join-Path $smokeRoot '.production-smoke/ssl'
New-Item -ItemType Directory -Force -Path $certificatePath | Out-Null
$opensslFallbacks = @()
if ($env:ProgramFiles) { $opensslFallbacks += (Join-Path $env:ProgramFiles 'Git\usr\bin\openssl.exe') }
if (${env:ProgramFiles(x86)}) { $opensslFallbacks += (Join-Path ${env:ProgramFiles(x86)} 'Git\usr\bin\openssl.exe') }
$opensslExecutable = Resolve-Executable 'openssl' $opensslFallbacks 'Install Git for Windows (which ships openssl) or put openssl on PATH.'
& $opensslExecutable req -x509 -nodes -newkey rsa:2048 -days 2 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' -keyout (Join-Path $certificatePath 'privkey.pem') -out (Join-Path $certificatePath 'fullchain.pem') 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Unable to create the localhost test certificate' }
& $dockerExecutable compose -f $composeFile up --build --detach --wait --wait-timeout 180 nginx
if ($LASTEXITCODE -ne 0) { throw 'Smoke services failed to start' }
& $dockerExecutable compose -f $composeFile exec -T backend python scripts/seed_e2e.py
if ($LASTEXITCODE -ne 0) { throw 'Smoke database seed failed' }
# A new named volume starts as root; grant only this dedicated media directory to the app user.
& $dockerExecutable compose -f $composeFile exec -T --user root backend chown 1000:1000 /app/media
if ($LASTEXITCODE -ne 0) { throw 'Unable to initialize the isolated media volume' }
& $dockerExecutable compose -f $composeFile exec -T backend python /smoke/seed.py
if ($LASTEXITCODE -ne 0) { throw 'Playable test media seed failed' }
& $dockerExecutable compose -f $composeFile exec -T nginx nginx -t
if ($LASTEXITCODE -ne 0) { throw 'Smoke nginx configuration failed validation' }
& $dockerExecutable compose -f $composeFile exec -T nginx nginx -s reload
if ($LASTEXITCODE -ne 0) { throw 'Unable to reload smoke nginx after a container update' }
Write-Host 'Ready: https://localhost:18443. Run Playwright with playwright.production.config.ts; use -Stop after verification.'
