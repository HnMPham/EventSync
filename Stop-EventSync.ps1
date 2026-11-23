$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path '.env.local-demo')) { Write-Host 'No local demo configured.'; exit 0 }
docker compose --env-file .env.local-demo -p eventsync-class-demo -f compose.yaml -f compose.caddy.local.yaml down
if ($LASTEXITCODE -ne 0) { throw 'Could not stop demo containers.' }
Write-Host 'Demo stopped. Database preserved.'
