import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/engine-config.js";

const budget = ENGINE_CONFIG.squadGeneration.identityBudget;
const identities = ENGINE_CONFIG.squadGeneration.identityBiases;

type Identity = keyof typeof identities;
type BudgetAttribute = keyof typeof budget.attributeWeights;

function weightedUnitTotal(identity: Identity): number {
  return Object.entries(identities[identity]).reduce((total, [attribute, modifier]) => {
    const row = budget.attributeWeights[attribute as BudgetAttribute];
    if (!row) throw new Error(`${identity}.${attribute} has no identity-budget audit row`);
    if (row.weightedUnitsPerPoint === null) {
      throw new Error(`${identity}.${attribute} has no profile-weight-derived budget weight`);
    }
    return total + modifier * row.weightedUnitsPerPoint;
  }, 0);
}

describe("identity effect-weighted budget", () => {
  it("derives result weights from profileWeights and records consumer scope", () => {
    const weights = ENGINE_CONFIG.profileWeights;
    const rows = budget.attributeWeights;

    expect(rows.passing.weightedUnitsPerPoint).toBe(weights.retention.passing + weights.progression.passing);
    expect(rows.creativity.weightedUnitsPerPoint).toBe(
      weights.retention.creativity + weights.progression.creativity + weights.attack.creativity,
    );
    expect(rows.defending.weightedUnitsPerPoint).toBe(weights.defence.outfieldShare * weights.defence.outfield.defending);
    expect(rows.pace.weightedUnitsPerPoint).toBe(
      weights.progression.pace + weights.attack.pace + weights.defence.outfieldShare * weights.defence.outfield.pace,
    );
    expect(rows.aerial.weightedUnitsPerPoint).toBe(
      weights.progression.aerial + weights.attack.aerial + weights.defence.outfieldShare * weights.defence.outfield.aerial,
    );
    expect(rows.finishing.weightedUnitsPerPoint).toBe(weights.attack.finishing);
    expect(rows.finishing.consumerPositions).toEqual(["FW"]);
    expect(rows.stamina.weightedUnitsPerPoint).toBeNull();
  });

  it("gives every unconsumed attribute zero budget weight and no consumer positions", () => {
    for (const [attribute, row] of Object.entries(budget.attributeWeights)) {
      if (row.consumed) continue;
      expect(row.weightedUnitsPerPoint, `${attribute} must not contribute weighted units`).toBe(0);
      expect(row.consumerPositions, `${attribute} must not claim a consumer scope`).toEqual([]);
    }
  });

  it.each(Object.keys(identities) as Identity[])("requires the %s identity vector to sum to zero weighted units", (identity) => {
    const total = weightedUnitTotal(identity);
    expect(Math.abs(total), `${identity} totals ${total.toFixed(4)} weighted units`).toBeLessThanOrEqual(budget.zeroTolerance);
  });
});
