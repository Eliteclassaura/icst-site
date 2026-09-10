## What changed, in one paragraph a non-developer can read

<!-- Design PRs: attach the preview:pack screenshots. Content-model PRs: the owner applies the `content-model` label. -->

## Gates run locally

- [ ] `pnpm check` (lint, typecheck, unit)
- [ ] `pnpm gates:scan` (residue and secrets)
- [ ] `pnpm parity:check` (when the site was running)
- [ ] No email address, credential, client hostname or `legacy-reference/` content added (ADR-028 §10)

## Ledger

- [ ] Design or content decision recorded in `docs/content-verification-ledger.md` if this changes what a client approved or what the site publicly states
