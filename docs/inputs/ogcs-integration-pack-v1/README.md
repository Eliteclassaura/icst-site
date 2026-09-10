# OGCS × Agency Site Factory — Integration Pack v1

**Purpose:** give the Agency Site Factory project everything it needs to plan for OGCS (Syed's private Organic Growth Control System) and the Search Evidence Suite, based on an actual inspection of the Factory code at HEAD `88f5469` (2026-09-05).

**Headline decision (proposed ADR-026):** OGCS is a *separate* system with its own database and deploy. It touches client sites in two ways only — structural changes through the blueprint and parity gate, content changes through a scoped `automation` service account — and exchanges five versioned JSON artefacts with the Factory. The Factory adds one dependency-free contracts package, one auth collection, and fixes five pre-existing gaps that any WordPress migration needs.

## Read in this order

| # | File | Who | Minutes |
|---|---|---|---|
| 1 | `00_SUMMARY/WRITEUP_FOR_FACTORY_TEAM.md` | Everyone | 5 |
| 2 | `01_ADR/ADR-026-ogcs-and-search-evidence-integration.md` | Factory maintainers — drop into `docs/decision-log.md` | 5 |
| 3 | `02_DOCS/publishing-lanes.md` | Anyone touching access/hooks | 5 |
| 4 | `02_DOCS/factory-prerequisites.md` | Whoever schedules the work — P1–P8 with acceptance criteria | 5 |
| 5 | `02_DOCS/seo-contracts.md` + `03_CONTRACTS/` | Whoever builds `packages/seo-contracts` | 10 |
| 6 | `02_DOCS/ogcs-runtime.md` | Context on what will call the Factory, when, with what credentials | 5 |
| 7 | `02_DOCS/h2o-pilot-plan.md` | Sequencing for the first client | 3 |
| 8 | `04_FACTORY_CHANGE_SKETCHES/` | Implementers — sketches against real helper names | as needed |
| 9 | `05_INTAKE/` | Background: the full architecture decision (v1.1), readiness report, security flags, export checklist | reference |
| 10 | `06_CODEX/RESPONSE_TO_CODEX.md` | The reply to the team that produced the original handoff package | reference |

## Contents

```
OGCS_FACTORY_INTEGRATION_PACK_v1/
├── README.md
├── 00_SUMMARY/WRITEUP_FOR_FACTORY_TEAM.md
├── 01_ADR/ADR-026-ogcs-and-search-evidence-integration.md
├── 02_DOCS/
│   ├── ogcs-runtime.md              how the OGCS agent runs: deployment, loop, schedule, gates, credentials, failures
│   ├── publishing-lanes.md          Lane A (blueprint) vs Lane B (service account); hooks; decision table; threat-model impact
│   ├── seo-contracts.md             the five contracts, package layout, transport v1/v2
│   ├── factory-prerequisites.md     P1–P8 with evidence of each gap and acceptance criteria
│   └── h2o-pilot-plan.md            step-by-step for H2O Cooling
├── 03_CONTRACTS/
│   ├── schemas/                     JSON Schema 2020-12: evidence-bundle, page-decisions, qa-report, deploy-event, blueprint-v2
│   └── examples/                    one validated example per transport contract
├── 04_FACTORY_CHANGE_SKETCHES/      roles patch, service-accounts collection, automation hooks, migration fields,
│                                    proxy/seed redirects, seo-contracts skeleton, wordpress-import spec, emitWebhook task
├── 05_INTAKE/                       INPUT_READINESS_REPORT, MISSING_INPUTS_CHECKLIST, SECURITY_FLAGS,
│                                    AGENCY_SITE_FACTORY_INTEGRATION_DECISION (v1.1)
└── 06_CODEX/RESPONSE_TO_CODEX.md
```

## What is *not* in scope for the Factory

Building or hosting OGCS; running the Search Evidence Suite; holding GSC/SEMrush/Surfer credentials; giving OGCS database access; shipping any `search-*` code in a client image (ADR-023 stands).

## Verification performed

All four transport schemas validate their examples; the three negative `page-decisions` fixtures (PRUNE while blocked, REDIRECT without target, approved without approver) are rejected. Every Factory claim cites a file path and was re-checked against the checkout. No secret values from any source were read or reproduced; the Search Evidence `proxy.php` host allowlist is deliberately not enumerated anywhere in this pack.
