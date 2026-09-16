# DECISION CARD — FM-01 — Football rules are dated data, not constants

**Status: DECIDED — NARROWER.** Raised by Claude, 2026-09-15 22:10 BST. Decided by Scott, 2026-09-16 BST. **Owner:** Scott.
**Relates to:** `VISION_what-the-finished-game-is_v1-DRAFT.md` (Stage C) · `CALIBRATION_era-bands-1981-82_FINDINGS.md` (the same mechanism closes both)

## The decision asked for

**Every football rule that has ever changed is stored with the dates it was in force, and the season asks for the rule set in force that year.** No rule that varies by era is written as a bare constant.

In force from the next brief onward. Existing constants are converted **only** when a brief already touches them — no sweep, no rewrite of working code.

## Why now, and not at Stage C

The decision is being made by default every day it stays open. Measured in the repo:

- `src/competition.ts:51` — `const POINTS_FOR_A_WIN = 3;` England used **two** points for a win until 1981/82; Italy until 1994.
- The table's tie-break chain is fixed as points → goal difference → goals scored. England ranked on **goal average**, not goal difference, until 1976; other countries use head-to-head.
- `src/engine-config.ts` `calibrationTargets` — one undated band, shown to match **modern** football, not 1981/82.

Every rule added during Stage B — promotion places, European qualification slots, squad limits, transfer windows, prize money — will be written the same way unless this is decided. Stage C then costs a rewrite of everything Stage B touched, instead of a data file.

⭐ **The engine already does this for the football.** `engineConfigVersion`, `engineConfigHash` and the golden tripwire version the match engine's behaviour deliberately and refuse to let it drift unannounced. The pattern is in the house and proven. It was simply never carried into the competition layer or the calibration bands.

## What it costs

- Each era-varying rule costs one extra field (the date range) and one lookup instead of a constant.
- ⛔ It does **not** mean building an era system now. It means not closing the door. Today there is exactly one era in the data: 1981/82.

## The measure — behavioural and checkable

- **Behaviour:** when a new football rule is added, is it added as dated data or as a constant? **Target: 100% dated, from the next brief.** Countable by reading the diff — a new bare constant for an era-varying rule is the failure.
- **Impact — the acceptance test:** *adding "two points for a win before 1981/82" changes one row of data and no function.* Until that is demonstrably true, this decision is stated but not delivered.
- **Counter-check (so this is not just architecture for its own sake):** the number of rules stored as dated data that never actually vary by era. If that climbs, the rule is being over-applied and should narrow to rules with a known historical change date.

## The alternative, stated fairly

**Keep writing constants.** Faster per rule, and honest if Stage C is never built. The cost is that Stage C stops being content and becomes surgery on Stage B — and Stage C is the thing that makes this game its own, rather than a tribute to a 1980s original.

## What Scott is being asked
**Yes / narrower / no.** If yes, the next Codex brief carries it and the calibration bands get their date range in the same change.

## Scott's decision — 16 Sep 2026 (BST)

**Narrower.** In Scott's words: *the changes should happen in the years they happen in the real world, and keep the rules the ones that impact on the game, such as the back-pass rule and changes to the role of the goalkeeper.*

What this means in practice:
- A rule gets a date range **only if changing it changes the game** — on the pitch (back-pass rule, goalkeeper role) or off it (points for a win, substitutes, Bosman).
- Each change takes effect in the **season it happened in real football**. Dates are sourced, and the source is recorded next to the date (sourced fact kept apart from design choice).
- Rules that never changed, or whose change makes no difference to play or results, stay as plain constants.
- The acceptance test and the counter-check above still apply.

**Answered by Scott, 16 Sep 2026 (BST):**
1. "Impacts the game" is wider than the pitch — it includes season and career rules such as points for a win, substitutes and the Bosman ruling.
2. Dates follow the **English league**.

The list of rules lives in `REGISTER_football-rules-by-season.md`. First build: `docs/briefs/FM-01-B1_dated-rules-table_BRIEF.md`.
