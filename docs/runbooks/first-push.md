# First push to GitHub (ADR-027)

Run once. **Nothing is pushed while the redacted literals still exist in history.**

## 1. Sanitisation (done in the working tree — commit `security: redact …`)

- `legacy-reference/syed-ai-site/{subscribers,diagnose}.php`: key → `<legacy-admin-key-redacted>`
- `legacy-reference/search-evidence-suite/search-evidence-console/proxy.php`: client hosts → `redacted-client-host-NN.invalid`; hashes in `allowlist.sha256.json`
- `docs/discovery/*.md`: same replacements
- `packages/quality-gates`: scanner reads hashes; tests use a planted key; `pnpm gates:scan` clean

## 2. History rewrite (on the owner's Mac — a Claude session's safety classifier refuses to run `git filter-repo`)

The literals still exist in the nine pre-sanitisation commits; the rules are derived from the repository's own pre-rewrite history (tag `c5`), so no pristine archive is needed.

```bash
brew install git-filter-repo                       # once
cd ~/Projects
git clone agency-site-factory-transfer/asf.bundle agency-site-factory-clean
cd agency-site-factory-clean
node tools/scripts/make-replacements.mjs --from-git c5 > /tmp/replacements.txt   # 18 rules
git filter-repo --replace-text /tmp/replacements.txt --force                     # rewrites every commit (26 at the time of writing), re-points tags
rm -P /tmp/replacements.txt                                                       # the rules file holds the literals
```

## 3. Verify — every commit, every file, by hash

```bash
node tools/scripts/verify-history-clean.mjs        # "history clean: <N> commits, no legacy key, no allowlist host" — N equals `git log --oneline | wc -l` before the rewrite
git tag                                            # c3-r1 c4 c5
git log --oneline | wc -l                          # same count as before the rewrite
```

Keep the bundle and the pre-rewrite mirror (`agency-site-factory-prefilter.git`) **offline only**; delete them from any cloud workspace.

## 4. Remote and protection

```bash
git remote add origin https://github.com/Eliteclassaura/agency-site-factory.git   # or the SSH URL
git push -u origin main --tags                      # authenticates with your own GitHub login (gh auth login / credential helper)
```

Then in GitHub (or via `gh api` with the token):

- Repository: **Private**. Settings → General → disable wiki, projects; enable "Automatically delete head branches".
- Branch protection on `main`: require a pull request before merging; **required approving reviews: 0** (owner alone) / **1** with "Require review from Code Owners" (designer engaged); require status checks to pass (select the CI jobs after the first run: `checks`, `docker`, `guards`); require linear history; do not allow force pushes or deletions; include administrators.
- Actions: allow GitHub-owned actions and the pinned third-party actions in `ci.yml` only. Secrets: **none** are needed for CI — the suite runs with mock providers. Coolify's preview webhook is configured on the Coolify side with a deploy key, not a repository secret.
- Security: enable secret scanning and push protection; Dependabot alerts off (Renovate is configured).
- Collaborators: none until a designer is engaged (`docs/designer-onboarding.md`).

## 5. Afterwards

- `agency-site-factory-clean` becomes the working copy on the Mac; the older `agency-site-factory-workspace/agency-site-factory` (pre-rewrite ids) is deleted or archived offline.
- If a token was created for branch-protection setup, revoke it.
- Close R42 in `docs/risks.md` (done in ADR-027); record the push date in the ledger's Security actions table.
