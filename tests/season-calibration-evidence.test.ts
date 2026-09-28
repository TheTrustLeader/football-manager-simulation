import { readFileSync } from "node:fs";
import { deriveEraBandRow, eraBandsForSeason, readSeasonCounts } from "../src/era-bands.js";
import { describe, expect, it } from "vitest";
import { type CalibrationBand } from "../src/era-bands.js";
import { compareWithBand, createCalibrationEvidence, makeCalibrationTeams, runCalibrationForSize, runCalibrationForSizeYielding, runManyLeagueCalibration, runManyLeagueCalibrationYielding, serialiseCalibrationEvidence, verifyCommittedPositiveControl, type CalibrationRow } from "../src/season-calibration-evidence.js";
import { ENGINE_CONFIG, calibrationTargetsForSeason } from "../src/engine-config.js";

describe("season calibration evidence", () => {
  const band = (minimum: number, maximum: number): CalibrationBand => ({ minimum, maximum, aggregateMean: (minimum + maximum) / 2, seasonStandardDeviation: 0 });
  const committedRows = JSON.parse(readFileSync("evidence/season-calibration-evidence.json", "utf8")).rows as CalibrationRow[];
  const committedStrengthRows = JSON.parse(readFileSync("evidence/strength-resolution-evidence.json", "utf8")).rows as CalibrationRow[];
  const seasons = Array.from({ length: 200 }, (_, index) => index + 1);

  it("reports a hit as PASS and a miss as FAIL, naming the measure and numbers", () => {
    expect(compareWithBand("drawRate", 0.25, band(0.2, 0.3))).toMatchObject({ result: "PASS", statement: "PASS: drawRate measured 0.250000; band 0.200000-0.300000" });
    expect(compareWithBand("goalsPerMatch", 3, band(2.4, 2.8))).toMatchObject({ result: "FAIL", statement: "FAIL: goalsPerMatch measured 3.000000; band 2.400000-2.800000" });
  });

  it("does not accept a value above the upper bound", () => {
    expect(compareWithBand("homeWinRate", 0.7, band(0.4, 0.6)).result).toBe("FAIL");
  });

  it.each([8, 12, 16, 20, 22])("reproduces the committed %i-team football distribution", async (teamCount) => {
    const row = teamCount === 22
      ? await runManyLeagueCalibrationYielding(teamCount, seasons, 1981, eraBandsForSeason(1981))
      : await runCalibrationForSizeYielding(teamCount, seasons, 1981, eraBandsForSeason(1981));
    expect(row).toEqual(committedRows.find((candidate) => candidate.teamCount === teamCount));
    if (teamCount !== 22) {
      const expected = committedStrengthRows.find((candidate) => candidate.teamCount === teamCount)!;
      expect({ goalsPerMatch: row.goalsPerMatch, homeWinRate: row.homeWinRate, drawRate: row.drawRate }).toEqual({ goalsPerMatch: expected.goalsPerMatch, homeWinRate: expected.homeWinRate, drawRate: expected.drawRate });
    }
    expect(Object.values(row.comparisons).map(({ result }) => result)).toEqual(["PASS", "PASS", "PASS"]);
  }, 900_000);

  it("keeps the committed calibration positive control complete", () => {
    expect(verifyCommittedPositiveControl(committedRows.filter((row) => row.teamCount !== 22))).toEqual([8, 12, 16, 20].map((teamCount) => ({ teamCount, source: "evidence/strength-resolution-evidence.json", status: "REPRODUCED" })));
    expect(createCalibrationEvidence(committedRows, [], 1981, eraBandsForSeason(1981)).positiveControl).toHaveLength(4);
  });

  it("pins the calibrated finishing multiplier", () => {
    expect(ENGINE_CONFIG.goal.probabilityMultiplier).toBe(0.825);
  });

  it("builds a different 22-squad league for every calibration season", () => {
    const first = makeCalibrationTeams(22, 1);
    const second = makeCalibrationTeams(22, 2);
    expect(first.map(({ team }) => team.id)).not.toEqual(second.map(({ team }) => team.id));
    expect(first.map(({ level }) => level)).toEqual(second.map(({ level }) => level));
    expect([first[0]!.level, first.at(-1)!.level]).toEqual([7, 13]);
  });

  it("the old single-league sample misses the round-3 many-leagues calibration failure", () => {
    const goal = ENGINE_CONFIG.goal as { probabilityMultiplier: number };
    const tuned = goal.probabilityMultiplier;
    goal.probabilityMultiplier = 0.785;
    try {
      const seasons = Array.from({ length: 30 }, (_, index) => index + 1);
      expect(runCalibrationForSize(22, seasons, 1981, eraBandsForSeason(1981)).comparisons.goalsPerMatch.result).toBe("PASS");
      expect(runManyLeagueCalibration(22, seasons, 1981, eraBandsForSeason(1981)).comparisons.goalsPerMatch.result).toBe("FAIL");
    } finally {
      goal.probabilityMultiplier = tuned;
    }
  }, 90_000);

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
      expect(runManyLeagueCalibration(22, Array.from({ length: 10 }, (_, index) => index + 1), 1981, eraBandsForSeason(1981)).comparisons.goalsPerMatch.result).toBe("FAIL");
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
