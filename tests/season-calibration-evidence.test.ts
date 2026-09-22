import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type CalibrationBand } from "../src/era-bands.js";
import { compareWithBand, createCalibrationEvidence, runCalibrationForSize, serialiseCalibrationEvidence, verifyCommittedPositiveControl, type CalibrationRow } from "../src/season-calibration-evidence.js";

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
    expect(verifyCommittedPositiveControl(rows)).toEqual([8, 12, 16, 20].map((teamCount) => ({ teamCount, source: "evidence/strength-resolution-evidence.json", status: "REPRODUCED" })));
    expect(createCalibrationEvidence(rows).positiveControl).toHaveLength(4);
    const committed = JSON.parse(readFileSync("evidence/strength-resolution-evidence.json", "utf8"));
    for (const row of rows) {
      const expected = committed.rows.find((candidate: { teamCount: number }) => candidate.teamCount === row.teamCount);
      expect({ goalsPerMatch: row.goalsPerMatch, homeWinRate: row.homeWinRate, drawRate: row.drawRate }).toEqual({ goalsPerMatch: expected.goalsPerMatch, homeWinRate: expected.homeWinRate, drawRate: expected.drawRate });
    }
    const expectedResults = {
      8: ["FAIL", "PASS", "PASS"], 12: ["FAIL", "PASS", "PASS"],
      16: ["FAIL", "FAIL", "PASS"], 20: ["FAIL", "FAIL", "PASS"],
    } as const;
    for (const row of rows) expect(Object.values(row.comparisons).map(({ result }) => result)).toEqual(expectedResults[row.teamCount as keyof typeof expectedResults]);
  });

  it("throws loudly when the committed positive control differs", () => {
    const row = runCalibrationForSize(8, [1]);
    expect(() => verifyCommittedPositiveControl([row], JSON.stringify({ rows: [{ ...row, goalsPerMatch: { ...row.goalsPerMatch, mean: 99 } }] }))).toThrow(/POSITIVE CONTROL FAILED.*STOP/);
  });

  it("serialises byte-reproducibly without timings", () => {
    const row = runCalibrationForSize(8, [1]);
    const fixture = { schemaVersion: 1, rows: [row] } as never;
    expect(serialiseCalibrationEvidence(fixture)).toBe(serialiseCalibrationEvidence(fixture));
    expect(serialiseCalibrationEvidence(fixture)).not.toMatch(/elapsed|wallClock/);
  });

});
