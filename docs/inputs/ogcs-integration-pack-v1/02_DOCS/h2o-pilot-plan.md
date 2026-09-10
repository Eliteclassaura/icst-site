# H2O Cooling pilot — sequencing through the architecture

H2O is the first project to flow through OGCS ↔ Factory. It exercises Lane A heavily (a full migration) and Lane B lightly (post-launch green tactics). Each step is independently revertible and does not touch syed.ai.

| Step | Owner | Inputs | Outputs | Gate to proceed |
|---|---|---|---|---|
| **0. Intake** (done 2026-09-05) | Syed | Handoff ZIP; Factory repo | `INPUT_READINESS_REPORT.md`, `MISSING_INPUTS_CHECKLIST.md`, `SECURITY_FLAGS.md`, architecture decision | — |
| **1. Collect exports** | Syed | Hostinger (OLD + NEW files/DB), GSC, SEMrush, Surfer, Search Evidence `*.seoproject.json` | Files in `h2o-handoff/…/02_*` and `03_*`; `EXPORT_NOTES.txt` ×2; answers to A1–A8 | `verify_handoff.py` 11/11 |
| **2. Security pass on archives** | Claude | Archives + SQL | `SECURITY_FLAGS.md` v2 (wp-config sanitised, `wp_options` secret rows named, WooCommerce PII tables listed) | No unsanitised secret in the workspace |
| **3. Freeze both versions + live** | Claude (from the Mac — needs DNS) | Archives served locally; live site | Discovery-pack outputs: `URL_MASTER.csv`, `CONTENT_TRIAGE.csv`, `MEDIA_MASTER.csv`, `INTERNAL_LINK_GRAPH.csv`, `SCHEMA_MASTER.json`, `claude-pages/`; Factory `seo-baseline.json` + screenshots of OLD (via `capture-baseline.mjs`); `OLD_SITE_INVENTORY.csv`, `NEW_SITE_INVENTORY.csv`, `OLD_VS_NEW_COMPARISON.csv`, `REDIRECT_BASELINE.csv`, `SCHEMA_HREFLANG_BASELINE.json` | Every sitemap URL and every internally linked URL accounted for |
| **4. Evidence bundle R1** | Claude (adapter) | `*.seoproject.json`, GSC/SEMrush CSVs | `evidence-bundle/R1.json`, `SEO_EQUITY_MAP.csv`, `DATA_GAPS.md` | Bundle validates; `coverage.gsc=true` |
| **5. Decisions R1 (draft)** | Claude as OGCS controller | R1 + triage + strategic scope | `page-decisions/R1.json` (draft), `CONTENT_TRIAGE.csv` completed, `PRELIMINARY_PAYLOAD_CONTENT_MODEL.md`, `PROPOSED_INFORMATION_ARCHITECTURE.md`, `H2O_TOPICAL_AUTHORITY_MAP.md` | Every URL has an action; every PRUNE has `prune_blocked=false` with evidence; every REVIEW has a question for Syed |
| **6. Owner review → approved** | Syed | Draft decisions | `page-decisions/R1.json` (approved), `PAGE_DECISIONS.csv`, `FINAL_PAGE_ACTIONS.csv`, `REDIRECT_MAP.csv`, `SEO_PRESERVATION_PLAN.md`, `MULTILINGUAL_RESEARCH_PLAN.md` | `decisions_status=approved` |
| **7. Factory prerequisites** | Factory team (parallel with 1–6) | `factory-prerequisites.md` | P1–P6 merged | syed.ai parity 20/20; threat tests green |
| **8. Import + app** | Claude / Factory | OLD (or NEW) SQL + uploads + decisions R1 | `apps/h2o-cooling/` (from `apps/syed-ai`), `h2o-cooling.blueprint.json` v2, collections Services / Projects / Parts / Part Categories / Articles / Locations / People / Media / Redirects, design contract from the chosen design source | Importer golden test; seed idempotent; blueprint validates |
| **9. Staging + QA** | Factory CI | Blueprint; OLD baseline | Staging deploy; `qa-report/R1.json`; OGCS QA passes A/B/C on staging URLs | `result=pass`, `protect_urls_missing=0`, all published pages `verified`, launch gate green |
| **10. Launch** | Syed approves; Factory deploys | — | `deploy-event` (production); DNS cut-over; 30-day monitoring window in OGCS | Post-launch parity vs approved staging passes within 24 h |
| **11. Steady state** | OGCS | Weekly evidence bundles | Lane-B green tactics daily within budget; Lane-A `page-decisions/R2…` for structural changes | Each `qa-report` pass |

## What H2O will prove about the architecture

- That a `page-decisions` file is sufficient to drive a migration end-to-end without OGCS touching Payload.
- That the parity gate catches redirect and canonical mistakes before they reach production (the `qa-report` example in `03_CONTRACTS/examples/` shows the kind of failure expected).
- That Lane B can run against a real client with the `automation` service account and leave a clean audit trail.
- What `tools/create-site` must template (H2O is the second app; the delta from `apps/syed-ai` is the specification).

## Known constraints going in

- The discovery-pack crawler could not resolve `h2ocooling.com` from a sandbox; run it from the Mac.
- GSC UI exports are row-capped; prefer the Search Evidence connector (100k rows/table) and record `gsc_row_cap_hit` in the bundle.
- WooCommerce status is unknown (A4); if active, the URL count and the Parts/Part Categories model change materially, and customer tables must be stripped from the SQL before analysis.
- Both live versions must remain untouched until step 10.
