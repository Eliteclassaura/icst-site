# Image analysis & generation prompts — syed.ai

---

## 1. What you have now, honestly assessed

### `hero-*` — navy suit, wood-panelled office

**The strongest asset you sent.** It works for three specific reasons:

- The composition puts you right-of-centre with the window and wall on the
  left, which is exactly where the headline needs to sit. That is luck you
  should not count on twice.
- The wood, brass and travertine are all warm neutrals, so the champagne
  palette sits on it naturally. A cool-toned office would have fought it.
- Direct eye contact plus hand-in-pocket reads as composed rather than posed.

**Weaknesses:** at 1672 × 941 it is under-resolved for a full-bleed hero — on a
27-inch display the browser is already upscaling, and on a 5K display it will
look soft. **You want 2400 × 1350 minimum, ideally 3000 px wide.** The framing
also reads slightly generic-corporate; nothing in it says *AI search*.

### `desk-*` — four monitors at night

**Best story value in the set.** The handwritten notebook — "AI System / Data
ingestion / Model training / Ideas / To Do Next" — is the single most credible
thing in any of the photos. It is proof of work that no stock library sells.

**Weaknesses:** two real ones.

1. It is shot from behind, so there is no face and no eye contact. Fine for a
   supporting band, wrong for anything that needs to build trust.
2. It is expensive to serve. All that fine screen detail defeats WebP —
   68 KB at 900 px wide versus 34 KB for the hero at 1600 px. It is the
   heaviest file on the site by a wide margin, which is why it is lazy-loaded
   and capped at 900 px.

### `cta-*` — wide crop of the hero

Doing its job at 32% opacity behind the pre-footer, but it means the site has
effectively **two** distinct photographs. That is thin for a page this long.

---

## 2. My recommendation before you generate anything

**Do not AI-generate images of yourself.** For a personal brand at this price
point, a synthetic portrait that a prospect clocks as fake costs you more than
a merely average real photo ever will — and people are getting very good at
clocking it. Faces are also where generators still fail on the second glance:
teeth, ear geometry, the hairline against a background.

So split it:

- **Real camera, real you** → anything with your face. Prompts in §3 are
  written as a shot list for a photographer, not for a model.
- **AI-generated** → abstract textures, backdrops and object stills with no
  people in them. Prompts in §4.
- **Code, not images** → every infographic. §5 explains why, and I can build
  them as inline SVG.

---

## 3. Photo shoot list — four shots, one hour

Shoot at the same location as the suit photo if you can; the wood and brass are
already on-brand. Late afternoon, window light, no on-camera flash.

**Technical spec for all four:** 3000 px on the long edge minimum, RAW, sRGB,
underexpose about ⅓ stop so the shadows stay genuinely dark rather than lifted
grey. The site is built on a `#060504` ground — photos that have been
"brightened" in post will float on it.

### Shot 1 — Hero replacement (highest priority)

> Environmental portrait, three-quarter length, subject standing right of
> centre with clean negative space filling the left third of a 16:9 frame.
> Navy or charcoal suit, open collar, no tie. Window light from camera left,
> falling off toward the right so the background goes dark. Shot at 35mm,
> f/2.8, eye level. Direct eye contact, neutral expression — closed mouth,
> not smiling. Warm interior: wood, brass, stone. Deliver 3000 × 1688.

Why: replaces the current hero at proper resolution while keeping the layout
that already works.

### Shot 2 — Authority / speaking

> Subject mid-sentence, gesturing with one hand, seated or standing at a
> table with a laptop and notebook visible but out of focus. 50mm, f/2,
> shallow depth of field. Shot slightly below eye level so the subject reads
> as the authority in the room. Looking off-camera as if addressing someone
> just out of frame.

Why: goes in Engagements, above the pricing tiers. Nothing on that page
currently has a human in it, which makes $9,800/month feel abstract.

### Shot 3 — Hands and craft detail

> Tight overhead detail, 40 × 30 cm of desk. A handwritten notebook page with
> a prompt list or entity map, a pen, a mechanical keyboard edge, a glass of
> water. One hand entering frame writing. Hard directional light from one
> side for texture. No screens visible. 50mm macro, f/4. Deliver 2400 × 1600.

Why: this is the shot that says *analysis* rather than *lifestyle*. It belongs
in the Method section beside the five moves, and it will compress beautifully
because it is mostly flat paper.

### Shot 4 — Purpose-built Open Graph card

> Same setup as Shot 1 but composed for 1200 × 630 with the subject occupying
> the right 45% of the frame and the left 55% deliberately empty and dark.

Why: the current OG image is a crop of the hero, so the framing is compromised.
A purpose-shot card is what appears every time someone shares the link on
LinkedIn, iMessage or Slack — it is your most-viewed image whether you like it
or not.

