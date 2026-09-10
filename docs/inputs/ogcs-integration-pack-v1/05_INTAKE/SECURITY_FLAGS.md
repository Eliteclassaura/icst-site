# SECURITY_FLAGS

Scope: `CLAUDE_H2O_OGCS_MASTER_HANDOFF_v1.zip` (all files, including the three extracted reference packs) and `~/Projects/agency-site-factory-workspace/` on the linked Mac (repo + `review-materials/`). Date: 2026-09-05.

Method: filename scan for `.env`, `.env.*`, `id_rsa*`, `id_ed25519*`, `*.pem`, `*.key`, `wp-config.php`, `*.sql`, `*.sql.gz`; read of `proxy.php`, `.htaccess`, `LICENCE.txt`, `README.txt`; targeted grep of `app.js` for `client_id`, `OAuth`, `api/`, `localStorage`; `git ls-files` / `git check-ignore` on the repo; review of `apps/syed-ai/.env.example`, `turbo.json` env whitelist, `.dockerignore`, `packages/quality-gates/src/residue.ts`, and the CI workflow. **No secret values were read or copied.**

## Findings

### S1 — MEDIUM — Operator's private host allowlist shipped inside the Search Evidence pack

**File:** `01_REFERENCE_PACKS/searchevidencesuite-fixes_1.zip → search-evidence-console/proxy.php`
**What:** `$ALLOWED_HOSTS` is populated with roughly eighteen hostnames: the operator's own brand and client domains plus nine `*.<client-host>` preview hosts. A code comment in the file states this is the operator's private variant and is not meant for the customer ZIP. The same list is treated as sensitive inside the Agency Site Factory repo: `packages/quality-gates/src/residue.ts` hashes these hosts at scan time and fails CI if any appears in a client image.
**Why it matters:** not a credential, but it discloses a client roster and unpublished staging hostnames. Anyone receiving this handoff bundle receives that list.
**Recommendation:** treat `CLAUDE_H2O_OGCS_MASTER_HANDOFF_v1.zip` as internal-only. For any wider distribution, rebuild the pack with `$ALLOWED_HOSTS = []` (the customer default) and regenerate `SHA256SUMS.txt`. The hostnames are **not** reproduced in this report or any other intake output.

### S2 — LOW / INFORMATIONAL — Local `.env` in the Factory checkout

**File:** `~/Projects/agency-site-factory-workspace/agency-site-factory/apps/syed-ai/.env`
**What:** Present on disk with four keys: `DATABASE_URI`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `S3_BUCKET`. Confirmed **untracked** (`git ls-files` does not know it) and **ignored** (`.gitignore:7`). `apps/syed-ai/.dockerignore` excludes `.env*`; CI's residue scan checks the built bundle for embedded `.env`.
**Action taken:** excluded from the sanitised snapshot used for analysis (`tar --exclude='.env'`; verified 0 matches in the archive listing). Values never read.
**Recommendation:** none beyond the existing controls. Do not include this file in any future transfer archive (the earlier `agency-site-factory-transfer/` parts should be checked for it before trashing, or simply trashed).

### S3 — ADVISORY — What the forthcoming Hostinger exports will contain

Not yet present; flagged now so handling is agreed before receipt.

| Artefact | Sensitive content expected | Handling |
|---|---|---|
| `wp-config.php` (in each files archive) | `DB_PASSWORD`, `DB_USER`, `DB_HOST`, eight `*_KEY`/`*_SALT` constants, possibly plugin API keys | Owner supplies `wp-config.sanitized.php`; I will not read the secret lines of the original and will report only `DB_NAME` and `$table_prefix`. |
| SQL dump (`wp_users`) | bcrypt/phpass password hashes, emails | Excluded from every generated CSV/report. Only `ID`, `display_name` used for author attribution. |
| SQL dump (`wp_options`) | SMTP credentials, form-plugin API keys, SEO-plugin licence keys, WooCommerce payment-gateway keys, reCAPTCHA secrets | Rows whose `option_name` matches common secret patterns are listed by *name only* in `DATA_GAPS.md`/`SECURITY_FLAGS.md` and never dumped. |
| SQL dump (WooCommerce tables, `wp_posts` with `shop_order`, `wp_comments`, `wp_wc_customer_lookup`, `wp_wc_order_stats`) | Customer names, addresses, emails, order history | If WooCommerce is active: flagged as unrelated-customer/private data; excluded from inventories; recommend the owner strips these tables before handoff (`mysqldump --ignore-table=`). |
| `wp-content/uploads/` | Possibly private PDFs (quotes, drawings, NDAs) | Media inventory records filename, type, size, referencing URL; content of PDFs is not extracted unless publicly linked. |
| `.htaccess` | Redirect rules (needed), but also possibly IP allowlists or Basic-auth references | Redirect rules extracted; auth/IP directives noted, not copied. |
| Hostinger backup of the wrong site | Other domains on the same plan | Reject and ask for a site-specific archive (per `SECURITY_AND_REDACTION.md`). |

### S4 — ADVISORY — Search Evidence Suite credentials model (for section C1 of the checklist)

The suite's GSC connector uses a **public OAuth client ID** only and keeps the access token in browser memory; no secret is involved and nothing is written to a server. The optional `proxy.php` `$SECRET` and the app's AI-assist key (in `localStorage`) are the only secrets the suite can hold — neither is needed for this project and neither should be exported. `*.seoproject.json` exports contain `cfg.gscClientId` (public identifier) but no tokens.

### S5 — ADVISORY — Reference packs are not secret-free by construction

The OGCS spec and the discovery pack contain no credentials. The Search Evidence `README.txt` and `LICENCE.txt` describe a client-side licence marker with check digits; none is present in the pack. No further findings.

## Non-findings (checked, clean)

- No `.env` (other than S2, outside the ZIP), no `id_rsa`, `id_ed25519`, `*.pem`, `*.key` anywhere in the ZIP or `review-materials/`.
- No `wp-config.php`, `.sql`, `.sql.gz` present yet.
- `review-materials/inputs/agency-site-factory-inputs-and-docs.zip` (207 files) contains the syed.ai legacy site — its `_private/config.example.php` is an example file, and `send.php`/`subscribers.php` are code, not credential dumps. Not H2O-related.
- Factory `.env.example` files contain placeholder values only.
- Factory `turbo.json` whitelists build-time env (`DATABASE_URI`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `S3_*`); secrets are never stored in Payload globals (the `integrations` global holds public identifiers only, e.g. Turnstile *site* key).

## Standing rules applied to every generated intake output

1. No credential, hash, salt or token from any source file is copied into Markdown, CSV, JSON or diagrams.
2. Hostnames from S1 are never enumerated.
3. Reports name sensitive `wp_options` rows by key, never by value.
4. Archives are read in the cloud workspace or on the Mac only; nothing is uploaded to third-party services.
