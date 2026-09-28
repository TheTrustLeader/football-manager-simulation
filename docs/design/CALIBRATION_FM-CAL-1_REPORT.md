# FM-CAL-1 calibration report

## Diagnosis before tuning

**EXECUTED:** with only `homeProgressionProbabilityBoost` restored from 0.19 to
0.085, passing/direct was **0.316750** (recorded 0.235800; gap 0.080950) and the
first recomputed strongest-by-level result was **95/200 at 8 teams** (committed
87/200). Neither failure cleared, so the predicted single cause was wrong.

**EXECUTED** on the original constants over tuning seasons 1–200 at 22 teams:

| Match-up | Matches | Goals per match |
|---|---:|---:|
| Teams within one level | 24,000 | 3.053500 |
| Teams four or more levels apart | 14,000 | 3.261071 |

**REASONED:** the prediction was only partly right. Large mismatches did score more,
but close matches were not near 2.7; at 3.054 they were already outside the real
band. A mismatch-only adjustment would therefore leave the underlying defect in
place, so the base chance of converting a shot is the appropriate small lever.

## Changes and pre-final-run prediction

- `goal.probabilityMultiplier`: **absent (effectively 1.00) → 0.785**. In football
  terms, every on-target effort is subject to the same era-wide finishing rate,
  without favouring a style's route into attack.
- `homeAdvantage.homeProgressionProbabilityBoost`: **0.085 → 0.23**. In football
  terms, home sides reach dangerous areas more often; the style-neutral goal
  multiplier now does the scoring correction rather than this home lever.

**REASONED, recorded before the final 200-season runs:** the exploratory samples
predict **2.69 goals/match, 0.477 home wins, and 57 strongest-by-level titles at
16 teams**. The full, final 1–200 and 201–400 results below were not inspected
before this prediction and the constants were fixed.

## Final results

**EXECUTED:** the final independent 200-season sets produced:

| Seasons | Goals/match | Home wins | Draws |
|---|---:|---:|---:|
| 1–200 (tuning) | 2.688377 | 0.471450 | 0.248636 |
| 201–400 (validation) | 2.696320 | 0.473225 | 0.248950 |

The applicable one-standard-deviation intervals are 2.564060–2.775226 for
goals and 0.465784–0.530428 for home wins; draws use the real season band of
0.205553–0.315551. The authoritative distributions and PASS statements are in
`evidence/season-calibration-evidence.json`.

**REASONED:** goals and draws pass, but home wins miss the brief's tighter
0.476–0.520 requirement in both samples. This is the best completed run; raising
the style-sensitive home progression lever further would repeat the diagnosed
round-1 risk.

**EXECUTED identity guard:** passing/direct measured **0.305050**, versus the
recorded **0.235800** (gap **0.069250**, allowed 0.020000). The style-neutral
scoring multiplier reduced round 1's 0.3190 result, but did not restore identity
parity; this limit therefore remains broken in the best completed run.

**EXECUTED strength guard:** the 22-team engine-weighted strongest squad won
103/200 seasons and its rating-to-position Spearman was −0.830. Strongest-by-level
counts changed 8: **82 → 84**, 12: **21 → 28**, 16: **57 → 54**, 20: **85 → 73**,
and the new 22-team row is **40**. The 20-team result exceeds the allowed drop by
four, while the 8- and 16-team limits pass.

**EXECUTED committed calibration expectations:** PASS/FAIL triples changed
8: `FAIL/PASS/PASS` → `FAIL/FAIL/PASS`; 12: `FAIL/PASS/PASS` →
`PASS/PASS/PASS`; 16: `FAIL/FAIL/PASS` → unchanged; 20:
`FAIL/FAIL/PASS` → `PASS/PASS/PASS`; and 22 was added as
`PASS/PASS/PASS`.

## Round 3: CI safety gate

