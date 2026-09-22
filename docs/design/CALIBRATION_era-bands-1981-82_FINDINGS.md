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
**MEASURED, 22 Sep 2026 (BST).** The bands are now dated and derived from the committed CSV in `src/era-bands.ts`, and season play is measured against them by `npm run season:calibration` (`src/season-calibration-evidence.ts`, output `evidence/season-calibration-evidence.json`). PR #34, from brief FM-02-B1 (#29). ⛔ Still open: the bands in `engine-config.ts` are unchanged and the engine is untuned — deliberately, that is a later brief.

**SOURCED, 20 Sep 2026 (BST).** The replacement figures are below and the data is committed at `data/english-first-division-seasons.csv`.

## ⭐⭐ SOURCED — 20 Sep 2026 (BST)

**Source:** engsoccerdata (James Curley) — every English tier-1 match, 1888 onward. 208,028 matches in the dataset, 50,570 in tier 1. Per-season aggregates committed to `data/english-first-division-seasons.csv` with the derivation recorded in `data/README.md`.

**Positive control passed.** The benchmark this document already cited from an unrelated source — 2.65 goals/game over 11,266 Premier League matches, 1992–2021 — recomputes from the new data as **11,266 matches, 2.6555 goals/match**. Same count, same figure, independent route. The point above about one consulted source returning arithmetic that did not survive checking still stands; this is a different source and it does check out.

### The band figures — English First Division, 1978/79–1985/86, all 3,696 matches

| | Band as it stands | Real, 1978–85 | 95% interval | Verdict |
|---|---|---|---|---|
| Goals per match | 2.40 – 2.70 | **2.670** | — | inside, but the band centre (2.55) is 0.12 low |
| Draw rate | 0.27 – 0.31 | **0.2606** | 0.246 – 0.275 | ⛔ **real sits below the whole band** |
| Home win rate | 0.41 – 0.47 | **0.4981** | 0.482 – 0.514 | ⛔ **real sits above the whole band** |

### ⭐ A correction to this document

This document assumed goals per match are era-dependent. **On this evidence they are not.** 1978–85 gives 2.670; the modern Premier League (1992/93–2020/21) gives 2.656. Practically identical across forty years.

The era difference is almost entirely **home advantage**: 49.8% home wins in 1978–85 against 45.9% in the modern game. That is what this document predicted, and it is confirmed.

The draw band is a separate matter. Real draws are ~26% in **both** eras, below the 0.27–0.31 band either way. That is not an era problem — it is simply a wrong band.

### ⭐ One season cannot set a band — demonstrated, not asserted

**1981/82 on its own:** 462 matches, home wins **46.3%**, draws **26.2%**, goals **2.539**.

That single season sits *inside* the current home-win band, and it is a notably low home-win year against its neighbours (1980/81 was 52.6%, 1982/83 was 55.2%). Sourcing 1981/82 alone would have produced the conclusion that the existing bands were fine. The eight-season span is what makes the finding hold: ±1.6 points of margin instead of ±4.6.

### ⛔ And the football the game actually plays is outside real football too

Measured across the 800 seasons already committed in `evidence/strength-resolution-evidence.json` (~100,000 matches):

| | Real, 1978–85 | Season play, 8 / 12 / 16 / 20 teams |
|---|---|---|
| Goals per match | 2.670 | **2.93 / 3.04 / 2.91 / 3.00** |
| Draw rate | 0.261 | **0.235 / 0.235 / 0.247 / 0.252** |
| Home win rate | 0.498 | 0.434 / 0.438 / 0.429 / 0.431 |

⭐ **Scored against real season-to-season variation**, not just the aggregate. Across the eight seasons in the span the season-level spread (mean ± 2 SD) is: goals **2.459–2.881**, home wins **0.434–0.563**, draws **0.206–0.316**. Judged against that:

- **Goals — FAILS.** All four league sizes (2.91–3.04) sit above the top of the real spread. This is the clear defect.
- **Home advantage — marginal to failing.** 0.429–0.438 against a real floor of 0.434. Low at every size, below the floor at 16 and 20 teams.
- **Draws — passes.** 0.235–0.252 sits comfortably inside 0.206–0.316. The game draws less often than the era average (0.261), but real seasons varied at least that much.

⚠ So the honest headline is narrower than "two of three are wrong": **the game scores too many goals, and home advantage is a little weak. Draw rate is fine.**

⭐ **MEASURED — 22 Sep 2026 (BST), PR #34.** This is no longer an assertion in a document. `npm run season:calibration` runs 200 seeds at each of 8/12/16/20 teams, season 1981, and writes a PASS/FAIL statement per measure into `evidence/season-calibration-evidence.json`. Measured, against bands derived from the CSV rather than typed in:

| Measure | Band | 8 | 12 | 16 | 20 |
|---|---|---|---|---|---|
| Goals per match | 2.4585–2.8808 | 2.9329 **FAIL** | 3.0367 **FAIL** | 2.9057 **FAIL** | 2.9951 **FAIL** |
| Home win rate | 0.4335–0.5627 | 0.4338 PASS | 0.4378 PASS | 0.4294 **FAIL** | 0.4312 **FAIL** |
| Draw rate | 0.2056–0.3156 | 0.2352 PASS | 0.2351 PASS | 0.2474 PASS | 0.2516 PASS |

The run reproduces the committed `strength-resolution-evidence.json` distributions exactly as a positive control, and the evidence file regenerates byte-identically. The estimates in the table above this section were right to two decimals.

⚠ The calibration run reports PASS/FAIL into its JSON; it does **not** exit non-zero and is **not** a blocking CI gate in this change. Making it one, and closing the goals gap, are later briefs.

⛔ The original defect, recorded for the register: `calibrationTargets` and `ciGuardrails` are read only by `evidence.ts`, `game-state-full-evidence.ts`, `review-002-full-evidence.ts` and the match-lab workflow. Before PR #34, no file under `src/season*.ts` ever compared season play to a band — the harness tested a population the game does not play. That is the house defect in what is being sampled, and it is now closed by measurement, not by tuning.

⚠ Some gap is expected by construction: season play draws teams from a 7–13 level spread, a different population from the 20,000-match lab run. The defensible complaint is not the size of the gap. It is that nobody is measuring it.

## Sources
- Football League goal statistics — https://www.footballhistory.org/league/football-league-statistics.html
- A History of Home Advantage — http://eightyfivepoints.blogspot.com/2016/08/home-advantage-home-advantage-is-much.html
- Seasonal Home Advantage in English Professional Football, 1974–2018 — https://link.springer.com/article/10.1007/s10645-020-09372-z
