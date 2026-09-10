---
name: design-sync
description: Publish a built design-system bundle into the client's Claude Design project, after the handshake and the gates agree. Runs only from an interactive session on the owner's machine.
trust: first-party
policy: policy.json
---

# design-sync

Publishes `apps/<client>/design/ds-bundle/` into that client's Claude Design **system project**.
It publishes; it does not build, and it does not decide. Everything it needs has already been
computed by the repository (ADR-026 §1: produce → publish → record).

## Refuse before you do anything

Run `pnpm design:sync-status --site <client>` first and **read the status out loud to the user**.

- `unavailable-in-this-session` — you are in a cloud session or a session without `/design-login`.
  **Say so and stop.** Do not describe the push as done, queued, or pending. The honest sentence is:
  "I built the bundle; the design-system sync has to run from Claude Code on your Mac after
  `/design-login`, so nothing has been pushed." (ADR-026 spike result 4.)
- `blocked-residue` / `blocked-render-check` — a gate failed for this bundle. Stop; nothing is
  published from a bundle whose gates are red.
- `blocked-no-bundle` — run `pnpm design:bundle --site <client>` first.
- `ok` — this exact bundle is already in the project. Nothing to do.
- `never-synced` / `stale` — proceed.

## Steps

1. `pnpm design:bundle --site <client> --check` — build and prove determinism.
2. `pnpm design:gates --site <client>` — residue and cross-client leakage over the built bundle.
3. Read `apps/<client>/design/ds-bundle/_factory/manifest.json`.
4. **Handshake** (R50), in this order, refusing on the first failure:
   - the target project's type is `design-system` (immutable — pushing never converts a project);
   - the remote `_factory/manifest.json` names the same `site`, **or** the project is empty and is
     being claimed;
   - the remote manifest hash equals the one recorded at the last pull (R54 — otherwise someone
     edited the project since; pull, show the diff, stop).
5. Push only files whose SHA-256 differs from the remote manifest. Delete only files this tool
   wrote before and the bundle no longer contains. Files you did not write are **reported, never
   touched** (R47). `_ds_manifest.json` is the pane's — never write it.
6. Record the result: append a Design decision row to `docs/content-verification-ledger.md`
   (tier `system`, version = contract hash + revision) **only after** the push returned a remote
   manifest hash.

## Never

- Never claim a sync that did not return a remote manifest hash. The status model refuses to record
  one (`recordSync` throws), and so should you.
- Never push a bundle built with `--neutral` into a client's project.
- Never push into a project whose `site` differs, "just this once".
- Never run anything not listed in `policy.json`.
