import { describe, expect, it } from "vitest";
import {
  createStrengthEvidence,
  LEAGUE_SIZES,
  makeEvidenceTeams,
  runStrengthForSize,
  serialiseStrengthEvidence,
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
    const evidence = createStrengthEvidence(LEAGUE_SIZES.map(runStrengthForSize));
    const first = serialiseStrengthEvidence(evidence);
    const second = serialiseStrengthEvidence(evidence);
    expect(second).toBe(first);
    expect(first).not.toContain("elapsedMs");
    expect(JSON.parse(first).positiveControl).toEqual([
      { teamCount: 16, sharedSeasonNumbers: "1-50", status: "REPRODUCED" },
      { teamCount: 20, sharedSeasonNumbers: "1-50", status: "REPRODUCED" },
    ]);
  }, 300_000);
});
