import { stableHash } from "./engine-config.js";
import type { MatchOutput } from "./types.js";

/**
 * THE FOOTBALL, separated from everything else a match output carries.
 *
 * A match output holds three different kinds of thing, and only one of them is
 * the game:
 *
 *   1. THE FOOTBALL — who played, what the score and the shots and the cards
 *      were, every event in order, who contributed what, and how tired everyone
 *      finished. If any of this moves, the simulation has changed.
 *   2. LABELS — engineConfigVersion and engineConfigHash. These say which engine
 *      played the match, not what happened in it. The golden test asserts them
 *      separately, so folding them in here would make one red mean two things.
 *   3. MEASUREMENTS — `diagnostics`. Deliberately excluded, and excluding it
 *      costs no detection power: every field in it is either a restatement of
 *      config values that were applied (the homeAdvantage and fatigue blocks,
 *      already covered by engineConfigHash) or a count of what happened
 *      (gameState). Neither can move on its own. If the counting changes but the
 *      events do not, that is telemetry and should not raise an alarm. If the
 *      football changes, the events and stats below catch it first.
 *
 * This is an ALLOW-list, on purpose. A field added to MatchOutput does NOT
 * silently join the hash, which is what stops additive telemetry crying wolf.
 * The cost is that a genuinely footballing new field would be missed, so
 * tests/golden.test.ts fails if MatchOutput grows a key nobody has classified.
 */
export interface MatchResult {
  seed: number;
  homeTeamId: string;
  awayTeamId: string;
  home: MatchOutput["home"];
  away: MatchOutput["away"];
  events: MatchOutput["events"];
  contributions: MatchOutput["contributions"];
  finalCondition: MatchOutput["finalCondition"];
}

/** The fields above, by name, so a test can prove nothing has been forgotten. */
export const MATCH_RESULT_FIELDS = [
  "seed",
  "homeTeamId",
  "awayTeamId",
  "home",
  "away",
  "events",
  "contributions",
  "finalCondition",
] as const;

/** Fields deliberately left out, and why, in one place a reader can check. */
export const NOT_THE_FOOTBALL = [
  "engineConfigVersion",
  "engineConfigHash",
  "diagnostics",
] as const;

export function matchResult(output: MatchOutput): MatchResult {
  return {
    seed: output.seed,
    homeTeamId: output.homeTeamId,
    awayTeamId: output.awayTeamId,
    home: output.home,
    away: output.away,
    events: output.events,
    contributions: output.contributions,
    finalCondition: output.finalCondition,
  };
}

export function matchResultHash(output: MatchOutput): string {
  return stableHash(matchResult(output));
}
