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

## ⚠ Known limitation — the comparison is one draw per league size

The level-versus-rating comparison is **one comparison per league size, not a rate over 200 seasons.**
Squads are generated once per league from `seedFromText(id|level|identity)`, so the strongest-by-level
and strongest-by-rating teams are fixed for the whole run.

Round 2 (22 Sep 2026) made the evidence say so. The field is now
`strongestByLevelVersusActualRating: { strongestByLevelId, strongestByActualRatingId, sameTeam }` —
no count, no proportion, no standard error, because there is no denominator. It previously reported
`{count: 200, proportion: 1}`, which was `seasonsSimulated` multiplied by a single true/false and read
as 200 independent observations.

The conclusions above therefore rest on **four single draws**, one per league size, not on 800
observations. That is enough to rule out the labelling explanation at twelve teams, because the two
methods pick the same team there and the dip is measured over the full 200 seasons. It is not enough to
say how *often* level and actual quality disagree in general. Answering that needs the league generated
many times over — varying identities or generator seeds. Briefed as issue #32.

## Positive control

The four committed strongest-by-level figures (82, 21, 57, 85) are unchanged by this work, and
`createStrengthEvidence` now throws if any sweep — complete or partial — reports different ones.

---

# ADDENDUM — what the twelve-team league does (question still open — see OUTCOME below)

**Recorded 22 September 2026, BST.** Issue #17. Run EXECUTED 22 Sep 2026, 08:25 BST.
200 seasons at 12 and 20 teams, same controls as the committed sweep.
**Positive control:** the committed title counts were reproduced exactly — 21/200 at twelve, 85/200 at twenty.

## EXECUTED — what the twelve-team league actually does

| Team | Squad rating | Titles (of 200) | Mean points |
|---|---|---|---|
| `team-12` | **13.24 (best)** | 21 | **38.0** |
| `team-10` | 12.54 | 79 | **43.3** |
| `team-11` | 12.23 | 53 | 42.3 |

Two lower-rated squads beat the best-rated one by four to five points a season, and the order is stable
across all 200 seasons.

## EXECUTED — three explanations ruled out

- **Not a labelling artefact.** At twelve teams the nominal strongest team *is* the best-rated squad
  (`strongestByLevelVersusActualRating.sameTeam: true`), so the dip is not the wrong team being called
  strongest.
- **Not tight spacing.** Measured top-two rating gaps: 8 → 0.863, 12 → 0.705, 16 → 0.000, 20 → 0.432.
  Twelve is *better* separated than twenty and does roughly four times worse.
- **Not the football failing to resolve strength.** The points order is repeatable over 200 seasons, so
  the engine is resolving *something* consistently — just not the thing `actualSquadRating` measures.

## REASONED — the remaining explanation, not yet tested

`actualSquadRating` is a flat mean of every attribute on the starting eleven. The engine plainly does
not value attributes equally. At twelve teams the top-rated squad appears to hold a mix the engine
under-rewards while two rivals hold mixes it over-rewards.

**This is reasoning, not measurement.** It is tested by issue #33 (FM-17-B5), which measures what a
point of each attribute is worth in league points and rebuilds the rating from those measurements. That
brief carries a falsifiable prediction: at twelve teams `team-10` and `team-11` should rank above
`team-12` on the engine-weighted rating. If they do not, the explanation above is wrong and the cause
lies in the fixture schedule, home/away balance, or how a season is played.

## ⚠ Caveat — the sixteen-team "89" must never be quoted bare

At sixteen teams the top two squads are rated **exactly equal (12.884)**, so "strongest by actual
rating" is decided there by sort order alone. The committed evidence records two different figures for
sixteen, and they are not interchangeable:

| Sixteen teams | Team | Tops table |
|---|---|---|
| Strongest **by level** | `sweep-16-team-16` | **57/200** |
| Strongest **by actual rating** | `sweep-16-team-15` | **89/200** |

Sixteen is the only league size where these disagree (`sameTeam: false`). The 89 belongs to whichever
of two tied squads happened to sort first — it is not evidence that the better squad wins more often.
Always state which ruler a sixteen-team figure came from.

## OUTCOME — the prediction above was tested and FALSIFIED

**Recorded 24 September 2026, 09:05 BST.** Measured by #33, delivered in PR #40 (merged 24 Sep 2026),
read from the committed `evidence/strength-resolution-evidence.json` on `main`.

The rebuilt rating weights each attribute by what the engine was measured to reward. At twelve teams it
still names `sweep-12-team-12` as the strongest squad, and that squad still tops the table only
**21/200** times. `team-10` and `team-11` do **not** rank above it. **The attribute-mix explanation is
wrong.**

| league size | strongest on engine-weighted rating | rating | topped table |
|---|---|---|---|
| 8 | `sweep-8-team-08` | 3.208280 | 82/200 |
| **12** | **`sweep-12-team-12`** | **3.263859** | **21/200** |
| 16 | `sweep-16-team-15` | 3.226807 | 89/200 |
| 20 | `sweep-20-team-20` | 3.318245 | 85/200 |

**REASONED — where #17 goes next.** The engine-weighted rating ranks teams well at every size
(rating-to-finish Spearman −0.770 to −0.799; twelve is −0.799, the strongest of the four), yet at twelve
the top team alone collapses. A ruler that
works everywhere but fails at exactly one size points at **the season, not the ruler**: the fixture
schedule, home/away balance, or how a twelve-team season is played. This is untested, so issue #17
stays open.
