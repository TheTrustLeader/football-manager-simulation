# WHAT THE FINISHED GAME IS — v1 DRAFT, awaiting Scott

**Written 2026-09-15 21:30 BST, from Scott's own description in chat.** ⚠ **DRAFT — not agreed.** The open questions at the foot must be answered before this becomes the definition of done.

⛔ **Before tonight this document did not exist.** The only recorded statement of intent anywhere in the repo or the Drive folder was one line in `README.md`: *"inspired by the pace and decision simplicity of late-1980s management games."* Everything else — gates 1 to 4 — describes how to build, never what is being built. That is why "how far to done" has had no answer.

## The game in one sentence

A football management game with the pace and simplicity of the late-1980s originals, which starts in a chosen season of the 1980s and lets you manage a club forward through the decades **as football itself changes around you**.

## The three stages, in Scott's order

### Stage A — one club, one season, and it is good to play
The 1980s game, complete and enjoyable on its own. A league season, matches you watch and intervene in, a squad you pick.
⭐ **This is the stage the build is in now.** Gates 1–4 all sit inside Stage A.

### Stage B — a career, not a season
What turns one season into a club you live with:
- multiple seasons, continuous
- promotion and relegation
- domestic cup competitions
- European competition
- a transfer market
- prize money, and money that constrains what you can do

### Stage C — manage through the eras
The stage that makes this game its own thing rather than a tribute. You keep managing as the sport changes underneath you — the competitions, the rules and the economics all move with the calendar. Scott's named examples:
- the Premier League forming
- the European Cup becoming the Champions League
- the Bosman ruling
- rule changes generally

⭐ Scott's own framing: *"can you manage in the different eras."* The era is a condition you manage inside, not a skin.
⚠ Scott's own note: **this is a long way off.** It is recorded here because it changes decisions today, not because it is being built now.

## ⭐⭐ Why Stage C cannot be left until Stage C

Stage C is not extra content. It is a claim about how the rules are stored, and it is being decided by default right now, every time a rule gets written as a constant.

**Measured tonight, not assumed** — `src/competition.ts` line 51:
```
const POINTS_FOR_A_WIN = 3;
```
A module-level constant. But the English league only moved to three points for a win in **1981-82**; before that it was two, and Italy did not follow until 1994. The table's tie-break order is fixed in the same way (points, goal difference, goals scored) — yet England used **goal average**, not goal difference, until 1976, and other countries rank on head-to-head.

So as written today, the league table can only ever compute one era's football. The same will be true of every rule added between now and Stage B unless the decision is made deliberately.

**The choice, stated plainly:**
- **Rules as constants** — faster now, and Stage C becomes a rewrite of everything Stage B touches.
- **Rules as dated data** — each rule carries the date it came in, and the season asks for the rule set in force. Slightly slower per rule, and Stage C becomes content rather than surgery.

⚠ The engine already does this for the *football* — `engineConfigVersion`, `engineConfigHash` and the golden file version the match engine's behaviour deliberately. **The competition layer does not.** The pattern exists; it simply was not carried across.

⭐ The measurable test of the decision: *adding "two points for a win before 1981" should change one data row, not one function.*

## ⭐⭐ The era machine is already built — it is called the calibration harness

**Found 15 Sep by reading the test bed, at Scott's prompt.** The engine is not tested by eyeballing a match. It is tested against **stated bands of real football behaviour**, and the harness has been proven able to fail:

| Part | What it is | Where |
|---|---|---|
| Calibration targets | goals/match **2.4–2.7** · draws **27–31%** · home wins **41–47%** | `engine-config.ts` `calibrationTargets` |
| CI guardrails | the same three, buffered, plus mirror fairness and strong/weak win rates | `engine-config.ts` `ciGuardrails` |
| Tuning seed pool | `tuning-v1`, seeds 1–1,000,000 | `seed-pools.ts` |
| **Sealed** validation pool | `validation-v1`, seeds 10,000,001–11,000,000 — never tuned against | `seed-pools.ts` |
| Health run | 220,000 matches on `0.9.2`: home 42.5% · draws 27.3% · goals 2.710 | README, EXECUTED 7 Sep |
| Proof it can fail | home advantage forced to 0.40 → exit 1, naming `homeWinRate 48.7%` against the band | README |

⭐⭐ **This is exactly the machine the era stages need.** *"Does this season's football behave like its era?"* is the same question as *"is the engine inside its band?"* — the only thing missing is a **date on the band**. Era support is therefore not a new system. It is one field added to a harness that already exists and is already proven honest.

⛔ **But nobody can currently say which era the engine is calibrated to.** `evidence.ts:335` calls them *"the sourced goals, draw and home-win bands"* — yet **no source is recorded anywhere in the repo or this Drive folder.** They are undated and unattributed.

That matters now that the start is 1981/82, because these numbers are era-dependent:
- **Home advantage has declined measurably over the decades.** A home-win band taken from modern football will make an early-80s season feel wrong — and wrong in a way the harness will report as green, because the band itself is the thing that is out of date.
- Goals per match varies by era and by country.

⭐ **The question to answer before Stage A is called done:** are 2.4–2.7 goals, 27–31% draws and 41–47% home wins the right numbers **for the English First Division in 1981/82**, or were they set from modern football? Until that is sourced and dated, "the engine is calibrated" is a claim about nothing in particular.

⚠ **Also worth a look, not yet a defect:** the 10,000-match `simulate` output on the issue-16/17/20 branches reports **2.905 goals/match**, against a calibration target of 2.4–2.7. That is a different population from the 220,000-match evidence run (2.710), so it may be nothing. It has not been explained anywhere, so it should be.

## What is NOT claimed here
- No player or club is real. The repo is explicitly a **fictional** game — era rules and competition structures are public historical fact, real squads are not, and nothing above changes that.
- Nothing here says Stage C gets built. It says the door stays open at a known price.

## ⛔ OPEN — needs Scott before this is agreed

1. ~~Which season does the game start in?~~ **DECIDED by Scott, 15 Sep 2026: the game starts in 1981/82.** Three points for a win arrives in the first season, so the era mechanic has to work from day one rather than four seasons in.
2. **Rules as constants or as dated data?** The decision above. It is cheap now and expensive later.
3. **What is the smallest version you would actually sit and play for an hour?** That, not a gate, is the real definition of Stage A done.
4. **Does FM move to its own project?** Recommended — see the separate note.
