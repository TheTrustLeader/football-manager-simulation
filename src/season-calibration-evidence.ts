import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runSeason } from "./competition.js";
import { eraBandsForSeason, type CalibrationBand, type CalibrationMeasure, type EraBandRow } from "./era-bands.js";
import { deriveSeasonSeed, distribution, extendedDistribution, type Distribution, type ExtendedDistribution } from "./season-sweep-evidence.js";
import { LEAGUE_SIZES, makeEvidenceTeams, SEASON_NUMBERS } from "./strength-resolution-evidence.js";

export const OUTPUT_PATH = "evidence/season-calibration-evidence.json";

export interface MeasureResult {
  band: CalibrationBand;
  measured: number;
  result: "PASS" | "FAIL";
  statement: string;
}

export interface CalibrationRow {
  teamCount: number;
  seasonsSimulated: number;
  totalMatchesSimulated: number;
  goalsPerMatch: ExtendedDistribution;
  homeWinRate: Distribution;
  drawRate: Distribution;
  goalsByLevelGap: {
    withinOneLevel: { matches: number; goalsPerMatch: number };
    fourOrMoreLevelsApart: { matches: number; goalsPerMatch: number };
  };
  comparisons: Record<CalibrationMeasure, MeasureResult>;
}

export function compareWithBand(measure: CalibrationMeasure, measured: number, band: CalibrationBand): MeasureResult {
  const result = measured >= band.minimum && measured <= band.maximum ? "PASS" as const : "FAIL" as const;
  return {
    band,
    measured,
    result,
    statement: `${result}: ${measure} measured ${measured.toFixed(6)}; band ${band.minimum.toFixed(6)}-${band.maximum.toFixed(6)}`,
  };
}

export function runCalibrationForSize(teamCount: number, seasonNumbers: readonly number[], season: number, era: EraBandRow): CalibrationRow {
  const evidenceTeams = makeEvidenceTeams(teamCount);
  const teams = evidenceTeams.map(({ team }) => team);
  const levels = new Map(evidenceTeams.map(({ team, level }) => [team.id, level]));
  const goals: number[] = [];
  const homeWins: number[] = [];
  const draws: number[] = [];
  let totalMatchesSimulated = 0;
  let closeMatches = 0;
  let closeGoals = 0;
  let mismatchMatches = 0;
  let mismatchGoals = 0;
  for (const seasonNumber of seasonNumbers) {
    const result = runSeason(teams, deriveSeasonSeed(teamCount, seasonNumber), season);
    const matchCount = result.matches.length;
    totalMatchesSimulated += matchCount;
    goals.push(result.matches.reduce((sum, match) => sum + match.home.goals + match.away.goals, 0) / matchCount);
    homeWins.push(result.matches.filter((match) => match.home.goals > match.away.goals).length / matchCount);
    draws.push(result.matches.filter((match) => match.home.goals === match.away.goals).length / matchCount);
    for (const match of result.matches) {
      const gap = Math.abs(levels.get(match.homeTeamId)! - levels.get(match.awayTeamId)!);
      const matchGoals = match.home.goals + match.away.goals;
      if (gap <= 1) { closeMatches += 1; closeGoals += matchGoals; }
      if (gap >= 4) { mismatchMatches += 1; mismatchGoals += matchGoals; }
    }
  }
  const goalsPerMatch = extendedDistribution(goals);
  const homeWinRate = distribution(homeWins);
  const drawRate = distribution(draws);
  return {
    teamCount,
    seasonsSimulated: seasonNumbers.length,
    totalMatchesSimulated,
    goalsPerMatch,
    homeWinRate,
    drawRate,
    goalsByLevelGap: {
      withinOneLevel: { matches: closeMatches, goalsPerMatch: Number((closeGoals / closeMatches).toFixed(6)) },
      fourOrMoreLevelsApart: { matches: mismatchMatches, goalsPerMatch: Number((mismatchGoals / mismatchMatches).toFixed(6)) },
    },
    comparisons: {
      goalsPerMatch: compareWithBand("goalsPerMatch", goalsPerMatch.mean, oneStandardDeviation(era.bands.goalsPerMatch)),
      homeWinRate: compareWithBand("homeWinRate", homeWinRate.mean, oneStandardDeviation(era.bands.homeWinRate)),
      drawRate: compareWithBand("drawRate", drawRate.mean, era.bands.drawRate),
    },
  };
}

function oneStandardDeviation(band: CalibrationBand): CalibrationBand {
  return { ...band, minimum: band.aggregateMean - band.seasonStandardDeviation, maximum: band.aggregateMean + band.seasonStandardDeviation };
}

export function verifyCommittedPositiveControl(rows: readonly CalibrationRow[], committedJson = readFileSync("evidence/strength-resolution-evidence.json", "utf8")) {
  const committed = JSON.parse(committedJson) as { rows: Array<{ teamCount: number; goalsPerMatch: ExtendedDistribution; homeWinRate: Distribution; drawRate: Distribution }> };
  return rows.map((row) => {
    const expected = committed.rows.find((candidate) => candidate.teamCount === row.teamCount);
    if (!expected) throw new Error(`POSITIVE CONTROL FAILED: committed strength evidence has no ${row.teamCount}-team row. STOP.`);
    for (const measure of ["goalsPerMatch", "homeWinRate", "drawRate"] as const) {
      if (JSON.stringify(row[measure]) !== JSON.stringify(expected[measure])) {
        throw new Error(`POSITIVE CONTROL FAILED for ${row.teamCount} teams, ${measure}: expected ${JSON.stringify(expected[measure])}, received ${JSON.stringify(row[measure])}. STOP.`);
      }
    }
    return { teamCount: row.teamCount, source: "evidence/strength-resolution-evidence.json", status: "REPRODUCED" as const };
  });
}

export function createCalibrationEvidence(rows: CalibrationRow[], validationRows: CalibrationRow[], season: number, era: EraBandRow) {
  return {
    schemaVersion: 1,
    purpose: "Measure tuning seasons 1-200 and sealed validation seasons 201-400 against dated English First Division calibration bands.",
    command: "npm run season:calibration",
    timingPolicy: "No wall-clock timings are recorded.",
    controls: { season, teamCounts: LEAGUE_SIZES, seasonNumbers: { first: 1, last: 200, count: 200 }, seedDerivation: "deriveSeasonSeed(teamCount, seasonNumber)", levelRange: { weakest: 7, strongest: 13 }, era },
    positiveControl: verifyCommittedPositiveControl(rows),
    rows,
    validationRows,
  };
}

export function serialiseCalibrationEvidence(evidence: ReturnType<typeof createCalibrationEvidence>): string {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

function main(): void {
  const season = 1981;
  const era = eraBandsForSeason(season);
  const rows = LEAGUE_SIZES.map((teamCount) => runCalibrationForSize(teamCount, SEASON_NUMBERS, season, era));
  const validationSeasonNumbers = SEASON_NUMBERS.map((number) => number + 200);
  const validationRows = LEAGUE_SIZES.map((teamCount) => runCalibrationForSize(teamCount, validationSeasonNumbers, season, era));
  const evidence = createCalibrationEvidence(rows, validationRows, season, era);
  mkdirSync("evidence", { recursive: true });
  writeFileSync(OUTPUT_PATH, serialiseCalibrationEvidence(evidence), "utf8");
  for (const row of rows) for (const comparison of Object.values(row.comparisons)) console.log(`${row.teamCount} teams: ${comparison.statement}`);
  for (const row of validationRows) for (const comparison of Object.values(row.comparisons)) console.log(`${row.teamCount} teams validation: ${comparison.statement}`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
