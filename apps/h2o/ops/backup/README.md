# H2O database backups (Patch L3): runbook

**What it does:** every night, `pg_dump` (custom format) of the H2O Postgres database is encrypted with `age` to the owner's public key and streamed by `rclone` to an S3-compatible bucket **off the VPS**. Cloudflare R2 is the default.
- Nothing unencrypted is written anywhere. The VPS disk is not used for the dump.
- The private key never touches the VPS. Only the owner can decrypt.

**Retention:**
- 14 daily copies (`daily/`);
- 8 weekly copies (`weekly/`; the Sunday UTC backup is also filed there);
- each object has a `.sha256` sidecar;
- `latest.json` names the newest backup.

**Until it is configured, it does nothing.** The runner logs `NOT_READY … Nothing was dumped.` and exits cleanly. A partly configured runner fails loudly (exit 2) instead of guessing.

| File | Purpose |
|---|---|
| `h2o-backup.sh` | One backup run: dump → encrypt → upload → publish → prune. `H2O_BACKUP_CHECK_ONLY=1` checks readiness without dumping. |
| `h2o-restore.sh` | Restore one backup into an **empty** database whose name contains `restore`, after verifying its SHA-256. |
| `entrypoint.sh` | Container entrypoint: the daily loop (`H2O_BACKUP_AT_UTC`, default 03:17), plus `check`, `once` and `restore …`. |
| `Dockerfile` | The runner image: `postgres:16-alpine` (matching the server's major) plus `age`, `rclone` and `bash`. It runs as the `postgres` user, with no port and no volume. |
| `restore-drill.sh` | The tested restore on a Mac against a **synthetic** loopback database. It uses a local S3 stand-in and a throwaway key. |

## 1. What the owner creates (once)

1. **An R2 bucket.** In the Cloudflare dashboard → R2:
   - create a bucket named `h2o-backups`;
   - keep the default location;
   - leave public access **off**.
2. **An R2 API token scoped to that bucket only.** In R2 → Manage R2 API tokens → Create:
   - permission **Object Read & Write**;
   - apply to **specific bucket** `h2o-backups`;
   - no expiry, or a calendar reminder to rotate it.
   - Keep three values: the **Access Key ID**, the **Secret Access Key** and the account's **S3 endpoint** (`https://<account-id>.r2.cloudflarestorage.com`).
   - These go into Coolify's secret environment for the backup runner, never into chat or files.
3. **An age key pair, made on the owner's own computer (not the VPS):**
   - `brew install age` (macOS), then `age-keygen -o h2o-backup-key.txt`. The command prints the **public key** (`age1…`).
   - **The file `h2o-backup-key.txt` is the private key.**
     - Store it in the password manager, plus one offline copy (e.g. an encrypted USB stick in a safe).
     - **If it is lost, every backup is unreadable.** Nobody can recover it.
   - Give **only the public key** (`age1…`) to Commander. It is not secret.
   - *Optional:* a second recipient (e.g. a co-owner's key). Both public keys go into `H2O_BACKUP_AGE_RECIPIENTS`, and either private key can restore.
4. **A database role for backups** (Commander can create it on request): a login role with read access to the H2O database. `pg_dump` needs `SELECT` on every table. The app's own role also works if no separate role is wanted.

## 2. Commander: deploy the runner (VPS, Coolify)

**Image:** build `ops/backup/Dockerfile` (context `apps/h2o/ops/backup`) as a separate service on the same Docker network as the H2O Postgres. It needs **no** public port and **no** volume.

**Environment** (Coolify secrets for the secret values):

| Variable | Value |
|---|---|
| `H2O_BACKUP_DATABASE_URL` | `postgres://<backup role>:<password>@<db host>:5432/<db>` (secret) |
| `H2O_BACKUP_AGE_RECIPIENTS` | the owner's `age1…` public key(s), separated by spaces or commas |
| `H2O_BACKUP_DEST` | `r2:h2o-backups/prod` |
| `RCLONE_CONFIG_R2_TYPE` | `s3` |
| `RCLONE_CONFIG_R2_PROVIDER` | `Cloudflare` |
| `RCLONE_CONFIG_R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `RCLONE_CONFIG_R2_ACCESS_KEY_ID` | the R2 token's access key ID (secret) |
| `RCLONE_CONFIG_R2_SECRET_ACCESS_KEY` | the R2 token's secret (secret) |
| `RCLONE_CONFIG_R2_NO_CHECK_BUCKET` | `true` (the token is bucket-scoped and cannot list buckets) |
| `H2O_BACKUP_AT_UTC` | optional, default `03:17` |
| `H2O_BACKUP_LABEL`, `H2O_BACKUP_KEEP_DAILY`, `H2O_BACKUP_KEEP_WEEKLY` | optional; defaults `prod`, 14, 8 |

**Steps:**
1. **Readiness:** `docker exec <runner> /usr/local/bin/entrypoint.sh check` must log `READY`. Before the owner supplies the values it logs `NOT_READY`, which is expected and not an error.
2. **First backup now:** `docker exec <runner> /usr/local/bin/entrypoint.sh once` must log `OK h2o-prod-<utc>.dump.age bytes=… sha256=…`. Record the line (it has no secrets).
3. **Daily:** the container log shows one `OK` line per day. Two days without one is a page-worthy problem.

## 3. Restore (the owner, or Commander with the owner present)

**Restores happen off the VPS:** on the owner's Mac, or on a throwaway host. The private key goes wherever the restore runs, and nowhere else.

1. Create an empty database whose name contains `restore`, e.g. `createdb h2o_restore_20261020`.
2. Export the same `H2O_BACKUP_DEST` and `RCLONE_CONFIG_R2_*` values in the shell (read-only use).
3. Run `ops/backup/h2o-restore.sh --object latest --identity ~/path/h2o-backup-key.txt --target-url postgres://…/h2o_restore_20261020`.
   - `--tier weekly` takes the newest weekly copy.
   - `--object h2o-prod-<utc>.dump.age` takes a specific one.
4. **The script refuses (exit 6)** a non-empty target or a name without `restore`. **It refuses (exit 4)** if the object's SHA-256 does not match its sidecar. It prints `OK … N tables, M rows (estimate)`.
5. **To bring a restored copy into service:** that is a separate, Control Tower-approved cutover step (point the app at it, or `pg_dump`/`pg_restore` it onward). Never restore over a live database.

## 4. Tested restore before cutover

- **Synthetic drill (the Factory ran it; repeat it any time):**
  ```bash
  ops/backup/restore-drill.sh postgres://postgres@127.0.0.1:55432/h2o_crm_synthetic_qa3 drill.json
  ```
  - It must end with `PASS restored N tables / M rows; schema identical`.
  - It checks retention (2 daily + 1 weekly with the drill's keep settings), that the object is age ciphertext with no plaintext dump marker, and both refusals.
- **The pre-cutover gate (owner + Commander):** after the first real `OK` on staging or production, the owner restores that object on the Mac with §3 into `h2o_restore_<date>`, then compares table counts with the source (Commander reads them from the server). Record the date, the object name and the counts. **Cutover waits for this.**

## 5. Rotation and incidents

- **R2 token leak:** revoke it in Cloudflare, create a new bucket-scoped token, and update the Coolify secrets. Existing backups stay valid, because they are encrypted.
- **Key rotation:** create a new key pair and set the new public key. Old backups stay readable **only** with the old private key, so keep it until those age out (8 weeks).
- **Lost private key:** every existing backup is unrecoverable. Create a new key pair at once and take a fresh backup (`entrypoint.sh once`).
