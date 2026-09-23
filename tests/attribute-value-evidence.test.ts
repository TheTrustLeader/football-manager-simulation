import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyTreatment,
  createAttributeValueEvidence,
  readAttributeWeights,
  runTreatment,
  serialiseAttributeValueEvidence,
  type AttributeValueEvidence,
} from "../src/attribute-value-evidence.js";
import { actualSquadRating, engineWeightedSquadRating, makeTeam } from "../src/fixtures.js";
import { makeEvidenceTeams } from "../src/strength-resolution-evidence.js";
import type { AttributeName } from "../src/types.js";

describe("attribute value evidence", () => {
  it("keeps the zero treatment as a distinct, exact zero control", () => {
    const result = runTreatment("passing", 0, 9, [1, 2]);
    expect(result).toMatchObject({ kind: "ZERO_CONTROL", playersChanged: 0, totalAttributePointsAdded: 0, pointsChange: 0 });
  });

  it("replays seasons and preserves the direction for a larger high-value treatment", () => {
    const one = runTreatment("finishing", 1, 9, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const three = runTreatment("finishing", 3, 9, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(one.pointsChange).toEqual(expect.any(Number));
    expect(three.pointsChange).toEqual(expect.any(Number));
    expect(Math.sign(three.pointsChange as number)).toBe(Math.sign(one.pointsChange as number));
    expect(one.pointsChange as number).toBeGreaterThan(0);
    expect(Math.abs(three.pointsChange as number)).toBeGreaterThan(Math.abs(one.pointsChange as number));
  }, 30_000);

  it("reports a fully clamped treatment as UNMEASURABLE, not as zero", () => {
    const teamFactory = () => makeEvidenceTeams(12).map((entry, index) => {
      if (index === 9) for (const player of entry.team.starters) if ("passing" in player.attributes) player.attributes.passing = 20;
      return entry;
    });
    expect(runTreatment("passing", 1, 9, [1], teamFactory)).toEqual(expect.objectContaining({
      kind: "UNMEASURABLE",
      playersChanged: 0,
      seasons: 0,
      pointsChange: "UNMEASURABLE",
    }));
  });

  it("counts changed starting players and never substitutes", () => {
    const team = makeTeam("count-control", 10);
    const eligibleStarters = team.starters.filter((player) => "passing" in player.attributes).length;
    const eligibleRoster = [...team.starters, ...team.substitutes].filter((player) => "passing" in player.attributes).length;
    const change = applyTreatment(team, "passing", 1);
    expect(change.playersChanged).toBe(eligibleStarters);
    expect(change.playersChanged).not.toBe(eligibleRoster);
    expect(change.totalAttributePointsAdded).toBe(eligibleStarters);
  });

  it("is byte-reproducible for the same seeds and records season-based uncertainty", () => {
    const first = createAttributeValueEvidence([1, 2]);
    const second = createAttributeValueEvidence([1, 2]);
    expect(serialiseAttributeValueEvidence(second)).toBe(serialiseAttributeValueEvidence(first));
    expect(first.attributes.every((result) => result.seasons === 6)).toBe(true);
    expect(first.zeroTreatment).toMatchObject({ kind: "ZERO_CONTROL", pointsChange: 0 });
    for (const result of first.attributes) {
      const expected = Math.sqrt(result.treatments.reduce((sum, treatment) => sum + (Number(treatment.standardError) ** 2) * (treatment.seasons ** 2), 0)) / result.seasons;
      expect(result.standardError).toBe(Number(expected.toFixed(6)));
    }
  }, 120_000);

  it("loads weights from evidence and rejects UNMEASURABLE weights", () => {
    const directory = mkdtempSync(join(tmpdir(), "attribute-weights-"));
    const path = join(directory, "evidence.json");
    const committed = JSON.parse(readFileSync("evidence/attribute-value-evidence.json", "utf8")) as AttributeValueEvidence;
    writeFileSync(path, JSON.stringify(committed));
    expect(readAttributeWeights(path).finishing).toBe(committed.attributes.find(({ attribute }) => attribute === "finishing")!.pointsValue);
    committed.attributes[0]!.pointsValue = "UNMEASURABLE";
    writeFileSync(path, JSON.stringify(committed));
    expect(() => readAttributeWeights(path)).toThrow(/UNMEASURABLE.*cannot be used as a weight/);
    rmSync(directory, { recursive: true });
  });
});

describe("engine weighted squad rating", () => {
  const attributes = ["defending", "passing", "creativity", "pace", "aerial", "finishing", "stamina", "leadership", "crossing", "shotStopping", "handling", "kicking"] as const;
  const weights = Object.fromEntries(attributes.map((attribute) => [attribute, 1])) as Record<AttributeName, number>;

  it("is identical for identical squads and changes when a weight changes", () => {
    const team = makeTeam("weighted-rating-control", 10);
    const clone = structuredClone(team);
    expect(engineWeightedSquadRating(team, weights)).toBe(engineWeightedSquadRating(clone, weights));
    expect(engineWeightedSquadRating(team, { ...weights, finishing: 2 })).not.toBe(engineWeightedSquadRating(team, weights));
  });

  it("reproduces flat-rating ordering when doctored evidence gives every attribute equal weight", () => {
    const teams = makeEvidenceTeams(12).map(({ team }) => team);
    const directory = mkdtempSync(join(tmpdir(), "equal-weights-"));
    const path = join(directory, "evidence.json");
    writeFileSync(path, JSON.stringify({ attributes: attributes.map((attribute) => ({ attribute, pointsValue: 1 })) }));
    const doctoredWeights = readAttributeWeights(path);
    const flatOrder = [...teams].sort((a, b) => actualSquadRating(b) - actualSquadRating(a)).map(({ id }) => id);
    const weightedOrder = [...teams].sort((a, b) => engineWeightedSquadRating(b, doctoredWeights) - engineWeightedSquadRating(a, doctoredWeights)).map(({ id }) => id);
    expect(weightedOrder).toEqual(flatOrder);
    rmSync(directory, { recursive: true });
  });
});
