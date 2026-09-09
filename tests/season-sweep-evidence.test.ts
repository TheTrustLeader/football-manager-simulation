import { describe, expect, it } from "vitest";
import {
  createSweepEvidence,
  deriveSeasonSeed,
  LEAGUE_SIZES,
  runSweepForSize,
  SEASON_NUMBERS,
  serialiseSweepEvidence,
} from "../src/season-sweep-evidence.js";

describe("season sweep evidence", () => {
  it("derives a unique random stream for every league size and season", () => {
    const seeds = LEAGUE_SIZES.flatMap((teamCount) =>
      SEASON_NUMBERS.map((seasonNumber) => deriveSeasonSeed(teamCount, seasonNumber)));

    expect(new Set(seeds).size, "all league-size/season pairs must have distinct seeds").toBe(seeds.length);
  });

  it("serialises byte-identically across repeated sweeps", () => {
    const first = serialiseSweepEvidence(createSweepEvidence(LEAGUE_SIZES.map(runSweepForSize)));
    const second = serialiseSweepEvidence(createSweepEvidence(LEAGUE_SIZES.map(runSweepForSize)));

    expect(second).toBe(first);
    expect(first).not.toContain("elapsedMs");
  }, 120_000);
});
