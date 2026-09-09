import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { runSeason } from "./competition.js";
import { makeTeam } from "./fixtures.js";
import {
  deriveSeasonSeed,
  distribution,
  extendedDistribution,
  type Distribution,
  type ExtendedDistribution,
} from "./season-sweep-evidence.js";

export const LEAGUE_SIZES = [8, 12, 16, 20] as const;
export const SEASON_NUMBERS = Array.from({ length: 200 }, (_, index) => index + 1);
export const OUTPUT_PATH = "evidence/strength-resolution-evidence.json";

const SHARED_SEED_CONTROL = {
  16: { strongestTeamFinishedTop: 17, goalsPerMatch: 2.929, homeWinRate: 0.428167, drawRate: 0.244583, pointsGapTopToBottom: 43.34 },
  20: { strongestTeamFinishedTop: 24, goalsPerMatch: 2.988737, homeWinRate: 0.432737, drawRate: 0.245632, pointsGapTopToBottom: 48.2 },
} as const;

interface ControlActual {
  strongestTeamFinishedTop: number;
  goalsPerMatch: number;
  homeWinRate: number;
  drawRate: number;
  pointsGapTopToBottom: number;
}
const sharedSeedResults = new WeakMap<StrengthRow, ControlActual>();

export interface StrengthRow {
  teamCount: number;
  seasonsSimulated: number;
  totalMatchesSimulated: number;
  strongestTeamFinishedTop: { count: number; proportion: number; standardError: number };
  strongestTeamFinishingPosition: { mean: number; median: number };
  strongestTeamMeanSignedPointsMarginToTop: number;
  squadRatingToFinalPositionSpearman: number;
  goalsPerMatch: ExtendedDistribution;
  homeWinRate: Distribution;
  drawRate: Distribution;
  pointsGapTopToBottom: Distribution;
}

interface Comparison {
  otherTeamCount: number;
  difference: number;
  combinedStandardError: number;
  moreThanTwoStandardErrors: boolean;
  conclusion: "FINDING" | "NOT A FINDING";
}

export interface StrengthEvidence {
  schemaVersion: number;
  purpose: string;
  command: string;
  timingPolicy: string;
  controls: {
    teamCounts: readonly number[];
    seasonNumbers: { first: number; last: number; count: number };
    seedDerivation: string;
    levelRange: { weakest: number; strongest: number };
  };
  positiveControl: Array<{ teamCount: number; sharedSeasonNumbers: string; status: "REPRODUCED" }>;
  rows: StrengthRow[];
  strongestTopComparisons: Array<{ teamCount: number; comparisons: Comparison[] }>;
}

const rounded = (value: number): number => Number(value.toFixed(6));

export function makeEvidenceTeams(teamCount: number) {
  return Array.from({ length: teamCount }, (_, index) => {
    const level = 7 + (6 * index / (teamCount - 1));
    return {
      level,
      team: makeTeam(`sweep-${teamCount}-team-${String(index + 1).padStart(2, "0")}`, level),
    };
  });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function ranks(values: readonly number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = Array<number>(values.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end]!.value === sorted[start]!.value) end += 1;
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) result[sorted[index]!.index] = rank;
    start = end;
  }
  return result;
}

export function spearman(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) throw new Error("Spearman inputs must be non-empty and equally sized");
  const leftRanks = ranks(left);
  const rightRanks = ranks(right);
  const leftMean = leftRanks.reduce((sum, value) => sum + value, 0) / leftRanks.length;
  const rightMean = rightRanks.reduce((sum, value) => sum + value, 0) / rightRanks.length;
  const numerator = leftRanks.reduce((sum, value, index) => sum + (value - leftMean) * (rightRanks[index]! - rightMean), 0);
  const leftSquares = leftRanks.reduce((sum, value) => sum + ((value - leftMean) ** 2), 0);
  const rightSquares = rightRanks.reduce((sum, value) => sum + ((value - rightMean) ** 2), 0);
  return rounded(numerator / Math.sqrt(leftSquares * rightSquares));
}

