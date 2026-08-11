import { describe, expect, it } from "vitest";
import {
  PAIRED_ESTIMATOR_IDENTITIES,
  runPairedIdentityEstimator,
} from "../src/gate-1a-paired-identity-estimator.js";

describe("Gate 1A paired identity estimator", () => {
  it("covers every unordered identity pair with paired generator seeds and fixed match-seed blocks", () => {
    const generatorSeeds = [711, 712];
    const matchSeeds = [1, 2, 3, 4];
    const result = runPairedIdentityEstimator(generatorSeeds, matchSeeds, 2);

    expect(result.identities).toEqual(PAIRED_ESTIMATOR_IDENTITIES);
    expect(result.estimates).toHaveLength(6);
    expect(result.estimates.map((estimate) => `${estimate.firstIdentity}/${estimate.secondIdentity}`)).toEqual([
      "passing/direct",
      "passing/defensive",
      "passing/balanced",
      "direct/defensive",
      "direct/balanced",
      "defensive/balanced",
    ]);

    for (const estimate of result.estimates) {
      expect(estimate.pairedSamples.map((sample) => sample.generatorSeed)).toEqual(generatorSeeds);
      for (const sample of estimate.pairedSamples) {
        expect(sample.blocks.map((block) => block.matchSeedRange)).toEqual([
          { start: 1, end: 2, count: 2 },
          { start: 3, end: 4, count: 2 },
        ]);
        expect(sample.combined.matchSeedRange).toEqual({ start: 1, end: 4, count: 4 });
      }
    }
  });

  it("computes the mean and sample standard deviation from the paired generator-seed gaps", () => {
    const result = runPairedIdentityEstimator([811, 812, 813], [1, 2, 3, 4, 5, 6], 2, ["passing", "balanced"]);
    const estimate = result.estimates[0]!;
    const values = estimate.pairedSamples.map((sample) => sample.combined.pointsPerMatchDifference);
    const expectedMean = values.reduce((total, value) => total + value, 0) / values.length;
    const expectedSd = Math.sqrt(
      values.reduce((total, value) => total + (value - expectedMean) ** 2, 0) / (values.length - 1),
    );

    expect(estimate.meanPointsPerMatchDifference).toBe(expectedMean);
    expect(estimate.sampleStandardDeviation).toBe(expectedSd);
    expect(estimate.standardErrorOfMean).toBe(expectedSd / Math.sqrt(values.length));
  });
});
