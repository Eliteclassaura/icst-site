#!/usr/bin/env bash
# h2o-backup.sh — Patch L3: nightly encrypted logical backup of the H2O Postgres database, pushed OFF the VPS.
#
#   pg_dump (custom format) | age (public-key encryption) | rclone rcat (S3-compatible bucket, Cloudflare R2 by default)
#
# Streams end to end: nothing unencrypted, and nothing the size of the dump, ever touches the local disk.
# The private key is held by the owner, never on the VPS. Fails closed: without every required setting nothing is
# dumped. Logs carry names, byte counts and hash prefixes only — never the database URL or any credential.
#
# Required:
#   H2O_BACKUP_DATABASE_URL     postgres://user:pass@host:port/db (a read-only role is enough)
#   H2O_BACKUP_AGE_RECIPIENTS   one or more age public keys (age1…), separated by spaces or commas
#   H2O_BACKUP_DEST             rclone destination "remote:bucket/prefix", e.g. "r2:h2o-backups/prod"; the remote is
#                               configured through rclone's own env vars (RCLONE_CONFIG_R2_TYPE=s3, …), see README.md
# Optional:
#   H2O_BACKUP_LABEL            object-name label (default "prod"); [a-z0-9-] only
#   H2O_BACKUP_KEEP_DAILY       daily copies kept (default 14)
#   H2O_BACKUP_KEEP_WEEKLY      weekly copies kept (default 8); the Sunday (UTC) backup is also kept as a weekly
#   H2O_BACKUP_MIN_BYTES        smallest plausible encrypted dump (default 4096); anything smaller fails the run
#   H2O_BACKUP_FORCE_WEEKLY     1 = also file this run as a weekly (tests, or a manual pre-cutover backup)
#   H2O_BACKUP_CHECK_ONLY       1 = verify configuration, tools and destination, then exit without dumping
#
# Exit codes: 0 ok, or NOT_READY when nothing is configured · 2 configuration partial/invalid · 3 tools missing or destination unreachable · 4 dump/upload failed
set -euo pipefail
umask 077