export function runStrengthForSize(teamCount: number): StrengthRow {
  const entries = makeEvidenceTeams(teamCount);
  const teams = entries.map(({ team }) => team);
  const strongestId = teams[teams.length - 1]!.id;
  const positions: number[] = [];
  const margins: number[] = [];
  const ratings: number[] = [];
  const allPositions: number[] = [];
  const goalsPerMatch: number[] = [];
  const homeWinRates: number[] = [];
  const drawRates: number[] = [];
  const pointsGaps: number[] = [];
  let totalMatchesSimulated = 0;
  let strongestTopCount = 0;
  let sharedStrongestTopCount = 0;

  for (const seasonNumber of SEASON_NUMBERS) {
    const season = runSeason(teams, deriveSeasonSeed(teamCount, seasonNumber));
    const champion = season.table[0]!;
    const bottom = season.table[season.table.length - 1]!;
    const strongestPosition = season.table.findIndex((row) => row.teamId === strongestId) + 1;
    const strongest = season.table[strongestPosition - 1]!;
    const totalGoals = season.matches.reduce((sum, match) => sum + match.home.goals + match.away.goals, 0);
    const homeWins = season.matches.filter((match) => match.home.goals > match.away.goals).length;
    const draws = season.matches.filter((match) => match.home.goals === match.away.goals).length;
    if (strongestPosition === 1) strongestTopCount += 1;
    if (seasonNumber <= 50 && strongestPosition === 1) sharedStrongestTopCount += 1;
    positions.push(strongestPosition);
    margins.push(strongest.points - champion.points);
    totalMatchesSimulated += season.matches.length;
    goalsPerMatch.push(totalGoals / season.matches.length);
    homeWinRates.push(homeWins / season.matches.length);
    drawRates.push(draws / season.matches.length);
    pointsGaps.push(champion.points - bottom.points);
    for (const [index, row] of season.table.entries()) {
      ratings.push(entries.find((entry) => entry.team.id === row.teamId)!.level);
      allPositions.push(index + 1);
    }
  }

  const proportion = strongestTopCount / SEASON_NUMBERS.length;
  const row: StrengthRow = {
    teamCount,
    seasonsSimulated: SEASON_NUMBERS.length,
    totalMatchesSimulated,
    strongestTeamFinishedTop: {
      count: strongestTopCount,
      proportion: rounded(proportion),
      standardError: rounded(Math.sqrt(proportion * (1 - proportion) / SEASON_NUMBERS.length)),
    },
    strongestTeamFinishingPosition: { mean: distribution(positions).mean, median: rounded(median(positions)) },
    strongestTeamMeanSignedPointsMarginToTop: distribution(margins).mean,
    squadRatingToFinalPositionSpearman: spearman(ratings, allPositions),
    goalsPerMatch: extendedDistribution(goalsPerMatch),
    homeWinRate: distribution(homeWinRates),
    drawRate: distribution(drawRates),
    pointsGapTopToBottom: distribution(pointsGaps),
  };
  if (teamCount === 16 || teamCount === 20) {
    sharedSeedResults.set(row, {
      strongestTeamFinishedTop: sharedStrongestTopCount,
      goalsPerMatch: distribution(goalsPerMatch.slice(0, 50)).mean,
      homeWinRate: distribution(homeWinRates.slice(0, 50)).mean,
      drawRate: distribution(drawRates.slice(0, 50)).mean,
      pointsGapTopToBottom: distribution(pointsGaps.slice(0, 50)).mean,
    });
  }
  return row;
}

