# Search Evidence Suite — Milestone 0 Discovery Inventory

Source: `legacy-reference/search-evidence-suite/search-evidence-console/`
Read-only analysis. All line references are to `app.js` unless a file is named.
Sizes: `index.html` 705 lines / 117 KB; `app.js` 12,099 lines / 742 KB; `app.css` 594 lines; `proxy.php` 542 lines.

`index-single-file.html` was verified to be a byte-level bundle of the three split files: lines 40–632 equal `app.css` (one blank line differs), lines 1292–13390 equal `app.js` exactly (`diff` reports zero lines), and the body markup equals `index.html` lines 40–702 apart from the `<script src>`/`<link>` swap. It is not analysed further.

---

## 1. Overview and documentation

### 1.1 What the tool is (README.txt)

A single-page, browser-only SEO / AI-search audit console. "Self-hosted build. One HTML file. Everything runs in the browser." (README 5). It ingests Search Console and Semrush exports (or pulls GSC data via OAuth), optionally crawls the site through `proxy.php`, runs a deterministic analysis engine, and produces a weighted health score, a ranked action queue, topic clusters, technical findings, AI-search readiness, content briefs, a live draft editor, a prompt pack, an HTML/PDF report, an XLSX workbook, snapshots and project backups. All state lives in IndexedDB.

Two UI tiers (README 8–22): **Simple** (eleven stages — the README says ten) and **Pro** (all stages). "Nothing is measured differently."

Twenty-two/twenty-three stages in three groups (README 205–237): Set up (Project, Getting the data, Load exports, Connect Search Console, Crawl and sitemap, Data gate); Analyse (Scorecard, Search findings, Topics and pages, Internal links, Technical, Media and markup, SERP features, AI Search, Backlinks, Page link profiles, Action queue); Deliver (Content briefs, Live editor, AI assist, Prompt pack, Report and history, Export and compare, Coverage map, Method).

Privacy claims (README 311–335): nothing uploaded; three exceptions — proxy.php fetches target pages server-side; the GSC connector talks to Google directly; editor URL import goes through proxy.php. README 330 claims "The page's only unprompted outbound request is to fonts.googleapis.com for three webfonts" — **this is stale**: `index.html` 34–38 says "No webfonts" and `app.css` contains no `@import`, `url(` or `@font-face`. Zero external requests at load; `accounts.google.com/gsi/client` is injected only on Connect click (`gscLoadGis`, 9874–9883).

### 1.2 Licence (LICENCE.txt)

Key clauses, quoted:
- "An annual licence for one installation, for use by you and your clients." (9)
- "Install it on your own server, as many times as your own team needs. Run audits for your clients and give them the reports. Rebrand the reports you produce with it." (11–13)
- "Not permitted: reselling or redistributing the tool itself, as your own product or under another name." (15–16)
- "The check runs in your browser, on your machine. It is not enforcement and is not presented as any: anyone who wants to remove it can, and no feature is gated behind it." (23–25)
- "The key carries two check characters so a typo is caught... That is deliberately not cryptographic" (34–35)
- "Past that the marker says the licence has lapsed and the tool keeps working exactly as before" (41–42)
- "NO WARRANTY ... Supplied as is." (53–57)
- Copyright holder Syed.ai; licences via websitecontentstrategy.com (62–63). README 393–395: "Licensed for use by the purchaser and their clients. Not for resale or redistribution as a product of your own."

**Extraction implication:** the licence permits internal installation and client use, forbids redistribution as a product. Re-implementing the *logic* in a new first-party server codebase for the same owner (syed.ai) is within the copyright holder's own rights; the report should flag that any third-party distribution of derived code must be cleared by the owner.

Licence marker implementation: 12011–12098. Key format `SEC-<YYYY>-<8 alnum>-<2 check>` (`LIC_RE` 12012); checksum is djb2-style over `'SEC-'+year+'-'+body` mapped to a 32-char alphabet (12016–12022); stored in `localStorage['sec-licence']` (12011, 12046). State `valid` / `lapsed` (year < current UTC year) / `typo` / `malformed` / `none`.

### 1.3 Data extraction workflow (EXTRACTING-DATA.txt)

Priority order (16–56): [must] GSC Queries; [should] GSC Pages, previous period or year-ago (shifted 364 days, "not 365, so weekdays still align" 35–36), a crawl; [when needed] GSC page×query (API/BigQuery), GSC Generative AI report, Semrush Organic positions, Keyword gap, Backlinks. "A stage with no data reads NOT MEASURED and drops out of the score... It is never scored as a zero." (70–74)

Per-source click paths: GSC Performance → Search results → Export ZIP (92–109; ~1,000-row cap); GSC Generative AI report (112–129, "recognised by shape: an impressions column with a page, date, country or device dimension and no clicks or position column"); GSC API page+query (`dimensions=["page","query"]`, 25k paging, raw `{rows:[{keys:[...]}]}` accepted, 133–151); Semrush Positions (keep "SERP Features by Keyword", 154–170); Keyword Gap (export Missing/Weak/Untapped separately, 173–185); Backlinks (188–198) and per-URL backlinks for Page link profiles (201–224; target Authority Score entered by hand as "recorded"); Semrush Site Audit crawled pages (226–236); Screaming Frog/Sitebulb `internal_all.csv` (239–250, keep Address, Status Code, Title 1, Meta Description 1, H1-1, Word Count, Canonical Link Element 1, Indexability, Inlinks, Crawl Depth); accepted formats CSV/TSV/PSV/TXT/XLSX/ZIP/JSON/ndjson/.gz, 12 header languages (253–268); manual AI Overview recording (271–286: "kept as RECORDED evidence and are never averaged together with OBSERVED... or REPORTED"); Citation pack — seven packs (288–326).

### 1.4 GSC connection approach (CONNECT-SEARCH-CONSOLE.txt)

- Client-side **Google Identity Services implicit token flow** (`google.accounts.oauth2.initTokenClient`, 9893). Requires the user's own OAuth client ID (Web application type, Authorised JavaScript origin = scheme+host, no redirect URIs, 51–64).
- Scope: `https://www.googleapis.com/auth/webmasters.readonly` (doc 44; `GSC_SCOPE` 4706).
- API: `https://searchconsole.googleapis.com/webmasters/v3` (`GSC_API` 4705): `sites` list and `sites/{site}/searchAnalytics/query`.
- Imports (75–92): Queries, Pages, Pages and queries, Dates, Countries, Devices, Search appearance (alone). 25,000 rows/request, paged, capped 100,000 rows/table (`GSC_ROW_LIMIT` 4708; `maxRows` 100000 at 9971; `maxPages` 20 at 4771). Window ends two days back, `dataState:'final'` (4731–4735, 4754).
- No token stored: "The token is not remembered. Reloading means connecting again, on purpose." (130). Code: `GSC_TOKEN` module variable only (9862, 9898). Code comment 9853–9859 acknowledges implicit grant is weaker than PKCE code flow.
- Explicitly: no AI Overview/AI Mode dimension in the API (121–126).

### 1.5 Crawling (CRAWLING.txt)

Three routes resolved at runtime (23–36): `proxy` (proxy.php beside index.html), `direct` (same-origin), `manual` (paste sitemap/robots, drop Screaming Frog). Proxy setup: `$ALLOWED_HOSTS` allowlist with subdomains included; optional `$SECRET` requires editing `PROXY_URL` in the client (64–68). Limits: 3 MB, 12 s, refuses private/reserved IPs, refuses off-allowlist redirects (74–86). Crawl settings: page limit 200 default, seed from sitemap, obey robots.txt, "four requests at a time, skips assets, and follows internal links breadth-first" (89–100).

### 1.6 Export and compare (EXPORT-AND-COMPARE.txt)

Four artefacts: **Snapshot** (`<host>-snapshot-YYYY-MM-DD-HHMM.json`, totals + score + pillars + counts + top 100 actions + sources, 18–39); **Compare** (saved run or snapshot file; orders by date; unmeasured reads "NOT MEASURED" never zero; warns on domain/basis mismatch; position lower-is-better; YoY = 364-day shift kept in its own bucket, 42–81); **Report** PDF/HTML (self-contained, logo as data URI, A4 print CSS, 86–105); **Excel workbook** with seven sheets: Summary, Scorecard, Action queue, Technical issues, Topics, Sources, Run history — "AN UNMEASURED VALUE IS AN EMPTY CELL. Not a zero." (107–118); **Project backup** `<project>-YYYY-MM-DD-HHMM.seoproject.json` (122–142); delete requires typing the project name (144–149).

---

## 2. UI map (index.html)

Structure: `div.frame` > `nav.rail` (stage buttons, 61–102) + `main.sheet` (topbar 105–124, one `section.panel` per stage, footer 685–693). Global overlays: `#tip` (696), `#toast` (697), `#modal` > `.modalbox` > `#modalTitle`, `#modalClose`, `#modalBody` (698). Boot banners `#nocss` (47) and `#nojs` (53). Navigation is driven by `data-go="<id>"` buttons; `go(id)` (6412–6416) toggles `.hide` on every `section.panel` whose id is not `p-<id>` and sets `aria-current`.

Rail stages (69–99), in order with panel ids and sidebar-status element:

| Group | Rail label | data-go | Panel | Status span |
|---|---|---|---|---|
| Set up | Project | setup | `#p-setup` (127) | `#sub-setup` |
| | Getting the data | guide | `#p-guide` (192) | — |
| | Load exports | data | `#p-data` (205) | `#sub-data` |
| | Connect Search Console | gsc | `#p-gsc` (465) | `#sub-gsc` |
| | Crawl and sitemap | crawl | `#p-crawl` (262) | `#sub-crawl` |
| | Data gate | checks | `#p-checks` (319) | `#sub-checks` |
| Analyse | Scorecard | score | `#p-score` (333) | `#sub-score` |
| | Search findings | findings | `#p-findings` (346) | `#sub-findings` |
| | Topics and pages | topics | `#p-topics` (358) | `#sub-topics` |
| | Internal links | ilinks | `#p-ilinks` (375) | `#sub-ilinks` |
| | Technical | tech | `#p-tech` (411) | `#sub-tech` |
| | Media and markup | media | `#p-media` (387) | `#sub-media` |
| | SERP features | serp | `#p-serp` (399) | `#sub-serp` |
| | AI Search | ai | `#p-ai` (604) | `#sub-ai` |
| | Backlinks | links | `#p-links` (424) | `#sub-links` |
| | Page link profiles | prof | `#p-prof` (477) | `#sub-prof` |
| | Action queue | actions | `#p-actions` (436) | `#sub-actions` |
| Deliver | Content briefs | briefs | `#p-briefs` (449) | `#sub-briefs` |
| | Live editor | editor | `#p-editor` (501) | `#sub-editor` |
| | AI assist | assist | `#p-assist` (489) | `#sub-assist` |
| | Prompt pack | prompts | `#p-prompts` (570) | `#sub-prompts` |
| | Report and history | report | `#p-report` (628) | `#sub-report` |
| | Export and compare | export | `#p-export` (646) | `#sub-export` |
| Reference | Coverage map | map | `#p-map` (662) | — |
| | Method | ref | `#p-ref` (674) | — |

Stage numbers in the static HTML are placeholders; `numberStages()` (7804) renumbers from the rail. Simple mode shows only `SIMPLE_STAGES = ['setup','guide','gsc','data','checks','score','actions','editor','assist','report','export']` (10623) with relabelled headings (`SIMPLE_LABEL`, `SIMPLE_H1`, `SIMPLE_NOTE` 10625–10667).

