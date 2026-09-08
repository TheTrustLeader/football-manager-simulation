#!/usr/bin/env python3
"""
FILL THE FOOTBALL MANAGER VERIFY QUEUE

The sibling of trust-leader-app's .github/scripts/fill_verify_queue.py, with two
deliberate differences, both because THIS REPOSITORY IS PUBLIC:

  1. NO GOOGLE DRIVE AND NO REPO SECRET. The Hub's robot signs in to Google Drive
     with a token held as a repo secret. That token reaches the whole of Scott's
     business Drive, and this repo is public — anything that ever ran inside this
     workflow would hold it. So the job files are committed to this repository's
     own `verify-queue` branch instead, using the built-in GITHUB_TOKEN. No new
     credential exists anywhere.

  2. NO SOURCE TAR. The Hub's robot ships a 5 MB tar because that repo is private
     and the verifying container holds no credential. This repo is public, so the
     verifying session clones it itself at the recorded commit. A job is one small
     text file.

WHAT IT DOES: every run, look at each branch whose name starts with one of
PREFIXES. Skip any branch that is ALREADY FULLY MERGED into main — it has nothing
left to verify. If a remaining branch's TREE is not already queued for the same
item — counting jobs/ and jobs/_done/ — write jobs/JOB_<stem>.txt onto the
`verify-queue` branch. Identical content re-pushed is a REPLAY and writes nothing.

WHAT IT MUST NEVER DO: it does not merge, does not deploy, does not touch main,
does not decide whether anything passed. It produces WORK, not a verdict.
"""

import argparse
import datetime
import re
import shutil
import subprocess
import sys
from pathlib import Path

PREFIXES = ("agent/", "codex/", "review-", "ci/")
QUEUE_BRANCH = "verify-queue"
WORKTREE = Path("/tmp/verify-queue-worktree")

# The exact commands the verifying session must run. Kept HERE, in the job, so the
# session never invents its own idea of what "verified" means for this repo.
# npm ci is NOT usable here: this repo has no package-lock.json, and npm ci refuses
# without one. The repo's own CI uses npm install; the loop must match it.
#
# THIS MUST MIRROR .github/workflows/match-lab-ci.yml. It used to stop at
# `npm test`, while CI also ran the calibration safety gate and the 10,000-match
# simulate step. That gap is not academic: on 8 Sep 2026 a branch passed the loop,
# was recorded green, and broke the build on the gate the moment it reached main.
# A loop that says "verified" on a narrower basis than the build is a loop that
# issues false greens. If a step is added to the workflow, add it here too.
VERIFY_CMD = (
    "npm install --no-audit --no-fund && npm run build && npm test "
    "&& npm run evidence && npm run simulate -- 10000"
)


def run(*args, cwd=None, check=True):
    p = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if check and p.returncode != 0:
        sys.exit("command failed: %s\n%s" % (" ".join(args), p.stderr.strip()))
    return p.stdout.strip(), p.returncode


def git(*args, **kw):
    return run("git", *args, **kw)[0]


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48]


