# CRM_SHARED_CHANGE_REQUESTS — H2O / ICS CRM-1

**SHARED_CHANGE_REQUIRED = 0.** CRM-1 needed no change to `packages/agency-core` or `apps/syed-ai`.
Both are byte-identical to baseline:

- agency-core: typecheck 0, 29/29 tests passing;
- syed-ai: typecheck 0.

Two observations about the shared layer are recorded for a future generic Revenue Engine. They are **not
requests** and nothing depends on them.

| #   | Path                                                                           | Observation                                                                                                                                                                                                  | Affected                                         | Migration effect                                                              | Syed.ai risk                                 | Safest alternative (used)                                        |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| O-1 | `packages/agency-core/src/cms/collections/crm.ts` — `contacts.emailNormalized` | Documented as "+tag stripped, gmail dots folded". That conflicts with E0.1 `email_match_key` ("provider-specific alias collapsing is forbidden"). A generic engine shared with ICS would need the E0.1 rule. | syed-ai (the only registrant of agency-core CRM) | Changing it re-keys existing syed-ai contacts and may create unique conflicts | High: dedupe behaviour of live syed.ai forms | H2O-local `crm-contacts` with an E0.1 key                        |
| O-2 | `packages/agency-core/src/cms/hooks/audit.ts` — `REDACT_VALUES`                | A hard-coded slug set. Any new PII collection outside it gets `summary = name/email`. A per-collection flag (e.g. `custom.auditRedactValues`) would be safer by default.                                     | All apps using `auditAfterChange`                | None (hook behaviour only)                                                    | Low if additive                              | H2O-local PII-safe audit adapter writing to the same `audit-log` |

The H2O CRM uses `crm-`-prefixed slugs, so co-registering the agency-core CRM layer later would not
collide.
