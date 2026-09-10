# Figma handoff contract

> **Status note (2026-09-05, ADR-026):** Figma is an _optional_ input. The primary design workflow is the design contract → registry blocks → design-system bundle and approval packs (`docs/design-packs.md`; built in C5.5). This contract remains for clients who arrive with Figma files; `from-figma-tokens` stays Release 3 and the Figma MCP validation step is off the critical path.

What a Figma file must contain for `from-figma-tokens` to compile it into `design-contract.json` without guesswork. A file that follows this reads as `declared` values; anything the adapter has to infer is labelled `inferred` and listed in the compile report for a designer to confirm.

## 1. Variables, not styles, for every token

Create Figma **variables** in collections named exactly:

| Collection      | Variables                                                                                                                                                                                                                                                                       | Maps to                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `color/palette` | raw colours, named freely (`gold`, `gold-light`, `bg`, …)                                                                                                                                                                                                                       | `palette`                  |
| `color/role`    | `canvas`, `surface`, `surface-raised`, `surface-well`, `text-primary`, `text-body`, `text-muted`, `accent`, `accent-light`, `accent-dark`, `accent-contrast`, `border`, `border-soft`, `control-border`, `success`, `warning`, `error` — each **aliased** to a palette variable | `colors`                   |
| `space`         | `1`…`8` (number, px)                                                                                                                                                                                                                                                            | `layout.spacing`           |
| `type/size`     | `d1`, `d2`, `d3`, `h3`, `h4`, `lead`, `body`, `sm`, `cap`, `label`, `n1`…`n4` — fluid steps as `min / preferred / max` triplets in the description (`34 / 4.6vw / 68`)                                                                                                          | `typography.scale`         |
| `type/weight`   | `reg`, `med`, `semi`, `heading`                                                                                                                                                                                                                                                 | `typography.weights`       |
| `type/leading`  | `tight`, `snug`, `base`, `d1`, `d2`, `d3`, `lead`                                                                                                                                                                                                                               | `typography.lineHeights`   |
| `type/tracking` | `label`, `display`                                                                                                                                                                                                                                                              | `typography.letterSpacing` |
| `radius`        | `base` (and others)                                                                                                                                                                                                                                                             | `layout.radii`             |
| `layout`        | `container-max`, `nav-height`                                                                                                                                                                                                                                                   | `layout.*`                 |
| `breakpoint`    | `phone`, `tablet`, `wide`, `keyboardHint` (the 1500px rule that reveals the command-palette hint — a media query, not a layout tier)                                                                                                                                            | `layout.breakpoints`       |
| `motion`        | `dur-base`, `ease-base` (string)                                                                                                                                                                                                                                                | `motion`                   |
| `z`             | `rail`, `chat`, …                                                                                                                                                                                                                                                               | `layout.zIndex`            |

Modes: a `dark` and/or `light` mode on the colour collections becomes `brand.colorScheme`.

Export with the Tokens Studio plugin (or Figma's native variables export) to `figma-tokens.json` in W3C DTCG format. Commit that file in the client app under `design/`; the compiler reads it, never the Figma API directly.

## 2. Fonts

Name the two families in a `type/family` collection: `display` and `text`, with the exact family name and the intended fallback stack in the description. State the licence and where the WOFF2 files come from (Fontsource package, foundry purchase, or Google Fonts/OFL). Variable fonts are preferred; note any axis the design depends on (Bodoni Moda depends on `opsz`).

## 3. Components and variants

Name components `Block/<Name>` with variants as Figma variant properties (`variant=solid|ghost`, `size=md|sm`) and interactive states as separate variants (`state=default|hover|focus|disabled`). Use Auto Layout everywhere; set min/max widths and wrapping so responsive intent is explicit. The adapter emits `components` from these names; the registry must implement each.

## 4. Pages and frames

One page per page **type** (home, service, article, glossary, …), each with a desktop (1440) and a phone (390) frame. Frames named `Page/<type>/<width>`. Sections inside a page frame are named after registry blocks (`Hero`, `Takeaway`, `EvidenceGrid`, …) so the blueprint can be read off the file.

## 5. Assets

Logos, monogram and icons as SVG components; photography at 1600 wide minimum with the intended aspect ratio noted (`16:9`, `4:5`, `1.91:1`). OG image frame at 1200×630.

## 6. Accessibility

Contrast is checked by the compiler, not by eye: any `color/role` pair used for text must reach 4.5:1 (3:1 for large text and control boundaries) or the compile fails. Put the intended _use_ of unusual pairs in the variable description so the adapter can declare it (`caption-only`, `decorative`).

## What the adapter will still infer

Shadows without a variable, line heights set only on text styles, grids without a variable, and anything named outside these conventions. Each inference shows up in the compile report with a suggested variable to create.
