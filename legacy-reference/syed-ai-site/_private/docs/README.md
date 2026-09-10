# syed.ai — static site

Plain HTML, CSS and JavaScript. No build step, no framework, no dependencies.
Upload the folder and it works.

**First load: about 75 KB** (gzipped HTML + CSS + JS, plus the hero image in
WebP). No third-party JavaScript. One third-party request, for fonts — see
§Fonts to remove it.

---

## 1. Deploy to Hostinger

Upload the **contents** of this folder into your site's `public_html`:

```
/home/uXXXXXXXXX/domains/syed.ai/
├── syedai-config.php    ← the mail config goes HERE, beside public_html
└── public_html/
    ├── index.html
    ├── send.php           ← the form endpoint
    ├── roadmap.php        ← the plan builder + the newsletter welcome email
    ├── PHPMailer/         ← the mail library, bundled. Nothing to install.
    ├── diagnose.php       ← setup tool. DELETE once the form works.
    ├── 404.html           ← real 404 page, served with a 404 status
    ├── geo-pricing/       ← standalone indexable pages, one folder each
    ├── geo-vs-seo/
    ├── cited-not-recommended/
    ├── glossary/
    ├── robots.txt
    ├── sitemap.xml
    ├── llms.txt
    ├── site.webmanifest
    ├── .htaccess        ← Hostinger's File Manager shows dotfiles by default
    └── assets/
        ├── css/site.css
        ├── js/site.js
        └── img/…
```

`_private/` holds documentation and a config template. **Do not upload it.**

Then:

1. **Point DNS** for `syed.ai` at Hostinger and enable SSL (free, in hPanel →
   Security → SSL).
2. **Open `.htaccess`** and uncomment block 7 to force HTTPS and strip `www`.
   Only after SSL is live, or you will loop redirects.
3. **Set up the form** — `_private/README-form.md`, about 20 minutes.
4. **Verify the headers** at <https://securityheaders.com>. The shipped
   `.htaccess` should score A or better, including a strict Content Security
   Policy.
5. **Submit** `https://syed.ai/sitemap.xml` in Google Search Console and Bing
   Webmaster Tools.
6. **Test the rich results** at <https://search.google.com/test/rich-results> —
   `FAQPage`, `BreadcrumbList`, `Person`, `Organization` and `HowTo` should all
   be detected.
7. **Validate the whole graph** at <https://validator.schema.org>, which checks
   the nodes Google's tester ignores (`DefinedTermSet`, `WebPage`, `speakable`).

### Notes specific to Hostinger

- Hostinger runs **LiteSpeed**, not Apache. It reads `.htaccess` and
  reimplements these directives internally; `mod_rewrite`, gzip and
  `mod_expires` are on by default. There is no `mod_brotli` block in the
  shipped `.htaccess` because LiteSpeed handles Brotli itself.
- **PHP 8.2+** (8.3 default). Set it in hPanel → Websites → Dashboard → PHP
  Configuration. cURL and OpenSSL are enabled by default, which is everything
  `send.php` needs.
- **Composer** is pre-installed as `composer2` on Premium and above. The Single
  plan has no SSH — `_private/README-form.md` §2b covers the manual install.
- Outbound **ports 465 and 587 are open**; only port 25 is blocked. Gmail SMTP
  works on every plan.
- Do **not** rely on PHP `mail()` here: Hostinger caps unauthenticated `mail()`
  at 10 per minute and 100 per day. `send.php` uses authenticated SMTP instead.

## 2. Fonts

Fonts currently load from Google Fonts. That is one extra DNS lookup, TLS
handshake and round trip before text can render, and it is the single biggest
remaining performance item.

To self-host (about 10 minutes, worth doing):

1. Go to <https://gwfh.mranftl.com/fonts> — the Google Webfonts Helper.
2. Download **Bodoni Moda** weight 500 and **Jost** weights 400, 500, 600,
   charset `latin`, format `woff2`.
3. Drop the `.woff2` files into `assets/fonts/`.
4. In `index.html`, delete the three font `<link>` tags (lines beginning
   `<link rel="preconnect"` and the `fonts.googleapis.com` stylesheet) and add:

   ```html
   <link rel="preload" href="/assets/fonts/jost-v15-latin-400.woff2" as="font" type="font/woff2" crossorigin>
   <link rel="preload" href="/assets/fonts/bodoni-moda-v25-latin-500.woff2" as="font" type="font/woff2" crossorigin>
   ```

