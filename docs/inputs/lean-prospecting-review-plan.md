# Syed.ai Lean Prospecting System

## Review Brief, Current State and Implementation Roadmap

**Status:** Proposed for technical, security, deliverability and business review  
**Date:** September 4, 2026  
**Owner:** Syed.ai  
**Companion analysis:** `syed-ai-prospecting-automation-deep-dive.md`

---

## 1. Purpose of this document

This document records:

1. What Syed.ai is trying to accomplish.
2. What has already been built and reviewed.
3. What is missing or unsafe in the current system.
4. The proposed lean, self-hosted architecture.
5. Why HubSpot and other heavyweight products are not part of the revised plan.
6. The implementation roadmap, acceptance criteria, costs and risks.
7. The decisions that need reviewer approval before implementation.

It is intended to be handed to a technical reviewer, security reviewer, RevOps consultant, deliverability specialist or implementation partner.

This is a planning document. No accounts have been connected, no campaign has been activated, no messages have been sent, and no external software has been installed as part of this review.

---

## 2. The outcome Syed.ai wants

Syed.ai wants a prospecting system that produces qualified sales meetings with almost no recurring administration.

The desired system should:

- Find companies and decision-makers that match Syed.ai’s ideal customer profile.
- Monitor newly registered or newly expanded Florida businesses through the official Sunbiz daily data feed.
- Discover and verify work-email addresses through a licensed source.
- Research each company using public, attributable information.
- Retain the URL and observation date behind every personalized statement.
- Score prospects for fit, timing and evidence quality.
- Generate concise, truthful outreach.
- Send cold email automatically at reputation-safe volumes.
- Stop sequences automatically when a prospect replies, opts out, bounces or books.
- Classify replies and handle only safe, predictable responses automatically.
- Send a booking link and add confirmed meetings to Syed’s calendar.
- Maintain one canonical history of leads, messages, replies, suppression and meetings.
- Produce funnel and system-health reporting automatically.
- Require no spreadsheet updates, copying/pasting, routine follow-up or daily outcome logging.

The target recurring human workload is:

- **No daily operational work.**
- **Approximately 15–30 minutes per week** for exceptional or commercially important replies.
- Sales meetings themselves are not counted as administrative work.
- An optional, human-operated LinkedIn lane may add 10–20 minutes per week.

### Commercial context

