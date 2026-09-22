---
name: ICS Commercial Presentation
description: Documentary industrial imagery, monumental type, and precise commercial navigation.
colors:
  signal: "#b2461c"
  oxide-light: "#d9603a"
  blue: "#0a4a6e"
  focus: "#0a79b4"
  carbon: "#0b1114"
  mineral: "#f2f0ec"
  white: "#ffffff"
  pale: "#f7f8f6"
  ink: "#2a363d"
  body-muted: "#46535c"
  inverse-muted: "#b6c2c9"
  divider: "#c6ccc7"
typography:
  display:
    fontFamily: "Archivo, sans-serif"
    fontSize: "80px"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-.038em"
  headline:
    fontFamily: "Archivo, sans-serif"
    fontSize: "50px"
    fontWeight: 600
  title:
    fontFamily: "Archivo, sans-serif"
    fontSize: "26px"
    fontWeight: 600
  body:
    fontFamily: "IBM Plex Sans, Helvetica, sans-serif"
    fontSize: "18px"
    lineHeight: 1.74
  index:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "13px"
  navigation:
    fontFamily: "IBM Plex Sans, Helvetica, sans-serif"
    fontSize: "16px"
    fontWeight: 500
rounded:
  flat: "0px"
  action: "2px"
spacing:
  index-gap: "12px"
  mobile-gutter: "20px"
  compact-gap: "24px"
  mobile-grid: "28px"
  shell-gap: "32px"
  tablet-grid: "40px"
  mobile-section: "64px"
  desktop-gutter: "88px"
  desktop-section: "130px"
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.white}"
    rounded: "{rounded.action}"
    padding: "12px 28px"
  search-field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.flat}"
    padding: "14px 20px"
  search-submit:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.flat}"
    padding: "12px 28px"
  navigation:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    height: "100px"
  product-index-item:
    textColor: "{colors.ink}"
    padding: "14px 0 0"
---

# Design System: ICS Commercial Presentation

## Overview

**Creative North Star: "Industrial documentary plates"**

The approved commercial artboards combine monumental engineering typography with authentic equipment photographs, carbon fields, mineral reading surfaces, and restrained oxide actions. Long canonical descriptions remain visible within the composition. Thin rules and indexed sequences supply structure without decorative card shells.

This record describes the implemented nine commercial routes and their shared shell. It derives from `luxury.css`, `luxury-fonts.css`, `LuxuryCanonical.tsx`, `LuxuryShell.tsx`, and the nine numeric models in `apps/h2o/content/luxury`. Supplied source HTML remains the authority for individual compositions; this document does not extend that approval to the other canonical page bodies.

**Key Characteristics:**

- Documentary equipment photography.
- Carbon and mineral section fields with oxide actions.
- Archivo headings, IBM Plex reading text, and Mono indices.
- Flat ruled lists and generous section spacing.

## Colors

The palette uses dark industrial neutrals, warm mineral fields, oxide calls to action, and functional blue.

### Primary

- **Signal oxide:** filled RFQ actions and indices on light backgrounds.
- **Light oxide:** rules and index accents on carbon backgrounds.

### Secondary

- **Engineering blue:** search controls, linked canonical remainder content, and selection backgrounds.
- **Focus blue:** visible keyboard focus outlines.

### Neutral

- **Carbon:** dark sections, image backplates, and footer.
- **Mineral:** reading and canonical remainder sections.
- **White / Pale:** header, input surfaces, and alternate equipment panels.
- **Ink / Muted body:** primary and supporting reading text on light fields.
- **Inverse muted:** supporting text on carbon fields.
- **Divider:** thin rules between entries on light fields.

**The Action Signal Rule.** Use signal oxide for established commercial actions; use engineering blue for search and canonical reading links.

## Typography

Archivo supplies headings; IBM Plex Sans supplies reading text and controls; IBM Plex Mono supplies numeric indices and utility labels. Local fonts use swap loading: Archivo has weights 400–700, Plex Sans 400–600, and Plex Mono 400–500.

