import { readFileSync } from "node:fs";
import { deriveEraBandRow, eraBandsForSeason, readSeasonCounts } from "../src/era-bands.js";
import { describe, expect, it } from "vitest";
import { type CalibrationBand } from "../src/era-bands.js";
import { compareWithBand, createCalibrationEvidence, runCalibrationForSize, serialiseCalibrationEvidence, verifyCommittedPositiveControl, type CalibrationRow } from "../src/season-calibration-evidence.js";
import { ENGINE_CONFIG, calibrationTargetsForSeason } from "../src/engine-config.js";

describe("season calibration evidence", () => {
  const band = (minimum: number, maximum: number): CalibrationBand => ({ minimum, maximum, aggregateMean: (minimum + maximum) / 2, seasonStandardDeviation: 0 });

  it("reports a hit as PASS and a miss as FAIL, naming the measure and numbers", () => {
    expect(compareWithBand("drawRate", 0.25, band(0.2, 0.3))).toMatchObject({ result: "PASS", statement: "PASS: drawRate measured 0.250000; band 0.200000-0.300000" });
    expect(compareWithBand("goalsPerMatch", 3, band(2.4, 2.8))).toMatchObject({ result: "FAIL", statement: "FAIL: goalsPerMatch measured 3.000000; band 2.400000-2.800000" });
  });

  it("does not accept a value above the upper bound", () => {
    expect(compareWithBand("homeWinRate", 0.7, band(0.4, 0.6)).result).toBe("FAIL");
  });

  it("reproduces every committed strength-evidence football distribution", () => {
    const rows = JSON.parse(readFileSync("evidence/season-calibration-evidence.json", "utf8")).rows as CalibrationRow[];
    expect(verifyCommittedPositiveControl(rows)).toEqual([8, 12, 16, 20, 22].map((teamCount) => ({ teamCount, source: "evidence/strength-resolution-evidence.json", status: "REPRODUCED" })));
    expect(createCalibrationEvidence(rows, [], 1981, eraBandsForSeason(1981)).positiveControl).toHaveLength(5);
    const committed = JSON.parse(readFileSync("evidence/strength-resolution-evidence.json", "utf8"));
    for (const row of rows) {
      const expected = committed.rows.find((candidate: { teamCount: number }) => candidate.teamCount === row.teamCount);
      expect({ goalsPerMatch: row.goalsPerMatch, homeWinRate: row.homeWinRate, drawRate: row.drawRate }).toEqual({ goalsPerMatch: expected.goalsPerMatch, homeWinRate: expected.homeWinRate, drawRate: expected.drawRate });
    }
    const expectedResults = {
      8: ["FAIL", "FAIL", "PASS"], 12: ["PASS", "PASS", "PASS"],
      16: ["FAIL", "FAIL", "PASS"], 20: ["PASS", "PASS", "PASS"],
      22: ["PASS", "PASS", "PASS"],
    } as const;
    for (const row of rows) expect(Object.values(row.comparisons).map(({ result }) => result)).toEqual(expectedResults[row.teamCount as keyof typeof expectedResults]);
  });

  it("throws loudly when the committed positive control differs", () => {
    const row = runCalibrationForSize(8, [1], 1981, eraBandsForSeason(1981));
    expect(() => verifyCommittedPositiveControl([row], JSON.stringify({ rows: [{ ...row, goalsPerMatch: { ...row.goalsPerMatch, mean: 99 } }] }))).toThrow(/POSITIVE CONTROL FAILED.*STOP/);
  });

  it("serialises byte-reproducibly without timings", () => {
    const row = runCalibrationForSize(8, [1], 1981, eraBandsForSeason(1981));
    const fixture = { schemaVersion: 1, rows: [row] } as never;
    expect(serialiseCalibrationEvidence(fixture)).toBe(serialiseCalibrationEvidence(fixture));
    expect(serialiseCalibrationEvidence(fixture)).not.toMatch(/elapsed|wallClock/);
  });

  it("fails when handed real bands from a different era", () => {
    const differentEra = deriveEraBandRow(readSeasonCounts(), 1991, 1998);
    expect(runCalibrationForSize(22, [1], 1981, differentEra).comparisons.goalsPerMatch.result).toBe("FAIL");
  });

  it("the old scoring constants fail 22-team calibration", () => {
    const goal = ENGINE_CONFIG.goal as { probabilityMultiplier: number };
    const homeAdvantage = ENGINE_CONFIG.homeAdvantage as { homeProgressionProbabilityBoost: number; awayTravelConditionPenalty: number };
    const tuned = { multiplier: goal.probabilityMultiplier, homeBoost: homeAdvantage.homeProgressionProbabilityBoost, awayPenalty: homeAdvantage.awayTravelConditionPenalty };
    goal.probabilityMultiplier = 1;
    homeAdvantage.homeProgressionProbabilityBoost = 0.085;
    homeAdvantage.awayTravelConditionPenalty = 2;
    try {
      expect(runCalibrationForSize(22, Array.from({ length: 10 }, (_, index) => index + 1), 1981, eraBandsForSeason(1981)).comparisons.goalsPerMatch.result).toBe("FAIL");
    } finally {
      goal.probabilityMultiplier = tuned.multiplier;
      homeAdvantage.homeProgressionProbabilityBoost = tuned.homeBoost;
      homeAdvantage.awayTravelConditionPenalty = tuned.awayPenalty;
    }
  }, 30_000);

  it("requires a season to resolve sourced calibration targets", () => {
    expect(calibrationTargetsForSeason(1981).sourceSeason).toBe(1981);
    expect(() => (calibrationTargetsForSeason as (season?: number) => unknown)()).toThrow();
  });

  it("derives every fixed CI calibration guardrail from its named season", () => {
    const bands = eraBandsForSeason(ENGINE_CONFIG.ciGuardrails.sourceSeason).bands;
    expect(ENGINE_CONFIG.ciGuardrails).toMatchObject({
      goalsPerMatchMin: bands.goalsPerMatch.minimum,
      goalsPerMatchMax: bands.goalsPerMatch.maximum,
      drawRateMin: bands.drawRate.minimum,
      drawRateMax: bands.drawRate.maximum,
      homeWinRateMin: bands.homeWinRate.minimum,
      homeWinRateMax: bands.homeWinRate.maximum,
    });
  });

});
