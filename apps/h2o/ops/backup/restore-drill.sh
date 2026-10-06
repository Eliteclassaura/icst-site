#!/usr/bin/env bash
# restore-drill.sh — Patch L3 tested restore, run on a Mac against a SYNTHETIC loopback database only.
#
# Exercises the real h2o-backup.sh and h2o-restore.sh end to end:
#   a throwaway age key → `rclone serve s3` as a local stand-in bucket → backup (x3, retention, weekly copy)
#   → restore "latest" into a new empty database → compare schema and exact per-table row counts → clean up.
#
#   restore-drill.sh <source postgres URL on 127.0.0.1, database name containing "synthetic"> [report.json]
#
# Postgres client tools: by default the drill runs pg_dump/pg_restore/psql from the local postgres:16-alpine image (the
# production server's major version, as the backup container does). H2O_DRILL_PG_TOOLS=native uses the Mac's own.
# Creates and then drops exactly one database, "<source>_restore_drill". Never touches anything else.
set -euo pipefail
umask 077
here="$(cd "$(dirname "$0")" && pwd)"
src="${1:-}"
report="${2:-}"
[[ "$src" =~ ^postgres(ql)?://[^/]*@?(127\.0\.0\.1|localhost):[0-9]+/[A-Za-z0-9_]*synthetic[A-Za-z0-9_]*$ ]] ||
  { echo "restore-drill: the source must be a loopback postgres URL whose database name contains \"synthetic\"" >&2; exit 2; }
for t in age age-keygen rclone; do command -v "$t" >/dev/null || { echo "restore-drill: $t missing" >&2; exit 3; }; done

srcdb="${src##*/}"
drilldb="${srcdb}_restore_drill"
base="${src%/*}"
target="${base}/${drilldb}"
admin="${base}/postgres"
work="$(mktemp -d)"
port=$((20000 + RANDOM % 20000))
server=""
cleanup() {
  [ -n "$server" ] && kill "$server" 2>/dev/null || true
  psqlx "$admin" -c "drop database if exists \"${drilldb}\"" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

# Client tools: Postgres 16 from the local image (no pull; fails if the image is absent), or the Mac's own.
mkdir -p "$work/bin"
if [ "${H2O_DRILL_PG_TOOLS:-docker}" = "docker" ]; then
  docker image inspect postgres:16-alpine >/dev/null 2>&1 || { echo "restore-drill: postgres:16-alpine image not present locally" >&2; exit 3; }
  for t in pg_dump pg_restore psql; do
    cat >"$work/bin/$t" <<EOF
#!/usr/bin/env bash
args=(); for a in "\$@"; do args+=("\${a//127.0.0.1/host.docker.internal}"); done
exec docker run --rm -i --add-host=host.docker.internal:host-gateway postgres:16-alpine $t "\${args[@]}"
EOF
    chmod +x "$work/bin/$t"
  done
  export PATH="$work/bin:$PATH"
fi
psqlx() { psql "$1" -X -A -t -v ON_ERROR_STOP=1 "${@:2}"; }

step() { printf 'restore-drill %s\n' "$*" >&2; }
fail() { step "FAIL $*"; exit 1; }

# 1. Throwaway key pair (the drill's own; production keys are the owner's and never come near this script).
age-keygen -o "$work/identity.txt" 2>/dev/null
recipient="$(age-keygen -y "$work/identity.txt")"

# 2. Local S3 stand-in bucket.
mkdir -p "$work/s3/h2o-backups"
rclone serve s3 --addr "127.0.0.1:${port}" --auth-key "drill,drillsecret" "$work/s3" >"$work/serve.log" 2>&1 &
server=$!
for _ in $(seq 1 50); do curl -s "http://127.0.0.1:${port}/" >/dev/null 2>&1 && break; sleep 0.2; done
export RCLONE_LOG_LEVEL=ERROR RCLONE_CONFIG_DRILL_TYPE=s3 RCLONE_CONFIG_DRILL_PROVIDER=Other RCLONE_CONFIG_DRILL_ENDPOINT="http://127.0.0.1:${port}" \
  RCLONE_CONFIG_DRILL_ACCESS_KEY_ID=drill RCLONE_CONFIG_DRILL_SECRET_ACCESS_KEY=drillsecret RCLONE_CONFIG_DRILL_FORCE_PATH_STYLE=true

export H2O_BACKUP_DATABASE_URL="$src" H2O_BACKUP_AGE_RECIPIENTS="$recipient" H2O_BACKUP_DEST="drill:h2o-backups/drill" \
  H2O_BACKUP_LABEL=drill H2O_BACKUP_KEEP_DAILY=2 H2O_BACKUP_KEEP_WEEKLY=1

# 3. Readiness, then three backups (the first also filed as weekly): retention must keep exactly 2 daily + 1 weekly.
H2O_BACKUP_CHECK_ONLY=1 "$here/h2o-backup.sh" 2>"$work/check.log" || fail "readiness check: $(cat "$work/check.log")"
grep -q READY "$work/check.log" || fail "readiness check did not report READY"
H2O_BACKUP_FORCE_WEEKLY=1 "$here/h2o-backup.sh" 2>>"$work/backup.log" || fail "backup 1: $(tail -n 1 "$work/backup.log")"
sleep 1.1; "$here/h2o-backup.sh" 2>>"$work/backup.log" || fail "backup 2"
sleep 1.1; "$here/h2o-backup.sh" 2>>"$work/backup.log" || fail "backup 3"
daily="$(rclone lsf --files-only drill:h2o-backups/drill/daily | grep -c '\.dump\.age$' || true)"
weekly="$(rclone lsf --files-only drill:h2o-backups/drill/weekly | grep -c '\.dump\.age$' || true)"
[ "$daily" = "2" ] && [ "$weekly" = "1" ] || fail "retention: daily=${daily} weekly=${weekly} (expected 2 and 1)"
rclone cat drill:h2o-backups/drill/latest.json >"$work/latest.json"
latest="$(sed -E 's/.*"name":"([^"]+)".*/\1/' "$work/latest.json")"
# Nothing readable leaks into the bucket: the object is age ciphertext, never a pg_dump archive.
rclone copyto "drill:h2o-backups/drill/daily/${latest}" "$work/object.age"
[ "$(head -c 21 "$work/object.age")" = "age-encryption.org/v1" ] || fail "object is not age ciphertext"
if grep -aq 'PGDMP' "$work/object.age"; then fail "plaintext dump marker found in the object"; fi
step "BACKUP_OK daily=${daily} weekly=${weekly} latest=${latest}"

# 4. Refusals: a non-empty or wrongly named target is refused; a tampered object is refused before restore.
set +e
"$here/h2o-restore.sh" --object latest --identity "$work/identity.txt" --target-url "$src" 2>/dev/null; r1=$?
set -e
[ "$r1" = "6" ] || fail "restore into the source database was not refused (exit ${r1})"
psqlx "$admin" -c "create database \"${drilldb}\"" >/dev/null
cp "$work/s3/h2o-backups/drill/daily/${latest}" "$work/orig.age"
printf 'x' >>"$work/s3/h2o-backups/drill/daily/${latest}"
set +e
"$here/h2o-restore.sh" --object latest --identity "$work/identity.txt" --target-url "$target" --allow-target-name 2>/dev/null; r2=$?
set -e
cp "$work/orig.age" "$work/s3/h2o-backups/drill/daily/${latest}"
[ "$r2" = "4" ] || fail "a tampered object was not refused on its hash (exit ${r2})"
step "REFUSALS_OK wrong-target=6 tampered=4"

# 5. Restore latest into the empty drill database and compare with the source.
"$here/h2o-restore.sh" --object latest --identity "$work/identity.txt" --target-url "$target" --allow-target-name 2>>"$work/restore.log" ||
  fail "restore: $(tail -n 1 "$work/restore.log")"
counts() {
  psqlx "$1" -c "select string_agg(format('select %L as t, count(*) as n from %I.%I', schemaname || '.' || tablename, schemaname, tablename), ' union all ' order by schemaname, tablename) from pg_tables where schemaname not in ('pg_catalog','information_schema')" >"$work/q.sql"
  psqlx "$1" <"$work/q.sql" | sort
}
counts "$src" >"$work/src.counts"
counts "$target" >"$work/dst.counts"
diff -q "$work/src.counts" "$work/dst.counts" >/dev/null || fail "row counts differ after restore"
pg_dump --schema-only --no-owner --no-privileges "$src" | grep -v -E '^(--|SET |SELECT pg_catalog|\\(un)?restrict )' >"$work/src.schema"
pg_dump --schema-only --no-owner --no-privileges "$target" | grep -v -E '^(--|SET |SELECT pg_catalog|\\(un)?restrict )' >"$work/dst.schema"
diff -q "$work/src.schema" "$work/dst.schema" >/dev/null || fail "schema differs after restore"
tables="$(wc -l <"$work/src.counts" | tr -d ' ')"
rows="$(awk -F'|' '{s+=$2} END {print s+0}' "$work/src.counts")"
bytes="$(sed -E 's/.*"bytes":([0-9]+).*/\1/' "$work/latest.json")"
step "PASS restored ${tables} tables / ${rows} rows; schema identical; ${bytes} encrypted bytes"
if [ -n "$report" ]; then
  printf '{"result":"PASS","source_db":"%s","tables":%s,"rows":%s,"encrypted_bytes":%s,"retention":{"daily":%s,"weekly":%s},"refusals":{"non_empty_or_misnamed_target":%s,"tampered_object":%s},"pg_tools":"%s","age":"%s","rclone":"%s"}\n' \
    "$srcdb" "$tables" "$rows" "$bytes" "$daily" "$weekly" "$r1" "$r2" "${H2O_DRILL_PG_TOOLS:-docker postgres:16-alpine}" "$(age --version)" "$(rclone version | head -n 1)" >"$report"
fi
