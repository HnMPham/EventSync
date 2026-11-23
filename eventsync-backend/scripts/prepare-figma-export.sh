#!/usr/bin/env bash
# Installs the verified EventSync API client and React helper files into an exported Make project.
# Does NOT guess which existing button/component should call each backend operation.
set -euo pipefail
if [[ $# -ne 1 ]]; then echo 'Usage: bash scripts/prepare-figma-export.sh /path/to/exported-figma-project' >&2; exit 2; fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$(cd "$1" && pwd)"
[[ -f "$FRONTEND/package.json" ]] || { echo 'No package.json found; extract the Figma Make code export first' >&2; exit 1; }
mkdir -p "$FRONTEND/src/lib" "$FRONTEND/src/hooks" "$FRONTEND/src/components"
for file in \
  src/lib/eventsync-api.ts \
  src/lib/api.ts \
  src/hooks/useEventSyncSession.ts \
  src/components/OutlookCallback.tsx; do
  if [[ -e "$FRONTEND/$file" ]]; then
    echo "Existing $file not overwritten. Compare it with figma-bridge/$file" >&2
  else
    cp "$HERE/figma-bridge/$file" "$FRONTEND/$file"
    echo "Added $file"
  fi
done
cat <<'TEXT'
Adapter files copied. Next, wire your existing React buttons and screens:
  - import { api } from './lib/api' in appropriate components
  - replace demo data and localStorage with api methods
  - route /outlook/callback to <OutlookCallback />
  - use VITE_EVENTSYNC_API_BASE_URL=/api for same-origin deployment
See docs/figma-make-integration.md for the complete mapping.
TEXT
