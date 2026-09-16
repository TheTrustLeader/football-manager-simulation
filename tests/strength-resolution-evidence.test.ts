import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveSeasonSeed, runSweepForSize, SEASON_NUMBERS as SWEEP_SEASON_NUMBERS } from "../src/season-sweep-evidence.js";
import {
  createStrengthEvidence,
  formatStrengthOutput,
  LEAGUE_SIZES,
  makeEvidenceTeams,
  runStrengthForSize,
  serialiseStrengthEvidence,
  SEASON_NUMBERS,
  spearman,
  type StrengthEvidence,
  type StrengthRow,
  verifyPositiveControl,
} from "../src/strength-resolution-evidence.js";

describe("strength resolution evidence", () => {
  it("uses the fixed 7-to-13 span at every league size", () => {
    for (const teamCount of LEAGUE_SIZES) {
      const levels = makeEvidenceTeams(teamCount).map(({ level }) => level);
      expect(levels[0]).toBe(7);
      expect(levels[levels.length - 1]).toBe(13);
      expect(levels[1]! - levels[0]!).toBeCloseTo(6 / (teamCount - 1), 12);
    }
  });

  it("calculates Spearman correlation including tied ranks", () => {
    expect(spearman([1, 2, 3], [3, 2, 1])).toBe(-1);
    expect(spearman([1, 1, 2, 2], [1, 1, 2, 2])).toBe(1);
  });

  it("serialises deterministically", () => {
    const rows = [8, 12].map((size) => runStrengthForSize(size, [1, 2, 3]));
    const evidence = {
      schemaVersion: 1,
      purpose: "determinism test fixture",
      command: "test",
      timingPolicy: "No timing data.",
      controls: { teamCounts: [8, 12], seasonNumbers: { first: 1, last: 3, count: 3 }, seedDerivation: "test", levelRange: { weakest: 7, strongest: 13 } },
      positiveControl: [],
      rows,
      strongestTopComparisons: [],
    };
    const first = serialiseStrengthEvidence(evidence);
    const second = serialiseStrengthEvidence(evidence);
    expect(second).toBe(first);
    expect(first).not.toContain("elapsedMs");
  });

  function controlFixtures() {
    const strengthTemplate = runStrengthForSize(8, [1]);
    const sweepTemplate = runSweepForSize(8, [1]);
    const rows = [16, 20].map((teamCount) => ({ ...strengthTemplate, teamCount }));
    const sweepRunner = (teamCount: number, _seasonNumbers: readonly number[]) => ({
      ...sweepTemplate,
      teamCount,
      strongestTeamFinishedTop: strengthTemplate.strongestTeamFinishedTop.count,
      goalsPerMatch: strengthTemplate.goalsPerMatch,
      homeWinRate: strengthTemplate.homeWinRate,
      drawRate: strengthTemplate.drawRate,
      pointsGapTopToBottom: strengthTemplate.pointsGapTopToBottom,
    });
    return { rows, strengthTemplate, sweepRunner };
  }

  it("runs both positive-control runners over the shared season list", () => {
    const { rows, sweepRunner } = controlFixtures();
    const calls: Array<{ runner: string; seasons: readonly number[] }> = [];
    const strengthRunner = (teamCount: number, seasons: readonly number[]) => {
      calls.push({ runner: `strength-${teamCount}`, seasons });
      return rows.find((row) => row.teamCount === teamCount)!;
    };
    const recordingSweepRunner = (teamCount: number, seasons: readonly number[]) => {
      calls.push({ runner: `sweep-${teamCount}`, seasons });
      return sweepRunner(teamCount, seasons);
    };
    const evidence = createStrengthEvidence(
      rows,
      (controlRows) => verifyPositiveControl(controlRows, strengthRunner, recordingSweepRunner),
    );

    expect(evidence.positiveControl).toEqual([
      { teamCount: 16, sharedSeasonNumbers: "1-50", status: "REPRODUCED" },
      { teamCount: 20, sharedSeasonNumbers: "1-50", status: "REPRODUCED" },
    ]);
    expect(calls.map(({ runner }) => runner)).toEqual(["strength-16", "sweep-16", "strength-20", "sweep-20"]);
    for (const { seasons } of calls) expect(seasons).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
  });

  it.each([
    "strongestTeamFinishedTop",
    "goalsPerMatch",
    "homeWinRate",
    "drawRate",
    "pointsGapTopToBottom",
  ] as const)("throws loudly when positive-control field %s disagrees", (field) => {
    const { rows, strengthTemplate, sweepRunner } = controlFixtures();
    const brokenStrengthRunner = (teamCount: number, _seasons: readonly number[]) => {
      const row = rows.find((candidate) => candidate.teamCount === teamCount)!;
      if (field === "strongestTeamFinishedTop") {
        return { ...row, strongestTeamFinishedTop: { ...row.strongestTeamFinishedTop, count: row.strongestTeamFinishedTop.count + 1 } };
      }
      return { ...row, [field]: { ...strengthTemplate[field], mean: strengthTemplate[field].mean + 1 } } as StrengthRow;
    };

    expect(() => verifyPositiveControl(rows, brokenStrengthRunner, sweepRunner)).toThrow(/POSITIVE CONTROL FAILED.*STOP/);
  });

  it("aggregates reordered seasons by season number rather than position", () => {
    expect(runStrengthForSize(16, [3, 1, 2])).toEqual(runStrengthForSize(16, [1, 2, 3]));
  });

  it("formats subset runs with their actual season count and proportion", () => {
    const seasons = Array.from({ length: 10 }, (_, index) => index + 1);
    const row = runStrengthForSize(8, seasons);
    const evidence = {
      positiveControl: [],
      rows: [row],
      strongestTopComparisons: [{ teamCount: row.teamCount, comparisons: [] }],
    } as unknown as StrengthEvidence;

    expect(row.strongestTeamFinishedTop.count).toBeGreaterThan(0);
    expect(row.strongestTeamFinishedTop.proportion).toBe(row.strongestTeamFinishedTop.count / seasons.length);
    expect(formatStrengthOutput(evidence)).toContain(`top ${row.strongestTeamFinishedTop.count}/${seasons.length}`);
  });

  it("keeps subset season numbers on their full-run seeds", () => {
    const subset = [1, 2, 3];
    expect(subset.map((season) => deriveSeasonSeed(12, season)))
      .toEqual(SEASON_NUMBERS.slice(0, 3).map((season) => deriveSeasonSeed(12, season)));
    expect(subset.map((season) => deriveSeasonSeed(12, season)))
      .toEqual(SWEEP_SEASON_NUMBERS.slice(0, 3).map((season) => deriveSeasonSeed(12, season)));
    expect(runStrengthForSize(12, subset).seasonsSimulated).toBe(3);
  });

  it("keeps committed controls aligned with the experiment constants", () => {
    const { controls } = JSON.parse(readFileSync("evidence/strength-resolution-evidence.json", "utf8"));
    expect(controls).toEqual({
      teamCounts: LEAGUE_SIZES,
      seasonNumbers: { first: 1, last: 200, count: 200 },
      seedDerivation: "deriveSeasonSeed(teamCount, seasonNumber), shared with season:sweep; seasons 1-50 overlap.",
      levelRange: { weakest: 7, strongest: 13 },
    });
  });
});
