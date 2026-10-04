# CRM GO-LIVE runbook (Control Tower 2026-10-02)

Goal: real RFQ intake into the CRM at production cutover, with the CRM fully proven on **staging** first.

The patch adds:

- the mounted, fail-closed Typeform intake endpoint;
- the launch mapping rules;
- the "no password email" rule;
- the UI-1 must-fix set;
- the catalog index (Pass 0);
- the D-1 first-response due rule (delta patch R1.1, applied with R1 in the same round).

**Recorded approvals (Control Tower ruling on R1, 2026-10-02):**

- content-model label: migration `20261002_231259_crm_golive_catalog_index` is **owner-approved**;
- catalog seed choices (14 RESEARCH_REQUIRED manufacturers; QUOTE_ONLY / LEGACY_ICS / INCOMPLETE defaults; 46 products left uncategorised) are **accepted**;
- at cutover, **one** Typeform "Send test request" is allowed, and its RFQ is flagged in the CRM (Production plan step 4);
- D-1 is decided (next section);
- cutover condition 4 (clearing synthetic records and users) remains **separately authorised**.

**PRODUCTION = LOCKED.** Nothing here is run against production until the owner's separate GO. Commander deploys; the Factory does not.

All commands run from `apps/h2o`:

- in a source checkout: `pnpm exec payload …`;
- in the runtime image: `node node_modules/payload/bin.js …`.

The commands are written below in the image form.

---

## Pass 0: catalog index (seed) on staging

The website keeps rendering from `public-routes`, which stays the single source of truth. The seed writes an **index** into `products`, `product-categories` and `manufacturers` so that:

- editors can find products in the admin;
- the CRM can link a product RFQ to a product by its exact slug.

The seed is one-way and idempotent, and never writes `public-routes`.

### Step 1: migrate (additive)

Run:

```
node node_modules/payload/bin.js migrate
```

Expected: `Migrated: 20261002_231259_crm_golive_catalog_index`.

This migration only adds columns and indexes:

- `page_route_id` and `source_route_id` on products and product categories;
- `product_categories_id` on the products relation tables.

### Step 2: record the before HTML of 5 product pages

Pick any 5 published product pages. The local rehearsal used these:

```
/product/abb-motor-example/  /product/amarillo-drive-shaft-cf60-275m/
/product/amarillo-right-angle-gear-drives-single-reduction-155/  /product/dyna-fab-6-height-fan-stack/
/product/tower-components-opti-bar-splash-fill/
```

Fetch each page and save it as `before-N.html`.

### Step 3: dry run

Run:

```
node node_modules/payload/bin.js run src/content/import/cli.ts -- catalog-seed /tmp/catalog-dry
```

**STOP GATE.** Compare `/tmp/catalog-dry/catalog-seed-summary.json` with these values. They are the accepted authority's numbers, reproduced locally from a fresh import:

| Key | Expected |
|---|---|
| `mode` | DRY_RUN |
| `productRoutes` | 183 |
| `categoryRoutes` | 43 |
| `productsCreate` | 183 |
| `productsUpdate` / `productsHeldConflict` | 0 / 0 |
| `categoriesCreate` | 43 |
| `manufacturersCreate` | 14 |
| `productsWithManufacturer` / `productsWithoutManufacturer` | 159 / 24 |
| `productsWithCategory` / `productsWithoutCategory` | 137 / 46 |
| `ambiguousCategorySlugs` | 0 |

**Any other value means STOP.** This is the same gate as the author alias. Send the four files in `/tmp/catalog-dry/` back to Control Tower and do not apply. A difference can be legitimate, for example an editor publishing or withdrawing a product page since the import, but it is a decision, not something to apply blind.

### Step 4: apply

Run:

```
node node_modules/payload/bin.js run src/content/import/cli.ts -- catalog-seed /tmp/catalog-apply --apply
```

The summary must equal the dry run, with `mode: APPLY`.

### Step 5: idempotency check

Run the apply command again, writing to `/tmp/catalog-rerun`.

Expected: `changes: 0`, `productsUnchanged: 183`, `categoriesUnchanged: 43`, `manufacturersExisting: 14`.

### Step 6: no public rendering change

Fetch the same 5 pages as `after-N.html`, then run:

