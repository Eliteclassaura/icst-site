# Design packs — bundle, packs, skills, and the gates around them

> Decided in ADR-026 (2026-09-05), extended by ADR-027 (pipeline) and ADR-030 (C5.5 remainder, 2026-09-10). Built in C5.5. Replaces Figma as the primary design workflow; `figma-contract.md` remains the optional on-ramp for clients who arrive with Figma files.

## The principle

**The repository produces and verifies. Claude publishes. The ledger records.**

The repository never holds a Claude Design or Artifact credential, so publishing cannot run from CI — and it should not: publishing is a judgement step. Every design artefact is a deterministic build output with a hash manifest; the publish is a one-line request in a Claude session that runs a project skill; the approval goes into `content-verification-ledger.md`.

**Where each publish can run** (ADR-026 spike result 4): Artifact packs publish from any Claude session, cloud included. Design-system project sync needs a one-time `/design-login` in an interactive Claude Code session on the owner's Mac. A session that cannot sync **says so and stops** — see "Sync status" below, which is a computed value, not a claim.

## Two audiences, two surfaces

| Audience            | Surface                                                                       | What they do                                                                             | Depends on                |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------- |
| Client              | Published **Artifact pack page** (private link) + **PDF** delivered as a file | Read the design system and page previews, comment, write `APPROVED`                      | Repo output + Artifact    |
| Designer / operator | One **Claude Design system project per client**                               | Explore components, generate on-brand concepts, propose token edits in the contract file | Repo output + owner login |

Nothing client-facing depends on the Claude Design project. If that sync breaks, approvals continue.

## Commands

### `pnpm design:bundle --site <client> [--fonts inline|shared] [--neutral] [--check] [--out <dir>]`

Static render (`renderToStaticMarkup`) of every registry fixture at **1440 and 390**, plus five foundation boards, into `apps/<client>/design/ds-bundle/` (gitignored). `--check` builds twice and compares every byte — not just the manifest.

- `components/<block>/<fixture>-<width>.html` — one self-contained card each. First line `<!-- @dsCard group="…" name="…" viewport="…" -->`; inlined `tokens.css` → `fonts.css` → global → primitives → block CSS; `body { background: var(--color-canvas) }` so a dark contract never lands dark text on a light pane; a `Content-Security-Policy` meta of `default-src 'none'`; a screen-reader-only `<h1>` when the block does not own one. Fixture imagery is generated SVG, never a client photograph.
- **A card is faithful only at the viewport it declares.** A static file cannot make a CSS media query resolve against anything but the viewport it is displayed in — a 390 card opened in a 1440 frame runs the desktop rules. The card carries `<meta name="viewport" content="width=390">` and the render check opens it at 390. This is what ADR-026's spike observation 5 actually was.
- `foundations/{type,colors,spacing,radii-motion,chrome}.html` — Type shows the scale **and the font-rights notice**; Colors prints every declared pair with its measured contrast ratio.
- `tokens/design-contract.json` — the contract as published; `design:pull` diffs the remote copy of this file.
- `assets/fonts/*` — only for families whose contract `license` permits redistribution, with the licence text beside them. Others are dropped from the CSS, so the card renders the fallback stack, and the Type board says which and why (R49).
- `_factory/manifest.json` — `site`, `brand`, `contractHash`, `registryVersion`, `fontsMode`, `viewports`, the design signature, font rights, and every file's SHA-256. Also written to `apps/<client>/design/ds-bundle.manifest.json`, which **is committed**. It carries no timestamp and no git description: the committed manifest must be reproducible from the source tree alone.
- `_factory/handoff.json` + `HANDOFF.md` — the reviewer handoff (below).

Identity comes from the blueprint plus `apps/<client>/design/fixture-brand.json`, never from fixture literals; `--neutral` renders the shared "Studio Example" identity, which is what a preset ships as.

### `pnpm design:gates --site <client>`

Residue scan over the built bundle, with a cross-client deny-list assembled from every _other_ app's own brand facts (so client A's bundle is proven not to name client B), plus the render check's verdict — accepted only when `_factory/render-check.json` names this bundle's manifest hash. Writes `_factory/gates.json`, which the sync status reads.

### `pnpm design:signature [--new <client>]`

