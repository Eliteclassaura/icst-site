# ICST redirect ledger

`ledger.tsv` (tab separated, first line `from	to	status	note`; lines starting with `#` and blank lines are ignored). Produced from the URL contract by Corpus.

Rules (enforced by `apps/h2o/src/client/site/redirects.ts`, checked by the test `redirects-ledger.test.ts` on every run, and again when the proxy loads the file; a row that breaks one is dropped and logged, never half-applied):

- `status` is `301` or `410`. A 410 has an empty `to`.
- A 301 goes to ONE final page that exists in `content/pages/`, is not the home page and is not `noindex`. The destination is never itself a `from` (zero chains, no loops).
- A `from` appears once, is not a live page, is not `/`, and is never a platform path (`/api`, `/admin`, `/crm`, `/_next`).
- `/a/b` and `/a/b/` are the same source; a query string is ignored and not carried to the destination.
