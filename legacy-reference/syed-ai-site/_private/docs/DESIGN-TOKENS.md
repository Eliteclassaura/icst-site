# Design tokens — syed.ai

Everything visual is defined once, in the `:root` block at the top of
`assets/css/site.css`. Nothing below that block contains a raw font size or
colour, which is verified: a grep for `font-size:` outside the token block
returns zero results.

Use this file to rebuild the system in Figma (as variables) or Elementor
(as a Global Kit), then delete the CSS.

---

## Colour — 13 tokens

| Token | Hex | Role | Figma variable | Elementor global |
|---|---|---|---|---|
| `--c-bg` | `#060504` | Page ground | `color/bg` | Primary background |
| `--c-surface-1` | `#0E0C09` | Panels, stat cells | `color/surface/1` | — |
| `--c-surface-2` | `#191510` | Raised cards, inputs | `color/surface/2` | — |
| `--c-surface-3` | `#241F17` | Meter tracks, wells | `color/surface/3` | — |
| `--c-line` | `#443C2E` | Visible borders | `color/line` | — |
| `--c-line-soft` | `#272219` | Internal dividers | `color/line/soft` | — |
| `--c-text` | `#F7F5F0` | Primary text | `color/text/1` | Text |
| `--c-text-2` | `#C9C3B6` | Body copy | `color/text/2` | — |
| `--c-text-3` | `#948D7B` | Captions, labels | `color/text/3` | — |
| `--c-gold` | `#CFAF67` | Accent, buttons, links | `color/gold` | Accent |
| `--c-gold-light` | `#EBD59F` | Numerals, emphasis | `color/gold/light` | Secondary |
| `--c-gold-dark` | `#8A6A30` | Gradient stop, quiet accent | `color/gold/dark` | — |
| `--c-on-gold` | `#0A0806` | Text on gold fills | `color/on-gold` | — |
| `--c-alert` | `#D06A60` | Errors, "not cited" | `color/alert` | — |
| `--c-live` | `#7DAE8A` | Shipped status | `color/live` | — |

**Contrast check.** `--c-text` on `--c-bg` is roughly 17:1. `--c-text-2` on
`--c-bg` is roughly 11:1. `--c-text-3` on `--c-bg` is about 5.4:1, so it is
used only at label and caption sizes, never for running text. `--c-gold` on
`--c-bg` is about 8:1. All pass WCAG AA; the first two pass AAA.

---

## Type — two families, ten steps

**Rule that keeps it consistent:** Bodoni Moda is used for `h1`, `h2` and
numerals **only**. Below roughly 28px its hairline strokes disappear on a dark
ground, so every card title, label and paragraph is Jost. Break this rule and
the page immediately reads as harder to scan.

| Family | Weights | Used for |
|---|---|---|
| `--font-display` — Bodoni Moda | 500 | `h1`, `h2`, all numerals |
| `--font-text` — Jost | 400, 500, 600 | Everything else |

### Scale

| Token | Size | Weight | Line height | Tracking | Used for |
|---|---|---|---|---|---|
| `--fs-d1` | `clamp(34px, 4.6vw, 68px)` | 500 | 1.06 | +0.01em | Page `h1`, score gauge |
| `--fs-d2` | `clamp(28px, 3.2vw, 46px)` | 500 | 1.1 | +0.01em | View `h2` |
| `--fs-d3` | `clamp(24px, 2.4vw, 34px)` | 500 | 1.16 | +0.01em | Section `h2`, prices, tier names |
| `--fs-h3` | `20px` | 500 | 1.4 | 0 | Card titles, FAQ questions |
| `--fs-h4` | `18px` | 500 | 1.4 | 0 | Step titles, glossary terms |
| `--fs-lead` | `18px` | 400 | 1.65 | 0 | Intro paragraphs, hero lede |
| `--fs-body` | `17px` | 400 | 1.72 | 0 | Body copy |
| `--fs-sm` | `15px` | 400 | 1.68 | 0 | Secondary copy, table rows |
| `--fs-cap` | `13px` | 400 | 1.6 | 0 | Notes, citations, nav links |
| `--fs-label` | `11px` | 600 | 1.4 | +0.14em, uppercase | Eyebrows, buttons, labels, pills |

### Numerals

| Token | Size | Used for |
|---|---|---|
| `--fs-n1` | `clamp(44px, 4.6vw, 62px)` | Evidence figures (90%, 4.4×) |
| `--fs-n2` | `34px` | Stat cells, model outputs |
| `--fs-n3` | `22px` | KPI figures, before→after deltas |
| `--fs-n4` | `14px` | List index numbers |

All numerals use `font-variant-numeric: tabular-nums` so columns align.

---

## Space — 8-point, 8 steps

| Token | Value | Typical use |
|---|---|---|
| `--s-1` | 4px | Tight label gaps |
| `--s-2` | 8px | Inside chips and pills |
| `--s-3` | 12px | Button gaps, list rows |
| `--s-4` | 16px | Field gaps, card internals |
| `--s-5` | 24px | Panel padding, grid gutters |
| `--s-6` | 40px | Page gutters, column gaps |
| `--s-7` | 64px | Section padding on mobile, wide column gaps |
| `--s-8` | 96px | Section padding on desktop |

---

## Shape and motion

| Token | Value | Note |
|---|---|---|
| `--radius` | `0` | Every corner is square. This is the single strongest brand signal in the system — do not soften it. |
| `--nav-h` | `68px` | Sticky header height; sticky offsets reference it |
| `--maxw` | `1400px` | Content container |
| `--dur` | `0.2s` | Standard transition |
| `--ease` | `cubic-bezier(.2,.8,.3,1)` | Standard easing |