The distinctiveness gate. Each contract reduces to ten perceptual axes — accent hue and chroma, ground lightness, contrast spread, radius, spacing rhythm, type-scale ratio, the two families, whether they are a pair — and any pair closer than **0.18** is reported. **Blocking when one of the two is a new client** (a new site must be distinct by construction); advisory between two existing clients, because changing a live client's palette is a decision, not a build fix.

### `pnpm preview:pack --site <client> --pages /,/geo-pricing/ [--base <url>] [--viewports 390,1440]`

Playwright against a **running** site — before launch that is the seeded local or staging site, after launch the real one, so one path serves both and a pack cannot show stale copy. Produces, under `apps/<client>/design/packs/<date>-<hash>/` (gitignored):

- `pages/<slug>-<width>.jpg` — full-page screenshots at the review widths
- `pack/artboards/*.dc.html` — one artboard per page screenshot and per component card, each self-contained and each declaring its viewport
- `pack/index.html` — the page the `design-pack` skill publishes as a private Artifact
- `pack.pdf` — paginated, every page stamped with path, URL, viewport, contract hash and date
- `pack-manifest.json` — versions, artboards with hashes and viewports, the bundle's gate results, the residue result and any findings. The skill refuses to publish if `blocking > 0`.

Two review widths by default. The five-viewport sweep is automated QA (`design-qa.spec.ts`), not something a client reads; ten full-page screenshots per page make a pack nobody opens.

### `pnpm design:pull --site <client> --export <zip|dir>`

Reads a design-system export and writes the three-way change report to `apps/<client>/design/claude-design-export/`. The export is hostile input, so it goes through the archive limits and the path policy before anything is parsed (see "Safety"). Three lanes, and nothing else:

| Lane           | What happens                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tokens**     | Diffed against the local contract; a change is accepted only if every declared contrast pair it participates in still passes. Accepted values arrive as `declared`. |
| **Components** | A change request. Components are code-owned (A22, R47) — implement it in the block; never copy exported HTML in.                                                    |
| **Copy**       | A Payload editor task (R52). Copy lives in the CMS.                                                                                                                 |

Anything else — an executable, an unclassified file, a card that came back carrying script — is **refused by name** and reported.

### `pnpm residue:scan <dir>` · `pnpm skills:verify`

The residue scanner over any directory, and the skill trust gate (below). `skills:verify` runs in `pnpm check`.

## Sync status — computed, never claimed

`pnpm design:sync-status --site <client>` prints one of:

| Status                                     | Meaning                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `ok`                                       | This exact bundle was pushed; a recorded push returned a remote manifest hash.                              |
| `stale`                                    | The project holds an earlier bundle; this one is ready to push.                                             |
| `never-synced`                             | Ready to push; this client has never been synced.                                                           |
| `unavailable-in-this-session`              | This session cannot sync — cloud session, CI, or no `/design-login`. **Nothing has been pushed.**           |
| `blocked-residue` / `blocked-render-check` | A gate is red for this bundle; nothing publishes.                                                           |
| `blocked-handshake`                        | The project handshake refused (wrong site, wrong project type, or the project changed since the last pull). |
| `blocked-no-bundle`                        | No bundle has been built.                                                                                   |

CI and cloud environments are detected **before** a claimed `/design-login` is honoured, and `recordSync()` throws unless the push returned a remote manifest hash. A session cannot report a sync it did not perform (ADR-030 §5, R65).

## Publishing (Claude side — project skills)

Four first-party skills live in `.claude/skills/`: `design-sync`, `design-pack`, `design-pull`, `design-change`. Each is **Markdown plus a `policy.json`** — no scripts, no execute bits, no shebangs — and each declares the repository scripts it may run, what it writes, and what it refuses. `pnpm skills:verify` enforces that, pins every file by SHA-256 in `.claude/skills/MANIFEST.json`, re-checks the vendored third-party pins, and fails on a command the repository does not have, an external URL, or a mention of `curl`/`wget`/`npx`/`eval`/`chmod +x`.

**`design-sync`** — reads the status first and says it out loud; runs the handshake (project type is `design-system`; remote `site` matches or the project is empty; remote hash equals the last pull); pushes only changed files; never touches `_ds_manifest.json` or files it did not write; records the ledger row only after a push returns a remote hash.

