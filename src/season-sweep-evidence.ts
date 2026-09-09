import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { runSeason } from "./competition.js";
import { makeTeam } from "./fixtures.js";

// These acceptance bands were fixed before any 50-seed sweep existed.
export const GOALS_PER_MATCH_BAND = { minimum: 2.60, maximum: 3.10 } as const;
export const HOME_WIN_RATE_BAND = { minimum: 0.40, maximum: 0.50 } as const;
export const DRAW_RATE_BAND = { minimum: 0.20, maximum: 0.30 } as const;

export const LEAGUE_SIZES = [8, 12, 16, 20] as const;
export const SEASON_NUMBERS = Array.from({ length: 50 }, (_, index) => index + 1);
export const OUTPUT_PATH = "evidence/season-sweep-evidence.json";

export interface Distribution {
  mean: number;
  standardDeviation: number;
}

export interface ExtendedDistribution extends Distribution {
  minimum: number;
  maximum: number;
  percentile5: number;
  percentile95: number;
}

export interface SweepRow {
  teamCount: number;
  seasonsSimulated: number;
  totalMatchesSimulated: number;
  goalsPerMatch: ExtendedDistribution;
  homeWinRate: Distribution;
  drawRate: Distribution;
  pointsGapTopToBottom: Distribution;
  strongestTeamFinishedTop: number;
  bandResults: {
    goalsPerMatch: "WITHIN BAND" | "OUTSIDE BAND";
    homeWinRate: "WITHIN BAND" | "OUTSIDE BAND";
    drawRate: "WITHIN BAND" | "OUTSIDE BAND";
  };
}

export interface SweepEvidence {
  schemaVersion: number;
  purpose: string;
  command: string;
  timingPolicy: string;
  controls: {
    teamCounts: readonly number[];
    seasonNumbers: { first: number; last: number; count: number };
    seedDerivation: string;
    levelRange: { weakest: number; strongest: number };
    acceptanceBands: {
      goalsPerMatch: typeof GOALS_PER_MATCH_BAND;
      homeWinRate: typeof HOME_WIN_RATE_BAND;
      drawRate: typeof DRAW_RATE_BAND;
    };
  };
  rows: SweepRow[];
}

const rounded = (value: number): number => Number(value.toFixed(6));

/** Gives each league size a disjoint block of 50 seeds. */
export function deriveSeasonSeed(teamCount: number, seasonNumber: number): number {
  return teamCount * 1000 + seasonNumber;
}

function makeEvidenceTeams(teamCount: number) {
  return Array.from({ length: teamCount }, (_, index) => {
    const level = 7 + (6 * index / (teamCount - 1));
    return makeTeam(`sweep-${teamCount}-team-${String(index + 1).padStart(2, "0")}`, level);
  });
}

export function distribution(values: readonly number[]): Distribution {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return { mean: rounded(mean), standardDeviation: rounded(Math.sqrt(variance)) };
}

function percentile(sortedValues: readonly number[], percentileValue: number): number {
  const index = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const fraction = index - lower;
  const lowerValue = sortedValues[lower]!;
  const upperValue = sortedValues[Math.ceil(index)]!;
  return lowerValue + fraction * (upperValue - lowerValue);
}

export function extendedDistribution(values: readonly number[]): ExtendedDistribution {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    ...distribution(values),
    minimum: rounded(sorted[0]!),
    maximum: rounded(sorted[sorted.length - 1]!),
    percentile5: rounded(percentile(sorted, 0.05)),
    percentile95: rounded(percentile(sorted, 0.95)),
  };
}

function bandResult(value: number, band: { minimum: number; maximum: number }) {
  return value >= band.minimum && value <= band.maximum ? "WITHIN BAND" as const : "OUTSIDE BAND" as const;
}

