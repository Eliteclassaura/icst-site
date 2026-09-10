# Legacy reference — read-only

The two directories beside this file are extractions of the supplied archives (ADR-001), **unmodified except for the redactions listed in rule 3** (ADR-027, applied before the repository was first pushed):

| Directory | Archive | SHA-256 of archive |
|---|---|---|
| `syed-ai-site/` | `syedaisite.zip` | `426b6da589708c43bb79ae507bda621010c008e22a67f0b668eb6a7a2219cf62` |
| `search-evidence-suite/` | `searchevidencesuiteaireadiness.zip` | `d60051ffb5ea0f7ca0e67744da174795be963488e1a13e89a34d1631448e230b` |

Rules:

1. Nothing here is edited, reformatted or "fixed" beyond the redactions in rule 3. Compare the migration against it; do not build on it.
2. No application package may import from this directory. The `quality-gates` residue scan fails the build if it does, or if strings from the two items below appear anywhere else in the repository.
3. **Redacted in this copy (ADR-027):**
   - `syed-ai-site/subscribers.php:20` and `syed-ai-site/diagnose.php:20` contained a hard-coded access key, now `<legacy-admin-key-redacted>`. Treat the original as **compromised**; the owner removes it from the live host per `docs/runbooks/legacy-exposure.md` (risk R1). The residue scanner still recognises the original by SHA-256.
   - `search-evidence-suite/search-evidence-console/proxy.php:48–87` contained a private client allowlist, now `redacted-client-host-NN.invalid`; the SHA-256 of each host is in `allowlist.sha256.json` beside it so the scanner can still detect a leaked host. Never reconstruct the list in packages, fixtures, tests, docs or generated client output (risk R2).
   - The pristine, unredacted archives (hashes above) are held by the owner offline (Mac: `~/Projects/agency-site-factory-workspace/review-materials/inputs/`). They are never committed anywhere.
4. The two archives contain no production secrets, no `syedai-config.php`, and no subscriber or lead data. Keep it that way.
5. This repository must remain private while this directory exists in it.
