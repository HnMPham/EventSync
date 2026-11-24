#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 1 || ! "$1" =~ ^[a-zA-Z0-9._%+@-]+$ || "$1" != *"@"* ]]; then
 echo 'Usage: bash promote-admin.sh user@example.com' >&2; exit 2
fi
cd "$HOME/eventsync-backend"
email="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
hex="$(printf '%s' "$email" | od -An -tx1 | tr -d ' \n')"
docker compose -f compose.yaml -f compose.caddy.local.yaml exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root eventsync' <<SQL
UPDATE users SET system_admin=TRUE WHERE email=CONVERT(0x${hex} USING utf8mb4);
SELECT email,system_admin FROM users WHERE email=CONVERT(0x${hex} USING utf8mb4);
SQL
echo 'If no row was printed, register the account first. Log out and back in to show the admin tab.'
