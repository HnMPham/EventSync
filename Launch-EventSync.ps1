$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install Docker Desktop and start it before launching EventSync.' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running. Start Docker Desktop, then retry.' }
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is required.' }
if (-not (Test-Path 'compose.yaml') -or -not (Test-Path 'figma-source/package.json')) { throw 'Place these launcher files inside the extracted EventSync source folder.' }
$envFile = '.env.local-demo'
if (-not (Test-Path $envFile)) {
    function New-HexSecret([int]$length) {
        $bytes = New-Object byte[] $length
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
    }
    $keyBytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($keyBytes)
    $key = [Convert]::ToBase64String($keyBytes)
    $rootPw = New-HexSecret 24
    $appPw = New-HexSecret 24
    $data = @"
MYSQL_ROOT_PASSWORD=$rootPw
DB_PASSWORD=$appPw
TOKEN_ENCRYPTION_KEY=$key
MYSQL_VOLUME_NAME=eventsync_class_demo_mysql_data
ALLOWED_ORIGINS=http://localhost:8090
FRONTEND_URL=http://localhost:8090
MS_TENANT=common
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_REDIRECT_URI=http://localhost:8090/api/outlook/callback
"@
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot $envFile), $data + "`n", [Text.UTF8Encoding]::new($false))
    Write-Host 'Generated private local-demo configuration.'
}
if (-not (Select-String -Path $envFile -Pattern '^MYSQL_VOLUME_NAME=eventsync_class_demo_mysql_data$' -Quiet)) {
    throw 'For safety, .env.local-demo must use MYSQL_VOLUME_NAME=eventsync_class_demo_mysql_data.'
}
if (-not (Test-Path 'figma-dist')) { New-Item -ItemType Directory -Path 'figma-dist' | Out-Null }
if (-not (Test-Path 'figma-dist/index.html')) {
    Write-Host 'Building React frontend with a temporary Node.js Docker container...'
    $src = (Resolve-Path 'figma-source').Path
    $dest = (Resolve-Path 'figma-dist').Path
    docker run --rm --mount "type=bind,src=$src,dst=/app" --mount "type=bind,src=$dest,dst=/out" -w /app node:22-alpine sh -ec 'npm install --no-audit --no-fund; npm run build; cp -R dist/. /out/'
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed. See error above.' }
}
if (-not (Test-Path 'figma-dist/index.html')) { throw 'Frontend build did not produce index.html.' }
Write-Host 'Starting local EventSync...'
docker compose --env-file $envFile -p eventsync-class-demo -f compose.yaml -f compose.caddy.local.yaml up -d --build
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose startup failed. Review errors above.' }
Start-Process 'http://localhost:8090'
Write-Host 'EventSync: http://localhost:8090'
Write-Host 'First run downloads images and builds Java. Run Stop-EventSync.bat when finished.'
