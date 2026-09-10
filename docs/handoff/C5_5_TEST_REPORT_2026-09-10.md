# C5.5 remainder — test report

**Date:** 2026-09-10 · **Base:** `a1d0864` (tag `c8`) · **Environment:** cloud sandbox, Linux, Node 22.22.2, pnpm 10.28.0, PostgreSQL 16.13 on a local socket, Chromium 1194.

Everything below was executed. Where something could not be executed here, it says so and names where it runs instead.

## 1. `pnpm check` — green (exit 0)

`typecheck` → `lint` + `lint:css` → `test` → `build` → `gates:scan` → **`skills:verify`** → `versions:check`.

| Stage                                                     | Result                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm typecheck` (8 projects)                             | pass                                                                            |
| `pnpm lint` (ESLint `--max-warnings 0`) + `pnpm lint:css` | pass                                                                            |
| `pnpm format:check`                                       | pass                                                                            |
| `pnpm test`                                               | **255 passed, 1 skipped**                                                       |
| `pnpm build`                                              | pass                                                                            |
| `pnpm gates:scan`                                         | ✔ residue scan clean                                                            |
| `pnpm skills:verify`                                      | ✔ 4 first-party (no executable content, 8 files pinned), 3 vendored pins intact |
| `pnpm versions:check`                                     | 30 packages match the lockfile                                                  |

### Unit and integration tests

| Suite                                                      | Before C5.5     | Now             |
| ---------------------------------------------------------- | --------------- | --------------- |
| `@factory/syed-ai` (threat model, intake, AI, foundations) | 112             | 112             |
| `@factory/agency-core`                                     | 28              | 28              |
| `@factory/design-contract`                                 | 17              | 17              |
| `@factory/providers`                                       | 12              | 12              |
| `@factory/seo-contracts`                                   | 12              | 12              |
| `@factory/quality-gates`                                   | 10 (+1 skipped) | 10 (+1 skipped) |
| `@factory/wordpress-import`                                | 4               | 4               |
| **`@factory/design-bundle` (new)**                         | —               | **60**          |
| **Total**                                                  | 195             | **255**         |

The 60 new tests break down as 27 threat-model tests (one per named threat, §3 below), 8 identity/injection tests, 6 font-rights tests, 5 manifest/handshake tests, 4 distinctiveness tests, 6 sync-truthfulness tests, 3 design-pull lane tests and 1 handoff-shape test.

## 2. Browser tests — 202 passed, 0 failed

Against the **standalone production build**, with the same environment CI uses (`DEV_ROUTES=1 TURNSTILE_REQUIRED=false VERIFICATION_ENFORCEMENT=warn TRUSTED_PROXY=xff`). Projects `chromium-360`, `chromium-1440`, `admin-chromium`: **202 passed, 73 skipped, 0 failed** (4.2 min). The skips are the two new design specs declining to repeat themselves in a second project — each drives its own viewports from inside one test.

| Spec                                                                                | Tests     | Result   |
| ----------------------------------------------------------------------------------- | --------- | -------- |
| `blocks.spec.ts` (axe over every fixture, no-JS parity, keyboard, reduced motion)   | unchanged | pass     |
| `smoke`, `redirects`, `intake`, `health`, `design-system`, `parity`                 | unchanged | pass     |
| **`design-qa.spec.ts`** — 22 fixtures × 5 viewports + the named phone-hero test     | **23**    | **pass** |
| **`design-cards.spec.ts`** — 49 artboards from `file://` + the font-resolution test | **50**    | **pass** |

### The 390 hero-overlap class, specifically

`@design-qa hero at 390: heading sits inside the section, on the scrim, with the actions clear of it` — **pass**. It asserts the heading's box is inside the section, the scrim spans the heading, the text column is positioned and follows the scrim in DOM order, the text column carries its own gradient below 900px, the lede starts below the title, and axe is clean at 390.

The overlap ADR-026's spike reported was the static card being displayed at desktop width. Diagnosed by measurement, not assumption: at a real 390 viewport the document does not scroll sideways, no two text boxes intersect, and the hero geometry is as designed.

### What the render check caught

