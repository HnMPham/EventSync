#!/usr/bin/env bash
# Backs up the MySQL database while the application is running.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
chmod 700 backups
file="backups/eventsync-$(date -u +%Y%m%dT%H%M%SZ).sql"
umask 077
# mysql:8.4 contains mysqldump. Keep the password inside the container, not host args.
if docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump -u "$MYSQL_USER" --single-transaction --quick --routines --triggers "$MYSQL_DATABASE"' >"$file"; then
  chmod 600 "$file"
  echo "Database backup saved: $file"
  echo 'IMPORTANT: also back up .env securely; TOKEN_ENCRYPTION_KEY decrypts saved Microsoft tokens.'
else
  rm -f "$file"
  echo 'Backup failed; no file retained.' >&2
  exit 1
fi
