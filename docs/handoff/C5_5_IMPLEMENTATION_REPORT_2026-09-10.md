# C5.5 remainder — implementation report

**Date:** 2026-09-10 · **Repository:** Agency Site Factory · **Branch:** `main` · **Base:** `a1d0864` (tag `c8`) · **Decision:** ADR-030 (ADR-026 and ADR-027 unchanged and still binding)

**Scope executed:** C5.5 remainder only. **C6.5 proper and C9 were not started.** No H2O-specific Factory, Payload or migration work was performed. No owner action was simulated.

---

## 1. What was built, by workstream

### A — a small, deterministic, safe design-bundle model

`@factory/design-bundle` (`tools/design-bundle`). `pnpm design:bundle --site <client> [--fonts inline|shared] [--neutral] [--check] [--out <dir>]` renders every registry fixture (16 blocks, 24 fixtures) at 1440 and 390 plus five foundation boards — **49 artboards, 53 files** for the pilot — with the design contract, licence-gated fonts and a hash manifest.

The build is a pure function over an injected `io`: no clock, no hostname, no unordered map, no temporary path. `--check` builds twice and compares **every byte**, not just the manifest. The committed artefact is `apps/<client>/design/ds-bundle.manifest.json`, and it deliberately carries **no timestamp and no git description** — a git description is a property of the checkout, so including it would make the committed manifest differ between a tagged working copy and CI's shallow clone, producing a determinism gate that fails for the wrong reason. The revision lives in the reviewer handoff, which is not committed.

Verified: `✔ deterministic: 53 files identical across two runs (manifest f5bd04fe44a1)`.

### B — reusable packs without template sameness or cross-client leakage

Two distinct problems, two mechanisms.

**Leakage.** Fixtures are now brand-neutral. Identity is written as `{{brand.*}}` placeholders and `{ $brandList: 'social' | 'offices' }` markers, resolved by `applyBrand()` from the client's blueprint plus a committed `apps/<client>/design/fixture-brand.json`. Six fixtures were neutralised (header, footer, hero, breadcrumb, dataTable, offices). `pnpm design:gates` scans a built bundle with a deny-list assembled from **every other app's own brand facts**, so client A's bundle is proven not to name client B. A `--neutral` bundle was built and grepped: zero occurrences of the pilot's name, person, social link or offices.

**Sameness.** `pnpm design:signature` reduces each contract to ten perceptual axes — accent hue and chroma, ground lightness, contrast spread, radius, spacing rhythm, type-scale ratio, the two families, whether they are a pair — and reports any pair closer than 0.18. **Blocking when one of the pair is a new client**; advisory between two existing clients, because changing a live client's palette is a decision, not a build fix. A copy of the pilot's contract scores 0.000 and is refused; a genuinely different system clears the threshold.

### C — skill trust and provenance, with no arbitrary code execution

Four first-party skills (`design-sync`, `design-pack`, `design-pull`, `design-change`), each **Markdown plus a `policy.json`** and nothing else. `pnpm skills:verify` (now part of `pnpm check` and CI) enforces:

- Markdown and JSON only; no scripts, no execute bits, no shebangs.
- `policy.json` declares `trust: first-party`, `executes: "none"`, an `allowedCommands` list every entry of which must be an actual `package.json` script (or one of seven allow-listed git/gh invocations), and a non-empty `refuses` list.
- No external URL in a `SKILL.md`; no mention of `curl`, `wget`, `npx`, `eval`, `base64 -d` or `chmod +x`.
- Every first-party file pinned by SHA-256 in `.claude/skills/MANIFEST.json`; vendored third-party pins re-checked with the same algorithm `install-skills.mjs` used to write them.

Vendored third-party skills do ship scripts — that is why they are vendored and pinned rather than trusted — and no first-party skill invokes them.

### D — the Artifact/artboard path, Lexical, fonts and hostile input