Signature elements, in case you rebuild them by hand:

- **Foil rule** — 2px tall, `linear-gradient(90deg, gold-dark 0%, gold 36%, gold-light 50%, gold 64%, gold-dark 100%)`. Marks brand moments only.
- **Monogram** — 38×38px, 1px `--c-gold-dark` border (goes `--c-gold` on hover),
  `linear-gradient(150deg, surface-2, bg)` fill, holding a 26px inline SVG: a
  single open "S" stroke in `--c-gold` at 1.7 weight with round caps, and a
  1.9r `--c-gold-light` dot at its lower terminal. The dot is the period in
  `syed.ai` — it is the whole idea of the mark, so do not remove it or centre it.
  Source of truth is `assets/img/favicon.svg`; `logo.svg` is the same path with
  the wordmark set beside it, and the two PNGs are rasterised from those.
- **Wordmark** — `syed` in Jost 600 at `--fs-h3`, letter-spacing 0.01em,
  `--c-text`; `.ai` in Jost 400, `--c-gold`. Lowercase always — it is a domain,
  not a name. The line beneath is `SYED ABDUL · AI SEARCH` at `--fs-label`,
  0.18em, `--c-text-3`, and it carries the person for E-E-A-T; hidden ≤900px.
  **Not Bodoni.** Didone hairlines disappear below ~28px on this dark ground,
  which is why display type is reserved for `h1`/`h2` and numerals.
- **Sheen** — a 240px radial gold glow at 10% opacity that tracks the cursor across cards. Pointer devices only.

---

## Breakpoints

| Width | What changes |
|---|---|
| `≤ 1320px` | Keyboard hint hides in the nav |
| `≤ 1180px` | Two-column splits collapse to one; 3-up grids become 2-up; sticky columns unstick |
| `≤ 900px` | Nav becomes a scrolling row and the wordmark subline hides; hero flips to a bottom-anchored scrim; mobile action bar appears; FAQ and glossary go single column |
| `≤ 600px` | Everything single column; third KPI hides on cards |

---

## Elementor notes

1. Site Settings → Global Colors: create the 15 colours above. Map
   `--c-bg` to Primary background, `--c-gold` to Accent.
2. Site Settings → Global Fonts: create four typography presets from
   `--fs-d1`, `--fs-d3`, `--fs-body`, `--fs-label`. Those four cover most of
   the page; add the rest as you hit them.
3. Site Settings → Layout: content width 1400px, widget space 24px.
4. Theme Style → set default border radius to 0 globally. This is the fastest
   way to stop Elementor's defaults fighting the design.
5. The answer simulator, command palette, revenue model and scorecard are
   custom JavaScript. In Elementor they belong in an HTML widget with
   `assets/js/site.js` enqueued — they will not survive being rebuilt as
   native widgets.

---

## Content components added for snippet capture

Three components exist to be extracted by search engines and assistants. Rebuild
them with the same semantics or they stop earning anything.

| Component | Class | Non-negotiable structure |
|---|---|---|
| Key takeaways | `.takeaway` | `<ul>` of 5–7 items, each opening with a `<strong>` claim that stands alone. 2px `--c-gold` left border, gradient fading to transparent at 60%. |
| Comparison table | `.tbl` inside `.tbl-wrap` | A real `<table>` with `<caption>`, `<thead>`, `scope="col"` on headers and `scope="row"` on the first cell of each row. `min-width:640px` and the wrapper scrolls — never let it reflow into stacked divs. |
| Glossary | `.gloss` | A real `<dl>` with one `<div class="gloss__i">` per `<dt>`/`<dd>` pair. Two columns, collapsing at 600px. Every term also exists as a `DefinedTerm` node in the JSON-LD. |

---

## Chat brief

The launcher and panel use only the tokens above — no new colours, no new type
sizes. Three variables of its own live on `:root`:

| Token | Value | Note |
|---|---|---|
| `--chat-w` | `392px` | Panel width; clamped to `100vw - 48px` |
| `--chat-inset` | `var(--s-5)` | Distance from the viewport corner |
| `--fab-h` | `56px` | Launcher height; the panel and teaser stack off it |

Rules that keep it working:

- **The launcher is gold and the panel is not.** Only one thing on screen should
  read as the primary action; once the panel is open the launcher becomes a
  neutral close button.
- **Bot bubbles are `--c-surface-2` with a soft border; the visitor's are solid
  gold.** That is the only place two-sided colour appears in the system, and it
  is what makes a transcript scannable at a glance.
- **Below 900px the launcher lifts by 58px** to clear the mobile action bar.
  Below 600px the panel becomes a full sheet, `body.chat-on` locks page scroll
  and the action bar hides.
- **`prefers-reduced-motion` removes the typing delay entirely**, not just the
  animation — the questions arrive immediately rather than pretending to type.
- **The panel never traps focus.** It is a non-modal `role="dialog"`; Escape
  closes it and focus returns to the launcher.

### Breakpoint additions

| Width | What changes |
|---|---|
| `≤ 1500px` | Keyboard hint hides in the nav so the CTA keeps its space |
| `≤ 900px` | Chat launcher lifts above the mobile action bar |
| `≤ 600px` | Chat becomes a full-screen sheet; page scroll locks |

### The nav is the one place flex shrinking is deliberate

`.nav__links` carries `flex:0 1 auto; min-width:0` and scrolls horizontally.
Without `min-width:0` a flex item keeps its intrinsic width, which is what
pushed the CTA off the right edge at every width between 1024px and 1440px —
including the two most common laptop widths. If you add a nav item, re-check
that range rather than only 1920.
