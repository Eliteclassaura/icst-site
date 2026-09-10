> **Reviewer handoff, C5.5 remainder — 2026-09-10.** This is the generated `HANDOFF.md` from
> `pnpm design:bundle --site syed-ai` (refreshed by `pnpm design:gates`), copied here as the
> checkpoint's design handoff and extended with the client pack below. It is regenerated with every
> bundle; the live copy lives at `apps/syed-ai/design/ds-bundle/HANDOFF.md` (gitignored, reproducible).

# Design handoff — syed-ai

**Manifest** `f5bd04fe44a13a25` · **contract** `3e3480adc938bcf3` · **registry** `ae563c5887736afa` · **revision** `c8` · **identity** `syed-ai` · **fonts** `inline`

> 0 blocking finding(s), 0 advisory. Design signature: accent hsl(42 52%) · dark ground · Bodoni Moda / Jost · radius 0px · scale ×4.00.

## Versions

| Component     | Version            |
| ------------- | ------------------ |
| contract      | `3e3480adc938bcf3` |
| design-bundle | `0.1.0`            |
| registry      | `ae563c5887736afa` |
| revision      | `c8`               |

## Gates

| Gate            | Result  |
| --------------- | ------- |
| bundle-safety   | ✅ pass |
| determinism     | ✅ pass |
| distinctiveness | ✅ pass |
| render-check    | ✅ pass |
| residue         | ✅ pass |

Responsive QA viewports: 360, 390, 768, 1024, 1440. Cards are emitted at 1440 and 390 and are only faithful when opened at the width they declare — a static card cannot make a viewport media query resolve against anything else.

## Artboards

| Path                                        | Kind             | Viewport | KiB   | SHA-256        |
| ------------------------------------------- | ---------------- | -------- | ----- | -------------- |
| `components/breadcrumb/default-1440.html`   | component-card   | 1440     | 184.9 | `de6165a49061` |
| `components/breadcrumb/default-390.html`    | component-card   | 390      | 184.9 | `f4767d07a3ad` |
| `components/briefForm/default-1440.html`    | component-card   | 1440     | 188.3 | `ab2590561fa1` |
| `components/briefForm/default-390.html`     | component-card   | 390      | 188.3 | `259913c66dbc` |
| `components/briefForm/submitted-1440.html`  | component-card   | 1440     | 186.6 | `daad2b4155b6` |
| `components/briefForm/submitted-390.html`   | component-card   | 390      | 186.6 | `034a76675b00` |
| `components/cta/default-1440.html`          | component-card   | 1440     | 186.3 | `ccf419c33c0a` |
| `components/cta/default-390.html`           | component-card   | 390      | 186.3 | `5ac96e226f10` |
| `components/cta/textOnly-1440.html`         | component-card   | 1440     | 185.1 | `119217b53cc1` |
| `components/cta/textOnly-390.html`          | component-card   | 390      | 185.1 | `bc410929402e` |
| `components/dataTable/default-1440.html`    | component-card   | 1440     | 186.4 | `5beafdd5131b` |
| `components/dataTable/default-390.html`     | component-card   | 390      | 186.4 | `4669fe1350e7` |
| `components/dataTable/price-1440.html`      | component-card   | 1440     | 186.0 | `77bdfe878364` |
| `components/dataTable/price-390.html`       | component-card   | 390      | 186.0 | `d0d13a99359b` |
| `components/evidenceGrid/default-1440.html` | component-card   | 1440     | 187.4 | `015b11f617ea` |
| `components/evidenceGrid/default-390.html`  | component-card   | 390      | 187.4 | `f11113b10771` |
| `components/faq/default-1440.html`          | component-card   | 1440     | 186.6 | `1142927b7882` |
| `components/faq/default-390.html`           | component-card   | 390      | 186.6 | `65cc5056b76a` |
| `components/footer/default-1440.html`       | component-card   | 1440     | 186.8 | `310b1a35eb27` |
| `components/footer/default-390.html`        | component-card   | 390      | 186.8 | `9ff73705aa51` |
| `components/glossaryList/default-1440.html` | component-card   | 1440     | 186.4 | `db95d002e95e` |
| `components/glossaryList/default-390.html`  | component-card   | 390      | 186.4 | `625370b3fe1c` |
| `components/header/default-1440.html`       | component-card   | 1440     | 185.6 | `0f2ab40341b3` |
| `components/header/default-390.html`        | component-card   | 390      | 185.6 | `3b57fadaa7d0` |
| `components/hero/default-1440.html`         | component-card   | 1440     | 186.5 | `c323c347a36e` |
| `components/hero/default-390.html`          | component-card   | 390      | 186.5 | `c544e9cc28c6` |
| `components/hero/plain-1440.html`           | component-card   | 1440     | 185.1 | `1805cdb07404` |
| `components/hero/plain-390.html`            | component-card   | 390      | 185.1 | `4343250706e6` |
| `components/offices/default-1440.html`      | component-card   | 1440     | 185.6 | `e44eb3290daf` |
| `components/offices/default-390.html`       | component-card   | 390      | 185.6 | `2d66032b5c0d` |
| `components/relatedLinks/default-1440.html` | component-card   | 1440     | 185.3 | `b7bf0483beab` |
| `components/relatedLinks/default-390.html`  | component-card   | 390      | 185.3 | `4a2064b204ee` |
| `components/richText/default-1440.html`     | component-card   | 1440     | 185.6 | `5b31d72ef0ca` |
| `components/richText/default-390.html`      | component-card   | 390      | 185.6 | `38843c1ba62e` |
| `components/richText/wide-1440.html`        | component-card   | 1440     | 185.2 | `4663034f2c83` |
| `components/richText/wide-390.html`         | component-card   | 390      | 185.2 | `bad593f824b7` |
| `components/steps/default-1440.html`        | component-card   | 1440     | 186.8 | `4a4a8fd52b9b` |
| `components/steps/default-390.html`         | component-card   | 390      | 186.8 | `18774d2f5681` |
| `components/steps/warnings-1440.html`       | component-card   | 1440     | 185.8 | `17cd0a062872` |
| `components/steps/warnings-390.html`        | component-card   | 390      | 185.8 | `c5a56611ad9f` |
| `components/subNav/default-1440.html`       | component-card   | 1440     | 185.1 | `3460e987effd` |
| `components/subNav/default-390.html`        | component-card   | 390      | 185.1 | `3fd966a80d5b` |
| `components/takeawayList/default-1440.html` | component-card   | 1440     | 186.3 | `13396d01296f` |
| `components/takeawayList/default-390.html`  | component-card   | 390      | 186.3 | `e4208cba0e70` |
| `foundations/chrome.html`                   | foundation-board | 1440     | 184.9 | `7ebe812b120a` |
| `foundations/colors.html`                   | foundation-board | 1440     | 189.4 | `fbf591bdde0b` |
| `foundations/radii-motion.html`             | foundation-board | 1440     | 185.1 | `3e36a47179ef` |
| `foundations/spacing.html`                  | foundation-board | 1440     | 186.7 | `86dd0475c4fa` |
| `foundations/type.html`                     | foundation-board | 1440     | 188.2 | `fa0f75d99cf8` |