5. Add this to the top of `assets/css/site.css`, adjusting the filenames to
   match what you downloaded:

   ```css
   @font-face{font-family:"Bodoni Moda";src:url(/assets/fonts/bodoni-moda-v25-latin-500.woff2) format("woff2");
     font-weight:500;font-style:normal;font-display:swap}
   @font-face{font-family:"Jost";src:url(/assets/fonts/jost-v15-latin-400.woff2) format("woff2");
     font-weight:400;font-style:normal;font-display:swap}
   @font-face{font-family:"Jost";src:url(/assets/fonts/jost-v15-latin-500.woff2) format("woff2");
     font-weight:500;font-style:normal;font-display:swap}
   @font-face{font-family:"Jost";src:url(/assets/fonts/jost-v15-latin-600.woff2) format("woff2");
     font-weight:600;font-style:normal;font-display:swap}
   ```

Nothing else changes — the CSS already references the families by name.

---

## 3. What to edit, and where

| What | File | Where |
|---|---|---|
| Colours, type scale, spacing | `assets/css/site.css` | `:root` block at the top. See `DESIGN-TOKENS.md`. |
| Headline, intro, FAQ, pricing, all static copy | `index.html` | In place. |
| The six case-study scenarios | `assets/js/site.js` | `CASES` array. |
| The four products | `assets/js/site.js` | `VENTS` array. |
| Answer-simulator questions and answers | `assets/js/site.js` | `PROMPTS` array. |
| Scorecard questions and scoring weights | `assets/js/site.js` | `QUIZ` and `BANDS`. |
| Revenue-model assumptions | `assets/js/site.js` | `PROG` and `FEES`. |
| Structured data | `index.html` | The `application/ld+json` block near the bottom. **Keep it in sync with the visible FAQ and glossary** — Google penalises schema that does not match the page. |
| GEO vs SEO comparison table | `index.html` | Section `#geo-vs-seo`. |
| Glossary terms | `index.html` | Section `#glossary`, and the matching `DefinedTerm` nodes in the JSON-LD. |
| Brand mark | `assets/img/logo.svg`, `favicon.svg` | Same path in both; `apple-touch-icon.png` and `logo.png` are rasterised from them. |

### Placeholders to replace before you promote the page

- **The six scenarios** are modelled, not client reports. They are labelled
  "Modelled" on each card and each names the research it is calibrated
  against. Swap in real engagements and you can drop that framing.
- **The four products** in Building, and their progress percentages.
- **"Two engagement slots open"** in the hero — real scarcity or delete it.
- **"1,840 prompts tracked daily"** in the stat row.

The four figures in the Evidence band are real and linked to their sources.
Leave them; they are the strongest thing on the page.

---

## 4. Contact — the form and the chat

**There is no email address anywhere on this site**, by design. It is not in the
copy, the footer, the markup or the structured data, so there is nothing for a
scraper to harvest. Both routes post to the same endpoint, which relays over
authenticated SMTP server-side:

- **The brief form** on `#contact` — all nine fields at once.
- **The chat widget**, bottom right — the same nine questions one at a time,
  with quick-reply chips. Opens from the launcher, from `data-chat-open` on any
  element, from the command palette, and from the scorecard and product cards
  (which pass context in via `data-chat-topic` / `data-chat-note`).

Submissions arrive tagged `[brief form]` or `[chat widget]` in the subject.

### Setup

1. `composer require phpmailer/phpmailer` in your web root.
2. Copy `_private/config.example.php` to `../syedai-config.php` — **above** the
   web root — and fill in the three Gmail values.
3. Turn on 2-Step Verification, then create an app password at
   <https://myaccount.google.com/apppasswords>.
4. Optionally add a free Cloudflare Turnstile key.

`FORM_ENDPOINT` in `assets/js/site.js` is already `"/send.php"`. Full detail,
including what to do if app passwords are blocked on your account, is in
`_private/README-form.md`.

### Why Gmail this way

`to_email`, `from_email` and `smtp_user` are all set to the **same** Gmail
address. Gmail rewrites the `From` header to the authenticated account unless
the address is a verified *Send mail as* alias — and Google retires third-party
send-as in January 2027. Matching them means Google DKIM-signs the message with
its own keys, so it passes SPF, DKIM and DMARC with no DNS work. The visitor's
address goes in `Reply-To`, so **Reply** answers them directly.

Host `smtp.gmail.com`, port 465 implicit TLS (587 STARTTLS if 465 is blocked).
Limits are 500 messages a day on personal Gmail, 2,000 on Workspace.

### What `send.php` does, and why