The frontmatter records representative reused roles, not a forced global scale. Desktop artboards retain their actual heading sizes: hero display spans 66–92px; section headings commonly use 44–62px; titles commonly use 23–34px. Body passages commonly use 16.5–19px with line heights around 1.66–1.74. Model-specific tracking and measure remain attached to their original layouts.

At widths through 768px, semantic h1/h2/h3 nodes become 44/32/26px; the homepage h1 uses 38px. Reading-type nodes become 17px with 1.5 line height, display-three nodes become 25px with 1.2 line height, and Mono becomes 12px with 1.6 line height. Keep these role overrides even when canonical heading semantics differ from visual rank.

**The Canonical Reading Rule.** Preserve complete canonical text and semantic headings while applying the approved visual role to their containers.

## Layout

Desktop artboards repeatedly use 88px side gutters and 130px vertical section padding, with larger 150px sections and route-specific exceptions. Split grids commonly use 88px or 96px gaps. Preserve these deliberate variants rather than normalizing every route to one hero.

From 769–1300px, commercial sections use 5vw side padding and two-column grids with 40px gaps. Desktop h1 nodes use 64px in that range. At 1020px and below, the desktop navigation and header RFQ yield to an expandable native menu. At 768px and below, sections use 64px vertical padding and 20px gutters, normal grids stack with 28px gaps, and fixed dimensions relax. Indexed rows retain a narrow index column beside content; equipment-containment grids remain two columns.

The header changes from 100px to 60px at the mobile breakpoint. The homepage image hero changes from 868px to 540px; its image fills the mobile hero with the approved dark overlay and text positioned above it. The footer moves from five columns to three in the tablet range, then two with full-width brand and office blocks on mobile. The complete parts index changes from four columns to two.

Verification viewports are 390, 768, 1024, and 1440px; these are evidence widths, not four CSS breakpoints. The scoped finish evidence is in `../luxury-evidence/review-fix-2`.

## Elevation & Depth

Section fields, image crops, controlled photo overlays, and thin rules create depth. Content panels have no general shadow system. The mobile navigation has one functional overlay shadow, recorded in the sidecar. Route-specific gradients belong to image legibility treatments. No animation vocabulary is established; reduced-motion mode disables animation, transitions, and smooth scrolling.

## Shapes

Images, fields, grids, and search controls have square corners. Filled RFQ actions have the small action radius. Light lists use thin dividers; stronger section starts use 2px rules. Decorative borders do not enclose every text block.

## Components

### Buttons

Filled oxide links use white semibold Plex text, a minimum height of 56px, and centered content. Model actions retain their specified desktop size; mobile actions become full width. Shared links underline on hover. Keyboard focus uses a 3px focus-blue outline offset by 5px. No additional hover lift or motion is present.

### Inputs / Fields

Search is a native GET form targeting `/search/`, with a visible or screen-reader label, a white input, carbon 1px outer border, blue submit button, and minimum form height of 60px. The field remains flexible; do not replace the label with placeholder-only identification.

### Navigation

The white header combines the approved logo, commercial links, and an RFQ action. Mobile navigation is a native details/summary control with a 48px trigger and SVG menu icon. Expanded links have generous row padding and bottom rules. The footer uses grouped navigation and owner-authorized offices on carbon.

### Ruled Lists and Equipment Panels

Service sequences use small numeric indices beside larger titles and reading text. Parts entries and canonical remainder products remain readable link groups separated by top rules; RFQ is the only transaction-like action. Equipment panels preserve image containment where specified; documentary plates retain their specified cover crop.

## Do's and Don'ts

### Do:

- Do preserve the supplied route-specific compositions and responsive role overrides.
- Do preserve canonical Salmon copy, semantic structure, and approved owner overrides.
- Do use authentic source photographs with their established provenance and crops.
- Do keep RFQ, search, and navigation controls usable with keyboard focus.

### Don't:

- Don't introduce prices or transactional checkout actions.
- Don't replace documentary images or invent before-and-after attribution.
- Don't compress canonical content to fit mockup excerpts.
- Don't extend the scoped commercial approval to untouched canonical surfaces.

Not canonized: legacy or source-provided decorative label fragments are not a license to add new kickers; no new design defect is legitimized by this record. The finish verdict covers the scoped corrections, not a fresh independent audit of every route.
