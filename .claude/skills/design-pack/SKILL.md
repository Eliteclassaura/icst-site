---
name: design-pack
description: Publish a client approval pack (component cards, page previews, tokens board) as a private Artifact and deliver the PDF, then record the approval tier in the ledger.
trust: first-party
policy: policy.json
---

# design-pack

Publishes the **client-facing** surface: a private Artifact page plus the PDF. Unlike `design-sync`,
this one *can* run from a cloud session — that is the whole reason the client path does not depend
on the design-system project (ADR-026 §2).

## Steps

1. `pnpm preview:pack --site <client> --pages <slugs> --base <url>` against a **running** site.
   Before launch that is the seeded local or staging site; after launch it is the real one, so the
   pack can never show stale copy (ADR-026 §5).
2. Read `apps/<client>/design/packs/<date>-<hash>/pack-manifest.json`. Refuse to publish if
   `blocking > 0`, if `residue.ok` is false, or if any artboard exceeds the size cap.
3. Publish `pack/index.html` as a **private** Artifact titled `<Client> design pack`, labelled with
   the contract hash and revision from the manifest.
4. Deliver `pack.pdf` as a file. Never link it from the page: the artifact sandbox blocks in-page
   downloads, so a link would be a dead button.
5. Append a Design decision row to `docs/content-verification-ledger.md` (tier `page`, version,
   artifact URL). When a client comment thread contains `APPROVED`, record the thread id on that row
   and mark it verified; open questions stay open threads.

## Never

- Never publish a pack whose manifest reports blocking findings or a failed residue scan.
- Never publish a pack that contains another client's identity — the residue scan covers this, and a
  cross-client hit is a stop, not a warning.
- Never make the pack public, and never paste a client's pack URL into another client's thread.
- Never edit the pack HTML by hand to "fix" something: fix the source and rebuild, or the manifest
  hashes stop meaning anything.