log() { printf '%s h2o-backup %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "FAIL $1"; exit "${2:-4}"; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }

DB_URL="${H2O_BACKUP_DATABASE_URL:-}"
RECIPIENTS="${H2O_BACKUP_AGE_RECIPIENTS:-}"
DEST="${H2O_BACKUP_DEST:-}"
LABEL="${H2O_BACKUP_LABEL:-prod}"
KEEP_DAILY="${H2O_BACKUP_KEEP_DAILY:-14}"
KEEP_WEEKLY="${H2O_BACKUP_KEEP_WEEKLY:-8}"
MIN_BYTES="${H2O_BACKUP_MIN_BYTES:-4096}"

# --- 1. Configuration (fail closed) ------------------------------------------------------------------------------
# Nothing configured yet (the owner has not supplied the bucket, token and key): a clear no-op, never a dump.
if [ -z "$DB_URL" ] && [ -z "$RECIPIENTS" ] && [ -z "$DEST" ]; then
  log "NOT_READY backups are not configured (owner to supply the R2 bucket + token and the age public key; see ops/backup/README.md). Nothing was dumped."
  exit 0
fi
# Partly configured is a mistake, not a choice: fail loudly.
missing=()
[ -n "$DB_URL" ] || missing+=(H2O_BACKUP_DATABASE_URL)
[ -n "$RECIPIENTS" ] || missing+=(H2O_BACKUP_AGE_RECIPIENTS)
[ -n "$DEST" ] || missing+=(H2O_BACKUP_DEST)
[ "${#missing[@]}" -eq 0 ] || die "CONFIG_MISSING ${missing[*]} (nothing was dumped)" 2
[[ "$DB_URL" =~ ^postgres(ql)?:// ]] || die "CONFIG_INVALID H2O_BACKUP_DATABASE_URL must be a postgres:// URL" 2
[[ "$DEST" =~ ^[A-Za-z0-9_-]+:[^[:space:]]+$ ]] || die "CONFIG_INVALID H2O_BACKUP_DEST must look like remote:bucket/prefix" 2
[[ "$LABEL" =~ ^[a-z0-9-]{1,32}$ ]] || die "CONFIG_INVALID H2O_BACKUP_LABEL" 2
for n in "$KEEP_DAILY" "$KEEP_WEEKLY" "$MIN_BYTES"; do [[ "$n" =~ ^[0-9]+$ ]] || die "CONFIG_INVALID retention/size settings must be whole numbers" 2; done
[ "$KEEP_DAILY" -ge 1 ] && [ "$KEEP_WEEKLY" -ge 1 ] || die "CONFIG_INVALID keep at least one daily and one weekly copy" 2
rargs=()
for r in ${RECIPIENTS//,/ }; do
  [[ "$r" =~ ^age1[02-9ac-hj-np-z]{58}$ ]] || die "CONFIG_INVALID H2O_BACKUP_AGE_RECIPIENTS: every entry must be an age1… public key (never a secret key)" 2
  rargs+=(-r "$r")
done
[ "${#rargs[@]}" -gt 0 ] || die "CONFIG_INVALID no age recipient" 2

# --- 2. Tools and destination -------------------------------------------------------------------------------------
for t in pg_dump age rclone; do command -v "$t" >/dev/null 2>&1 || die "TOOL_MISSING $t" 3; done
rclone lsf --max-depth 1 "$DEST" >/dev/null 2>&1 || rclone mkdir "$DEST" >/dev/null 2>&1 || die "DEST_UNREACHABLE (check the rclone remote settings and the bucket)" 3
if [ "${H2O_BACKUP_CHECK_ONLY:-0}" = "1" ]; then
  log "READY configuration, tools and destination OK (check only; nothing was dumped)"
  exit 0
fi

# --- 3. Dump → encrypt → upload (streamed) --------------------------------------------------------------------------
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="h2o-${LABEL}-${stamp}.dump.age"
partial="${DEST}/incoming/${name}.partial"
work="$(mktemp -d)"
uploaded=0
cleanup() {
  rm -rf "$work"
  if [ "$uploaded" -eq 0 ]; then rclone deletefile "$partial" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
mkfifo "$work/cipher"
sha256 <"$work/cipher" >"$work/sha" &
shapid=$!
started=$SECONDS
log "START ${name}"
if ! pg_dump --format=custom --compress=6 --no-owner --no-privileges "$DB_URL" 2>"$work/pg_dump.err" \
  | age -e "${rargs[@]}" \
  | tee "$work/cipher" \
  | rclone rcat "$partial" 2>"$work/rclone.err"; then
  # Error output can quote connection details: report its first line only after redacting URLs.
  first="$(head -n 1 "$work/pg_dump.err" "$work/rclone.err" 2>/dev/null | grep -v '^==>' | grep -v '^$' | head -n 1 | sed -E 's#[a-z]+://[^ ]+#<url>#g')"
  die "DUMP_OR_UPLOAD ${first:-unknown error}" 4
fi
wait "$shapid"
digest="$(cat "$work/sha")"
bytes="$(rclone size --json "$partial" | sed -E 's/.*"bytes":([0-9]+).*/\1/')"
[[ "$bytes" =~ ^[0-9]+$ ]] || die "SIZE_UNKNOWN" 4
[ "$bytes" -ge "$MIN_BYTES" ] || die "TOO_SMALL ${bytes} bytes < ${MIN_BYTES}" 4

# --- 4. Publish: a complete object only ever appears under daily/ (and weekly/) -----------------------------------
rclone moveto "$partial" "${DEST}/daily/${name}"
uploaded=1
printf '%s  %s\n' "$digest" "$name" | rclone rcat "${DEST}/daily/${name}.sha256"
weekly=0
if [ "$(date -u +%u)" = "7" ] || [ "${H2O_BACKUP_FORCE_WEEKLY:-0}" = "1" ]; then
  rclone copyto "${DEST}/daily/${name}" "${DEST}/weekly/${name}"
  rclone copyto "${DEST}/daily/${name}.sha256" "${DEST}/weekly/${name}.sha256"
  weekly=1
fi
printf '{"name":"%s","utc":"%s","bytes":%s,"sha256":"%s","weekly":%s}\n' "$name" "$stamp" "$bytes" "$digest" \
  "$([ "$weekly" -eq 1 ] && echo true || echo false)" | rclone rcat "${DEST}/latest.json"

# --- 5. Retention: newest N of OUR objects per tier; never anything else -------------------------------------------
prune() {
  local tier="$1" keep="$2" n=0 f
  local -a names=()
  while IFS= read -r f; do names+=("$f"); done < <(rclone lsf --files-only "${DEST}/${tier}" | grep -E "^h2o-${LABEL}-[0-9]{8}T[0-9]{6}Z\.dump\.age$" | sort -r)
  for f in "${names[@]:$keep}"; do
    rclone deletefile "${DEST}/${tier}/${f}"
    rclone deletefile "${DEST}/${tier}/${f}.sha256" >/dev/null 2>&1 || true
    n=$((n + 1))
  done
  echo "$n"
}
pd="$(prune daily "$KEEP_DAILY")"
pw="$(prune weekly "$KEEP_WEEKLY")"
log "OK ${name} bytes=${bytes} sha256=${digest:0:16} weekly=${weekly} seconds=$((SECONDS - started)) pruned_daily=${pd} pruned_weekly=${pw}"