```
python3 ops/crm-golive/html-identity.py before-*.html after-*.html
```

Each before/after pair must print the same hash.

Raw bytes differ on **every** request, even with no change at all, for two reasons:

- the per-request CSP nonce;
- Next streams the metadata and flight chunks in a nondeterministic order.

The tool therefore compares the rendered page: nonce removed, flight scripts dropped, head elements as a set, and the body in order. The local rehearsal showed byte-different raw HTML and identical rendered hashes for all 5 pages: unseeded, seeded, and reseeded after a deletion.

### Report files

| File | Content |
|---|---|
| `catalog-seed-ledger.tsv` | Every record: action, changed fields, categories, category evidence, manufacturer terms |
| `catalog-unlinked-manufacturer.tsv` | Every product without a manufacturer, with the reason: `NO_BRAND_TERM_IN_ESTATE` (22) or `MULTIPLE_BRANDS_ON_ONE_RECORD` (2) |
| `catalog-without-category.tsv` | The 46 products the estate never shows under a category page |

### What editors see

The admin group **Products** contains **Products**, **Product categories** and **Manufacturers**. A seeded product opens with an **Edit page content** box linking to its page record.

Seeded products hide the page-owned fields:

- narrative;
- specifications;
- media;
- documents;
- related items;
- SEO.

Seeded products refuse changes from anyone but the seed to:

- title;
- slug;
- address;
- route link;
- categories.

Catalog truth work stays editable: manufacturer evidence, identifiers and review states.

Who sees the group: every content reader, which is platform-admin, client-admin, editor, search-analyst, sales and viewer. Writes are limited to platform-admin, client-admin and editor; deletes to admins.

---

## Pass 2: hosted synthetic intake proof on staging

### Preconditions

- Pass 0 is applied.
- Pass 3's synthetic Admin exists, because Pass 2 reads results back as that user.
- Commander generates a **staging-only** test secret of at least 24 characters, stores it in the secrets location, and never prints it.

### Step 1: enable ingest for this run only

Set these on staging and restart:

| Variable | Value |
|---|---|
| `H2O_CRM_TYPEFORM_WEBHOOK_SECRET` | The staging test secret |
| `H2O_CRM_TYPEFORM_FIELD_MAP` | The JSON of `F22CAGX3_RECOMMENDED_FIELD_MAP` (`src/crm/intake/typeform/config.ts`) |
| `H2O_CRM_TYPEFORM_INGEST_ENABLED` | `1` |
| `H2O_TYPEFORM_FORM_ID` | Unchanged (`F22cAgx3`) |

**No Typeform webhook points at staging.** The payloads are synthetic and signed locally.

### Step 2: run the deliveries and checks

```
H2O_PASS2_BASE_URL=https://<staging-host> H2O_PASS2_SIGNING_SECRET=… \
H2O_PASS2_ADMIN_EMAIL=… H2O_PASS2_ADMIN_PASSWORD=… \
node ops/crm-golive/pass2-synthetic-intake.mjs > pass2.json
```

### Step 3: turn ingest off and confirm

Set `H2O_CRM_TYPEFORM_INGEST_ENABLED=0`, restart, then run:

```
H2O_PASS2_BASE_URL=https://<staging-host> node ops/crm-golive/pass2-synthetic-intake.mjs --verify-off
```

Expected: `OFF PASS` (404).

### Step 4: no email and no PII in the logs

Over the Pass 2 window, grep the container logs. Both counts must be 0:

- lines containing `pass2.` or `@example.test`;
- console-email output, i.e. any `email` line other than Payload's start-up "No email adapter" warning.

### Expected results

The local rehearsal against a synthetic copy gave 24/24 PASS plus OFF PASS.