Cards are complete self-contained documents: `<!doctype html>`, a `Content-Security-Policy` meta of `default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'`, all CSS inlined in contract order, fonts base64'd, `body { background: var(--color-canvas) }`, and a screen-reader-only `<h1>` where the block does not own one. Payload's Lexical rich text renders correctly under `renderToStaticMarkup` (the spike's finding, now in production code).

`design-cards.spec.ts` opens all 49 artboards **from `file://`** — the strictest context they will meet, with no origin and no network — and asserts: the declared viewport is honoured, exactly one `main[data-block]`, the card paints its own background, zero axe violations, zero console errors, and **zero network requests of any kind**. A separate test asserts every font the manifest calls _embedded_ actually resolves inside the card. Result: **50/50 pass**.

Two defects were found and fixed by that check: a component card had no `<h1>` (a fragment is not a document), and `frame-ancestors` in a meta CSP makes every browser log an error — a card that logs on open fails its own render check.

### E — typography rights, fallback and overflow

`evaluateFont()` gates embedding on the contract's `license` (OFL / SIL / Apache / MIT / owned-redistributable), validates each file by **signature** rather than extension, enforces a size cap, requires a fallback stack ending in a generic family, and warns when `font-display` is not `swap` or a redistributable family ships without its licence text. A family that fails the gate has its `@font-face` **removed** from the card CSS — so the card renders the fallback stack the client will actually see — and is named, with the reason, on the Type board, in the manifest and in the handoff. Overflow and clipping are covered by workstream G rather than by card-only CSS: a card whose CSS differs from the site's would be a card that lies.

### F — the `/design-login` sync model, with statuses that cannot lie

`syncCapability()` derives the environment (`ci`, `cloud-session`, `owner-workstation`, `unknown`), detecting CI and cloud **before** honouring a claimed `FACTORY_DESIGN_LOGIN=1`, so exporting that variable in a cloud session still reports `cloud-session`. `recordSync()` throws unless the session could sync **and** the push returned a remote manifest hash. `ok` is reachable only for the exact bundle a recorded push covered.

Run from this session, `pnpm design:sync-status --site syed-ai` reports:

```
"status": "unavailable-in-this-session",
"synced": false,
"message": "No /design-login in this session. Run /design-login in Claude Code on the owner's
            machine, then retry; nothing has been pushed. This client's design system has
            never been pushed."
```

**No design system was pushed to any Claude Design project, and nothing in this checkpoint claims otherwise.**

### G — responsive and visual QA at 360, 390, 768, 1024 and 1440

`design-qa.spec.ts` drives all five widths over every fixture and asserts three mechanical failure classes: horizontal overflow (document scroll, or an element wider than the viewport outside a deliberately scrollable box), **text-on-text overlap** between leaf text elements, and clipping (excluding screen-reader-only and `clip-path` boxes, which are clipped on purpose). **23/23 pass.**

**The known 390 hero-overlap class is covered by name and resolved.** ADR-026's spike saw the hero media overlapping the heading at 390 in a static card. The cause was the static wrapper, exactly as the spike suspected but could not prove: _a static file cannot make a CSS media query resolve against anything but the viewport it is displayed in_, so a 390-wide card opened in a 1440 frame runs the desktop rules on a narrow box. Cards now declare their viewport and every check opens them there. At a real 390 viewport the phone hero is correct, and the test asserts specifically: the heading sits inside its section, the scrim spans it, the text column is positioned and follows the scrim in DOM order, the text column carries its own gradient below 900px (which is what actually keeps the phone heading legible over the photograph), the lede starts below the title, and axe is clean.

### H — asset safety

| Threat                                                                 | Where it is refused                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ZIP traversal, absolute paths, drive letters, UNC, NUL, reserved names | `safeRelativePath` / `readZipSafely`                                                                                                                                                                                                                                                  |
| Symlinks (archive member and on-disk path segment)                     | `readZipSafely`, `assertNoSymlink`                                                                                                                                                                                                                                                    |
| Decompression abuse                                                    | declared **and** actual ratio, per-entry, per-archive and entry-count caps; a header that lies about its size is itself a finding                                                                                                                                                     |
| Executable assets and skills                                           | extension, shebang, mode bit; enforced in assets, archive members and skills                                                                                                                                                                                                          |
| MIME confusion                                                         | kind decided by signature; extension/signature disagreement reported separately                                                                                                                                                                                                       |
| Malicious SVG / XML / HTML / CSS / JS / Lexical                        | `checkMarkup` / `checkCss` / `checkSvg`: script, event handlers, `javascript:`, embeds, `<base>`, meta refresh, `foreignObject`, `srcdoc`, DTD subsets, entity declarations, `@import`, `expression()`, bindings, control characters, external `<image>`/`<use>`, SMIL href animation |
| Hostile external URLs / font exfiltration                              | no external resource URL in any artefact; cards run under `default-src 'none'`; the render check asserts zero network requests                                                                                                                                                        |
| Cross-client leakage                                                   | fixture neutrality test, `design:gates` deny-list, pack-level check                                                                                                                                                                                                                   |
| Secrets / auth leakage                                                 | the existing residue scanner runs over the bundle; skills hold no credential and CI never publishes                                                                                                                                                                                   |
| Sandbox escape, iframe/embed paths                                     | embedding elements refused in every artefact; cards verified from `file://`                                                                                                                                                                                                           |

Everything **refuses rather than repairs**: sanitising by rewriting invites a parser differential between the checker and the browser, and a design artefact has no reason to accept input that needs repairing. One deliberate exception: an outbound `<a href>` is allowed, because a link is content and does not fetch.

### I — reviewer handoff

`_factory/handoff.json` + `HANDOFF.md`, emitted with every bundle: versions and pins; every artboard with kind, viewport, size and SHA-256; the gate table and the QA viewports; font rights and provenance per family with the reason when one is not embedded; findings split blocking/advisory; the distinctiveness result; and the sync status with an explicit sentence that nothing in the handoff asserts a project holds this bundle unless it does. `pack-manifest.json` carries the same shape for a client pack.

---

## 2. Exact changed files

**Added — `tools/design-bundle` (`@factory/design-bundle`)**
`package.json`, `tsconfig.json`, `eslint.config.js`, `run.mjs`,
`src/index.ts`, `src/cli.ts`, `src/bundle.ts`, `src/brand.ts`, `src/fonts.ts`, `src/manifest.ts`, `src/render.tsx`, `src/signature.ts`, `src/sync.ts`, `src/handoff.ts`, `src/pull.ts`,
`src/safety/index.ts`, `src/safety/paths.ts`, `src/safety/assets.ts`, `src/safety/markup.ts`, `src/safety/archive.ts`,
`test/safety.test.ts`, `test/brand.test.ts`, `test/design.test.ts`
_(removed: `tools/design-bundle/spike.tsx` — superseded by the package it seeded)_

**Added — elsewhere**
`tools/design-pack/pack.mjs` · `tools/scripts/verify-skills.mjs` ·
`.claude/skills/{design-sync,design-pack,design-pull,design-change}/{SKILL.md,policy.json}` ·
`apps/syed-ai/design/fixture-brand.json` · `apps/syed-ai/design/ds-bundle.manifest.json` (committed manifest) ·
`apps/syed-ai/src/lib/fixture-brand.ts` · `apps/syed-ai/e2e/design-qa.spec.ts` · `apps/syed-ai/e2e/design-cards.spec.ts` ·
`packages/agency-core/src/blocks/fixtures/brand.ts` · `docs/handoff/C5_5_*.md` (this report and the four beside it)

**Modified**
`package.json` (7 new scripts; `skills:verify` added to `check`) · `apps/syed-ai/package.json` (workspace dep) · `pnpm-lock.yaml` ·
`apps/syed-ai/src/seed.ts` · `apps/syed-ai/src/app/(site)/dev/blocks/[slug]/page.tsx` ·
`packages/agency-core/src/blocks/{header,footer,hero,breadcrumb,dataTable,offices}/fixture.ts` ·
`.claude/skills/MANIFEST.json` (first-party pins) · `.github/workflows/ci.yml` (5 new steps) · `.gitignore` ·
`CLAUDE.md` · `docs/decision-log.md` (ADR-030) · `docs/design-packs.md` (rewritten) · `docs/release-plan.md` (C5.5 status) · `docs/risks.md` (R63–R66)

---

## 3. Findings from doing the work

1. **A committed manifest must not contain a git description.** Caught before it shipped; see ADR-030 §1.
2. **Neutralising fixtures would have moved the parity baseline**, because `seed.ts` builds the chrome globals from them. Resolved by injecting identity in the seed through the same `applyBrand()` the bundle uses, with a test that asserts the resolved values reproduce the pilot's chrome strings byte for byte.
3. **A component card is not a page**, and a page needs one `<h1>`. Found by the render check; fixed by the screen-reader-only heading the `/dev/blocks` route already used.
4. **`frame-ancestors` is ignored in a meta CSP** and logs an error in every browser. Removed.
5. **`scroll-behavior:` matches a naive `behavior:` rule.** The CSS binding check needed a leading-character guard; found because it fired on 22 real cards.
6. **An outbound link is not an external resource.** The first version of the markup policy refused the footer's profile link and the evidence block's cited sources. Split into resource-loading attributes (refused) and anchor hrefs (allowed).
7. **A local `.next/standalone` server without `.next/static` copied in serves no CSS**, and the resulting "everything overflows" report is an artefact of the harness, not the site. Worth knowing before anyone reads a failing layout report: check that the stylesheet 200s first. CI's e2e step does the copy correctly.

---

## 4. Boundaries observed

- **C6.5 proper: not started.** No `service-accounts` collection, no automation role or hooks, no Automation review view, no per-service-account or proxy rate limiting, no Lane-B editorial integration, no `no-public-email` gate, no `privacyContactAlias`. See `C5_5_C6_5_BOUNDARY_REPORT.md`.
- **C9: not started.** `pnpm baselines:accept` and the ledger-coupled baseline gate remain unbuilt; the `design-change` skill names them as not yet available rather than pretending otherwise.
- **H2O: untouched.** No H2O Payload work, no migration work, no H2O content or page decisions.
- **Owner actions: not simulated.** The history rewrite, the first GitHub push, the first green Docker CI job, legacy-exposure R1, the GitHub Environment secrets and the production `TRUSTED_PROXY=cloudflare` setting all remain the owner's, undone and unclaimed.
- **ADR-028 not reopened.**
