import { describe, expect, it } from "vitest";
import { eraBandsForSeason } from "../src/era-bands.js";
import { longRunGoalsRuleForSeason, verifyLongRunGoalsAverage } from "../src/long-run-goals-rule.js";

describe("dated long-run goals rule", () => {
  it("has Scott's dated tolerance and no default season", () => {
    expect(longRunGoalsRuleForSeason(1981)).toMatchObject({ tolerance: 0.05, source: "Scott, 30 Sep 2026, #76" });
    expect(() => (longRunGoalsRuleForSeason as (season?: number) => unknown)()).toThrow();
    expect(() => longRunGoalsRuleForSeason(1980)).toThrow(/no matching rule/);
  });

  it("accepts only averages within 0.05 of the sourced aggregate mean", () => {
    const mean = eraBandsForSeason(1981).bands.goalsPerMatch.aggregateMean;
    expect(() => verifyLongRunGoalsAverage(mean + 0.049, 1981)).not.toThrow();
    expect(() => verifyLongRunGoalsAverage(mean + 0.051, 1981)).toThrow(/era aggregate mean/);
  });

  it("reads the mean from the supplied era-band data", () => {
    const source = eraBandsForSeason(1981);
    const changedSource = [{
      ...source,
      bands: { ...source.bands, goalsPerMatch: { ...source.bands.goalsPerMatch, aggregateMean: source.bands.goalsPerMatch.aggregateMean - 0.1 } },
    }];
    expect(() => verifyLongRunGoalsAverage(source.bands.goalsPerMatch.aggregateMean, 1981, changedSource)).toThrow(/era aggregate mean/);
  });
});
