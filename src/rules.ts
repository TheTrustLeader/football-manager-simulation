export type SeasonId = number;
export type TableTieBreak = "goalDifference" | "goalAverage";
export interface LeagueShape {
  strongClubCount: number;
  strongMinimum: number;
  strongMaximum: number;
  otherMinimum: number;
  otherMaximum: number;
}

export interface SeasonRules {
  pointsForAWin: number;
  tableTieBreak: TableTieBreak;
  firstDivisionTeams: number;
  leagueShape: LeagueShape;
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

const RULE_NAMES: readonly (keyof SeasonRules)[] = ["pointsForAWin", "tableTieBreak", "firstDivisionTeams", "leagueShape"];

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
    } else {
      resolved.leagueShape = matches[0]!.value as LeagueShape;
    }
  }
  return resolved;
}