| Check | Scenario | Expected |
|---|---|---|
| P0 | Precondition | The seeded product exists |
| S1 | Product RFQ (page `header_action` + slug + id) | 200 PROCESSED |
| S2 | Editorial RFQ (`editorial_inline`) | 200 PROCESSED |
| S3 | Category-card RFQ (`category_and_family`) | 200 PROCESSED |
| S4 | Replay, same bytes | Second delivery 200 `DUPLICATE_DELIVERY_NOOP` |
| S5 | Same response, new event id | 200 `DUPLICATE_SUBMISSION_LINKED` |
| S6 | Bad signature, unsigned, wrong content type, oversized | 401, 401, 415, 413 |
| S7 | Signed malformed body | 200 `QUARANTINED_MALFORMED`, no RFQ |
| S8 | Suppressed contact | Suppression 201, RFQ 200 PROCESSED |
| S9 | Same address, different name | Second RFQ `PROCESSED_WITH_REVIEW` |
| S10 | Product fields on an editorial placement | `PROCESSED_WITH_REVIEW` |
| R0 | Every reply | `no-store`; body has `outcome` (+ `rfq_number`) only |
| C1 | S1 item | Product linked by exact slug (`RESOLVED_EXACT_SLUG`) |
| C2 | S3 | Same product linked; `page_path` = the listing |
| C3 | S2 | Attribution kept, no item |
| C4 | S10 | No item; Needs review |
| C5 | S9 | Unlinked, with an `EMAIL_MATCH_NAME_MISMATCH` review OPEN |
| C6 | S8 | Suppression still APPLY; eligibility not granted |
| C7 | S4/S5 | Exactly one RFQ |
| C8 | Marker | 8 RFQs carry the run's SYNTHETIC marker |
| C9 | Rejected deliveries | Stored nothing |
| C10 | Notification state | `NOT_SENT_DISABLED_IN_CRM1` on all |
| L1 | Anonymous CRM REST | 401/403 |
| L2 | Leakage | The marker is in none of `/`, `/contact-us/`, the product page, the listing, `/resources/`, `/sitemap.xml`, `/robots.txt`, `/search/` |

The synthetic records stay in the validation database, flagged by `SYNTHETIC PASS2 <run>`. Removing them is cutover condition 4, which is separately authorised.

---

## Pass 3: signed-in roles and UI review on staging

### Users

Commander creates 3 synthetic users on the validation DB (an authorised write):

- Admin (`client-admin` or `platform-admin`);
- Sales (`sales`);
- non-CRM (`viewer` or `editor`).

Credentials go only into the protected secrets location.

### Automated part

Read pages and REST refusals only:

```
PW_MODULE=<playwright> H2O_PASS3_BASE_URL=https://<staging-host> \
H2O_PASS3_ADMIN_EMAIL=… H2O_PASS3_ADMIN_PASSWORD=… H2O_PASS3_SALES_EMAIL=… H2O_PASS3_SALES_PASSWORD=… \
H2O_PASS3_NONCRM_EMAIL=… H2O_PASS3_NONCRM_PASSWORD=… [H2O_PASS3_ACCOUNT_ID=…] \
node ops/crm-golive/pass3-ui-review.mjs pass3-out
```

Expected: every check PASS. The local rehearsal gave 71/71.

**At each viewport (1440 / 1024 / 390, Admin and Sales):**

- My Work, Inbox, split or detail, full detail, Activity, Follow-ups, Pipeline, New inquiry and Account render;
- 0 console errors and 0 horizontal page overflow;
- the SYNTHETIC DATA badge is present;
- no generic "Open", "View" or "Inquiry" links (M4);
- no "Due ·" without a date (M1);
- no raw `CODE_WORDS` in the activity timeline (M7);
- New inquiry fields carry `aria-required` (M6);
- typing `jk` in search never moves the focus (shortcuts are never active while typing).

**Desktop:** no inbox column is cut off, whether in split view or below 1440 (M2).

**Phone:**

- inbox cards show the company, status and owner (M3);
- the page title is not truncated;
- there is no Technical tab (M5).

**Non-CRM user:** `/crm/`, `/crm/rfqs/` and `/crm/pipeline/` land on `/crm/denied/`. Signed out, `/crm/rfqs/` goes to `/admin/login`.

**REST role probes (refusals, so nothing is written):**

- Sales cannot resolve an identity review (403; the review stays OPEN);
- Sales cannot clear a suppression (403 `SUPPRESSION_CLEAR_PRIVILEGED`);
- Sales cannot reopen a terminal RFQ (probed when one exists);
- DELETE of an RFQ is refused for Admin, Sales, non-CRM and anonymous, and the RFQ still exists;
- a non-CRM user reading through REST gets 403.

