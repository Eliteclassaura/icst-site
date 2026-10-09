# H2O deploy pipeline (DEPLOY-PIPE-1)

A sealed head goes in; a verified image digest comes out in **~12–15 min for a CSS/copy fix, ~20–25 min for a full release** (was 1.5–2 h). CI builds and gates; the **Commander still does the deploy** (Coolify) and the read-backs. CI holds **no Coolify, SSH or VPS credential** and never touches the deployed app.

## Flow
1. The Commander applies the sealed bundles as today (BASE OK, apply proof), commits, and gets the sealed head to GitHub. **Both triggers are supported; use whichever credential you have:** (a) push the sealed head to **`release/<head12>`** (release branches are **add-only: never force-push**; protect `release/**`), or (b) run the workflow by hand (`workflow_dispatch`) with the **`head_sha`** input (the full 40-hex commit sha; the build uses exactly that commit, and a malformed sha stops the run before anything else).
2. `.github/workflows/h2o-release.yml` runs (**only when the repository variable `H2O_RELEASE_CI_ENABLED` = `true`**; switch it on after the owner's GO).
3. **classify** (`ops/ci/classify-change.mjs`): from the paths changed since the deployed head. Fail closed.
   | Class | Paths | Gates |
   |---|---|---|
   | **light** | only CSS outside `src/crm`, plain copy (`content/**.md|tsv` that is not catalog/seed/authority/batch/redirect/sitemap/site-chrome/crm/json), tests, docs; at most 25 source files | tsc · ESLint · stylelint per-rule counts of the changed CSS equal base · vitest `related` to the changed files |
   | **full** | everything else: `src/crm`, migrations, collections, payload config, seed/catalog/content/site-chrome scripts, package/lockfile/Dockerfile/workflows, any unknown path, an empty or large change | tsc · ESLint · stylelint counts · unit · **CRM DB suite in 4 shards** (a Postgres 16 service each) · `migrate:create` = "No schema changes detected" · `generate:types` identical |
4. **image** runs in parallel with the gates: native linux/amd64 `buildx` with a registry layer cache, pushed by digest as `…:candidate-<sha>`. **Identity checks** (`ops/ci/check-image-identity.sh`) must pass: revision label = the sealed head · platform linux/amd64 · `MEDIA_IDENTITY.sha256` line count = the media files in the tree · **0 Git-LFS pointer files** in `public/` · the **bounded compiled-URL scan** (`ops/ci/compiled-url-scan.mjs`): 0 for `staging.`, `sslip`, the forbidden hosts variable (e.g. the VPS IP) and any `localhost` that is the effective configured origin; the expected origin (`H2O_SERVER_URL`) must be compiled in; the count and 3 examples of the allowed generic fallbacks go into the evidence.
5. **publish**: only if the class's gates and the image are all green, the digest is promoted to **`<head12>-production`** and the run summary says **DEPLOYABLE** with the exact `ghcr.io/eliteclassaura/h2o-unified-runtime@sha256:…`. Otherwise it says **NOT DEPLOYABLE** and no candidate may be deployed. The evidence (identity.json, compiled-url-scan.json, media-apply.json) is an artifact of the run.

### No Git-LFS bandwidth (the 685 MB media)
Checkouts are `lfs: false`, so `public/` holds LFS *pointers*. `ops/ci/media.mjs` fills it from the **previous production image** (its files and `/app/MEDIA_IDENTITY.sha256`), verifying every file by sha256 against the pointer's `oid`; only files that are new or changed are fetched from LFS. A CSS/copy release downloads nothing; a media release downloads only the new files; a corrupted previous image fails verification instead of shipping a wrong file. First run (no previous digest) fetches everything once.

## One-time setup (owner / Commander; no values in the repo)
- Repository **variables**: `H2O_RELEASE_CI_ENABLED` (leave unset/false until GO), `H2O_DEPLOYED_SHA` and `H2O_DEPLOYED_DIGEST` (what production runs now; the Commander updates both after each deploy), `H2O_SERVER_URL` (`https://h2ocooling.com`), `H2O_FORBIDDEN_HOSTS` (optional, comma list, e.g. the VPS IP), `H2O_TEST_NOW` (optional frozen clock for the CRM DB suite), `GHCR_USER` (`Eliteclassaura`).
- Repository **secret** `GHCR_PUSH_TOKEN`: the existing `write:packages` PAT (Keychain `h2o-ghcr-push`), pasted by the owner into the secret store only. **This is the supported credential.** The `GITHUB_TOKEN` fallback in the workflow works only if the package grants this repository Actions **write** access (Package settings → Manage Actions access): document it, but do not rely on it.
- Branch protection on `release/**` (push by the Commander's credential only).

## Commander runbook: redeploy by digest
1. Take the digest from the run summary (**DEPLOYABLE** only). Check it is the same head CT approved (`<head12>`).
2. **Backup the DB** first (the standing backup step), then redeploy the Docker-Image app in Coolify by that **digest** (`image@sha256:…`; never a tag). Migrations run forward only.
3. **Read-backs** (`node apps/h2o/ops/ci/readback.mjs <base-url> <expectations.json>`; start from `readback.review.template.json`; GET only, prints PASS/FAIL names, never a body): ready 200 · noindex (review phase) · home/contact/parts · CRM sign-in page and the signed-out redirect · the quote-form registry · **content read-back for Payload-global-driven chrome**: the live text of every site-chrome / footer / menu string this release changed is present, the old code-default text is absent (site-chrome overrides the code defaults) · nothing contains localhost/sslip/staging.
4. Also confirm the running container's image ID/digest = the one deployed, and the revision label = the head.
5. Update the repository variables `H2O_DEPLOYED_SHA` / `H2O_DEPLOYED_DIGEST` to the new head and digest.
6. **Rollback = redeploy the previous digest** (the previous value of `H2O_DEPLOYED_DIGEST`; GHCR keeps the last 5 tags plus every deployed digest). **Never `migrate:down`.** Migrations are additive, so the previous code runs on the new schema.

## Fresh-DB rehearsal (Commander step on FULL releases; not in CI)
The contract (dry / apply / rerun) is produced by these repo entry points, run in this order against a fresh DB with the release image or a mounted checkout (the same pattern as the import CLI):
1. Authority import: `payload run src/content/import/cli.ts -- import <outDir> [authorityRoot]`.
2. SEO pass: `node ops/seo-pass/apply-seo-pass.mjs --dry-run --expectations=expectations.fresh-db.json` (exit 3 = count mismatch, STOP), then `--apply`, then the same `--dry-run`/`--apply` again as the **rerun** (expect 0 changes). Needs a running app + an admin: `H2O_SEO_BASE_URL`, `H2O_SEO_ADMIN_EMAIL`, `H2O_SEO_ADMIN_PASSWORD` (+ `H2O_SEO_ADMIN_TOTP_SECRET`); it refuses h2ocooling.com. Current contract (CT 2026-10-09): redirects 403/18, SEO 491, H1 37, restored 23, slotFixes 324, hygiene 171, blocked 0 (the repo's `data/expectations.fresh-db.json` is the source the script reads; keep it in step).
3. Catalog: `payload run src/content/import/cli.ts -- catalog-seed <outDir>` (dry-run) then `… --apply`, then the rerun: **181 / 42 / 12, rerun 0**.
4. `ops/seo-pass/check-conformance.mjs` and `check-redirect-chains.mjs` against the app.
**Why it is not a CI job:** it needs a running Payload app (the built image started against a database), a synthetic admin with a TOTP secret, and exact container commands that only the Commander's recipe has exercised; I could not run Actions or those containers here, and a blind job would sit red on every release. If the Commander confirms the exact commands, the clean shape is a FULL-only job that starts the candidate image against a Postgres service container with a throwaway synthetic admin (no secrets) and runs steps 1–4 with the contract numbers from the repo.

## Site-chrome (the UPDATE-1 HOLD)
The published `site-chrome` global **overrides the code defaults** (header navigation, footer columns, footer copy), so a release that changes `DEFAULT_SITE_CHROME` is invisible until the global is brought in line.
- **Before the redeploy (read-only diff):** `payload run ops/ci/chrome-diff.ts -- '--fail-on=footer.columns[0],navigation'` lists every field where the published global differs from the code defaults at the release head (`path | default | published`, site content only, writes nothing; exit 1 when a differing path is under a `--fail-on` prefix). Run it where the import CLI runs (needs the checkout at the release head and the app's `DATABASE_URI`). A difference under a field this release changed means a content step (SITE-CHROME-SYNC) is needed.
- **After the redeploy (live read-back):** the `chrome:` checks in `readback.review.template.json` read the LIVE footer and header: the footer "Useful Links" column has About ICS / All Projects / Resources Library / Technical Articles / Brochures / Tools / Contact Us and neither "Expert Industrial Cooling Solutions" nor "Search"; the header Parts → Fans menu shows Hudson / TUF-LITE II / III / IV / Howden / Moore. `region` limits a check to the `<footer>` or `<header>` element.

## What CI deliberately does not do
Deploy; hold Coolify/SSH/VPS credentials; touch DNS/Cloudflare; read or print any secret (the workflow's secrets are never interpolated into a run script; tests enforce it).

## Hardening to do before it goes live
Pin the third-party actions by commit SHA (they are on version tags now); Security Auditor review of the workflow; a first dry run with `H2O_RELEASE_CI_ENABLED=true` on a throwaway branch and a throwaway package tag.
