import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveSeasonSeed, SEASON_NUMBERS as SWEEP_SEASON_NUMBERS } from "../src/season-sweep-evidence.js";
import {
  LEAGUE_SIZES,
  makeEvidenceTeams,
  runStrengthForSize,
  serialiseStrengthEvidence,
  SEASON_NUMBERS,
  spearman,
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

  it("reproduces the season:sweep positive controls and serialises deterministically", () => {
    const rows = [8, 12].map((size) => runStrengthForSize(size, [1, 2, 3]));
    const evidence = {
      schemaVersion: 1,
      purpose: "determinism test fixture",
      command: "test",
      timingPolicy: "No timing data.",
      controls: { teamCounts: [8, 12], seasonNumbers: { first: 1, last: 3, count: 3 }, seedDerivation: "test", levelRange: { weakest: 7, strongest: 13 } },
      positiveControl: [
        { teamCount: 16, sharedSeasonNumbers: "1-50", status: "REPRODUCED" as const },
        { teamCount: 20, sharedSeasonNumbers: "1-50", status: "REPRODUCED" as const },
      ],
      rows,
      strongestTopComparisons: [],
    };
    const first = serialiseStrengthEvidence(evidence);
    const second = serialiseStrengthEvidence(evidence);
    expect(second).toBe(first);
    expect(first).not.toContain("elapsedMs");
    expect(JSON.parse(first).positiveControl).toEqual([
      { teamCount: 16, sharedSeasonNumbers: "1-50", status: "REPRODUCED" },
      { teamCount: 20, sharedSeasonNumbers: "1-50", status: "REPRODUCED" },
    ]);
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
