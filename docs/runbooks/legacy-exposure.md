# Runbook — legacy admin-key exposure on the live syed.ai host (R1, R43)

**Why this is not "rotate the key".** `diagnose.php` and `subscribers.php` authenticate with a string written into the file itself, and `subscribers.php?export=…` returns the whole subscriber list. A new key in the same file is the same flaw with a shorter history. The new platform replaces both (subscriber export behind Payload roles, diagnostics behind the admin session), so nothing on the live site needs them.

Owner action. Do it in this order; tick each line in the content-verification ledger under "Security actions" with the date.

1. **Remove.** Delete `diagnose.php` and `subscribers.php` from the web root. If deletion is not possible today, deny them at the web server (`.htaccess`: `<FilesMatch "^(diagnose|subscribers)\.php$"> Require all denied </FilesMatch>`). Verify: both URLs return 403/404 from a browser without cookies.
2. **Export once, out of band.** If the subscriber list is still needed before migration, download `_private/payload/subscribers.jsonl` over SFTP/SSH — not through the export URL. Keep it out of this repository; it enters the project only through the sanitized-fixture path (A12) and the C6 import.
3. **Inspect the logs.** In the host's access logs, list every request to `subscribers.php` or `diagnose.php`. Your own IPs aside, any hit with `?export=` or a `200` on `subscribers.php` means the list should be treated as exposed. Record the finding (count, dates, whether any export succeeded) in the ledger. Whether a notification duty follows depends on jurisdiction and the data involved (emails, names, consent timestamps); that is a decision for you, possibly with counsel — the runbook only makes sure the facts are recorded.
4. **Rotate the real credentials.** `diagnose.php` can confirm whether the Google app password in `syedai-config.php` is valid and how long it is. Revoke that app password in the Google account and create a new one; update `syedai-config.php`. Rotate anything else in that file (the config lives outside the web root and is not in the archive, so check it directly).
5. **Retire the rest at cutover.** `send.php`, `subs.php`, `confirm.php`, `email-check.php`, `roadmap.php` return 404/410 on the new site (C5 acceptance). Until cutover they stay as they are; they hold no key.
6. **Archive hygiene.** Any copy of the legacy archive that leaves your machine should be the redacted `legacy-reference` (key literal → `<legacy-admin-key>`, allowlist → placeholder); the residue scanner refuses the literal everywhere in this repository by hash.

Done when: both scripts unreachable, logs reviewed and recorded, app password rotated, ledger rows dated.

## Note on `PAYLOAD_SECRET` rotation (ADR-028, R58)

Payload encrypts service-account API keys with `PAYLOAD_SECRET`. Rotating the secret (for any reason) invalidates every key: after rotation, re-issue each client's `service-accounts` key in admin and update the OGCS per-client secret (`CLIENT_<slug>_PAYLOAD_API_KEY`). OGCS treats the interim 401s as `blocked`, not as failures to retry.
