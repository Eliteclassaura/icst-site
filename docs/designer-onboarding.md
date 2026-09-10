# Designer onboarding (ADR-027)

> Applies when a designer is engaged. When the owner works alone, the same loop applies with no reviewer step — branch protection is set to zero required reviewers and the gates are the reviewer.

## Prerequisites (sequenced after C8)

The designer's environment is the Docker Compose stack from C8 (Postgres, web, worker) or the shared staging URL; the design-system bundle alone needs neither. Do not onboard a designer before C8 is complete.

## Accounts and access — what the owner grants

| What                                             | Level                               | Where it lives                                               | Notes                                                                                           |
| ------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| GitHub `Eliteclassaura/agency-site-factory`      | Write to branches; **never `main`** | Repository collaborators                                     | Protected `main` requires a PR; required reviewers set to **1** for the engagement (CODEOWNERS) |
| Claude Design project `<client> — design system` | Edit                                | Owner's Claude workspace                                     | Project is **created by the agency account** and stays agency-owned                             |
| Preview / staging URL                            | Read (basic auth)                   | Designer's own environment (`~/.config/...`), never the repo | Rotated at engagement end                                                                       |
| Payload admin                                    | **None**                            | —                                                            | Designers do not edit content; copy diffs go to the editor                                      |
| Production, deploy credentials, `.env`           | **None**                            | —                                                            | No session deploys (ADR-027 §4)                                                                 |

## The ten-minute loop

1. Open the repo in Claude (Cowork with the folder connected, or Claude Code locally). `CLAUDE.md` tells the session the rules.
2. Say what you want in plain words: "warm the accent one step and tighten the display scale on the pricing page".
3. The session branches, edits `design-contract.json` or a block, runs the gates and `preview:pack`, and opens a PR with the screenshots attached.
4. CI runs; a preview URL appears on the PR within a few minutes.
5. Owner approves (or, when alone, merges once CI is green). Merge deploys staging. Production follows from a tagged release by the owner.

## Working in Claude Design

- `design-sync` publishes the current design system to the client's project — it runs from Claude Code on the Mac after a one-time `/design-login` (cloud sessions cannot reach design-system projects); explore, compose page concepts, propose token changes **in `tokens/design-contract.json`** (A22).
- `design-pull` brings the project back as a three-way report: tokens are imported through the contrast gate, component changes become code change requests, copy changes go to the editor.
- Components edited directly in the project are suggestions; they are discussed, then implemented as code with fixture, tests and a11y notes (R47).

## What the session will refuse (and why)

External fonts (`font-src 'self'`), raw HTML or inline scripts (nonce CSP), migrations or `payload.ts` in a design PR (content-model review), copy in code (CMS is the authority), anything touching `.env`, `legacy-reference/`, or production. `CLAUDE.md` lists them; the refusals come with the reason and the right route.

## Offboarding a designer

Remove repository access; set required reviewers back to 0 if the owner is alone again; rotate the preview credentials; remove Claude Design project edit access; note the date in the ledger.