Topbar (105–124): `#projectSel`, `#btnNewProject`, `#chipDomain`, `#chipFiles`, `#chipCurve`, `.tierswitch [data-tier=simple|pro]`, `#chipScore`, `#btnDemo`, `#btnRun`.

Per-panel controls:
- **Project** (127–188): `#cfgDomain`, `#cfgBrand`, `#cfgCountry`, `#countryHint`, `#cfgLanguage`, `#cfgSearchType` (Web/Image/Video/News/Discover), `#cfgDevice`, `#cfgConversion`, `#cfgGenerative` (unknown/included/excluded/inherit), `#cfgCompetitors`, `#cfgContext`, `#btnSaveCfg`, `#btnDupProject`, `#btnExportProject`, `#importProject` (file), `#projectList`, `#storageBar`, `#storageText`, `#btnDeleteProject`.
- **Getting the data** (192–202): `#btnCopyChecklist`, `#guideBody`.
- **Load exports** (205–259): `#dropzone`, `#filePicker` (accept `.csv,.tsv,.txt,.xlsx,.zip,.json,.gz,.tab,.psv`), `#ledgerCard`, `#rowCount`, `#filterChips`, `#btnClearFiles`, `#ledger` (per-file kind select `[data-kind]`, period select `[data-period]` current/previous/yoy, `[data-map]`, `[data-drop]`).
- **Crawl** (262–316): `#fetchModeCard`, `#fetchModeText`, `#btnRecheckMode`, `#crawlRoot`, `#crawlLimit` (5–5000, default 200), `#crawlSitemapFirst`, `#crawlObeyRobots`, `#crawlKeepText`, `#btnCrawl`, `#btnSitemapOnly`, `#btnStopCrawl`, `#crawlProgress`/`#crawlBar`/`#crawlStatus`, `#pasteXml`, `#btnParsePaste`, `#btnClearPaste`, `#crawlSummary`.
- **Data gate** (319–330): `#btnRun2`, `#gates`, `#gateNote`.
- **Scorecard** `#scoreBody`; **Findings** `#findingsBody`; **Topics** `#clusterTh` (range 0.20–0.70 step 0.02 default 0.38), `#clusterThOut`, `#topicsBody`; **Internal links** `#ilinksBody`; **Media** `#mediaBody`; **SERP** `#serpBody`; **Technical** `#techBody`; **Backlinks** `#linksBody`; **Actions** `#actionsBody`.
- **Briefs** (449–462): `#btnCopyBrief`, `#btnDownloadBriefs`, `#briefsBody`.
- **GSC** `#gscBody` (rendered: property picker, `#gscP_<key>` checkboxes, `#gscDays`, `#gscPrev2`, `#gscStatus`).
- **Page link profiles** `#profBody` (rendered: `[data-profgroup]`, `[data-profas]` recorded authority inputs, `[data-proftopic]`).
- **AI assist** `#assistBody` (rendered: `#aiKey` password input, `#aiRemember`, provider/model/baseUrl/rate/cap fields).
- **Live editor** (501–567): `#btnEdNew`, `#btnEdCopy`, `#btnEdExport`, `#edPick`, `#edCluster`, `#edTitle`, `#edUrl`, `#btnEdFetch`, `#btnEdPaste`, `#btnEdDownload`, `#btnEdDelete`, `#edImportNote`, `#edText`, `#edStats`, `#edTiming`, `#edScore`, `#edImages`, `#edImgCount`, `#edImgInput`, `#btnEdAddImg`, `#btnEdManifest`, `#edImagesBody`.
- **Prompts** (570–600): `#btnCopyEvidence`, `#btnDownloadPack`, `#tgtClaude`/`#tgtGPT`/`#tgtGeneric`, `#evRows` (10–200 default 40), `#evRowsOut`, `#moduleList`.
- **AI Search** (604–625): `#btnAddObs`, `#btnAiPacket`, `#aiViews [data-aiview=visibility|opps|pages|fanout|citations|rules]`, `#aiBody`.
- **Report** (628–643): `#btnCompareRuns`, `#btnPreviewReport`, `#btnDownloadReport`, `#btnSavePdfTop`, `#reportBody`.
- **Export** (646–659): `#btnCompareSnapsTop`, `#btnExportSnapTop`, `#exportBody`.
- **Coverage map** `#mapBody`; **Method** `#refBody`.

Modals are all rendered into `#modalBody` via `showModal(title, html)` (7714): report preview (sandboxed `<iframe srcdoc>` 7783), record AI Overview (8562), citation pack (8444), column mapper (8689), paste HTML (9541), AI page detail (8311), compare dialog (`openCompare` 10940), delete confirmation (`confirmDeleteProject` 11122).

---

## 3. Code architecture of app.js

**Style:** one flat classic script (`<script defer>`), no modules, no IIFE wrapper for the bulk of the code. Everything is a top-level `function`/`const`/`let` in the global scope (374 top-level declarations). Two small IIFEs only: `boot()` (11924–11948) and the theme switcher (11955–11986). Comments reference an original multi-file source layout (`04-analyze.js`, `04h-aisearch.js`, `04l-profiles.js`, `04m-gsc.js`, `04n-ai.js`, `05k-simple.js`, `05l-export.js`; e.g. 2325, 3870, 9636, 9841, 10147, 10230, 10783) that was concatenated by a build step (`make-dist.py`, proxy.php 52). A test (`test-globals.js`, 10355) reportedly fails the build on duplicate top-level names.

Engines are written to be DOM-free and transport-injected (e.g. GSC engine "No fetch, no DOM, no tokens: the transport is passed in" 4683–4686; AI assist "The transport is injected, so all of this is testable in node" 4893). DOM coupling is concentrated in the UI layer (6325 onward).

### 3.1 Section map (line ranges)

| Lines | Section | Nature |
|---|---|---|
| 1–363 | INGEST: numbers, CSV, ZIP, XLSX, gzip, JSON, header classification, aliases, URL/query normalisation | pure |
| 365–438 | COUNTRIES table | data |
| 440–960 | ANALYSIS ENGINE: CTR curve, normalise dataset, build model, gates, findings, action queue | pure |
| 962–1259 | KEYWORD CLUSTERING & CONTENT MAPPING | pure |
| 1261–1336 | Fetch mode detection, `grab`, `grabBytes`, `gunzip` | network |
| 1338–1431 | Sitemaps, robots.txt | pure (+ `loadSitemapTree` network) |
| 1433–1594 | PAGE EXTRACTION (`extractPage`), minhash | DOMParser-coupled |
| 1596–1715 | CRAWL, link graph, near-duplicates | network + pure |
| 1717–1872 | TECHNICAL CHECKS | pure |
| 1874–2058 | HEALTH SCORE (`SCORE_MODEL`, `PILLARS`, `scoreProject`, `gradeOf`) | pure |
| 2060–2315 | CLIENT REPORT (`reportCss`, `buildReport`) | pure string builder |
| 2317–2482 | BACKLINK PROFILE | pure |
| 2484–2629 | INTERNAL LINKING PLANNER | pure |
| 2631–2768 | CONTENT BRIEFS + markdown | pure |
| 2770–2965 | MEDIA, SCHEMA, HREFLANG, SERP FEATURES | pure |
| 2967–3417 | GOOGLE AI SEARCH (eligibility, readiness, main pass, observations) | pure |
| 3419–3861 | AI CITATION PACK (prompt templates) | pure |
| 3863–4184 | DRAFT ANALYSIS (markdown → page shape) | pure |
| 4186–4411 | PAGE IMPORT (HTML → markdown) | DOMParser-coupled |
| 4413–4679 | LINK PROFILES, PAGE BY PAGE | pure |
| 4681–4854 | GSC CONNECTOR engine | pure (transport injected) |
| 4856–5360 | AI ASSIST engine (providers, redaction, cost, prompts, provenance) | pure (transport injected) |
| 5362–5689 | SNAPSHOTS + compare + YoY window | pure |
| 5691–5933 | XLSX writer + `auditWorkbook` | pure (needs `makeZip`) |
| 5935–6154 | AI answer readiness pillar (`AI_EVIDENCE`, `AI_AGENTS`, `aiAgentAccess`, `pageAiSignals`, `aiReadiness`) | pure |
| 6156–6323 | PERSISTENCE (IndexedDB) | browser API |
| 6325–6918 | UI LAYER: cfg form, chips, file intake, tables, charts, gates/findings/actions renderers, download | DOM |
| 6919–7795 | SUITE UI: projects, crawl UI, scorecard/topics/tech/links renderers, report panel, coverage map, `augmentActions`, `run()`, modal, bindings | DOM (+ `augmentActions` logic) |
| 7796–8162 | Added-stage renderers: ilinks, briefs, media, serp, backlink extras, polish | DOM |
| 8163–8730 | AI SEARCH stage views, observation recorder, research packet, column mapper | DOM |
| 8728–8949 | GETTING THE DATA (`GUIDE`, `NEEDS`) | data + DOM |
| 8950–9251 | IMAGE KIT & zip writer (CRC32, deflate, canvas re-encode) | browser API |
| 9252–9633 | LIVE EDITOR stage | DOM |
| 9634–9837 | PAGE LINK PROFILES stage | DOM |
| 9838–10142 | GSC CONNECTOR stage (GIS load, token, import) | DOM + network |
| 10143–10590 | AI ASSIST stage (key storage, spend, jobs) | DOM + network |
| 10591–10781 | SIMPLE MODE | DOM |
| 10782–11292 | EXPORT/IMPORT/COMPARE stage (snapshots, xlsx, pdf, backups, delete) | DOM |
| 11290 | `MODULES` — 22 prompt-pack modules (38 KB JSON, one line) | data |
| 11293–11502 | EVIDENCE INJECTION (`evTable`, `fillMap`, `buildPrompt`, `renderModules`) | mixed |
| 11503–11666 | METHOD / REFERENCE page | DOM text |
| 11667–11920 | SAMPLE DATA (seeded LCG) | pure |
| 11921–11948 | INIT (`boot`) | DOM |
| 11950–11986 | Theme switcher (localStorage `sec.theme.v1`) | DOM |
| 11988–12098 | LICENCE MARKER | DOM + localStorage |

### 3.2 Key functions

