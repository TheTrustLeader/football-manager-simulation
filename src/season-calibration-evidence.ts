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

export function runCalibrationForSize(teamCount: number, seasonNumbers: readonly number[] = SEASON_NUMBERS, era = eraBandsForSeason(1981)): CalibrationRow {
  const teams = makeEvidenceTeams(teamCount).map(({ team }) => team);
  const goals: number[] = [];
  const homeWins: number[] = [];
  const draws: number[] = [];
  let totalMatchesSimulated = 0;
  for (const seasonNumber of seasonNumbers) {
    const season = runSeason(teams, deriveSeasonSeed(teamCount, seasonNumber), 1981);
    const matchCount = season.matches.length;
    totalMatchesSimulated += matchCount;
    goals.push(season.matches.reduce((sum, match) => sum + match.home.goals + match.away.goals, 0) / matchCount);
    homeWins.push(season.matches.filter((match) => match.home.goals > match.away.goals).length / matchCount);
    draws.push(season.matches.filter((match) => match.home.goals === match.away.goals).length / matchCount);
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
    comparisons: {
      goalsPerMatch: compareWithBand("goalsPerMatch", goalsPerMatch.mean, era.bands.goalsPerMatch),
      homeWinRate: compareWithBand("homeWinRate", homeWinRate.mean, era.bands.homeWinRate),
      drawRate: compareWithBand("drawRate", drawRate.mean, era.bands.drawRate),
    },
  };
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

export function createCalibrationEvidence(rows: CalibrationRow[], era: EraBandRow = eraBandsForSeason(1981)) {
  return {
    schemaVersion: 1,
    purpose: "Measure the football played by full seasons against dated English First Division calibration bands without tuning the engine.",
    command: "npm run season:calibration",
    timingPolicy: "No wall-clock timings are recorded.",
    controls: { season: 1981, teamCounts: LEAGUE_SIZES, seasonNumbers: { first: 1, last: 200, count: 200 }, seedDerivation: "deriveSeasonSeed(teamCount, seasonNumber)", levelRange: { weakest: 7, strongest: 13 }, era },
    positiveControl: verifyCommittedPositiveControl(rows),
    rows,
  };
}

export function serialiseCalibrationEvidence(evidence: ReturnType<typeof createCalibrationEvidence>): string {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

function main(): void {
  const rows = LEAGUE_SIZES.map((teamCount) => runCalibrationForSize(teamCount));
  const evidence = createCalibrationEvidence(rows);
  mkdirSync("evidence", { recursive: true });
  writeFileSync(OUTPUT_PATH, serialiseCalibrationEvidence(evidence), "utf8");
  for (const row of rows) for (const comparison of Object.values(row.comparisons)) console.log(`${row.teamCount} teams: ${comparison.statement}`);
  console.log(`Wrote ${OUTPUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
