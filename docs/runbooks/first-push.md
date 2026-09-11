# First push to GitHub (ADR-027, amended by ADR-031, corrected 2026-09-10)

Run once, on the new Mac. **You are restoring a git history that already exists in the handoff package — you are not creating one.**

> **Two corrections, both on 2026-09-10.** First, the `git filter-repo` rewrite left the plan: the machine holding the only offline copy of the pre-rewrite history is gone, and shipping that history anywhere to enable a rewrite would move live secrets through a hosted surface to run a rewrite whose only purpose is removing them (ADR-031). Second, an earlier draft of _this_ runbook told you to import the current tree as one commit and tag it `c5.5`. **Do not do that.** The current tree is C5.5 _plus_ the ADR-031 recovery changes; labelling it `c5.5` would make the checkpoint tag mean two different sets of bytes. The package therefore ships a pre-built, already-verified two-commit history with the tag in the right place.

## What you are restoring

A freshly constructed sanitized history with no pre-sanitisation object in it:

|     | Commit                                                                                   | Tree                                                       |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | `import: Agency Site Factory C5.5 exact tree — fresh sanitized history` · **tag `c5.5`** | byte-identical to the historical C5.5 checkpoint `aaa7652` |
| 2   | `docs(adr-031): new-Mac recovery and fresh-history first-push procedure`                 | byte-identical to historical `61ffb5f`                     |
| 3   | `docs(first-push): restore the clean bundle rather than relabelling the current tree`    | this correction                                            |

Commit SHAs differ from the historical ones — a new history always produces new SHAs. **What was verified is the tree content**, by git tree-object SHA and by a full per-file SHA-256 manifest, both recorded in the package's `VERIFICATION_REPORT.md`.

## 1. Restore

```bash
cd ~/Projects
unzip AGENCY_SITE_FACTORY_NEW_MAC_GITHUB_HANDOFF_2026-09-10.zip
cd agency-site-factory-github-handoff
shasum -a 256 -c SHA256SUMS.txt          # every artefact, including the bundle

git clone AGENCY_SITE_FACTORY_CLEAN_GIT_HISTORY_2026-09-10.bundle ~/Projects/agency-site-factory
cd ~/Projects/agency-site-factory
git log --oneline --decorate            # 3 commits; c5.5 on the first
```

## 2. Verify before adding a remote

```bash
node tools/scripts/verify-history-clean.mjs
pnpm install && pnpm gates:scan
```

The first walks **every commit and every file in this history**, matching by SHA-256, and must print `history clean: 3 commits, no legacy key, no allowlist host`. The second scans the working tree.

**Do not add the remote until both are green.** This is the whole safety property.

Optional, and worth the minute — confirm the restored trees are the ones that were verified:

```bash
git rev-parse c5.5^{tree}    # expect c0a4727c959019a59e380bb237644eddb4e7050a
git rev-parse HEAD~1^{tree}  # expect 2d6a364de7815ca92db04066d385e2511bcf455a
```

## 3. Remote

```bash
git remote add origin https://github.com/Eliteclassaura/agency-site-factory.git   # or SSH
git push -u origin main --tags
```

Authenticates with your own GitHub login (`gh auth login`, or the credential helper). Only `c5.5` is pushed as a tag; the earlier checkpoint tags (`c3-r1` … `c8`) pointed at commits that no longer exist and are not recreated. Their provenance is the commit log in `GIT_STATE.md` and the reports under `docs/handoff/`.

## 4. Repository settings

In GitHub, or via `gh api`:

- Repository: **Private**. Settings → General → disable wiki and projects; enable "Automatically delete head branches".
- Branch protection on `main`: require a pull request; **required approving reviews: 0** while you work alone (the gates are the reviewer), or **1** with "Require review from Code Owners" once a designer is engaged; require status checks (select after the first run: `checks`, `docker`, `guards`); require linear history; no force pushes, no deletions; include administrators.
- Actions: allow GitHub-owned actions and the pinned third-party actions in `ci.yml` only.
- Security: enable secret scanning **and push protection**.
- Environments: create `staging` and `production`; `COOLIFY_WEBHOOK` and `COOLIFY_TOKEN` as secrets in each, `STAGING_URL` / `PRODUCTION_URL` as variables, and a required reviewer on `production`.
- Collaborators: none until a designer is engaged (`docs/designer-onboarding.md`).

## Afterwards

- **Watch the first CI run.** The `docker` job carries C8's remaining acceptance (`docker build`, non-root, image contains no `.env` / `legacy-reference` / tests / fixtures / `handoff`, readiness 200 and 503-on-database-down, Compose smoke test) plus the five C5.5 steps. A red `docker` job is unfinished C8, not a new problem.
- Revoke any token created for the settings step.
- Close R42 in `docs/risks.md`; record the push date in the ledger's Security actions table.

## Still outstanding, and unrelated to git

**`docs/runbooks/legacy-exposure.md` (R1).** The compromised admin key is live on the legacy host until you rotate it. No amount of git hygiene touches that, and it is the more urgent of the two.
