# AGENTS.md — rules for any AI agent working in this repository

These are not suggestions. They exist because each one has already cost a round of work.

## 1. A local commit is NOT a delivered result

**Publication means the remote has your commit. Nothing else counts.**

Before starting work that has to be published:

1. Confirm `origin` exists — do not print its URL.
2. Confirm `git ls-remote origin HEAD` succeeds.
3. If either fails, **stop and report `UNPUBLISHED`**. Do not continue as if it will work out.

After pushing:

1. Record the local commit: `git rev-parse HEAD`
2. Ask the remote what it actually has:
   `git ls-remote --heads origin refs/heads/<exact-branch-name>`
3. Compare the two SHAs.
4. Report `PUBLISHED` **only when they match.**
5. Otherwise report `UNPUBLISHED`, include the push error verbatim, and **do not describe the branch as available, fetchable or created.**

Never treat any of these as evidence of publication: a local commit SHA · a local branch · a zero exit from `git commit` · an attempted push · your own intention to push.

Use exactly one of these three words in your report:

- `COMMITTED LOCALLY` — work exists, remote does not have it
- `PUSH ATTEMPT FAILED — UNPUBLISHED` — include the error
- `REMOTE SHA VERIFIED — PUBLISHED` — include the SHA the remote returned

Do not print remote URLs, credentials, or authentication environment variables.

## 2. If you cannot push, return the work as a diff

A push failure is expected in some environments and is not a fault. **Silence, or a false claim of success, is the fault.**

When you cannot publish:

1. Post the complete patch as a single fenced diff block: `git diff <base-sha>..HEAD`
2. Raw unified diff only — no prose, no summary, not truncated.
3. If it is too large for one message, split it in file order and say which part each is. **Do not summarise it to make it fit.**
4. **Before posting, list every file the diff touches with line counts, and confirm in words that the files the task was about are among them.** A diff that does not contain the work is the most expensive thing you can send.

## 3. Branch names carry meaning — automation reads them

Use `<prefix>/<item-id>-r<round>-<short-slug>`, for example `codex/br-h-122-r1-sender-throw-cases`.

⛔ **The round number is not decoration.** Tooling parses the item and round out of the branch name, and a missing round is silently read as round 1 — which files a second attempt as if it were the first. Always include it, and increment it.

## 4. State what you RAN, not what you believe

Label every claim **EXECUTED** or **REASONED**.

- **EXECUTED** — you ran it and can quote the output.
- **REASONED** — you read it and concluded. Say so plainly.

⛔ **Never describe a test you did not run as passing.** If a tool, binary or database was unavailable, say which and stop there. **An honest "I could not run this" is a good result. A false green is the only unacceptable one.**

## 5. If the task names a fault, ship it as a file

A fault described in prose has to be reconstructed by whoever verifies it, and what then runs is their reading of your words rather than the fault you meant.

Put them in `tests/<item>/mutants/` with a `README.md` giving, per mutant: what it breaks · which assertion must kill it · the expected result. Make them runnable and reviewable.

**A test suite that goes green is not the result. A suite that goes RED for the right reason is.** Prove it by running the mutant, not by arguing that it would be caught.

## 6. Stay inside the task

Change only what the task asks for. If something outside it looks wrong, **say so and stop** rather than fixing it in the same change — an unexpected file in a diff costs more review time than the fix saves.

Do not "tidy" pre-existing failures you did not introduce. If a check already fails at the base commit, prove that it does, name it, and leave it alone.
