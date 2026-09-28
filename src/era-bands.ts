import { readFileSync } from "node:fs";

export type CalibrationMeasure = "goalsPerMatch" | "homeWinRate" | "drawRate";

export interface CalibrationBand {
  minimum: number;
  maximum: number;
  aggregateMean: number;
  seasonStandardDeviation: number;
}

export interface EraBands {
  goalsPerMatch: CalibrationBand;
  homeWinRate: CalibrationBand;
  drawRate: CalibrationBand;
}

export interface EraBandRow {
  firstSeason: number;
  lastSeason?: number;
  sourceFirstSeason: string;
  sourceLastSeason: string;
  sourceMatches: number;
  source: string;
  bands: EraBands;
}

interface SeasonCounts {
  season: string;
  startYear: number;
  matches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  goals: number;
}

const rounded = (value: number): number => Number(value.toFixed(6));

export function readSeasonCounts(csv = readFileSync(new URL("../data/english-first-division-seasons.csv", import.meta.url), "utf8")): SeasonCounts[] {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  if (header !== "season,startYear,matches,homeWins,draws,awayWins,goals") {
    throw new Error("Unexpected English First Division CSV header");
  }
  return lines.map((line) => {
    const [season, ...numbers] = line.split(",");
    const [startYear, matches, homeWins, draws, awayWins, goals] = numbers.map(Number);
    if (!season || [startYear, matches, homeWins, draws, awayWins, goals].some((value) => !Number.isInteger(value))) {
      throw new Error(`Invalid English First Division CSV row: ${line}`);
    }
    if (homeWins! + draws! + awayWins! !== matches) {
      throw new Error(`Inconsistent result counts for ${season}: ${homeWins} + ${draws} + ${awayWins} !== ${matches}`);
    }
    return { season, startYear: startYear!, matches: matches!, homeWins: homeWins!, draws: draws!, awayWins: awayWins!, goals: goals! };
  });
}

function deriveBand(rows: readonly SeasonCounts[], numerator: (row: SeasonCounts) => number): CalibrationBand {
  const sourceMatches = rows.reduce((sum, row) => sum + row.matches, 0);
  const aggregateMean = rows.reduce((sum, row) => sum + numerator(row), 0) / sourceMatches;
  const seasonValues = rows.map((row) => numerator(row) / row.matches);
  const seasonMean = seasonValues.reduce((sum, value) => sum + value, 0) / seasonValues.length;
  const variance = seasonValues.reduce((sum, value) => sum + ((value - seasonMean) ** 2), 0) / (seasonValues.length - 1);
  const seasonStandardDeviation = Math.sqrt(variance);
  return {
    minimum: rounded(aggregateMean - (2 * seasonStandardDeviation)),
    maximum: rounded(aggregateMean + (2 * seasonStandardDeviation)),
    aggregateMean: rounded(aggregateMean),
    seasonStandardDeviation: rounded(seasonStandardDeviation),
  };
}

export function deriveEraBandRow(allRows = readSeasonCounts(), firstSeason = 1978, lastSeason = 1985): EraBandRow {
  const rows = allRows.filter((row) => row.startYear >= firstSeason && row.startYear <= lastSeason);
  if (rows.length !== lastSeason - firstSeason + 1 || rows[0]?.startYear !== firstSeason || rows[rows.length - 1]?.startYear !== lastSeason) {
    throw new Error(`Era source must contain every season from ${firstSeason} through ${lastSeason}`);
  }
  const sourceMatches = rows.reduce((sum, row) => sum + row.matches, 0);
  return {
    firstSeason: firstSeason === 1978 && lastSeason === 1985 ? 1981 : firstSeason,
    sourceFirstSeason: rows[0].season,
    sourceLastSeason: rows[rows.length - 1]!.season,
    sourceMatches,
    source: "English First Division season totals (data/english-first-division-seasons.csv)",
    bands: {
      goalsPerMatch: deriveBand(rows, (row) => row.goals),
      homeWinRate: deriveBand(rows, (row) => row.homeWins),
      drawRate: deriveBand(rows, (row) => row.draws),
    },
  };
}

export const ERA_BANDS: readonly EraBandRow[] = [deriveEraBandRow()];

/** Resolve the single era-band row in force for a season identified by its starting year. */
export function eraBandsForSeason(season: number, table: readonly EraBandRow[] = ERA_BANDS): EraBandRow {
  if (!Number.isInteger(season)) throw new Error(`Season ${season} must be an integer`);
  const matches = table.filter((row) => season >= row.firstSeason
    && (row.lastSeason === undefined || season <= row.lastSeason));
  if (matches.length !== 1) {
    const problem = matches.length === 0 ? "no matching row" : "overlapping rows";
    throw new Error(`Era bands for season ${season}: ${problem}`);
  }
  return matches[0]!;
}
