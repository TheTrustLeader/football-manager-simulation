# AGENTS.md — rules for any AI agent working in this repository

These are not suggestions. Each one has already cost a round of work.

This file is this repository's own. The Match Lab shares no code, infrastructure
or process machinery with any other project, and that boundary is deliberate —
see "Project boundary" in README.md. Do not import conventions from elsewhere,
and do not assume a register, an item ID scheme or a directory exists here
because it exists in another repo.

**Work items here are GitHub issues in this repository.** The item ID is the
issue number.

## 1. Decide HOW you will deliver before you start — this never stops you working

Run the check first and record the answer:

```
git ls-remote --heads origin >/dev/null 2>&1 && echo PUSH MODE || echo DIFF MODE
```

- **PUSH MODE** — a remote answers. Publish by pushing, then verify (section 2).
- **DIFF MODE** — no remote, or it refuses. Do the work anyway and hand it back
  as a patch (section 3).

⛔ **A missing remote is a delivery constraint, not a stop condition.** Today it
is the NORMAL case here: the cloud agent environment has no `origin` and no
token. That is expected, it is not a fault, and it is not a reason to decline the
task. An agent that stops before starting has produced nothing, which is strictly
worse than an unpushed diff.

Do not print remote URLs, credentials, or authentication environment variables.
Where an error you are asked to quote contains a URL or token, quote the error
and replace that part with `[redacted]`.

## 2. A local commit is NOT a delivered result

**Publication means the remote has your commit. Nothing else counts.**

After pushing:

1. Record the local commit: `git rev-parse HEAD`
2. Ask the remote what it actually has:
   `git ls-remote --heads origin refs/heads/<exact-branch-name>`
3. Compare the two SHAs.
4. Report `PUBLISHED` **only when they match.**
5. Otherwise report `UNPUBLISHED`, include the push error, and **do not describe
   the branch as available, fetchable or created.**

Never treat any of these as evidence of publication: a local commit SHA · a local
branch · a zero exit from `git commit` · an attempted push · your own intention
to push.

End every report with exactly one of these three lines:

- `REMOTE SHA VERIFIED — PUBLISHED` — include the SHA the remote returned
- `PUSH ATTEMPT FAILED — UNPUBLISHED` — include the error, plus the diff from
  section 3
- `NO REMOTE — DIFF MODE` — the expected case here, plus the diff from section 3

On 8 Sept 2026 three agents each reported "created the pull request" when no
branch, commit or pull request existed on GitHub. All three had committed only
inside a container that was then discarded. That is what these rules exist to
stop.

## 3. In DIFF MODE, return the work as a patch

A push failure is expected in this repository. **Silence, or a false claim of
success, is the fault.**

1. Post the complete patch as a single fenced diff block: `git diff <base-sha>..HEAD`
   (commit locally first, so there is a HEAD to diff).
   ⛔ **If the diff contains backticks - and it will whenever you touch a
   markdown file - open and close the block with FOUR backticks, ````diff.**
   Three-backtick fences are closed early by the first ``` inside the patch, and
   the reader gets a diff truncated mid-hunk that fails to apply with "corrupt
   patch at line N". This happened for real on issue #9, whose diff of README.md
   was cut at line 36 of 38.
2. Raw unified diff only — no prose inside the block, not truncated.
3. If it is too large for one message, split it in file order and say which part
   each is. **Do not summarise it to make it fit.**
4. **Before posting, list every file the diff touches with line counts, and
   confirm in words that the files the task was about are among them.** A diff
   that does not contain the work is the most expensive thing you can send.

## 4. Branch names

`<prefix>/issue-<number>-r<round>-<short-slug>`, for example
`codex/issue-9-r1-readme-current-state`.

The number is the GitHub issue in THIS repository. There is no separate item
register here.

⛔ **The round number is not decoration.** A missing round is read as round 1,
which files a second attempt as if it were the first. Always include it, and
increment it on a re-run.

## 5. State what you RAN, not what you believe

Label every claim **EXECUTED** or **REASONED**.

- **EXECUTED** — you ran it and can quote the output.
- **REASONED** — you read it and concluded. Say so plainly.

⛔ **Never describe a test you did not run as passing.** If a tool, binary or
database was unavailable, say which and stop there. **An honest "I could not run
this" is a good result. A false green is the only unacceptable one.**

### Reading an exit code

⛔ **Never read an exit code through a pipe.** A shell pipeline reports the LAST
command's status, so `npm test | tail` reports tail's exit code — always 0 — and
a failing run looks green. Measured here on 8 Sept 2026, same vitest run:

```
npx vitest run tests/x.test.ts          -> exit 1, "Errors  1 error"
npx vitest run tests/x.test.ts | tail   -> exit 0
```

Use `cmd; echo "exit=$?"` with no pipe, or `cmd > /tmp/out 2>&1; echo $?`, or
`${PIPESTATUS[0]}`, or `set -o pipefail`.

### Counting tests

An exit code alone is never a pass. **State the test file count and the test
count**, and confirm there is no `Errors` line — vitest can print
`58 passed (58)` and still fail on an unhandled error. A count that has DROPPED
is a red even when everything exits 0: a suite that collects zero tests exits 0
and looks green.

## 6. Prove a new test can actually fail

A test that cannot fail is worse than no test.

Break the thing the test is supposed to catch, show it going RED, then revert the
break and show it green again. Quote both runs. **A suite that goes green is not
the result; a suite that goes RED for the right reason is.**

Describing the fault in prose is not proof — whoever verifies it then runs their
reading of your words rather than the fault you meant.

## 7. Stay inside the task

Change only what the task asks for. If something outside it looks wrong, **say so
and stop** rather than fixing it in the same change — an unexpected file in a
diff costs more review time than the fix saves.

Do not "tidy" pre-existing failures you did not introduce. If a check already
fails at the base commit, prove that it does, name it, and leave it alone.

## 8. This repository's own gotchas

- **`package-lock.json` is deliberately NOT COMMITTED** — it is gitignored, so a
  fresh clone has none and `npm ci` refuses. Use
  `npm install --no-audit --no-fund`. (It does appear on disk after you run
  `npm install`; that copy is ignored and must not be committed.)
- **Rebaseline the golden with the command, never by hand:**
  `npm run --silent golden:print > tests/golden-output.json`. The `--silent`
  matters; without it npm writes its own banner into the file.
- **`main` must stay green.** Do not push to `main` and do not merge. Open a pull
  request, or hand back a diff.