| Finding                                                              | Fix                                                                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `page-has-heading-one` on all 44 component cards                     | a card is a document; added the screen-reader-only `<h1>` the `/dev/blocks` route already used |
| Console error on every card: `frame-ancestors` ignored in a meta CSP | removed from the card CSP                                                                      |
| 22 cards flagged `css-binding`                                       | the rule matched `scroll-behavior:`; added a leading-character guard                           |
| Footer and evidence cards flagged `external-resource`                | an anchor href is content, not a fetch; the rule now covers only resource-loading attributes   |

## 3. Threat-model coverage — 27 tests, one per named threat

| Threat                              | Test                                                                                                                                     | Result             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| ZIP traversal                       | `../../.ssh/authorized_keys` member refused, not extracted                                                                               | pass               |
| Absolute path member                | `/etc/cron.d/evil` refused                                                                                                               | pass               |
| Symlink (archive)                   | member with `S_IFLNK` refused                                                                                                            | pass               |
| Symlink (filesystem)                | a symlinked directory segment refused by `assertNoSymlink`                                                                               | pass               |
| Local file reads                    | drive letters, UNC, NUL, `.`/`..`, reserved names all refused                                                                            | pass               |
| Decompression abuse                 | 2 MB → ~2 KB entry refused on declared ratio; caps on entry, total and count; a lying header is a finding                                | pass               |
| Executable assets                   | extension, shebang and mode bit, in assets and archive members                                                                           | pass               |
| Executable skills                   | `skills:verify` refuses a script, an execute bit or a shebang in a first-party skill                                                     | pass (gate)        |
| MIME confusion                      | HTML wearing `.png` refused, and the disagreement reported                                                                               | pass               |
| Malicious HTML                      | script, event handler, `javascript:`, `<base>`, meta refresh, `srcdoc`                                                                   | pass               |
| Malicious embed / sandbox escape    | `<iframe>`, `<object>`, `<embed>`, `<applet>`, `foreignObject`                                                                           | pass               |
| Malicious XML                       | DTD internal subset, `<!ENTITY>`                                                                                                         | pass               |
| Malicious CSS                       | `@import`, `url(http…)`, `expression()`, `-moz-binding`/`behavior:`                                                                      | pass               |
| Malicious SVG                       | script, external `<image>`, external `<use>`, SMIL href animation; data-URL payload decoded and checked                                  | pass               |
| Malicious Lexical                   | rich text renders through the same `checkMarkup` as every other card body                                                                | pass (bundle gate) |
| Hostile external URLs               | only in-document, relative and declared `data:` URLs admitted                                                                            | pass               |
| Font exfiltration / malicious fonts | signature check, size cap, licence gate; a non-font "font" refused                                                                       | pass               |
| Cross-client leakage                | no client identifier in any shared fixture; a `--neutral` bundle grepped clean; cross-client deny-list in `design:gates` and in the pack | pass               |
| Secrets / auth leakage              | residue scanner over the built bundle; skills hold no credential                                                                         | pass               |
| iframe / embed paths                | refused in cards, boards and pack artboards                                                                                              | pass               |
| Control-character smuggling         | C0/DEL refused in markup and URLs                                                                                                        | pass               |

## 4. Design toolchain — executed end to end

