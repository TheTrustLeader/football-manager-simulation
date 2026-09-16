# CALIBRATION — which era is the engine actually tuned to?

**Written 2026-09-15 22:05 BST.** Item 1 of the three Scott set. ⚠ **This does not close the question. It establishes what the bands look like and what is still missing.**

## The bands as they stand

`src/engine-config.ts`, undated and with no source recorded anywhere in the repo or this folder:

| Measure | Calibration target | CI guardrail |
|---|---|---|
| Goals per match | 2.40 – 2.70 | 2.375 – 2.725 |
| Draw rate | 27% – 31% | 26.3% – 31.7% |
| Home win rate | 41% – 47% | 40.3% – 47.7% |

`src/evidence.ts:335` calls these *"the sourced goals, draw and home-win bands"*. **No source exists.** The word "sourced" is doing work nothing backs up.

## ⭐⭐ The finding — the bands are modern football

Benchmarks found this session:

| Benchmark | Figure | Period |
|---|---|---|
| Premier League goals per game | **2.65** | 1992–2021, 11,266 matches |
| Home wins, England's top four divisions | **44%** | 1996/97 onward |
| Draws, same | **27%** | 1996/97 onward |
| Away wins, same | **28%** | 1996/97 onward |

Lay those over the engine's bands:
- 2.65 goals/game sits **inside** 2.40–2.70.
- 44% home wins is **almost dead centre** of 41–47%.
- 27% draws is **exactly the floor** of 27–31%.

⛔ **Three for three. The bands describe football since roughly the mid-1990s.** Nothing about them was chosen for 1981/82, because — as the missing source shows — the era was never a consideration when they were set.

## Why that is a problem, now that the start is 1981/82

**Away wins have risen steadily since the late 1970s.** The historical analyses are consistent on the direction: home advantage in English league football has declined through the post-war era, with away victories climbing to around 30% in the modern game. So in 1981/82 the home win rate was **materially higher** than the 44% modern figure — plausibly at or above the top of the engine's current band.

⭐ **So the harness would call an accurate 1981/82 season a FAILURE, and a modern-feeling season a PASS.** The test is pointed at the wrong decade. It is not broken — it is aimed wrong, which is worse, because it reports green with total confidence.

⭐ This is the same defect the project has now met three times in different costume: **a check that cannot detect the thing it exists to detect.** Round 1, the cloned substitute. Round 2 on #20, the stub that dropped a parameter. Here, a band set from the wrong era.

## ⛔ What is NOT established, and why I am not recording a number

An exact 1981/82 figure needs a **match-level dataset** — the final table alone cannot give a home/draw/away split.

⚠ **One source consulted this session returned arithmetic that did not survive checking** (it reported 924 matches for a 22-team double round-robin — the correct figure is 462 — and a goal total that did not match its own listed column). A rough figure of ~2.5 goals/match can be derived from its underlying column, but it rests on a summary already shown to be unreliable, so **it is deliberately not recorded here as fact.**

⛔ Per the house rule: verify before recording. A band is a gate. A gate built on a number nobody checked is how the last three defects happened.

## What closes this

1. Get a **match-level result set for the English First Division, seasons roughly 1978/79–1985/86** — a span, not one season. 462 matches gives a 95% interval of roughly ±4.5 points on home-win rate, which is wider than the whole current band. **One season cannot set a band.**
2. Compute goals/match, home win %, draw % across that span.
3. Write them into `engine-config.ts` **with the source and the seasons named in the file**, so the next person can check them.
4. ⭐ Give the band a **date range**, not just values — which is the same mechanism the era work needs (see the rules-as-dated-data decision). Do it once, for both jobs.

## Status
**OPEN.** The bands are now known to be modern; the 1981/82 replacements are not yet sourced. ⛔ Until this closes, "the engine is calibrated" means "calibrated to the 1990s".

## Sources
- Football League goal statistics — https://www.footballhistory.org/league/football-league-statistics.html
- A History of Home Advantage — http://eightyfivepoints.blogspot.com/2016/08/home-advantage-home-advantage-is-much.html
- Seasonal Home Advantage in English Professional Football, 1974–2018 — https://link.springer.com/article/10.1007/s10645-020-09372-z