### Human checklist

Compare against the UI-1 Figma design authority. Record PASS/HOLD with a screenshot for each item.

1. Layout and clipping at 1440 / 1024 / 390. Use the automated screenshots for: inbox, split, detail, phone cards and phone detail.
2. Empty, loading and error states:
   - an empty Follow-ups tab ("No follow-ups due today.");
   - an empty Pipeline;
   - the loading skeleton (throttle the network);
   - the module error line, when it can be provoked safely; otherwise accept the DB-suite evidence.
3. Keyboard:
   - Tab order through My Work, Inbox and detail;
   - visible focus;
   - `j` / `k` / `a` / `r` / `n` / `t` and `/` work on the inbox and detail;
   - none of them fire inside inputs;
   - dialogs trap focus and return it.
4. Contrast. Tokens are unchanged by this patch. New text uses `--c-text-2` on white (≈ 5.4:1).
5. Sales, in the UI:
   - no "Resolve (admin)" on an identity review;
   - no "Reopen" on a closed RFQ;
   - no clear-suppression control.
6. Close one synthetic RFQ as Sales, then rerun the automated part so the reopen probe runs.
7. D-1: the Pass 2 RFQs' first-response tasks show a due date at the end of the next Denver business day after receipt, as a weekday date in My Work, Follow-ups and the detail. Older undated tasks read "No due date".

**Out of scope:** UI-2 and UI-3 features. These are listed as post-launch in the return report.

---

## D-1: first-response due date

**Rule (owner decision 2026-10-02).** A new first-response task is due at the **end of the next Denver business day**:

- business days are Monday–Friday in America/Denver;
- an arrival on a business day before 17:00 Denver counts from that day;
- an arrival at or after 17:00, or on a Saturday or Sunday, counts from the next business day;
- "end of day" is 23:59:59.999 Denver time, DST-correct.

| Arrival (Denver) | Due (end of) |
|---|---|
| Mon 10:00 | Tue |
| Mon 17:00 or later | Wed |
| Fri 10:00 | Mon |
| Fri 17:00 or later | Tue |
| Sat or Sun | Tue |

**Known limitations:**

- there is no holiday calendar, so a public holiday counts as a business day;
- 17:00 is the after-hours cut-off (`BUSINESS_DAY_CLOSE_HOUR` in `src/crm/workspace/time.ts`).

**Where it applies.** The rule is used where the task is created (`src/crm/collections/rfqs.ts`), for website and manual inquiries alike. "Due today", "Overdue", the My Work strip and the task rows read that date. Reassigning the RFQ moves the task and keeps its date.

**No backfill.** First-response tasks created before the delta keep no due date. They still appear under "Due today" with the words "No due date", and are never shown as overdue. To report how many there are, run this read-only count after deploying, as the synthetic Admin. The `totalDocs` value is the count to report:

```
GET /api/crm-tasks/?limit=0&depth=0&where[kind][equals]=RFQ_FIRST_RESPONSE&where[due_at][exists]=false&where[status][in]=OPEN,IN_PROGRESS
```

The local staging rehearsal database had 32 such tasks, all synthetic, from the Pass 2 rehearsals.

---

## Owner checklist: Typeform F22cAgx3, before PRODUCTION intake

This is **not needed for staging**, where Pass 2 uses signed synthetic payloads. Do these in Typeform before the production webhook is switched on (Production plan step 2).

### 1. Add these 11 hidden fields to F22cAgx3

Type each name exactly as shown: lower case, underscores, no spaces.

| # | Hidden field name |
|---|---|
| 1 | `product_id` |
| 2 | `product_slug` |
| 3 | `product_path` |
| 4 | `product_title` |
| 5 | `page_path` |
| 6 | `cta_placement` |
| 7 | `utm_source` |
| 8 | `utm_medium` |
| 9 | `utm_campaign` |
| 10 | `utm_term` |
| 11 | `utm_content` |

