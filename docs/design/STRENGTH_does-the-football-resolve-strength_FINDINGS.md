# FINDINGS — is the 12-team strength dip real football, or a mislabel?

**Recorded 21 September 2026, BST.** Issue #30 (FM-17-B3), following #17.
Evidence: `evidence/strength-resolution-evidence.json`, schema version 2.
Controls: league sizes 8, 12, 16, 20; 200 seasons each; season 1981; `deriveSeasonSeed` unchanged.

## The question

#17 established that the strongest team tops the table least often at twelve teams, and that the dip
survives 200 seeds. #30 asked whether that is the football failing to resolve strength, or simply the
wrong team being called "strongest" — because the experiment identified the strongest team by its
**nominal level**, the number the squad generator was asked for, and never measured the squad it
actually produced.

## EXECUTED — what the numbers say

| Teams | Strongest **by level** tops table | Strongest **by actual squad rating** tops table | Same team? | Spearman level / actual | Rating spread |
|---|---|---|---|---|---|
| 8 | 82/200 (0.410) | 82/200 (0.410) | yes | −0.770 / −0.754 | 6.147 |
| 12 | **21/200 (0.105)** | **21/200 (0.105)** | **yes** | −0.778 / −0.774 | 6.084 |
| 16 | 57/200 (0.285) | 89/200 (0.445) | **no** | −0.787 / −0.790 | 5.789 |
| 20 | 85/200 (0.425) | 85/200 (0.425) | yes | −0.778 / −0.793 | 6.526 |

## REASONED — the answer

**The twelve-team dip is real football, not a labelling artefact.** At twelve teams the nominally
strongest team *is* the strongest squad the engine generated, and it still wins the league only 21
times in 200. The explanation the brief hoped for — that the dip was an accident of naming — is ruled
out for the size where the dip actually occurs.

**At sixteen teams, part of the figure genuinely was a labelling artefact.** There the nominal and the
actual strongest are different teams, and the actual strongest tops the table 89/200 against the
57/200 recorded for the nominal one. The previously committed 0.285 at sixteen teams understates how
well the football resolves strength at that size.

**Why twelve teams specifically remains unanswered.** This work removed a candidate explanation; it did
not supply one.

## EXECUTED — the mislabelled field is confirmed

The retired `squadRatingToFinalPositionSpearman` (schema 1) equals the new
`levelToFinalPositionSpearman` (schema 2) to six decimal places at all four league sizes
(−0.770119, −0.777832, −0.786721, −0.778105). The field never measured squad rating. It is renamed and
the schema is bumped to 2.

## REASONED — a premise in the brief that did not survive

The brief reasoned that because attributes are rounded to integers, the systematic level difference
would mostly round away at tight spacing (`6/19 = 0.316` at twenty teams), leaving random squad
variation to swamp it.

The measured spread of actual squad rating does not behave that way: **6.147, 6.084, 5.789, 6.526** at
8, 12, 16 and 20 teams. It is flat, and it is *widest* at twenty teams — the size with the tightest
level spacing. Quantisation does not close the real quality gap as league size grows, so any future
explanation of the twelve-team dip cannot rest on a shrinking gap.

## ⚠ Known limitation — do not over-read the agreement figure

`strongestByLevelAndActualRatingAgreement` is **one comparison per league size, not a rate over 200
seasons.** Squads are generated once per league from `seedFromText(id|level|identity)`, so the
strongest-by-level and strongest-by-rating teams are fixed for the whole run. The reported `count` is
`seasonsSimulated` multiplied by a single true/false. A recorded `200/200` means "yes, once" — not 200
independent observations, and `0/200` likewise means "no, once".

The conclusions above therefore rest on **four single draws**, one per league size, not on 800
observations. That is enough to rule out the labelling explanation at twelve teams, because the two
methods pick the same team there and the dip is measured over the full 200 seasons. It is not enough to
say how *often* level and actual quality disagree in general. Answering that needs the league generated
many times over — varying identities or generator seeds — which this brief did not ask for.

## Positive control

The four committed strongest-by-level figures (82, 21, 57, 85) are unchanged by this work, and
`createStrengthEvidence` now throws if a complete sweep reports different ones.
