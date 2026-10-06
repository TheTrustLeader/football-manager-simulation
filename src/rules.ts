export type SeasonId = number;
export type TableTieBreak = "goalDifference" | "goalAverage";
export interface LeagueShape {
  strongClubCount: number;
  strongMinimum: number;
  strongMaximum: number;
  otherMinimum: number;
  otherMaximum: number;
}
export type DivisionShapes = Readonly<Record<1 | 2 | 3 | 4, LeagueShape>>;

import type { StyleMatchups } from "./types.js";

export interface SeasonRules {
  leagueRoundGapDays: readonly number[];
  pointsForAWin: number;
  tableTieBreak: TableTieBreak;
  firstDivisionTeams: number;
  divisionShapes: DivisionShapes;
  substitutesNamed: number;
  substitutesUsed: number;
  styleMatchups: StyleMatchups;
  computerStyleAdaptRate: number;
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
    rule: "leagueRoundGapDays",
    value: [7, 4, 3, 7, 7, 3, 4, 7, 7, 7, 7, 7, 7, 7, 7, 3, 4, 7, 7, 7, 7, 2, 12, 7, 14, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 2, 5, 7, 7, 3, 4, 7],
    firstSeason: 1981,
    source: "worldfootball.net, all matches 1981/82 (https://www.worldfootball.net/all_matches/eng-premier-league-1981-1982/), grouped by fixture round. R14, R16, R19-R24, R27, R28, R31, R34, R36 and R40 are REASONED from the calendar slots between neighbouring rounds. As played, the December 1981 freeze wiped out most of R19-R24 (evidence recorded on #69).",
  },
  {
    rule: "computerStyleAdaptRate",
    value: 0.25,
    firstSeason: 1981,
    source: "Design decision by Scott, 29 Sep 2026 (#51): computer clubs adapt to the opponent in one match out of four; strength set by Codex in FM-STYLE-1 round 2.",
  },
  {
    rule: "styleMatchups",
    value: {
      passing: { passing: 1, direct: 1.124, counter: 0.876, balanced: 1.124 },
      direct: { passing: 0.876, direct: 1, counter: 1.124, balanced: 0.876 },
      counter: { passing: 1.124, direct: 0.876, counter: 1, balanced: 1 },
      balanced: { passing: 0.876, direct: 1.124, counter: 1, balanced: 1 },
    },
    firstSeason: 1981,
    source: "Directions chosen by Scott, 29 Sep 2026 (#51); strengths set by Codex in FM-STYLE-1 round 2.",
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
    rule: "divisionShapes",
    value: {
      1: { strongClubCount: 5, strongMinimum: 12, strongMaximum: 13, otherMinimum: 7, otherMaximum: 10.5 },
      2: { strongClubCount: 5, strongMinimum: 8, strongMaximum: 8.25, otherMinimum: 5.5, otherMaximum: 8 },
      3: { strongClubCount: 5, strongMinimum: 5, strongMaximum: 5.5, otherMinimum: 3.5, otherMaximum: 5 },
      4: { strongClubCount: 5, strongMinimum: 3.5, strongMaximum: 4, otherMinimum: 1.5, otherMaximum: 3.5 },
    },
    firstSeason: 1981,
    source: "Design decisions by Scott, 28 Sep 2026 (#50) and 6 Oct 2026 (#93): overlapping steps and a strong group in every division.",
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

const RULE_NAMES: readonly (keyof SeasonRules)[] = ["leagueRoundGapDays", "pointsForAWin", "tableTieBreak", "firstDivisionTeams", "divisionShapes", "substitutesNamed", "substitutesUsed", "styleMatchups", "computerStyleAdaptRate"];

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
    if (rule === "leagueRoundGapDays") {
      resolved.leagueRoundGapDays = matches[0]!.value as readonly number[];
    } else if (rule === "pointsForAWin") {
      resolved.pointsForAWin = matches[0]!.value as number;
    } else if (rule === "tableTieBreak") {
      resolved.tableTieBreak = matches[0]!.value as TableTieBreak;
    } else if (rule === "firstDivisionTeams") {
      resolved.firstDivisionTeams = matches[0]!.value as number;
    } else if (rule === "divisionShapes") {
      resolved.divisionShapes = matches[0]!.value as DivisionShapes;
    } else if (rule === "substitutesNamed") {
      resolved.substitutesNamed = matches[0]!.value as number;
    } else if (rule === "substitutesUsed") {
      resolved.substitutesUsed = matches[0]!.value as number;
    } else if (rule === "styleMatchups") {
      resolved.styleMatchups = matches[0]!.value as StyleMatchups;
    } else {
      resolved.computerStyleAdaptRate = matches[0]!.value as number;
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
