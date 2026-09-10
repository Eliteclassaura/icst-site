# handoff/ — artefacts crossing the OGCS boundary (ADR-028 §5, transport v1)

Files here are produced by the Factory for OGCS and validated against `@factory/seo-contracts`:

- `qa/<run_id>.json` — `factory.seo/qa-report`, written by `pnpm qa:report` from the parity gate's JSON report (CI does this on every run; the committed one is the latest local run).
- `deploy/<run_id>.json` — `factory.seo/deploy-event`, written by `pnpm deploy:event` from the deploy step (staging/production only; not committed from local runs).
- `decisions/<run_id>.json` — `factory.seo/page-decisions`, **written by OGCS**, consumed by the importer / decisions-apply. None yet.

Nothing here contains evidence, credentials or email addresses — the contract schema refuses email strings, and raw Search Evidence / OGCS evidence never enters this repository.
