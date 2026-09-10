# Images for syed.ai — prompts and placement

Written for **ChatGPT's image tool**. Everything here assumes the workflow where
you *upload a reference photo and describe a change*, not text-to-image from
nothing. That distinction is the whole game and §1 explains why.

---

## 1. The one rule, before any prompting

**Images of you: generate freely — from your own photo.** Upload a real
photograph of yourself and ask for a different setting, crop, wardrobe or light.
The face stays yours. That is retouching with a large brush, and nobody has ever
been misled by it.

**Images of your team: do not generate faces.** Nine people work at syed.ai. A
photorealistic image captioned or implied as "our engineering team in Lahore"
would be depicting people who either don't exist or don't look like that, on a
page where prospects are deciding whether to trust you with $9,800 a month. It
is also the single easiest thing for a competitor to spot — synthetic faces
still fail on the second glance at teeth, ears and the hairline against a
background, and the failure is unrecoverable once someone notices.

Two honest routes for the team, both good:

- **Photograph them.** One hour per office, a phone in portrait mode against a
  plain wall, consistent crop. Better than anything generated, and cheap.
- **Show the work instead of the faces.** Whiteboards, terminals, notebooks,
  hands, desks, the three cities. §4 is a full set of prompts for this, and it
  is what the site is currently built for — the team section uses text and
  numbers, and reads as confident rather than thin.

If you want people on the page before you can photograph everyone, put *more of
you* on it. That is what §2 and §3 are for.

---

## 2. Images of you — reference-photo prompts