## Typography rights and provenance

| Family      | Role    | Licence | In this bundle | Files                                                                                    |
| ----------- | ------- | ------- | -------------- | ---------------------------------------------------------------------------------------- |
| Bodoni Moda | display | OFL-1.1 | embedded       | `bodoni-moda-latin-standard-normal.woff2`, `bodoni-moda-latin-ext-standard-normal.woff2` |
| Jost        | text    | OFL-1.1 | embedded       | `jost-latin-wght-normal.woff2`, `jost-latin-ext-wght-normal.woff2`                       |

Fixture imagery is generated SVG, never a client photograph: image rights are a publish gate (R34), so a bundle carries nothing whose licence is unknown.

## Validation and warnings

No findings.

## Distinctiveness

No client's design system sits within the sameness threshold of another's.

## Sync status

**unavailable-in-this-session** — No /design-login in this session. Run /design-login in Claude Code on the owner’s machine, then retry; nothing has been pushed. This client’s design system has never been pushed.

Nothing in this handoff asserts that a design-system project holds this bundle. A sync is only recorded when a push returns a remote manifest hash from an interactive session on the owner’s machine (ADR-026 spike result 4).

## Client approval pack

`pnpm preview:pack --site syed-ai --pages /,/geo-pricing/,/geo-vs-seo/,/cited-not-recommended/,/glossary/ --base <running site>`

|                      |                                                                                 |
| -------------------- | ------------------------------------------------------------------------------- |
| Pages                | `/`, `/geo-pricing/`, `/geo-vs-seo/`, `/cited-not-recommended/`, `/glossary/`   |
| Viewports            | 390, 1440 (the five-viewport sweep is automated QA, not a client surface)       |
| Artefacts            | 71 — page screenshots, `.dc.html` artboards, the pack index and the stamped PDF |
| Contract             | `3e3480adc938bcf3` · registry `ae563c5887736afa` · identity `syed-ai`           |
| Bundle gates         | residue pass · render check pass                                                |
| Cross-client residue | clean (0 other-client literal(s) checked — there is only one client today)      |
| Findings             | 0 blocking, 0 advisory                                                          |

**Publication status: not published.** The pack is built and its manifest is clean; publishing it as
a private Artifact is the `design-pack` skill's step and a human's decision. Nothing in this
checkpoint published a pack or pushed a design system — see the sync status above.
