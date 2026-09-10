# AI providers — the runtime AI boundary (C7)

> Runtime AI is **optional and off by default**. The public site, CMS, CRM, forms, search audits and email workflows all work with every provider disabled (master prompt §3). Build-time AI (Claude writing this code) and runtime AI (features on a client's site) are different systems with different rules (§4); this document is only about the second.

## Two switches, both off

| Switch                    | Where                      | Default       |
| ------------------------- | -------------------------- | ------------- |
| `AI_ENABLED`              | environment                | unset (= off) |
| `integrations.ai.enabled` | Payload global, per client | `false`       |

Both must be true, **and** a provider must resolve, before any call happens. `integrations.ai.status` is a read-only virtual field that tells an admin exactly which switch is off. `integrations.ai.features` then decides which of the six opt-in features are permitted; a feature not in that list is refused even with both switches on.

Provider keys are environment-only. No key is ever stored in a Payload field, sent to the browser, or written to a log.

## Everything goes through the gateway

`packages/providers` (`@factory/providers/ai`) is framework-free — no CMS, no Next, no Payload — and lint enforces that. A caller names a prompt id and hands over a record; the gateway decides everything else, in this order, before a provider exists:

1. **Enabled** — `AI_ENABLED` and the client switch (`disabled`).
2. **Feature** — in the client's `features` list (`feature-not-enabled`).
3. **Permission** — the caller's context says yes (`not-permitted`).
4. **Budget** — inside the daily call and cost caps (`budget-exceeded`).
5. **Prompt** — exists in the registry (`no-provider` for an unknown id; callers cannot supply prompt text).
6. **Redaction** — the prompt's allow-list is applied and the result is scanned (`redaction-refused`).

Then it calls the provider with a timeout, validates the reply against the prompt's schema (`invalid-output`), and stamps provenance. `timeout` and `invalid-output` and `provider-error` are `retryable`; every policy refusal is not.

## Redaction is an allow-list, and PII refuses the call

Each prompt in `packages/providers/src/ai/prompts.ts` declares `allow`: the only dot paths that may reach a provider. Everything else in the record is dropped before the adapter is constructed — the adapter cannot see what it was not given. Then the surviving values are scanned for email addresses, phone numbers, IPs, long hex digests, API-key shapes and private-key blocks. A hit **refuses the call** rather than masking it, because a prompt that genuinely needs one of those is a policy decision, not a redaction bug. `lead-summary`, for example, receives the brief and the answer bands, never the contact's name, address, IP hash or spam internals.

Callers may **shorten** a prompt's timeout (`maxTimeoutMs`), never lengthen it.

## Provenance, and what AI may never touch

Every success carries `provenance: 'generated'`, provider, model, prompt id + version, timestamp, confidence and token usage. Generated content is labelled, reviewable and never authoritative:

- **AI never writes a deterministic field.** `leads.score` and `scoreBreakdown` are computed from `lead-score-rules`; the `leadSummary` job asserts the score is unchanged after it runs and throws if it is not. Generated text never improves a score.
- **AI never publishes.** `aiInsight` has `reviewedBy` / `reviewAction`; a human accepts, edits or rejects.
- **AI writes go to `aiInsight` only**, never to page content, SEO fields, `verification.*` or `_status`.
- Every call writes an `audit-log` row with `action: 'ai'` and a `detail` object of **metadata only** — provider, outcome, dropped-field count, token usage, duration. Never the prompt, never the completion, never a field value from a PII collection.

## Budgets

`AI_MAX_CALLS_PER_DAY` (default 200) and `AI_MAX_COST_USD_PER_DAY` (default 5). Today's spend is counted from the `action: 'ai'` audit rows, so the budget and the audit trail cannot disagree. Exceeding either cap refuses further calls until the next UTC day.

## Providers

| Provider                                                        | Status                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `mock`                                                          | **Implemented.** Deterministic — same input, same output, no network, no clock. The only provider in Releases 1–5, and the one CI uses.    |
| `anthropic`, `openai`, `openai-compatible` (Qwen, Ollama, vLLM) | Release 6/7. `AI_PROVIDER` naming any of them today resolves to **no provider**, so the gateway refuses rather than silently falling back. |

The free/self-hosted profile (local Qwen through the OpenAI-compatible adapter, with a fallback chain for classification and summaries only, and PII never leaving for a free tier) is a Release 7 backlog item; provider terms are re-checked at wiring time (R7).

## Adding a prompt

Add it to `PROMPTS` with an id, a semver `version`, its feature, the narrowest possible `allow` list, a zod output schema, a timeout and a token cap, and deterministic system text with no caller interpolation. Widening an `allow` list is a reviewable change with a data-policy consequence — say so in the PR and update `integrations.ai.dataPolicyNote`.

## Testing

`packages/providers` has 12 unit tests covering both switches, feature and permission refusals, unknown prompt ids, the allow-list projection, the refuse-on-PII path, a spy provider proving an undeclared field never arrives, budget exhaustion, timeout, schema rejection, determinism and provenance. `apps/syed-ai/test/ai.test.ts` adds seven integration tests: disabled is a reported no-op that does not touch the lead, and enabled produces a labelled insight with an unchanged score and a metadata-only audit row. CI runs the whole suite with AI off, and the AI tests flip the switches themselves.
