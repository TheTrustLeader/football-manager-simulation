export type SeasonId = number;
export type TableTieBreak = "goalDifference" | "goalAverage";
export interface LeagueShape {
  strongClubCount: number;
  strongMinimum: number;
  strongMaximum: number;
  otherMinimum: number;
  otherMaximum: number;
}

import type { StyleMatchups } from "./types.js";

export interface SeasonRules {
  pointsForAWin: number;
  tableTieBreak: TableTieBreak;
  firstDivisionTeams: number;
  leagueShape: LeagueShape;
  substitutesNamed: number;
  substitutesUsed: number;
  styleMatchups: StyleMatchups;
}

export type SeasonRule = {
  [Rule in keyof SeasonRules]: {
    rule: Rule;
    value: SeasonRules[Rule];
    firstSeason: SeasonId;
    lastSeason?: SeasonId;
    source: string;
  }
}[keyof SeasonRules];

export const SEASON_RULES: readonly SeasonRule[] = [
  {
    rule: "styleMatchups",
    value: {
      passing: { passing: 1, direct: 1.35, counter: 0.65, balanced: 1.35 },
      direct: { passing: 0.65, direct: 1, counter: 1.35, balanced: 0.65 },
      counter: { passing: 1.35, direct: 0.65, counter: 1, balanced: 1 },
      balanced: { passing: 0.65, direct: 1.35, counter: 1, balanced: 1 },
    },
    firstSeason: 1981,
    source: "Design decision by Scott, 29 Sep 2026 (#51): dated tactical match-ups",
  },
  {
    rule: "substitutesNamed", value: 1, firstSeason: 1981,
    source: "Football League regulations for 1981/82 allowed one named substitute.",
  },
  {
    rule: "substitutesUsed", value: 1, firstSeason: 1981,
    source: "Football League regulations for 1981/82 allowed one substitute to be used.",
  },
  {
    rule: "leagueShape",
    value: {
      strongClubCount: 5,
      strongMinimum: 12,
      strongMaximum: 13,
      otherMinimum: 7,
      otherMaximum: 10.5,
    },
    firstSeason: 1981,
    source: "Design decision by Scott, 28 Sep 2026 (#50): a handful of strong clubs",
  },
  {
    rule: "firstDivisionTeams",
    value: 22,
    firstSeason: 1981,
    source: "The Football League First Division contained 22 clubs in 1981/82.",
  },
  {
    rule: "pointsForAWin",
    value: 3,
    firstSeason: 1981,
    source: "Football League introduced 3 points for a win in 1981/82.",
  },
  {
    rule: "tableTieBreak",
    value: "goalDifference",
    firstSeason: 1981,
    source: "Goal difference has been in force in England since 1976/77.",
  },
];

const RULE_NAMES: readonly (keyof SeasonRules)[] = ["pointsForAWin", "tableTieBreak", "firstDivisionTeams", "leagueShape", "substitutesNamed", "substitutesUsed", "styleMatchups"];

/** Resolve every rule in force for a season identified by its starting year. */
export function rulesForSeason(
  season: SeasonId,
  table: readonly SeasonRule[] = SEASON_RULES,
): SeasonRules {
  if (!Number.isInteger(season)) throw new Error(`Season ${season} must be an integer`);
  if (season < 1981) throw new Error(`Season ${season} is before the game starts`);

  const resolved = {} as SeasonRules;
  for (const rule of RULE_NAMES) {
    const matches = table.filter((row) => row.rule === rule
      && season >= row.firstSeason
      && (row.lastSeason === undefined || season <= row.lastSeason));
    if (matches.length !== 1) {
      const problem = matches.length === 0 ? "no matching row" : "overlapping rows";
      throw new Error(`${String(rule)} for season ${season}: ${problem}`);
    }
    if (rule === "pointsForAWin") {
      resolved.pointsForAWin = matches[0]!.value as number;
    } else if (rule === "tableTieBreak") {
      resolved.tableTieBreak = matches[0]!.value as TableTieBreak;
    } else if (rule === "firstDivisionTeams") {
      resolved.firstDivisionTeams = matches[0]!.value as number;
    } else if (rule === "leagueShape") {
      resolved.leagueShape = matches[0]!.value as LeagueShape;
    } else if (rule === "substitutesNamed") {
      resolved.substitutesNamed = matches[0]!.value as number;
    } else if (rule === "substitutesUsed") {
      resolved.substitutesUsed = matches[0]!.value as number;
    } else {
      resolved.styleMatchups = matches[0]!.value as StyleMatchups;
    }
  }
  return resolved;
}

/** Explicitly dated rules for simulations which deliberately waive substitution limits. */
export const EXHIBITION_RULES_1981 = {
  ...rulesForSeason(1981),
  substitutesNamed: Number.POSITIVE_INFINITY,
  substitutesUsed: Number.POSITIVE_INFINITY,
};
