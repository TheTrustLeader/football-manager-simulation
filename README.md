# verify-queue — machine-written, do not edit by hand

This branch is a QUEUE, not code. It carries no source. `.github/workflows/fill-verify-queue.yml` writes one small `jobs/JOB_<stem>.txt` per new branch
it has not seen before; a scheduled Claude session reads them, clones this
repo at the recorded commit, runs the `verify=` command and writes the result
to Google Drive (`_COORDINATION/_verify-queue/fm/results/`).

Nothing here merges, deploys or decides. It produces work, not verdicts.
Delete the branch and the loop simply stops; `main` is untouched either way.
