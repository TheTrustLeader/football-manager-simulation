# Delivery log — how work has actually arrived

One entry per attempt to get code from an agent into this repository. This file
records the **delivery mechanism**, not the content of the work. It exists
because the same delivery failure has now cost several separate days, and each
time the evidence lived only in a chat.

Every claim below is labelled **EXECUTED** (a command was run and its output
quoted) or **REASONED** (read and concluded).

---

## Round: issue #38 (FM-17-B6) — 23 Sept 2026

**Outcome: NOTHING ARRIVED. No branch, no pull request, no diff.**

This was the first brief written under the new delivery rules (AGENTS.md
sections 1–4, merged as PR #37 at 16:23 BST on 23 Sept 2026). It was a
deliberate test of whether the cloud agent pushes when it is asked to. It does
not.

### What was asked

**EXECUTED** — the `@codex` trigger comment on issue #38, posted 15:55 BST,
asked for: a branch `codex/issue-38-r1-prove-zero-control-ran`, a push, a push
verification comparing local `git rev-parse HEAD` against
`git ls-remote --heads origin refs/heads/<branch>`, and a draft pull request.
It also said, in the same comment:

> If the push genuinely fails, say `PUSH ATTEMPT FAILED — UNPUBLISHED`, include
> the error, and then fall back to the diff in a **four-backtick** fenced block.
> Do not go quiet.

### What came back

**EXECUTED** — one comment from `chatgpt-codex-connector[bot]` at 16:35 BST. It
reported:

- a local commit `6b3cf955d95824ba2d74f27efe504cb7a1a77a38` on the requested
  branch name;
- a failed push, quoted verbatim:
  `fatal: could not read Username for 'https://github.com': No such device or address`
- `git ls-remote --heads origin refs/heads/codex/issue-38-r1-prove-zero-control-ran`
  returning no remote SHA, and an explicit statement that the branch is **not
  published** and no PR number exists;
- full test and mutant evidence, including red lines for all five mutants.

**EXECUTED** — the report did **not** contain the diff, and did **not** end with
one of AGENTS.md section 2's three required status lines. Its closing section
said the patch was withheld because "the trigger explicitly forbids pasting the
diff into the report".

### What was verified on this end

All checks run 23 Sept 2026 16:45 BST from the local clone, against GitHub:

- **EXECUTED** — `git fetch --prune origin` then
  `git ls-remote --heads origin 'refs/heads/codex/issue-38*'` — returned nothing.
  The branch does not exist on the remote.
- **EXECUTED** — `gh pr list --state open` — open PRs are #35 and #36 only.
  No pull request exists for issue #38.
- **EXECUTED** — `git cat-file -t 6b3cf955d95824ba2d74f27efe504cb7a1a77a38` —
  `fatal: could not get object info`. That commit exists nowhere outside the
  agent's own sandbox.
- **EXECUTED** — `git rev-parse origin/main` — `283479f`. Main has moved since
  the brief was written (it named `8145d53`), because PR #37 merged at 16:23 BST.

**REASONED** — no verification of the work was possible, because no work
arrived. The test counts, mutant kills and red lines in the report are claims
about code nobody outside that sandbox has seen.

### The findings

**1. The cloud agent cannot push. This is now measured, not assumed.**

**REASONED** — `could not read Username for 'https://github.com'` is an absent
credential, not a permissions refusal. The sandbox has no GitHub identity to
push with. AGENTS.md section 1 previously said that an agent pushing on its own
"has not yet been proved" and that issue #38 was the first brief to ask for it.
It has now been asked for once, and it failed. PR #36 reached GitHub because
Scott pressed the Codex Cloud task's "Create draft PR" button by hand — that
button, not the agent, is what has ever published from that environment.

**2. The DIFF MODE check in section 1 cannot go red on this repository.**

**REASONED** — `git ls-remote --heads origin` tests **read** access. This
repository is public, so that command answers anonymously, with no credentials
at all. The agent's own run of `ls-remote` returned cleanly — it simply returned
no matching branch. So the section 1 check reports PUSH MODE even in a sandbox
that demonstrably cannot push, and there is no input for which it reports DIFF
MODE here. It is a control that never fires: the house defect, in a process
document rather than a test.

**3. A ⛔ and a conditional fallback in the same brief will be read as the ⛔.**

**REASONED** — the brief said "do not paste the diff" and, four paragraphs
later, "if the push fails, fall back to the diff". The agent obeyed the
prohibition and dropped the fallback, and the finished work was stranded. The
prohibition was written to stop diffs being used *instead of* pushing; it was
read as an absolute. A fallback that sits underneath a prohibition of the same
thing is not a fallback.

**4. The "merged with current main" claim is unproven.**

**REASONED** — the report claims `git fetch origin main; git merge --no-commit
--no-ff origin/main` returned "Already up to date." from a branch based on
`8145d53`. By 16:35 BST `origin/main` was `283479f`, two commits ahead. A
genuine fetch-and-merge at that moment could not have been a no-op. Either the
fetch happened before PR #37 merged, or it did not reach GitHub. Treat the
merged-with-main verification as not done.

### What it costs

**EXECUTED** — the work is not destroyed. It is committed inside the completed
Codex Cloud task for issue #38, which offers a "Create draft PR" button. That
button is the only route to it, and only Scott can press it.

---

## Issue #41 (FM-ERA-1) — 24 Sept 2026 — the diff route worked first time

**EXECUTED** — brief posted 09:16 BST asking for a push OR a complete
four-backtick diff, with no prohibition against either. Codex reported at
10:08 BST: push failed (`'origin' does not appear to be a git repository`),
complete diff posted. Its SHA `ce98609` does not exist on GitHub.

**EXECUTED** — at 10:40 BST Claude extracted the diff, `git apply --check`
passed, numstat matched Codex's reported 9 files line for line, and it was
pushed as `ce4bdfe` and opened as draft PR #42. Time from report to PR: about
30 minutes, with no step needed from Scott.

**REASONED** — with the prohibition gone, the fallback route is now reliable.
The "Create draft PR" button is still preferred because it cannot truncate.

---

## Issue #17 (FM-17-B7) — 25 Sept 2026 — no diff posted, the button carried it

**EXECUTED** — brief posted ~12:48 BST, asking for a push OR a complete
four-backtick diff. Codex reported at 13:27 BST with "NO REMOTE — DIFF MODE"
but **posted no diff block**, only a file list with line counts. The diff route
was not available. Scott pressed "Create draft PR" at ~14:34 BST, and it arrived
as PR #45 (non-draft), which Claude converted to draft.

**REASONED** — asking for the diff does not guarantee it. The button is the
reliable route. When a report arrives without a four-backtick block, go
straight to the button.

---

## Earlier rounds, for context

**REASONED** — recorded from AGENTS.md, which states these as already-paid
costs; not re-verified here.

- **8 Sept 2026** — three agents each reported "created the pull request" with
  no branch, commit or PR on GitHub. All had committed inside containers that
  were then discarded. This is why section 2 exists.
- **Issue #9** — a diff fenced with three backticks was closed early by a
  backtick inside the patch and arrived truncated at line 36 of 38, failing to
  apply with "corrupt patch at line N". This is why section 3 demands four
  backticks.
- **22 Sept 2026** — a report was accurate to the line, including a mutant's red
  output. Only the code never arrived.
- **23 Sept 2026 (FM-17-B5, PR #36)** — the brief forbade pushing and opening a
  PR, and asked for a diff. The diff was truncated in transport and a day went
  on diagnosing a GitHub permissions fault that did not exist. PR #36 was opened
  by hand from the Codex Cloud task.
