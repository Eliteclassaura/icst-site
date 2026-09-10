# Threat model

Per ADR-018. Each leak vector has an automated test; a vector without a passing test is an open risk, not a mitigated one. Tests live in `apps/syed-ai/test/threat-model.test.ts` and run against a real Payload + PostgreSQL with access control enforced (`overrideAccess: false`). Cloudflare-layer controls are configuration and are verified on the launch checklist rather than in unit tests.

## Assets

Client PII (submissions, contacts, leads, subscribers, activities), unpublished content (drafts), business configuration (integrations, email identities), credentials (env only), the audit trail, and the site's SEO surface (canonicals, indexability, redirects).

## Actors

Anonymous visitors and bots; authenticated users in six roles; a compromised or careless admin; a supply-chain package; the AI providers (opt-in only).

## Leak vectors and controls

| #   | Vector                                 | Control                                                                                                                                                                                                          | Test                            |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | **URL / id guessing**                  | UUID primary keys everywhere; hidden documents return **404**, not 403, so existence is not confirmed; drafts invisible to anonymous by id                                                                       | Vector 1 (3 tests)              |
| 2   | **List and search endpoints**          | Access rules return a `Where` clause for anonymous (published only) so filtering happens in SQL; sensitive collections refuse `find`/`count` entirely                                                            | Vector 2 (2 tests)              |
| 3   | **Role escalation / cross-role reads** | Six roles; sensitive collections readable only by CRM roles + admins; matrix test of every role × sensitive collection                                                                                           | Vector 3 (55 tests)             |
| 4   | **Unauthorised writes**                | Viewer/analyst cannot write content; sales cannot publish; system-only collections (`audit-log`, `outbox`, `submissions`) reject API creates for every role; `activities` immutable; deletes admin-only          | Vector 4 (5 tests)              |
| 5   | **Audit trail**                        | Publish, redirect, role change, login, config change and deletes write `audit-log` rows; PII collections log changed _keys_ only, never values; log is admin-read-only, never writable through the API           | Vector 5 (2 tests)              |
| 6   | **Accounts**                           | No self-signup (only admins create users); role field admin-only (an editor's attempt to self-escalate is stripped, verified); users read only themselves unless admin; DB sessions; lockout 5 attempts / 15 min | Vector 6 (3 tests)              |
| 7   | **API surface**                        | GraphQL disabled and its routes removed; playground gone; explicit CORS/CSRF origin lists (no `*`) — an unlisted origin receives no `Access-Control-Allow-Origin` (verified by curl in C3)                       | Vector 7 (1 test)               |
| 8   | **Data-quality gates in the model**    | Media requires `alt` and `rights`; redirect loops rejected; slugs validated; a published slug change auto-creates a 308 from the old URL                                                                         | Vector 8 (2 tests)              |
| 9   | **Exports**                            | CSV/Payload exports of PII require `client-admin`+ and write an `export` audit action; CSV cells starting `=+-@` are prefixed (R13)                                                                              | Release 2 (C6)                  |
| 10  | **Emails / notifications**             | Every outbound message is an `outbox` row first; templates escape all visitor-supplied fields; raw IP never stored (salted hash)                                                                                 | C6 tests                        |
| 11  | **AI context**                         | Provider calls only via the gateway; permission-filtered context; PII/private fields redacted; `generated` provenance; nothing writes to scored fields                                                           | C7 tests                        |
| 12  | **Media URLs**                         | Site `media` is public by design; CRM attachments live in `private-files` (CRM roles only, S3 prefix `private`)                                                                                                  | Vector 3 covers `private-files` |
| 13  | **Logs**                               | Structured logging with correlation ids; secrets and PII redacted; `debug` detail never reaches the browser                                                                                                      | Release 7 log-redaction tests   |
| 14  | **Backups**                            | `age`-encrypted, key held offline (R28); restore drill                                                                                                                                                           | Release 7                       |
| 15  | **Build/bundle**                       | `.env` never in image or standalone bundle (scan); no telemetry (`NEXT_TELEMETRY_DISABLED` everywhere); `pnpm audit --prod --audit-level high` in CI; Renovate                                                   | C1/C3 CI steps                  |
| 16  | **Staging exposure**                   | Staging `noindex` + Cloudflare Access; per-environment indexability gate (R24)                                                                                                                                   | C9                              |
| 17  | **Admin exposure**                     | Cloudflare Access (SSO + MFA) in front of `/admin` at launch (R25); Payload lockout as second layer                                                                                                              | Launch checklist                |

## Residual risks accepted for Release 1

Within one client deployment, isolation between roles is application-level (Payload access rules), not database-level (RLS) — mitigated by the matrix tests and by each client having its own database (ADR-005). Payload has no native MFA; Cloudflare Access supplies it at the edge. Rate limiting inside the app is coarse until C6 adds Postgres-backed buckets for forms and auth.

## Maintenance

A new collection is not done until it has a row in the Vector 3 matrix (`SENSITIVE_COLLECTIONS` if it holds PII) and, if it is public, a Vector 1/2 test. Any new outbound integration adds a row to this table before it is enabled.
