#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
[[ -f .env.local-demo ]] || { echo 'No local demo has been configured in this folder.'; exit 0; }
docker compose --env-file .env.local-demo -p eventsync-class-demo -f compose.yaml -f compose.caddy.local.yaml down
echo 'Stopped. Your demo database volume has been preserved.'
