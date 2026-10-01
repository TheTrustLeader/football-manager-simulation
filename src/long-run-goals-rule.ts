import { eraBandsForSeason } from "./era-bands.js";
import type { EraBandRow } from "./era-bands.js";

export interface LongRunGoalsRule {
  firstSeason: number;
  lastSeason?: number;
  tolerance: number;
  source: string;
}

export const LONG_RUN_GOALS_RULES: readonly LongRunGoalsRule[] = [{
  firstSeason: 1981,
  tolerance: 0.05,
  source: "Scott, 30 Sep 2026, #76",
}];

export function longRunGoalsRuleForSeason(season: number, rules: readonly LongRunGoalsRule[] = LONG_RUN_GOALS_RULES): LongRunGoalsRule {
  if (!Number.isInteger(season)) throw new Error(`Season ${season} must be an integer`);
  const matches = rules.filter((rule) => season >= rule.firstSeason
    && (rule.lastSeason === undefined || season <= rule.lastSeason));
  if (matches.length !== 1) throw new Error(`Long-run goals rule for season ${season}: ${matches.length === 0 ? "no matching rule" : "overlapping rules"}`);
  return matches[0]!;
}

export function verifyLongRunGoalsAverage(goalsPerMatch: number, season: number, eraBands?: readonly EraBandRow[]): void {
  const rule = longRunGoalsRuleForSeason(season);
  const mean = eraBandsForSeason(season, eraBands).bands.goalsPerMatch.aggregateMean;
  const difference = Math.abs(goalsPerMatch - mean);
  if (difference > rule.tolerance) {
    throw new Error(`Goals per match ${goalsPerMatch} differs from the ${season} era aggregate mean ${mean} by ${difference}; tolerance ${rule.tolerance} (${rule.source})`);
  }
}