function verifyPositiveControl(rows: readonly StrengthRow[]) {
  return ([16, 20] as const).map((teamCount) => {
    const row = rows.find((candidate) => candidate.teamCount === teamCount);
    if (!row) throw new Error(`Missing ${teamCount}-team experiment row`);
    const actual = sharedSeedResults.get(row);
    if (!actual) throw new Error(`Missing shared-seed results for ${teamCount}-team experiment row`);
    const expected = SHARED_SEED_CONTROL[teamCount];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`POSITIVE CONTROL FAILED for ${teamCount} teams: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}. STOP: season:sweep and strength:evidence disagree.`);
    }
    return { teamCount, sharedSeasonNumbers: "1-50", status: "REPRODUCED" as const };
  });
}

function comparisons(rows: readonly StrengthRow[]) {
  return rows.map((row) => ({
    teamCount: row.teamCount,
    comparisons: rows.filter((other) => other !== row).map((other) => {
      const difference = Math.abs(row.strongestTeamFinishedTop.proportion - other.strongestTeamFinishedTop.proportion);
      const combinedStandardError = Math.sqrt((row.strongestTeamFinishedTop.standardError ** 2) + (other.strongestTeamFinishedTop.standardError ** 2));
      const finding = difference > 2 * combinedStandardError;
      return {
        otherTeamCount: other.teamCount,
        difference: rounded(difference),
        combinedStandardError: rounded(combinedStandardError),
        moreThanTwoStandardErrors: finding,
        conclusion: finding ? "FINDING" as const : "NOT A FINDING" as const,
      };
    }),
  }));
}

export function createStrengthEvidence(rows: StrengthRow[]): StrengthEvidence {
  return {
    schemaVersion: 1,
    purpose: "Determine whether the 12-team strongest-team dip persists over 200 seeds without changing the football engine.",
    command: "npm run strength:evidence",
    timingPolicy: "Wall-clock timings are printed only to stdout and excluded from this deterministic JSON.",
    controls: {
      teamCounts: LEAGUE_SIZES,
      seasonNumbers: { first: 1, last: 200, count: 200 },
      seedDerivation: "deriveSeasonSeed(teamCount, seasonNumber), shared with season:sweep; seasons 1-50 overlap.",
      levelRange: { weakest: 7, strongest: 13 },
    },
    positiveControl: verifyPositiveControl(rows),
    rows,
    strongestTopComparisons: comparisons(rows),
  };
}

export function serialiseStrengthEvidence(evidence: StrengthEvidence): string {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

export function formatStrengthOutput(evidence: StrengthEvidence): string {
  const lines = evidence.rows.map((row) => {
    const comparison = evidence.strongestTopComparisons.find((entry) => entry.teamCount === row.teamCount)!;
    const conclusions = comparison.comparisons.map((item) => `${item.otherTeamCount}:${item.conclusion}`).join(", ");
    return `${row.teamCount} teams: top ${row.strongestTeamFinishedTop.count}/200 = ${row.strongestTeamFinishedTop.proportion.toFixed(3)} (SE ${row.strongestTeamFinishedTop.standardError.toFixed(3)}); position mean/median ${row.strongestTeamFinishingPosition.mean.toFixed(3)}/${row.strongestTeamFinishingPosition.median.toFixed(1)}; margin ${row.strongestTeamMeanSignedPointsMarginToTop.toFixed(3)}; Spearman ${row.squadRatingToFinalPositionSpearman.toFixed(3)}; comparisons [${conclusions}]`;
  });
  const controls = evidence.positiveControl.map((control) => `POSITIVE CONTROL ${control.teamCount} teams, seeds ${control.sharedSeasonNumbers}: ${control.status}`);
  return [...controls, ...lines].join("\n");
}

function main(): void {
  const started = performance.now();
  const rows = LEAGUE_SIZES.map(runStrengthForSize);
  const evidence = createStrengthEvidence(rows);
  mkdirSync("evidence", { recursive: true });
  writeFileSync(OUTPUT_PATH, serialiseStrengthEvidence(evidence), "utf8");
  console.log(formatStrengthOutput(evidence));
  console.log(`Total wall-clock time: ${(performance.now() - started).toFixed(1)} ms`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
