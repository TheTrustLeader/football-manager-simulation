import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { runSeason } from "./competition.js";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { makeTeam, SQUAD_GENERATION_HASH, SQUAD_GENERATION_VERSION } from "./fixtures.js";
import { readEvidenceProvenance } from "./provenance.js";
import type { SeasonResult } from "./competition.js";

export const TEAM_COUNTS = [4, 8, 12, 16, 20] as const;
export const SEASON_SEED = 424242;
export const OUTPUT_PATH = "evidence/season-scale-evidence.json";

export interface SeasonScaleRow {
  teamCount: number;
  fixturesGenerated: number;
  matchesPlayed: number;
  elapsedMs: number;
  matchesPerSecond: number;
  goalsPerMatch: number;
  homeWinRate: number;
  drawRate: number;
  champion: { teamId: string; points: number };
  bottom: { teamId: string; points: number };
  pointsGap: number;
  strongestTeamId: string;
  strongestFinishedTop: boolean;
}

const rounded = (value: number): number => Number(value.toFixed(3));

export function summariseSeason(
  season: SeasonResult,
  strongestTeamId: string,
  elapsedMs: number,
): SeasonScaleRow {
  const champion = season.table[0];
  const bottom = season.table[season.table.length - 1];
  if (!champion || !bottom || season.matches.length === 0) {
    throw new Error("Season evidence requires a played season with a complete table");
  }
  const homeWins = season.matches.filter((match) => match.home.goals > match.away.goals).length;
  const draws = season.matches.filter((match) => match.home.goals === match.away.goals).length;
  const goals = season.matches.reduce((total, match) => total + match.home.goals + match.away.goals, 0);

  return {
    teamCount: season.teamIds.length,
    fixturesGenerated: season.fixtures.length,
    matchesPlayed: season.matches.length,
    elapsedMs: rounded(elapsedMs),
    matchesPerSecond: rounded(season.matches.length * 1000 / elapsedMs),
    goalsPerMatch: rounded(goals / season.matches.length),
    homeWinRate: rounded(homeWins / season.matches.length),
    drawRate: rounded(draws / season.matches.length),
    champion: { teamId: champion.teamId, points: champion.points },
    bottom: { teamId: bottom.teamId, points: bottom.points },
    pointsGap: champion.points - bottom.points,
    strongestTeamId,
    strongestFinishedTop: champion.teamId === strongestTeamId,
  };
}

function makeEvidenceTeams(teamCount: number) {
  return Array.from({ length: teamCount }, (_, index) => {
    const level = 7 + (6 * index / (teamCount - 1));
    return makeTeam(`scale-${teamCount}-team-${String(index + 1).padStart(2, "0")}`, level);
  });
}

export function formatSummary(rows: readonly SeasonScaleRow[]): string {
  const header = "Teams  Fixtures  Played  Time ms  Match/s  Goals/m  Home win  Draw  Champion pts  Bottom pts  Gap  Strongest top";
  const divider = "-----  --------  ------  -------  -------  -------  --------  ----  ------------  ----------  ---  -------------";
  const lines = rows.map((row) => [
    String(row.teamCount).padStart(5),
    String(row.fixturesGenerated).padStart(8),
    String(row.matchesPlayed).padStart(6),
    row.elapsedMs.toFixed(3).padStart(7),
    row.matchesPerSecond.toFixed(3).padStart(7),
    row.goalsPerMatch.toFixed(3).padStart(7),
    `${(row.homeWinRate * 100).toFixed(1)}%`.padStart(8),
    `${(row.drawRate * 100).toFixed(1)}%`.padStart(4),
    String(row.champion.points).padStart(12),
    String(row.bottom.points).padStart(10),
    String(row.pointsGap).padStart(3),
    (row.strongestFinishedTop ? "yes" : "no").padStart(13),
  ].join("  "));
  return [header, divider, ...lines].join("\n");
}

function main(): void {
  const provenance = readEvidenceProvenance();
  const rows = TEAM_COUNTS.map((teamCount) => {
    const teams = makeEvidenceTeams(teamCount);
    const started = performance.now();
    const season = runSeason(teams, SEASON_SEED + teamCount);
    return summariseSeason(season, teams[teams.length - 1]!.id, performance.now() - started);
  });
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    purpose: "Measure season runtime and football outcomes as team count grows; this record does not choose a league size.",
    command: "npm run season:evidence",
    outputConvention: "Committed fixed-name record, following the committed evidence/ records rather than the gitignored local match-lab calibration output.",
    ...provenance,
    engineConfigVersion: ENGINE_CONFIG.version,
    engineConfigHash: ENGINE_CONFIG_HASH,
    squadGenerationVersion: SQUAD_GENERATION_VERSION,
    squadGenerationHash: SQUAD_GENERATION_HASH,
    controls: {
      teamCounts: TEAM_COUNTS,
      seasonSeedBase: SEASON_SEED,
      levelRange: { weakest: 7, strongest: 13 },
      schedule: "Double round-robin; each ordered pairing is played once.",
    },
    runtime: { nodeVersion: process.version, platform: process.platform, architecture: process.arch },
    rows,
  };
  mkdirSync("evidence", { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(formatSummary(rows));
  console.log(`\nWrote ${OUTPUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
