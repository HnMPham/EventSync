#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
PROJECT=eventsync-class-demo
ENV_FILE=.env.local-demo
COMPOSE=(docker compose --env-file "$ENV_FILE" -p "$PROJECT" -f compose.yaml -f compose.caddy.local.yaml)
fail() { echo "ERROR: $*" >&2; exit 1; }
command -v docker >/dev/null || fail 'Docker is required. Install Docker Engine + Compose plugin (or Docker Desktop).'
docker info >/dev/null 2>&1 || fail 'Docker is not running or your user lacks Docker access.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is required.'
[[ -f compose.yaml && -f compose.caddy.local.yaml && -f figma-source/package.json ]] || fail 'Run this launcher from an extracted EventSync source folder.'
if [[ ! -f "$ENV_FILE" ]]; then
  command -v openssl >/dev/null || fail 'OpenSSL is needed to generate private local database credentials.'
  umask 077
  cat > "$ENV_FILE" <<VARS
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 24)
DB_PASSWORD=$(openssl rand -hex 24)
TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
MYSQL_VOLUME_NAME=eventsync_class_demo_mysql_data
ALLOWED_ORIGINS=http://localhost:8090
FRONTEND_URL=http://localhost:8090
MS_TENANT=common
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_REDIRECT_URI=http://localhost:8090/api/outlook/callback
VARS
  echo 'Created private .env.local-demo (no Microsoft credentials required).'
fi
# A local demo must never accidentally attach to the standard production data volume.
if ! grep -q '^MYSQL_VOLUME_NAME=eventsync_class_demo_mysql_data$' "$ENV_FILE"; then
  fail 'For safety, .env.local-demo must set MYSQL_VOLUME_NAME=eventsync_class_demo_mysql_data.'
fi
mkdir -p figma-dist
if [[ ! -f figma-dist/index.html ]]; then
  echo 'Building React frontend with a temporary Node.js Docker container...'
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
    --mount "type=bind,src=$PWD/figma-source,dst=/app" \
    --mount "type=bind,src=$PWD/figma-dist,dst=/out" \
    -w /app node:22-alpine sh -ec 'npm install --no-audit --no-fund; npm run build; cp -R dist/. /out/'
fi
[[ -f figma-dist/index.html ]] || fail 'Frontend build did not produce figma-dist/index.html.'
echo 'Starting EventSync locally (database is separate from any Proxmox deployment)...'
"${COMPOSE[@]}" up -d --build
URL=http://localhost:8090
printf '\nOpen EventSync: %s\n' "$URL"
if command -v xdg-open >/dev/null; then (xdg-open "$URL" >/dev/null 2>&1 || true) & fi
echo 'First launch can take longer while Docker downloads and builds the app.'
echo 'To stop, run ./Stop-EventSync.sh (your local demo database will be kept).'