| Line | Function | Purpose |
|---|---|---|
| 9 | `num(v)` | Locale-tolerant number parse; `%` → fraction; `(x)` negative; comma/dot heuristics; returns `null` for blanks/`-`/`n/a` |
| 27 | `pctVal(v)` | CTR from "4.2%", 0.042 or 4.2 |
| 35 | `sniffDelim(text)` | Delimiter by counting `, ; \t |` outside quotes in first non-empty line |
| 45 | `parseDelimited(text, delim)` | RFC-4180-ish CSV parser; drops blank rows; strips BOM |
| 65 | `readZip(buf)` | Minimal ZIP reader (stored + deflate via `DecompressionStream('deflate-raw')`) |
| 112 | `readXlsx(buf)` | Minimal XLSX reader (sharedStrings, inlineStr, sheet names) |
| 173 | `gunzipText(bytes)` | gzip decode |
| 184 | `jsonToMatrix(text)` | JSON/ndjson/GSC API `{rows:[{keys}]}` → header+rows; infers dimension names from values (page/date/device/country/searchAppearance/query) |
| 245 | `looksDomain(h)` | Header looks like a domain column (Semrush gap) |
| 254 | `ALIAS` | Multilingual header aliases (12 languages) |
| 276 | `classify(headers, filename)` | Dataset kind detection |
| 337 | `pick(headers, ...cands)` | Column resolver (exact then prefix) |
| 351 | `normUrl(u, opts)` | Strip scheme, `www.`, hash, query, trailing `/`, lowercase |
| 363 | `normQuery(q)` | trim, lowercase, collapse whitespace |
| 434 | `findCountry(v)` | Country by name / ISO3 / Semrush db |
| 451 | `ctrAt(curve, pos)` | Expected CTR at rounded position; tail 0.004 beyond 20 |
| 461 | `normalizeDataset(ds)` | Typed rows per kind |
| 546 | `buildModel(datasets)` | Aggregates datasets into `M` model; truncation and CTR-consistency warnings |
| 591 | `buildCurve(rows)` | Self-calibrated CTR curve (median per position, ≥8 rows, ≥4 positions) |
| 620 | `runGates(M,cfg,datasets,filters)` | Data-gate checks |
| 693 | `analyse(M, cfg)` | Findings: snapshot, distribution, striking, ctrGap, decay/risers, cannibal, gaps, smrDrops, reconcile, actions |
| 914 | `buildActions(F,cfg,curve)` | Merge findings into deduped ranked queue |
| 974 | `stem(w)` | Light suffix stemmer |
| 985 | `tokens(q)` | Tokenise + stopwords + stem |
| 998 | `guessIntent(q, brandTokens)` | Regex intent |
| 1015 | `clusterQueries(rows, opts)` | Greedy centroid agglomeration with URL evidence |
| 1188 | `addGapClusters(clusters,gaps,opts)` | Competitor-only clusters |
| 1223 | `summariseClusters(clusters)` | Status counts, coverage |
| 1232 | `mapPages(clusters)` | Reverse view: page → owned/contested topics, verdict |
| 1271 | `detectFetchMode(origin)` | proxy / direct / manual |
| 1300 | `grab(url, mode)` | Fetch via proxy or direct |
| 1341 | `parseSitemapXml(text, src)` | Regex sitemap parser |
| 1364 | `loadSitemapTree(startUrl, cb, max)` | Follow sitemap indexes (max 60) |
| 1397 | `parseRobots(text)` / 1419 `robotsAllows` | robots.txt groups; longest-match allow/disallow |
| 1438 | `extractPage(res, origin, opts)` | Per-page extraction (see §6) |
| 1576 | `shingleSig(words)` / 1589 `sigSim` | 64-bucket minhash over 5-word shingles |
| 1599 | `crawlSite(opts)` | BFS crawler, concurrency 4, depth ≤ 12 |
| 1665 | `buildLinkGraph(pages, origin)` | inlinks and BFS click depth |
| 1700 | `findDuplicates(pages, th)` | Near-dupe groups (0.85) |
| 1722 | `technicalChecks(crawl, ctx)` | ~45 issue codes |
| 1921 | `scoreProject(ctx)` | Six-pillar health score |
| 2051 | `gradeOf(n)` | Grade bands |
| 2147 | `buildReport(ctx)` | Self-contained HTML report |
| 2331 | `classifyAnchor(a, brandTokens)` | Anchor class |
| 2340 | `analyseBacklinks(datasets, cfg)` | Backlink profile |
| 2495 | `topicPhrases(cluster, max)` | Candidate anchor phrases |
| 2524 | `planInternalLinks(ctx)` | Link opportunities, orphan rescues, over-linked |
| 2638 | `buildBriefs(ctx)` / 2687 `briefToMarkdown` | Content briefs |
| 2777 | `analyseMedia(crawl, gscPages)` | Image audit |
| 2848 | `analyseSchema(crawl)` | JSON-LD type coverage |
| 2870 | `analyseHreflang(crawl)` | hreflang reciprocity |
| 2913 | `normFeature(s)` / 2921 `analyseSerpFeatures` | SERP feature suppression/targets |
| 3000 | `aiEligibility(page, ctx)` | 8 eligibility checks |
| 3048 | `readinessFor(page, cluster, elig, ctx)` | 9-component readiness score |
| 3161 | `analyseAiSearch(ctx)` | AI Search main pass |
| 3347 | `aggregateDim(store)` | Sum impressions per dim |
| 3364 | `parseObservation(text)` | Parse pasted AI Overview record |
| 3398 | `summariseObservations(obs, cfg)` | Citation share |
| 3448 | `queryIntent(q)` | AIO shape (definition/howto/comparison/list) |
| 3459 | `citationContext(obs, ctx)` / 3531 `packPreamble` / 3842 `buildCitationPack` / 3854 `packReadiness` | Citation pack |
| 3899–4038 | `draftStripFences`, `draftIsDelimRow`, `draftBlocks`, `draftStripInline`, `draftBlockText`, `draftHost` | Markdown block parser |
| 4047 | `analyseDraft(raw, opts)` | Markdown → page-shaped object |
| 4173 | `draftCoverage(page, cluster)` | Per-query coverage checklist |
| 4215–4399 | `importSafeHref`, `importInline`, `importImage`, `importEscape`, `importBlocks`, `htmlToDraft`, `importReport` | HTML → markdown importer |
| 4454 | `backlinkRows(datasets)` / 4502 `profileOf` / 4575 `linkProfiles` / 4628 `compareProfiles` | Per-URL link profiles |
| 4731 | `gscDateRange(days, nowMs)` / 4739 `gscPreviousRange` / 4746 `gscBody` / 4769 `gscPageAll` / 4801 `gscToJson` / 4805 `gscDatasetName` / 4816 `gscPickSites` / 4835 `gscErrorMessage` | GSC engine |
| 5024 | `aiRedact(s, key)` | Key redaction |
| 5045 | `aiTokenEstimate` / 5054 `aiCostEstimate` | Cost arithmetic (chars/4) |
| 5063 | `aiRequest` / 5080 `aiCall` / 5113 `aiTransportMessage` / 5125 `aiErrorMessage` / 5143 `aiProbe` | Provider-agnostic AI call |
| 5194 | `aiFactBlock(facts)` | Facts → prompt text |
| 5337 | `aiResultRecord` / 5358 `aiIsEvidence` | GENERATED provenance |
| 5408 | `snapStamp` / 5415 `snapSlug` / 5430 `buildSnapshot` / 5518 `snapshotFilename` / 5525 `parseSnapshot` / 5545 `runToSnapshot` | Snapshots |
| 5577 | `snapDelta(a,b,lowerIsBetter)` / 5590 `compareSnapshots(x,y)` / 5683 `snapYearAgo` | Comparison |
| 5720–5849 | `xlsxEsc`, `xlsxCol`, `xlsxSheetXml`, `xlsxEntries`, `makeXlsx`, `auditWorkbook`, `xlsxFilename` | XLSX writer |
| 6043 | `aiAgentAccess(robots)` | AI crawler allow/block state |
| 6070 | `pageAiSignals(p)` | Per-page GEO signals incl. stuffing |
| 6117 | `aiReadiness(ctx, metric)` | AI readiness pillar metrics |
| 6170–6323 | `idb`, `DBput/get/del/all/by`, `createProject`, `saveDataset`, `saveCrawl`, `saveRun`, `saveDraft`, `exportProject`, `importProject` | Persistence |
| 6435 | `ingestFiles(fileList)` / 6486 `addTable(name, matrix)` | File intake, header row detection |
| 6545 | `makeTable(cols, rows, opts)` | Sortable/filterable table widget |
| 7058 | `doCrawl(sitemapOnly)` / 7042 `fetchSitemapsAndRobots` / 7126 `sfToPages(ds)` | Crawl orchestration; Screaming Frog import |
| 7513 | `augmentActions()` | Adds topic/pagemap/ilinks/serp/hreflang/AI/technical actions and `band` |
| 7601 | `run()` | The analysis pipeline |
| 8675 | `openMapper(id)` | Column mapper (renames headers to canonical) |
| 9085 | `optimiseImage(file)` / 9013 `makeZip` / 9166 `exportBundle` | Image kit |
| 9293 | `edRecompute()` | Editor scoring (`analyseDraft` → `readinessFor` → `draftCoverage`) |
| 9887 | `gscConnect()` / 9914 `gscFetchJson` / 9944 `gscImport` | GSC stage |
| 10300 | `aiRun(jobId, ctx, label)` | AI assist job runner with spend cap |
| 11298 | `evTable(kind)` / 11362 `fillMap()` / 11419 `buildPrompt(mod)` | Prompt pack evidence injection |
| 11669 | `seeded(s)` / 11670 `sampleData()` | Deterministic demo data (LCG seed 7) |
| 12016 | `licChecksum` / 12024 `licParse` | Licence key |

---

## 4. Data model

### 4.1 IndexedDB

`DB_NAME = 'seo-suite'`, `DB_VER = 2` (6166). Stores (6167, created 6176–6196):

| Store | keyPath | Indexes | Record shape |
|---|---|---|---|
| `projects` | `id` | — | `{ id:'p_<base36>', name, created, updated, cfg }` (6238) |
| `datasets` | `id` | `projectId` | `{ id:'d_…', projectId, name, kind, source, period ('current'|'previous'|'yoy'), headers:[], rows:[{header:value}], domainCols, mapped:bool, addedAt }` (6253–6255) |
| `crawls` | `id` | `projectId` | `{ id:'c_…', projectId, at, origin, mode ('proxy'|'direct'|'manual'|'imported'), pages:[page], sitemaps:[], robots, stats }` (6265–6267) |
| `runs` | `id` | `projectId` | `{ id:'r_…', projectId, at, snapshot:{clicks,impr,ctr,pos,n}, overall, pillars:[{key,score}], counts:{actions,issues,topics,datasets,pages} }` (6274, 7693–7698) |
| `drafts` | `id` | `projectId` | `{ id:'dr_…', projectId, title, text, clusterId, created, updated, words, score|null }` (6285–6288) |
| `meta` | `k` | — | `{k:'active', v:projectId}` (6240); `{k:'tier', v:'simple'|'pro'}` (10761); `{k:'aikey', v:<API key>}` (10185, 10214); `{k:'aicfg', v:AI_CFG}`; `{k:'aispend', v:AI_SPEND}` |

DB_VER 2 added `drafts` (6163). Ids from `newId(prefix)` = prefix + `_` + `Date.now().toString(36)` + 5 random base36 chars (6215).

**Project `cfg`** (`blankCfg` 6218–6232): `domain, brand, country ('United States'), market, gscCountry ('usa'), semrushDb ('us'), language ('English'), searchType ('Web'), device ('All devices'), conversion, competitors, context, crawlLimit (200), clusterThreshold (0.38), generativeControl ('unknown'), observations:[], linkAuthority:{}, linkTopics:{}, gscClientId, gscCountryFilter, gscDeviceFilter, simple:null`. Also written at runtime: `gscCompare` (9951). Observations (AI Overview records) are stored inside `cfg.observations` (8574), shape from `parseObservation` (3385–3395): `{ id:'obs_…', query, date, country, device, present:bool, response, cited:[{url,host}], followups:[], paa:[], notes, recordedAt, packGeneratedAt? }`.

**Crawl page record** (`extractPage` 1543–1571; imported variant `sfToPages` 7139–7150; failure variants 1635–1648): `url (normalised), raw, requested, status, redirects[], ms, bytes, title, metaDescription, robotsMeta, noindex, nofollowPage, canonical, canonicalRaw, selfCanonical, h1, h1Count, h2Count, headings[≤80], firstPara(≤600), medianPara, paraCount, listCount, tableCount, outboundCitations, quoteBlocks, attributedQuotes, statHits, numberHits, latestYear, contentAnalysed:true, wordCount, text(≤12000 chars, '' if keepText false), shingles (Uint32[64]|null), internalLinks:[{url,href,anchor}], internalLinkCount, externalLinkCount, nofollowCount, images:[{src,fetchpriority,alt,hasAlt,loading,w,h,srcset}], imgMissingAlt, imgNoDims, schemaTypes[], hreflang:[{lang,href}], lang, hasViewport, ogTitle, contentType`; added by crawler/graph: `depth`, `inlinks`, `clickDepth`; flags `notHtml`, `imported`, `error`.

