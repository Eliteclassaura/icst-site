# Patch L3 backup runner. Postgres 16 client tools (the server's major), plus age and rclone from Alpine.
# One container, one nightly job (busybox crond). No app code, no listening port, no volume needed:
# the dump streams pg_dump | age | rclone straight to the bucket.
FROM postgres:16-alpine
RUN apk add --no-cache bash age rclone coreutils tzdata
COPY h2o-backup.sh h2o-restore.sh entrypoint.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/h2o-backup.sh /usr/local/bin/h2o-restore.sh /usr/local/bin/entrypoint.sh
# The backup must never run as the postgres superuser of a co-located server; it only needs network access to the DB.
USER postgres
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
