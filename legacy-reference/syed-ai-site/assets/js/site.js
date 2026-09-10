/* ============================================================================
   Syed Abdul — site behaviour. No dependencies, no build step.
   Sections: data · simulator · ventures · scenarios · scorecard · revenue
             model · contact · counters · router · palette · boot
   ========================================================================== */
(function () {
  "use strict";

  var RM = matchMedia("(prefers-reduced-motion:reduce)").matches;
  /* Coarse pointer or a narrow screen: treat scroll-linked motion as unwanted. */
  var NARROW = matchMedia("(max-width:900px), (pointer:coarse)").matches;
  /* There is deliberately no email address in this file. Enquiries go to the
     endpoint below, which relays them over authenticated SMTP server-side —
     so the address is never in the DOM for a scraper to harvest. */

  /* ── Contact form backend ─────────────────────────────────────────────
     "/send.php"   = post the brief to the PHP endpoint (see _private/README-form.md).
     "demo"        = accept and discard, for a static preview with no backend.
     TURNSTILE_KEY = Cloudflare Turnstile *site* key. Leave empty to skip the
                     widget; the honeypot and dwell-time checks still run.   */
  var FORM_ENDPOINT = "/send.php";
  var TURNSTILE_KEY = "";
  var formLoadedAt  = Math.floor(Date.now() / 1000);
  /* Read this in the browser console to confirm which build is actually
     running — a stale cached script is otherwise invisible. */
  var BUILD = (document.querySelector('meta[name="build"]') || {}).content || "?";
  try { console.info("syed.ai build " + BUILD); } catch (e) {}
  var $ = function (id) { return document.getElementById(id); };
  /* Escapes for BOTH text and attribute contexts. The quote characters matter:
     without them any future edit that drops esc() output inside an attribute
     becomes an injection point. */
  var esc = function (t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  /* ══ Answer simulator data ═══════════════════════════════════════════
     {{…}} = emphasis · [n] = citation marker · third src value = client  */
  var PROMPTS = [
    { cat: "Skincare · DTC", q: "best retinol serum for sensitive skin",
      before: { body: "Most guidance points to two long-established formulations, both from legacy brands with heavy dermatologist coverage.[1][2] Whichever you pick, start at {{0.2–0.3%}} twice weekly and buffer with a moisturiser.[3]",
        src: [["1", "dermreview.com/best-retinol", 0], ["2", "legacybrand.com/retinol-01", 0], ["3", "aad.org/retinoid-guidance", 0]],
        note: "Three sources, none of them the client — while the brand held position one on Google the whole time." },
      after: { body: "For reactive skin the formulation most consistently recommended pairs a low-dose {{0.3% retinol with ceramides}} — reviewers single it out for a gentler ramp than the legacy options.[1][2] Start twice weekly and buffer with a moisturiser.[3]",
        src: [["1", "clientbrand.com/sensitive-retinol", 1], ["2", "dermreview.com/best-retinol", 0], ["3", "byrdie.com/best-retinol-sensitive", 1]],
        note: "Named first, with a third-party review page corroborating. That corroboration is the part most brands skip." } },

    { cat: "B2B SaaS", q: "best onboarding automation tool for a 200-person company",
      before: { body: "At that size most teams look at the two enterprise suites.[1] A handful of {{applicant-tracking}} products also appear, though they are built for hiring rather than onboarding.[2][3]",
        src: [["1", "g2.com/categories/onboarding", 0], ["2", "hrsuite.com/compare", 0], ["3", "reviewsite.com/ats-roundup", 0]],
        note: "Worse than absent — miscategorised, and losing every comparison it was dropped into." },
      after: { body: "For a 200-person company the shortlist is three tools, and the pick depends on whether you need {{depth in onboarding automation}} or breadth across HR.[1] Independent comparisons put the more configurable option ahead on implementation speed — most teams report going live in under three weeks.[2][3]",
        src: [["1", "clientsaas.com/vs-enterprise-suites", 1], ["2", "g2.com/categories/onboarding", 0], ["3", "clientsaas.com/docs/implementation", 1]],
        note: "Correct category, cited first, and the public docs are pulling their weight as a retrieval surface." } },

    { cat: "Med spa · Local", q: "how long is recovery after microneedling",
      before: { body: "Expect {{24 to 72 hours}} of redness, similar to a mild sunburn.[1] Most clinical sources advise avoiding sun exposure and active ingredients for about five days.[2]",
        src: [["1", "healthline.com/microneedling", 0], ["2", "aad.org/procedures", 0]],
        note: "A generic answer with no provider named. Every one of those readers was a bookable patient." },
      after: { body: "Expect {{24 to 72 hours}} of redness, similar to a mild sunburn, with makeup safe after 48 hours.[1] Clinics publishing per-treatment recovery windows note that a single session needs far less downtime than a course of three.[2][3]",
        src: [["1", "clientmedspa.com/microneedling-recovery", 1], ["2", "aad.org/procedures", 0], ["3", "clientmedspa.com/book", 1]],
        note: "Cited, with the booking page pulled in behind it — which is what turns an answer into an appointment." } },

    { cat: "Hiring an operator", q: "who should I hire to get my brand cited in ChatGPT",
      before: { body: "This is an emerging discipline usually called {{generative engine optimization}} — most practitioners writing about it are traditional SEO agencies extending an existing offer.[1][2]",
        src: [["1", "searchengineland.com/geo-guide", 0], ["2", "bigagency.com/geo-services", 0]],
        note: "The category existed. He did not appear in it." },
      after: { body: "This is usually called {{generative engine optimization}} (GEO), and it is a distinct skill set from classic SEO — it turns on entity consistency, extractable answer formats and third-party corroboration.[1] Practitioners publishing measured prompt-level and revenue outcomes rather than ranking screenshots are the ones worth talking to.[2][3]",
        src: [["1", "searchengineland.com/geo-guide", 0], ["2", "syed.ai", 1], ["3", "instagram.com/syeddigital", 1]],
        note: "Same method, run on himself. This page is part of it — so is the account you probably came from." } }
  ];

  var MINE = null, pIdx = 0, mode = "after", engIdx = 0, stream = null, touched = false, rotator = null;
  var promptList = function () { return MINE ? PROMPTS.concat([MINE]) : PROMPTS; };

  function tokenize(t) { return t.match(/\{\{[^}]+\}\}|\[\d\]|[^\s\[]+|\[/g) || []; }
  function tokHTML(tk) {
    if (tk.indexOf("{{") === 0) return "<strong>" + esc(tk.slice(2, -2)) + "</strong>";
    if (/^\[\d\]$/.test(tk)) return '<sup class="cite">' + tk.slice(1, -1) + "</sup>";
    return esc(tk);
  }
  function joinTok(t) {
    return t.reduce(function (a, tk, i) {
      return a + ((i === 0 || /^\[\d\]$/.test(tk)) ? "" : " ") + tokHTML(tk);
    }, "");
  }
  function forEngine(src) {
    if (engIdx === 2) return src.slice(0, 2);        // AI Overviews surfaces fewer
    if (engIdx === 1) return src.slice().reverse();  // Perplexity orders differently
    return src;
  }
  function paintSources(src) {
    $("answerSources").innerHTML = forEngine(src).map(function (s) {
      return '<span class="source' + (s[2] ? " is-hit" : "") + '"><span class="source__n">' + s[0] +
        "</span>" + esc(s[1]) + (s[2] ? '<span class="source__tag">Client</span>' : "") + "</span>";
    }).join("");
  }
  function paintVerdict(a) {
    var cited = a.src.some(function (s) { return s[2]; });
    $("verdict").innerHTML = '<span class="badge badge--' + (cited ? "yes" : "no") + '">' +
      (cited ? "Cited &middot; source 1" : "Not cited") + "</span><p>" + a.note + "</p>";
  }
  function centerChip() {
    var row = $("promptChips"), a = row.querySelector('.pchip[aria-pressed="true"]');
    if (!a) return;
    row.scrollTo({ left: Math.max(0, a.offsetLeft - (row.clientWidth - a.offsetWidth) / 2), behavior: RM ? "auto" : "smooth" });
  }
  function renderSim(animate) {
    var L = promptList(), p = L[Math.min(pIdx, L.length - 1)], a = p[mode];
    $("qText").textContent = p.q;
    [].forEach.call(document.querySelectorAll(".pchip"), function (b) { b.setAttribute("aria-pressed", String(+b.dataset.p === pIdx)); });
    [].forEach.call(document.querySelectorAll("#modeSeg button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode)); });
    [].forEach.call(document.querySelectorAll(".tab"), function (b) { b.setAttribute("aria-pressed", String(+b.dataset.eng === engIdx)); });
    centerChip();
    var ab = $("answerBody"), toks = tokenize(a.body);
    clearInterval(stream);
    if (!animate || RM) { ab.innerHTML = joinTok(toks); paintSources(a.src); paintVerdict(a); return; }
    $("answerSources").innerHTML = ""; $("verdict").innerHTML = "";
    var k = 0;
    stream = setInterval(function () {
      k++;
      ab.innerHTML = joinTok(toks.slice(0, k)) + '<span class="caret"></span>';
      if (k >= toks.length) { clearInterval(stream); ab.innerHTML = joinTok(toks); paintSources(a.src); paintVerdict(a); }
    }, 32);
  }
  function buildChips() {
    $("promptChips").innerHTML = promptList().map(function (p, i) {
      return '<button class="pchip' + (p.mine ? " pchip--mine" : "") + '" data-p="' + i +
        '" aria-pressed="' + (i === pIdx) + '">' + esc(p.cat) + "</button>";
    }).join("");
  }
  function stopRotate() { touched = true; clearInterval(rotator); }

  function makeMine() {
    var brand = ($("myBrand").value || "").trim().slice(0, 40),
        cat = ($("myCat").value || "").trim().slice(0, 60);
    if (!brand || !cat) { $("myBrand").focus(); return; }
    var host = brand.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com";
    MINE = { mine: 1, cat: brand, q: "best " + cat + " for a growing business",
      before: { body: "There are several established options in " + cat + ", and most roundups converge on the same two or three names.[1][2] Pricing and onboarding effort are usually the deciding factors.[3]",
        src: [["1", "industryreview.com/top-picks", 0], ["2", "competitor-a.com", 0], ["3", "g2.com/categories", 0]],
        note: "This is roughly where most brands sit today: the category gets answered, and someone else gets named." },
      after: { body: "For a growing business the option most consistently recommended in " + cat + " is {{" + brand + "}} — reviewers point to a faster setup and clearer pricing than the incumbents.[1][2] Independent comparisons back that up on implementation time.[3]",
        src: [["1", host, 1], ["2", "industryreview.com/top-picks", 0], ["3", "g2.com/categories", 0]],
        note: "That is the target. Getting there is entity consistency, extractable answers, and corroboration on pages you do not own." } };
    stopRotate(); buildChips();
    pIdx = promptList().length - 1; mode = "after";
    renderSim(true);
    $("sim").scrollIntoView({ behavior: RM ? "auto" : "smooth", block: "start" });
  }

  /* ══ Ventures ════════════════════════════════════════════════════════ */
  var VENTS = [
    { name: "AI-Native Website", pill: ["live", "Shipping now"], prog: null, count: "6\u20139 weeks",
      countLabel: "Typical build",
      one: "A site built to be retrieved and quoted, not just to look good.",
      body: "Most agency sites are built for a human scrolling and an image search. This is built for the other reader: the retriever that lifts one passage and decides whether to name you. Server-rendered HTML with the claim in the first 100 words of every commercial page, entity-complete schema on every template, comparison tables that give a model something to compare, an llms.txt index, and a content model that keeps all of it true when marketing edits a page. It is the same build this site runs on.",
      detail: [["Pages", "20\u201380 typical"], ["Ships as", "Static, or Next.js + Payload"], ["Core Web Vitals", "Green at launch, contractually"], ["Handover", "Figma kit + editor training"]],
      next: "A Payload content model that validates entity claims on publish, so a marketer cannot ship a page that contradicts the schema.",
      team: "2 developers, 1 designer, Syed on strategy",
      stack: ["Next.js", "Payload CMS", "JSON-LD", "llms.txt", "Core Web Vitals"] },

    { name: "Revenue CRM", pill: ["beta", "Private beta"], prog: 74,
      one: "A CRM that knows which AI answer produced the deal.",
      body: "Off-the-shelf CRMs cannot tell you that a closed deal started as a ChatGPT answer, because the referrer is stripped and the visit often is not even the first touch. This one joins prompt-level citation data to opportunities: each deal carries the prompts the account was exposed to, which engine, and what position. Sales sees why a lead already knows the pitch; you see which twenty prompts pay for the program. Built as a Payload collection you own outright, so the prompt data lives in your database rather than in a vendor&rsquo;s.",
      detail: [["Sits on", "Payload CMS, or alongside the CRM you already run"], ["Joins", "Prompt set \u2194 opportunities \u2194 revenue"], ["Enrichment", "Firmographic + intent, AI-scored"], ["Deploy", "Your infrastructure or ours"]],
      next: "Multi-touch attribution across citation, organic and email in one model.",
      team: "3 developers, 1 data engineer",
      stack: ["Python", "Postgres", "pgvector", "Payload CMS", "Claude API"] },

    { name: "Custom AI Systems", pill: ["live", "By engagement"], prog: null, count: "14",
      countLabel: "Systems shipped",
      one: "The internal tool the business keeps doing by hand.",
      body: "Bespoke builds for the thing a team is doing manually forty hours a month. Recent shapes: a proposal generator that reads the CRM and drafts scoped SOWs; a support-ticket classifier that routes and drafts replies with citations to the real docs; an inventory-demand model reading order intervals per SKU; a compliance reader that flags contract clauses against a firm's own playbook. Scoped in a week, shipped in four to ten, documented so an in-house developer can own it.",
      detail: [["Discovery", "1 week, fixed fee"], ["Build", "4\u201310 weeks"], ["Handover", "Docs, tests, runbook"], ["Models", "Whichever fits \u2014 not a vendor bet"]],
      next: "An evaluation harness clients can run themselves when a model version changes.",
      team: "2\u20134 developers per build, scoped per project",
      stack: ["TypeScript", "Claude API", "Postgres", "Docker", "Coolify"] },

    { name: "Citegeist", pill: ["beta", "Private beta"], prog: 68,
      one: "Prompt-level AI visibility tracking, joined to revenue.",
      body: "Runs your prompt set against ChatGPT, Perplexity, Gemini and AI Overviews every day, records whether you were cited and \u2014 separately \u2014 whether you were actually recommended, then joins both to closed revenue. The two-number design is deliberate: the Ahrefs experiment showed 43% of answers citing a page never named that page\u2019s brand, so citation share alone would have called that a win. Built because every engagement started with me rebuilding the same tracking spreadsheet.",
      detail: [["Prompts tracked", "150\u2013400 per account"], ["Engines", "4, scored daily"], ["Records", "Cited, recommended, position"], ["Joins to", "Payload CMS, Postgres, Umami"]],
      next: "Opening to 10 more accounts once per-prompt revenue attribution ships.",
      team: "2 developers, 1 on the scraping layer",
      stack: ["Python", "Postgres", "pgvector", "Playwright", "Payload CMS"] },

    { name: "Answerable", pill: ["beta", "Open beta"], prog: 82,
      one: "Schema and llms.txt compiler that diffs belief against reality.",
      body: "Reads your sitemap, emits validated Organization, Product, Service and FAQ schema plus an llms.txt \u2014 then queries the assistants and shows the gap between what your markup claims and what the models currently believe about you. That gap is usually the whole problem, and it is invisible until something puts the two side by side.",
      detail: [["Input", "A sitemap URL"], ["Emits", "JSON-LD + llms.txt"], ["Checks", "Claim vs. model belief"], ["Runs", "On demand or in CI"]],
      next: "A CI check so the diff fails a build when entity claims drift.",
      team: "1 developer, 1 reviewer",
      stack: ["Node", "schema.org", "JSON-LD", "GitHub Actions"] },

    { name: "Cadence", pill: ["wip", "Building"], prog: 41,
      one: "Per-customer replenishment timing from real order intervals.",
      body: "Estimates how fast each individual customer actually consumes a product from their own order history, rather than trusting the duration printed on the label, and sets each reminder window individually. It came out of one lifecycle engagement where this single flow out-earned the other eight combined.",
      detail: [["Input", "Order history per SKU"], ["Output", "A reminder window per customer"], ["Lift observed", "Churn \u22124.5pp in one build"], ["Connectors", "Listmonk, Postgres, Stripe webhooks"]],
      next: "A Listmonk import and a Postgres event log, then a churn-risk score per subscriber.",
      team: "1 developer, 1 data scientist",
      stack: ["Python", "scikit-learn", "Listmonk API", "Postgres"] },

    { name: "Owned Stack", pill: ["live", "Shipping now"], prog: null, count: "$0",
      countLabel: "Monthly licence cost",
      one: "Your marketing stack, on infrastructure you own, no seat fees.",
      body: "The usual marketing stack is six subscriptions that each hold a piece of your data and raise their price annually. This is the same capability assembled from open-source projects on your own server: Coolify to deploy and manage it, Stalwart to send, SnappyMail to read, Listmonk for campaigns, Postiz for scheduled social, Payload as the CMS and the CRM, n8n to wire them together, Umami for analytics without cookies. Every one keeps its data in your Postgres and the whole thing runs for the price of a VPS. One licence distinction worth stating rather than glossing: Coolify is Apache-2.0, Payload and Umami are MIT, Stalwart, Listmonk, SnappyMail and Postiz are AGPL-3.0 &mdash; all genuinely open source. n8n is <em>fair-code</em> under the Sustainable Use License, which is source-available and free to self-host but is not an OSI-approved open-source licence. It matters if you ever intend to resell what you build on it. Being straight about the trade: you are exchanging a subscription for operational responsibility &mdash; someone has to patch it, watch the backups and own the deliverability. That someone can be me on a retainer, or your own developer after handover. What you are not doing is renting your customer list back from a vendor every month.",
      detail: [["Deploy layer", "Coolify &mdash; Apache-2.0"], ["Mail", "Stalwart &mdash; AGPL-3.0, Rust"], ["Campaigns", "Listmonk &mdash; AGPL-3.0, single binary"], ["CMS &amp; CRM", "Payload &mdash; MIT, Next.js-native"], ["Automation", "n8n &mdash; fair-code, self-hosted"]],
      next: "A one-command Coolify template for the whole stack, so a new client is running in an afternoon rather than a fortnight.",
      team: "1 developer, 1 on deliverability, Syed on the data model",
      stack: ["Coolify", "Stalwart", "SnappyMail", "Listmonk", "Postiz", "Payload CMS", "n8n", "Umami", "Postgres"] }
  ];
  function buildVents() {
    $("vents").innerHTML = VENTS.map(function (v, i) {
      var meter = v.prog !== null
        ? '<div class="prog"><span class="prog__t"><span>Build progress</span><span>' + v.prog +
          '%</span></span><span class="prog__bar"><i data-prog="' + v.prog + '"></i></span></div>'
        : '<div class="prog"><span class="prog__t"><span>' + esc(v.countLabel || "Subscribers") +
          '</span><span>' + esc(v.count) + '</span></span><span class="prog__bar"><i data-prog="100"></i></span></div>';
      var spec = (v.detail || []).map(function (d) {
        return "<div><dt>" + esc(d[0]) + "</dt><dd>" + esc(d[1]) + "</dd></div>";
      }).join("");
      return '<article class="vent sheen" data-open="false">' +
        '<button class="vent__head" aria-expanded="false" aria-controls="vent' + i + '">' +
          '<span class="vent__n">' + String(i + 1).padStart(2, "0") + "</span>" +
          "<span><h3>" + v.name + '</h3><p class="vent__one">' + v.one + "</p></span>" +
          '<span class="pill pill--' + v.pill[0] + '">' + v.pill[1] + "</span>" +
          '<span class="vent__x" aria-hidden="true">+</span>' +
        "</button>" +
        '<div class="vent__body" id="vent' + i + '"><div class="vent__in">' +
          "<p>" + v.body + "</p>" +
          '<dl class="spec">' + spec + "</dl>" + meter +
          '<p class="note vent__next"><b>Next up</b>' + v.next + "</p>" +
          '<p class="note vent__team"><b>Who builds it</b>' + esc(v.team) + "</p>" +
          '<div class="chips">' + v.stack.map(function (s) { return '<span class="chip">' + s + "</span>"; }).join("") + "</div>" +
          '<button class="link" type="button" data-chat-open data-chat-topic="Early access — ' + esc(v.name) +
            '">Ask for early access <span aria-hidden="true">&rarr;</span></button>' +
        "</div></div></article>";
    }).join("");
  }

  /* ══ Scenarios ═══════════════════════════════════════════════════════ */
  var CASES = [
    { id: "skincare", track: "AI Search + Email", client: "D2C skincare brand", scale: "$3.7M run-rate · DTC", span: "12 months",
      title: "Monthly revenue doubles once the assistant starts naming the brand",
      blurb: "Position one on Google for its hero term and still absent from every assistant conversation. Fixing that, then catching the traffic with email, models monthly revenue from $310K to $680K.",
      bench: "Calibrated on three published findings. Semrush puts ~90% of ChatGPT search citations on pages ranking 21 or lower and AI-search conversion at 4.4&times; ordinary organic. Its separate AI Overviews study finds AI Overview links overlap the organic top 10 only 20&ndash;26% of the time &mdash; the same gap measured a second way, on a different engine. Litmus puts retail and e-commerce email ROI at 45:1, which is why the last play is worth more than it looks.",
      diag: [{"l": "Buyer prompts tracked", "v": "240", "n": "Built from 14 months of tickets and reviews, each weighted by the revenue of the customers who asked it"}, {"l": "Prompts naming the brand", "v": "9 of 240", "n": "3.8%. Two legacy competitors appeared in 214 of the same 240"}, {"l": "Conflicting category descriptions", "v": "5", "n": "Site, schema, Amazon, Sephora and the press kit each described the brand differently"}, {"l": "Third-party pages naming the brand", "v": "34", "n": "Against roughly 900 for the category leader &mdash; the gap that actually decided retrieval"}, {"l": "Pages answering in the first 100 words", "v": "2 of 71", "n": "The other 69 opened with brand narrative, which a retriever cannot lift"}, {"l": "Email list and its share of revenue", "v": "61,000 &middot; 11%", "n": "One weekly broadcast to everyone, no segmentation, two dormant flows"}, {"l": "Blended acquisition cost", "v": "$61", "n": "Up 34% over eighteen months while paid competition intensified"}],
      phases: [{"m": "M1", "h": "Baseline, and the entity audit that reframes the project", "p": "The 240-prompt set goes live across ChatGPT, Perplexity, Gemini and Google AI Overviews. The audit finds five conflicting category descriptions in circulation. Nothing is published this month; the finding changes what gets published."}, {"m": "M2", "h": "Entity reconciliation ships first", "p": "One category phrase, used identically across the site, Product and Organization schema, Wikidata, Crunchbase and nine retailer listings. Citation rate moves 3.8% &rarr; 11% inside three weeks with no new content written. This is the cheapest movement in the whole engagement."}, {"m": "M4", "h": "34 pages rewritten to be extractable", "p": "Answer in the first 80 words, defined-terms block, strength-comparison table with real concentrations, explicit who-this-is-not-for section. Citation rate 22%. AI-referred sessions go from 310 to 2,400 a month."}, {"m": "M6", "h": "Corroboration starts landing", "p": "21 comparison roundups and 6 practitioner-authored guides carry the brand name next to the category. Citation rate 38%; monthly revenue crosses $470K. Most of these pages rank outside the top 20, which is exactly why they matter."}, {"m": "M9", "h": "The email engine catches the traffic", "p": "Regimen-builder welcome flow, per-SKU replenishment timing, behaviour-based segments. Listmonk on the brand&rsquo;s own box, segments as SQL views over the order table. Email moves 11% &rarr; 24% of revenue. First month above $600K."}, {"m": "M12", "h": "Steady state", "p": "61% citation rate on the tracked set, email at 29% of revenue, blended CAC down to $37, monthly revenue $680K &mdash; 2.2&times; the baseline."}],
      sources: [{"t": "Semrush — AI Search &amp; SEO Traffic Study", "u": "https://www.semrush.com/blog/ai-search-seo-traffic-study/", "d": "~90% of ChatGPT search citations point to pages ranking 21+; AI search visitors convert at 4.4&times; ordinary organic; 50% of ChatGPT links go to business and service sites."}, {"t": "Semrush — AI Overviews Study", "u": "https://www.semrush.com/blog/ai-overviews-study/", "d": "200,000 keywords. AI Overview links overlap the organic top 10 only 20&ndash;26% of the time; an average AI Overview carries 11 links and includes the #1 organic result just 46% of the time on desktop, 34% on mobile."}, {"t": "Litmus — State of Email / ROI of Email Marketing", "u": "https://www.litmus.com/blog/infographic-the-roi-of-email-marketing", "d": "Return per $1 spent by sector: retail, e-commerce and consumer goods 45:1; agencies 42:1; software and technology 36:1."}],
      problem: "Paid traffic was getting more expensive every quarter, and customers were arriving already sold — saying “ChatGPT suggested you” — but only 4% of the time. Asked directly, the assistants named the brand in 9 of 240 tracked buyer prompts. Two legacy competitors appeared in nearly all of them, not because their sites were better, but because dermatology blogs, forum threads and comparison roundups named them constantly and named this brand almost never. The email list of 61,000 was getting one broadcast a week and contributing 11% of revenue.",
      ai: "Claude is run over 14 months of support tickets, reviews and live-chat transcripts to cluster what customers actually asked — producing the 240-prompt set and, separately, revealing that three quarters of repeat-purchase language clustered around one question the email program never answered. That finding drives the regimen-builder sequence.",
      plays: [
        { h: "Cluster the customer data with a model", p: "14 months of tickets, reviews and chat logs grouped by an LLM into 240 buyer questions, each weighted by the revenue of the customers who asked it. Prioritisation follows revenue, not search volume." },
        { h: "Rewrite 34 pages to be extractable", p: "Direct answer in the first 80 words, a defined-terms block, a strength-comparison table with real percentages, and an explicit “who this is not for” section. Retrievers lift whole chunks, so the chunks have to stand alone." },
        { h: "Fix the entity graph", p: "Product schema with real ingredient concentrations, Organization schema with consistent founding claims, and matching category language on Wikidata, Crunchbase and every retailer listing." },
        { h: "Earn corroboration where models look", p: "Placement in 21 comparison roundups and review platforms, plus 6 practitioner-authored guides — mentions that put the brand name next to the category on pages ranking well outside the top ten." },
        { h: "Build the email engine on top", p: "AI-referred visitors convert far better than paid but bounce on first visit. A regimen-builder welcome flow, replenishment timing per SKU and behaviour-based segmentation take email from 11% to 29% of revenue &mdash; built on self-hosted Listmonk with the segmentation done in SQL against the order table, because the timing model needs per-customer order intervals a hosted tool will not expose." }],
      results: [{ l: "Monthly revenue", f: "$310K", t: "$680K" }, { l: "Added cash flow per month", f: "—", t: "+$370K" }, { l: "Prompts citing the brand, of 240", f: "4%", t: "61%" }, { l: "Email share of revenue", f: "11%", t: "29%" }, { l: "Blended acquisition cost", f: "$61", t: "$37" }],
      chart: { cap: "Monthly revenue, $ thousands", unit: "K", series: [310, 342, 398, 470, 551, 624, 680], labels: ["M0", "M2", "M4", "M6", "M8", "M10", "M12"] },
      stack: ["ChatGPT", "Perplexity", "Google AI Overviews", "Gemini", "Product schema", "Listmonk", "Coolify"],
      lever: "The comparison tables. Assistants answering “which is better for X” need something to compare, and a page that lays out the trade-off honestly — including where a competitor wins — gets retrieved far more than a page that only claims to be best. Second lever, quieter: the replenishment timing only worked because the order history sat in a Postgres table we could query directly &mdash; that model is not expressible in a hosted email tool&rsquo;s segment builder.",
      kpis: [["2.2×", "Monthly revenue"], ["+$370K", "Added per month"], ["61%", "Citation rate"]] },

    { id: "hrtech", track: "AI Search + Email", client: "B2B SaaS · HR tech", scale: "Series A · 90-day cycle", span: "12 months",
      title: "MRR doubles after fixing what assistants said the product was",
      blurb: "Buyers shortlist via ChatGPT before ever visiting a vendor site — and the assistants have the category wrong. Correcting it models monthly recurring revenue from $500K to $1.03M.",
      bench: "Built on Semrush&rsquo;s finding that 50% of the links in ChatGPT responses point to business and service sites, and that its citation pool sits well below page-one rankings. ChatGPT&rsquo;s weekly active users grew roughly 8&times; between October 2023 and April 2025 to over 800 million, which is the reason a shortlist formed inside an assistant is now a routine part of a B2B buying cycle rather than an edge case.",
      diag: [{"l": "Category prompts tracked", "v": "180", "n": "Drawn from won and lost CRM notes, not from a keyword tool"}, {"l": "Prompts naming the product", "v": "11%", "n": "20 of 180, and rarely in the first two positions of the answer"}, {"l": "Correct category attribution", "v": "34%", "n": "When named at all, assistants called it applicant tracking two times in three"}, {"l": "Comparison pages published", "v": "0", "n": "All nine head-to-head queries were being answered by affiliate sites"}, {"l": "Docs pages reachable without login", "v": "0 of 340", "n": "The entire implementation story was invisible to every crawler and retriever"}, {"l": "Nurture sequences running", "v": "1", "n": "A monthly newsletter to every contact regardless of stage or intent"}, {"l": "Average sales cycle", "v": "90 days", "n": "Half of discovery calls opened with a shortlist the buyer already had"}],
      phases: [{"m": "M1", "h": "Baseline, and finding the miscategorisation", "p": "The 180-prompt set goes live. The damaging finding is not absence but misdescription: the product is being entered into comparisons it cannot win because assistants have the category wrong."}, {"m": "M2", "h": "One category phrase, everywhere", "p": "Homepage, SoftwareApplication schema, G2, Capterra, LinkedIn, Crunchbase and every live press mention are reconciled to a single phrase. Correct attribution 34% &rarr; 71% in six weeks."}, {"m": "M3", "h": "The CRM analysis redirects the content plan", "p": "A model separates the language of closed deals from stalled ones. Closed deals talk about implementation time; stalled deals talk about integrations. Both the comparison pages and the nurture rewrite are re-anchored on time-to-live."}, {"m": "M5", "h": "Nine honest comparison pages, including both giants", "p": "Each carries a choose-them-if section. Citation rate 11% &rarr; 34%. Refusing to write these had been leaving nine high-intent answers to sites with no incentive to be accurate."}, {"m": "M7", "h": "The docs site becomes a retrieval asset", "p": "340 pages of public docs, changelog and an implementation guide with defined terms and real time estimates. Technical buyers ask assistants implementation questions; the answers now come from first-party documentation."}, {"m": "M9", "h": "Nurture rebuilt around time-to-live", "p": "Five stage-based sequences replace the monthly newsletter, each opening on the implementation-time claim. Sales cycle 90 &rarr; 71 days."}, {"m": "M12", "h": "Steady state", "p": "58% citation rate, 96% correct attribution, 64-day sales cycle, MRR $1.03M &mdash; 2.1&times; the baseline."}],
      sources: [{"t": "Semrush — AI Search &amp; SEO Traffic Study", "u": "https://www.semrush.com/blog/ai-search-seo-traffic-study/", "d": "~90% of ChatGPT search citations point to pages ranking 21+; AI search visitors convert at 4.4&times; ordinary organic; 50% of ChatGPT links go to business and service sites."}, {"t": "Semrush — AI Overviews Study", "u": "https://www.semrush.com/blog/ai-overviews-study/", "d": "200,000 keywords. AI Overview links overlap the organic top 10 only 20&ndash;26% of the time; an average AI Overview carries 11 links and includes the #1 organic result just 46% of the time on desktop, 34% on mobile."}, {"t": "Litmus — State of Email / ROI of Email Marketing", "u": "https://www.litmus.com/blog/infographic-the-roi-of-email-marketing", "d": "Return per $1 spent by sector: retail, e-commerce and consumer goods 45:1; agencies 42:1; software and technology 36:1."}],
      problem: "Sales kept hearing the same thing on discovery calls: the buyer had already narrowed to three vendors before making contact, and half said the shortlist came from an AI assistant. The company was named in 11% of 180 category prompts, and when it was named it was described with the wrong category — “applicant tracking” rather than “onboarding automation” — which pushed it into comparisons it always lost. Nurture email was a single monthly newsletter to every contact regardless of stage.",
      ai: "Two years of won and lost CRM notes go to a model with one question: separate the language of deals that closed from deals that stalled. Closed deals talk about implementation time; stalled ones talk about integrations. That reframes both the comparison pages and the nurture sequence around time-to-live.",
      plays: [
        { h: "Re-anchor the category claim", p: "The single highest-leverage fix: one category phrase, used identically on the homepage, in schema, on review platforms, LinkedIn, Crunchbase and every press mention. Models had been averaging three conflicting descriptions." },
        { h: "Publish the comparisons buyers ask for", p: "Nine honest head-to-head pages including the two giants, with a “choose them if” section. Refusing to write these leaves the field to affiliate sites with no incentive to be accurate." },
        { h: "Turn the docs site into a retrieval asset", p: "Public docs, changelog and an implementation guide with defined terms and time estimates. Technical buyers ask assistants implementation questions; the answers now come from first-party docs." },
        { h: "Rebuild nurture around time-to-live", p: "Five stage-based sequences replacing the monthly newsletter, each opening on the implementation-time claim the CRM analysis surfaced." },
        { h: "Wire citations to pipeline", p: "Prompt-level tracking joined to CRM so we can see which prompts produce opportunities, not just mentions. Content priority follows closed revenue." }],
      results: [{ l: "Monthly recurring revenue", f: "$500K", t: "$1.03M" }, { l: "Added cash flow per month", f: "—", t: "+$530K" }, { l: "Prompts citing the product, of 180", f: "11%", t: "58%" }, { l: "Correct category attribution", f: "34%", t: "96%" }, { l: "Sales cycle length", f: "90 days", t: "64 days" }],
      chart: { cap: "Monthly recurring revenue, $ thousands", unit: "K", series: [500, 540, 620, 730, 850, 950, 1030], labels: ["M0", "M2", "M4", "M6", "M8", "M10", "M12"] },
      stack: ["ChatGPT", "Perplexity", "Copilot", "llms.txt", "SoftwareApplication schema", "Payload CMS"],
      lever: "Category consistency. Nothing else moves the number until every source agrees on what the product is — after that, every other tactic compounds instead of fighting itself.",
      kpis: [["2.1×", "Monthly revenue"], ["+$530K", "Added per month"], ["−26d", "Sales cycle"]] },

    { id: "medspa", track: "SEO + Email", client: "Multi-location med spa", scale: "7 locations · 2 metros", span: "12 months",
      title: "Seven locations, one shared phone number, 2.4× the cash collected",
      blurb: "Near-duplicate location pages, a booking flow search engines cannot reach, and no follow-up on unbooked enquiries. Monthly cash collected models from $154K to $371K.",
      bench: "Anchored to Ahrefs&rsquo; measurement that AI Overviews cut clickthrough for top-ranking pages by 34.5% across 300,000 keywords, and that 99.2% of AI Overview&ndash;triggering keywords are informational. That combination is the whole argument for this engagement: the informational cluster had to earn citations rather than rankings, because the rankings alone were going to return less every quarter.",
      diag: [{"l": "Locations, and locations findable in their own metro", "v": "7 &middot; 2", "n": "Five were effectively invisible in their own neighbourhoods"}, {"l": "Unique words across the seven location pages", "v": "under 8%", "n": "Each launch cloned the previous page and swapped the city name"}, {"l": "Service-location combinations indexed", "v": "0 of 140", "n": "Pricing and availability rendered client-side behind a script"}, {"l": "Non-branded first-page terms", "v": "12", "n": "Across a seven-location, two-metro footprint"}, {"l": "Enquiries that never booked", "v": "~60%", "n": "No sequence existed to bring any of them back"}, {"l": "Tracking numbers across seven locations", "v": "1", "n": "Which made per-location attribution impossible to reconstruct"}, {"l": "Directories with matching name and address data", "v": "11 of 40", "n": "The single strongest local entity signal, and it disagreed with itself"}],
      phases: [{"m": "M1", "h": "Baseline, and the consultation-note analysis", "p": "A model summarises consultation notes and no-show records. The dominant reason enquiries stall is not price &mdash; it is uncertainty about recovery time. That answer sets the content plan and the email sequence."}, {"m": "M2", "h": "Server-rendering the booking layer", "p": "Availability, pricing and practitioner detail move into the HTML. 140 service-location combinations become indexable for the first time. This ships before any content, because content would have underperformed while the services stayed invisible."}, {"m": "M4", "h": "Seven location pages rebuilt as distinct entities", "p": "Per-location staff, hours, parking, real interior photography, market pricing and unique treatment copy. Organic sessions 4,100 &rarr; 9,800 a month."}, {"m": "M6", "h": "The recovery-time cluster goes live", "p": "38 pages answering pre-treatment questions. They feed AI Overviews as a side effect and supply about a third of organic entrances by M9."}, {"m": "M8", "h": "Local signals repaired", "p": "Distinct tracking numbers and Business Profiles per location, name and address data reconciled across 40 directories, review generation split per location instead of pooled."}, {"m": "M10", "h": "Unbooked enquiries sequenced", "p": "A three-email pre-consultation flow addressing recovery time directly, plus rebooking timed to treatment cycles. Enquiry-to-booking 40% &rarr; 64%."}, {"m": "M12", "h": "Steady state", "p": "27,600 organic sessions, 118 non-branded first-page terms, 71% enquiry-to-booking, $371K collected &mdash; 2.4&times; the baseline."}],
      sources: [{"t": "Ahrefs — AI Overviews Reduce Clicks", "u": "https://ahrefs.com/blog/ai-overviews-reduce-clicks/", "d": "300,000 keywords, March 2024 vs March 2025. Top-ranking pages lost 34.5% of their clickthrough once an AI Overview appeared; 99.2% of AI Overview&ndash;triggering keywords are informational in intent."}, {"t": "Semrush — AI Overviews Study", "u": "https://www.semrush.com/blog/ai-overviews-study/", "d": "200,000 keywords. AI Overview links overlap the organic top 10 only 20&ndash;26% of the time; an average AI Overview carries 11 links and includes the #1 organic result just 46% of the time on desktop, 34% on mobile."}, {"t": "Litmus — State of Email / ROI of Email Marketing", "u": "https://www.litmus.com/blog/infographic-the-roi-of-email-marketing", "d": "Return per $1 spent by sector: retail, e-commerce and consumer goods 45:1; agencies 42:1; software and technology 36:1."}],
      problem: "Each new location had been launched by cloning the last one's page and swapping the city name. Google picked one page per service and ignored the rest, so five of seven locations were effectively unfindable in their own neighbourhoods. The booking widget rendered client-side behind a script, so no service or price was ever indexed. And roughly 60% of enquiries never booked, with no sequence to bring them back.",
      ai: "Consultation notes and no-show records are summarised by a model to find why enquiries stall. The dominant reason is not price — it is uncertainty about recovery time. That answer becomes both a content cluster and a three-email pre-consultation sequence.",
      plays: [
        { h: "Rebuild location pages as distinct entities", p: "Per-location staff, hours, parking notes, real interior photography, market-specific pricing and unique treatment copy. Seven pages that deserve to rank separately, instead of one page seven times." },
        { h: "Server-render the booking layer", p: "Availability, pricing and practitioner detail moved into the HTML. That alone makes 140 service-location combinations indexable for the first time." },
        { h: "Build the recovery-time cluster", p: "38 pages answering pre-treatment questions — recovery, contraindications, cost ranges — which feed AI Overviews as a side effect and supply a third of organic entrances." },
        { h: "Repair local signals", p: "Distinct tracking numbers and Business Profiles per location, consistent name and address data across 40 directories, and review generation split by location instead of pooled." },
        { h: "Sequence the unbooked enquiries", p: "A three-email pre-consultation flow addressing recovery time directly, plus a rebooking flow timed to treatment cycles." }],
      results: [{ l: "Monthly cash collected", f: "$154K", t: "$371K" }, { l: "Added cash flow per month", f: "—", t: "+$217K" }, { l: "Monthly organic sessions", f: "4,100", t: "27,600" }, { l: "Enquiry-to-booking rate", f: "40%", t: "71%" }, { l: "Non-branded first-page terms", f: "12", t: "118" }],
      chart: { cap: "Monthly cash collected, $ thousands", unit: "K", series: [154, 178, 214, 262, 305, 342, 371], labels: ["M0", "M2", "M4", "M6", "M8", "M10", "M12"] },
      stack: ["Technical SEO", "LocalBusiness schema", "SSR", "Business Profiles", "Listmonk", "Umami"],
      lever: "Server-rendering the booking widget. A year of content work would underperform while the actual services and prices stay invisible to crawlers.",
      kpis: [["2.4×", "Cash collected"], ["+$217K", "Added per month"], ["12→118", "Page-one terms"]] },

    { id: "marketplace", track: "SEO", client: "Vertical marketplace", scale: "2.4M URLs · 11 countries", span: "12 months",
      title: "Deleting 2.1M pages adds $638K a month in organic revenue",
      blurb: "Faceted navigation generated millions of near-identical filter combinations. Crawl budget drains there and never reaches new inventory. Removing them models organic revenue from $412K to $1.05M a month.",
      bench: "Grounded in the 2025 shift in AI Overview query intent &mdash; informational share fell from 91.3% to 57.1% as commercial and transactional queries moved in, across 10M+ keywords. Semrush&rsquo;s separate study of 200,000 keywords found AI Overview links overlap the organic top 10 only 20&ndash;26% of the time, with an average of 11 links per answer. For a marketplace, that means inventory pages have to be indexed and fresh to be eligible at all &mdash; which is a crawl problem before it is a content problem.",
      diag: [{"l": "Total URLs, and URLs worth crawling", "v": "2.4M &middot; ~300K", "n": "The rest were colour &times; size &times; sort &times; page permutations"}, {"l": "Crawl requests hitting filter permutations", "v": "87%", "n": "Measured over six weeks of raw server logs, not a crawl simulation"}, {"l": "Time to index a new listing", "v": "19 days", "n": "By which point roughly a third had already sold"}, {"l": "Crawl interval on core category pages", "v": "~6 weeks", "n": "The pages carrying the revenue were the ones being starved"}, {"l": "Indexed pages that earn a click", "v": "9%", "n": "A direct measure of how much of the index was dead weight"}, {"l": "Countries, and countries with valid reciprocal hreflang", "v": "11 &middot; 4", "n": "Duplicated English variants had been competing with each other for years"}, {"l": "Estimated hand-classification time quoted", "v": "3 months", "n": "For 2.4M URL patterns. The model does it in four days."}],
      phases: [{"m": "M1", "h": "Read the logs before touching anything", "p": "Six weeks of raw logs segmented by URL pattern, response code and bot. Every decision after this is made against observed crawl behaviour."}, {"m": "M2", "h": "Classify 2.4M URL patterns with a model", "p": "Keep, canonicalise or block, cross-referenced against actual entrance and revenue data. This is what turns deleting 2.1M URLs from a gamble into a decision."}, {"m": "M3", "h": "Collapse the facet space", "p": "2.1M URLs removed from the crawlable set; 40,000 genuinely valuable combinations kept and strengthened. Crawl requests hitting valuable URLs 13% &rarr; 41% within a month."}, {"m": "M5", "h": "Make freshness discoverable", "p": "Segmented sitemaps by inventory age with accurate lastmod, plus a new-listings feed. Indexation of new inventory 19 days &rarr; 2.8 days."}, {"m": "M7", "h": "Rebuild internal linking around real demand", "p": "Hub pages for the facet combinations with actual search demand, linked from category headers, replacing a flat pagination chain that buried everything past page three."}, {"m": "M9", "h": "Localise properly, per market", "p": "Reciprocal hreflang corrected across 11 countries; duplicated English variants split. Revenue crosses $900K."}, {"m": "M12", "h": "Steady state", "p": "79% of crawl hitting valuable URLs, 1.6-day indexation, 44% of indexed pages earning a click, $1.05M a month &mdash; 2.5&times; the baseline."}],
      sources: [{"t": "Semrush — AI Overviews Study", "u": "https://www.semrush.com/blog/ai-overviews-study/", "d": "200,000 keywords. AI Overview links overlap the organic top 10 only 20&ndash;26% of the time; an average AI Overview carries 11 links and includes the #1 organic result just 46% of the time on desktop, 34% on mobile."}, {"t": "Semrush — AI Overview prevalence and intent, 2025", "u": "https://www.semrush.com/blog/ai-overviews-study/", "d": "AI Overviews appeared on 6.49% of searches in January 2025, 24.61% in July and 15.69% in November. Purely informational share of those queries fell from 91.3% to 57.1% as commercial intent moved in."}, {"t": "Semrush — AI Search &amp; SEO Traffic Study", "u": "https://www.semrush.com/blog/ai-search-seo-traffic-study/", "d": "~90% of ChatGPT search citations point to pages ranking 21+; AI search visitors convert at 4.4&times; ordinary organic; 50% of ChatGPT links go to business and service sites."}],
      problem: "Log analysis told the story bluntly: 87% of crawl requests hit filter permutations — colour plus size plus sort plus page — that no human had ever landed on. Fresh listings took 19 days to be indexed, by which point roughly a third had already sold. Category pages that mattered were being crawled once every six weeks.",
      ai: "A model classifies six weeks of raw log lines and 2.4M URL patterns into keep, canonicalise and block buckets, cross-referenced against actual entrance and revenue data. By hand that was quoted at three months; it takes four days, and it is what makes deleting 2.1M URLs a decision rather than a gamble.",
      plays: [
        { h: "Read the server logs first", p: "Six weeks of raw logs segmented by URL pattern, response code and bot. Every decision after this is made against observed crawl behaviour rather than a crawl simulation." },
        { h: "Collapse the facet space", p: "A rules matrix decides which facet combinations are indexable, which are canonicalised, and which are blocked outright. 2.1M URLs removed from the crawlable set; 40,000 valuable combinations kept and strengthened." },
        { h: "Make freshness discoverable", p: "Segmented sitemaps by inventory age with accurate lastmod, plus a new-listings feed. Indexation of new inventory drops from 19 days to under 2." },
        { h: "Rebuild internal linking around demand", p: "Hub pages for the facet combinations with real search demand, linked from category headers, replacing a flat pagination chain that buried everything past page three." },
        { h: "Localise properly, per market", p: "Corrected reciprocal hreflang across 11 countries and split duplicated English variants that had been competing with each other for years." }],
      results: [{ l: "Monthly organic revenue", f: "$412K", t: "$1.05M" }, { l: "Added cash flow per month", f: "—", t: "+$638K" }, { l: "Crawl requests hitting valuable URLs", f: "13%", t: "79%" }, { l: "Time to index a new listing", f: "19 days", t: "1.6 days" }, { l: "Indexed pages that earn a click", f: "9%", t: "44%" }],
      chart: { cap: "Monthly organic revenue, $ thousands", unit: "K", series: [412, 430, 509, 648, 796, 921, 1050], labels: ["M0", "M2", "M4", "M6", "M8", "M10", "M12"] },
      stack: ["Log file analysis", "Crawl budget", "hreflang", "Segmented sitemaps", "Postgres"],
      lever: "Deleting, not adding. Removing 2.1M worthless URLs from the crawlable set does more for revenue than any content produced that year.",
      kpis: [["2.5×", "Organic revenue"], ["+$638K", "Added per month"], ["19→1.6d", "Indexation"]] },

    { id: "coldemail", track: "Email · Outbound", client: "B2B services firm", scale: "4-person sales team", span: "12 months",
      title: "Cut sends by 83% and double revenue on replies alone",
      blurb: "180,000 emails a month from a scorched domain, a 0.4% reply rate, and invoices landing in spam. Rebuilding around reply rate models monthly revenue from $258K to $533K.",
      bench: "Sized against Litmus&rsquo; sector ROI benchmarks &mdash; 36:1 for software and technology, 42:1 for agencies, 45:1 for retail and e-commerce. Those returns are per dollar spent, not per email sent, which is precisely why cutting volume by 83% is the profitable move rather than the risky one: the cost falls, the deliverability recovers, and the replies that remain are worth more.",
      diag: [{"l": "Monthly sending volume", "v": "180,000", "n": "From the company&rsquo;s primary domain, to a purchased and unverified list"}, {"l": "Reply rate", "v": "0.4%", "n": "About 720 replies a month, most of them hostile"}, {"l": "Sends not reaching an inbox", "v": "~41%", "n": "Measured on a seed list, not inferred from open rates"}, {"l": "Blocklists carrying the primary domain", "v": "2", "n": "Which also broke transactional mail &mdash; invoices were landing in spam"}, {"l": "Contacts, and contacts matching the closed-won profile", "v": "96,000 &middot; 17,400", "n": "The other 82% were never going to buy, at any volume"}, {"l": "Qualified calls booked per month", "v": "9", "n": "From 180,000 sends. The sales team had stopped trusting the channel."}, {"l": "Replies never followed up", "v": "~50%", "n": "No routing, no owner, no response target"}],
      phases: [{"m": "M1", "h": "Quarantine the primary domain", "p": "All outbound moves to four dedicated sending domains with correct SPF, DKIM and DMARC. The primary goes send-silent to recover. Transactional deliverability &mdash; and therefore collections &mdash; is restored in week three."}, {"m": "M2", "h": "Warm the new infrastructure", "p": "21-day warmup across four domains with per-mailbox volume caps. Nothing prospect-facing sends this month. Skipping this step is how the previous setup got blocklisted."}, {"m": "M3", "h": "Rebuild the profile from won and lost data", "p": "A model reads two years of CRM notes and returns the firmographic and trigger patterns separating closed from stalled. 96,000 contacts become 17,400 verified, deduped matches."}, {"m": "M5", "h": "Sequences written to earn a reply", "p": "One observation drawn from the matched pattern, one specific claim, one low-friction ask. Four steps. Tested on reply rate, never on opens. Reply rate 0.4% &rarr; 3.6%."}, {"m": "M7", "h": "Instrument deliverability permanently", "p": "Seed-list inbox placement monitoring with an automatic pause on any domain dropping below 85% placement. Volume settles at 31K a month, down 83%."}, {"m": "M9", "h": "Fix the handoff", "p": "Replies routed by intent into the CRM with a four-hour response target. This alone roughly doubles booked calls, because half the previous program&rsquo;s losses were replies nobody answered."}, {"m": "M12", "h": "Steady state", "p": "7.1% reply rate, 78 qualified calls a month from 31K sends, $533K monthly revenue &mdash; 2.1&times; the baseline on 17% of the sending volume."}],
      sources: [{"t": "Litmus — State of Email / ROI of Email Marketing", "u": "https://www.litmus.com/blog/infographic-the-roi-of-email-marketing", "d": "Return per $1 spent by sector: retail, e-commerce and consumer goods 45:1; agencies 42:1; software and technology 36:1."}, {"t": "Semrush — AI Search &amp; SEO Traffic Study", "u": "https://www.semrush.com/blog/ai-search-seo-traffic-study/", "d": "~90% of ChatGPT search citations point to pages ranking 21+; AI search visitors convert at 4.4&times; ordinary organic; 50% of ChatGPT links go to business and service sites."}],
      problem: "The previous setup sent everything from the company's primary domain to a purchased list with no verification. By the time I looked, the domain was on two blocklists, roughly 41% of sends were not reaching an inbox at all, and — worse — the domain's transactional email was failing too, so invoices were landing in spam and collections were slipping.",
      ai: "The ideal-customer profile is not guessed. A model reads every won and lost deal note from the CRM and returns the firmographic and trigger patterns that separated them, which cuts the addressable list by 82% and writes the first line of each sequence from the pattern matching that account.",
      plays: [
        { h: "Quarantine the primary domain", p: "Move all outbound to four dedicated sending domains with correct SPF, DKIM and DMARC, warmed over 21 days. The primary domain goes send-silent to recover, and transactional deliverability is restored in week three." },
        { h: "Rebuild the profile from won/lost data", p: "An LLM over two years of CRM notes returns the patterns that actually separate closed deals. 96,000 unverified contacts become 17,400 that match, verified and deduped against CRM." },
        { h: "Write sequences worth replying to", p: "One observation about their business drawn from the matched pattern, one specific claim, one low-friction ask. Four steps, no “just circling back”. Testing on reply rate, not opens." },
        { h: "Instrument deliverability", p: "Seed-list inbox placement monitoring, per-domain reputation and per-mailbox volume caps, with an automatic pause on any domain whose placement drops below 85%." },
        { h: "Fix the handoff", p: "Replies routed by intent into the CRM with a four-hour response target. Half the previous program's losses were replies nobody followed up on." }],
      results: [{ l: "Monthly revenue", f: "$258K", t: "$533K" }, { l: "Added cash flow per month", f: "—", t: "+$275K" }, { l: "Reply rate", f: "0.4%", t: "7.1%" }, { l: "Qualified calls booked per month", f: "9", t: "78" }, { l: "Monthly sending volume", f: "180K", t: "31K" }],
      chart: { cap: "Monthly revenue, $ thousands", unit: "K", series: [258, 271, 342, 438, 496, 533], labels: ["M0", "M2", "M4", "M6", "M9", "M12"] },
      stack: ["Deliverability", "SPF / DKIM / DMARC", "Stalwart", "Listmonk", "n8n", "Claude API", "Payload CMS"],
      lever: "Sending 83% less. Every metric that matters improves as volume falls, because the constraint was never reach — it was whether the message arrived and deserved an answer.",
      kpis: [["2.1×", "Monthly revenue"], ["+$275K", "Added per month"], ["7.1%", "Reply rate"]] },

    { id: "lifecycle", track: "Email · Lifecycle", client: "Subscription e-commerce", scale: "74K list · $1M/mo", span: "12 months",
      title: "Email goes from 9% of revenue to a third, adding $420K a month",
      blurb: "One weekly broadcast to everybody, two abandoned automations, and 38% of the list dormant for a year. Rebuilding it models email-attributed revenue from $90K to $483K a month.",
      bench: "Sized against Litmus&rsquo; benchmark of 45:1 email ROI in retail, e-commerce and consumer goods &mdash; the highest-return sector in that study, ahead of agencies at 42:1 and software at 36:1. That is the reason this work is sequenced last in a program and valued first in the model: it is the cheapest place to put attention that has already been earned somewhere else.",
      diag: [{"l": "Email share of total revenue", "v": "9%", "n": "Against a 20&ndash;30% norm for subscription e-commerce at this list size"}, {"l": "Automations running", "v": "2", "n": "A welcome email and a cart reminder, neither touched in two years"}, {"l": "Sends per week, and segments", "v": "1 &middot; 0", "n": "The same broadcast to a subscriber of one day and a churned customer of eighteen months"}, {"l": "List, and contacts dormant 12 months", "v": "74,000 &middot; 28,000", "n": "38% of the list was actively degrading inbox placement for the other 62%"}, {"l": "Revenue per recipient, per send", "v": "$0.11", "n": "The single number that exposes how much of the list was dead"}, {"l": "Monthly subscription churn", "v": "7.4%", "n": "Roughly a fifth of the subscriber base lost every quarter"}, {"l": "Replenishment reminders keyed to actual consumption", "v": "0", "n": "Reminders used the label&rsquo;s suggested duration, which fit almost nobody"}],
      phases: [{"m": "M1", "h": "Model consumption per customer", "p": "Order intervals per product feed a per-customer consumption estimate. Reminder windows are set individually from that estimate rather than from the label. This one change accounts for most of the churn improvement that follows."}, {"m": "M2", "h": "Sunset the dead weight", "p": "A four-email reactivation attempt, then suppression of the 28,000 who do not respond. Inbox placement rises immediately and revenue per send rises with it &mdash; sending to fewer people earns more."}, {"m": "M4", "h": "Ship the flows that carry the revenue", "p": "Welcome with a first-purchase path, browse and cart abandonment, post-purchase education. Email share 9% &rarr; 17%."}, {"m": "M6", "h": "Replenishment goes live", "p": "Per-customer timing from the M1 model. This is the flow that out-earns the other eight put together, and churn starts falling within two cycles."}, {"m": "M8", "h": "Win-back and pre-churn save", "p": "A save sequence for subscribers showing pre-churn behaviour, plus win-back for lapsed one-time buyers. Monthly churn 7.4% &rarr; 5.2%."}, {"m": "M10", "h": "Segment the broadcast", "p": "Sends keyed to purchase recency, category affinity and subscription status. The weekly broadcast becomes four variants of a weekly broadcast. Revenue per recipient $0.11 &rarr; $0.52."}, {"m": "M12", "h": "Steady state", "p": "$483K a month from email at 34% of revenue, $0.68 revenue per recipient, 4.1% churn &mdash; 5.4&times; the email number it started at."}],
      sources: [{"t": "Litmus — State of Email / ROI of Email Marketing", "u": "https://www.litmus.com/blog/infographic-the-roi-of-email-marketing", "d": "Return per $1 spent by sector: retail, e-commerce and consumer goods 45:1; agencies 42:1; software and technology 36:1."}, {"t": "Semrush — AI Search &amp; SEO Traffic Study", "u": "https://www.semrush.com/blog/ai-search-seo-traffic-study/", "d": "~90% of ChatGPT search citations point to pages ranking 21+; AI search visitors convert at 4.4&times; ordinary organic; 50% of ChatGPT links go to business and service sites."}],
      problem: "Email was contributing 9% of revenue and treated as an announcement channel: one send a week to the whole list, regardless of whether someone had subscribed that morning or churned eighteen months ago. Deliverability was degrading under the weight of unengaged contacts, and the two flows that did exist — a welcome email and a cart reminder — had not been touched in two years. Subscription churn was running at 7.4% a month.",
      ai: "Order-interval data per product is modelled to estimate how fast each customer actually consumes it, rather than using the label's suggested duration. Reminder windows are set per customer from that estimate. This one change accounts for most of the churn improvement.",
      plays: [
        { h: "Model consumption per customer", p: "Order intervals per product feed a per-customer consumption estimate, which sets each replenishment reminder window individually. Getting this wrong in either direction is the biggest source of avoidable churn." },
        { h: "Sunset the dead weight", p: "A four-email reactivation attempt, then suppression of the 28,000 contacts who do not respond. Sending to fewer people raises inbox placement, and revenue per send rises immediately." },
        { h: "Build the flows that carry the revenue", p: "Nine automations: welcome with a first-purchase path, browse and cart abandonment, post-purchase education, replenishment, win-back, and a pre-churn save for subscribers." },
        { h: "Segment on behaviour, not demographics", p: "Sends keyed to purchase recency, category affinity and subscription status. The weekly broadcast becomes four variants of a weekly broadcast." },
        { h: "Test the whole flow, not subject lines", p: "Offer structure, sequence length and timing — the things with real effect sizes — rather than another month of subject-line tests." }],
      results: [{ l: "Email-attributed revenue / month", f: "$90K", t: "$483K" }, { l: "Added cash flow per month", f: "—", t: "+$420K" }, { l: "Email share of total revenue", f: "9%", t: "34%" }, { l: "Revenue per recipient, per send", f: "$0.11", t: "$0.68" }, { l: "Subscription churn, monthly", f: "7.4%", t: "4.1%" }],
      chart: { cap: "Email-attributed revenue, $ thousands / month", unit: "K", series: [90, 132, 205, 268, 342, 421, 483], labels: ["M0", "M2", "M4", "M6", "M8", "M10", "M12"] },
      stack: ["Listmonk", "Lifecycle flows", "Consumption modelling", "List hygiene", "Postgres"],
      lever: "Replenishment timing. Nine flows ship, and the one that maps reminders to how fast people actually use the product out-earns the other eight put together.",
      kpis: [["5.4×", "Email revenue"], ["+$420K", "Added per month"], ["−45%", "Churn"]] }
  ];

  /* ══ Charts ══════════════════════════════════════════════════════════ */
  var FONT = "Jost, sans-serif";
  var C = { grid: "#272219", muted: "#948D7B", gold: "#CFAF67", goldLight: "#EBD59F",
            bar: "#2E2820", line: "#443C2E", alert: "#D06A60" };

  function niceMax(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    var m = n <= 1 ? 1 : n <= 1.2 ? 1.2 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5
          : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10;
    return m * p;
  }
  function columns(ch, active) {
    var W = 520, H = 210, PL = 46, PR = 8, PT = 30, PB = 28;
    var max = niceMax(Math.max.apply(null, ch.series) * 1.1), n = ch.series.length;
    var iw = W - PL - PR, ih = H - PT - PB, step = iw / n, bw = Math.min(38, step * 0.58);
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img"><title>' + ch.cap + "</title>";
    for (var g = 0; g <= 4; g++) {
      var v = max / 4 * g, y = PT + ih - (v / max) * ih;
      s += '<line x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + y.toFixed(1) +
        '" stroke="' + C.grid + '" stroke-width="1"/><text x="' + (PL - 8) + '" y="' + (y + 4).toFixed(1) +
        '" text-anchor="end" fill="' + C.muted + '" font-family="' + FONT + '" font-size="10">' +
        (v >= 1000 ? (v / 1000) + "k" : Math.round(v * 10) / 10) + "</text>";
    }
    ch.series.forEach(function (v, i) {
      var bh = (v / max) * ih, x = PL + step * i + (step - bw) / 2, y = PT + ih - bh, on = i === active;
      s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + Math.max(bh, 1.5).toFixed(1) + '" fill="' + (on ? C.goldLight : C.bar) + '"/>' +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 9).toFixed(1) + '" text-anchor="middle" fill="' +
        (on ? C.goldLight : C.muted) + '" font-family="' + FONT + '" font-size="11" font-weight="500">' + v + "</text>" +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" fill="' +
        (on ? C.gold : C.muted) + '" font-family="' + FONT + '" font-size="10" font-weight="500" letter-spacing="1.2">' +
        ch.labels[i] + "</text>";
    });
    return s + "</svg>";
  }

  /* ══ Case cards & detail ═════════════════════════════════════════════ */
  function caseCard(c) {
    return '<button class="card sheen" data-case="' + c.id + '">' +
      '<div class="card__top"><span class="card__track">' + c.track + '</span><span class="tag">Modelled</span></div>' +
      "<div><h3>" + c.title + '</h3><span class="card__meta">' + c.client + " &middot; " + c.span + "</span></div>" +
      "<p>" + c.blurb + "</p>" +
      '<div class="kpis">' + c.kpis.map(function (k) {
        return '<span class="kpi"><span class="kpi__fig">' + k[0] + '</span><span class="kpi__lbl">' + k[1] + "</span></span>";
      }).join("") + "</div>" +
      '<span class="link">Read the breakdown <span aria-hidden="true">&rarr;</span></span></button>';
  }

  var curCase = null;
  function paintScrub(i) {
    var ch = curCase.chart, base = ch.series[0], v = ch.series[i];
    $("scrubMonth").textContent = ch.labels[i];
    $("scrubVal").textContent = "$" + v + ch.unit;
    $("scrubDelta").textContent = i === 0 ? "Baseline month"
      : "+$" + (v - base) + ch.unit + "  ·  " + (v / base).toFixed(2) + "× baseline";
    $("scrubChart").innerHTML = columns(ch, i);
  }
  function renderCase(id) {
    var c = CASES.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    curCase = c;
    var last = c.chart.series.length - 1;
    var others = CASES.filter(function (x) { return x.id !== id; }).slice(0, 3);
    $("caseBody").innerHTML =
      '<div class="stack-lg">' +
      '<a class="link mut" data-go="work" href="#work"><span aria-hidden="true">&larr;</span> All scenarios</a>' +
      '<div class="head head--case"><span class="t-label au">' + c.track +
        '</span><h1 class="t-d2">' + c.title + "</h1></div>" +
      '<p class="t-lead lead--case">' + c.blurb + "</p>" +
      '<dl class="meta">' +
        "<div><dt>Profile</dt><dd>" + c.client + "</dd></div>" +
        "<div><dt>Scale</dt><dd>" + c.scale + "</dd></div>" +
        "<div><dt>Horizon</dt><dd>" + c.span + "</dd></div>" +
        "<div><dt>Type</dt><dd>Modelled scenario</dd></div>" +
      "</dl>" +
      '<div class="accent sheen"><div class="rule-gold rule-gold--thin" role="presentation"></div>' +
        '<div class="accent__in"><span class="t-label">Calibrated against</span><p>' + c.bench + "</p></div></div>" +
      '<section class="panel sheen">' +
        '<div class="panel__h"><h3>Drag the timeline</h3><span>' + c.chart.cap + "</span></div>" +
        '<div class="scrub">' +
          '<div class="scrub__read"><span class="scrub__month" id="scrubMonth"></span>' +
          '<span class="scrub__val" id="scrubVal"></span><span class="scrub__delta" id="scrubDelta"></span></div>' +
          '<input type="range" id="scrubRange" min="0" max="' + last + '" value="' + last +
            '" step="1" aria-label="Month of the engagement">' +
        "</div><div class=\"chart\" id=\"scrubChart\"></div>" +
      "</section>" +
      '<div class="split">' +
        '<div class="stack-md">' +
          '<div class="prose"><h2 class="t-h3">The situation</h2><p>' + c.problem + "</p></div>" +
          '<h2 class="t-h3">What we run</h2>' +
          '<div class="steps">' + c.plays.map(function (p, i) {
            return '<div class="step"><span class="step__n">' + String(i + 1).padStart(2, "0") +
              "</span><div><h4>" + p.h + "</h4><p>" + p.p + "</p></div></div>";
          }).join("") + "</div>" +
          '<h2 class="t-h3">What moves, and when</h2>' +
          '<p class="t-sm mut w-62">Sequence matters more than effort here. The cheapest fixes are early and structural; the ones that compound are deliberately last.</p>' +
          '<ol class="tl">' + c.phases.map(function (f) {
            return '<li class="tl__i"><span class="tl__m">' + f.m + '</span><div class="tl__b"><h4>' +
              f.h + "</h4><p>" + f.p + "</p></div></li>";
          }).join("") + "</ol>" +
        "</div>" +
        '<div class="stack-md">' +
          '<section class="panel"><div class="panel__h"><h3>Modelled results</h3><span>Before &rarr; after</span></div>' +
            '<div class="rows">' + c.results.map(function (r) {
              return '<div class="row"><p>' + r.l + '</p><span class="delta">' +
                (r.f === "—" ? "" : '<span class="delta__from">' + r.f + '</span><span class="delta__arrow">&rarr;</span>') +
                '<span class="delta__to">' + r.t + "</span></span></div>";
            }).join("") + "</div></section>" +
          '<div class="accent sheen"><div class="rule-gold" role="presentation"></div>' +
            '<div class="accent__in"><span class="t-label">AI in the loop</span><p>' + c.ai + "</p></div></div>" +
          '<div class="accent"><div class="rule-gold rule-gold--thin" role="presentation"></div>' +
            '<div class="accent__in"><span class="t-label">What actually moves it</span><p>' + c.lever + "</p></div></div>" +
          '<section class="panel"><div class="panel__h"><h3>The baseline, measured</h3><span>Before anything ships</span></div>' +
            '<dl class="diag">' + c.diag.map(function (d) {
              return '<div class="diag__i"><dt>' + d.l + '</dt><dd><b>' + d.v + "</b><span>" + d.n + "</span></dd></div>";
            }).join("") + "</dl>" +
            '<p class="note">Nothing is written until every line above has a number against it. The ranked fix list is ordered by the revenue attached to each gap, not by how hard it is to close.</p></section>' +
          '<section class="panel"><div class="panel__h"><h3>Stack</h3></div><div class="chips">' +
            c.stack.map(function (s) { return '<span class="chip">' + s + "</span>"; }).join("") + "</div></section>" +
          '<section class="panel"><div class="panel__h"><h3>Evidence behind the model</h3><span>Published, linked</span></div>' +
            '<ul class="srcs">' + c.sources.map(function (x) {
              return '<li><a href="' + x.u + '" target="_blank" rel="noopener nofollow">' + x.t +
                ' <span aria-hidden="true">&#8599;</span></a><p>' + x.d + "</p></li>";
            }).join("") + "</ul></section>" +
        "</div>" +
      "</div>" +
      '<hr class="rule">' +
      '<div class="stack-md"><span class="t-label mut">Next scenario</span><div class="grid-3">' +
        others.map(caseCard).join("") + "</div></div>" +
      "</div>";
    paintScrub(last);
    $("scrubRange").addEventListener("input", function (e) { paintScrub(+e.target.value); });
  }

  /* ══ Scorecard ═══════════════════════════════════════════════════════ */
  var QUIZ = [
    { q: "Ask an assistant the question your best customer would ask. Does your brand appear?", max: 18, note: "Citation presence",
      o: [["Never", 0], ["Occasionally", 6], ["Usually", 13], ["Almost always", 18]],
      fix: "Build a prompt set of 150+ real buyer questions and baseline your citation rate across all four engines. You cannot improve a number you have never measured." },
    { q: "Does one page on your site answer that question directly, inside its first 100 words?", max: 18, note: "Extractability",
      o: [["No page does", 0], ["Buried lower down", 7], ["Mostly, on key pages", 13], ["Yes, by design", 18]],
      fix: "Rewrite your top 20 pages answer-first: the direct answer in the opening 80 words, then the reasoning. Retrievers lift self-contained chunks, not narrative build-ups." },
    { q: "Do your key pages ship valid schema.org markup — Organization, Product or Service, FAQ?", max: 16, note: "Machine-readable proof",
      o: [["None or broken", 0], ["Partial", 6], ["Most pages, valid", 12], ["Complete and validated", 16]],
      fix: "Ship and validate Organization plus Product or Service schema with real specifics — pricing, concentrations, timelines. Assistants quote specifics and skip vagueness." },
    { q: "Are you named in the listicles, comparison pages and review sites that models retrieve from?", max: 16, note: "Corroboration",
      o: [["Not at all", 0], ["A couple of mentions", 6], ["A decent footprint", 12], ["Named consistently", 16]],
      fix: "Target 15–25 comparison roundups and review platforms. Around 90% of ChatGPT citations go to pages ranking 21 or lower, so that is where the retrieval pool actually is." },
    { q: "Do you have an email sequence that converts the traffic AI already sends you?", max: 16, note: "Conversion",
      o: [["No sequences at all", 0], ["A welcome email", 6], ["A few flows", 12], ["Full lifecycle program", 16]],
      fix: "AI-referred traffic converts at roughly 4.4× organic but arrives in small volume, so it leaks without a sequence. Build welcome, abandonment and replenishment flows first." },
    { q: "Are you tracking citation share and the revenue behind it, month over month?", max: 16, note: "Measurement",
      o: [["Not tracking", 0], ["Occasional spot checks", 6], ["Monthly, informally", 12], ["Monthly, joined to revenue", 16]],
      fix: "Instrument prompt-level tracking and join it to your CRM. Without it you optimise for mentions instead of revenue, which are not the same thing." }
  ];
  var BANDS = [
    { min: 0, name: "Invisible", range: "Band 0 – 29", copy: "Assistants have nothing reliable to retrieve about you. This is fixable in a quarter, and the first fixes are structural rather than editorial — entity consistency and extractable pages before any new content." },
    { min: 30, name: "Retrievable", range: "Band 30 – 54", copy: "You get pulled in occasionally, inconsistently, and usually not for the prompts with money behind them. The gap is almost always corroboration and a sequence to convert what does arrive." },
    { min: 55, name: "Competitive", range: "Band 55 – 79", copy: "You show up for real buyer prompts and can be pushed to a default recommendation. From here the work is prompt-level: find the high-value questions where a competitor still wins." },
    { min: 80, name: "Default answer", range: "Band 80 – 100", copy: "You are the recommendation. The job shifts to defence — monitoring for erosion, keeping claims current, and expanding into adjacent prompt sets before someone else does." }
  ];
  var picks = [1, 1, 1, 0, 1, 0];
  function renderQuiz() {
    $("quiz").innerHTML = QUIZ.map(function (q, i) {
      return '<div class="q"><span class="q__n">' + String(i + 1).padStart(2, "0") + " &middot; " + q.note +
        "</span><h3>" + q.q + '</h3><div class="opts">' +
        q.o.map(function (o, j) {
          return '<button class="opt" data-q="' + i + '" data-o="' + j + '" aria-pressed="' + (picks[i] === j) + '">' + o[0] + "</button>";
        }).join("") + "</div></div>";
    }).join("");
  }
  function scoreQuiz() {
    var total = 0;
    QUIZ.forEach(function (q, i) { if (picks[i] != null) total += q.o[picks[i]][1]; });
    var band = BANDS.slice().reverse().filter(function (b) { return total >= b.min; })[0];
    $("score").textContent = total;
    $("scoreBar").style.width = total + "%";
    $("bandName").textContent = band.name;
    $("bandRange").textContent = band.range;
    $("bandCopy").textContent = band.copy;
    var gaps = QUIZ.map(function (q, i) {
      return { gap: q.max - (picks[i] != null ? q.o[picks[i]][1] : 0), fix: q.fix, note: q.note };
    }).filter(function (g) { return g.gap > 0; }).sort(function (a, b) { return b.gap - a.gap; }).slice(0, 3);
    $("fixes").innerHTML = gaps.length
      ? gaps.map(function (g) { return '<div class="fix"><i>+' + g.gap + "</i><p><b>" + g.note + "</b>" + g.fix + "</p></div>"; }).join("")
      : '<div class="fix"><i>&#10003;</i><p><b>Clear</b>Nothing structural left on this checklist. The next gains are prompt-by-prompt, against specific competitors.</p></div>';
    var body = "My AI Visibility Score: " + total + "/100 (" + band.name + ")\n\n" +
      QUIZ.map(function (q, i) { return (i + 1) + ". " + q.note + ": " + (picks[i] != null ? q.o[picks[i]][0] : "—"); }).join("\n") +
      "\n\nTop gaps:\n" + gaps.map(function (g) { return "- " + g.note + " (+" + g.gap + ")"; }).join("\n") +
      "\n\nCan you turn this into a written roadmap?";
    var sm = $("scoreMail");
    window.__score = total; window.__band = band.name;
    sm.setAttribute("data-chat-topic", "AI Visibility Score: " + total + "/100 (" + band.name + ")");
    sm.setAttribute("data-chat-note", body);
  }

  /* ══ Revenue model ═══════════════════════════════════════════════════ */
  var PROG = {
    geo:   { traffic: 1.55, cvr: 1.22, note: "Assumes assistant and organic sessions +55% and conversion rate +22% by month 12 — AI-referred visitors arrive further down the funnel." },
    seo:   { traffic: 1.85, cvr: 1.05, note: "Assumes organic sessions +85% and conversion rate +5% by month 12, weighted to non-branded terms." },
    email: { traffic: 1.00, cvr: 1.75, note: "Assumes flat traffic with conversion rate +75% by month 12 — the gain comes from converting visitors you already have." },
    all:   { traffic: 1.70, cvr: 1.55, note: "Assumes sessions +70% and conversion rate +55% by month 12. Compounding is why integrated programs beat the sum of their parts." }
  };
  var FEES = { geo: 9800, seo: 6000, email: 6400, all: 14200 };
  function fmt(n) {
    return n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? "$" + Math.round(n / 1e3) + "K" : "$" + Math.round(n);
  }
  var ramp = function (m) { return Math.pow(m / 12, 1.7); };
  function roi() {
    var g = function (id) { return Math.max(0, +$(id).value || 0); };
    var sess = g("iSess"), cvr = g("iCvr") / 100, aov = g("iAov"), fee = g("iFee");
    var p = PROG[$("iProg").value];
    var base = sess * cvr * aov, months = [], inc = 0, cum = 0, bk = null;
    for (var m = 1; m <= 12; m++) {
      var r = ramp(m), v = sess * (1 + (p.traffic - 1) * r) * cvr * (1 + (p.cvr - 1) * r) * aov;
      months.push(v); inc += v - base; cum += v - base;
      if (bk === null && cum >= fee * m) bk = m;
    }
    var fees = fee * 12;
    $("oNow").textContent = fmt(base);
    $("oM12").textContent = fmt(months[11]);
    $("oInc").textContent = fmt(inc);
    $("oRoi").textContent = fees > 0 ? (inc / fees).toFixed(1) + "×" : "—";
    $("oBk").textContent = bk ? "M" + bk : "—";
    $("assump").textContent = p.note + " The ramp is quadratic, not linear — nothing compounding lands in month one. Modelled projection, not a guarantee.";
    drawRamp(base, months, fee);
  }
  function drawRamp(base, months, fee) {
    var W = 720, H = 300, PL = 46, PR = 8, PT = 26, PB = 44;
    var iw = W - PL - PR, ih = H - PT - PB;
    var max = niceMax(Math.max.apply(null, [base].concat(months)) * 1.08);
    var x = function (i) { return PL + (iw / 11) * i; };
    var y = function (v) { return PT + ih - (v / max) * ih; };
    var s = '<title id="chartTitle">Modelled monthly revenue over twelve months, baseline versus program</title>';
    for (var gi = 0; gi <= 4; gi++) {
      var v = max / 4 * gi, yy = y(v);
      s += '<line x1="' + PL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - PR) + '" y2="' + yy.toFixed(1) +
        '" stroke="' + C.grid + '" stroke-width="1"/><text x="' + (PL - 10) + '" y="' + (yy + 4).toFixed(1) +
        '" text-anchor="end" fill="' + C.muted + '" font-family="' + FONT + '" font-size="10">' + fmt(v) + "</text>";
    }
    for (var i = 0; i < 12; i += 2) {
      s += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 18) + '" text-anchor="middle" fill="' + C.muted +
        '" font-family="' + FONT + '" font-size="10" font-weight="500" letter-spacing="1.2">M' + (i + 1) + "</text>";
    }
    var area = "M" + x(0).toFixed(1) + " " + y(months[0]).toFixed(1);
    months.forEach(function (v, i) { if (i) area += " L" + x(i).toFixed(1) + " " + y(v).toFixed(1); });
    area += " L" + x(11).toFixed(1) + " " + y(base).toFixed(1) + " L" + x(0).toFixed(1) + " " + y(base).toFixed(1) + " Z";
    s += '<path d="' + area + '" fill="' + C.gold + '" fill-opacity="0.10"/>' +
      '<line x1="' + x(0) + '" y1="' + y(base).toFixed(1) + '" x2="' + x(11).toFixed(1) + '" y2="' + y(base).toFixed(1) +
      '" stroke="' + C.line + '" stroke-width="1.6" stroke-dasharray="6 4"/>' +
      '<path d="' + months.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" ") +
      '" fill="none" stroke="' + C.goldLight + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';
    var cum = 0, bkI = null;
    months.forEach(function (v, i) { cum += v - base; if (bkI === null && cum >= fee * (i + 1)) bkI = i; });
    if (bkI !== null) {
      s += '<line x1="' + x(bkI).toFixed(1) + '" y1="' + PT + '" x2="' + x(bkI).toFixed(1) + '" y2="' + (PT + ih) +
        '" stroke="' + C.alert + '" stroke-width="1.2"/><rect x="' + (x(bkI) - 3.5).toFixed(1) + '" y="' +
        (y(months[bkI]) - 3.5).toFixed(1) + '" width="7" height="7" fill="' + C.alert + '"/><text x="' +
        (x(bkI) + 9).toFixed(1) + '" y="' + (PT + 12) + '" fill="' + C.alert + '" font-family="' + FONT +
        '" font-size="10" font-weight="500" letter-spacing="1.2">BREAKEVEN M' + (bkI + 1) + "</text>";
    }
    s += '<rect x="' + (x(11) - 4).toFixed(1) + '" y="' + (y(months[11]) - 4).toFixed(1) + '" width="8" height="8" fill="' +
      C.goldLight + '"/><text x="' + (x(11) - 10).toFixed(1) + '" y="' + (y(months[11]) - 14).toFixed(1) +
      '" text-anchor="end" fill="' + C.goldLight + '" font-family="' + FONT + '" font-size="12" font-weight="500">' +
      fmt(months[11]) + '</text><text x="' + (x(0) + 8) + '" y="' + (y(base) - 10).toFixed(1) + '" fill="' + C.muted +
      '" font-family="' + FONT + '" font-size="10" font-weight="500" letter-spacing="1.2">BASELINE ' + fmt(base) + "</text>";
    $("roiChart").innerHTML = s;
  }

  /* ══ Contact — one submit path, used by the form and the chat ════════ */
  function briefText() {
    var g = function (id) { return $(id).value.trim(); };
    return ["Name: " + g("fName"), "Email: " + g("fEmail"), "Company: " + (g("fCompany") || "—"),
      "Website: " + (g("fSite") || "—"), "Monthly revenue: " + g("fRevenue"), "Budget: " + g("fBudget"),
      "Timeline: " + g("fTimeline"), "Focus: " + g("fFocus"), "", "The gap:", g("fBrief")].join("\n");
  }
  function validate() {
    var need = { fName: "Tell me who you are", fEmail: "I need an email to reply to", fBrief: "One or two lines is plenty" };
    var ok = true;
    [].forEach.call(document.querySelectorAll("[data-err]"), function (e) { e.textContent = ""; });
    Object.keys(need).forEach(function (id) {
      var el = $(id), out = document.querySelector('[data-err="' + id + '"]');
      if (!el.value.trim()) { out.textContent = need[id]; ok = false; }
      else if (id === "fEmail" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim())) {
        out.textContent = "That address looks wrong"; ok = false;
      }
    });
    return ok;
  }

  /* ══ Counters & progress bars ════════════════════════════════════════ */
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
  function runCount(el) {
    if (el.dataset.done) return;
    el.dataset.done = "1";
    if (RM) return;
    var target = +el.dataset.count, dec = +(el.dataset.dec || 0),
        pre = el.dataset.pre || "", suf = el.dataset.suf || "", comma = el.dataset.comma;
    var t0 = performance.now(), dur = 1000;
    (function step(now) {
      var p = Math.min(1, (now - t0) / dur), v = target * ease(p);
      var out = dec ? v.toFixed(dec) : String(Math.round(v));
      if (comma) out = (+out).toLocaleString("en-US");
      el.innerHTML = pre + out + suf;
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }
  function runProg(el) { if (el.dataset.done) return; el.dataset.done = "1"; el.style.width = el.dataset.prog + "%"; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      if (e.target.dataset.count !== undefined) runCount(e.target);
      if (e.target.dataset.prog !== undefined) runProg(e.target);
      io.unobserve(e.target);
    });
  }, { threshold: 0.4 });
  function observeAll() {
    [].forEach.call(document.querySelectorAll("[data-count]:not([data-done]),[data-prog]:not([data-done])"),
      function (el) { io.observe(el); });
  }

  /* ══ Page context ════════════════════════════════════════════════════
     What the page can honestly report about this visit at the moment the
     visitor presses send. No cookies, no identifiers, no third party — just
     the state of their own browser, so a brief arrives with the answer to
     "where were they and what had they read?" already attached.          */
  var VIEW_NAMES = {
    overview: "Overview", work: "Case studies", building: "Builds",
    services: "Engagements & pricing", scorecard: "AI Visibility Scorecard",
    roi: "Revenue model", contact: "Contact"
  };
  var journey = [], arrivedAt = Date.now();
  function currentView() {
    var h = (location.hash || "#overview").replace(/^#/, "");
    if (h.indexOf("case/") === 0) {
      var c = CASES.filter(function (x) { return x.id === h.slice(5); })[0];
      return "Case study — " + (c ? c.title : h.slice(5));
    }
    return VIEW_NAMES[h] || (document.getElementById(h) ? "Section: " + h : "Overview");
  }
  function noteView() {
    var v = currentView();
    if (journey[journey.length - 1] !== v) { journey.push(v); }
    if (journey.length > 12) { journey.shift(); }
  }
  function pageCtx() {
    var utm = [];
    try {
      new URLSearchParams(location.search).forEach(function (v, k) {
        if (/^utm_|^gclid$|^fbclid$/.test(k)) { utm.push(k + "=" + v); }
      });
    } catch (e) {}
    return {
      page: currentView(),
      journey: journey.join(" \u2192 "),
      dwell: String(Math.round((Date.now() - arrivedAt) / 1000)),
      score: window.__score ? window.__score + "/100 (" + window.__band + ")" : "",
      ref: document.referrer || "",
      utm: utm.join(" "),
      screen: innerWidth + "\u00d7" + innerHeight + (devicePixelRatio > 1 ? " @" + devicePixelRatio + "x" : ""),
      lang: navigator.language || "",
      tz: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ""; } })()
    };
  }
  function addCtx(fd) {
    var c = pageCtx();
    Object.keys(c).forEach(function (k) { fd.set(k, c[k]); });
    fd.set("ua", navigator.userAgent.slice(0, 200));
    fd.set("t", String(formLoadedAt));
    return fd;
  }

  /* ══ Chat brief ══════════════════════════════════════════════════════
     Lives in assets/js/chat.js now, loaded by every page including the four
     reference pages, which previously had no chat because they load none of
     this file. Two things are published for it: the current view and the path
     taken through the site, which are the only context it cannot work out for
     itself and the two that make a brief worth reading.                     */
  window.SyedPage = {
    view:    function () { return currentView(); },
    journey: function () { return journey.join(" \u2192 "); }
  };
  function chatOpen(t)  { if (window.SyedChat) { window.SyedChat.open(t); } }
  function chatTease()  { if (window.SyedChat) { window.SyedChat.tease(); } }


  /* ══ Router ══════════════════════════════════════════════════════════ */
  var VIEWS = ["overview", "work", "building", "services", "scorecard", "roi", "contact"];
  function go(hash) {
    var h = (hash || location.hash || "#overview").replace(/^#/, "");
    var isCase = h.indexOf("case/") === 0;
    var name = isCase ? "case" : (VIEWS.indexOf(h) >= 0 ? h : "overview");
    [].forEach.call(document.querySelectorAll(".view"), function (v) {
      v.classList.toggle("is-on", v.id === "view-" + name);
    });
    if (isCase) renderCase(h.slice(5));
    var active = isCase ? "work" : name;
    [].forEach.call(document.querySelectorAll("#navLinks [data-go]"), function (b) {
      b.setAttribute("aria-current", String(b.dataset.go === active));
    });
    /* Deep links to sections inside a view (e.g. #glossary, #geo-vs-seo)
       route to their parent view and scroll there instead of to the top. */
    var anchor = (!isCase && VIEWS.indexOf(h) < 0) ? document.getElementById(h) : null;
    if (anchor) {
      observeAll();
      noteView();
      requestAnimationFrame(function () {
        var y = anchor.getBoundingClientRect().top + window.pageYOffset - 88;
        window.scrollTo({ top: Math.max(0, y), behavior: RM ? "instant" : "smooth" });
      });
      return;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    observeAll();
    noteView();
  }

  /* ══ Command palette ═════════════════════════════════════════════════ */
  var PAL = [
    { t: "Overview", k: "home start", go: "#overview", s: "Page" },
    { t: "Case studies", k: "work scenarios results revenue", go: "#work", s: "Page" },
    { t: "Building", k: "products tools citegeist answerable cadence", go: "#building", s: "Page" },
    { t: "Engagements", k: "pricing services retainer audit cost", go: "#services", s: "Page" },
    { t: "AI Visibility Scorecard", k: "score quiz free tool test", go: "#scorecard", s: "Tool" },
    { t: "Revenue model", k: "roi calculator forecast", go: "#roi", s: "Tool" },
    { t: "Contact", k: "email hire brief book", go: "#contact", s: "Page" },
    { t: "GEO vs SEO comparison", k: "difference compare table seo geo aeo", go: "#geo-vs-seo", s: "Section" },
    { t: "Glossary", k: "definitions terms citation share entity prompt set llms.txt", go: "#glossary", s: "Section" },
    { t: "The method — five moves", k: "how process steps method", go: "#method", s: "Section" },
    { t: "FAQ", k: "questions answers cost how long guarantee", go: "#faq", s: "Section" },
    { t: "Start the chat", k: "message brief contact hire talk email", go: "chat", s: "Contact" },
    { t: "Instagram @syeddigital", k: "social ig", go: "https://instagram.com/syeddigital", s: "External" },
    { t: "syed.ai", k: "website site", go: "https://syed.ai", s: "External" }
  ].concat(CASES.map(function (c) { return { t: c.title, k: c.track + " " + c.client, go: "#case/" + c.id, s: "Scenario" }; }));
  var palSel = 0, palHits = PAL;
  function palRender() {
    $("palList").innerHTML = palHits.length
      ? palHits.map(function (h, i) {
          return '<button class="pal__item" data-i="' + i + '" data-sel="' + (i === palSel ? 1 : 0) +
            '"><b>' + esc(h.t) + "</b><span>" + h.s + "</span></button>";
        }).join("")
      : '<p class="pal__empty">Nothing matches that.</p>';
  }
  function palFilter() {
    var q = $("palInput").value.trim().toLowerCase();
    palHits = q ? PAL.filter(function (h) { return (h.t + " " + h.k).toLowerCase().indexOf(q) >= 0; }) : PAL;
    palSel = 0; palRender();
  }
  function palOpen() { $("pal").classList.add("is-on"); $("palInput").value = ""; palFilter(); $("palInput").focus(); }
  function palClose() { $("pal").classList.remove("is-on"); }
  function palGo(h) {
    palClose();
    if (!h) return;
    if (h.go === "chat") { chatOpen(); return; }
    if (h.go.charAt(0) === "#") location.hash = h.go;
    else window.open(h.go, "_blank");
  }

  /* ══ Boot ════════════════════════════════════════════════════════════ */
  $("featured").innerHTML = [0, 2, 5].map(function (i) { return caseCard(CASES[i]); }).join("");
  $("allCases").innerHTML = CASES.map(caseCard).join("");
  buildChips(); buildVents(); renderSim(false); renderQuiz(); scoreQuiz(); roi(); palRender();
  /* The search chip on the reference pages is a link to /#find, because those
     pages carry no palette of their own — it indexes homepage sections. Handle
     it before routing so it never falls through to the overview view. */
  function findHash() {
    if (location.hash !== "#find") { return false; }
    history.replaceState(null, "", location.pathname);
    palOpen();
    return true;
  }
  if (!findHash()) { go(location.hash); }
  addEventListener("hashchange", function () {
    if (!findHash()) { go(location.hash); }
  });
  if (!RM) {
    rotator = setInterval(function () {
      if (touched) return;
      pIdx = (pIdx + 1) % promptList().length;
      renderSim(true);
    }, 9000);
  }
  if (!/Mac|iPhone|iPad/.test(navigator.platform || "")) $("keyHint").textContent = "Ctrl K";

  document.addEventListener("click", function (e) {
    var pi = e.target.closest(".pal__item");
    if (pi) { palGo(palHits[+pi.dataset.i]); return; }
    if (e.target === $("pal")) { palClose(); return; }
    if (e.target.closest("#palBtn")) { palOpen(); return; }

    var nav = e.target.closest("[data-go]");
    if (nav) { e.preventDefault(); location.hash = "#" + nav.dataset.go; return; }
    var cs = e.target.closest("[data-case]");
    if (cs) { location.hash = "#case/" + cs.dataset.case; return; }

    var chip = e.target.closest(".pchip");
    if (chip) { stopRotate(); pIdx = +chip.dataset.p; renderSim(true); return; }
    var md = e.target.closest("#modeSeg button");
    if (md) { stopRotate(); mode = md.dataset.mode; renderSim(true); return; }
    var tab = e.target.closest(".tab");
    if (tab) { stopRotate(); engIdx = +tab.dataset.eng; renderSim(true); return; }
    if (e.target.closest("#mineGo")) { makeMine(); return; }

    var vh = e.target.closest(".vent__head");
    if (vh) {
      var v = vh.closest(".vent"), open = v.dataset.open === "true";
      v.dataset.open = String(!open);
      vh.setAttribute("aria-expanded", String(!open));
      if (!open) [].forEach.call(v.querySelectorAll("[data-prog]"), runProg);
      return;
    }
    var opt = e.target.closest(".opt");
    if (opt) {
      picks[+opt.dataset.q] = +opt.dataset.o;
      [].forEach.call(document.querySelectorAll('.opt[data-q="' + opt.dataset.q + '"]'), function (b) {
        b.setAttribute("aria-pressed", String(b === opt));
      });
      scoreQuiz();
      return;
    }
  });

  addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      $("pal").classList.contains("is-on") ? palClose() : palOpen();
      return;
    }
    if (!$("pal").classList.contains("is-on")) return;
    if (e.key === "Escape") palClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); palSel = Math.min(palSel + 1, palHits.length - 1); palRender(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); palSel = Math.max(palSel - 1, 0); palRender(); }
    else if (e.key === "Enter") { e.preventDefault(); palGo(palHits[palSel]); }
  });
  $("palInput").addEventListener("input", palFilter);

  $("resetScore").addEventListener("click", function () {
    picks = [null, null, null, null, null, null];
    renderQuiz(); scoreQuiz();
  });
  ["iSess", "iCvr", "iAov", "iFee"].forEach(function (id) { $(id).addEventListener("input", roi); });
  $("iProg").addEventListener("change", function (e) { $("iFee").value = FEES[e.target.value]; roi(); });

  /* Renders "Did you mean …?" under an email field, with both answers as real
     buttons: take the correction, or insist on what was typed. Insisting sets
     email_ok=1, which relaxes only the typo check server-side. */
  function offerFix(form, suggestion) {
    var host = form.querySelector("[data-err]");
    if (!host) { return; }
    var old = form.querySelector(".fixrow");
    if (old) { old.remove(); }

    var row = document.createElement("div");
    row.className = "fixrow";
    var use = document.createElement("button");
    use.type = "button"; use.className = "chat__opt"; use.textContent = "Use " + suggestion;
    use.addEventListener("click", function () {
      var f = form.querySelector('input[type="email"], input[name="email"]');
      if (f) { f.value = suggestion; }
      row.remove();
      form.querySelector('[data-fixflag]') && form.querySelector('[data-fixflag]').remove();
      if (form.requestSubmit) { form.requestSubmit(); } else { form.submit(); }
    });
    var keep = document.createElement("button");
    keep.type = "button"; keep.className = "chat__opt chat__opt--skip"; keep.textContent = "No, mine is right";
    keep.addEventListener("click", function () {
      var flag = document.createElement("input");
      flag.type = "hidden"; flag.name = "email_ok"; flag.value = "1";
      flag.setAttribute("data-fixflag", "1");
      form.appendChild(flag);
      row.remove();
      if (form.requestSubmit) { form.requestSubmit(); } else { form.submit(); }
    });
    row.appendChild(use); row.appendChild(keep);
    host.parentNode.insertBefore(row, host.nextSibling);
  }

  function sendToServer(form, btn) {
    var data = addCtx(new FormData(form));
    data.set("source", "form");
    data.set("mode", $("wantPlan") && $("wantPlan").checked ? "roadmap" : "brief");
    btn.disabled = true;
    $("formStatus").textContent = "Sending…";
    fetch(FORM_ENDPOINT, {
      method: "POST", body: data, credentials: "omit",
      headers: { "Accept": "application/json" }
    }).then(function (r) {
      // If the body is not JSON the server has failed in a way it could not
      // report — keep the first line of whatever it did send, because that is
      // the only clue the visitor (or you, in a screenshot) will ever get.
      return r.text().then(function (raw) {
        var j;
        try { j = JSON.parse(raw); }
        catch (err) {
          j = { ok: false, message: "The server replied with something unreadable (HTTP " + r.status + ").",
                detail: raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220) };
        }
        return { status: r.status, body: j };
      });
    }).then(function (res) {
      if (res.body.ok) {
        form.reset();
        $("formStatus").textContent = res.body.message || "Thanks — that came through.";
        formLoadedAt = Math.floor(Date.now() / 1000);
        /* A retry that works has to clear the wreckage of the one that did not:
           the "reach me another way" panel and the per-field errors both stayed
           on screen underneath a success message. */
        $("fallback").classList.remove("is-on");
        Array.prototype.forEach.call(document.querySelectorAll("[data-err]"),
          function (n) { n.textContent = ""; });
        if (window.turnstile) { try { window.turnstile.reset(); } catch (err) {} }
      } else {
        var msg = res.body.message || ("That did not send (HTTP " + res.status + ").");
        if (res.body.detail) { msg += "  →  " + res.body.detail; }
        $("formStatus").textContent = msg;

        /* A suspected typo is not a rejection, it is a question. Offering the
           correction as a button recovers a subscriber who would otherwise
           read "check the highlighted fields", shrug, and leave. */
        if (res.body.verdict === "typo" && res.body.suggestion) {
            offerFix(form, res.body.suggestion);
            return;
        }
        var MAP = { name: "fName", email: "fEmail", brief: "fBrief" };
        (res.body.fields || []).forEach(function (k) {
          var out = document.querySelector('[data-err="' + (MAP[k] || k) + '"]');
          if (out) { out.textContent = "Please check this"; }
        });
        $("fallback").classList.add("is-on");
      }
    }).catch(function () {
      // Offline, blocked, or the endpoint is not deployed yet.
      $("formStatus").textContent = "Could not reach the server.";
      $("fallback").classList.add("is-on");
    }).then(function () { if (btn) { btn.disabled = false; } });
  }
  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!validate()) { $("formStatus").textContent = ""; return; }
    sendToServer(e.target, $("formSend"));
  });
  /* Turnstile is loaded only when a site key is set, so the default build
     makes zero third-party requests. */
  if (TURNSTILE_KEY) {
    var host = document.getElementById("turnstile");
    if (host) {
      host.setAttribute("data-sitekey", TURNSTILE_KEY);
      var ts = document.createElement("script");
      ts.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      ts.async = true; ts.defer = true;
      document.head.appendChild(ts);
    }
  }
  function wireCopy(id) {
    var el = $(id);
    if (!el) { return; }
    el.addEventListener("click", function (e) {
      navigator.clipboard.writeText(briefText()).then(function () {
        e.target.textContent = "Copied";
        $("formStatus").textContent = "Copied to your clipboard.";
        setTimeout(function () { e.target.textContent = "Copy the brief"; }, 1800);
      }).catch(function () {
        $("formStatus").textContent = "Could not copy — select the text and copy it manually.";
      });
    });
  }
  wireCopy("copyBrief2");
  $("copyBrief").addEventListener("click", function (e) {
    navigator.clipboard.writeText(briefText()).then(function () {
      e.target.textContent = "Copied";
      $("formStatus").textContent = "Copied to your clipboard.";
      setTimeout(function () { e.target.textContent = "Copy the brief"; }, 1800);
    }).catch(function () {
      $("formStatus").textContent = "Could not copy — select the text and copy it manually.";
    });
  });

  /* sheen + magnetic buttons — pointer devices only */
  if (matchMedia("(hover:hover)").matches && !RM) {
    document.addEventListener("pointermove", function (e) {
      var c = e.target.closest(".sheen");
      if (c) {
        var r = c.getBoundingClientRect();
        c.style.setProperty("--mx", (e.clientX - r.left) + "px");
        c.style.setProperty("--my", (e.clientY - r.top) + "px");
      }
      var m = e.target.closest(".btn");
      if (m) {
        var b = m.getBoundingClientRect();
        m.style.transform = "translate(" + ((e.clientX - b.left - b.width / 2) * 0.10).toFixed(1) + "px," +
          ((e.clientY - b.top - b.height / 2) * 0.16).toFixed(1) + "px)";
      }
    }, { passive: true });
    document.addEventListener("pointerout", function (e) {
      var m = e.target.closest(".btn");
      if (m) m.style.transform = "";
    }, { passive: true });
  }

  /* scroll rail, hero parallax, mobile bar */
  /* ══ Newsletter ══════════════════════════════════════════════════════ */
  (function () {
    var f = $("newsForm");
    if (!f) { return; }
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var out = $("newsStatus"), err = document.querySelector('[data-err="nEmail"]');
      err.textContent = "";
      var addr = $("nEmail").value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) {
        err.textContent = "That address looks wrong"; return;
      }
      var fd = addCtx(new FormData(f));
      fd.set("mode", "newsletter");
      fd.set("source", "newsletter");
      /* No fake name. "Newsletter subscriber" as a name looks harmless here and
         then lands in the subscriber record, and later in the CRM, as though
         it were something the person typed. An empty name is honest and the
         newsletter path does not require one. */
      fd.set("name", "");
      fd.set("brief", "Subscribed to The Answer Layer" +
        ($("nSite").value.trim() ? " and submitted " + $("nSite").value.trim() + " for the teardown queue." : "."));
      var btn = $("newsSend");
      btn.disabled = true; out.textContent = "Signing you up…";
      if (FORM_ENDPOINT === "demo") {
        setTimeout(function () { out.textContent = "You are on the list. (Preview \u2014 nothing sent.)"; btn.disabled = false; }, 600);
        return;
      }
      fetch(FORM_ENDPOINT, { method: "POST", body: fd, credentials: "omit",
                             headers: { "Accept": "application/json" } })
        .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
        .then(function (j) {
          out.textContent = j.message
            || (j.ok ? "Almost there — click the link in the email I just sent." : "That did not go through.");
          if (j.ok) { f.reset(); return; }
          if (j.fields && j.fields.indexOf("email") !== -1) {
            err.textContent = j.verdict === "typo" ? "" : "Check this address";
          }
          // A suspected typo is a question, not a rejection.
          if (j.verdict === "typo" && j.suggestion) { offerFix(f, j.suggestion); }
        })
        .catch(function () { out.textContent = "Could not reach the server — try again shortly."; })
        .then(function () { btn.disabled = false; });
    });
  })();

  var heroImg = $("heroImg"), mbar = $("mbar"), rail = $("scrollRail"), tick = false;
  function onScroll() {
    if (tick) return;
    tick = true;
    requestAnimationFrame(function () {
      var y = window.scrollY, h = document.documentElement.scrollHeight - innerHeight;
      rail.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + "%";
      mbar.classList.toggle("is-on", y > 460);
      // Offer the chat only once the visitor has actually read something.
      if (h > 0 && y / h > 0.45) { chatTease(); }
      /* Parallax is desktop-only now. On a phone it fights the address bar:
         the transform is recomputed on every scroll event while the viewport
         itself is still resizing, which is the second half of the juddering.
         A 14% drift is not worth that on a small screen. */
      if (!RM && !NARROW && y < 900 && heroImg) {
        heroImg.style.transform = "translate3d(0," + (y * 0.14).toFixed(1) + "px,0)";
      }
      tick = false;
    });
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
