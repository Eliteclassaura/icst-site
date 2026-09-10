# Outbound prospecting — critical assessment (2026-09-04)

Input: `docs/inputs/lean-prospecting-review-plan.md` (owner-supplied, 4 Sept 2026). Question asked: incorporate the lean prospecting system into the factory, or build it standalone? Owner context: initially for Syed.ai; possible clients include B2B industrial sellers (e.g. cooling-tower parts, salespeople on LinkedIn) and cash home investors who "build a list".

## Verdict in three lines

1. **Do not build it standalone in Python/SQLite.** Its Phase 1 ("foundation") re-implements what the factory already has and has tested: auth, roles, migrations, CSRF, secrets, audit, jobs with idempotency and dead-letter, backups, health, SSRF guard, AI gateway with redaction. A second stack means two of everything forever and a re-platform the day a client wants it.
2. **Incorporate it as an opt-in module in this monorepo** — `packages/payload-prospecting-plugin` + `apps/prospecting`, deployed separately from any website, on its own database and its own sending domain — after the syed.ai site is launched (Release 2). Keep n8n as the optional orchestrator through the webhook bridge already designed; truth lives in Postgres, exactly as the input document itself insists.
3. **Sell it to clients only for B2B, only after 90 days of your own metrics, and never as "LinkedIn automation".** The cash-home-investor case is consumer outreach (SMS/phone/direct mail, TCPA/FTSA territory) and does not fit this system; say no to it.

## What the input document gets right

- No unattended LinkedIn. Manual task lane only. This is correct and non-negotiable.
- Evidence-backed personalization with URL, date, confidence, expiry; deterministic validators; a model failure yields a generic message or no send.
- One canonical store; n8n moves events but owns nothing.
- Suppression as a synchronous pre-send gate with scope (email/domain/company/global) and reconciliation.
- Sending through Gmail/Workspace at 5→20/day per mailbox with hard pause conditions; no self-hosted MTA; no fake warm-up.
- US-only pilot; Canada/UK/EU excluded until lawful basis is documented.
- Sunbiz via official bulk files, not scraping; registered agents are not owners; addresses and FEI numbers discarded.
- "The 25-lead pilot is a reliability test, not a conversion test."

## Where it is wrong or weaker than it looks

| Claim in the document                                  | Critique                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "One-user components; SQLite; FastAPI/HTMX"            | True for one person for one quarter. The moment a client's two salespeople use it, you need roles, audit and concurrency — the factory has six roles, an audit log and PostgreSQL already, with 84 tests. The "lean" choice is lean only because it ignores the platform you are already paying for.                                                                                                                                    |
| "Do not use a CRM; extend the app into the CRM subset" | Agreed on HubSpot. But the factory's CRM (contacts, companies, leads, activities, tasks, submissions, suppression, outbox, consent) _is_ that subset, hardened. Building it again in Python is the duplication the document warns against.                                                                                                                                                                                              |
| "Zero incremental cost"                                | Only for you, only on your own always-on machine, only with Apollo Free's 900 credits. As a client product every line becomes a cost and a liability: domain, mailbox, licensed data per client (you cannot resell Apollo data), monitoring, and your time when a mailbox gets restricted.                                                                                                                                              |
| Gmail/Workspace as the cold-email sender               | Fine for a 25-lead pilot. As a product, Google's sender guidelines and Workspace terms make unsolicited bulk mail a suspension risk for the client's _primary_ Workspace tenant. A client product needs a separate sending domain and mailboxes per client, and eventually a sending platform — the document defers this correctly, but it is a certainty, not a maybe.                                                                 |
| GPT-5.6 Luna by default                                | Acceptable for B2B contact data under a DPA, but it contradicts your stated preference for free/self-hosted AI and it sends prospect names and company facts to a hosted model. Inside the factory the AI gateway already enforces redaction (no emails to the model), budgets, `generated` provenance and an off switch; the free/self-hosted profile (Qwen) is already on the roadmap. Use the gateway; choose the provider per site. |
| Sunbiz lane as a growth engine                         | It is a Florida-only timing signal with a poor qualified-yield outlook, as the document admits. Good for you locally; as a product feature it means one parser per state and constant format drift. Keep it as an optional signal source, not a selling point.                                                                                                                                                                          |
| "15–30 minutes per week"                               | Optimistic. Pricing, objections and bespoke positive replies are the replies that matter, and they are your selling time, not administration. Budget the exception queue honestly: it is where revenue is won.                                                                                                                                                                                                                          |
| Reply classification auto-answering positives          | Only at ≥0.95 confidence with a fixed template — the document says so, but the golden set (50 examples) is too small to establish that threshold. Start with **no** auto-reply; add it after 200+ labelled real replies.                                                                                                                                                                                                                |
| Current Python archive as the base                     | The document's own audit lists: no tests, no auth, no email field, exact-name identity, contradictory InMail counting, unenforced approval, prompt-injection exposure. That is a prototype to **characterise** (scoring rules, templates, workbook logic → fixtures, as we did for the Search Suite), not a codebase to refactor.                                                                                                       |

## Why the factory is the right host

Almost every "does not currently do" item in the input maps to something already built or already scheduled here:

| Needed by prospecting                       | In the factory                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth, roles, private admin, audit           | Payload admin, six roles, audit log with PII redaction, invite-only users, session lockout (C3, 84 tests)                                                    |
| Company/contact/lead/activity/suppression   | CRM collections (C3); scoped `Suppression` collection and consent records land in C6                                                                         |
| Jobs with retries, idempotency, dead-letter | Payload jobs + separate worker with idempotency keys, retained history (C0/C3); retry ladder and dead-letter Activity designed for `crm.sync`                |
| Email adapter, bounce/complaint handling    | `EmailProvider` (mock → SMTP → Gmail API/JMAP, Release 7) with `health()` preflight, SPF/DKIM/DMARC checklist (R33), suppression processing                  |
| Safe research fetch, SSRF guard, extraction | `safeFetch` (C6) and the Search Suite's `extractPage`, crawler and **evidence provenance model** (`observed / reported / estimated / generated`) — Release 5 |
| AI drafting/classification with guard-rails | AI gateway: budgets, redaction, prompt registry, structured output, `generated` provenance, preview→approve, off by default (C7); free profile (R7)          |
| Webhook orchestration with n8n              | Generic signed webhook bridge (`docs/crm-sync.md`, Release 2)                                                                                                |
| Backups, secrets, monitoring, runbooks      | `age`-encrypted backups with key custody, Coolify/sops secrets, Uptime Kuma, GlitchTip (Release 7)                                                           |
| Quality gates and threat-model tests        | Residue scan, audit gate, per-vector tests — extend with V19 (deliverability pauses), V20 (registry PII minimisation)                                        |

The one thing the factory lacks that prospecting needs is the **evidence-to-message validator** and the **campaign/membership/message/reply/meeting** objects. Those are the actual new code — roughly a third of the input document's backlog. The other two thirds are already here.

There is also a synergy the input document cannot see: the Search Suite audit of a prospect's site _is_ the personalization. "Your site is cited for X but not recommended; here is the evidence, dated" is the syed.ai pitch, produced by code you already own, with provenance the validator can check.

## The shape, if approved

- `packages/payload-prospecting-plugin` — collections: `campaigns`, `memberships`, `messages`, `replies`, `meetings`, `evidence`, `registry-filings`, `registry-parties`; jobs: `source.pull`, `enrich.email`, `research.evidence`, `draft.message`, `send.message`, `ingest.reply`, `book.meeting`, `suppress.propagate`; the pre-send gate; the evidence validator; reply policy; cohort metrics. Reuses agency-core CRM, roles, audit, jobs, providers.
- `apps/prospecting` — its own deployment and database (never inside a client website image), its own sending domain(s), n8n optional beside it.
- Adapters behind readiness gates: Apollo (licensed data), Gmail API (send/ingest), Google Calendar (booking), Sunbiz (FL registry, optional), generic webhook (n8n).
- Legacy Python app + workbook → `legacy-reference/prospecting/`, characterised into fixtures (scoring, templates, cadence) exactly as the Search Suite was.

Estimate: **12–18 engineer-days** to the equivalent of the input's Phase 3 pilot (dry-run complete, 25 leads reviewed, 5/day canary), versus the input's 14 days standalone — comparable, and it inherits the tests, gates and security instead of promising them.

## Sequencing — the honest trade-off

The website is the product that pays; prospecting is the product that finds buyers for it. Doing both at once slows both. Options:

1. **Site first (recommended).** Finish Release 1 (≈3.5 d) and Release 2 (6–10 d), launch syed.ai, then build the prospecting module as a "Release P" (12–18 d) before the factory extraction in Release 3. Your own pilot runs on it. Clients see it only after 90 days of your metrics.
2. **Prospecting first.** Pause the site after C6 (so the CRM, jobs, email provider and safeFetch exist) and build Release P. Gets you outbound sooner; delays the site launch by three weeks; the personalization hook without the Search Suite (Release 5) is thinner.
3. **Standalone Python now, re-platform later.** Fastest to your first sent email (the input's 14 days), then thrown away when a client wants it, having maintained two stacks in between. Not recommended.

## Client fit, bluntly

- **Cooling-tower parts / industrial B2B**: good fit. Business emails, named buyers, manual LinkedIn lane for their reps, multi-user (needs the factory's roles — one more reason not to go standalone). Their data licence, their sending domain, their legal sign-off.
- **Cash home investors "building a list"**: poor fit and real exposure. Homeowners are consumers; the workable channels are SMS, calls and direct mail, which fall under TCPA and Florida's FTSA with statutory damages, and consumer cold email to personal addresses destroys deliverability. If you want that market, it is a different product with different counsel. Decline it for this system.
- **Anyone asking for "LinkedIn automation"**: decline; offer the research + email + manual-task lane and explain why.

## Owner decisions this raises

1. Site first, or prospecting first? (Default: site first.)
2. Is a separate sending domain for syed.ai outbound approved now, so DNS can warm while Release 2 ships?
3. Confirm: B2B only; no consumer lists; no LinkedIn automation; no auto-replies in the pilot.
4. Which AI provider for the pilot: hosted (Luna/Anthropic sandbox) or the self-hosted Qwen profile?
5. Do you want the legacy Python app and workbook archived into `legacy-reference/prospecting/` now so discovery can start when Release P does?