### 4.2 Web storage

`localStorage`: `sec.theme.v1` (theme, 11956), `sec-licence` (licence key, 12011). No `sessionStorage`, no cookies. GSC access token is held only in the `GSC_TOKEN` variable (9862).

### 4.3 Import/export JSON formats

- **Project backup** (`exportProject` 6297–6307): `{ format:'search-evidence-console/project', version:1, exportedAt, project:{name,created,cfg}, datasets:[…minus id/projectId], crawls:[…], runs:[…], drafts:[…] }`. Filename `<project>-YYYY-MM-DD-HHMM.seoproject.json` (`projectBackupName` 11092). Import (6308–6316) validates only `format`.
- **Snapshot** (`buildSnapshot` 5430–5516): `{ format:'search-evidence-suite/snapshot', version:1, exportedAt, at, app:{name,build}, project:{name,domain,brand,market,searchType,device}, measurement:{basis:'query'|'page'|'no'|'run', hasComparison, curve:'baseline'|'calibrated'|null}, totals:{clicks,impressions,ctr,position,rows}|null, previousPeriod, yearAgo, score:{overall, model, measuredPillars, coverageNote, pillars:[{key,name,weight,score|null,needs}]}|null, counts:{actions,issues,topics,pages,datasets}, actions:[≤100 {rank,decision,target,impact,effort,basis,evidence}], sources:[{name,kind,period,rows}] }`. `parseSnapshot` (5525) requires `format`, `version <= 1`, `at`, `score`.
- **Workbook** sheets (5917–5925): Summary, Scorecard, Action queue, Technical issues, Topics, Sources, Run history. Empty cell for null (5755).
- **CSV zip** of the same seven tables (`exportEveryTable` 11275).

---

## 5. Ingestion

### 5.1 File handling (`ingestFiles` 6435–6485)

- `.zip` → `readZip`; entries `.json` → `jsonToMatrix`; `.csv/.tsv/.txt` → `parseDelimited`; a `filters.csv` entry is captured into `FILTERS` (GSC export filter sheet, 6453–6456); `.xlsx` entries → each sheet a dataset.
- `.xlsx` → each sheet; `.gz` → gunzip then JSON or delimited; `.json/.ndjson` → `jsonToMatrix`; anything else → JSON if it starts with `[`/`{` else delimited.
- `addTable` (6486): header row = widest of the first 4 rows (GSC title-row tolerance); rows → objects keyed by header; `classify` assigns kind/source; `period:'current'`.

### 5.2 Classification (`classify` 276–322)

Order of rules (all header matching is lowercase, exact-or-prefix against `ALIAS`):
1. **GSC Generative AI**: has impressions AND (filename matches `/generative|\bai[-_ ]?(overview|mode|search|performance)/i` OR no clicks/pos/ctr) → `gsc_genai_page|date|country|device` by dimension present (286–296).
2. clicks+impr+pos → `gsc_page_query` (query+page), `gsc_query`, `gsc_page`, `gsc_date`, `gsc_country`, `gsc_device`, `gsc_appearance`, default `gsc_query` (298–307).
3. clicks+impr+date → `gsc_date` (308).
4. `keyword` + ≥2 domain-like columns → `semrush_gap` with `domainCols` (311).
5. `keyword` + position + volume + url → `semrush_positions` (312).
6. `keyword` + position + (visibility|tags|landing page) → `semrush_tracking` (313).
7. source url + target url → `semrush_backlinks` (314).
8. address + status code → `sf_crawl` (Screaming Frog / Sitebulb) (315).
9. url/address + (crawl depth|http status code|internal linkrank|status code|indexability) → `semrush_audit` (316).
10. `keyword` + volume → `semrush_positions` (317).
11. Filename fallback: `/quer|suchanfr|consulta|requet|requêt/` + impr → `gsc_query`; `/page|seite|pagin|halaman/` → `gsc_page` (319–320).
12. else `unknown`.

`KIND_LABEL` (324–334) also lists `aio_observation` (no classifier produces it; `buildModel` 574 consumes it).

### 5.3 Column mapping (`normalizeDataset` 461–543)

Columns: `query` (ALIAS or `keyword`), `page` (ALIAS or `url`/`address`), `clicks`, `impr`, `ctr`, `pos`, `date`, `country`, `device`, `prevPos` (`previous position`, `prev. position`), `volume` (`search volume`, `volume`), `kd` (`keyword difficulty`, `kd`, `kd %`, `difficulty`), `cpc`, `intent` (`keyword intents`, `intent`, `keyword intent`), `feat` (`serp features by keyword`, `serp features`), `traffic`, `status` (`http status code`, `status code`), `depth` (`crawl depth`), `issues`.

Normalised row shapes:
- `gsc*`: `{ query, queryRaw, url, urlRaw, date, dim (country else device), clicks (num||0), impr (num||0), ctr = clicks/impr (0 if impr 0), ctrReported (pctVal|null), pos (num|null) }`; rows with no query/url/date/dim dropped.
- `semrush_gap`: `{ keyword, keywordRaw, volume, kd, cpc, intent, positions:{<domain header w/o parenthetical>: pos|null} }`.
- `semrush_positions|tracking`: `{ keyword, keywordRaw, pos, prevPos, volume, kd, cpc, url, urlRaw, intent, features, traffic }`.
- `semrush_audit`: `{ url, urlRaw, status, depth, issues }`.
- other kinds (backlinks, sf_crawl): raw rows passed through; consumed by `analyseBacklinks` (2348–2356 column aliases: `source url|source page url|page url|url from|source`, `target url|…`, `anchor|anchor text`, `page ascore|domain ascore|authority score|page score|domain score`, `nofollow`, `sponsored`, `ugc`, `type`, `first seen|firstseen`, `last seen`, `lost|lost date|deleted`, `new|new date`), `backlinkRows` (4458–4468) and `sfToPages` (7128–7133: `address`, `status code`, `title 1|title`, `meta description 1|meta description`, `h1-1|h1`, `word count`, `canonical link element 1|canonical`, `indexability`, `indexability status`, `inlinks|unique inlinks`, `crawl depth`, `size (bytes)|size`, `response time` (seconds ×1000), `content type|content`).

### 5.4 Model assembly (`buildModel` 546–588)

`M = { gscQ:{current,previous,yoy}, gscP:{…}, gscPQ (rows carry period), gscDates (carry period), gscDevice, gscCountry, genai:{page,date,country,device}×{current,previous,yoy}, genaiLoaded, aioObs, smrPos, smrGap, smrAudit, smrTracking, truncated:[], parseWarnings:[] }`.
- Truncation flag: any gsc dataset with 999–1001 rows (576).
- Parse warning: for gsc rows with `ctrReported` and `impr ≥ 10`, if `|ctrReported − ctr| > max(0.01, ctr×0.12)`; warn when `checked > 20` and `bad/checked > 0.2` (577–585).

### 5.5 GSC API path

`gscImport` (9944) → `gscPageAll` → `gscToJson` → `jsonToMatrix` → `addTable`, so API data and CSV share one classifier. Dataset name `Search Console · <Label> · <start> to <end> · <host>` (+ ` · previous` / ` · year ago`), and `period` is set on the dataset (9981–9989). `gscBody` (4746) filters `country` (lowercase) and `device` (uppercase) via `dimensionFilterGroups`.

### 5.6 Column mapper (`openMapper` 8675–8726)

User picks kind from `MAP_KINDS` (8671) and maps each header to `MAP_FIELDS` (8665); headers are **renamed** to canonical English names (`Query, Page, Clicks, Impressions, CTR, Position, Date, Country, Device, Search Volume, Keyword Difficulty, SERP Features by Keyword, Keyword Intents`, 8709–8711) and `mapped:true` is persisted.

---

## 6. Crawler

### 6.1 Fetching

- `detectFetchMode(origin)` (1271–1298): GET `proxy.php?ping=1`; requires `{ok:true, service:'sec-proxy'}` and `configured!==false && curl!==false` → `'proxy'`; else if `origin === location.origin` → `'direct'`; else `'manual'`. `PROXY_URL = 'proxy.php'` (1269) is relative.
- `grab(url, mode)` (1300–1319): proxy mode GET `proxy.php?url=<enc>` expecting JSON `{status, finalUrl, headers, body, redirects, ms, bytes}`; direct mode `fetch(url, {redirect:'follow'})` — CORS-bound.
- `grabBytes` (1321) uses `?bin=1` for gz sitemaps.

### 6.2 Crawl loop (`crawlSite` 1599–1662)

- Inputs: `origin, seeds, limit (200), concurrency (4), robots, obeyRobots, onProgress, abort, keepText`.
- Scope: same host as origin (www stripped); skip assets by extension regex `SKIP` (1603); respect robots `*` group if `obeyRobots`; dedupe by `normUrl`.
- BFS; child links enqueued only when `depth < 12` (1633); stop at `pages.length >= max`.
- HTML pages: `status 200–399` and content-type matches `/html/` (default `text/html` if header missing) → `extractPage`; otherwise a stub page with `notHtml:true`; fetch errors produce a stub with `status:0, error`.
- Returns `{ origin, pages, errors, at, mode }`. `doCrawl` (7058) then calls `buildLinkGraph` and saves to IndexedDB. Seeds from sitemap when `#crawlSitemapFirst` and sitemap URLs exist (first `limit` entries), else `[root]`.

### 6.3 Sitemaps and robots

- `fetchSitemapsAndRobots` (7042–7057): GET `origin/robots.txt`; candidates = robots `Sitemap:` lines or `/sitemap.xml`, `/sitemap_index.xml`; `loadSitemapTree` follows indexes up to 60 files (1365).
- `parseSitemapXml` (1341–1362): regex-based; entries `{loc, lastmod, changefreq, priority, images (count of image:loc), hreflang (count of xhtml:link)}`; `type:'index'|'urlset'`, `malformed` when no blocks but non-empty text.
- `parseRobots` (1397–1417): groups of `{agents[], rules:[{type:'allow'|'disallow', path}], crawlDelay}` plus `sitemaps[]`. `robotsAllows` (1419–1431): exact agent group else `*`; longest matching prefix wins (wildcards stripped, `$` ignored); empty path ignored; default allow.

### 6.4 Extraction (`extractPage` 1438–1572)

Uses `DOMParser` on the response body. Extracts: title, `meta[name=description]`, robots/googlebot meta (joined, lowercase), canonical (absolutised then normalised; `selfCanonical` compares to final URL), H1/H2/H3 text lists, links across the whole document (internal = same host; nofollow count; external count; skips `#`, `javascript:`, `mailto:`, `tel:`), body scope = `main` → `article` → `[role=main]` → `body` with `script,style,noscript,template,svg,nav,footer,[role=navigation],[role=contentinfo],[role=banner]` removed; word count (tokens >1 char); AI signals: `firstPara` (first `<p>` > 40 chars), `paraLens`, `listCount`, `tableCount`, `quoteBlocks` (`blockquote,q,cite`), `outboundCitations` (http links to other hosts inside scope), `numberHits` (regex 1497), `statHits` (regex 1503–1505: currency amounts, number+unit, or thousands-grouped numbers), `attributedQuotes` (two regexes 1510–1515), `latestYear` (max `19xx|20xx`), images (`src|data-src`, `alt`, `hasAlt`, `loading`, `width/height`, `srcset`, `fetchpriority`), JSON-LD `@type`s (walks `@graph`; `INVALID_JSON` on parse failure), hreflang links, `html[lang]`, viewport presence, `og:title`, content-type header. `text` = first 12,000 chars of body text unless `keepText === false`. `shingles` = 64-bucket minhash over 5-word shingles (needs ≥12 words).