---

## 4. AI generation prompts — abstract assets only, no people

These are written for Midjourney v6+, Flux or Ideogram. Aspect ratios are what
the layout needs. All should be output at 2× the display size.

### 4.1 Section divider texture — "retrieval field"

> Extreme macro photograph of black anodised aluminium with a fine brushed
> grain, lit by a single raking warm light from the left so a champagne-gold
> sheen travels across the surface. Almost entirely dark. No objects, no text,
> no people. Editorial product photography, medium format, sharp.
> --ar 21:9 --style raw

Use: behind the Evidence band heading at 25% opacity, or as a divider between
major sections.

### 4.2 Building-section backdrop

> Overhead flat lay on dark slate: a single sheet of paper covered in
> handwritten diagram boxes and arrows, a fountain pen, and a brass ruler.
> Warm single-source light from upper right, deep shadows, no colour except
> paper cream and brass. Nothing digital in frame. Editorial, medium format.
> --ar 4:5 --style raw

Use: an alternative or companion to the desk photo, and roughly a fifth of
the file size.

### 4.3 Engagements backdrop

> Close macro of a stack of three cream index cards on a black stone surface,
> edges lit by a thin warm gold rim light, shallow depth of field so only the
> top edge is sharp. Minimal, expensive, nothing else in frame.
> --ar 16:9 --style raw

Use: behind the three pricing tiers, very low opacity.

### 4.4 Negative-space filler for the CTA band

> Nightscape through floor-to-ceiling glass: a distant city skyline heavily
> defocused into warm and cool bokeh points, the near two-thirds of the frame
> in near-black. No people, no reflections, no signage.
> --ar 21:9 --style raw

Use: replaces the reused hero crop behind the pre-footer, so the page stops
showing you the same photograph twice.

**Deliver all of these as WebP at quality 70.** Run them through
<https://squoosh.app> and target under 40 KB each. Abstract dark textures
compress far better than the desk photo — expect 15–25 KB.

---

## 5. Infographics — build these in code, not as images

Five diagrams would genuinely earn their place on this page. **None should be
an image file.** Coded SVG is sharper on every display, stays under 3 KB,
inherits the palette automatically when you change a token, and — the part
that matters for your own argument — is *text* that an AI crawler can read.
An infographic exported as a PNG is invisible to the thing you are selling
visibility in.

Say the word and I will build any of these as inline SVG. They would drop
straight into the sections named below.

### 5.1 The retrieval pool — highest value

**Goes in:** the Evidence band, next to the 90% figure.
**Shows:** two vertical stacks side by side. The left is labelled *Where SEO
competes* and highlights positions 1–10. The right is labelled *Where ChatGPT
retrieves from* and highlights positions 21+, which is roughly 90% of its
citations. The overlap between them is almost nothing.

This single diagram is the entire thesis of the site. If you build one, build
this one.

### 5.2 SEO versus GEO

**Goes in:** the FAQ, under "How is GEO different from SEO?"
**Shows:** two columns. Left, a classic ten-result list with a click going to
slot one. Right, a single paragraph with three source chips, two of which are
competitors. Caption: *ten slots versus three, and no slot four.*

### 5.3 Anatomy of a cited answer

**Goes in:** the Answer Simulator section.
**Shows:** one AI answer paragraph exploded into its inputs with callout
lines — first-party page (extractable answer), third-party roundup
(corroboration), structured data (entity clarity), review platform
(consensus). Each labelled with which of your five moves produces it.

### 5.4 AI Overview growth, 2025

**Goes in:** under the Evidence band, replacing the current note paragraph.
**Shows:** a line chart of the real Semrush data — 6.49% of searches in
January 2025, 24.61% by July, 15.69% by November — with a second series
underneath showing informational query share falling from 91.3% to 57.1%.

This is real, cited, and the shape of it makes the argument faster than the
sentence does. Mark the source directly in the chart.

### 5.5 The first ninety days

**Goes in:** Engagements, replacing or accompanying the week-by-week list.
**Shows:** a horizontal timeline, weeks 1 to 12, with five overlapping bars —
baseline, diagnosis, structural fixes, content and corroboration, email — so
it is visible that they overlap rather than run in sequence.

---

## 6. Priority order, if you only do some of it

1. **Shot 1** — reshoot the hero at 3000 px. Everything else is cosmetic
   next to a soft hero on a retina display.
2. **Infographic 5.1** — the retrieval pool. Free, small, and it makes your
   core argument in one glance.
3. **Shot 4** — the purpose-built OG card. Highest views per unit of effort
   of anything in this document.
4. **Prompt 4.4** — a distinct CTA backdrop so the page stops repeating a
   photograph.
5. **Shot 3** — the notebook detail, for the Method section.
6. Everything else.