| Control | Why |
|---|---|
| Config loaded from above the web root | If PHP ever stops executing, `.php` files get served as plain text. Your app password must not be inside that blast radius. |
| `From` = the authenticating account; visitor in `Reply-To` | The only Gmail configuration that cannot be rewritten or fail DMARC. |
| App password, not your Google password | Least privilege, and revoking it from Google's page instantly cuts off this form and nothing else. Plain-password access was removed in 2022 anyway. |
| Whitespace stripped from the password | Google displays app passwords in groups of four and rejects the spaces. |
| CR/LF stripped from every header-bound value | Blocks header injection — the classic way a contact form becomes an open relay. Tested against a `name=Syed\nBcc: attacker@…` payload. |
| TLS certificate verification left ON | The popular `allow_self_signed` "fix" for handshake errors silently disables validation. Never add it. |
| Origin / Referer allowlist | A `curl -X POST` from anywhere else gets `403`. |
| Honeypot + dwell-time check | Stops unsophisticated bots with zero friction and zero third-party requests. |
| Cloudflare Turnstile, verified server-side | Free, unlimited, single-use five-minute tokens, no user profiling. Optional. |
| Two-tier rate limit — 20 requests / 5 sends per IP per hour | The request cap absorbs abuse; the send cap protects the mailbox. Counting only *successful* sends against the low cap means a visitor who mistypes their address four times is not locked out. |
| Failure spool | If the relay is down, the lead is appended to a JSONL file above the web root, so an outage never loses a prospect. |
| Generic error messages | Detail goes to the server log, never to the browser. |

Do **not** upload `_private/` to the web root. It ships with a deny-all
`.htaccess` in case you do.

## 4b. The automated roadmap

When someone asks for a roadmap — from the chat, the scorecard, or the checkbox
on the contact form — the server does three things before replying:

1. **Reads their site.** `roadmap.php` fetches their homepage, `robots.txt` and
   `llms.txt`. Nothing else. Those three answer most of what matters and they
   answer it in about two seconds.
2. **Turns that into ranked findings** — critical, important, worth doing,
   already good — each with what it is, why it matters and what to do.
3. **Emails them a plan**, HTML and plain text, with a ninety-day sequence
   shaped by the focus and budget they gave. You get a copy, with the headline
   finding in the subject line so you can triage the inbox at a glance.

A newsletter signup gets its own welcome email within seconds — what the
newsletter is, what it is not, two things worth doing before Tuesday, and a
route to the free read. One email, no sequence behind it.

### Settings

All of it is on by default. To change any of it, edit `roadmap.php`:

| What | Where |
|---|---|
| Which AI crawlers count as "blocked" | `RM_AGENTS` at the top |
| Fetch timeout and size cap | `rm_fetch()` — currently 5s connect, 9s total, 300KB |
| Which checks run | `rm_scan()` |
| Findings, severities and wording | `rm_findings()` |
| The ninety-day sequence | `rm_plan()` |
| Roadmap email design | `rm_email_html()` and `rm_email_text()` |
| Newsletter welcome email | `rm_welcome_html()` and `rm_welcome_text()` |

To turn the feature off entirely, delete the checkbox `#wantPlan` from
`index.html` and remove `data-chat-mode="roadmap"` from the two buttons that
carry it. `send.php` then never enters roadmap mode.

### The safety rules, and why they are not optional

Anything that takes a URL from a stranger and fetches it server-side is a
server-side request forgery hole until proven otherwise — the classic exploit
is pointing it at `169.254.169.254` to read cloud credentials. `roadmap.php`
therefore:

- accepts `http` and `https` only, on ports 80 and 443 only;
- rejects URLs with credentials in them, and anything that is not a hostname
  with a dot;
- resolves the host and refuses if **any** A or AAAA record is private,
  loopback, link-local or reserved;
- re-validates on every redirect hop rather than letting cURL follow blindly,
  and re-checks the IP actually connected to after the request;
- caps the response at 300KB and aborts mid-transfer past that;
- runs behind the same rate limiter as everything else.

This was tested against 21 payloads — `127.0.0.1`, `localhost`, all three
RFC1918 ranges, the AWS metadata IP, `metadata.google.internal`, IPv6 loopback,
decimal-encoded IPs, `file://`, `gopher://`, credential-embedded URLs and
non-standard ports. All 21 refused; ordinary public hostnames pass.

**If you change the fetching code, re-run that test.** It is the one piece of
this site that reaches out to an address someone else chose.

## 4c. Abuse and spam

The form is the only thing on this site that accepts input from strangers, so it
carries the whole defence. Seven layers, cheapest first:

| Layer | Stops |
|---|---|
| Honeypot field | Crude bots that fill every input. Returns a fake success so the bot learns nothing. |
| Dwell timer | Anything submitted under 3 seconds or over 2 hours after page load. |
| Origin allowlist | Every POST from anywhere but your own domain. |
| Content scoring | Link farms, SEO and crypto pitches, BBCode, URLs in the name field, throwaway inboxes, shouting, mixed scripts. Score 5+ is dropped silently; 1–4 is delivered with the score noted in the email so you can see why it looked odd. |
| Duplicate check | The same message from the same address inside 15 minutes. |
| Per-IP limits | 20 requests and 5 successful sends per hour. |
| Global daily cap | 200 sends across all visitors, so a botnet cannot burn your 2,000/day Gmail quota. |

**Nothing submitted can execute.** The notification email is plain text, every
header-bound value has its control characters stripped, and the one HTML email
(the roadmap) passes every value through `htmlspecialchars`. Header injection was
tested against a `name=Syed\nBcc: attacker@…` payload; it comes through as inert
text.

Tuning is in `spam_score()` in `send.php` — the phrase list and the throwaway
domains are plain arrays at the top of the function. It is deliberately generous:
a false positive costs a real lead, which is far more expensive than a spam email
you delete. Tested against five realistic spam payloads and four legitimate
enquiries that mention SEO and contain URLs; all five blocked, all four delivered.

**If spam ever gets through anyway,** add a free Cloudflare Turnstile key
(§4 step 5). That is the layer that stops a determined human.

## 4d. Deploying a change to the CSS or JS

`.htaccess` caches CSS and JS for thirty days. That is the right setting for
speed and completely wrong for deployment unless the HTML asks for a specific
version — so `index.html` and `404.html` request them as:

    assets/css/site.css?v=9
    assets/js/site.js?v=9

**Whenever you change either file, bump that number in both HTML files.** Three
places, ten seconds. Skip it and returning visitors keep the old script for up
to a month, your fix appears not to have worked, and nothing in the browser will
tell you why.

The same number is stamped into the page as `<meta name="build" content="9">`.
Two ways to check which version a visitor is actually running:

- **View source** on the live page and read the build meta.
- **Open the browser console** — the script logs `syed.ai build 9` on load. If
  that number is missing or lower than the one in the HTML, the browser is
  serving a cached script and a hard reload (Ctrl+Shift+R, or Cmd+Shift+R on a
  Mac) will fix it.

`diagnose.php` checks both for you and says outright if the uploaded `site.js`
is an old copy.

## 4e. If the site is behind Cloudflare

Two settings matter, and both bite quietly.

**`'behind_cloudflare' => true`** in the config. Without it every visitor appears
to arrive from Cloudflare's own IP address, so they all share a single
rate-limit bucket — the fifth send in an hour locks out everyone. `diagnose.php`
detects Cloudflare and flags the mismatch.

**Roadmap requests answer the browser before doing the slow work.** A roadmap
submission fetches the visitor's homepage, robots.txt and llms.txt, then opens
two more SMTP connections. Held open, that is long enough for Cloudflare to give
up and hand the visitor a **502** while PHP is still working correctly.

`send.php` therefore calls `litespeed_finish_request()` (or
`fastcgi_finish_request()` on PHP-FPM) to close the connection as soon as the
lead is safely captured, then finishes the rest in the background with a raised
time limit. The browser gets its answer in under a tenth of a second; the
roadmap arrives a few seconds later.

If you ever see a 502 on this form again, that is the mechanism to check first —
`diagnose.php` reports whether the function exists on your PHP build.

## 4f. The standalone pages

The homepage is a single-page app: everything lives at `/` behind hash routes,
which Google does not treat as separate URLs. That means one title, one meta
description and one result in the SERP no matter how much content is on it.

Four topics therefore have real URLs of their own, chosen because competitive
research found them the least contested in this category:

| URL | Targets | Why this one |
|---|---|---|
| `/geo-pricing/` | "how much does GEO cost", "GEO agency pricing" | Across ten top-ranking pages in this category, not one states a price. Every major guide is published by a company selling software. |
| `/geo-vs-seo/` | "GEO vs SEO", "is SEO dead" | Contested, but winnable with the two independent studies most pages do not cite. |
| `/cited-not-recommended/` | "cited but not recommended", "ChatGPT recommends competitor" | Nobody answers it. The Ahrefs 43% finding is the most important negative result in the field and no page acts on it. |
| `/glossary/` | definition queries for twelve terms | Each term is a `DefinedTerm` with its own `@id` and anchor, so one can be cited without the page. |

Each is a real folder with an `index.html`, its own title, meta description,
canonical, Open Graph tags, breadcrumb and page-specific schema — `Article`,
`OfferCatalog`, `HowTo`, `DefinedTermSet` and `FAQPage` between them.

