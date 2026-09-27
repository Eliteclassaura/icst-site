# CRM_ENTITY_RELATIONSHIPS — H2O / ICS CRM-1

```
                         users (existing auth — owners, assignees, actors, authors)
                           │
crm-accounts ──< crm-sites ──< crm-assets (account derived from site)
   │   │  └─ parent_account (self, reporting only)
   │   └──< crm-contacts (account link + confidence; employment ≠ project membership)
   │
   └──< crm-opportunities >── site (optional; must be on the account)
          │   └── assets[] (optional; must be on the opportunity's site; NEVER for NEW_TOWER)
          ├──< crm-buying-group-members >── crm-contacts   (unique per opportunity+contact)
          ├──< crm-rfqs (optional link; same account only)
          └── origin_rfq → crm-rfqs

crm-rfqs ──< crm-rfq-items ── product → products (exact slug only)
   ├── contact / account / site (deterministic or human links)
   ├── intake_event → crm-intake-events (raw verified delivery)
   └── duplicate_of → crm-rfqs (human-marked)

crm-activities  → account · contact · site · asset · opportunity · rfq · task   (append-only timeline)
crm-notes       → account · contact · site · asset · opportunity · rfq
crm-tasks       → account · contact · site · asset · opportunity · rfq · identity_review
crm-suppressions (keyed on email_match_key; optional contact)  — append-only ledger
crm-identity-reviews → contact · account · rfq · intake_event
audit-log (existing) ← written by the CRM audit adapter for every CRM create/update/delete
```

## Rules the relationships carry, enforced in hooks

| Relationship                       | Rule                                                                                                                   | Guard                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Site → Account                     | required; **write-once** (re-parenting would silently move towers and projects)                                        | `writeOnce`                                    |
| Asset → Site                       | required; write-once; `account` derived from the site server-side                                                      | `deriveAccountFromSite`                        |
| Opportunity → Account              | required; **write-once**                                                                                               | `writeOnce`                                    |
| Opportunity → Site                 | must belong to the opportunity's account                                                                               | `scopeBinding`                                 |
| Opportunity → Assets               | need a site; each asset on that site; refused for `NEW_TOWER`                                                          | `scopeBinding`                                 |
| Buying-group member                | `(opportunity, contact)` unique and write-once; a cross-account contact only as EPC/consultant/OTHER **with evidence** | `membershipRules`                              |
| RFQ → Site / Opportunity           | same account as the RFQ                                                                                                | `linkAndStatusRules`                           |
| RFQ → Contact/Account (automation) | may fill an empty link, never replace one                                                                              | `SERVER_RELINK_FORBIDDEN`                      |
| Contact → Account                  | needs a confidence; VERIFIED link changeable by admins only; automation never relinks                                  | `accountLinkConsistency`, `serverNeverRelinks` |
| RFQ item → Product                 | only when `product.slug === product_slug_source`                                                                       | `productResolution`                            |
| Task / Note                        | at least one subject record                                                                                            | `taskRules`, `stampAuthor`                     |

## Commercial hierarchy (frozen)

`Contact → Account → Plant/Site → Asset/Cooling Tower → Opportunity` — Contacts are buying-group members
attached per project; the commercial object is the Opportunity, bound to an Account and (when known) a
Site and its towers. A greenfield project has an Account (and possibly a Site) and no Asset.
