#!/usr/bin/env bash
# Local helper (not used in CI): copies static assets into the standalone build and starts it on :3000
# with the dev .env. Logs to .next/standalone.log.
set -euo pipefail
pkill -f "next-server" 2>/dev/null || true; sleep 1
cd "$(dirname "$0")"
mkdir -p .next/standalone/apps/syed-ai/.next
cp -r .next/static .next/standalone/apps/syed-ai/.next/
cp -r public .next/standalone/apps/syed-ai/
set -a
# shellcheck disable=SC1091
. ./.env
set +a
export MEDIA_DIR="$PWD/media" DEV_ROUTES=1 TURNSTILE_REQUIRED="${TURNSTILE_REQUIRED:-false}" VERIFICATION_ENFORCEMENT="${VERIFICATION_ENFORCEMENT:-warn}" HOSTNAME=127.0.0.1 PORT="${PORT:-3000}"
cd .next/standalone/apps/syed-ai
setsid nohup node server.js > ../../../standalone.log 2>&1 < /dev/null &
echo "standalone started pid $! (log: apps/syed-ai/.next/standalone.log)"
