# Design contract

`design-contract.json` is the single, versioned intermediate format that every design source compiles into, and the only design input the rendering layer may consume (ADR-006). Figma variables, a Claude design package, and an existing site's CSS all become the same document; components read tokens, never a design tool.

## Shape (v1)

| Section         | Holds                                                                                                                                                                                                                                   | Notes                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `meta`          | client, name, sources consulted                                                                                                                                                                                                         |                                                       |
| `brand`         | name, wordmark, logo paths, `colorScheme`                                                                                                                                                                                               |                                                       |
| `palette`       | raw named colours                                                                                                                                                                                                                       | the legacy `--c-*` set for Syed AI                    |
| `colors`        | **roles**: `canvas`, `surface`, `surfaceRaised`, `surfaceWell`, `textPrimary`, `textBody`, `textMuted`, `accent`, `accentLight`, `accentDark`, `accentContrast`, `border`, `borderSoft`, `controlBorder`, `success`, `warning`, `error` | components use roles; the palette is for the compiler |
| `typography`    | `display` and `text` font families (files, fallbacks, licence, optical rules), weights, fluid scale, line heights, letter spacing, measure, heading wrap, where uppercase is allowed                                                    |                                                       |
| `layout`        | spacing, container max, nav height, breakpoints, grids, radii, borders, shadows, z-index                                                                                                                                                |                                                       |
| `motion`        | durations, easings, reduced-motion policy                                                                                                                                                                                               |                                                       |
| `focus`         | outline and offset                                                                                                                                                                                                                      |                                                       |
| `components`    | named variants and states the registry must implement                                                                                                                                                                                   |                                                       |
| `images`        | aspect ratios and art-direction notes                                                                                                                                                                                                   |                                                       |
| `accessibility` | contrast pairs (each with a declared _use_) and notes                                                                                                                                                                                   |                                                       |
| `legacyVars`    | legacy CSS custom properties preserved verbatim                                                                                                                                                                                         | parity gate                                           |

Every value is `{ value, source }` where `source.kind` is `declared` (a decision), `inferred` (derived from an artefact, with a `file:line` ref) or `default` (compiler fallback). This is what stops an inference from being mistaken for a decision six months later.

## Compiler

```
pnpm --filter @factory/syed-ai design:contract   # from-css: legacy site.css → design/design-contract.json (+ fonts into public/fonts)
pnpm --filter @factory/syed-ai design:compile    # → src/design/generated/{tokens.css, fonts.css, tokens.ts, contrast-report.json}
```

Emitters are deterministic (tested: two runs are byte-identical). `tokens.css` contains the legacy variables verbatim **and** semantic aliases (`--color-canvas`, `--color-accent`, …); `fonts.css` carries `@font-face` for self-hosted WOFF2 with `unicode-range` subsets and the display face's optical rules; `tokens.ts` exposes values to code that needs them (charts, `theme-color`, e-mail); `contrast-report.json` records every declared pair's ratio against WCAG 2.2 AA for its use. The compile exits non-zero on any contrast failure.

## Adapters

- **`from-css`** (built): parses every `:root{}` declaration with line numbers, maps the Syed AI naming scheme onto roles, reads heading weight/opsz from rules, observes breakpoints from media queries, harvests literal shadows. Everything labelled `inferred`.
- **`from-figma-tokens`** (Release 3, optional): `figma-tokens.json` (W3C DTCG format) → contract; requires the handoff rules in `docs/figma-contract.md`.
- **`from-claude-design`** (Release 3; ADR-026): diffs the `tokens/design-contract.json` that `design:bundle` placed in the client's Claude Design system project against the local contract; changed values arrive `declared`, the contrast gate decides, the compile report lists affected blocks. Component HTML in the project is never imported (A22).

## Design-system bundle (C5.5; ADR-026)

A fourth emitter output: `pnpm design:bundle --site <client>` renders every registry fixture at 1440 and 390 into self-contained HTML cards plus foundation boards, with `_factory/manifest.json` and licence-gated fonts. See `docs/design-packs.md`.

## What the Syed AI derivation found

- 54 legacy custom properties, 15 palette colours, 10-step fluid type scale, 4 numeral sizes, 8-step spacing, `--radius: 0`, breakpoints 1500/1180/900/600.
- Heading weight is **600** in CSS (`DESIGN-TOKENS.md` says 500) — CSS wins (A1); recorded in the source note.
- **One accessibility failure in the legacy design:** form inputs use `--c-line` (#443C2E) on `--c-surface-2` (#191510) = 1.67:1, below WCAG 1.4.11's 3:1 for control boundaries. The contract adds a `controlBorder` role using the palette's quiet gold (#8A6A30 → 3.62:1) as a `declared` deviation. Hairline dividers stay decorative and exempt. Every other declared pair passes; body text is 18.7:1.
- No shadow tokens existed; four literal shadows were harvested and named.

## Fonts

Bodoni Moda (variable, `opsz`+`wght`, latin + latin-ext) and Jost (variable, `wght`, latin + latin-ext) are self-hosted from pinned Fontsource packages (`@fontsource-variable/*` 5.3.0), SIL OFL 1.1, licence files copied to `public/fonts/`. Two files are preloaded (~73 KB total); latin-ext loads only when needed via `unicode-range`. No request to Google Fonts (e2e-asserted). The display face keeps the legacy `font-optical-sizing: none; font-variation-settings: "opsz" 14` — the text cut's sturdier hairlines on a dark ground.

## Design-system layer (`@factory/agency-core/design-system`)

`global.css` (reset, typography primitives `.t-*`, `.num`, `.prose` measure, focus, reduced motion) and `primitives.css` + React primitives: `Container`, `Stack`, `Band`, `Prose`, `Rule`, `Button`, `Link`, `Label`, `Num`, `Table`, `Dl`, `Field`. All values are tokens; the `factory/no-hex-in-components` lint rule enforces it for blocks. Primitives use a prefixed `.ds-*` stylesheet rather than CSS Modules so they can ship from a package without bundler coupling; page blocks in the app use CSS Modules (ADR-007, refined).

Preview: `/dev/tokens/` (requires `DEV_ROUTES=1`; 404 otherwise) renders roles, scale, primitives and the contrast report from the compiled output.