They are generated, not hand-written. The scripts live outside the site; if you
need to change one, edit `index.html` directly — but keep the title under 60
characters and the description between 120 and 158, which is what the generator
asserted before writing.

The homepage keeps its shorter versions of the same material and links out with
`.ilink` anchors, so the standalone pages are the deeper treatment rather than a
duplicate.

## 5. Performance notes

Already done:

- Images in WebP with JPEG fallback via `<picture>`, at three widths with
  `srcset` and `sizes`. The WebP set is 59% lighter than the JPEG set.
- `width` and `height` on every image, so nothing shifts as they load.
- Hero preloaded with `fetchpriority="high"`; everything below the fold is
  `loading="lazy"`.
- One CSS file and one JavaScript file, both cacheable for a month. JS is
  `defer`red so it never blocks rendering.
- `prefers-reduced-motion` respected throughout.

Worth doing after launch:

1. Self-host the fonts (§2). Biggest single win.
2. Put Cloudflare in front of the domain — free plan, and it adds Brotli, HTTP/3
   and edge caching without touching the files.
3. When you edit CSS or JS, rename the file (`site.v2.css`) and update the
   reference. Otherwise returning visitors keep the cached old version for up
   to a month.

---

## 6. Accessibility

- Landmarks: `header`, `nav`, `main`, `footer`, and `aria-labelledby` on every
  view section.
- One `h1`; heading levels descend without skipping.
- All interactive controls are real `button` or `a` elements, keyboard
  reachable, with a visible gold focus ring.
- `aria-pressed` on every toggle, `aria-expanded` on the accordion,
  `aria-live="polite"` on the streaming answer so screen readers get the
  final text rather than every frame.
- Body text sits at 11:1 contrast. The muted grey is 5.4:1 and is used only at
  label and caption sizes.
- The revenue scrubber is a native `input[type=range]`, so it works with arrow
  keys and with touch drag.

---

## 7. Browser support

Modern evergreen browsers. Uses `clamp()`, CSS custom properties, `:is`-free
selectors, `IntersectionObserver`, `Element.closest`, `aspect-ratio` and
`backdrop-filter`. No transpiling needed for anything from the last four years.
`backdrop-filter` degrades to a solid nav background where unsupported.

---

## 8. How this page is built to be cited

Six things on this page exist specifically to be lifted by a search engine or
an assistant. If you edit the page, keep them intact.

| Feature | Where | What it earns |
|---|---|---|
| **Answer-first definition** | First paragraph under "What this is" | Definition snippets, and the passage an assistant quotes for "what is GEO" |
| **The short version** | `.takeaway`, six bullets | List snippets. Each bullet leads with a bolded claim, so it survives being read out of order |
| **GEO vs SEO table** | `#geo-vs-seo` | Table snippets. Header row plus row headers (`<th scope>`), nine rows — long enough to be useful, short enough to be shown whole |
| **13-question FAQ** | `#faq`, mirrored into `FAQPage` | The expandable FAQ in results, and direct answers for long-tail questions |
| **10-term glossary** | `#glossary`, mirrored into `DefinedTermSet` | Definition capture. Each term is a `DefinedTerm` with its own `@id`, so an assistant can cite one without the page |
| **Five-move method** | `#method`, mirrored into `HowTo` | Step extraction for "how do I get cited in ChatGPT" |

Rules that keep them working:

- **Answer in the first sentence, evidence after.** Retrievers lift passages,
  not pages. A paragraph that only makes sense after the one before it cannot
  be quoted.
- **Every claim carries its number and its source in the same sentence.**
  Unsourced assertions get paraphrased away; a sourced number gets quoted.
- **Schema is generated from the visible DOM, never written by hand.** The FAQ
  and glossary JSON-LD were extracted from the rendered markup, so drift is
  impossible unless you edit one and not the other.
- **Infographics are inline SVG, not images.** A PNG chart is invisible to the
  crawlers this site sells visibility in. The three figures on the page are
  text with `<title>` and `<desc>`, so they are readable and quotable.
- **`robots.txt` explicitly allows the AI user agents.** GPTBot, OAI-SearchBot,
  ChatGPT-User, PerplexityBot, Google-Extended, ClaudeBot and Applebot-Extended.
  A CDN rule that blocks them silently is the single most common reason a site
  never gets cited — re-check this after any host or Cloudflare change.
- **Sections are deep-linkable.** `#geo-vs-seo`, `#glossary`, `#method` and
  `#faq` route to the right place, so a citation can point at a fragment.