| Command                                                                                                    | Result                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm design:bundle --site syed-ai --check`                                                                | ✔ deterministic: 53 files identical across two runs (manifest `f5bd04fe44a1`); 49 artboards; 0 blocking findings |
| `pnpm design:bundle --site syed-ai --neutral`                                                              | built; grepped for the pilot's name, person, profile link and three office cities — **0 occurrences**            |
| `pnpm design:gates --site syed-ai`                                                                         | ✔ residue scan clean; ✔ render check pass (hash-matched to this bundle)                                          |
| `pnpm design:signature`                                                                                    | ✔ 1 client, all distinct (threshold 0.18)                                                                        |
| `pnpm design:sync-status --site syed-ai`                                                                   | `unavailable-in-this-session` · "nothing has been pushed"                                                        |
| `pnpm preview:pack --site syed-ai --pages /,/geo-pricing/,/geo-vs-seo/,/cited-not-recommended/,/glossary/` | ✔ 5 pages × 2 viewports, 71 artefacts, 0 blocking                                                                |
| `pnpm skills:verify`                                                                                       | ✔ 4 first-party skills, 8 files pinned, 3 vendored pins intact                                                   |

Card sizes: largest 189 KiB (`foundations/colors.html`), against a 256 KiB cap. Every card carries both fonts inlined.

## 5. C8 regression — no change

| C8 behaviour                                                                       | Verified now                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/health` readiness with a real Postgres query and storage check               | `{"status":"ok","checks":{"database":"ok","storage":"ok"}}` HTTP 200                                                                                                                                      |
| `/api/live` liveness, dependency-free                                              | pass (`health.spec.ts`, 4 tests)                                                                                                                                                                          |
| 200/503 semantics, fixed key shape, no host leaks                                  | unchanged code path; `health.spec.ts` green                                                                                                                                                               |
| Trusted-proxy model (`TRUSTED_PROXY`, R62)                                         | unchanged; intake e2e green under `xff`, unit tests green                                                                                                                                                 |
| Docker / Compose / deploy docs, tag-only production, Environment approval, backups | untouched; no file under `.github/workflows/deploy.yml`, `compose.yaml`, `Dockerfile*` or `tools/scripts/backup.sh` was modified                                                                          |
| Residue, contracts, parity                                                         | `pnpm gates:scan` clean; `qa-report` and `deploy-event` emitted and validated against their contracts; **parity 0 blocking / 1 advisory across 5 routes** (the same pre-existing `/` word-count advisory) |

## 6. Not executed here — and where it runs

| Item                                                 | Why                                                                                      | Where                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `docker build`, image assertions, Compose smoke test | no Docker daemon in the cloud sandbox                                                    | CI `docker` job — still pending the owner's first push |
| Firefox and WebKit projects                          | sandbox runs Chromium only                                                               | CI                                                     |
| PR-only `guards` job                                 | needs a pull-request base                                                                | CI on the first PR                                     |
| `--fonts shared` end to end                          | needs the owner's `/design-login` to see how the pane resolves relative font URLs        | owner's Mac, when the first sync happens               |
| A real `design-sync` push                            | needs `/design-login`; the status model correctly refuses to claim one                   | owner's Mac                                            |
| A real `design-pull` against a live project          | needs an actual export; the reader is tested against hand-built hostile archives instead | owner's Mac, when the first export exists              |
| Backup restore drill                                 | Release 7 readiness gate                                                                 | never yet run (unchanged)                              |

## 7. Reproducing this run

```bash
pnpm install
cp apps/syed-ai/.env.example apps/syed-ai/.env   # set DATABASE_URI and PAYLOAD_SECRET
pnpm --filter @factory/syed-ai migrate && pnpm --filter @factory/syed-ai seed
pnpm check                                        # 255 tests + every gate

pnpm design:bundle --site syed-ai --check
pnpm --filter @factory/syed-ai build
mkdir -p apps/syed-ai/.next/standalone/apps/syed-ai/.next
cp -r apps/syed-ai/.next/static apps/syed-ai/.next/standalone/apps/syed-ai/.next/   # without this there is no CSS
cp -r apps/syed-ai/public apps/syed-ai/.next/standalone/apps/syed-ai/
(cd apps/syed-ai/.next/standalone/apps/syed-ai && \
  MEDIA_DIR=$PWD/../../../../media DEV_ROUTES=1 TURNSTILE_REQUIRED=false \
  VERIFICATION_ENFORCEMENT=warn TRUSTED_PROXY=xff node server.js &)

pnpm --filter @factory/syed-ai exec playwright test \
  --project=chromium-360 --project=chromium-1440 --project=admin-chromium
pnpm design:gates --site syed-ai
pnpm design:signature
pnpm parity:check --base http://localhost:3000 --json apps/syed-ai/test-results/parity.json
pnpm preview:pack --site syed-ai --pages /,/geo-pricing/ --base http://localhost:3000
```

If the intake specs fail with `429` / `ip-requests`, clear `rate_events` or wait out the hour, and confirm the server has `TRUSTED_PROXY=xff`. If a layout report says everything overflows, check that the page's stylesheet returns 200 before believing it.
