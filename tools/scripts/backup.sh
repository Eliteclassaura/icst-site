#!/usr/bin/env bash
# Backup skeleton (C8). Deliberately small, boring and restorable: a Postgres dump plus the media tree,
# encrypted with age, uploaded to an S3-compatible bucket, verified by listing what was written.
#
#   DATABASE_URI=… BACKUP_BUCKET=… BACKUP_AGE_RECIPIENT=age1… tools/scripts/backup.sh [--dry-run]
#
# Rules this script exists to enforce:
#   * Nothing is written unencrypted anywhere but the ephemeral work directory, which is always removed.
#   * The dump excludes nothing — a partial backup is worse than none — but the *restore* drill is what
#     proves it (docs/deployment-coolify-cloudflare.md §Backups; the drill itself is a Release 7 item).
#   * No secret is ever echoed. Only names, sizes and the destination key are printed.
#   * Exit non-zero on any failure; a silent partial upload must never look like success.
set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

: "${DATABASE_URI:?DATABASE_URI is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required (s3://bucket/prefix)}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required (age public key; the private key is NOT on this host)}"
MEDIA_DIR="${MEDIA_DIR:-apps/syed-ai/media}"
SITE="${SITE:-syed-ai}"

for bin in pg_dump age aws tar; do
  command -v "$bin" >/dev/null || { echo "missing required binary: $bin" >&2; exit 1; }
done

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
DB_FILE="$WORK/${SITE}-${STAMP}.dump"
MEDIA_FILE="$WORK/${SITE}-${STAMP}-media.tar.zst"

echo "dumping database → $(basename "$DB_FILE")"
pg_dump --format=custom --no-owner --no-privileges --file "$DB_FILE" "$DATABASE_URI"

if [[ -d "$MEDIA_DIR" ]]; then
  echo "archiving media from $MEDIA_DIR → $(basename "$MEDIA_FILE")"
  tar --zstd -cf "$MEDIA_FILE" -C "$(dirname "$MEDIA_DIR")" "$(basename "$MEDIA_DIR")"
else
  echo "no local media directory ($MEDIA_DIR) — object storage is backed up by its own lifecycle policy"
fi

for f in "$DB_FILE" "$MEDIA_FILE"; do
  [[ -f "$f" ]] || continue
  echo "encrypting $(basename "$f") ($(du -h "$f" | cut -f1))"
  age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$f.age" "$f"
  rm -f "$f"
done

if $DRY_RUN; then
  echo "dry run — would upload:"
  ls -1 "$WORK"
  exit 0
fi

DEST="${BACKUP_BUCKET%/}/${SITE}/${STAMP}"
for f in "$WORK"/*.age; do
  echo "uploading $(basename "$f") → ${DEST}/$(basename "$f")"
  aws s3 cp "$f" "${DEST}/$(basename "$f")" --only-show-errors
done

echo "verifying"
aws s3 ls "${DEST}/" --recursive --human-readable | sed 's/^/  /'
echo "backup complete: ${DEST}"
