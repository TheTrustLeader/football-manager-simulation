# BRIEF FM-01-B1 — A table of football rules by season (first two rules)

**For:** Codex. **Designed by:** Claude, 2026-09-16 BST. **Return:** a DIFF in a comment. Do not push.
**Read first:** `docs/design/DECISION_FM-01_rules-as-dated-data_DECIDED-NARROWER.md`, `docs/design/REGISTER_football-rules-by-season.md`.

## What changes for the player
Nothing in 1981/82. A season now knows which year it is, and the league table uses the rules that were in force in England that year.

## Build
1. **New file `src/rules.ts`.** A single data table of dated rules, and one function:
   `rulesForSeason(season: SeasonId): SeasonRules`.
   - `SeasonId` names a season by its starting year (1981 = 1981/82). Choose a clear type; reject non-integers.
   - Each table row: rule name, value, first season in force (inclusive), optional last season (inclusive), source note.
   - Two rules only:
     - `pointsForAWin`: 2 up to and including 1980/81; 3 from 1981/82.
     - `tableTieBreak`: `"goalAverage"` up to and including 1975/76; `"goalDifference"` from 1976/77.
   - A season with no matching row, or two overlapping rows for the same rule, **throws** with the rule name and season. Test both.
   - Points for a draw stays a constant (it never changed).
2. **`buildLeagueTable(matches, rules)`** — `rules` is **required**. Remove `POINTS_FOR_A_WIN`. Points come from `rules.pointsForAWin`.
   - `goalDifference` tie-break: unchanged chain (points → goal difference → goals scored → team id).
   - `goalAverage` tie-break: points → goal average → goals scored → team id. Compare by cross-multiplying (`a.for * b.against` vs `b.for * a.against`) — no division. A team that has conceded 0 ranks above any team that has conceded more, if it has scored at least one; two teams both on 0 conceded compare by goals scored. Say in a comment that this handling of 0 is a design choice, not a sourced rule.
   - Keep `goalDifference` in the row in both eras (it is displayed).
3. **`runSeason(teams, seed, season)`** — `season` is **required**. Stored on `SeasonResult`. Update every caller (`season.ts`, `season-evidence.ts`, `season-sweep-evidence.ts`, `strength-resolution-evidence.ts`, tests) to pass 1981.
   - ⛔ No default value for `season` or `rules`. A default is how the house defect gets in: a caller that forgets the season still passes.
4. Save/reload (`season-save.ts`): the season must survive a save and reload byte-identically. If the save format changes, say so explicitly.

## Must NOT change
- The match engine, `engine-config.ts`, the golden output. **The golden test must pass untouched** — that is the proof 1981/82 behaves exactly as before.
- Any evidence JSON under `evidence/` — if a regenerated file differs, stop and report.

## Tests — each must go red if its rule breaks
Ask of every test: *what value would have to change for this to go red?*
- **The acceptance test:** the same matches give **2** points per win with season 1980 and **3** with season 1981. The fixture must contain at least one win, and the expected totals must differ between the two seasons.
- **Boundary:** 1980 → 2, 1981 → 3; 1975 → goal average, 1976 → goal difference.
- **Tie-break divergence:** build one set of matches where goal average and goal difference put two teams in **opposite** order (e.g. A: 4 for, 1 against → GD +3, GA 4.0; B: 8 for, 4 against → GD +4, GA 2.0, same points). Assert the order flips between 1975 and 1976. If the fixture does not flip, it is decoration.
- **Zero conceded:** the case in Build 2.
- **Table integrity:** points conserved = wins × pointsForAWin + draws × 2, for both eras.
- **Errors:** missing season row and overlapping rows both throw.

## Mutants (written from this brief, not from the tests) — all must be killed
1. `pointsForAWin` hard-coded to 3 in `buildLeagueTable`.
2. `rulesForSeason` ignores its argument and returns the latest rules.
3. Boundary off by one (`>` instead of `>=` on first season).
4. Tie-break ignores `rules.tableTieBreak` and always uses goal difference.
5. Goal average computed as goal difference (`for - against`).
6. `runSeason` ignores `season` and always uses 1981.
7. Overlap check removed.
Report each mutant, the test that killed it, and paste the red line.

## Done means
- `npm install`, `npm run build`, `npm test` — report the exit codes read directly (not through a pipe), the test count, and confirm there is **no Errors line** and the number of test files is not zero.
- Verified on the branch alone **and** merged with current `main`.
- Diff returned in a comment on the issue.
