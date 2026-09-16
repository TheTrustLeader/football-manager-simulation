import { readFileSync } from "node:fs";
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
    const sizes = [8, 12];
    const seasons = [1, 2, 3];
    const first = serialiseSweepEvidence(createSweepEvidence(sizes.map((size) => runSweepForSize(size, seasons))));
    const second = serialiseSweepEvidence(createSweepEvidence(sizes.map((size) => runSweepForSize(size, seasons))));

    expect(second).toBe(first);
    expect(first).not.toContain("elapsedMs");
  });

  it("keeps subset season numbers on their full-run seeds", () => {
    const subset = [1, 2, 3];
    expect(subset.map((season) => deriveSeasonSeed(12, season)))
      .toEqual(SEASON_NUMBERS.slice(0, 3).map((season) => deriveSeasonSeed(12, season)));
    expect(runSweepForSize(12, subset).seasonsSimulated).toBe(3);
  });

  it("keeps committed controls aligned with the experiment constants", () => {
    const { controls } = JSON.parse(readFileSync("evidence/season-sweep-evidence.json", "utf8"));
    expect(controls).toEqual({
      teamCounts: LEAGUE_SIZES,
      seasonNumbers: { first: 1, last: 50, count: 50 },
      seedDerivation: "teamCount * 1000 + seasonNumber; each league size has a disjoint block of 50 seeds.",
      levelRange: { weakest: 7, strongest: 13 },
      acceptanceBands: {
        goalsPerMatch: { minimum: 2.6, maximum: 3.1 },
        homeWinRate: { minimum: 0.4, maximum: 0.5 },
        drawRate: { minimum: 0.2, maximum: 0.3 },
      },
    });
  });
});
