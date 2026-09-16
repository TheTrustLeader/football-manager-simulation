# ORIGINAL PROJECT BRIEF — carried over, not re-agreed

**Filed 2026-09-16 BST by Claude.** Copied from the old claude.ai project *description*, which is being replaced by a short summary so that only one set of working rules exists (the project *instructions*).
**Why this file exists:** the old description held game-design baselines recorded nowhere else in the repo. Deleting it without this copy would have lost them.
**Status:** a record of what was written, **not** a fresh agreement. Where it conflicts with newer documents, the conflict is listed at the foot and left for Scott.

**Executed:** read the old description; searched this branch's docs for the same content (`grep` for attribute scale, tactics, seeds, simulation volumes, gate names) — only seeds and "Match Lab" appear elsewhere. **Reasoned:** everything below is otherwise unrecorded.

## Scope as first written

- First release: a browser-based progressive web app, starting with text-only live matches.
- Later: one fictional country, four divisions, roughly 80 clubs, about 2,000 players, domestic cups, old-style knockout European competitions, transfers, contracts, club finances, many playable seasons.

## Product principles

- A few clear decisions, fast seasons, visible consequences.
- Do not reproduce another game's code, text, screens, art, database or distinctive presentation.
- Fictional clubs, players, managers, grounds and brands only.
- Historical mechanics researched from reliable sources; keep sourced fact, inference and design choice apart.
- No modern Football Manager depth unless playtesting justifies it.
- Every mechanic must give useful information, a meaningful choice or a clear consequence.
- The game is standalone: no code, data, systems, names or assets shared with Trust Leader.

## Match baseline

- Match Lab first, before the career game.
- Text matches show meaningful incidents, not every pass. A standard match takes about 2–3 minutes, with pause, speed-up and instant result.
- The engine is independent of the interface and storage.
- Every match takes a random seed and produces a replayable event log.
- Visible outfield skills, 1–20: defending, passing, creativity, pace, aerial ability, finishing, stamina, leadership. Goalkeepers also have goalkeeping.
- Possible hidden traits: consistency, injury susceptibility, temperament, potential, positional adaptability.
- Condition, morale and recent form are kept separate.
- Match ratings 1–10, built only from recorded contributions.
- Pre-match choices: formation, style, approach, tackling; plus captain, main creator and target forward.
- In-match choices: substitutions; changes to formation, style and approach.

## Career baseline

- Each career has isolated save data. One career never alters the master world or another career.
- Season rollover handles promotion, relegation, qualification, ageing, development, decline, retirement, contracts and generated young players.

## Testing baseline

| Kind of test | Used for |
|---|---|
| Calculation tests | formulas and probability boundaries |
| Rule tests | competitions, tables, transfers, rollover |
| Database tests | save isolation, record integrity |
| Playwright | critical browser journeys only — never bulk simulation |
| Headless seeded simulation | balance, tactical bias, long-career stability |

- Balance changes are accepted only after unseen validation seeds.
- Failing seeds and their inputs are kept so every material defect can be reproduced.
- Human playtesting decides whether a match is understandable and enjoyable.

**Simulation volumes (starting ranges — benchmark the engine before fixing them):**

| Change | Matches |
|---|---|
| Mechanics change | 10,000–50,000 |
| Active balancing (scheduled run) | 500,000–1,000,000 |
| Major mechanics gate | 3–5 million |
| Pre-review / pre-release | 5–10 million, plus full-season and 50–100-season career tests |
| Interface-only change | none, unless it can affect engine inputs or outputs |

## Delivery gates as first written

1. **Match Lab** — playable, replayable, explainable, passes agreed balance tests.
2. **Career slice** — one division through a full season with transfers, saves and rollover.
3. **Version 1** — the full fictional structure across repeated seasons.

## ⚠ Conflicts with newer documents — for Scott, not resolved here

| Old brief says | Newer record says | Where |
|---|---|---|
| Reference period 1988–89 | Starts in 1981/82 | project instructions; `CALIBRATION_era-bands-1981-82_FINDINGS.md` |
| Three gates: Match Lab → career slice → Version 1 | Gates 1–4, all inside Stage A; Stages B and C beyond | `VISION_what-the-finished-game-is_v1-DRAFT.md`, `README.md` |
| Records kept in Google Drive (`My Drive/Football-Manager-Simulation/`, folders `06_…`, `07_…`) | Records kept in this repo | project instructions — **superseded; Drive paths no longer apply** |
| Code written by ChatGPT | Code written by Codex, returned as diffs | project instructions |
| Starting file `README_START-HERE.md` | `docs/design/` | project instructions |