**Where to add them.** Open form **F22cAgx3** and go to its **hidden fields** setting (in Typeform's form editor, under Logic / personalization). Add the 11 names, then **Publish** the form.

Do not reference them in any question, and do not change anything else. The website already sends these values; Typeform keeps them only when the form declares them.

### 2. Confirm the field references

Typeform gives each question a "reference". The CRM maps answers by these references. Check that each question below still has the reference shown. A question that was deleted and re-created gets a new reference; if any differ, send the new one to Control Tower.

| # | Question (as the visitor sees it) | Reference | CRM field |
|---|---|---|---|
| 1 | What is your email address? | `b6ece272-ea30-4057-a574-03c8d882297b` | email |
| 2 | Can I get your first name? | `2a84669b-f0a9-4f64-8eb5-2819e7f8c763` | first name |
| 3 | And your last name? | `1ed32286-7b31-43b2-b1ca-0a99401d8aa5` | last name |
| 4 | … What company are you with? | `384b27476ca4d24a` | company |
| 5 | … What are you interested in: | `9216a914-ff0a-4936-b6c0-a579038177f4` | interest |
| 6 | What Part are you interested in? | `612225a8-b3ab-4cd2-af2d-a76a23d8cfc8` | part |
| 7 | Please provide any information you have on … | `8f243989-0e8f-4d2e-b1e7-97490ab85b2f` | part details |
| 8 | Is this Urgent Part Quote Request? | `0b22caef-5cb3-4db3-a00b-455a77824316` | urgency |
| 10 | Please let us know your phone number | `b79f1743-d223-4960-809b-feafba7b4480` | phone |
| 11 | Can you please let us know the Country of Destination? | `b543840d-da8f-46ea-9b0a-4f59d3c06307` | destination country |
| 12 | Anything else you'd like us to know? | `55e58066-d55c-4a2c-a749-8a63cebf542c` | message |

Question 9 (file upload) is deliberately not mapped: files stay in Typeform.

### 3. Tell Control Tower when done

Report that the hidden fields are published and that the references are confirmed, or list any reference that differs. Do **not** create the webhook yet; Commander does that at cutover, disabled first.

---

## Production enablement plan

This plan is documentation only; **do not execute** it before the owner's GO.

1. **Production secret.**
   - Generate a new random secret of at least 32 characters in the production secret store. Never reuse the staging secret.
   - Set `H2O_CRM_TYPEFORM_WEBHOOK_SECRET` in the production environment.
   - Set `H2O_CRM_TYPEFORM_FIELD_MAP` to the confirmed F22cAgx3 map.
   - Keep `H2O_CRM_TYPEFORM_INGEST_ENABLED=0`.
   - Deploy and confirm `POST /api/crm/intake/typeform/` returns 404.
2. **Owner action in Typeform (F22cAgx3).**
   - Confirm the field refs still match the map.
   - **Add the 11 hidden fields** (OI-02); see the owner checklist above.
   - Create the webhook to `https://h2ocooling.com/api/crm/intake/typeform/`, with the same secret.
   - Leave it **disabled**.
3. **Flip ingest.** Set `H2O_CRM_TYPEFORM_INGEST_ENABLED=1` and restart. The endpoint now answers 401 to an unsigned POST, which proves it is live and fail-closed. Then **enable** the Typeform webhook.
4. **First real-RFQ check.** On the next real submission:
   - Typeform's webhook log shows **200**;
   - the CRM inbox shows the RFQ with page, placement and product context;
   - the intake event is PROCESSED or PROCESSED_WITH_REVIEW;
   - nothing is in the server log but codes and ids;
   - no email of any kind was sent.

   **Owner-approved: exactly one Typeform "Send test request"** (webhook settings in Typeform), right after the webhook is enabled. It must show 200 in Typeform's delivery log and create one RFQ. An Admin then flags that RFQ:
   - add the note `TYPEFORM TEST REQUEST: owner-approved cutover check, not a customer`;
   - close it as **Not core business**, with the same reason.

   It stays in the CRM as evidence and is never contacted. No submission is made on the public form itself.
5. **Rollback (at any moment).**
   - Disable the webhook in Typeform. Typeform then holds and retries nothing further.
   - Set `H2O_CRM_TYPEFORM_INGEST_ENABLED=0` and restart, so the endpoint answers 404.
   - The public form keeps working: Typeform still stores every response. Responses received while the webhook was off are not delivered automatically later; staff take them from Typeform's response list (manual inquiry). This patch has no backfill tool.
   - No CRM data is deleted.