### 6.5 Link graph and duplicates

`buildLinkGraph` (1665–1697): `inlinks` = number of distinct pages linking to the URL; `clickDepth` by BFS from home (home = `normUrl(origin)` or first page with ≤1 path segment). `findDuplicates` (1700–1715): candidates `wordCount ≥ 120`; skip pairs whose word counts differ by >60%; group when `sigSim ≥ 0.85`.

---

## 7. proxy.php

**Behaviour (exact):**
- Config: `$ALLOWED_HOSTS` (48–87) — **this copy ships with a populated private allowlist** (syed.ai, websitecontentstrategy.com, <client-host>, <client-host>, <client-host>, <client-host>, <client-host>, <client-host>, <client-host> and nine `*.<client-host>` preview hosts). The file comment (51–54) says this file "IS PRIVATE AND NEVER GOES IN THE CUSTOMER ZIP". `$SECRET=''` (101). Limits: `$MAX_BYTES` 3 MiB, `$TIMEOUT` 12 s, `CURLOPT_CONNECTTIMEOUT` 8 s, `$MAX_REDIRECTS` 5, `$RATE_PER_MIN` 120 per caller IP, UA `Mozilla/5.0 (compatible; SearchEvidenceSuite/1.0; +self-hosted SEO audit)` (106–110).
- Response headers: `Content-Type: application/json`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer` (122–125). No CORS headers (same-origin use only). `display_errors` off (118).
- `?ping=1` → `{ok, service:'sec-proxy', version:3, engine:'php', configured, hosts, curl, pinned, ratePerMin}` (354–366). Note `hosts` count leaks allowlist size (used by UI 7023).
- Refuses without cURL (501, 372–374); enforces `$SECRET` via `hash_equals` on `?key=` (376–378); refuses when allowlist empty (403); rate limit via per-IP temp file `sys_get_temp_dir()/sec-proxy-<md5(ip)>.rl` with `flock` (322–346), caller IP from `CF-Connecting-IP`, `X-Real-IP`, first `X-Forwarded-For`, else `REMOTE_ADDR` (310–320) — spoofable but documented as non-security (304–309); if the temp file cannot be opened the limit is skipped (327).
- URL validation: non-empty, ≤2048 chars, `parse_url` scheme+host, scheme ∈ {http, https}, host allowlisted (exact or `.suffix` match, 262–272).
- **SSRF protections present:** every hop resolves the host (`dns_get_record` A+AAAA, fallback `gethostbyname`), normalises IPv4-mapped IPv6, checks all addresses against 23 blocked CIDRs (147–171: 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4, ::/128, ::1, 64:ff9b::/96, 64:ff9b:1::/48, 100::/64, 2001:db8::/32, fc00::/7, fe80::/10, ff00::/8); unresolvable → refuse (249–260); pins the connection with `CURLOPT_RESOLVE` to the vetted IP (446–448); `CURLOPT_FOLLOWLOCATION false` with manual per-hop re-vetting and allowlist re-check (481–505); `CURLOPT_PROTOCOLS` http/https only (455–459); TLS verify on (442–443); progress callback aborts downloads over 3 MiB (449–451); body truncated to 3 MiB (509–513).
- Output: JSON `{ok, status, url, finalUrl, redirects:[{from,to,status,note?}], headers:{lower:value}, bytes, ms, truncated, body (UTF-8 scrubbed)}` (531–542) or raw bytes with `X-Proxy-Status` when `?bin=1` (515–521). Fetch errors are returned as HTTP 200 with `{error}` (466, 429, 421).

**Gaps / assessment:**
- Authentication is optional; default relies on the allowlist + folder password. Anyone reaching the URL can use the server's bandwidth against allowlisted hosts and enumerate whether a host is allowlisted (403 message echoes the host, 403).
- Private ranges are blocked but the allowlist match is suffix-based: an allowlisted apex whose DNS is attacker-controlled (or a wildcard subdomain) can point at any *public* IP — acceptable by design (only public targets).
- `dns_get_record` failures fall back to a single A record via `gethostbyname`; IPv6-only AAAA results are missed in that fallback (documented).
- Rate limiting keyed on spoofable headers; temp-file per IP allows filesystem litter; not a security boundary (documented).
- Full response headers (including `set-cookie` from the target) are relayed to the browser (474–478).
- Overall: a careful, above-average shared-hosting proxy; the shipped allowlist contents are the main hygiene issue for this repository copy.

---

## 8. Analysis engines — rules and formulas

All thresholds are quoted from code. `ctrAt(curve,pos)` = `curve[round(pos)]` for 1–20 else `TAIL_CTR = 0.004`; `pos == null` → 0.004 (451–456). `BASE_CURVE` (446–447): {1:.275, 2:.152, 3:.099, 4:.070, 5:.053, 6:.041, 7:.033, 8:.028, 9:.024, 10:.021, 11:.017, 12:.015, 13:.013, 14:.012, 15:.011, 16:.010, 17:.009, 18:.0085, 19:.008, 20:.0075}. `MONTH_TO_PERIOD = 28/30.4` (449).

### 8.1 CTR curve calibration (`buildCurve` 591–617)

Bucket rows with `pos` and `impr ≥ 25` by `round(pos)` 1–20; a position is calibrated when ≥8 rows (median CTR). If fewer than 4 positions calibrated → baseline (`source:'baseline'`). Gaps filled by scaling `BASE_CURVE[p] × curve[anchor]/BASE_CURVE[anchor]` where anchor is nearest lower calibrated position (else nearest higher). Enforce non-increasing: `curve[p] > curve[p−1]` → `curve[p] = curve[p−1] × 0.94`. Returns `{curve, source:'calibrated', filled}`.

### 8.2 Data gate (`runGates` 620–690, plus country gate 7616–7624)

| Gate | pass / warn / fail |
|---|---|
| Files loaded | any datasets / — / none |
| Domain set | — / — / no host |
| Domain matches the data | share of page URLs on host: >0.9 pass, >0.5 warn, else fail; skip if no page URLs |
| Comparison period present | previous rows exist / else warn |
| Periods are the same length | from Dates exports: day-count diff 0 pass, ≤1 warn, else fail; warn when no previous Dates or no Dates |
| Exports are not truncated | warn if any gsc dataset has 999–1001 rows |
| Numbers parsed cleanly | warn if `parseWarnings` |
| Your column found in the keyword gap export | pass if a `positions` key equals host / else fail |
| Scope agreement between sources | always warn when Semrush positions and GSC queries both present |
| Export filters recorded | pass when ZIP filter sheet captured |
| Enough rows to generalise | current query rows ≥200 pass, ≥50 warn, else fail |
| Country matches the export (7616) | share of Countries-export impressions matching `cfg.gscCountry`/country name: >0.8 pass, >0.4 warn, else fail |

### 8.3 Search findings (`analyse` 693–908)

- `brandTokens` = brand words >2 chars; `isBrand(q)` = every token in query. `minImpr = 20`.
- **Snapshot**: `clicks, impr, ctr=clicks/impr, pos = Σ(pos×impr)/Σimpr, n`; basis = queries if present else pages; `previous`, `yoy` kept separate.
- **Branded**: clicks/impr/n/share of current clicks.
- **Distribution** buckets: `[1,3],[4,10],[11,20],[21,50],[51,999]` using `pos >= lo && pos < hi + .5`.
- **Striking distance** (740–750): rows `3.5 ≤ pos ≤ 40`, `impr ≥ 20`; `target = pos ≤ 10 ? 3 : pos ≤ 20 ? 8 : 15`; `gain = max(0, impr × (ctrAt(target) − ctr))`; keep `gain ≥ 1`; sort by gain desc.
- **CTR gap** (753–763): `pos ≤ 10.4`, `impr ≥ 50`; `exp = ctrAt(pos)`; `ratio = ctr/exp`; `lost = max(0, impr×(exp−ctr))`; keep `ratio < 0.6 && lost ≥ 2`.
- **Decay / risers** (766–806): pair current vs previous by URL (pages) and by query (queries), aggregating previous duplicates (impression-weighted position). `d = clicks − prevClicks`, `posMove = pos − prevPos`. Decay when `prevClicks ≥ 5 && d ≤ −max(3, prevClicks×0.25)`; cause: vanished → "Dropped out of the export"; `posMove ≥ 1` → "Ranking loss"; `dImpr ≤ −prevImpr×0.25` → "Impressions fell at a stable rank"; else "Click-through fell at a stable rank". Riser when `prevClicks ≥ 3 && d ≥ max(5, prevClicks×0.25)`.
- **Cannibalisation** (809–854): from current page×query rows; per query `impr ≥ 100`; URLs with `share ≥ 0.12 && impr ≥ 20`, sorted by impr; need ≥2. `close = |top.pos − second.pos| < 3`. `rank(u) = clicks×3 + impr/100 + max(0, 30 − pos)`; `keep` = higher rank. Action: `second.share < 0.2 || (second.clicks === 0 && second.share < 0.3)` → **Monitor**; `|top.share − second.share| < 0.18 && close` → **Consolidate**; `close` → **Differentiate**; else **De-optimise the weaker page**. Severity: `second.share ≥ 0.35` high, `≥ 0.2` medium, else low. Sorted by impr.
- **Keyword gap** (857–883): `mine` = positions key equal to host; competitors = others. Best competitor = min pos ≤ 20; skip if `best.pos > 10` or `myPos ≤ 10`. `estClicks = volume × ctrAt(curve,5) × MONTH_TO_PERIOD`; `intentW` = transactional/commercial 1.35, informational 1, navigational 0.5; `score = estClicks × intentW / (1 + kd/60)`. Verdict: `myPos ≤ 30` → "Refresh the page that already ranks"; `gscImpr ≥ 30` → "Refresh: you already get impressions for this"; else "Create".
- **Semrush drops** (886–889): `pos − prevPos ≥ 3 && prevPos ≤ 20`; sort by `drop × log10(10+volume)`.
- **Reconcile** (892–904): Semrush `pos ≤ 10`; flag if not in GSC and `volume ≥ 100`; or GSC `impr < max(10, volume×0.03×MONTH_TO_PERIOD)` and `volume ≥ 100`.

### 8.4 Action queue (`buildActions` 914–960; `augmentActions` 7513–7596)

Key `decision::target`; duplicates keep max impact and append evidence. `EFFORT` (911): create High, refresh Medium, ctr Low, consolidate Medium, protect Low, investigate Low, fix Low. `DECISION_LABEL` (912): Create, Refresh, Fix title and snippet, Consolidate, Protect, Investigate, Technical fix.

Sources and impact: striking (top 120) → refresh, `gain`, observed; ctrGap (80) → ctr, `lost`, observed; decay (80) → ctr if cause is CTR else refresh, `|delta|`; risers (40) → protect, `delta×0.3`; cannibal (40) → consolidate, `impr × ctrAt(3) × 0.25`; gaps (100) → create/refresh, `estClicks`, estimated; smrDrops (40) → investigate, `volume×0.01`, estimated; reconcile (25) → investigate, 0, estimated. Impact rounded to 0.1; sorted desc.

`augmentActions` adds: split topics → consolidate `opportunity || impr×0.02`; missing topics with competitor → create `opportunity` (estimated); weak topics with `impr > 200` → refresh; diluted pages (≤15) → refresh `opportunity×0.4`; internal-link targets (≤25) → refresh `n×0.5` effort Low; SERP suppressed (≤20) → ctr `lost`; hreflang critical (≤10) → fix, band blocking; AI: gate excluded → fix blocking; blocked pages (≤15) → fix blocking; recover pages (≤15) → refresh `webClicks×0.2`; high-priority AIO opportunities (≤20) → refresh `impr×0.01`; technical issues grouped by code (non-notice) → fix, impact 0, effort Medium if >20 URLs else Low, band `blocking` iff severity critical. Final sort: blocking first, then impact desc.

### 8.5 Topic clustering (`clusterQueries` 1015–1185)

- Tokens: lowercase, strip non-`[a-z0-9À-ɏ\s'-]`, split on whitespace/`'`/`-`, drop length ≤1 and `STOP` set (972), apply `stem` (974–984: `ies→y`; keep `ss|us|is`; `ches|shes|xes|zes|ses` drop 2; drop trailing `s`; `ing` if len>6 drop 3 else `ed` if len>5 drop 2; `ly` if len>5 drop 2; words ≤3 chars unchanged).
- Vectors: tf-idf with `idf = ln(1 + N/df)`, unit-normalised; cosine similarity.
- Dominant URL per query from `pageIndex` (max impr share).
- Order: impressions desc, then fewer tokens first. Candidates via inverted index on top-4 centroid tokens, looking up the 4 rarest tokens of the query.
- Similarity adjustments: same dominant URL → `sim = min(1, sim + 0.25)`; both dominant shares > 0.5 and different URLs and `sim < 0.75` → skip candidate. Floor `TH` (default 0.38, slider 0.20–0.70), `+0.15` when cluster has ≥60 members.
- Consolidation pass: clusters sharing an indexed token with centroid `sim ≥ TH + 0.12` merge, unless both have dominant URLs (>0.5 share), different, and `sim < 0.85`.
- Cluster output: `name` = top-impression member's raw query; `impr, clicks, ctr, pos` (impr-weighted), `bestPos`; `urls` with share; `status`: no URLs → `unmapped`; owner share ≥ 0.6 → `owned`; ≥2 URLs with share ≥ 0.2 → `split`; else `weak`. `opportunity` = Σ over members with `pos ≥ 3.5` of `max(0, impr×(ctrAt(target)−ctr))` with target 3/8/15 as in striking. `intent` = impression-weighted mode of Semrush intent (first token before `,`/`/`) or `guessIntent`. Sorted by impr; ids `c<i>`.
- `addGapClusters` (1188–1221): gap rows with `gscImpr < 30`, bucketed by the two alphabetically-first tokens; cluster `status:'missing'`, `source:'semrush'`, ids `g<n>`, `opportunity = Σ estClicks`, `volume`.
- `summariseClusters`: counts by status; `coverage = owned/(owned+split+weak)`.
- `mapPages` (1232–1259): verdicts — `competing only` (0 owned, contested), `diluted` (≥4 owned and ≥2 intents), `mixed intent` (≥2 owned and ≥2 intents), `overlapping` (≥2 contested), else `focused`. Contested requires share ≥ 0.2.
- Intent rules (993–1003): navigational if brand; transactional / commercial / informational regexes; default informational.

### 8.6 Technical checks (`technicalChecks` 1722–1866)

Severities `critical, serious, warning, notice` (`SEV_ORDER` 1720). Codes and triggers:

| Code | Sev | Trigger |
|---|---|---|
| fetch_failed | critical | status 0 |
| http_5xx / http_4xx | critical | status ≥500 / ≥400 |
| redirect_chain | serious | >1 redirect hop |
| noindex | critical if in sitemap else notice | robots meta noindex |
| canonical_missing | warning | no canonical |
| canonical_broken | critical | canonical target crawled with status ≥400 |
| canonical_other | notice | canonical elsewhere |
| title_missing | critical | no title |
| title_long / title_short | warning | >65 / <20 chars |
| desc_missing | warning; desc_long notice | none / >165 chars |
| h1_missing warning; h1_multiple notice | | 0 / >1 H1 |
| thin | serious | words <150 |
| thin_soft | notice | words <300 |
| img_alt | warning | any image without alt (live crawl only) |
| img_dims | notice | images lacking width/height |
| viewport | serious | no viewport meta |
| lang | notice | no `html[lang]` |
| orphan | serious | inlinks 0 and clickDepth ≠ 0 |
| deep | notice | clickDepth >3 |
| no_outlinks | warning | 0 internal links |
| heavy | notice | bytes >2,000,000 |
| slow | warning | ms >1500 |
| schema_invalid | serious | INVALID_JSON |
| url_case / url_underscore / url_long | notice | uppercase / `_` / raw URL >115 chars |
| not_in_sitemap | warning | 200, indexable, absent from sitemap |
| title_dupe | serious | >1 page share title |
| desc_dupe | notice | >1 share description |
| h1_dupe | notice | >2 share H1 |
| soft_404 | critical | `sigSim(home, page) ≥ 0.9` for a 200 page |
| near_dupe | serious | `findDuplicates` group (≥0.85) |
| ai_agent_blocked | serious | retrieval AI crawler blocked in robots.txt |
| sitemap_error / sitemap_malformed | critical | fetch error / no `<loc>` |
| sitemap_toobig | critical; sitemap_bytes serious | >50,000 URLs / >50 MB |
| sitemap_http | warning | non-https loc |
| sitemap_lastmod / sitemap_future | notice | invalid / >1 day in future |
| sitemap_params | notice | `?`/`&` in loc |
| sitemap_dupe | warning | loc repeated |
| robots_no_sitemap | warning | robots present, no Sitemap line |
| sitemap_blocked | critical | loc disallowed by robots |
| sitemap_unseen | notice | submitted URLs with zero GSC impressions |
| sitemap_missing_earners | warning | GSC URLs with clicks absent from sitemap |

### 8.7 Health score (`scoreProject` 1921–2049)

`SCORE_MODEL = 2` (1888). Pillars and weights (1902–1909): crawl 18, onpage 17, topics 19, search 24, airead 12, offpage 10 (sum 100). `metric(label, value, detail, weight)` clamps value to [0,1] or null (1911). `rollup` = weighted mean of non-null metrics (1914–1919). Pillar score = `round(rollup×100)`; overall = `round(Σ score×weight / Σ weight of measured pillars × 100)`; unmeasured pillars are excluded from the denominator; `coverageNote` reports weight carried. Helpers: `ratio(good,total)` null when total 0; `logScale(v, full) = clamp01(log10(1+v)/log10(1+full))`.

Metrics (label, formula, weight):
- **Crawl**: Pages returning 200 = `ok/allPages` (3); Canonical present = `canon/pages` (2); Reachable by internal links = `(all − orphans)/all` (2); Within three clicks = `shallow/reached` (1); Sitemap integrity = `smCrit ? clamp01(1 − smCrit/8) : (sitemap loaded ? 1 : null)` where smCrit counts critical/serious `sitemap_*` issues (2).
- **On-page** (live 2xx HTML pages, n): Titles 20–65 chars (3); Titles unique = `(n − pagesSharingTitle)/n` (2); Meta descriptions written (2); Exactly one H1 (1); Body ≥300 words (2); Images alt ratio averaged per page (pages with no images count 1) (1).
- **Topics**: Clear owning page = `coverage` (3); Not split = `(mapped − split)/mapped` (2); Competitor topics covered = `mapped/(missing + mapped)` (2); Top ten = `topicTop10` = share of cluster impressions where cluster pos ≤ 10.5 (2) (computed 7676–7677).
- **Search**: Capture = `clamp01(Σclicks / Σ(impr × ctrAt(pos)))` over base rows with pos (3); Top-ten impressions share (`pos ≤ 10.5`) (3); Momentum = `clamp01(0.5 + (cur.clicks − prev.clicks)/max(1, prev.clicks) × 1.2)` (2); Little stranded = `1 − clamp01(strikingImpr/totalImpr)` (1).
- **Off-page**: Referring domain base = `logScale(refDomains, 750)` (3); Anchor diversity (2); Followed share (1); Link retention = `gained/(gained+lost)` when lost known (2); Links spread = `targetSpread` (1).
- **AI readiness**: from `aiReadiness` (§8.10).

Grades (`gradeOf` 2051–2058): ≥85 Strong (pass), ≥70 Solid (pass), ≥55 Patchy (warn), ≥40 Weak (warn), else Poor (fail); null → "Not scored".

### 8.8 Backlinks (`analyseBacklinks` 2340–2482)

Rows from all `semrush_backlinks` datasets; `nofollow` true when column value is `true|yes|1`. Domains keyed by source host with max score, follow count, targets, anchors. Anchors lowercased, ≤90 chars, `(empty)` placeholder. `classifyAnchor` (2331–2338): `empty or image`, `naked URL` (regex), `branded`, `generic` (here/this/click/link/read more/website/site/more), else `descriptive`. Velocity by month of first-seen (gained) and lost date (lost), last 24 months. Competitor split by target host; `prospects` = domains linking to rivals and not to `mine`, sorted by rival count then score, ≤120. `anchorDiversity = clamp01((1/HHI) / min(60, distinctAnchors))` where HHI = Σ share². `targetSpread = clamp01(log10(1+targets)/log10(121))`. `lost` is null when no lost column. `unlinkedEarners` filled by `run()` (7659–7663): GSC pages with `clicks ≥ 5` not among top targets, ≤40.

### 8.9 Internal link planner (`planInternalLinks` 2524–2629)

Requires 2xx HTML pages with `text.length > 200`. Host weight `= 1 + log10(1+clicks) + log10(1+inlinks)`. Targets = first 120 clusters with an owner. Phrases = `topicPhrases` (2–6 words, not all stopwords, ≤10 plus cluster name). For each host page whose lowercased text contains a phrase and does not already link to the target: pick the longest matching phrase, `context = sentenceAround(...)`, `score = weight × (1 + log10(1 + opportunity)) × (words ≥ 3 ? 1.25 : 1)`. Orphan rescues: pages with 0 inlinks (not home), terms from H1, title first segment, slug (≥2 words), term length ≥8, ≤5 sources. Over-linked: `internalLinkCount > max(60, 3 × median)`.

### 8.10 AI Search: eligibility, readiness, decisions

- **Eligibility** (`aiEligibility` 3000–3028), states pass/fail/check/unknown: Returns 200; Indexable (noindex → fail); Canonical consistent (none or elsewhere → check); Snippets permitted (`nosnippet` → fail); max-snippet not restrictive (0 ≤ n < 100 → check); Crawlable by robots.txt (blocked → fail); Main content in served HTML (`wordCount ≥ 120` pass else check); Search generative AI control (`excluded` fail, `included` pass, else unknown). `blockers` = fails; `state` = blocked / partial / eligible.
- **Readiness** (`readinessFor` 3048–3156), `READINESS_PARTS` weights (3035–3045): eligibility 20, task 15, unique 15, evidence 15, coverage 10, structure 10, fresh 5, media 5, links 5. Components (null when unmeasurable; weights renormalise; score withheld when measured weight < 50):
  - eligibility = `clamp(1 − failed×0.45 − unsure×0.08)`; null for drafts.
  - task = `(answerish ? .55 : fpWords ? .2 : 0) + (h1HasTopic ? .25 : 0) + (headings ≥ 3 ? .2 : 0)`, answerish = 25 ≤ firstPara words ≤ 120.
  - evidence: `per100 = numberHits/(wordCount/100)`; `(per100 ≥ 1.2 ? .5 : ≥ .5 ? .3 : > 0 ? .12 : 0) + (outbound ≥ 3 ? .3 : ≥ 1 ? .18 : 0) + (tables ? .2 : 0)`.
  - unique = `(caseish ? .5 : 0) + (firstHand ? .2 : 0) + (tables ? .15 : 0) + (per100 ≥ 1 ? .15 : 0)`; regexes 3095–3096.
  - coverage = `covered / max(3, members)`; a query is covered when every word >3 chars appears in text+headings+title (else whole-query substring).
  - structure = `(headings ≥ 3 ? .4 : headings ? .2 : 0) + (0 < medianPara ≤ 90 ? .35 : medianPara ? .12 : 0) + (lists ? .25 : 0)`.
  - fresh = `latestYear == null ? null : clamp(1 − (nowYear − latestYear)×0.34)`.
  - media = `(imgs ≥ 3 ? .6 : imgs ? .35 : 0) + (tables ? .4 : 0)`.
  - links = `inlinks == null ? null : clamp(log10(1+inlinks)/log10(16))`.
  - score = `round(acc/w × 100)` if `w ≥ 50`.
- **Main pass** (`analyseAiSearch` 3161–3345): observed visibility from genai page rows (state new/up/down/flat/lost; concentration = top 10% of URLs share); reported AIO queries from Semrush features matching `/ai\s*overview|ai\s*mode|generative/`; query opportunities priority: no owner → medium; owner AI-visible → protect; `pos ≤ 10.5` → high; `pos ≤ 20.5` → medium; else organic. CTR gap on AIO queries: `pos ≤ 10.5`, `impr ≥ 50`, `ctr/exp < 0.6`. Page decision order (3285–3293): gate excluded → blocked; eligibility blockers → blocked; AI state down/lost → recover; AI impr>0 and aioQ>0 and readiness<70 → expand; AI impr>0 → protect; aioQ>0 and `webPos ≤ 12` → opportunity; aioQ>0 → organic; else monitor. Fan-out: member queries not covered by the owner page text+headings, sorted by `missing × log10(10+impr)`.
- **AI readiness pillar** (`aiReadiness` 6117–6154): Retrieval crawlers allowed = `(retrieval − blocked)/retrieval` (null without robots) weight 3; then, from `pageAiSignals` (6070–6112) over pages with `contentAnalysed && wordCount ≥ 60`: share with `statsPer500 ≥ 2` (w3); share with `quotes ≥ 1` (`attributedQuotes + min(quoteBlocks,4)`) (w3); share with `outbound ≥ 2` (w2); share with `headings ≥ 2 && questionHeads ≥ 1` (w1); `1 − share(stuffed)` (w2) where stuffed = target-term density `> 0.05` and count `≥ 10` (density computed only when ≥120 content words and the commonest word appears in title/H1). `AI_AGENTS` (6028–6038): retrieval = OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-User, Google-Extended; training = GPTBot, ClaudeBot, CCBot, Applebot-Extended. `aiAgentAccess`: exact UA group else `*`; blanket disallow (`/` or empty) with no allow → blocked; blanket with allow → partial; else allowed; no group → unstated.

### 8.11 SERP features (`analyseSerpFeatures` 2921–2965)

Feature aliases (2904–2912). Suppressed: GSC `pos ≤ 10.5`, `impr ≥ 50`, `ctr/expected < 0.6`, `lost = impr×(exp−ctr)`. Targets: features match `Featured snippet|People also ask|FAQ|Things to know` and `2 ≤ pos ≤ 9`.

### 8.12 Media / schema / hreflang (2777–2901)

Image issues: no alt attribute; deliberately empty alt; alt >125 chars; alt <4 chars; alt equals filename; camera / generic / hash filename (regexes 2774–2775, 2812); filename >60 chars; uppercase; `_`/space/`%`; no width/height; no srcset; older format (jpg/jpeg/png/gif/bmp/tiff); first image lazy-loaded. Reused images: same src >3 times. Schema: coverage = pages with any type / pages; invalid count. Hreflang: no x-default (notice), no self-reference (serious), invalid code vs `LANG_RE` (serious), no return tag (critical).

### 8.13 Content briefs (`buildBriefs` 2638–2685)

Clusters with `status !== 'unmapped' || impr > 0`, first 60; questions = members matching `QUESTION_RE` (2636), ≤12; entities = top 14 token stems by impressions excluding head tokens; supporting = members 1–24; competing URLs share ≥ 0.15; link sources from planner (≤6); benchmarks = site median word count. Sorted by headroom. Markdown in `briefToMarkdown` (2687–2768) — no word-count target by design.

### 8.14 Snapshots and compare (§4.3, 5577–5675)

`snapDelta`: null if either side null with explanatory note; `pct = delta/|a|` (null if a=0); direction flat/better/worse honouring `lowerIsBetter`. `compareSnapshots`: orders by `at`; warnings for domain mismatch, basis mismatch, saved-run side, different `score.model`; `yearOverYear = 330 ≤ days ≤ 400`; action churn keyed `decision::target` → closed/opened/carried with rank move.

### 8.15 Draft analysis and editor

`analyseDraft` (4047–4162) reproduces the crawler field shape from markdown: heading detection (ATX, setext, bare short line <80 chars without terminal punctuation), tables via delimiter row, lists via `DRAFT_LIST_RE`, inline stripping collecting links/images, `numberHits`/`latestYear` regexes copied from the crawler (4089–4090 — note `statHits`/`attributedQuotes` are **not** computed for drafts, so `pageAiSignals` would under-count for drafts; the editor does not call it). Nulls for `status, inlinks, clickDepth, imgNoDims, schemaTypes, hreflang, hasViewport`. `contentAnalysed = words > 0`. Editor recompute (9293–9307): `analyseDraft` → `readinessFor(page, cluster, null, {})` → `draftCoverage`; debounce 180 ms doubling up to 900 ms when recompute >12 ms.

---

## 9. Evidence model

Four provenance classes are used consistently: **observed** (Search Console), **reported** (Semrush), **recorded** (crawl / entered by hand), **generated** (LLM). Quoted:

- Report legend (2270–2273): "observed — measured by Search Console for this property; reported — a third-party estimate, treated as a lead to verify; recorded — crawled or entered by hand; generated — written by a language model, never scored".
- Actions carry `basis: 'observed' | 'estimated'` (925, 947) — note the action queue uses **`estimated`**, while the report `BASIS_TAG` (2176) maps `observed|reported|recorded|generated`; `estimated` therefore renders with no tag in the report (`BASIS_TAG[a.basis]||''`, 2181). A naming inconsistency to normalise.
- Link profiles: `evidence: 'REPORTED'` (4616); recorded authority `recordedAuthority` typed by hand (4599).
- AI assist (4862–4876): "Nothing a language model writes is evidence... This adds a fourth, GENERATED, and it is deliberately the only one that no score, pillar, gate or action rank can read." `AI_PROVENANCE = 'GENERATED'` (5335); `aiResultRecord` sets `scores:false` (5352); `aiIsEvidence(rec)` returns false for generated (5358–5360). No scoring function references AI results (verified: `AI_RESULTS` used only in the assist stage).
- UI tags `EV.observed/reported/recorded` (8168–8170) and `.evtag.generated` in the AI assist panel (10438, 10471).

**Missing values:** `null` is the consistent "not measured" sentinel: `metric()` keeps null (1912); `rollup` drops nulls (1915); pillar `score:null` when unmeasured (2043); `readinessFor` components null with weight renormalisation (3129–3155); snapshot `totals` fields null (5439–5443); `snapDelta` null delta with notes (5578–5582); xlsx empty cell for null/'' (5755); report `&mdash;` for null (2150). Exceptions where 0 is used: `normalizeDataset` coerces missing clicks/impr to `0` (488) and `volume/kd/cpc` to 0 (516, 527); Semrush gap `positions[d]` becomes null for 0/blank (512); `analyseAiSearch` sets `aiImpr: 0` when the genai export is loaded but the URL is absent, `null` when not loaded (3299).

**Versioning:** `SCORE_MODEL = 2` travels in `score.model` (2047), snapshots (5481) and comparison warnings (5609–5612). Snapshot format `search-evidence-suite/snapshot` v1; project backup `search-evidence-console/project` v1; proxy `version:3`. There is no rules-version for the technical checks, clustering, or readiness formulas — only the pillar weighting is versioned.

**Timestamps:** `at` (epoch ms) on runs, crawls, snapshots; `exportedAt` ISO; `recordedAt` on observations; `addedAt` on datasets; `created/updated` on projects and drafts. Some computations depend on wall-clock (`new Date().getFullYear()` in freshness 3121; `Date.now()` in sitemap future check 1837; `gscDateRange` uses `nowMs` parameter).

---

## 10. AI features

- **Bring-your-own-key assist** (4856–5360, 10143–10590). Providers (`AI_PROVIDERS` 4903–5015): Anthropic (`https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`, default `claude-sonnet-4-5`); OpenAI (`/v1/chat/completions`, Bearer, default `gpt-4.1-mini`); Gemini (`generativelanguage.googleapis.com/v1beta/models/<m>:generateContent`, `x-goog-api-key`, default `gemini-2.5-flash`, temperature 0.3); OpenAI-compatible (custom base URL; Ollama etc.). `AI_MAX_TOKENS = 2000` (5017).
- **Key handling:** key entered in a password field (10396); held in `AI_KEY`; optionally persisted to IndexedDB `meta['aikey']` when "Remember" is ticked (10212–10217). Never in a project export. `aiRedact` strips the key and key-shaped strings from messages (5024–5038).
- **Cost:** user-entered $/M rates; `chars/4` token estimate when the provider does not return usage (5045–5059); monthly spend counter in `meta['aispend']`; cap `capUSD` default 5 (10176, 10295–10298).
- **System prompt** `AI_SYSTEM` (5164–5190): "Use ONLY the numbers given... no search volumes, no difficulty scores, no traffic or ranking estimates"; cites GEO levers (+40% quotes, +32% stats, +27% cites, +28% fluency, −8% stuffing; schema none; llms.txt no evidence).
- **Jobs** (`AI_JOBS` 5210–5326): `explain` (a finding), `rewrite` (a passage), `critique` (draft vs queries), `narrative` (client summary), `label` (name clusters). Results in memory only (`AI_RESULTS` ≤ 20, never persisted, 10180, 10323).
- **Labelled generated:** `aiResultRecord.provenance='GENERATED'`, `scores:false`; UI badge `.evtag.generated`.
- **Prompt pack** (`MODULES` 11290, 22 modules; `buildPrompt` 11419) and **Citation pack** (3602–3861) produce prompt *text* for the user to paste elsewhere; they make no network calls.
- **Probe** (`aiProbe` 5143): 16-token test call to detect CORS refusal.

---

## 11. Third-party dependencies

- **None bundled.** No CDN scripts, no libraries; CSV/ZIP/XLSX/gzip/deflate/CRC32/minhash/DOM parsing are all hand-written.
- Runtime browser APIs: `DecompressionStream`/`CompressionStream` (ZIP, gz, xlsx, bundle), `DOMParser`, `indexedDB`, `navigator.storage.estimate`, `createImageBitmap`/`OffscreenCanvas`-style canvas re-encode (`canvas.toBlob` webp/jpeg), `navigator.clipboard`, `URL`, `fetch`.
- External endpoints at runtime, all user-initiated: `proxy.php` (relative), `https://accounts.google.com/gsi/client` (script injected on Connect, 9872), `https://searchconsole.googleapis.com/webmasters/v3/*`, AI provider endpoints (§10). An `isHosted()` check references an optional `claude.use('downloads')` host API (6889–6896) — an artefact of the published-artifact build.
- Fonts: system stack only (index.html 34–38); README's fonts.googleapis.com note is stale.

---

## 12. Security and privacy concerns (ranked)

**Critical**
1. **Private client allowlist committed to the repo** — `proxy.php` 48–87 contains the operator's own and client domains plus nine Hostinger preview hosts, contrary to the in-file note that it "NEVER GOES IN THE CUSTOMER ZIP". Commercially sensitive; must not propagate into any new package.

**High**
2. **Third-party API keys stored in plaintext in IndexedDB** (`meta['aikey']`, 10214) when "Remember" is ticked, and held in a global `AI_KEY`. Any XSS or shared-machine access exposes the key. Mitigated by opt-in and redaction, but a server-side key vault is the correct design for the extracted product.
3. **Implicit OAuth token in page memory** (`GSC_TOKEN`, 9898) — acceptable for the browser-only design, acknowledged at 9853–9859; the extracted server should use the authorization-code flow with PKCE and server-held refresh tokens.
4. **Unauthenticated proxy by default** — `$SECRET` empty; anyone who discovers `proxy.php` can fetch allowlisted hosts through the server (bandwidth abuse, allowlist enumeration via the 403 message, target `set-cookie` headers relayed). Documented mitigation is folder-level HTTP auth.

**Medium**
5. **Rate limiting keyed on spoofable headers** (`CF-Connecting-IP`, `X-Real-IP`, `X-Forwarded-For`, proxy.php 310–320) and skipped entirely when the temp dir is unwritable (327).
6. **Report preview via `srcdoc` iframe with `sandbox="allow-same-origin"`** (7783). The report HTML is built with an escaper (`e()` 2149) and contains no scripts, so this is defensive-in-depth only; but `allow-same-origin` without `allow-scripts` is safe as long as the report never gains inline script.
7. **CSV export lacks formula-injection hardening** (`toCsv` 6882–6887): a crawled title such as `=HYPERLINK(...)` or a query beginning `=`/`+`/`-`/`@` is written verbatim; opened in Excel it may execute. The XLSX writer uses `inlineStr` cells (5758) and is not affected.
8. **`.htaccess` security defaults are commented out** (HTTPS redirect 47–51, Basic auth 60–63) — the shipped default is an unauthenticated page that stores client GSC data in the browser.
9. **Project import trusts the file** (`importProject` 6308–6316): only `format` is checked; arbitrary `cfg`, dataset rows and crawl pages are written to IndexedDB and later rendered — safe today because every renderer escapes, but a schema validator is needed in the server port.

**Low**
10. **XSS surface**: crawled content (titles, anchors, contexts, alt text, JSON-LD types) and imported CSV values reach the DOM only through `esc()` / `makeTable` `html:` callbacks that escape (verified by scanning all template interpolations after line 6300; e.g. 6646, 7865–7866, 8202, 8393). `htmlToDraft` parses with `DOMParser` and emits markdown only (4186–4197). The chart label `${d.label}` (6608) uses constant bucket labels. No `eval`, `new Function`, or `document.write`. Residual risk is limited to attribute contexts built with `esc()` (which also escapes quotes) and the `srcdoc` case above.
11. **GSC client ID stored in project cfg** (`gscClientId`) and therefore in exports — the doc correctly notes a client ID is not a secret (CONNECT 8–9).
12. **`ping` response discloses allowlist size and cURL/pin capability** (proxy.php 355–365).
13. **Direct fetch mode follows redirects cross-origin** (`grab` 1312) — bounded by browser CORS.
14. **Licence key in `localStorage`** — non-sensitive by design.

---

## 13. Extraction plan inputs

### 13.1 Pure / deterministic — extractable as-is into TypeScript

Ingestion & normalisation: `num`, `pctVal`, `sniffDelim`, `parseDelimited`, `jsonToMatrix`, `H`, `looksDomain`, `ALIAS`, `aliasHas/aliasPick`, `classify`, `pick`, `normUrl`, `hostOf`, `pathOf`, `normQuery`, `COUNTRIES`/`findCountry`, `normalizeDataset`, `buildModel`, `addTable`'s header-row heuristic (6489–6493), mapper rename logic (8705–8717), `sfToPages`.

Analysis: `ctrAt`, `median`, `sum`, `buildCurve`, `runGates` (+ country gate 7616–7624), `analyse`, `buildActions`, `augmentActions` (needs refactor to take state as arguments), `stem`, `tokens`, `guessIntent`, `clusterQueries`, `addGapClusters`, `summariseClusters`, `mapPages`, `parseSitemapXml`, `flattenSitemaps`, `parseRobots`, `robotsAllows`, `h32`, `shingleSig`, `sigSim`, `buildLinkGraph`, `findDuplicates`, `technicalChecks`, `summariseIssues`, `scoreProject`, `gradeOf`, `metric`/`rollup`, `classifyAnchor`, `analyseBacklinks`, `topicPhrases`, `sentenceAround`, `planInternalLinks`, `buildBriefs`, `briefToMarkdown`, `analyseMedia`, `analyseSchema`, `analyseHreflang`, `normFeature`, `analyseSerpFeatures`, `aiEligibility`, `readinessFor`, `analyseAiSearch`, `aggregateDim`, `parseObservation` (make id/time injectable), `summariseObservations`, `queryIntent`, `citationContext`, `packPreamble`, `CITATION_PACKS`, `buildCitationPack`, `packReadiness`, all `draft*` functions and `analyseDraft`, `draftCoverage`, `backlinkRows`, `medianInt`, `profileOf`, `linkProfiles`, `compareProfiles`, `aiAgentAccess`, `pageAiSignals`, `aiReadiness`, snapshot builders/comparison (`buildSnapshot`, `parseSnapshot`, `runToSnapshot`, `snapDelta`, `compareSnapshots`, `snapYearAgo`, `snapStamp`, `snapSlug`), GSC engine (`gscDateRange`, `gscPreviousRange`, `gscBody`, `gscPageAll` with injected transport, `gscToJson`, `gscDatasetName`, `gscPickSites`, `gscErrorMessage`), AI engine (`AI_PROVIDERS`, `aiRedact`, `aiTokenEstimate`, `aiCostEstimate`, `aiRequest`, `aiCall`, `aiProbe`, `AI_SYSTEM`, `AI_JOBS`, `aiFactBlock`, `aiResultRecord`, `aiIsEvidence`), XLSX writer string builders (`xlsxEsc`, `xlsxCol`, `xlsxSheetXml`, `xlsxEntries`, `auditWorkbook`), `buildReport`/`reportCss` (string only), prompt-pack `evTable`/`fillMap`/`buildPrompt` (after replacing globals with a context object), `sampleData` (seeded), `licChecksum`/`licParse`.

Hidden wall-clock dependencies to make injectable: `readinessFor` (3121), `technicalChecks` (1837), `parseObservation` (3386–3387), `briefToMarkdown` (2692), `citationContext` (3464–3465), `buildSnapshot` default `at`.

### 13.2 DOM / browser-coupled

`readZip`/`readXlsx`/`gunzipText` (DecompressionStream, DOMParser for XML) → replace with Node zlib + an XML parser; `extractPage` and `htmlToDraft` (DOMParser) → port to `linkedom`/`parse5`/`cheerio` with care to keep the same selectors and text-normalisation; `grab`/`detectFetchMode`/`crawlSite`/`loadSitemapTree` (fetch) → server fetch with SSRF guard equivalent to proxy.php; image kit (canvas) → `sharp`; `makeZip`/`deflateRaw` → `zlib`/archiver; all `render*`, `makeTable`, `run()`, `ingestFiles`, IndexedDB layer, GSC stage (GIS), AI assist stage, editor stage.

### 13.3 Recommended package boundaries

- **`search-evidence-core`** — types (Dataset, Model, Page, Cluster, Issue, Score, Action, Snapshot), normalisation, CTR curve, gates, findings, action queue, clustering, technical checks, health score, backlinks, internal links, briefs, media/schema/hreflang, SERP features, AI eligibility/readiness/main pass, draft analysis, link profiles, snapshots/compare, report builder, workbook rows. Pure functions; `SCORE_MODEL` and a new `RULES_VERSION` exported.
- **`search-data-ingestion`** — file format readers (CSV/TSV/JSON/ndjson/XLSX/ZIP/gz), header classification and multilingual aliases, column mapper, Screaming Frog/Sitebulb/Semrush audit adapters, GSC API client (engine + a PKCE/server OAuth adapter), dataset persistence schema, project backup import/export.
- **`search-crawler`** — SSRF-guarded fetcher (port of proxy.php rules), sitemap/robots parsing, BFS crawler with concurrency/limits, `extractPage` port, link graph, minhash duplicates, HTML→markdown importer.
- **`search-ai-observations`** — observation parser/store, citation context and packs, AI agent access model, GEO evidence table, BYOK provider adapters with redaction/cost, provenance records (`GENERATED`), prompt-pack modules and evidence injection.

### 13.4 Calculations needing characterization fixtures first

Priority order (highest drift risk, most arithmetic):
1. `buildCurve` + `ctrAt` (median bucketing, anchor scaling, monotonic clamp).
2. `analyse` sub-findings — striking, ctrGap, decay/risers pairing (including `vanished` rows and impression-weighted prevPos), cannibal actions/severity, gap score and verdicts, reconcile.
3. `buildActions` + `augmentActions` dedupe/ordering (key semantics, `band`, impact rounding).
4. `clusterQueries` end-to-end (order-dependent greedy algorithm; fixtures must pin input ordering, `df`/`idf`, URL bonus/penalty, consolidation pass, status assignment, opportunity) and `addGapClusters` bucket keys.
5. `scoreProject` per-pillar metrics and renormalised overall; `gradeOf`.
6. `technicalChecks` (all codes; soft-404 and near-dupe depend on `shingleSig` — fix the hash and shingle window in fixtures).
7. `readinessFor`, `aiEligibility`, `analyseAiSearch` decisions and priorities; `pageAiSignals` stuffing rule; `aiReadiness`.
8. `extractPage` field-level fixtures from saved HTML (selectors, regexes for `numberHits`/`statHits`/`attributedQuotes`, scope pruning) — required before the DOMParser → server-DOM port.
9. `analyseDraft` block splitter and coverage against the same fixtures as `readinessFor` (editor/audit parity guarantee).
10. `analyseBacklinks` (HHI diversity, targetSpread, velocity months), `linkProfiles`/`compareProfiles` medians and tiers.
11. `planInternalLinks` scoring and phrase selection; `buildBriefs` entities.
12. `compareSnapshots`/`snapDelta`, `snapYearAgo` (364-day shift), `gscDateRange`/`gscPreviousRange` with injected `nowMs`.
13. `classify`/`normalizeDataset`/`jsonToMatrix` against real export headers in the 12 supported languages and the GSC API `keys` shape; `num()` locale cases.
14. `parseRobots`/`robotsAllows` and `aiAgentAccess`; `parseSitemapXml` edge cases (CDATA, namespaces, index vs urlset).

Known inconsistencies to resolve during extraction: action `basis:'estimated'` vs report tag vocabulary (`reported`); README stale font claim; README "ten stages" vs `SIMPLE_STAGES` eleven; `KIND_LABEL.aio_observation` has no producer; drafts lack `statHits`/`attributedQuotes` while crawled pages have them; `analyse` uses `pos ≤ 10.4` for ctrGap but `≤ 10.5` elsewhere; `sfToPages` sets `hasViewport:true` and `h1Count` from presence, which flatters imported crawls.
