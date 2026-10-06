#!/usr/bin/env bash
# h2o-restore.sh — Patch L3: restore one encrypted backup into an EMPTY database, and verify it.
#
#   h2o-restore.sh --object <name|latest> --identity <age identity file> --target-url <postgres://…/db>
#                  [--tier daily|weekly] [--allow-target-name]
#
# Safety:
#   - The target database must be empty (no user tables). An existing database is never overwritten.
#   - The target database name must contain "restore" (e.g. h2o_restore_20261005) unless --allow-target-name is
#     given — a guard against pointing a restore at a live database by mistake.
#   - The object's SHA-256 is checked against its .sha256 sidecar BEFORE anything is decrypted or restored.
#   - The identity (private key) file is read by age only; it is never copied, logged or uploaded. Keep it off the VPS.
# Uses the same H2O_BACKUP_DEST / rclone remote settings as h2o-backup.sh. Prints counts only (tables, rows).
#
# Exit codes: 0 ok · 2 usage/configuration · 3 tools/destination · 4 integrity (hash) · 5 restore failed · 6 refused
set -euo pipefail
umask 077

log() { printf '%s h2o-restore %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "FAIL $1"; exit "${2:-5}"; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }

object="" identity="" target="" tier="daily" allow_name=0
while [ $# -gt 0 ]; do
  case "$1" in
    --object) object="${2:-}"; shift 2 ;;
    --identity) identity="${2:-}"; shift 2 ;;
    --target-url) target="${2:-}"; shift 2 ;;
    --tier) tier="${2:-}"; shift 2 ;;
    --allow-target-name) allow_name=1; shift ;;
    *) die "USAGE unknown argument (see the header of this script)" 2 ;;
  esac
done
DEST="${H2O_BACKUP_DEST:-}"
[ -n "$object" ] && [ -n "$identity" ] && [ -n "$target" ] || die "USAGE --object, --identity and --target-url are required" 2
[ -n "$DEST" ] || die "CONFIG_MISSING H2O_BACKUP_DEST" 2
[[ "$tier" =~ ^(daily|weekly)$ ]] || die "USAGE --tier must be daily or weekly" 2
[ -r "$identity" ] || die "USAGE identity file not readable" 2
[[ "$target" =~ ^postgres(ql)?:// ]] || die "USAGE --target-url must be a postgres:// URL" 2
dbname="$(printf '%s' "$target" | sed -E 's#^[a-z]+://[^/]*/([^?]*).*#\1#')"
[[ "$dbname" =~ ^[A-Za-z0-9_-]+$ ]] || die "USAGE cannot read the database name from --target-url" 2
if [ "$allow_name" -ne 1 ] && [[ "$dbname" != *restore* ]]; then
  die "REFUSED target database name must contain \"restore\" (or pass --allow-target-name deliberately)" 6
fi
for t in age rclone pg_restore psql; do command -v "$t" >/dev/null 2>&1 || die "TOOL_MISSING $t" 3; done

tables="$(psql "$target" -X -A -t -v ON_ERROR_STOP=1 -c "select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema')" 2>/dev/null)" ||
  die "TARGET_UNREACHABLE (create the empty database first)" 3
[ "$tables" = "0" ] || die "REFUSED target database is not empty (${tables} tables); restores only go into an empty database" 6

if [ "$object" = "latest" ]; then
  object="$(rclone lsf --files-only "${DEST}/${tier}" | grep -E '^h2o-[a-z0-9-]+-[0-9]{8}T[0-9]{6}Z\.dump\.age$' | sort | tail -n 1)"
  [ -n "$object" ] || die "NO_BACKUP in ${tier}/" 3
fi
[[ "$object" =~ ^h2o-[a-z0-9-]+-[0-9]{8}T[0-9]{6}Z\.dump\.age$ ]] || die "USAGE object name is not an h2o backup" 2

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
log "FETCH ${tier}/${object}"
rclone copyto "${DEST}/${tier}/${object}" "$work/backup.age" || die "FETCH_FAILED" 3
rclone cat "${DEST}/${tier}/${object}.sha256" >"$work/expected" 2>/dev/null || die "SIDECAR_MISSING ${object}.sha256" 4
expected="$(cut -d' ' -f1 <"$work/expected")"
actual="$(sha256 <"$work/backup.age")"
[ -n "$expected" ] && [ "$expected" = "$actual" ] || die "HASH_MISMATCH expected=${expected:0:16} actual=${actual:0:16}" 4
log "HASH_OK sha256=${actual:0:16} bytes=$(wc -c <"$work/backup.age" | tr -d ' ')"

started=$SECONDS
if ! age -d -i "$identity" "$work/backup.age" | pg_restore --no-owner --no-privileges --exit-on-error -d "$target" 2>"$work/restore.err"; then
  die "RESTORE_FAILED $(head -n 1 "$work/restore.err" | sed -E 's#[a-z]+://[^ ]+#<url>#g')" 5
fi
summary="$(psql "$target" -X -A -t -v ON_ERROR_STOP=1 -c "
  select count(*) || ' tables, ' || coalesce(sum(n_live_tup), 0) || ' rows (estimate)'
  from pg_stat_user_tables")"
log "OK ${object} restored into ${dbname}: ${summary}; seconds=$((SECONDS - started))"
