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
| TO-015 | /product/brentwood-kelly-bar-splash-fill/ | structured data name and headline (2×) | "Brentwood Kelly Bar Splash Fill \| Drift Eliminato" | "Brentwood Kelly Bar Splash Fill \| Cooling Tower Fill" | SC1-P5-01 (SEO-CONTENT-1) |
| TO-016 | /product/brentwood-accupac-htp25-modular-splash-fill/ | structured data name and headline (2×) | "Brentwood Accupac HTP25 Modular Splash Fill \| Drift Eliminator" | "Brentwood Accupac HTP25 Modular Splash Fill" | SC1-P5-02 (SEO-CONTENT-1) |
| TO-017 | /product/splash-fill/ | structured data name and headline (2×) | "Splash Fill \| Drift Eliminator" | "Splash Fill \| Cooling Tower Fill" | SC1-P5-03 (SEO-CONTENT-1) |
| TO-018 | /product/cooling-tower-hybrid-fill/ | structured data name and headline (2×) | "Cooling Tower Hybrid Fill \| Drift Eliminator" | "Cooling Tower Hybrid Fill \| Replacement Fill Media" | SC1-P5-04 (SEO-CONTENT-1) |
| TO-019 | /product/low-fouling-fill/ | structured data name and headline (2×) | "Low Fouling Fill \| Drift Eliminator" | "Low Fouling Fill \| Cooling Tower Fill" | SC1-P5-05 (SEO-CONTENT-1) |
| TO-020 | /product/brentwood-de120-blade-drift-eliminator/ | structured data name and headline (2×) | "Brentwood DE120 Blade Drift Eliminator \| Cooling Tower Fill Media" | "Brentwood DE120 Blade Drift Eliminator - ICS" | SC1-P5-06 (SEO-CONTENT-1) |
| TO-021 | /product/brentwood-d15-cellular-drift-eliminator/ | structured data name and headline (2×) | "Brentwood D15 Cellular Drift Eliminator \| Fill Media Replacement" | "Brentwood D15 Cellular Drift Eliminator - ICS" | SC1-P5-07 (SEO-CONTENT-1) |
| TO-022 | /all-projects/bacman-1-2/ | structured data name and headline (3×) | "BacMan 3 Cooling Tower Rehabilitation Philippines \| ICS" | "BacMan 1 & 2 Cooling Tower Rehabilitation Philippines \| ICS" | SC1-P7-BACMAN-TITLE (SEO-CONTENT-1) |
| TO-023 | /all-projects/bacman-1-2/ | structured data description | "ICS completed BacMan 3 cooling tower rehabilitation in the Philippines with a splash-to-film fill upgrade." | "ICS completed BacMan 1 & 2 cooling tower rehabilitation in the Philippines with a splash-to-film fill upgrade." | SC1-P7-BACMAN-META (SEO-CONTENT-1) |
| TO-024 | /ics-announces-comprehensive-cooling-technology-seminar-thailand/ | body-range | "Contact:" | "" | SC1-A-001 (SEO-CONTENT-1 round 2) |
| TO-025 | /ics-announces-comprehensive-cooling-technology-seminar-thailand/ | body | "from 8: 30 to 5:30" | "from 8:30 to 5:30" | SC1-A-003 (SEO-CONTENT-1 round 2) |
| TO-026 | /class-10000-minimum-acoustic-geometry/ | body | "HVAC cooling applications" | "" | SC1-A-HVAC-CLASS10000 (SEO-CONTENT-1 round 2) |
| TO-027 | /ics-announces-comprehensive-cooling-technology-seminar-thailand/ | schema | "Learn everything you need to know about cooling towers and air coolers in one day! Attend expert-led sessions " | "ICS hosted a one-day seminar in Thailand on cooling tower and air cooler design, operation and technology, wit" | SC1-A-004-ld (SEO-CONTENT-1 round 2) |
| TO-028 | /cooling-tower-maintenance-checklist/ | schema | "Maximize efficiency with our 2026 cooling tower maintenance checklist. Learn to prevent corrosion, ensure safe" | "Maximize efficiency with our 2026 cooling tower maintenance checklist. Learn to prevent corrosion, improve saf" | SC1-A-080-ld (SEO-CONTENT-1 round 2) |
| TO-029 | /understanding-the-uses-of-cooling-towers-in-industrial-processes/ | schema | "Advantages of Cooling Towers in HVAC Industries" | "Advantages of Cooling Towers in Industrial Processes" | SC1-B-028 (SEO-CONTENT-2) |
| TO-030 | /understanding-the-uses-of-cooling-towers-in-industrial-processes/ | body | "Advantages of Cooling Towers in HVAC Industries" | "Advantages of Cooling Towers in Industrial Processes" | SC1-B-028 (SEO-CONTENT-2) |
| TO-031 | /category/blog/page/9/ | body-remove | "A Guide to 2026 HVAC Cooling Tower Systems & Optimization" | "" | SC1-C-020 (SEO-CONTENT-2) |
| TO-032 | /category/cooling-tower-parts/ | body-remove | "What is HVAC Cooling Tower: Role of Cooling Towers in HVAC Systems" | "" | SC1-C-029 (SEO-CONTENT-2) |
| TO-033 | /category/others-language/ | body-remove | "Apa itu Menara Pendingin HVAC: Peran Menara Pendingin dalam Sistem HVAC" | "" | SC1-C-037 (SEO-CONTENT-2) |
| TO-034 | /category/others-language/ | body-remove | "Tháp giải nhiệt HVAC là gì: Vai trò của tháp giải nhiệt trong hệ thống HVAC" | "" | SC1-C-039 (SEO-CONTENT-2) |
| TO-035 | /category/others-language/page/2/ | body-remove | "HVAC 冷却塔とは: HVAC システムにおける冷却塔の役割" | "" | SC1-C-041 (SEO-CONTENT-2) |
| TO-036 | /category/others-language/page/2/ | body-remove | "หอคอยทำความเย็น HVAC คืออะไร: บทบาทของหอคอยทำความเย็นในระบบ HVAC" | "" | SC1-C-043 (SEO-CONTENT-2) |
| TO-037 | /category/uncategorized/page/16/ | body-remove | "HVAC 冷却塔とは: HVAC システムにおける冷却塔の役割" | "" | SC1-C-051 (SEO-CONTENT-2) |
| TO-038 | /category/uncategorized/page/16/ | body-remove | "หอคอยทำความเย็น HVAC คืออะไร: บทบาทของหอคอยทำความเย็นในระบบ HVAC" | "" | SC1-C-053 (SEO-CONTENT-2) |
| TO-039 | /cooling-tower-materials/ | body-href | "https://h2ocooling.com/cooling-tower-materials/#HVAC_and_District_Cooling_Systems" | "https://h2ocooling.com/cooling-tower-materials/#District_Cooling_Systems" | SC1-C-131 (SEO-CONTENT-2) |
| TO-040 | /cooling-tower-vs-chiller/ | body-href | "https://www.trane.com/residential/en/resources/glossary/what-is-hvac/" | "" | SC1-C-138 (SEO-CONTENT-2) |
| TO-041 | /frp-cooling-tower-fans/ | body-href | "https://h2ocooling.com/frp-cooling-tower-fans/#Data_Centers_and_Large_HVAC_Systems" | "https://h2ocooling.com/frp-cooling-tower-fans/#Data_Centers_and_Mission-Critical_Facilities" | SC1-C-143 (SEO-CONTENT-2) |
| TO-042 | /hybrid-and-dry-cooling-technologies/ | body-href | "https://www.rsi.edu/blog/hvacr/what-is-evaporative-cooling/" | "" | SC1-C-146 (SEO-CONTENT-2) |
| TO-043 | /industrial-cooling-tower-automation/ | body-href | "https://www.trane.com/residential/en/resources/glossary/what-is-hvac/" | "" | SC1-C-148 (SEO-CONTENT-2) |
| TO-044 | /tag/cooling-tower-fancooling-tower-fan-bladescooling-tower-fan-motorcooling-tower-frp-fanfan-bladesfrp-fan-bladescooling-tower-parts/ | body-remove | "What is HVAC Cooling Tower: Role of Cooling Towers in HVAC Systems" | "" | SC1-C-280 (SEO-CONTENT-2) |
| TO-045 | /tag/cooling-tower-fill/ | body-remove | "Tháp giải nhiệt HVAC là gì: Vai trò của tháp giải nhiệt trong hệ thống HVAC" | "" | SC1-C-284 (SEO-CONTENT-2) |
| TO-046 | /tag/cooling-tower-parts/ | body-remove | "HVAC 冷却塔とは: HVAC システムにおける冷却塔の役割" | "" | SC1-C-287 (SEO-CONTENT-2) |
| TO-047 | /tag/cooling-tower/ | body-remove | "Apa itu Menara Pendingin HVAC: Peran Menara Pendingin dalam Sistem HVAC" | "" | SC1-C-291 (SEO-CONTENT-2) |
| TO-048 | /tag/cooling-tower/ | body-remove | "หอคอยทำความเย็น HVAC คืออะไร: บทบาทของหอคอยทำความเย็นในระบบ HVAC" | "" | SC1-C-293 (SEO-CONTENT-2) |
| TO-049 | /understanding-the-uses-of-cooling-towers-in-industrial-processes/ | schema | "of Cooling Towers in HVAC Industries" | "of Cooling Towers in Industrial Processes" | SC1-C-103 (SEO-CONTENT-2) |
| TO-050 | /international-cooling-tower/ | body-remove | "Heating and air conditioning:" | "" | SC1-CA-15 (SEO-CONTENT-2) |
| TO-051 | /international-cooling-tower/ | schema | ",{"@context":"https://schema.org","@type":"SiteNavigationElement","@id":"#rank-math-toc","name":"Heating and a" | "" | SC1-CA-16 (SEO-CONTENT-2) |
| TO-052 | /understanding-the-uses-of-cooling-towers-in-industrial-processes/ | schema | "#advantages-of-cooling-towers-in-hvac-industries" | "#advantages-of-cooling-towers-in-industrial-processes" | SC1-CA-17 (SEO-CONTENT-2) |
| TO-053 | /air-coolers/ | schema | "ICS designs, installs, upgrades, and services industrial air cooler systems for factories, plants, loading doc" | "ICS upgrades, repairs, and services industrial air-cooled heat exchangers (air coolers) for refineries, petroc" | SC1-TA-083 (SEO-CONTENT-2) |
| TO-054 | /cooling-tower-cost-in-2025/ | schema | "Cooling Tower Cost 2025: Comprehensive Guide and Cost Breakdown" | "Cooling Tower Cost 2025: Guide and Cost Breakdown" | SC1-QT-01 (SEO-CONTENT-2) |
| TO-055 | /understanding-the-uses-of-cooling-towers-in-industrial-processes/ | schema | "Understanding the Uses of Cooling Towers in Industrial Processes" | "Uses of Cooling Towers in Industrial Processes" | SC1-QT-07 (SEO-CONTENT-2) |
| TO-056 | /cooling-tower-malaysia/ | schema | "Cooling Tower Malaysia | Heavy-Duty Industrial Cooling Solutions" | "Cooling Tower Malaysia | Industrial Cooling Solutions" | SC1-QT-11 (SEO-CONTENT-2) |
| TO-057 | /cooling-tower-sludge-removal/ | schema | "Cooling Tower Sludge Removal: Effective Basin Cleaning Strategies" | "Cooling Tower Sludge Removal: Basin Cleaning Strategies" | SC1-QT-12 (SEO-CONTENT-2) |
| TO-058 | /cooling-solutions-for-chemical-process-plants-cooling-towers/ | schema | "Cooling Solutions for Chemical Process Plants | Cooling Towers" | "Cooling Solutions for Chemical Process Plants" | SC1-QT-17 (SEO-CONTENT-2) |
| TO-059 | /product/sumitomo-hansen-p4-single-stage-gearbox/ | schema | "Sumitomo Hansen P4 Single Stage Gearbox | Cooling Tower Gearbox" | "Sumitomo Hansen P4 Single Stage Gearbox" | SC1-QT-18 (SEO-CONTENT-2) |
| TO-060 | /cooling-tower-energy-efficiency/ | schema | "Improve Cooling Tower Energy Efficiency: Proven Cost Strategies" | "Improve Cooling Tower Energy Efficiency: Cost Strategies" | SC1-QT-19 (SEO-CONTENT-2) |
| TO-061 | /product/c-e-shepherd-square-pattern-nozzles/ | schema | "C.E. Shepherd Square Pattern Nozzles | Replacement Spray Nozzle" | "C.E. Shepherd Square Pattern Nozzles" | SC1-QT-20 (SEO-CONTENT-2) |
| TO-062 | /product/amarillo-a-series-single-reduction-gearbox/ | schema | "Amarillo A-Series Single Reduction Gearbox | Replacement Gearbox" | "Amarillo A-Series Single Reduction Gearbox" | SC1-QT-21 (SEO-CONTENT-2) |
| TO-063 | /cooling-tower-wet-bulb-temperature/ | schema | "Cooling Tower Wet Bulb Temperature: Measurement and Application Guide" | "Cooling Tower Wet Bulb Temperature: Measurement Guide" | SC1-QT-23 (SEO-CONTENT-2) |
| TO-064 | /cooling-tower-wood-material/ | schema | "Cooling Tower Wood Material: Types, Durability, and Modern Shifts" | "Cooling Tower Wood Material: Types and Durability" | SC1-QT-26 (SEO-CONTENT-2) |
| TO-065 | /cooling-tower-fan-analysis/ | schema | "Cooling Tower Fan: A Look At Cooling Tower Fan Efficiency Pt. II" | "A Look At Cooling Tower Fan Efficiency Pt. II" | SC1-QT-27 (SEO-CONTENT-2) |
| TO-066 | /cooling-tower-basin-coating/ | schema | "Cooling Tower Basin Coating: 7 Secrets for a 30-Year Lifespan" | "Cooling Tower Basin Coating Guide" | SC1-QT-29 (SEO-CONTENT-2) |
| TO-067 | /cooling-tower-construction-repair-in-singapore/ | schema | "Cooling Towers in Singapore | Cooling Tower Servicing Singapore" | "Cooling Towers in Singapore | Cooling Tower Servicing" | SC1-QT-32 (SEO-CONTENT-2) |
| TO-068 | /choosing-cooling-tower-fill-media/ | schema | "Choosing Cooling Tower Fill Media: Industrial Selection Guide" | "Choosing Cooling Tower Fill Media: Selection Guide" | SC1-QT-33 (SEO-CONTENT-2) |
| TO-069 | /product/brentwood-xf80max-cellular-drift-eliminator/ | schema | "Brentwood XF80MAX Cellular Drift Eliminator | Drift Eliminator" | "Brentwood XF80MAX Cellular Drift Eliminator" | SC1-QT-36 (SEO-CONTENT-2) |
| TO-070 | /indicators-of-cooling-tower-trouble/ | schema | "Spotting Red Flags: Early Indicators of Cooling Tower Trouble" | "Early Indicators of Cooling Tower Trouble" | SC1-QT-37 (SEO-CONTENT-2) |
| TO-071 | /cooling-tower-biofouling/ | schema | "Cooling Tower Biofouling: Essential Microbial Control Strategies" | "Cooling Tower Biofouling: Microbial Control Strategies" | SC1-QT-39 (SEO-CONTENT-2) |
| TO-072 | /product/tower-components-opti-grid-splash-fill/ | schema | "Tower Components Opti Grid Splash Fill | Fill Media Replacement" | "Tower Components Opti Grid Splash Fill" | SC1-QT-46 (SEO-CONTENT-2) |
| TO-073 | /look-cooling-tower-fan-efficiency-pt-3/ | schema | "Cooling Tower Fan: A Look At Cooling Tower Fan Efficiency Pt. III" | "A Look At Cooling Tower Fan Efficiency Pt. III" | SC1-QT-47 (SEO-CONTENT-2) |
| TO-074 | /product-category/motors/ | schema | "Cooling Tower Motors | High-Efficiency Industrial Motor Systems" | "Cooling Tower Motors | Industrial Motor Systems" | SC1-QT-48 (SEO-CONTENT-2) |
| TO-075 | /reducing-carbon-footprint/ | schema | "Sustainable Cooling: Reducing Carbon Footprint in Cooling Towers" | "Reducing Carbon Footprint in Cooling Towers" | SC1-QT-50 (SEO-CONTENT-2) |
| TO-076 | /product/tower-components-opti-bar-splash-fill/ | schema | "Tower Components Opti Bar Splash Fill | Fill Media Replacement" | "Tower Components Opti Bar Splash Fill" | SC1-QT-52 (SEO-CONTENT-2) |
| TO-077 | /cooling-tower-commissioning-procedure/ | schema | "Cooling Tower Commissioning Procedure: Ensure Peak Performance" | "Cooling Tower Commissioning Procedure" | SC1-QT-54 (SEO-CONTENT-2) |
| TO-078 | /cooling-tower-spares/ | schema | "Cooling Tower Spares - ICS" | "Cooling Tower Spares and Replacement Parts - ICS" | SC1-QT-55 (SEO-CONTENT-2) |
| TO-079 | /product/tower-components-opti-cell-80-drift-eliminator/ | schema | "Tower Components Opti Cell 80 Drift Eliminator | Drift Eliminator" | "Tower Components Opti Cell 80 Drift Eliminator" | SC1-QT-56 (SEO-CONTENT-2) |
| TO-080 | /legionella-control-in-industrial-cooling-towers/ | schema | "Advanced Legionella Control in Industrial Cooling Towers by 2025" | "Legionella Control in Industrial Cooling Towers" | SC1-QT-58 (SEO-CONTENT-2) |
| TO-081 | /air-coolers/ | seo-h1 | "High-Performance Industrial Air Cooler Solutions for Demanding Facilities" | "High-Performance Industrial Air Cooler Solutions for Demanding Plants" | SC1-TA-085 (SEO-CONTENT-2) |
| TO-082 | /guide-about-cooling-tower/ | schema | "What is a Cooling Tower? - H2O Cooling - ICS" | "What is a Cooling Tower? - ICS" | SC1-TA-059 (SEO-CONTENT-2) |

**Rules (Control Tower guardrails):**
- An entry applies only when its exact text appears exactly the stated number of times.
- If the source changes so the text no longer matches, the entry stops applying. Tests and the post-deploy conformance check then fail, and the server logs a warning naming the entry id.
- Nothing fuzzy or partial is ever applied.

**Backlog (post-launch):** migrate each entry into real, editable data where the content model allows. For example, make
project highlights and JSON-LD descriptions follow the edited SEO fields. The registry should shrink to zero over time.
