# FM-CAL-1 calibration report

## Diagnosis before tuning

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

- `goal.base`: **0.29 → 0.22**. In football terms, an average on-target effort is
  less likely to beat the goalkeeper, regardless of which team takes it.
- `homeAdvantage.homeProgressionProbabilityBoost`: **0.085 → 0.19**. In football
  terms, the home side gets into dangerous attacking phases more often, shifting
  results toward the historically stronger home advantage.

**REASONED, recorded before the final 200-season runs:** exploratory tuning seeds
1–40 predict **2.672 goals/match and 0.466 home wins** for seasons 1–200; the
separately sampled preview of validation seeds 201–240 predicts **2.648 and
0.470**. The full, final 1–200 and sealed 201–400 results below are not to be
inspected until this prediction and the constants are fixed.

## Final results

**EXECUTED:** both independent 200-season sets passed all three measures at 22
teams:

| Seasons | Goals/match | Home wins | Draws |
|---|---:|---:|---:|
| 1–200 (tuning) | 2.668387 | 0.468950 | 0.247165 |
| 201–400 (validation) | 2.676050 | 0.470216 | 0.247413 |

The applicable one-standard-deviation intervals are 2.564060–2.775226 for
goals and 0.465784–0.530428 for home wins; draws use the real season band of
0.205553–0.315551. The authoritative distributions and PASS statements are in
`evidence/season-calibration-evidence.json`.

**EXECUTED strength guard:** the 22-team engine-weighted strongest squad won
110/200 seasons (before: 112/200), and its rating-to-position Spearman was
−0.850220 (before: −0.857143). For 8/16/20 teams the corresponding strongest-top
counts were 87/90/85 and Spearman values were −0.775000/−0.776721/−0.786511.