**`design-pack`** — publishes `pack/index.html` as a **private** Artifact and delivers `pack.pdf` as a file (never linked from the page: the artifact sandbox blocks in-page downloads). Refuses a pack with blocking findings or a failed residue scan. Appends the ledger row; records the thread when a client writes `APPROVED`.

**`design-pull`** — runs the tool, never a hand-rolled `unzip`, and walks the report lane by lane.

**`design-change`** — the ADR-027 pipeline end to end, with its refusals: no external font link, no raw HTML or inline script, no `migrations/**` in a design PR without the `content-model` label, no copy in code, no baseline change without a ledger row, no deploy.

## Safety — what is refused

Design artefacts are static pictures of a design system, so they need no script, no network and no embedding. That makes an allow-list practical, and everything here **refuses rather than repairs** — rewriting invites a parser differential between the checker and the browser.

| Surface                  | Refused                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archives (`design:pull`) | path traversal, absolute paths, drive letters, UNC, NUL bytes, reserved names, symlink members, execute bits, ZIP64, entry-count / entry-size / total-size caps, declared **and** actual decompression ratio, a header that lies about its size                                                                                     |
| Assets                   | kind decided by signature (never by extension); extension/signature disagreement reported; executables by name, shebang or mode; size caps; empty files                                                                                                                                                                             |
| Markup and CSS           | `<script>`, inline event handlers, `javascript:`/`vbscript:`, `<iframe>`/`<object>`/`<embed>`, `<base>`, meta refresh, `<foreignObject>`, external resource URLs, external stylesheet links, `@import`, `url(http…)`, `expression()`, `-moz-binding`/`behavior:`, `srcdoc`, DTD subsets and entity declarations, control characters |
| SVG                      | everything above plus external `<image>`/`<use>` and SMIL animation of an `href`                                                                                                                                                                                                                                                    |
| Identity                 | any client identifier in a shared fixture; another client's identity anywhere in a bundle or pack                                                                                                                                                                                                                                   |

An outbound `<a href>` is **allowed**: a link is content, and a cited source or a profile link belongs in a design. A link does not fetch.

## Reviewer handoff

`_factory/handoff.json` and `HANDOFF.md` answer "what am I looking at, is it sound, has it been published?" in one file: versions and pins; every artboard with its kind, viewport, size and SHA-256; the gate results and the QA viewports; font rights and provenance per family, with the reason when one is not embedded; every finding split blocking/advisory; the distinctiveness result; and the sync status with an explicit sentence that nothing here asserts a project holds this bundle unless it does.

## Approval tiers

| Tier      | What is approved                    | Surface                         | When                              |
| --------- | ----------------------------------- | ------------------------------- | --------------------------------- |
| `system`  | Tokens and component library        | Pack page (components section)  | Onboarding, or on a preset choice |
| `page`    | Page composition and copy placement | Pack page (pages section) + PDF | Before build of each page type    |
| `staging` | The real page                       | Staging URL (parity-gated)      | Before launch                     |

## Rules

- Components are code-owned. A component edited inside Claude Design is a suggestion; it shows up as a change request and is discussed, not imported (A22, R47).
- Token edits are made in `tokens/design-contract.json` in the project; `design:pull` diffs it, values arrive `declared`, the contrast gate decides.
- No client photograph enters a bundle; fixtures use generated imagery. Page packs show real media because they screenshot the real site, which is already gated by image rights (R34).
- Bundles and packs never contain secrets, Turnstile keys or PII; fixtures are CSS-free and PII-free by construction (C4).
- Offboarding deletes the client's Artifact pages and Claude Design project — both agency-owned and listed in the ledger (R40).

## Still open

`--fonts shared` is emitted but unexercised: whether the design pane resolves relative font URLs cannot be verified without the owner's `/design-login`, so `inline` remains the default (ADR-026 spike result 2). `pnpm baselines:accept` and the ledger-coupled baseline gate are C9.

## Release 3 additions

Every preset shipped as a design-system project with a pack; `docs/claude-design-contract.md` — page frames named by registry block so a mockup made in Claude Design can be read back into a `site-blueprint.json` layout (built only once mockups are programmatically readable); optional `states` map on `defineBlock` for hover/focus/disabled cards; the full residue scanner.