def uk_now():
    # Register rule 15: every timestamp is UK time and SAYS WHICH — BST or GMT.
    # A fixed +01:00 offset prints "UTC+01:00", which is the same instant and the
    # wrong record. ZoneInfo prints the name and switches at the boundary by itself.
    try:
        from zoneinfo import ZoneInfo
        return datetime.datetime.now(ZoneInfo("Europe/London"))
    except Exception:
        return datetime.datetime.now(datetime.timezone.utc)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True, help="ignore branches whose head is older than this")
    ap.add_argument("--branch", default="", help="force one branch regardless of age")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    since = datetime.datetime.fromisoformat(args.since)

    git("fetch", "--quiet", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*")

    # ---- candidate branches -------------------------------------------------
    listing = git(
        "for-each-ref",
        "--format=%(refname:short)\t%(objectname)\t%(committerdate:iso-strict)",
        "refs/remotes/origin",
    )
    candidates = []
    for line in listing.splitlines():
        ref, sha, when = line.split("\t")
        name = ref.split("/", 1)[1]
        if name in ("HEAD", "main", QUEUE_BRANCH):
            continue
        if not name.startswith(PREFIXES):
            continue
        if args.branch and name != args.branch:
            continue
        head_when = datetime.datetime.fromisoformat(when)
        if not args.branch and head_when < since:
            continue
        candidates.append((name, sha, head_when))
    candidates.sort()

    # ---- what is already queued --------------------------------------------
    have_queue = run("git", "show-ref", "--verify", "--quiet",
                     "refs/remotes/origin/%s" % QUEUE_BRANCH, check=False)[1] == 0
    already = set()
    if have_queue:
        paths = git("ls-tree", "-r", "--name-only", "origin/%s" % QUEUE_BRANCH)
        for path in paths.splitlines():
            if not Path(path).name.startswith("JOB_"):
                continue
            body = git("show", "origin/%s:%s" % (QUEUE_BRANCH, path))
            kv = dict(l.split("=", 1) for l in body.splitlines() if "=" in l)
            already.add((kv.get("item", ""), kv.get("tree", "")))

    print("candidates: %d | already queued: %d | queue branch exists: %s"
          % (len(candidates), len(already), have_queue))

    # ---- decide -------------------------------------------------------------
    to_write = []
    for name, sha, head_when in candidates:
        item = "FM-" + slug(name)

        # A branch with NOTHING AHEAD of main is already fully merged. Queuing it
        # spends a whole verify run re-proving the past — which is exactly what
        # happened on 7 Sep 2026: three of the five branches queued were already
        # in main, so the loop verified yesterday for a day.
        #
        # `--left-right --count origin/main...<sha>` prints "<behind>\t<ahead>".
        # The SECOND number is what matters; 0 means everything here is in main.
        #
        # --branch still forces it, so a deliberate proof run can name a merged
        # branch and get a job for it.
        counts = git("rev-list", "--left-right", "--count",
                     "origin/main...%s" % sha).split()
        ahead = int(counts[1]) if len(counts) == 2 else -1
        if ahead == 0 and not args.branch:
            print("SKIP    %s (%s) - already fully merged into main, 0 commits ahead"
                  % (name, sha[:7]))
            continue

        tree = git("rev-parse", "%s^{tree}" % sha)
        if (item, tree) in already:
            print("REPLAY  %s (%s) — tree already queued for %s" % (name, sha[:7], item))
            continue
        base = run("git", "merge-base", sha, "origin/main", check=False)[0] or ""
        stem = "%s-%s" % (slug(name), sha[:7])
        body = "\n".join([
            "repo=TheTrustLeader/football-manager-simulation",
            "source=github-public-clone",
            "branch=%s" % name,
            "head=%s" % sha,
            "tree=%s" % tree,
            "base=%s" % base,
            "item=%s" % item,
            "verify=%s" % VERIFY_CMD,
            "queued_at=%s" % uk_now().strftime("%Y-%m-%d %H:%M %Z"),
            "",
        ])
        to_write.append((stem, body))
        print("WRITE   %s (%s) -> jobs/JOB_%s.txt" % (name, sha[:7], stem))

    if not to_write:
        print("nothing to write.")
        return
    if args.dry_run:
        print("dry run — wrote nothing.")
        return

    # ---- write them onto the queue branch -----------------------------------
    if WORKTREE.exists():
        shutil.rmtree(WORKTREE, ignore_errors=True)
    if have_queue:
        git("worktree", "add", "--quiet", str(WORKTREE), "origin/%s" % QUEUE_BRANCH)
        git("checkout", "-q", "-B", QUEUE_BRANCH, cwd=str(WORKTREE))
    else:
        git("worktree", "add", "--quiet", "--detach", str(WORKTREE), "HEAD")
        git("checkout", "-q", "--orphan", QUEUE_BRANCH, cwd=str(WORKTREE))
        run("git", "rm", "-rfq", ".", cwd=str(WORKTREE), check=False)
        (WORKTREE / "README.md").write_text(
            "# verify-queue — machine-written, do not edit by hand\n\n"
            "This branch is a QUEUE, not code. It carries no source. `.github/workflows/"
            "fill-verify-queue.yml` writes one small `jobs/JOB_<stem>.txt` per new branch\n"
            "it has not seen before; a scheduled Claude session reads them, clones this\n"
            "repo at the recorded commit, runs the `verify=` command and writes the result\n"
            "to Google Drive (`_COORDINATION/_verify-queue/fm/results/`).\n\n"
            "Nothing here merges, deploys or decides. It produces work, not verdicts.\n"
            "Delete the branch and the loop simply stops; `main` is untouched either way.\n"
        )

    jobs = WORKTREE / "jobs"
    jobs.mkdir(parents=True, exist_ok=True)
    (jobs / "_done").mkdir(exist_ok=True)
    keep = jobs / "_done" / ".gitkeep"
    if not keep.exists():
        keep.write_text("")
    for stem, body in to_write:
        (jobs / ("JOB_%s.txt" % stem)).write_text(body)

    git("config", "user.name", "fill-verify-queue robot", cwd=str(WORKTREE))
    git("config", "user.email", "actions@github.com", cwd=str(WORKTREE))
    git("add", "-A", cwd=str(WORKTREE))
    if run("git", "diff", "--cached", "--quiet", cwd=str(WORKTREE), check=False)[1] == 0:
        print("queue branch already identical — nothing committed.")
        return
    git("commit", "-q", "-m",
        "queue %d job(s): %s" % (len(to_write), ", ".join(s for s, _ in to_write)),
        cwd=str(WORKTREE))
    git("push", "-q", "origin", QUEUE_BRANCH, cwd=str(WORKTREE))
    print("pushed %d job(s) to %s." % (len(to_write), QUEUE_BRANCH))


if __name__ == "__main__":
    main()