export function runSweepForSize(teamCount: number): SweepRow {
  const teams = makeEvidenceTeams(teamCount);
  const goalsPerMatch: number[] = [];
  const homeWinRates: number[] = [];
  const drawRates: number[] = [];
  const pointsGaps: number[] = [];
  let totalMatchesSimulated = 0;
  let strongestTeamFinishedTop = 0;

  for (const seasonNumber of SEASON_NUMBERS) {
    const season = runSeason(teams, deriveSeasonSeed(teamCount, seasonNumber));
    const totalGoals = season.matches.reduce((sum, match) => sum + match.home.goals + match.away.goals, 0);
    const homeWins = season.matches.filter((match) => match.home.goals > match.away.goals).length;
    const draws = season.matches.filter((match) => match.home.goals === match.away.goals).length;
    const champion = season.table[0]!;
    const bottom = season.table[season.table.length - 1]!;
    totalMatchesSimulated += season.matches.length;
    goalsPerMatch.push(totalGoals / season.matches.length);
    homeWinRates.push(homeWins / season.matches.length);
    drawRates.push(draws / season.matches.length);
    pointsGaps.push(champion.points - bottom.points);
    if (champion.teamId === teams[teams.length - 1]!.id) strongestTeamFinishedTop += 1;
  }

  const goals = extendedDistribution(goalsPerMatch);
  const homeWins = distribution(homeWinRates);
  const draws = distribution(drawRates);
  return {
    teamCount,
    seasonsSimulated: SEASON_NUMBERS.length,
    totalMatchesSimulated,
    goalsPerMatch: goals,
    homeWinRate: homeWins,
    drawRate: draws,
    pointsGapTopToBottom: distribution(pointsGaps),
    strongestTeamFinishedTop,
    bandResults: {
      goalsPerMatch: bandResult(goals.mean, GOALS_PER_MATCH_BAND),
      homeWinRate: bandResult(homeWins.mean, HOME_WIN_RATE_BAND),
      drawRate: bandResult(draws.mean, DRAW_RATE_BAND),
    },
  };
}

export function createSweepEvidence(rows: SweepRow[]): SweepEvidence {
  return {
    schemaVersion: 1,
    purpose: "Measure 50-season outcome distributions at candidate league sizes; this evidence does not calibrate the engine.",
    command: "npm run season:sweep",
    timingPolicy: "Wall-clock timings are printed only to stdout and excluded from this deterministic JSON.",
    controls: {
      teamCounts: LEAGUE_SIZES,
      seasonNumbers: { first: 1, last: 50, count: 50 },
      seedDerivation: "teamCount * 1000 + seasonNumber; each league size has a disjoint block of 50 seeds.",
      levelRange: { weakest: 7, strongest: 13 },
      acceptanceBands: {
        goalsPerMatch: GOALS_PER_MATCH_BAND,
        homeWinRate: HOME_WIN_RATE_BAND,
        drawRate: DRAW_RATE_BAND,
      },
    },
    rows,
  };
}

export function serialiseSweepEvidence(evidence: SweepEvidence): string {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

export function formatSweepTable(rows: readonly SweepRow[], elapsedMs: ReadonlyMap<number, number>): string {
  const header = "Teams  Matches  Goals/m (sd, p05-p95)       Home win (sd)        Draw (sd)            Gap (sd)       Strongest top  Bands (G/H/D)  Time ms";
  const lines = rows.map((row) => `${String(row.teamCount).padStart(5)}  ${String(row.totalMatchesSimulated).padStart(7)}  `
    + `${row.goalsPerMatch.mean.toFixed(3)} (${row.goalsPerMatch.standardDeviation.toFixed(3)}, ${row.goalsPerMatch.percentile5.toFixed(3)}-${row.goalsPerMatch.percentile95.toFixed(3)})  `
    + `${row.homeWinRate.mean.toFixed(3)} (${row.homeWinRate.standardDeviation.toFixed(3)})  `
    + `${row.drawRate.mean.toFixed(3)} (${row.drawRate.standardDeviation.toFixed(3)})  `
    + `${row.pointsGapTopToBottom.mean.toFixed(2)} (${row.pointsGapTopToBottom.standardDeviation.toFixed(2)})  `
    + `${String(row.strongestTeamFinishedTop).padStart(2)}/50          `
    + `${row.bandResults.goalsPerMatch}/${row.bandResults.homeWinRate}/${row.bandResults.drawRate}  `
    + `${elapsedMs.get(row.teamCount)!.toFixed(1)}`);
  return [header, ...lines].join("\n");
}

function main(): void {
  const timings = new Map<number, number>();
  const rows = LEAGUE_SIZES.map((teamCount) => {
    const started = performance.now();
    const row = runSweepForSize(teamCount);
    timings.set(teamCount, performance.now() - started);
    return row;
  });
  const evidence = createSweepEvidence(rows);
  mkdirSync("evidence", { recursive: true });
  writeFileSync(OUTPUT_PATH, serialiseSweepEvidence(evidence), "utf8");
  console.log(formatSweepTable(rows, timings));
  console.log(`Total wall-clock time: ${[...timings.values()].reduce((sum, value) => sum + value, 0).toFixed(1)} ms`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
