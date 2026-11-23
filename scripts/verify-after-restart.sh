#!/usr/bin/env bash
# Development/test ONLY. This restarts the database and API (brief downtime).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/verify-persistence.py create
echo 'Restarting the MySQL container to prove data is on its persistent Docker volume.'
docker compose restart mysql
for i in $(seq 1 60); do
  if docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -h 127.0.0.1 -u "$MYSQL_USER" "$MYSQL_DATABASE" -e "SELECT 1" >/dev/null 2>&1'; then break; fi
  sleep 2
done
docker compose restart api
for i in $(seq 1 60); do
  if curl -fsS http://localhost:8080/api/health >/dev/null; then break; fi
  sleep 2
done
python3 scripts/verify-persistence.py verify