**How to run these:** start a new ChatGPT conversation, upload the photo named
in *Use*, paste the prompt, then iterate in plain language ("more room on the
left", "warmer", "less contrast in the shadows").

Every prompt ends with the same technical clause because the site is built on a
`#060504` near-black ground. Photos that have been brightened in post float on
it and look pasted on.

> **The house clause** — append to every prompt:
> *Keep my face, hair, skin texture and expression exactly as they are in the
> source. Warm neutral colour, deep true blacks, no lifted or milky shadows, no
> HDR glow, no beauty smoothing. Editorial photography, medium format, natural
> grain.*

### 2.1 Hero replacement — highest priority

**Use:** your navy-suit office photo.
**Target:** `assets/img/hero-1600.jpg` · 16:9 · 3000 × 1688 minimum.

> Re-frame this photograph as a wide 16:9 environmental portrait. Place me on
> the right third of the frame, standing, three-quarter length, with the left
> two-thirds falling into clean darkness so text can sit there. Window light
> from camera left, falling off sharply toward the right edge. Keep the wood,
> brass and stone tones. Direct eye contact, closed mouth, composed rather than
> smiling.

*Why:* the current hero is 1672px wide — already upscaling on a 27-inch display,
soft on a 5K one. This is the most visible image on the site by a wide margin.

### 2.2 The author square

**Use:** the same suit photo.
**Target:** `assets/img/author-800.jpg` · 1:1 · 1600 × 1600.

> Crop this to a square, head-and-shoulders, my eyes on the upper third line.
> Shallow depth of field so the background falls away. Slightly warmer than the
> source. Nothing else in frame but me and the blur.

*Why:* the authorship block currently crops the hero, so the framing is a
compromise. This is the image that carries E-E-A-T — it should look like a
portrait, not a crop.

### 2.3 Working, mid-sentence

**Use:** any photo of you in a shirt, seated.
**Target:** `assets/img/talk-1200.jpg` · 3:2 · 2400 × 1600.

> Place me at a table mid-sentence, one hand raised in explanation, looking
> slightly off-camera as if addressing someone just out of frame. A laptop and
> an open notebook in the foreground, out of focus. Shot from slightly below eye
> level. 50mm, f/2. Late afternoon light from one side.

*Why:* goes above the pricing tiers. Nothing on that page has a human in it,
which makes $9,800/month feel abstract.

### 2.4 The Open Graph card

**Use:** the suit photo.
**Target:** `assets/img/og-photo.jpg` · 1200 × 630 exactly.

> Compose this for a 1200 × 630 banner. Put me in the right 45% of the frame
> from the chest up, and leave the left 55% deliberately empty and dark — no
> furniture, no window, nothing but shadow and a suggestion of wall texture.

*Why:* an optional photographic alternative to the typographic card the site
ships with. Worth A/B-ing on LinkedIn; the typographic one usually wins for a
consultancy, the photo one for a personal brand. You have both.

### 2.5 The three-city composite — use with care

**Use:** the suit photo.
**Target:** decorative, `assets/img/cities-1600.jpg`.

> Place me in a modern office interior at dusk with a city skyline visible
> through floor-to-ceiling glass behind me, heavily defocused into warm bokeh.
> Generic contemporary skyline, no recognisable landmarks.

*Caveat, and it matters:* do **not** ask for a recognisable Abu Dhabi or Lahore
skyline behind you unless you have actually worked from that office. A generic
skyline is atmosphere; a specific one is a claim about where you were standing.

---

## 3. Placement map

| Slot | File the site loads | Ratio & size | What goes there now | What to replace it with |
|---|---|---|---|---|
| **Hero** | `hero-760/1100/1600.webp` + `.jpg` | 16:9 · up to 1600w served | Suit photo, under-resolved | §2.1 at 3000px, re-exported |
| **Author block** | crops `hero-760` | 1:1 | A crop of the hero | §2.2 |
| **Pre-footer CTA** | `cta-900/1600.*` | 21:9 · 1600 × 612 | *Another* crop of the hero | §4.1 — the page currently shows the same photo twice |
| **Builds section** | `desk-600/900.*` | 4:5 · 900 × 1129 | Four monitors at night | Keep. Best story value in the set. Or §4.2 |
| **Engagements** | — | 3:2 | Nothing | §2.3 |
| **Method (five moves)** | — | 3:2 | Nothing | §4.3 |
| **Team — three office cards** | — | 4:3 each | Text only | §4.4–4.6, or real photographs |
| **Newsletter** | — | 16:9 | Nothing | §4.7 |
| **Open Graph** | `og.jpg` | 1200 × 630 | Typographic card | Keep, or §2.4 as an alternative |

**Priority if you only do three:** 2.1 (hero at proper resolution), 4.1 (stop
showing the same photo twice), 2.2 (the author portrait).

---

## 4. Generated imagery — no people in frame

These are pure text-to-image. No faces, so nothing to misrepresent. All of them
should be dark, warm-neutral and quiet — they sit *behind* type.

> **Append to every prompt in this section:**
> *Almost entirely dark. Warm neutral palette — black, deep brown, brass,
> champagne. No text, no logos, no people, no hands. Editorial product
> photography, medium format, sharp, natural grain. No HDR, no glow.*

### 4.1 CTA backdrop — nightscape

**Target:** `cta-1600.jpg` · 1600 × 612.

> A city at night seen through floor-to-ceiling glass from a dark room. The
> skyline heavily defocused into warm and cool bokeh points. The near
> two-thirds of the frame is near-black interior. Anonymous contemporary
> skyline, no recognisable landmarks.

### 4.2 Builds alternative — the plan on paper

**Target:** 4:5, 2000 × 2500.

> Overhead flat lay on dark slate: a single sheet of paper covered in
> handwritten system-architecture boxes and arrows, a fountain pen, a brass
> ruler. Single warm light source from the upper right, deep shadows. Nothing
> digital in frame.

### 4.3 Method section — the notebook

**Target:** 3:2, 2400 × 1600.

> Tight overhead detail of roughly 40 × 30 cm of desk: a handwritten notebook
> page listing short phrases, a pen resting across it, the edge of a mechanical
> keyboard, a glass of water. Hard directional light from one side for texture.
> No screens.

### 4.4 Celebration office

**Target:** 4:3, 1600 × 1200.

> A quiet corner of a warm American office at golden hour: a wooden desk, a
> single brass lamp, a closed laptop, an armchair, tall windows with plantation
> shutters throwing hard slats of light across the floor. Empty of people.

### 4.5 Abu Dhabi office

**Target:** 4:3, 1600 × 1200.

> A minimal Gulf office interior at dusk: pale stone floor, dark walnut table,
> a single glass of tea, mashrabiya-style latticed screen casting a geometric
> shadow. Warm low sun through the lattice. Empty of people.

### 4.6 Lahore office

**Target:** 4:3, 1600 × 1200.

> An engineering workspace at night: three dark monitors showing only faint
> code, a mechanical keyboard, an open notebook with a hand-drawn schema
> diagram, a cup of chai going cold. Lit only by a warm desk lamp and screen
> glow. Empty of people.

*These three read as a set — same light, same palette, three different rooms.
That is a truthful way to show three offices without inventing anybody's face.*

### 4.7 Newsletter band

**Target:** 21:9, 2400 × 1000.

> Extreme macro of black anodised aluminium with a fine brushed grain, lit by a
> single raking warm light from the left so a champagne sheen travels across the
> surface. Abstract, almost entirely dark.

---

## 5. Exporting, so they actually load fast

Whatever comes out of ChatGPT is a large PNG. Do not upload that.

1. **Resize** to the target width in the table (§3).
2. **Run through <https://squoosh.app>** — WebP, quality 72, and export a JPEG
   at quality 80 as the fallback.
3. **Name them to match** what the site already requests, e.g.
   `hero-760.webp`, `hero-1100.webp`, `hero-1600.webp` plus the three `.jpg`.
4. **Drop them into `assets/img/`**, overwriting. No code change needed — the
   `<picture>` elements already reference those names.
5. **Targets:** dark abstract images should land 15–25 KB. Photographs of you,
   30–45 KB at 1600px. If anything is over 80 KB, the quality slider is too high.

For a new slot that has no filename yet (§2.3, §4.4–4.7), tell me the filenames
and I will wire the `<picture>` markup, the `srcset` and the alt text.

---

## 6. Alt text — write it, it is not decoration

Every image on this site is described for screen readers *and* for the
retrievers you are selling visibility in. Two rules:

- **Describe the content, not the file.** "Syed Abdul at a table explaining an
  entity map to a client" beats "consultant photo".
- **Purely decorative backdrops get `alt=""`.** The CTA nightscape and the
  brushed-aluminium band carry no information; announcing them to a screen
  reader is noise. The site already does this correctly.
