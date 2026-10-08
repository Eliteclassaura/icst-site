# Text-override registry: what editors should know

The text in `text-overrides.json` is corrected when a page is shown and published. You may notice the published page saying
something slightly different from the stored source in these places. That is deliberate: each one is a ruled claim correction
(OGCS / Control Tower, 2026-10-05) of text that has **no editable page element**, so it cannot be changed in the admin.

Text that *is* editable was corrected in the page itself (content batch R2.2), so the admin shows exactly what renders.

| Id | Page | Where | Was | Now | Ruling |
|---|---|---|---|---|---|
| TO-001 | /cooling-tower-repair-service/ | structured data (JSON-LD) description | "…with 24/7 emergency response, certified technicians…" | "Cooling tower repair service for industrial facilities: inspection, structural and mechanical repairs…" | CS028, owner Q1 |
| TO-002 | /about-ics-industrial-cooling-solutions/ | structured data description | "a trusted industrial company … across global markets" | "an industrial cooling company … in the USA and Asia" | CS090 |
| TO-003 | /product/tuf-lite-ii-3000h-series-hub-fan-assemblies/ | structured data name and headline (2×) | "Best Hudson Fans" | "Hudson Fans" | CS147 |
| TO-004 | /rt-portfolios/ptt-gsp6-96-fan-ache-performance-upgrade/ | portfolio template text | "by a guaranteed minimum of 15% increased airflow." | "against a minimum 15% airflow-increase target." | CS065 (C4 family) |
| TO-005 | /cooling-tower-construction-repair-in-united-states/ | text placed in a layout block | "world-class expertise … to the United States." | "… expertise to clients across the United States." | CS098 |
| TO-006 | /all-projects/pttcsp/ | project highlight (icon list) | "…upgraded to achieve a minimum 15% airflow improvement" | "…upgraded against a minimum 15% airflow-improvement target" | C4 default |
| TO-007 | /all-projects/pttcsp/ | project highlight (icon list) | "Thermal and static pressure performance guarantees were successfully achieved" | "Fan system re-engineered to meet the plant's thermal and static pressure requirements" | C4 default |
| TO-008 | /cooling-tower-repair-service/ | structured data name and headline (3×) | "Cooling Tower Repair Service \| Fast & Certified Repairs" | "Cooling Tower Repair Service for Industrial Facilities - ICS" | CT ruling (R2.2a), owner Q1 family |
| TO-009 | /cooling-tower-thailand/ | contact line (icon list) | "Call +66 2-661-7723" | "Call +662-661-7723" | OGCS R5b row 38 (published phone format) |
| TO-010 | /cooling-tower-thailand/ | card heading (removed card) | "Institutional Facilities" | (blank) | OGCS R5b row 35: industrial-only rule. A heading cannot be saved empty, so the card is removed here and hidden by design-r5b.css |
| TO-011 | /cooling-tower-thailand/ | card body (removed card) | "Compact, low-noise cooling towers designed for space-constrained buildings…" | (blank) | OGCS R5b row 35 (same card) |
| TO-012 | /cooling-tower-construction-repair-in-singapore/ | second half of a split heading | "Repair In Singapore" | (blank) | OGCS R5b row 20: the split heading becomes one H2; a heading cannot be saved empty |
| TO-013 | /thailand-cooling-tower/ | hero lead (template markup) | "The convenient geography of our service … the Middle East within a day." | "From our Bangkok office, ICS supports cooling tower projects across Thailand and neighboring markets." | OGCS R5b legacy Thailand row 2 (the same sentence in the editable paragraph is claim edit R5B-G02) |
| TO-014 | /cooling-tower/ | structured data description | "…power plants, and large commercial facilities with high thermal performance." | "…power plants, and process plants with high thermal performance." | OGCS R5b commercial row 2 (the meta itself is the seo field) |

**Rules (Control Tower guardrails):**
- An entry applies only when its exact text appears exactly the stated number of times.
- If the source changes so the text no longer matches, the entry stops applying. Tests and the post-deploy conformance check then fail, and the server logs a warning naming the entry id.
- Nothing fuzzy or partial is ever applied.

**Backlog (post-launch):** migrate each entry into real, editable data where the content model allows. For example, make
project highlights and JSON-LD descriptions follow the edited SEO fields. The registry should shrink to zero over time.
