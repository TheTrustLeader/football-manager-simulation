# REGISTER — Football rules by season (English league)

**Status:** living list. Created 2026-09-16 BST, from Scott's FM-01 decision.
**Scope (Scott, 16 Sep 2026):** any real-world change that affects the game — on the pitch *and* off it (points, tie-breaks, substitutes, back-pass, goalkeeper handling, Bosman, transfer windows, promotion places …). Dates follow the **English league**.

**The game starts in 1981/82.** Nothing earlier is stored; only the value in force at the start and changes after it.

**Rule for this list:** a row is only **coded** when something in the game reads it. Until then it is a planning row. A coded rule that nothing reads is decoration.

| Rule | Before | From | Change | Source status | Coded? |
|---|---|---|---|---|---|
| Points for a win | — | 1981/82 (game start) | 3 | SOURCED — 3 points introduced by the Football League for 1981/82 | **Coded** — `rulesForSeason` reads it, `buildLeagueTable` awards it (PR #26) |
| League tie-break | — | 1981/82 (game start) | goal difference | SOURCED — in force since 1976/77 | **Coded** — `buildLeagueTable` sorts by the stored value (PR #26) |
| League tie-break — earlier method | goal average (goals scored ÷ conceded) | 1976/77 | replaced by goal difference | SOURCED — goal average was the English method until 1975/76 | **Method coded, not stored.** `goalAverage` exists in `TableTieBreak` and works; the rules table holds only `goalDifference` because the game starts in 1981/82, after the change. Reachable today only through a test table (PR #26) |
| Points for a draw | 1 | — | never changed | — | Stays a constant |
| Substitutes allowed | 1 | late 1980s | 2, later more | TO SOURCE (exact seasons) | Later — engine already has substitutions |
| Back-pass to keeper | may be handled | 1992/93 | may not be handled | TO SOURCE (confirm season) | Later — engine has no back-pass concept yet |
| Keeper handling limits (steps / seconds) | — | several changes | — | TO SOURCE | Later |
| Bosman ruling (free transfer at contract end, EU players) | fee due | 1995/96 (ruling Dec 1995) | no fee | TO SOURCE (when it took effect in England) | Later — no transfers yet |
| Transfer windows | none | 2002/03 | windows | TO SOURCE | Later — no transfers yet |
| Premier League / division structure | four divisions of Football League | 1992/93 | Premier League formed | SOURCED in general; details TO SOURCE | Later |

Sources for the two SOURCED rows: Wikipedia "1976–77 Football League"; "Three points for a win" (gameofthepeople.com); "By the Laws of Averages" (beyondthelastman.com). Verify again when coded.

## Coded, 19 Sep 2026 (BST) — FM-01-B1 round 2

- The tie-break rule now does the work: `buildLeagueTable` sorts by whatever `rules.tableTieBreak` says, instead of always using goal difference. A second real method (`goalAverage`) exists so that a test can tell the two apart — without it, no test could go red.
- Goal average is compared by **cross-multiplication**, never by dividing: no floats, no divide-by-zero, no `Infinity` or `NaN` in a table. A side that has conceded nothing sorts above one that has; two such sides fall through to goals scored.
- An unknown tie-break value throws and names the value.
- **Format break, on purpose:** a season save with no `season` field, or a `season` that is not a whole number, is refused on load. Saves written before this change do not load. Tests record that decision.
- A season other than 1981 is recorded and survives save and load (proved with 1990).

Verified on the branch alone and merged with `main` `e9f14aa`: build and tests exit 0, 17 test files, 129 tests, no `Errors` line. All 8 mutants from the round-2 brief were killed.
