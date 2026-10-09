#!/usr/bin/env bash
# DEPLOY-PIPE-1: image identity checks. Runs the image ONLY as a throwaway read-only shell (no app start, no env, no network use).
#   check-image-identity.sh <image-ref-by-digest> <expected-head-sha> <expected-media-count> <origin> <evidence-dir> [forbid-hosts,comma]
# Fails (non-zero) on: wrong revision label · MEDIA_IDENTITY line count != expected media count · any LFS pointer in public/ ·
# compiled-URL scan failure (see compiled-url-scan.mjs). Prints counts only; never prints env or secrets.
set -euo pipefail
IMG=$1 HEAD=$2 COUNT=$3 ORIGIN=${4:-} EV=$5 FORBID=${6:-}
# The expected origin is REQUIRED: an image built with no server URL must not pass (Auditor F-5).
if ! printf '%s' "$ORIGIN" | grep -Eq '^https://[A-Za-z0-9.-]+/?$'; then echo "FAIL: the expected origin (H2O_SERVER_URL) is empty or not https://..."; exit 1; fi
mkdir -p "$EV"
fail=0
# Every container below is a throwaway read-only shell: no network, read-only root, no capabilities (Auditor N-1).
SAFE=(--rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --entrypoint sh)
rev=$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMG")
if [ "$rev" = "$HEAD" ]; then echo "revision label OK"; else echo "FAIL: revision label '$rev' != '$HEAD'"; fail=1; fi
arch=$(docker inspect --format '{{.Os}}/{{.Architecture}}' "$IMG")
if [ "$arch" = "linux/amd64" ]; then echo "platform OK ($arch)"; else echo "FAIL: platform $arch"; fail=1; fi
media=$(docker run "${SAFE[@]}" "$IMG" -c 'wc -l < /app/MEDIA_IDENTITY.sha256' | tr -d ' ')
if [ "$media" = "$COUNT" ]; then echo "media count OK ($media)"; else echo "FAIL: media count $media != expected $COUNT"; fail=1; fi
# Portable on busybox and GNU: only small files can be pointers; look at each one's first bytes. (A missing tool must FAIL, not read as "0 pointers".)
lfs=$(docker run "${SAFE[@]}" "$IMG" -c 'command -v find >/dev/null && command -v head >/dev/null && command -v grep >/dev/null || { echo TOOLS_MISSING; exit 0; }; find /app/apps/h2o/public -type f -size -2k | while IFS= read -r f; do head -c 60 "$f" | grep -q "^version https://git-l""fs" && echo "$f"; done | wc -l' | tr -d ' ')
if [ "$lfs" = "0" ]; then echo "LFS pointers OK (0)"; else echo "FAIL: LFS pointer check says '$lfs' (files in public/ that are pointers, or tools missing)"; fail=1; lfs=${lfs//[^0-9]/}; fi
cid=$(docker create "$IMG")
trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' EXIT
rm -rf "$EV/next-scan" && mkdir -p "$EV/next-scan"
docker cp "$cid:/app/apps/h2o/.next" - | tar -x -C "$EV/next-scan" --exclude='.next/node_modules'
if node "$(dirname "$0")/compiled-url-scan.mjs" "$EV/next-scan/.next" --origin "$ORIGIN" --forbid "$FORBID" --out "$EV/compiled-url-scan.json"; then echo "compiled-URL scan OK"; else echo "FAIL: compiled-URL scan"; fail=1; fi
rm -rf "$EV/next-scan"
printf '{"revision":"%s","platform":"%s","mediaCount":%s,"lfsPointers":%s,"pass":%s}\n' "$rev" "$arch" "${media:-0}" "${lfs:-0}" "$([ $fail = 0 ] && echo true || echo false)" > "$EV/identity.json"
exit $fail
