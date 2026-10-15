# ICST redirect ledger: validation report

Ledger: `clients/icst/redirects/ledger.tsv` (113 rows: 104 x 301, 9 x 410)
Contract: `ICST_URL_CONTRACT.tsv` (647 URLs from BL-1, 647 checked live at 1 req/s)

**Result: 16 PASS, 0 FAIL**

| Check | Result | Detail |
|---|---|---|
| zero redirect chains | PASS | 0 chains  |
| zero redirects to home except the named alias exception | PASS | 0 unexpected; named exception 'home alias': /home.html |
| zero redirects to noindex pages except the named sitemap exception | PASS | 6 noindex-target rows; named exception 'sitemap index target' (X-Robots-Tag noindex): /category-sitemap.xml, /dt_portfolio-sitemap.xml, /page-sitemap.xml, /post-sitemap1.xml, /post-sitemap2.xml, /product-sitemap.xml |
| every 301 target returns 200 | PASS | 0  |
| ledger statuses are 301 or 410 only | PASS | 0 |
| 410 rows carry no target | PASS | 0 |
| no self-redirects | PASS | 0 |
| each URL ends in exactly one of 200, single 301, or intentional 410 | PASS | 0 |
| 525 mapped URLs keep their paths (except CT-ruled cart, EverCompare, portfolio) | PASS | 0  |
| no 410 for URLs that have clicks | PASS | 0  |
| live 301s carried unchanged (same status and target) | PASS | 13/15 unchanged; EXCEPTIONS (live target is home, CT rule): /cooling-system-technician-skill-2/ -> 410 ; /services/ -> 301 /cooling-tower-maintenance/ |
| /uploads media paths kept 200 | PASS | 12 media, 0 not 200 |
| 15 to 25 rows flagged for CT signature | PASS | 15 flagged |
| cart 301 to /parts/ | PASS | /parts/ |
| EverCompare 410 | PASS | 410 |
| /cooling-towers/ stays 200 | PASS | FLAGGED: CT-1 ruling: stays 200; needs distinct title/H1 (live H1 is 'Air Cooler |

## Notes
- Chains are checked against the ledger: no target is itself a redirect source. Live targets were checked in BL-1 (the 15 live 301s each end in a 200).
- `/cooling-towers/` must change its H1 (live H1 is 'Air Coolers') and canonical to `/new-towers/`. These are Main/Commander edits, not ledger rows.
- Targets outside the 525 map (`/tech-articles/`, `/parts/`, `/projects/`, `/gear-box/`, `/tools/`) are checked against live BL-1 status.
- The validator is read-only. It does not contact the site.
