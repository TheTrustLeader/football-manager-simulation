# BRIEF FM-01-B1 — A table of football rules by season (first two rules)

**For:** Codex. **Designed by:** Claude, 2026-09-16 BST. **Return:** a DIFF in a comment. Do not push.
**Read first:** `docs/design/DECISION_FM-01_rules-as-dated-data_DECIDED-NARROWER.md`, `docs/design/REGISTER_football-rules-by-season.md`.

## What changes for the player
Nothing in 1981/82. A season now knows which year it is, and the league table uses the rules that were in force in England that year.

## Build
1. **New file `src/rules.ts`.** A single data table of dated rules, and one function:
   `rulesForSeason(season: SeasonId, table = SEASON_RULES): SeasonRules`.
   - `SeasonId` names a season by its starting year (1981 = 1981/82). Reject non-integers.
   - Each row: rule name, value, first season in force (inclusive), optional last season (inclusive), source note.
   - **The game starts in 1981/82, so the table starts there.** Nothing earlier is stored. Asking for a season before 1981 **throws** ("before the game starts").
   - Rules in this brief:
     - `pointsForAWin`: 3 from 1981/82 (source: Football League introduced 3 points for a win in 1981/82).
     - `tableTieBreak`: `"goalDifference"` from 1981/82 (in force in England since 1976/77). Only this one value exists for now — the type allows a later value to be added, but do not build other tie-break methods.
   - A season with no matching row, or two overlapping rows for the same rule, **throws** with the rule name and season.
   - Points for a draw stays a constant (it never changed).
   - The optional `table` argument exists only so tests can supply a table that changes mid-way. Production code never passes it.
2. **`buildLeagueTable(matches, rules)`** — `rules` is **required**. Remove `POINTS_FOR_A_WIN`; points come from `rules.pointsForAWin`. Tie-break chain unchanged (points → goal difference → goals scored → team id).
3. **`runSeason(teams, seed, season)`** — `season` is **required**, stored on `SeasonResult`, and passed through `rulesForSeason`. Update every caller (`season.ts`, `season-evidence.ts`, `season-sweep-evidence.ts`, `strength-resolution-evidence.ts`, tests) to pass 1981.
   - ⛔ No default for `season` or `rules`. A default is how the house defect gets in: a caller that forgets the season still passes.
4. Save/reload (`season-save.ts`): the season must survive a save and reload byte-identically. If the save format changes, say so explicitly.

## Must NOT change
- The match engine, `engine-config.ts`, the golden output. **The golden test must pass untouched** — that is the proof 1981/82 behaves exactly as before.
- ⚠ The decision card says the calibration bands get their date range "in the same change". **Deliberately deferred to a separate brief:** dating the bands touches `engine-config.ts` and the config hash, and mixing that into this change would hide whether the golden output moved for a rules reason or a calibration reason.
- Any evidence JSON under `evidence/` — if a regenerated file differs, stop and report.

## Tests — each must go red if its rule breaks
Ask of every test: *what value would have to change for this to go red?*
- **The acceptance test:** with a test table where `pointsForAWin` is 3 up to 1989 and 2 from 1990, the same matches give different point totals for 1989 and 1990. The fixture must contain at least one win. (The real table has no change after 1981/82 yet, so a test table is the only honest way to prove the lookup is used.)
- **Boundary:** with that test table, 1989 → 3 and 1990 → 2.
- **Game start:** `rulesForSeason(1980)` throws, and `runSeason(teams, seed, 1980)` throws.
- **Real table:** 1981 → 3 points, goal difference.
- **Table integrity:** points conserved = wins × pointsForAWin + draws × 2, under both test-table values.
- **Errors:** a gap in the table and overlapping rows both throw.

## Mutants (written from this brief, not from the tests) — all must be killed
1. `pointsForAWin` hard-coded to 3 in `buildLeagueTable`.
2. `rulesForSeason` ignores its season and returns the latest rules.
3. Boundary off by one (`>` instead of `>=` on first season).
4. `rulesForSeason` ignores its `table` argument and always uses the real table.
5. `runSeason` ignores `season` and always uses 1981.
6. The "before the game starts" check removed.
7. Overlap check removed.
Report each mutant, the test that killed it, and paste the red line.

## Done means
- `npm install`, `npm run build`, `npm test` — report the exit codes read directly (not through a pipe), the test count, and confirm there is **no Errors line** and the number of test files is not zero.
- Verified on the branch alone **and** merged with current `main`.
- Diff returned in a comment on the issue.
