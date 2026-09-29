# CRM_OPEN_OWNER_INPUTS — H2O / ICS CRM-1

None of these blocked CRM-1. Every item is `DEFERRED_OWNER_INPUT`, and the model holds UNKNOWN or a
labelled provisional value until it is decided.

| #     | Input                                                                                          | Why it matters                              | Current CRM-1 behaviour                                                      |
| ----- | ---------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| OI-01 | **Typeform `F22cAgx3` field refs → CRM targets** (`H2O_CRM_TYPEFORM_FIELD_MAP`)                | Without it, intake cannot identify contacts | RFQs persist as `FIELD_MAPPING_MISSING` and go to review; nothing is guessed |
| OI-02 | Permanent commercial and project stage naming (e.g. `RFQ_RFP_ACTIVE`, `QUOTE_PROPOSAL_ACTIVE`) | Pipeline reporting                          | Frozen E0.1 `stage` plus E1.4 `project_stage`; additive later                |
| OI-03 | Default opportunity owner and RFQ routing / territory model                                    | Assignment                                  | No default; unassigned work shows in the queue                               |
| OI-04 | Reporting base currency and FX source                                                          | Cross-currency totals                       | Per-currency only; no conversion                                             |
| OI-05 | Revenue-recognition source system                                                              | `WON_REVENUE_CONFIRMED`                     | Admin sets CONFIRMED manually; source unknown                                |
| OI-06 | Attribution windows                                                                            | E3 attribution                              | Source context stored; no window logic                                       |
| OI-07 | "Stalled" threshold                                                                            | Overview filter                             | Provisional 30 days, labelled as a view filter                               |
| OI-08 | RFQ first-response SLA / due time                                                              | Task due dates                              | Task due date left empty                                                     |
| OI-09 | Secret store for production values                                                             | Recovery                                    | Design only                                                                  |
| OI-10 | RPO/RTO targets                                                                                | Backup design                               | Proposal: ≤ 15 min with WAL                                                  |
| OI-11 | Data retention, including audit and raw intake payloads                                        | Privacy and legal                           | Kept indefinitely; no deletion job                                           |
| OI-12 | Whether `viewer` may read the CRM pipeline                                                     | Access                                      | viewer has no CRM access (least privilege)                                   |
| OI-13 | Admin bulk-export policy (who, format, audit)                                                  | Data leakage                                | No export feature; non-admin lists capped at 100                             |
| OI-14 | Public `rfq_number` format                                                                     | Customer reference                          | `RFQ-YYYYMMDD-XXXXXXXX`, stable                                              |
| OI-15 | Merge tooling rules (who merges, reversal window)                                              | Dedupe                                      | Review states only; no merge                                                 |
| OI-16 | Production legacy import policy (16,395 rows)                                                  | Import                                      | LOCKED; model ready                                                          |
| OI-17 | Notification behaviour after persistence (who, channel)                                        | E1.1                                        | `NOT_SENT_DISABLED_IN_CRM1`                                                  |
| OI-18 | Whether draft or unpublished products may be linked to RFQ items                               | Product resolution                          | Exact slug over all product rows, drafts included (private CRM only)         |
