# How the OGCS agent runs

This describes the operating model of OGCS as it will run for the owner. It is consistent with `OGCS_SYSTEM_SPEC_v1` (modes, loop, risk classes, QA passes) and with ADR-026 (where it lives and how it touches sites). It is written so the Factory team understands what will call into their systems, when, and with what credentials.

## 1. Deployment shape

OGCS is one deployment for the whole agency, in its own repository (`ogcs/`), with:

| Component | Purpose | Notes |
|---|---|---|
| Controller service | Runs the nine controller modes (Portfolio Manager, SEO Investigator, SERP Investigator, Competitive Analyst, Strategist, Experiment Manager, Production Controller, Reviewer, Daily Controller) as one lead agent with a system prompt (`ogcs_core_agent_prompt_v1`). | Node/TypeScript so it can import `@factory/seo-contracts` directly. Model calls go through one gateway with logged prompts/outputs. |
| Postgres | System of record for *decisions and outcomes*: projects, pages (with dispositions), seo_decisions, serp_observations, competitors, ai_answer_observations, experiments, tactics, tasks, workers, access_records, qa_results, daily_state — the entities in `ogcs_core_data_schema_v1.json`, with `version`/`valid_from` columns added so strategic records are never overwritten. | Separate instance from every client's Payload database. |
| Job queue + scheduler | Daily monitor, EOD review, weekly SEO review, monthly strategy review, experiment recheck dates, post-launch monitoring; large crawls and SERP batches. | pg-boss or BullMQ on the OGCS Postgres/Redis — OGCS's choice, invisible to the Factory. |
| Browser/research worker | Live SERP inspection, competitor pages, AI-answer observation, staging/live QA passes (A/B/C). | Playwright. Crawls **public URLs only**. |
| Artefact store | Immutable files: Search Evidence exports, `evidence-bundle`s, `page-decisions`, Build Packs, `qa-report`s, screenshots, reports. Keyed by `run_id`, content-hashed. | S3-compatible bucket owned by OGCS. |
| Secrets | GSC OAuth (server-side, OGCS's own client), SEMrush API key, Surfer credentials, model API key, and **one Payload service-account API key per client site**. | env / secret manager. Never in artefacts, never in the Factory repo. |

The Search Evidence Suite is not part of the deployment. It keeps running as a browser app; the owner exports a project file when evidence should be refreshed, or — later — OGCS's GSC connector supersedes it for GSC and the suite is used for analysis and reports.

## 2. The loop, mapped to systems

Observe → Diagnose → Research → Decide → Execute → Verify → Measure → Learn → Reprioritize. Each arrow below names the contract or credential involved.

```
                 Search Evidence export           GSC API / SEMrush API / Surfer
                          │ (file)                          │ (OGCS creds)
                          ▼                                 ▼
                 ses-to-evidence adapter ──────────► evidence-bundle (artefact store)
                                                            │
                                    OBSERVE / DIAGNOSE / RESEARCH (controller modes,
                                    browser worker for live SERPs & AI answers)
                                                            │
                                                     DECIDE → seo_decisions, experiments,
                                                             tasks (OGCS Postgres)
                                                            │
                        ┌───────────────────────────────────┴──────────────────────────┐
                        │ structural?                                                  │ content?
                        ▼                                                              ▼
              page-decisions (file → Factory)                         Lane B: Payload REST as `automation`
              → wordpress-import / decisions-apply                    (title, meta, body, links, ALT,
              → blueprint diff → PR → seed → parity gate → deploy      new post, schema data)
                        │                                                              │
                        └──────────────────────────► VERIFY ◄──────────────────────────┘
                              qa-report + deploy-event (from Factory)  +  OGCS QA passes A/B/C on live URLs
                                                            │
                                               MEASURE (next evidence-bundle)
                                                            │
                                               LEARN → tactic confidence, experiment result
                                                            │
                                               REPRIORITIZE → daily_state, tomorrow_priorities
```

## 3. Schedule (defaults; all configurable per project)

| Cadence | Mode | What happens | Touches Factory? |
|---|---|---|---|
| Continuous (event) | — | `qa-report` / `deploy-event` arrive → `qa_results` + post-launch monitoring window opens | Reads only |
| Daily 06:00 | Daily Controller | Read yesterday's verified changes, failures, new intelligence; write `daily_state`; produce tomorrow's task list; route AI-default tasks | Lane B writes may be queued, not executed until the owner's daily approval unless the tactic is `green` and pre-approved |
| Daily 09:00–17:00 | Production Controller | Execute approved green tasks (Lane B); prepare Lane-A `page-decisions` drafts for anything structural | Lane B REST writes; Lane A files |
| Daily 18:00 | Reviewer | QA pass B (SEO implementation) on every URL changed today; open corrections | Reads live URLs |
| Weekly Mon | SEO Investigator + Experiment Manager | New evidence-bundle if an export arrived; decay/cannibalisation/striking-distance findings; experiments due for recheck | — |
| Monthly | Strategist + Competitive Analyst | Portfolio health, constraint per project, tactic retirements | — |
| Per migration | Production Controller | Full Lane-A cycle (H2O: see `h2o-pilot-plan.md`) | Files + PR |

## 4. Approval and risk gates

Tactic risk classes from the playbook seed decide what OGCS may do unattended:

| Risk class | Examples | Unattended? | Lane |
|---|---|---|---|
| `green` | INTLINK-001 internal links, CONTENT-001/002 refresh & expand, IMAGE-001 ALT/filenames, CITATION-001, MULTI-001 | Yes, within daily budget (e.g. ≤ 10 pages/site/day), each write reversible | B |
| `yellow` | LINK-001 outreach, AEO-001 answer formatting | Draft → owner approves in daily review → execute | B (after approval) |
| `red` | Anything changing URLs, removing pages, redirects, noindex, IA changes, new collections | Always `page-decisions` with `decisions_status: draft` → owner approval → `approved` → Lane A | A |
| `intelligence_only` | INTEL-001 | Never writes | — |

Hard stops independent of risk class (enforced by Factory hooks, not just OGCS discipline): no publish without `verification.status = verified`; no `noindex` on `seo.lock`; no slug change via Lane B; no delete via Lane B; no PRUNE without the evidence gate in `page-decisions` (`prune_blocked=false` and `decisions_status=approved`).

## 5. Credentials OGCS holds, and does not hold

Holds: its own GSC OAuth client and refresh tokens (server-side, per property); SEMrush/Surfer API access; model API key; one `service-accounts` API key per client Payload, labelled by client and stored under `CLIENT_<slug>_PAYLOAD_API_KEY`; the `OGCS_WEBHOOK_SECRET` shared with each client app for inbound HMAC verification (v2). `access_records` in OGCS Postgres store the *state* (`confirmed/expired/no_access`) and a secure reference, never the value.

Does not hold: any client's `DATABASE_URI`, `PAYLOAD_SECRET`, S3 keys, Hostinger/SSH access, DNS, or admin passwords. If a task needs one of those, it is routed to a human worker (E or Syed) as the spec already provides.

## 6. Observability

Every OGCS action writes an audit row (initiator, evidence refs, mode, decision, output, timestamp, QA result, experiment/tactic). Every Lane-B write appears in the client's Payload `audit-log` with actor = the service account, so the client-side and OGCS-side logs can be joined on timestamp + doc id + `run_id` (sent as an `X-OGCS-Run-Id` header and stored in `pages.migration.decisionsVersion` / a `lastAutomationRunId` field). Every artefact is content-hashed; the `inputs[]` chain in the envelope gives full provenance from a live change back to the GSC rows that motivated it.

## 7. Failure behaviour

| Failure | Behaviour |
|---|---|
| Payload REST rejects a Lane-B write (validation, hook, access) | Task → `blocked`, correction opened, no retry beyond 3 with backoff; owner sees it in daily review |
| Client site unreachable | Task deferred; health `yellow`; no partial writes (each write is one document) |
| `qa-report.result = fail` | Experiment → `waiting`; Production Controller opens corrections; nothing further deploys for that project until pass |
| Evidence stale (> 14 days since last bundle) | Decisions that depend on equity (`PRUNE`, `REDIRECT`, `CONSOLIDATE`) are blocked; green tactics continue |
| Contract MAJOR mismatch | Adapter/importer refuses; task `blocked` with the version pair in the message |
| OGCS itself down | Client sites unaffected by construction; queued Lane-B writes resume; missed schedules run once on recovery, not N times |

## 8. Local development (Claude Code)

The OGCS repo runs entirely offline against fixtures: `docs/baselines/ses-fixtures/` (copied or fetched from the Factory package), a recorded `evidence-bundle`, and a Payload dev instance from the Factory (`pnpm dev` in `apps/syed-ai` with a seeded `service-accounts` document). A `--dry-run` flag on every executor prints the REST calls or the blueprint diff instead of performing them. No live client credentials are needed to develop or test OGCS.