**EXECUTED diagnosis:** restoring only the home progression boost from `0.23`
to `0.085` made game-state ordering pass (trailing **0.499914**, level
**0.464741**, leading **0.430113**), so P1 was correct. Restoring only the goal
multiplier from `0.785` to `1` made every formation-presence check pass, so P1b
was also correct. With the multiplier left at `0.785`, seasons 1–200 at 22 teams
scored **2.441288** goals per match at home boost `0.085`, versus **2.688377**
at `0.23`; P2 was correct that the home boost supplies a material part of the
season scoring rate.

**REASONED before the final runs:** the final engine would remain near round
2's **2.69 goals**, **0.47 home wins**, and passing formation/style/invariant
checks. Measuring game-state response in the equal-team neutral control was
expected to restore the intended trailing > level > leading ordering without
changing match play.

**EXECUTED final results:** seasons 1–200 produced **2.688377 goals**,
**0.471450 home wins**, and **0.248636 draws** per match; held-out seasons
201–400 produced **2.696320**, **0.473225**, and **0.248950**. The final CI
sample produced **2.696429**, **0.473304**, and **0.244048**, with goals standard
error **0.016099**. Formation presence, style presence, game-state ordering and
invariants all passed; game-state rates were trailing **0.459971**, level
**0.418651**, and leading **0.379166**. Thus the prediction was correct for all
three season measures and all three presence/safety checks.

**EXECUTED constants (main → round 2 → round 3):** `4-3-3.attack` is
**1.12 → 1.12 → 1.18**, making its extra forward produce a measurable attacking
threat after era finishing is applied; `3-5-2.attack` is
**1.05 → 1.05 → 1.12**, making the two-forward shape's attacking trade-off
visible. All scoring and home-advantage constants remain at round 2 values.

**EXECUTED check migration:** old match-lab goals-vs-real-band → 22-team
1981/82 season goals within one SD; old match-lab home wins → the same season
sample within one SD; old match-lab draws → the same season sample inside the
era band. Match-lab goals now live separately as a regression pin at **2.3518 ±
0.04**. Mirror fairness, ability win rates, formation presence, style presence,
game-state ordering and invariants remain enforced directly by the match lab.

**EXECUTED controls:** restoring main's `goal.base=0.29`, multiplier `1`, and
home boost `0.085` makes the existing 22-team season calibration control fail.
Forcing every formation candidate to `4-4-2` made the evidence command exit 1
specifically on `formationPresence`; restoring the code returned the full gate
to green.

**EXECUTED unchanged strength pins:** strongest-by-level counts remained 8 teams
**84 → 84**, 12 **28 → 28**, 16 **54 → 54**, 20 **73 → 73**, and 22
**40 → 40**. At 22 teams the strongest squad by engine rating won **103/200**
seasons and rating-to-position Spearman was **−0.830311**.

**REASONED unchanged tactics pins:** the compensation-out estimator uses the
unchanged `4-4-2` path, so its identity gaps remain at their pinned figures:
passing/direct **0.1665 → 0.1665**, passing/defensive
**0.3060 → 0.3060**, passing/balanced **0.0907 → 0.0907**,
direct/defensive **0.1327 → 0.1327**, direct/balanced **−0.0839 → −0.0839**,
and defensive/balanced **−0.2175 → −0.2175**. The full estimator regression
test passed its unchanged ±0.02 windows.

## Round 4: many-league calibration

**EXECUTED before retuning:** sixty fresh 22-team leagues at the round-3
constants produced **2.540620 goals**, **0.466558 home wins**, and **0.263492
draws** per match. Their goals spread was minimum **2.244589**, 10th percentile
**2.389610**, median **2.549784**, 90th percentile **2.683983**, and maximum
**2.772727**; **47/60 (78.33%)** were inside the real season-to-season band.
The old fixed-squad sample therefore concealed a material league-generation
effect.