Syed.ai currently presents services around GEO/AEO and AI-search visibility, technical/content SEO, and lifecycle/outbound email. The site describes DTC, B2B SaaS and multi-location service businesses as likely clients. Public offer prices include a $4,500 audit, a $9,800/month Answer Engine Program and a $6,400/month Owned Channel Build. The prospecting system should optimize for qualified conversations and account longevity—not maximum message volume. [Syed.ai](https://syed.ai/)

---

## 3. Non-negotiable operating constraints

### 3.1 LinkedIn

Unattended LinkedIn connection requests and messages are not part of this design.

LinkedIn’s current rules prohibit third-party bots or automation that add contacts, send messages, scrape the service or simulate interaction. Sales Navigator APIs are restricted to approved partners, and Microsoft’s current documentation says the program is not accepting new partners. Purchasing a Sales Navigator plan does not automatically provide a connection-request or message-sending API. [LinkedIn prohibited-software policy](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions?lang=en), [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement), [Sales Navigator APIs](https://learn.microsoft.com/en-us/linkedin/sales/)

The system may store a LinkedIn profile URL or prepare a manual task. It must not:

- Run a headless browser against LinkedIn.
- Share credentials, sessions or cookies.
- Use an extension that sends or scrapes.
- Use undocumented LinkedIn endpoints.
- Simulate human clicks or rotate residential proxies.
- Attempt to evade restrictions or rate limits.

### 3.2 Factual personalization

No model may invent a company event, competitor, AI-search result, technology, hiring signal or business problem. Every personalized statement must be linked to retained evidence containing at least:

- Source URL.
- Observation timestamp.
- Evidence type.
- Short normalized fact.
- Confidence.
- Expiration date or freshness policy.

If the system does not have sufficiently fresh evidence, it must use a truthful generic message or decline to send.

### 3.3 Public-registry data

Florida public filings may be used as a sourcing and timing signal, subject to applicable privacy, marketing and provider terms. Public availability does not make every filing party a suitable prospect.

- Use the Florida Division of Corporations’ official bulk downloads rather than scraping the Sunbiz search website.
- Treat listed officers, directors, managers and authorized members as filing parties—not automatically as verified beneficial owners.
- Never treat a registered agent as the business owner unless a separate, reliable source confirms an operating role.
- Do not retain residential street addresses, FEI numbers or other registry fields that are unnecessary for prospecting.
- Do not mention a residential address or create “we saw your filing” messaging that feels invasive.
- Resolve people through a licensed business-data provider or other permitted public source. A resolved LinkedIn URL may be stored, but the system may not scrape or automate LinkedIn.

The Florida Division of Corporations publishes free daily corporate filings and corporate-event files on workdays. Its records can include filing date, status, registered agent, and current officer/director/manager names and titles. [Official daily data](https://dos.fl.gov/sunbiz/other-services/data-downloads/daily-data/), [data usage guide](https://dos.fl.gov/sunbiz/other-services/data-downloads/data-usage-guide/), [corporation-record field guide](https://dos.fl.gov/sunbiz/search/guides/corporation-records/)

### 3.4 Consent, suppression and jurisdiction

An unsubscribe, complaint, hard bounce, do-not-contact request or legal objection must suppress future action across every sequence and optional channel.

The initial pilot should be limited to US business contacts. Canada should remain excluded until the system can document the applicable CASL consent basis. UK/EU outreach should remain excluded until lawful-basis, PECR/ePrivacy, notice and data-retention decisions are reviewed. CAN-SPAM applies to US B2B commercial email and requires accurate identity and subject information, a physical address, a clear opt-out and timely processing. [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business), [ICO B2B marketing guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/), [Canadian CASL guidance](https://crtc.gc.ca/eng/internet/anti/reg.htm)

### 3.5 Security and data minimization

- Store only the information required to source, contact, suppress and measure a prospect.
- Keep administrative interfaces private.
- Expose only narrow webhook endpoints to the public internet.
- Do not store provider credentials in source code, workflow exports or logs.
- Do not retain full website snapshots or raw inbox content indefinitely.
- Do not log message bodies or API secrets in normal application logs.
- Encrypt backups and test restoration.

---

## 4. What exists today

The supplied materials include:

- A prospecting-agent brief and operating concept.
- A multi-sheet Excel tracker covering leads, prompts, sequences, cadence, touches, suppression and metrics.
- A Python application backed by SQLite.
- CSV and copied-Sales-Navigator import paths.
- Basic homepage/blog enrichment.
- Rule-based scoring.
- AI-assisted first-touch LinkedIn drafting.
- A local daily outreach queue.
- Manual suppression and touch logging.

### 4.1 Verified application capabilities

The current code can:

- Create and migrate a local SQLite database.
- Import manually supplied lead data.
- Store companies, leads, signals, drafts, touches, suppression, AI runs and queue items.
- Fetch a company homepage and a guessed blog page.
- Apply simple scoring rules.
- Call an AI provider to draft an initial note, with a fallback template.
- Construct a queue for manual LinkedIn work.
- Record manually entered outcomes.
- Display basic funnel metrics.

### 4.2 What it does not currently do

The current code does not:

- Automatically source leads.
- Discover or verify work email.
- Send email.
- Send LinkedIn connection requests, messages or InMail.
- Ingest replies from an inbox.
- Classify replies.
- Stop sequences based on inbox events.
- Present available meeting times or a booking page.
- Create or update calendar events.
- Integrate with a CRM.
- Run scheduled background jobs.
- Provide production authentication, authorization or TLS.
- Provide durable retries, idempotency or a dead-letter queue.
- Provide backups, monitoring or a restoration procedure.
- Provide automated tests.

### 4.3 Important defects and contradictions already identified

- The brief implies a stronger web stack than the archive contains. The implementation uses Python’s standard-library threaded HTTP server and vanilla JavaScript, not FastAPI/HTMX.
- The application’s “InMail used this month” metric counts all InMail records rather than the current month. A separate queue helper uses calendar-month logic, so the application contradicts itself.
- The workbook also calculates remaining InMail from an all-time count.
- The workbook can mark AI-visibility research ready after four runs, while its own instructions call for four prompts across four assistants—16 runs.
- Workbook and application follow-up rules do not match.
- Company identity is based on an exact name instead of a canonical root domain.
- Email does not exist in the current lead schema.
- Touches lack the uniqueness and provider-event keys needed to prevent duplicate actions.
- The draft-approval field is not enforced by the queue.
- Placeholder follow-up copy can reach the queue without a blocking validator.
- The user interface fails to preserve the final edited message text in one logging path.
- `ai_runs` and mailbox configuration exist but are not connected to a working research or email workflow.
- Broad import exception handling can mislabel database errors as duplicate rows.
- Fetched website text is not strongly isolated from AI instructions, creating a prompt-injection risk.
- The archive contains no automated tests.

### 4.4 Current source-of-truth problem

The workbook and SQLite application both represent stages, touch history, cadence, suppression and metrics. Running both as operational systems will cause drift.

**Revised decision:** the hardened Syed.ai application database will become the canonical source of truth. The workbook will be archived after migration and reconciliation. n8n will orchestrate events but will not own business records.

---

## 5. Revised design principles

The earlier review recommended Apollo Professional, HubSpot and n8n Cloud because that stack minimized custom operational work. The revised requirement prioritizes low cost, minimal services, security and source availability.

The new principles are:

1. **Do not replace HubSpot with another full CRM.** Extend the existing application into the small amount of CRM functionality this operation actually needs.
2. **One operational database.** Leads, evidence, messages, events, suppression and meetings live in one application database.
3. **n8n moves events; it does not own truth.** A workflow can be rebuilt without losing prospecting history.
4. **Use external SaaS only where it provides something open-source software cannot safely manufacture:** licensed contact data, work-email verification and mailbox delivery.
5. **Keep the AI optional.** Deterministic templates and validators should continue working when a model is unavailable.
6. **Prefer one-user components.** Avoid team-oriented CRM, SSO, Redis, Kubernetes and distributed workers until metrics prove they are needed.
7. **Avoid a self-hosted mail server.** Deliverability, abuse handling, DNS reputation and blocklist operations are not a sensible place to save a few dollars.
8. **Use released, pinned upstream images or packages.** Do not copy large third-party codebases into the Syed.ai repository.
9. **Design an exit path.** Every record can be exported as SQL/CSV/JSON with provider IDs and evidence intact.

---

## 6. Proposed lean architecture

```text
Lead sources
Apollo Free + official Sunbiz daily feed
          │ scheduled API/search
          ▼
┌─────────────────────────────┐
│ n8n Community Edition       │
│ timers, webhooks, retries,  │
│ Gmail and Calendar events   │
└──────────────┬──────────────┘
               │ authenticated internal API
               ▼
┌──────────────────────────────────────────┐
│ Syed.ai Prospect Service                 │
│ FastAPI + HTMX                           │
│                                          │
│ identity • evidence • scoring • drafts   │
│ suppression • pipeline • exception UI    │
│ reply policy • meetings • reporting      │
└────────────────────┬─────────────────────┘
                     │
                SQLite/WAL
              canonical data
                     │
          encrypted off-host backup

Validated enrollment ──► Gmail/Workspace
                              │
                      incoming reply event
                              ▼
                 n8n → classifier/policy
                    │                  │
                    │ safe positive    │ ambiguous
                    ▼                  ▼
        Google booking link       Exception queue
                    │
                    ▼
          Google Calendar event
                    │
                    ▼
       meeting record + sourced brief

Public HTTPS: Caddy exposes only webhook/booking endpoints.
Private access: n8n editor and prospect administration UI.
```

### 6.1 Exact initial stack

| Component                            | Responsibility                                                                      | License/cost                                                             | Decision                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| n8n Community Edition                | Schedules, provider/API calls, webhooks, retries and routing                        | Free for internal business use; source-available Sustainable Use License | Use                                                                             |
| Syed.ai prospect service             | CRM subset, evidence, scores, messages, suppression, exceptions and metrics         | Syed.ai-owned Python code                                                | Build from existing application                                                 |
| FastAPI + HTMX                       | Authenticated API and small server-rendered interface                               | Open source                                                              | Use                                                                             |
| SQLite in WAL mode                   | Canonical business database                                                         | Public domain                                                            | Use through the pilot and early operation                                       |
| Caddy                                | HTTPS and reverse proxy                                                             | Apache-2.0                                                               | Use                                                                             |
| Restic and/or Litestream             | Encrypted backup and SQLite replication                                             | BSD-2-Clause / Apache-2.0                                                | Use; exact backup target decided during setup                                   |
| Gmail or Google Workspace            | Mail delivery and inbox                                                             | Existing service or paid account                                         | Use; do not self-host SMTP                                                      |
| Google Calendar appointment schedule | Booking page and calendar conflict handling                                         | Available on Google Calendar; premium features depend on account         | Use before adding another scheduler                                             |
| Apollo Free                          | Licensed contacts and email enrichment for a small pilot                            | Free credit-limited plan                                                 | Use for the 25-lead pilot; validate API/credit access                           |
| Florida Sunbiz daily downloads       | Free weekday filings/events for Florida corporations, LLCs and limited partnerships | Free official public data                                                | Add as a separate acquisition-signal lane; parse in the existing Python service |
| GPT-5.6 Luna                         | Optional structured drafting/classification                                         | Usage-based, currently $0.20/M input and $1.20/M output tokens           | Use by default because operational cost is negligible                           |
| Ollama                               | Optional local-model runtime                                                        | MIT                                                                      | Test only if local processing is a firm requirement                             |

n8n describes its software as fair-code/source-available, not OSI-approved open source. Its free Community edition can be self-hosted indefinitely, and internal business automation is an allowed use. [n8n repository](https://github.com/n8n-io/n8n), [Community edition](https://docs.n8n.io/hosting/community-edition-features/), [license explanation](https://docs.n8n.io/sustainable-use-license/)

Google Calendar’s appointment schedules can provide a booking page, block conflicts and create events without another scheduling product. Even personal Google accounts can create one basic booking page; eligible Workspace plans add premium features. [Google appointment schedules](https://support.google.com/calendar/answer/190998?hl=en)

The Sunbiz lane requires no additional runtime service. n8n triggers one daily import; the prospect service downloads and parses the state’s fixed-width files, stores a checksum and minimum necessary fields, and sends only qualified records into normal enrichment. The state offers daily and quarterly data for free and explicitly describes custom programs/databases as supported ways to process it. [Sunbiz data downloads](https://dos.fl.gov/sunbiz/other-services/data-downloads/), [Sunbiz data usage guide](https://dos.fl.gov/sunbiz/other-services/data-downloads/data-usage-guide/)

### 6.2 Deployment shape

The lightest production shape is a single always-on Linux host running:

- `caddy`
- `prospect-service`
- `n8n`
- A backup job or Litestream process

No Redis, Kubernetes, message broker or separate CRM database is required initially.

The deployment can run on:

1. **An existing always-on machine:** zero incremental hosting cost, but availability, power, networking and physical security become Syed.ai’s responsibility.
2. **A small VPS:** generally more reliable and simpler for inbound HTTPS, but no longer zero cost.

The database should remain on local block storage—not a network filesystem. SQLite must use WAL mode, foreign keys, a busy timeout and a controlled write path. Move to managed PostgreSQL only when concurrency, multi-user access, database size or audit requirements justify it.

---

## 7. Why there is no HubSpot or replacement CRM

HubSpot is not technically required for a one-person outbound operation. The necessary business objects are limited:

- Company.
- Contact.
- Campaign membership.
- Evidence.
- Message/touch.
- Reply.
- Suppression.
- Meeting.
- Opportunity/outcome.

The existing application already contains early versions of most of these concepts. Adding reliable identity, email, evidence, event and suppression tables is smaller and more controllable than integrating a full CRM.

### Alternatives considered

| Alternative  | Why it is not selected now                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HubSpot Free | Useful hosted CRM, but adds another canonical store and synchronization surface. The lean system does not need its broader feature set.                                                                                     |
| Twenty CRM   | True open-source CRM, but its stack includes NestJS, React, PostgreSQL, Redis and BullMQ. It is unnecessarily heavy for one operator. [Repository](https://github.com/twentyhq/twenty)                                      |
| PocketBase   | Very light, MIT-licensed, single-binary backend, but it duplicates the application’s SQLite/API layer and remains pre-1.0 without guaranteed backward compatibility. [Repository](https://github.com/pocketbase/pocketbase) |
| Baserow      | API-first and self-hosted, but introduces a substantial Django/PostgreSQL application for a problem already covered by the prospect service. [Repository](https://github.com/baserow/baserow)                               |
| NocoDB       | Convenient table UI, but it moved to a Sustainable Use license in 2026 and still duplicates the core database/admin function. [License](https://github.com/nocodb/nocodb/blob/develop/LICENSE.md)                           |

The prospect service should expose CSV/JSON export and provider IDs so a future migration to HubSpot, Twenty or another CRM remains straightforward.

---

## 8. Repositories and reuse policy

### 8.1 Approved building blocks

| Repository                                                                            | License         | Proposed use                               | Reuse method                                                            |
| ------------------------------------------------------------------------------------- | --------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| [n8n-io/n8n](https://github.com/n8n-io/n8n)                                           | Sustainable Use | Workflow orchestration                     | Pin an official released Docker image; do not fork                      |
| [caddyserver/caddy](https://github.com/caddyserver/caddy)                             | Apache-2.0      | Reverse proxy and automatic HTTPS          | Pin official package/image                                              |
| [benbjohnson/litestream](https://github.com/benbjohnson/litestream)                   | Apache-2.0      | Continuous SQLite replication              | Pin released binary/image if chosen                                     |
| [restic/restic](https://github.com/restic/restic)                                     | BSD-2-Clause    | Encrypted backup and restore verification  | Pin released binary; schedule through host or n8n                       |
| [louislam/uptime-kuma](https://github.com/louislam/uptime-kuma)                       | MIT             | Optional uptime and certificate monitoring | Add only after core launch if an external monitor is unavailable        |
| [ollama/ollama](https://github.com/ollama/ollama)                                     | MIT             | Optional local-model runtime               | Run separately; never make core actions depend on it without evaluation |
| [alextselegidis/easyappointments](https://github.com/alextselegidis/easyappointments) | GPL-3.0         | Optional production self-hosted scheduler  | Use only if Google’s booking page is insufficient                       |

### 8.2 Repositories not to deploy initially

- [Twenty](https://github.com/twentyhq/twenty): too many services for this need.
- [Activepieces](https://github.com/activepieces/activepieces): its recommended deployment brings application, worker, PostgreSQL and Redis containers and asks for at least 4 GB RAM. n8n is the lighter fit. [Activepieces deployment](https://www.activepieces.com/docs/install/options/docker-compose)
- [Windmill](https://github.com/windmill-labs/windmill): strong open-source developer workflow platform, but more code-oriented than needed and dependent on PostgreSQL.
- [Cal.diy](https://github.com/calcom/cal.diy): MIT-licensed, but its own repository currently recommends it for personal/non-production use and warns about the expertise required for secure self-hosting.
- Self-hosted mail-transfer agents: high deliverability and abuse-maintenance burden.
- LinkedIn automation projects: incompatible with the platform-risk requirement.
- Unmaintained “cold email” GitHub projects: uncertain security, opt-out handling and deliverability practices.

### 8.3 Code-reuse rules

Reviewers should require the implementation to:

- Record every dependency, exact version, upstream URL and license.
- Pin images by version and preferably digest.
- Use tagged stable releases, not arbitrary `main` branches.
- Read release notes before upgrade.
- Keep third-party components separate from Syed.ai-owned code.
- Avoid copying snippets when an API, package or container boundary is available.
- Run software-composition and container vulnerability scans.
- Retain all required license and attribution files.

---

## 9. Canonical data model

### 9.1 Company

Canonical key: normalized registrable root domain.

Required fields:

- `id`
- `name`
- `root_domain`
- `aliases`
- `website_url`
- `industry`
- `employee_range`
- `country`
- `source_provider`
- `source_provider_id`
- `fit_score`
- `status`
- `created_at`
- `updated_at`

### 9.2 Contact

Canonical key: normalized verified work email when present; provider ID plus company/title before verification.

Required fields:

- `id`
- `company_id`
- `first_name`
- `last_name`
- `title`
- `email`
- `email_status`
- `email_verified_at`
- `email_provider`
- `country`
- `jurisdiction_policy`
- `linkedin_url`
- `source_provider`
- `source_provider_id`
- `stage`
- `created_at`
- `updated_at`

### 9.3 Registry filing and filing party

The Sunbiz import retains only the minimum data needed for attribution, deduplication and contact resolution.

Registry filing:

- `id`
- `source`: `fl_sunbiz`
- `document_number`
- `entity_name`
- `entity_type`
- `filing_or_event_type`
- `filing_date`
- `effective_date`
- `status`
- `domestic_or_foreign`
- `principal_city`
- `principal_state`
- `raw_file_name`
- `raw_file_checksum`
- `source_url`
- `ingested_at`

Registry party:

- `id`
- `registry_filing_id`
- `normalized_name`
- `reported_title`
- `party_class`: officer, director, manager, authorized member/person, registered agent or unknown
- `is_contact_candidate`
- `resolution_status`
- `resolved_contact_id`
- `resolution_provider`
- `resolution_confidence`
- `resolved_at`

Unique constraint: source plus document number plus filing/event type plus filing date. Registered-agent-only parties are not contact candidates. Residential street addresses and FEI numbers are discarded during parsing rather than stored.

### 9.4 Evidence

- `id`
- `company_id` or `contact_id`
- `evidence_type`
- `normalized_fact`
- `source_url`
- `observed_at`
- `excerpt_hash`
- `confidence`
- `expires_at`
- `collector_version`

Evidence rows are immutable. New observations create new rows.

### 9.5 Campaign membership

- `id`
- `contact_id`
- `campaign_version`
- `persona`
- `offer`
- `status`
- `enrolled_at`
- `next_action_at`
- `stop_reason`
- `sender_mailbox`

Unique constraint: one active membership per contact and campaign version.

### 9.6 Message

- `id`
- `membership_id`
- `channel`
- `touch_number`
- `subject`
- `body`
- `content_hash`
- `template_version`
- `prompt_version`
- `model_version`
- `evidence_ids`
- `validation_status`
- `provider_message_id`
- `scheduled_at`
- `sent_at`
- `delivery_status`

Unique constraint: membership, channel, touch number and template version.

### 9.7 Event

- `id`
- `provider`
- `provider_event_id`
- `event_type`
- `occurred_at`
- `received_at`
- `payload_hash`
- `idempotency_key`
- `processing_status`
- `attempt_count`
- `last_error`

Unique constraint: provider plus provider event ID.

### 9.8 Suppression

- `id`
- `scope`: email, contact, domain, company or global
- `normalized_subject`
- `reason`: unsubscribe, complaint, hard bounce, DNC, legal objection, manual or policy
- `source`
- `jurisdiction`
- `legal_basis`
- `created_at`
- `expires_at`, normally null for opt-outs
- `created_by`

### 9.9 Reply and meeting

Replies retain provider/thread IDs, intent, confidence, policy action and human override. Meetings retain booking/calendar IDs, campaign attribution, status and eventual opportunity outcome.

---

## 10. End-to-end workflows

### 10.1 Lead intake

1. n8n runs one licensed-source query on a controlled schedule.
2. The source returns a small batch matching an approved ICP, persona and geography.
3. n8n posts each result to the prospect service with a deterministic idempotency key.
4. The service normalizes the root domain and provider IDs.
5. Existing company/contact records are updated rather than duplicated.
6. Suppressed companies, domains, emails and contacts are rejected immediately.
7. Only US business contacts enter the initial research queue.

Failure behavior:

- Retry 429 and transient 5xx responses with exponential backoff and jitter.
- Do not retry invalid requests automatically.
- Move exhausted events to a visible exception queue.
- Never source from LinkedIn through scraping or browser automation.

### 10.2 Sunbiz acquisition-signal lane

This is feasible and fits the lean architecture because Florida provides official bulk files instead of requiring a browser scraper.

Daily flow:

1. On Florida workdays, n8n calls a prospect-service job after the expected publishing window.
2. The service downloads that day’s official corporate-filings and corporate-events files from the Division’s public data portal.
3. It records the upstream filename, date and checksum before parsing.
4. A versioned fixed-width parser validates row length, trims whitespace and joins rows by the state document number.
5. The service keeps newly filed or relevant newly evented profit corporations, LLCs and limited partnerships. Nonprofits and inactive records are excluded from the initial commercial lane.
6. It classifies listed parties by reported title using the state’s title definitions.
7. Registered-agent-only parties are excluded. Officers, directors, managers and authorized members/persons become unresolved contact candidates, not assumed owners.
8. It discards street addresses and FEI numbers; city/state may be retained for entity resolution.
9. The service deduplicates the legal entity against existing company domains, provider IDs and aliases.
10. It attempts to identify the operating brand and website through a licensed company-data provider or permitted search source.
11. A record proceeds only if it has a credible operating website and matches Syed.ai’s ICP. A bare new LLC is not sufficient.
12. Apollo or another licensed provider resolves the filing party using name plus company/domain and may supply work email and LinkedIn URL.
13. Exact-name/company/domain/title/location signals produce a resolution-confidence score. Ambiguous matches are quarantined.
14. Qualified records enter the same evidence, scoring, validation, suppression and email workflow as every other lead.

Best initial segments:

- Foreign profit companies or foreign LLCs newly qualifying to operate in Florida, because the filing may represent expansion by an established business.
- New domestic entities that already have an operating website, a clear commercial offering and evidence of a viable Syed.ai ICP.
- Existing businesses with a new Florida expansion/event signal and a strong website/AI-search opportunity.

Low-priority or excluded records:

- Registered-agent services, law firms or accounting firms appearing only as agents/filers.
- Holding companies, property-specific LLCs and other apparent special-purpose entities.
- Entities with no credible operating domain.
- Nonprofits during the initial commercial pilot.
- Parties whose identity cannot be confidently matched to the operating business.
- Any record where the only usable personalization would reveal a residential address or other unnecessary personal data.

Messaging policy:

- Use the registration as a timing/priority signal, not automatically as the email’s opening line.
- “Expanding into Florida” may be used only when the filing type and independent business evidence support that interpretation.
- “Owner” may be used only when a reliable source establishes that status; otherwise use the person’s confirmed business title.
- Prefer personalization about the operating website, market visibility and Syed.ai’s service relevance.

The official feed is free, generated on workdays and includes corporate filings and corporate events. Its files are fixed-width, can contain multiple rows per document number and occasionally contain malformed rows, so validation and raw-file checksums are required. [Daily corporate data](https://dos.fl.gov/sunbiz/other-services/data-downloads/daily-data/), [data format guidance](https://dos.fl.gov/sunbiz/other-services/data-downloads/data-usage-guide/), [Sunbiz title abbreviations](https://dos.fl.gov/sunbiz/search/guides/corporation-records/title-abbreviations)

#### LinkedIn identity resolution

The system does not search or scrape LinkedIn’s website. It asks a licensed provider such as Apollo to resolve the person and return a candidate LinkedIn URL and work email. Apollo documents APIs for people/company search and enrichment, including retrieving LinkedIn profiles. [Apollo developer documentation](https://docs.apollo.io/)

If the provider cannot resolve the person confidently, the record is skipped or placed in a small human research queue. Even when a LinkedIn URL is found, connecting or messaging remains a manual optional action.

#### Expected value and limitation

Sunbiz is a useful free timing signal, but “newly registered” is not a reliable proxy for budget, employees, product-market fit or need for a high-ticket GEO/SEO engagement. Many new entities will have no operating website or will be special-purpose vehicles. This lane must be measured separately from Apollo’s normal ICP search and stopped if qualified-business yield is poor.

### 10.3 Email enrichment and verification

1. n8n requests work-email enrichment through the licensed provider.
2. The result stores provider, verification status and observation date.
3. The pilot accepts only verified business email.
4. Unknown, catch-all, disposable, free/personal and role addresses are quarantined.
5. Emails older than 30 days are reverified before enrollment.

The system must not attempt large-scale SMTP probing from the application host.

### 10.4 Company research and evidence

1. The prospect service fetches approved public sources with a named user agent, bounded timeouts and response-size limits.
2. It respects access controls and does not attempt authenticated/private pages.
3. HTML is converted into inert text; page instructions cannot alter the research task.
4. Candidate facts are extracted into a strict evidence schema.
5. Deterministic validators require URL, date, type, fact and confidence.
6. Evidence types receive freshness windows.
7. Failed or weak evidence lowers data confidence; it never becomes a fabricated fact.

### 10.5 Scoring

The score contains three independent values:

- **Fit:** industry, business type, size, geography and role.
- **Timing:** current trigger strength and freshness.
- **Data confidence:** identity, email and evidence quality.

Every scoring result stores a rubric version and reason codes. Missing data reduces confidence rather than counting as evidence against the prospect.

### 10.6 Drafting and validation

1. A deterministic template chooses the offer and message structure.
2. An optional model may compress evidence into natural language and classify the best angle.
3. The response must match a strict JSON schema.
4. Every personalized clause references evidence IDs.
5. Deterministic validation blocks unsupported claims, placeholders, stale evidence, excessive length, deceptive identity, prohibited terms and missing compliance text.
6. A model failure produces a safe generic template or no-send result—not an unvalidated message.

GPT-5.6 Luna supports structured outputs and currently costs $0.20 per million input tokens and $1.20 per million output tokens, making it likely cheaper and lighter than maintaining a local model for this small workload. [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna)

### 10.7 Enrollment and sending

The initial system sends through Gmail/Workspace rather than a separate sending platform.

Immediately before every send, the service checks:

- Global suppression.
- Email verification freshness.
- Jurisdiction policy.
- Active campaign uniqueness.
- Per-mailbox and per-domain limits.
- Evidence and message validation.
- Existing reply or meeting.

If every check passes, n8n sends through the Gmail API and stores the exact sent message and provider ID.

Pilot sequence:

- Email 1: concise, plain text, evidence-backed, no attachment and preferably no link.
- Email 2: one relevant follow-up after an approved delay.
- Email 3: a final, respectful close-the-loop message.
- Stop on any reply, hard bounce, complaint, unsubscribe, meeting or company-level response.

### 10.8 Reply handling

1. Gmail produces an inbox change; n8n retrieves the new message/thread.
2. Provider message ID prevents duplicate handling.
3. Deterministic rules detect unsubscribe, bounce, complaint and common automated replies before any model call.
4. The service classifies remaining replies as positive, question, objection, later, referral, out-of-office, wrong person, negative or ambiguous.
5. Only a high-confidence, clearly positive administrative response may receive an automatic approved template and booking link.
6. Pricing, negotiation, complex questions, objections and sensitive content enter the exception queue.
7. Any reply stops the active sequence by default.

### 10.9 Booking and meeting preparation

1. The approved positive-reply template links to Syed’s Google Calendar appointment schedule.
2. The prospect chooses a time; Google creates the event and handles calendar conflicts.
3. n8n observes the calendar event and updates the canonical meeting record.
4. The research service generates a concise meeting brief containing sourced evidence, original messages and reply intent.
5. Cancellation/rescheduling updates the existing meeting record rather than creating duplicates.
6. A no-show may receive no more than two approved rescheduling nudges.

### 10.10 Suppression

Suppression bypasses the normal asynchronous queue whenever possible:

1. Detect the suppression event.
2. Write the canonical suppression record.
3. Cancel every pending message for the applicable scope.
4. Prevent future enrollment.
5. Prevent creation of optional LinkedIn tasks.
6. Reconcile scheduled sends against suppression at least hourly.

Technical target: propagation within five minutes.

### 10.11 Reporting

The application produces:

- New leads.
- Verified-email yield.
- Enrolled contacts.
- Sent and delivered messages.
- Hard/soft bounces.
- Replies and positive replies.
- Booked, held, cancelled and no-show meetings.
- Opportunities and revenue when entered.
- Funnel metrics by cohort, ICP, persona, offer and template version.
- Suppression and duplicate-prevention incidents.
- Evidence-validation failures.
- Workflow retries and dead-letter items.

All rate denominators must use distinct contacts and explicitly distinguish sent from delivered messages.

---

## 11. Security design

### 11.1 Network exposure

- Caddy is the only service bound to public ports 80/443.
- The n8n editor is not publicly accessible.
- The prospect administration UI is private.
- Public routes are limited to required webhooks and any approved booking endpoint.
- Webhooks require provider signatures where available, otherwise an unguessable path plus an application-level secret and replay protection.
- Administrative access should use a private network or SSH tunnel and strong authentication.

Caddy is Apache-2.0 licensed and provides automatic HTTPS. [Caddy repository](https://github.com/caddyserver/caddy)

### 11.2 n8n controls

- Set a long, persistent `N8N_ENCRYPTION_KEY`; losing or changing it can make stored credentials unusable.
- Enable owner 2FA.
- Disable unnecessary public API/endpoints.
- Do not install unreviewed community nodes.
- Block risky nodes not required by the approved workflows.
- Restrict file access and command execution.
- Pin the n8n image version.
- Prune execution data after an approved retention period.
- Run `n8n audit` after setup and after material changes. The built-in audit checks credentials, database expressions, filesystem access, risky nodes, unprotected webhooks, missing settings and outdated instances. [n8n security audit](https://docs.n8n.io/hosting/securing/security-audit/)

n8n Community does not include every enterprise security feature, such as external secrets, SSO or built-in Git environments. For one owner, compensate with private network access, host-level secrets, workflow exports, strict change control and encrypted backups.

### 11.3 Application controls

- Replace the existing threaded stdlib server with FastAPI behind Caddy.
- Use secure, HTTP-only, SameSite cookies and CSRF tokens.
- Rate-limit login and public endpoints.
- Validate every request and response schema.
- Use prepared SQL statements and centralized authorization.
- Turn on SQLite foreign keys, WAL and `busy_timeout`.
- Use a single controlled writer for background events.
- Sanitize rendered content and apply a strict Content Security Policy.
- Do not render prospect-provided HTML.
- Protect against server-side request forgery in research fetches: allow HTTP/S only, resolve and block private/link-local addresses, cap redirects and response size.
- Treat all fetched content and reply text as hostile data.

### 11.4 Secrets

- Store secrets outside the repository with file permissions limited to the service account or through host/Docker secrets.
- Use separate provider credentials for development and production.
- Grant minimum OAuth scopes.
- Do not expose credentials to model prompts.
- Rotate credentials after suspected exposure and at an agreed interval.
- Redact authorization headers, query secrets and message bodies from logs.

### 11.5 Backups and recovery

- Create a SQLite-consistent backup rather than copying a live database file blindly.
- Encrypt backup content and send it off the application host.
- Back up the prospect database, n8n database/volume, Caddy configuration, application configuration and workflow exports.
- Keep daily, weekly and monthly recovery points according to an approved policy.
- Test a full restore before launch and quarterly thereafter.
- Monitor backup completion and age.

[Litestream](https://github.com/benbjohnson/litestream) safely replicates SQLite incrementally. [Restic](https://github.com/restic/restic) provides encrypted, verifiable backups to several local and remote backends. The final choice depends on the available off-host storage.

---

## 12. Deliverability design

### 12.1 Domain and mailbox

- Use one transparent, Syed.ai-controlled sending domain or an explicitly reviewed subdomain.
- Do not use typo-squatted or deceptive domains.
- A separate domain limits damage to `syed.ai`, but creates registration and mailbox costs.
- Start with one named-person mailbox for the 25-lead pilot.
- Add mailboxes only after the first mailbox demonstrates healthy delivery and reply behavior.

### 12.2 Authentication

- SPF contains only authorized senders.
- DKIM signs every outbound message.
- DMARC starts at `p=none` with reporting while all legitimate senders are inventoried and aligned.
- Move toward quarantine/reject only after alignment is proven.
- Require TLS and an aligned From identity.

### 12.3 Sending policy

- Start at 5 messages/day for the first healthy week.
- Increase to 10/day, then 15/day and at most 20/day per mailbox during the initial month.
- Maintain stable schedules rather than bursts.
- Send real, relevant messages; do not use artificial “warmup” exchanges.
- Use plain text, no attachments and no tracking pixel during the pilot.
- Avoid links in the first cold message.
- Use at most one branded booking link after interest.
- Never send to unverified, disposable, personal/free, role or catch-all addresses during the pilot.

Google recommends SPF/DKIM, TLS, aligned identity, consistent sending, gradual volume increases and low user-reported spam. It advises keeping reported spam below 0.1% and avoiding 0.3% or higher. [Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en)

### 12.4 Automatic pause conditions

Pause the affected mailbox, campaign or entire system when:

- Hard bounce rate reaches 2%.
- User-reported spam shows a sustained rise toward 0.1%.
- SPF, DKIM or DMARC alignment fails.
- A suppressed contact receives a message.
- A duplicate message is sent.
- A provider restricts the mailbox or account.
- Unsupported-claim rate exceeds 1% in audited messages.
- Evidence validation fails unexpectedly.
- Reply ingestion or the suppression queue is unavailable.
- A dead-letter event remains unresolved for more than one business day.

No automatic restart is allowed after a suppression, duplicate-send or authentication incident. A human must confirm remediation and a small canary batch.

---

## 13. Cost model

### 13.1 Zero-incremental-cost pilot conditions

The pilot can have zero incremental software and hosting cost only if Syed.ai already has:

- An always-on machine with reliable internet.
- A usable business mailbox.
- Google Calendar.
- Secure off-host storage within an existing allowance.
- Apollo Free credits sufficient for the 25 prospects.

Software costs under those conditions:

| Item                            |                    Pilot cost |
| ------------------------------- | ----------------------------: |
| n8n Community                   |                            $0 |
| Prospect service/FastAPI/SQLite |                            $0 |
| Caddy                           |                            $0 |
| Google Calendar booking page    |                $0 incremental |
| Restic/Litestream               |                            $0 |
| Apollo Free                     |           $0, limited credits |
| GPT-5.6 Luna                    | Likely cents for pilot volume |

### 13.2 Costs that cannot safely be designed away

- A separate sending domain, if chosen.
- A proper business mailbox if an existing one is not suitable.
- Licensed contact and email-verification credits beyond a small free allowance.
- A small reliable VPS if an always-on machine is unavailable.
- Off-host backup storage if no existing allowance is available.

Apollo’s Free tier currently includes 900 annual credits, while enrichment operations can consume different amounts of credit. This is enough to test a small batch but not a dependable ongoing acquisition plan. [Apollo pricing](https://www.apollo.io/pricing), [API credit costs](https://docs.apollo.io/docs/api-pricing)

### 13.3 Cost escalation order

When the free pilot proves technically healthy, spend money in this order:

1. Reliable mailbox/domain and DNS authentication.
2. Licensed leads and email verification.
3. Reliable hosting/off-host backup if required.
4. Additional healthy mailboxes only when volume is justified.
5. A paid sending platform only when Gmail/n8n operational limits become real.
6. A full CRM only when multiple users, broader pipeline processes or reporting requirements justify it.

Do not buy HubSpot, Twenty hosting, Clay, Smartlead or a large Apollo plan merely to complete the first 25-lead reliability test.

---

## 14. Roadmap

### Current position

| Item                                         | Status                                        |
| -------------------------------------------- | --------------------------------------------- |
| Business goal and target operating model     | Defined                                       |
| Existing brief, workbook and archive         | Reviewed                                      |
| Source-code audit                            | Completed                                     |
| Spreadsheet/formula audit                    | Completed                                     |
| LinkedIn feasibility review                  | Completed; unattended sending rejected        |
| Initial paid-stack architecture              | Completed, now superseded by lean plan        |
| Lean architecture and repository research    | Completed in this document                    |
| Sunbiz official-data feasibility review      | Completed; feasible as a separate signal lane |
| Sunbiz downloader/parser and resolution flow | Not started                                   |
| Production code changes                      | Not started                                   |
| n8n deployment/workflows                     | Not started                                   |
| Provider accounts/OAuth                      | Not connected                                 |
| Sending domain/mailbox/DNS                   | Not configured or verified                    |
| Calendar booking flow                        | Not configured                                |
| Lead pilot                                   | Not run                                       |
| Messages sent                                | Zero                                          |

### Phase 0 — review and decisions

**Duration:** before implementation  
**Objective:** approve the design and avoid building against unresolved assumptions.

Decisions required:

- Hosting location: existing machine or small VPS.
- Whether to use a separate sending domain.
- Which mailbox will run the pilot.
- Exact US ICP and decision-maker persona.
- Which single offer is used in the pilot.
- Whether the initial Sunbiz cohort targets foreign Florida qualifications, established domestic operators, or both as separate cells.
- Whether Google’s booking page meets the scheduling need.
- Whether GPT-5.6 Luna is acceptable or local inference is required.
- Backup destination and retention policy.
- Legal approval for pilot audience, identity/footer and opt-out language.

Exit criteria:

- Reviewer signs off on architecture, security and pilot boundaries.
- No material unresolved question changes the schema or provider choices.

### Phase 1 — foundation

**Duration:** first 48 hours of implementation  
**Objective:** create a secure, testable environment with no external sending.

Work:

1. Create the deployment repository and dependency/license inventory.
2. Add Docker Compose or equivalent service definitions for Caddy, n8n and prospect service.
3. Refactor the Python server to FastAPI/HTMX.
4. Implement schema migrations and identity constraints.
5. Add evidence, event, campaign, message, reply, meeting and expanded suppression tables.
6. Configure application authentication, private administrative access and HTTPS.
7. Configure secrets and log redaction.
8. Configure consistent encrypted backup and perform an initial restoration test.
9. Implement `/healthz` and dependency readiness checks.
10. Pin versions and run baseline dependency/container scans.

Exit criteria:

- Services restart automatically and retain data.
- Administrative interfaces are not publicly reachable.
- A restored environment passes health checks.
- No provider credential is present in the repository or logs.

### Phase 2 — core automation in dry-run mode

**Duration:** implementation days 3–7  
**Objective:** complete the event path without sending real messages.

Work:

1. Implement lead-ingest and deduplication API.
2. Implement global suppression API and pre-action gate.
3. Add Apollo/API intake workflow using test fixtures before live credentials.
4. Implement the Sunbiz downloader/parser with saved fixture files, checksums, title classification and PII minimization.
5. Implement filing-party-to-company/contact resolution without LinkedIn scraping.
6. Implement safe research fetching and immutable evidence.
7. Version scoring rules, including a separate Sunbiz timing/source feature.
8. Implement deterministic templates, optional structured AI output and factual validators.
9. Implement campaign scheduler and exact-message records.
10. Implement synthetic Gmail events and reply fixtures.
11. Implement reply policy, booking-link response and exception queue.
12. Implement Calendar event fixture, meeting record and meeting brief.
13. Implement metrics and a quiet weekly health/funnel digest with source-cohort reporting.

Exit criteria:

- Replaying each event ten times produces one business action.
- Suppression prevents enrollment and scheduled sends at every stage.
- Every personalized clause maps to fresh evidence.
- Every workflow failure is retried or appears in the exception queue.
- No workflow can send while the system is in dry-run mode.

### Phase 3 — 25-lead reliability pilot

**Duration:** implementation days 8–14  
**Objective:** validate the complete operation with one narrow market cell.

Pilot definition:

- One US ICP.
- One persona.
- One Syed.ai offer.
- Twenty-five licensed prospects.
- One sending mailbox.
- No automated LinkedIn activity.

Procedure:

1. Run all 25 through sourcing, identity, enrichment, research, scoring and drafting in dry-run mode.
2. Human-review all 25 once as engineering QA.
3. Correct every identity, evidence, compliance or duplicate issue.
4. Replay unsubscribe, bounce, complaint, OOO, later, referral, positive, objection and ambiguous fixtures.
5. Validate backup restoration again.
6. Activate sending at no more than five messages/day after approval.
7. Inspect delivery, replies and system events daily during this limited launch; this is launch monitoring, not the intended steady-state workflow.

Exit criteria:

- No unsupported personalization.
- No duplicate sends.
- No action against a suppressed record.
- No critical workflow or security defect.
- 100% exact sent-message and provider-ID retention.
- Reply and booking events reconcile correctly.

The 25-lead pilot is a reliability test, not a statistically meaningful conversion test. At a 1% meeting rate, it implies only 0.25 expected meetings.

### Phase 4 — first 30 days

**Objective:** collect enough controlled data to judge the offer and workflow.

- Ramp from 5 to 10, 15 and at most 20 messages/day only while healthy.
- Reach 250–500 qualified first contacts across no more than two controlled ICP/message cells.
- Change one major variable at a time.
- Audit 20 random evidence/message pairs weekly during month one.
- Track replies, positive replies, booked meetings, held meetings and opportunities by cohort.
- Remove non-performing optional components rather than adding tools reflexively.
- Decide whether Apollo Free is sufficient or paid licensed data is the first upgrade.

Exit criteria for steady-state operation:

- Zero suppression violations and duplicate sends.
- 100% sourced personalization in audits.
- Hard bounces below 2%.
- Stable authentication and domain reputation.
- Actionable events processed within five minutes.
- No unresolved dead-letter event older than one business day.
- Normal recurring administration at or below 30 minutes/week.

### Phase 5 — scale only when justified

Potential upgrades, in order:

1. Paid Apollo data/verification credits.
2. Additional sending mailbox and, if justified, domain.
3. Small VPS if the existing host is unreliable.
4. PostgreSQL when database/concurrency needs require it.
5. Dedicated sending platform when mailbox rotation, deliverability reporting or throughput justify its extra state.
6. Full CRM only when more users or broader sales processes need it.

LinkedIn automation does not become acceptable at a higher scale.

---

## 15. Engineering backlog and acceptance tests

| ID       | Priority | Ticket                                         | Acceptance test                                                                     | Dependency      |
| -------- | -------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- | --------------- |
| SYS-01   | P0       | Create dependency and license inventory        | Every runtime component has repository, pinned version, license and owner           | Approval        |
| SYS-02   | P0       | Compose deployment and network isolation       | Only Caddy binds public ports; internal services are unreachable directly           | SYS-01          |
| APP-01   | P0       | Replace stdlib server with FastAPI/HTMX        | Authenticated UI/API pass functional and security tests                             | SYS-02          |
| DB-01    | P0       | Add numbered schema migrations                 | Empty and existing databases migrate reproducibly; rollback/restore documented      | APP-01          |
| DB-02    | P0       | Canonical company/contact identity             | Domain/email aliases create one canonical record                                    | DB-01           |
| DB-03    | P0       | Evidence/event/suppression/message schema      | Required constraints reject incomplete and duplicate rows                           | DB-01           |
| SEC-01   | P0       | Authentication, sessions and CSRF              | Unauthenticated/forged requests fail; secure cookie flags verified                  | APP-01          |
| SEC-02   | P0       | Research SSRF/prompt-injection controls        | Private/link-local targets and injected page instructions are blocked/ignored       | APP-01          |
| SEC-03   | P0       | Secrets and log redaction                      | Automated scan finds no key/token/header/message-body leakage                       | SYS-02          |
| OPS-01   | P0       | Backup and restoration                         | Clean host can restore database, workflows and configs; documented recovery time    | DB-01, SYS-02   |
| OPS-02   | P0       | Health and failure alerting                    | Stopped service/expired certificate/failed backup produces one actionable alert     | SYS-02          |
| AUT-01   | P0       | Idempotent lead ingestion                      | Ten identical events create one contact/campaign candidate                          | DB-02           |
| AUT-02   | P0       | Global suppression gate                        | Opt-out blocks pending and future actions across every scope within five minutes    | DB-03           |
| RES-01   | P0       | Immutable evidence pipeline                    | Every accepted fact has URL/date/confidence/expiry; later research creates new rows | SEC-02, DB-03   |
| RES-02   | P0       | Versioned fit/timing/confidence score          | Same evidence and rubric produce identical score and reasons                        | RES-01          |
| MSG-01   | P0       | Structured drafting and deterministic fallback | Model outage still produces safe generic/no-send result; unsupported claims fail    | RES-01          |
| MSG-02   | P0       | Pre-send validator                             | Suppression, stale email/evidence, placeholders and duplicate touch all block send  | AUT-02, MSG-01  |
| MAIL-01  | P0       | Gmail send adapter                             | Dry-run prevents send; live fixture stores exact content and Gmail message ID once  | MSG-02          |
| MAIL-02  | P0       | Reply ingestion/reconciliation                 | Duplicate/out-of-order notifications create one reply; missed events recover        | MAIL-01         |
| MAIL-03  | P0       | Reply policy and exception queue               | Only approved ≥0.95-confidence intents auto-reply; all others appear once in queue  | MAIL-02         |
| CAL-01   | P0       | Booking and calendar reconciliation            | Booking creates one meeting; reschedule/cancel updates the same record              | MAIL-03         |
| BRF-01   | P1       | Sourced meeting brief                          | Brief contains only retained evidence/messages with links/dates                     | CAL-01, RES-01  |
| MET-01   | P1       | Cohort metrics                                 | Synthetic data produces correct distinct-contact rates and monthly counts           | MAIL-02, CAL-01 |
| UX-01    | P1       | Exception-only administration page             | Owner can resolve all exception classes without editing the database                | MAIL-03         |
| LIN-01   | P2       | Optional manual LinkedIn task                  | Generates no browser action; suppression blocks task creation                       | AUT-02          |
| SCALE-01 | P2       | PostgreSQL migration path                      | Export/import test retains IDs, evidence, suppression and metrics                   | Stable pilot    |

---

## 16. Testing strategy

### Unit tests

- Email/domain normalization.
- Registrable-domain extraction.
- Scoring rules.
- Evidence freshness.
- Message length and placeholder rules.
- Intent policy.
- Suppression scope matching.
- Metric denominators.

### Integration tests

- SQLite migrations from the current archive.
- n8n-to-application authentication.
- Gmail send and reply fixtures.
- Calendar booking/rescheduling fixtures.
- Provider timeout, 429 and 5xx behavior.
- Duplicate and out-of-order event delivery.
- Backup restoration.

### Security tests

- Authentication/session/CSRF failures.
- SQL injection.
- Stored/reflected HTML injection.
- SSRF, DNS rebinding and redirect-to-private-target attempts.
- Prompt injection in fetched content and replies.
- Secret and PII log leakage.
- Public-port and endpoint inventory.
- Dependency/container vulnerability scan.
- n8n built-in security audit.

### Golden-set evaluation

Maintain a versioned set of at least 50 examples covering:

- Strong, weak and missing evidence.
- Acceptable and unsupported personalization.
- Positive, negative, later, OOO, referral, wrong-person, objection, question and unsubscribe replies.
- Adversarial wording and prompt injection.

The model/provider is chosen by unsupported-claim rate and action precision before style or cost.

---

## 17. Residual human work

| Task                                                   | Expected frequency             |                                Actions |      Steady-state minutes/week |
| ------------------------------------------------------ | ------------------------------ | -------------------------------------: | -----------------------------: |
| Review ambiguous/failed exceptions                     | 1–3 cases/week at early volume |           Open, inspect, choose action |                           5–10 |
| Handle bespoke positive replies, objections or pricing | 0–3/week initially             |              Read and personally reply |                           5–15 |
| Review weekly health/funnel digest                     | Weekly                         |       Open; drill down only if flagged |                            3–5 |
| Approve new template/rubric/model version              | Monthly or less                | Review golden-set results and activate |            1–3 averaged weekly |
| Deliverability/security incident                       | Exception only                 | Investigate and approve canary restart | Normally 0; incident-dependent |
| Optional five-account LinkedIn lane                    | Weekly, optional               |  Human profile review/connect/send/log |               10–20 additional |

Expected recurring administration without LinkedIn: **15–30 minutes/week**.

Zero human involvement is not the correct target for bespoke questions, pricing, negotiation or reputation incidents. Those exceptions are where human judgment protects revenue and account health.

---

## 18. Principal risks and controls

| Risk                         | Level                          | Control                                                                                                         |
| ---------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| LinkedIn account restriction | High if automated              | No automated LinkedIn interaction                                                                               |
| Deliverability damage        | High                           | Separate reviewed domain strategy, authentication, gradual real-message ramp, verification and automatic pauses |
| Unsupported personalization  | High                           | Immutable evidence, source/date requirements and deterministic validation                                       |
| Duplicate send               | High                           | Database uniqueness, provider IDs, idempotency keys and replay tests                                            |
| Suppression failure          | Very high                      | Canonical suppression table, synchronous pre-send check and reconciliation                                      |
| Legal/jurisdiction mismatch  | High                           | US-only initial policy; Canada/UK/EU excluded pending review                                                    |
| Self-hosting outage          | Medium                         | Service restart, health checks, off-host backup and tested recovery                                             |
| Credential compromise        | High                           | Private admin, least privilege, encrypted credential store, no secrets in code/logs and rotation runbook        |
| SQLite concurrency           | Low at pilot; rises with scale | WAL, busy timeout, controlled writer and PostgreSQL migration trigger                                           |
| Model misclassification      | Medium                         | Deterministic priority rules, confidence threshold, fixed safe templates and human exceptions                   |
| Free-data limits             | High for scale                 | Treat Apollo Free as pilot-only; pay for licensed data before raising volume                                    |
| Dependency/license change    | Medium                         | Pin versions, record licenses and review upgrades                                                               |
| One-host failure             | Medium                         | Off-host encrypted backup and documented restoration                                                            |

---

## 19. Explicitly deferred decisions

The following are not required for the 25-lead pilot:

- HubSpot or another full CRM.
- Twenty, Baserow, PocketBase or NocoDB.
- PostgreSQL.
- Redis or a job broker.
- Kubernetes.
- Smartlead, Instantly or another dedicated sending platform.
- Clay or a multi-provider enrichment waterfall.
- Self-hosted scheduling software.
- Self-hosted email delivery.
- A locally hosted language model.
- Sales Navigator.
- Automated LinkedIn interaction.
- Multiple sending domains or mailboxes.
- Real-time BI/warehouse infrastructure.

Each deferred component requires a measured trigger rather than preference.

---

## 20. Review questions

Reviewers should answer these questions explicitly:

### Architecture

- Is one-host n8n + FastAPI + SQLite appropriate through the proposed pilot volume?
- Are the boundaries between canonical application state and n8n orchestration clear?
- Is the PostgreSQL migration trigger sufficiently defined?

### Security

- Are the public/private network boundaries adequate?
- Are webhook authentication and replay protections sufficient for Gmail/provider behavior?
- Are SSRF, prompt-injection, secrets and backup risks adequately controlled?
- Is the Community edition compensating-control plan acceptable?

### Data and compliance

- Are the identity and suppression scopes complete?
- Is a US-only pilot appropriate?
- What exact legal basis, notice, retention and deletion rules must be documented before expansion?
- Is licensed-provider data being used within its contract and DPA?

### Deliverability

- Should the pilot use the existing domain, a subdomain or a separate transparent domain?
- Is the 5→10→15→20 daily ramp appropriate for the selected mailbox history?
- Are the hard-bounce, complaint/spam and authentication pause conditions strict enough?

### Product and operations

- Is one ICP/persona/offer sufficiently narrow?
- Which replies may be automatically acknowledged?
- Does Google Calendar’s booking page cover qualification, buffers and rescheduling?
- Is 15–30 minutes/week a realistic exception budget at the planned volume?

### Implementation

- Are the P0 acceptance tests adequate to authorize a real send?
- Which backup destination and monitoring approach should be selected?
- What evidence types and freshness windows are appropriate for GEO/SEO personalization?

---

## 21. Approval gates

| Gate                          | Required approval                            | Evidence required                                                        |
| ----------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| Begin coding                  | Product/technical owner                      | Approved architecture and pilot ICP                                      |
| Connect accounts              | Security/technical owner                     | OAuth scopes, secret-storage and endpoint review                         |
| Acquire domain/mailbox        | Business and deliverability owner            | Domain strategy and cost approval                                        |
| Import live leads             | Privacy/business owner                       | Licensed source, geography policy and retention decision                 |
| Enable real sending           | Technical, deliverability and business owner | All P0 tests green; DNS/auth healthy; 25 drafts reviewed; restore tested |
| Increase above 5/day          | Deliverability owner                         | Bounce/spam/authentication and inbox health acceptable                   |
| Add auto-reply intent         | Business owner                               | Golden-set precision and approved fixed response                         |
| Expand outside US             | Legal/privacy owner                          | Jurisdiction-specific policy approved                                    |
| Add another mailbox/domain    | Deliverability/business owner                | Capacity need and first-mailbox health demonstrated                      |
| Add paid CRM/sending platform | Technical/business owner                     | Documented scale or feature trigger                                      |

---

## 22. Recommended decision

Approve the following architecture for the pilot:

> **n8n Community Edition + the refactored Syed.ai prospect service using FastAPI/HTMX and SQLite + Caddy + encrypted off-host backups + Gmail/Workspace + Google Calendar appointment schedules + Apollo Free for licensed pilot contacts + GPT-5.6 Luna as an optional, schema-constrained drafting/classification service.**

Do not use HubSpot or replace it with another full CRM. Do not self-host email delivery. Do not automate LinkedIn. Do not deploy Twenty, Activepieces, Cal.diy, Redis, PostgreSQL or Kubernetes for the first pilot.

The first five implementation actions after review approval are:

1. Decide the host, sending-domain strategy, mailbox and narrow US pilot ICP.
2. Create the pinned deployment repository and secure Caddy/n8n/FastAPI skeleton.
3. Migrate the application schema and make suppression, identity and idempotency reliable.
4. Build the dry-run lead→evidence→draft→reply→booking workflows and pass all P0 tests.
5. Review 25 complete dry-run records, then activate a five-message/day canary only after security, backup, deliverability and business approval.

This is the lightest credible design that preserves the original objective: a mostly autonomous meeting-generation system without daily spreadsheet work, without an unnecessary CRM, without a large SaaS stack and without risking the LinkedIn account.

---

## 23. Reviewer sign-off

| Review area           | Reviewer | Decision                  | Conditions / requested changes | Date |
| --------------------- | -------- | ------------------------- | ------------------------------ | ---- |
| Business/offer        |          | Approve / Revise / Reject |                                |      |
| Architecture          |          | Approve / Revise / Reject |                                |      |
| Application/database  |          | Approve / Revise / Reject |                                |      |
| Security              |          | Approve / Revise / Reject |                                |      |
| Privacy/legal         |          | Approve / Revise / Reject |                                |      |
| Deliverability        |          | Approve / Revise / Reject |                                |      |
| Pilot and measurement |          | Approve / Revise / Reject |                                |      |
