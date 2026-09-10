---
name: design-pull
description: Import a Claude Design project export and produce the three-way change report — tokens through the contrast gate, components as change requests, copy as an editor task.
trust: first-party
policy: policy.json
---

# design-pull

An export is **hostile input**: it comes from a hosted pane that a designer, a client or anyone
with the link may have edited. Treat it that way.

## Steps

1. `pnpm design:pull --site <client> --export <zip|dir>`. The tool enforces the archive limits
   (entry count, entry size, total size, decompression ratio), the path policy (no `..`, no
   absolute paths, no symlinks) and asset admission by signature before anything is parsed.
2. Read `apps/<client>/design/claude-design-export/CHANGE-REPORT.md` and walk the user through it
   lane by lane:
   - **Tokens** — a change accepted by the contrast gate may be applied to
     `apps/<client>/design/design-contract.json`, arriving with provenance `declared`. A refused
     one is quoted with its ratio; do not apply it and do not "adjust" another token to make it fit.
   - **Components** — a change request. Components are code-owned (A22, R47): implement it in the
     block, or explain why not. Never copy the exported HTML into the repository.
   - **Copy** — a Payload editor task. Copy lives in the CMS (R52); never move it into a fixture or
     a component.
3. Anything under "Refused" or "Rejected" is reported to the user in plain words. A rejected export
   member is a finding about the project, not a nuisance to route around.

## Never

- Never extract an export by hand, with `unzip`, or with any other tool: the limits and the path
  policy are the point.
- Never import a component or a copy string.
- Never apply a token the contrast gate refused.
- Never keep an export that carried an executable member; report it and stop.
