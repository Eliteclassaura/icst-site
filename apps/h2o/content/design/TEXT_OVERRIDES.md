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

**Rules (Control Tower guardrails):**
- An entry applies only when its exact text appears exactly the stated number of times.
- If the source changes so the text no longer matches, the entry stops applying. Tests and the post-deploy conformance check then fail, and the server logs a warning naming the entry id.
- Nothing fuzzy or partial is ever applied.

**Backlog (post-launch):** migrate each entry into real, editable data where the content model allows. For example, make
project highlights and JSON-LD descriptions follow the edited SEO fields. The registry should shrink to zero over time.
