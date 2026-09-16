# CLAUDE.md — how Claude works in this repository

Read `AGENTS.md` too. This file only covers the tools Claude (Cowork) uses on Scott's Mac.

## ⛔ GitHub work goes through Desktop Commander — not `device_bash`

Established 16 Sep 2026 after a morning lost to it.

- **Desktop Commander** (`start_process`) runs on Scott's Mac itself. `gh` is installed there and
  logged in as `TheTrustLeader` with `repo` and `workflow` scopes. Use it for everything that
  touches GitHub: push, open PRs and issues, post `@codex` comments, check CI, delete branches.
  - Start every command with `export PATH=$PATH:/opt/homebrew/bin` (that is where `gh` lives).
  - Repo path: `~/Documents/GitHub/football-manager-simulation`.
  - Check first: `gh auth status` should say "Logged in to github.com account TheTrustLeader".
- **`device_bash`** runs in a separate sandbox with no `gh` and no GitHub login. It can read the
  folder and the public API only. Pushing from it fails with
  `could not read Username for 'https://github.com'`. That error means "wrong tool", not
  "no access".
- The cloud shell (`Bash`) has no access to this repo at all.

Scott is not technical. Never hand him a command to paste or a step to do in GitHub if
Desktop Commander can do it. Only merges into `main` are his.

## ⛔ Ship done — never "fine for now"

Scott's rule, 16 Sep 2026. Things parked as "not important now" have fallen through the gaps
and been hard to reconcile when they mattered.

- A change is finished only when **every gap found in it is fixed in that same change**.
  "Not important now", "fine for now" and "later" are not reasons to merge.
- Anything found in review — a surviving mutant, a value that is looked up but never used,
  a changed save format with no test — goes back to Codex **on the same issue** before the PR
  is recommended for merge.
- A PR is ready only when its description has **no open points**. If it lists any, say
  "not ready" to Scott.
- The only work that may wait is work **split out on purpose before building starts**. It
  must have its own GitHub issue, linked from the brief, before the PR merges. No "later"
  lists that live only in a handover or a PR note.

## Standing rules (from the project instructions)
- Never merge, force-push or delete a branch without Scott's OK.
- After any git command, run `find .git -name '*.lock'` and remove only lock files you created.
- Never read an exit code through a pipe.