**REASONED before the final runs:** changing only the finishing probability
multiplier was predicted to produce about **2.67 goals**, **0.471 home wins**,
and **0.257 draws** in both 200-league samples. The predicted per-league goals
spread was approximately **2.35 / 2.51 / 2.67 / 2.81 / 2.91** at minimum, 10th
percentile, median, 90th percentile, and maximum, with about **90%** of leagues
inside the real season-to-season band.

**REASONED constant choice (main → round 3 → round 4):**
`goal.probabilityMultiplier` is **1 → 0.785 → 0.825**. In football terms, a
slightly larger share of shots that have already beaten the defence and keeper
now become goals; no progression, formation, or home-advantage behavior was
changed.

**EXECUTED final results:** the 200 tuning leagues produced **2.678874 goals**,
**0.472175 home wins**, and **0.251829 draws** per match. Their goals spread was
**2.357143 / 2.545455 / 2.677489 / 2.803030 / 2.945887**, and **190/200
(95%)** were inside the real band. The sealed 200 held-out leagues produced
**2.699600 / 0.474437 / 0.249394**; their spread was **2.385281 / 2.567100 /
2.699134 / 2.841991 / 3.008658**, and **186/200 (93%)** were inside the band.
Both samples passed all three calibration rules and the 80% individual-league
rule. The predictions were directionally correct; both samples' upper extremes
were higher than predicted.

**EXECUTED pinned figures (round 3 → round 4):** the match-lab goals pin moved
**2.3518 → 2.4722** and was deliberately not rebaselined. The first unchanged
strength pin measured in the full suite, strongest-by-level at 8 teams, moved
**84 → 81**; the test stopped at that first exact mismatch, so later pinned
sizes are not claimed here. Formation/style presence, game-state ordering, and
all invariants still passed at their unchanged thresholds.

## Round 5: every league size measured

**REASONED before regeneration:** measuring the previously copied 8-, 12-,
16-, and 20-team rows with the round-4 engine should raise their goals per
match, because the finishing multiplier changed from the value that produced
the committed rows. I predict approximately **2.69 / 2.77 / 2.70 / 2.70**
goals per match respectively, with small home-win and draw movements; the
22-team many-league row should reproduce round 4 exactly. Strength evidence is
also expected to reproduce the engine measurements seen in round 4, including
the accepted 8-team strongest-by-level change **84 → 81**. These predictions
were written before running either evidence generator.

**EXECUTED regeneration (tuning rows, goals/home wins/draws):** 8 teams moved
**2.554821/0.464554/0.250714 → 2.687589/0.470268/0.243393**; 12 moved
**2.632197/0.471212/0.244697 → 2.771818/0.476818/0.236212**; 16 moved
**2.517417/0.461979/0.258813 → 2.644646/0.468333/0.249375**; 20 moved
**2.599461/0.466171/0.259395 → 2.731289/0.474263/0.249737**; and the
fresh-league 22-team row reproduced at
**2.678874/0.472175/0.251829**. The prediction was directionally correct for
all four formerly stale rows.

**EXECUTED regeneration (validation rows, goals/home wins/draws):** 8 teams
moved **2.521964/0.463304/0.249821 → 2.647768/0.468482/0.243304**; 12 moved
**2.640152/0.467955/0.246212 → 2.777273/0.474659/0.240265**; 16 moved
**2.499667/0.460625/0.259333 → 2.628750/0.467229/0.251875**; 20 moved
**2.613684/0.473026/0.255645 → 2.744921/0.479276/0.247684**; and 22
reproduced at **2.699600/0.474437/0.249394**.

**EXECUTED regenerated strongest-by-level pins:** 8 teams **84 → 81**, 12
**28 → 23**, 16 **54 → 49**, 20 **73 → 70**, and 22 **40 → 41**.
At 22 teams the engine-weighted strongest squad won **99/200** and the
level-to-position Spearman was **−0.828**, so the round-4 strength rules remain
satisfied. The match-lab goals drift pin was also accepted at
**2.3518 → 2.4722**.
