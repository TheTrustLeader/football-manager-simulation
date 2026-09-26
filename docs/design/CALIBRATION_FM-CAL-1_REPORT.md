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
