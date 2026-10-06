#!/usr/bin/env bash
# Patch L3 runner entrypoint.
#   (no args)      run h2o-backup.sh once a day at H2O_BACKUP_AT_UTC (default 03:17), in a foreground loop
#   check          report readiness (configuration, tools, destination) without dumping, and exit
#   once           run one backup now and exit (manual or pre-cutover backup)
#   restore …      pass through to h2o-restore.sh
set -euo pipefail
case "${1:-}" in
  check) H2O_BACKUP_CHECK_ONLY=1 exec /usr/local/bin/h2o-backup.sh ;;
  once) exec /usr/local/bin/h2o-backup.sh ;;
  restore) shift; exec /usr/local/bin/h2o-restore.sh "$@" ;;
  "") ;;
  *) echo "usage: entrypoint.sh [check|once|restore …]" >&2; exit 2 ;;
esac
at="${H2O_BACKUP_AT_UTC:-03:17}"
[[ "$at" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || { echo "h2o-backup FAIL CONFIG_INVALID H2O_BACKUP_AT_UTC (HH:MM)" >&2; exit 2; }
# Readiness on start, so a missing configuration shows in the container log on day one (NOT_READY is not an error).
H2O_BACKUP_CHECK_ONLY=1 /usr/local/bin/h2o-backup.sh || true
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) h2o-backup SCHEDULED daily at ${at} UTC" >&2
while :; do
  now="$(date -u +%s)"
  next="$(date -u -d "today ${at}" +%s)"
  [ "$next" -gt "$now" ] || next="$(date -u -d "tomorrow ${at}" +%s)"
  sleep "$((next - now))"
  /usr/local/bin/h2o-backup.sh || echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) h2o-backup run exited $?" >&2
done
