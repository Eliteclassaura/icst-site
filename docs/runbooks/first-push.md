# First push to GitHub (ADR-027, amended by ADR-031)

Run once, on the owner's machine. Four steps.

> **This runbook changed on 2026-09-10.** It used to begin with a `git filter-repo` rewrite of the nine pre-sanitisation commits, run against an offline bundle. That bundle lived on a Mac that is no longer accessible, so **the first push now starts a fresh history** (ADR-031). Nothing is rewritten, because nothing carrying the literals is pushed at all.

## What is being pushed

The clean working tree at tag `c5.5` — the same content the handoff package carries — imported as a new repository. No commit from the pre-sanitisation era exists in it, so there is nothing to strip.

The redactions themselves are already in the working tree and stay there:

- `legacy-reference/syed-ai-site/{subscribers,diagnose}.php`: key → `<legacy-admin-key-redacted>`
- `legacy-reference/search-evidence-suite/search-evidence-console/proxy.php`: client hosts → `redacted-client-host-NN.invalid`, with hashes in `allowlist.sha256.json`
- `docs/discovery/*.md`: the same replacements
- `packages/quality-gates`: the scanner works from those hashes, never from the literals

## 1. Import the working tree

From the handoff package (`FACTORY_CURRENT_REPO_<date>.zip`), or from the existing working copy if you have one:

```bash
cd ~/Projects
unzip FACTORY_CURRENT_REPO_2026-09-10.zip     # → agency-site-factory/
cd agency-site-factory
git init
git add -A
git commit -m "import: Agency Site Factory at c5.5 (fresh history — ADR-031)"
git tag c5.5
```

One commit, one tag. The checkpoint tags that came before (`c3-r1` … `c8`) are not recreated: they pointed at commits that no longer exist. The full 31-commit log, with subjects, is in the handoff package's `GIT_STATE.md` and in `docs/handoff/` — that is where provenance lives now.

## 2. Prove the history is clean before adding a remote

```bash
node tools/scripts/verify-history-clean.mjs
pnpm install && pnpm gates:scan
```

The first walks every commit and every file, matching by SHA-256, and prints `history clean: 1 commits, no legacy key, no allowlist host`. The second scans the working tree. **Do not add the remote until both are green** — this is the whole safety property, and it now costs one command instead of a rewrite.

## 3. Remote

```bash
git remote add origin https://github.com/Eliteclassaura/agency-site-factory.git   # or SSH
git push -u origin main --tags
```

Authenticates with your own GitHub login (`gh auth login`, or the credential helper).

## 4. Repository settings

In GitHub, or via `gh api`:

- Repository: **Private**. Settings → General → disable wiki and projects; enable "Automatically delete head branches".
- Branch protection on `main`: require a pull request; **required approving reviews: 0** while you work alone (the gates are the reviewer) or **1** with "Require review from Code Owners" once a designer is engaged; require status checks (select after the first run: `checks`, `docker`, `guards`); require linear history; no force pushes, no deletions; include administrators.
- Actions: allow GitHub-owned actions and the pinned third-party actions in `ci.yml` only.
- Security: enable secret scanning **and push protection**. Dependabot alerts off (Renovate is configured).
- Environments: create `staging` and `production`; put `COOLIFY_WEBHOOK` and `COOLIFY_TOKEN` in each as secrets, `STAGING_URL` / `PRODUCTION_URL` as variables, and add a required reviewer to `production`.
- Collaborators: none until a designer is engaged (`docs/designer-onboarding.md`).

## Afterwards

- **Watch the first CI run.** The `docker` job carries C8's remaining acceptance (`docker build`, non-root, image contains no `.env` / `legacy-reference` / tests / fixtures / `handoff`, readiness 200 and 503-on-database-down, Compose smoke test) and the five C5.5 steps. A red `docker` job is unfinished C8, not a new problem.
- If you created a token for the settings step, revoke it.
- Close R42 in `docs/risks.md` and record the push date in the ledger's Security actions table.

## Still outstanding, and unrelated to git

**`docs/runbooks/legacy-exposure.md` (R1).** The compromised admin key is live on the legacy host until you rotate it. Rewriting or abandoning git history never addressed that, and it is the more urgent of the two.
