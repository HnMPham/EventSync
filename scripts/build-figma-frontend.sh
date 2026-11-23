#!/usr/bin/env bash
# Build an EXPORTED Figma Make frontend and copy its static assets into Caddy's site root.
set -euo pipefail
if [[ $# -ne 1 ]]; then echo 'Usage: bash scripts/build-figma-frontend.sh /path/to/exported-figma-project' >&2; exit 2; fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$(cd "$1" && pwd)"
[[ -f "$FRONTEND/package.json" ]] || { echo 'No package.json found in the frontend folder' >&2; exit 1; }
if [[ -f "$FRONTEND/package-lock.json" ]]; then
  (cd "$FRONTEND" && npm ci)
else
  (cd "$FRONTEND" && npm install)
fi
(cd "$FRONTEND" && VITE_EVENTSYNC_API_BASE_URL=/api npm run build)
BUILD_DIR="$FRONTEND/dist"
[[ -f "$BUILD_DIR/index.html" ]] || { echo 'No dist/index.html; inspect the build output path' >&2; exit 1; }
mkdir -p "$HERE/figma-dist"
find "$HERE/figma-dist" -mindepth 1 -maxdepth 1 ! -name .gitkeep -exec rm -rf -- {} +
cp -a "$BUILD_DIR/." "$HERE/figma-dist/"
echo "Built Figma frontend into $HERE/figma-dist. Start the three Compose overlays to host it."
