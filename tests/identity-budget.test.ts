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
  it("records a hygiene-only outfield scope and derives linear profile weights", () => {
    const weights = ENGINE_CONFIG.profileWeights;
    const rows = budget.attributeWeights;

    expect(budget.purpose).toMatch(/Hygiene record only/);
    expect(budget.scope).toMatch(/Outfield identityBias vectors only/);
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
    expect(budget.limitations.finishing).toMatchObject({
      pricingStatus: "partial-profile-weight-only",
      requiredBefore: "Any Gate 1B use of weighted units beyond hygiene recording",
    });
    expect(budget.limitations.finishing.unpricedConsumers).toEqual([
      "individual forward on-target probability",
      "individual forward goal probability",
    ]);
    expect(rows.stamina.weightedUnitsPerPoint).toBeNull();
    expect(budget.limitations.stamina).toMatchObject({
      pricingStatus: "not-priced",
      effectOnVectors: "Any identity vector using stamina fails the audit until a method is recorded",
    });
  });

  it("makes goalkeeper consumption outside the identity-vector scope explicit", () => {
    expect(budget.scope).toMatch(/skips identity bias for goalkeepers/);
    expect(ENGINE_CONFIG.profileWeights.defence.goalkeeper.aerial).toBeGreaterThan(0);
    expect(ENGINE_CONFIG.profileWeights.defence.goalkeeper.leadership).toBeGreaterThan(0);
    expect(budget.attributeWeights.aerial.goalkeeperConsumerOutsideIdentityScope).toBe(true);
    expect(budget.attributeWeights.leadership.goalkeeperConsumerOutsideIdentityScope).toBe(true);
    expect(budget.attributeWeights.aerial.consumerPositions).not.toContain("GK");
    expect(budget.attributeWeights.leadership.consumerPositions).toEqual([]);
  });

  it("gives every unconsumed attribute zero budget weight and no consumer positions", () => {
    for (const [attribute, row] of Object.entries(budget.attributeWeights)) {
      if (row.consumed) continue;
      expect(row.weightedUnitsPerPoint, `${attribute} must not contribute weighted units`).toBe(0);
      expect(row.consumerPositions, `${attribute} must not claim a consumer scope`).toEqual([]);
    }
  });

  it("gives every identity-vector attribute an audit row", () => {
    for (const [identity, vector] of Object.entries(identities)) {
      for (const attribute of Object.keys(vector)) {
        expect(budget.attributeWeights, `${identity}.${attribute} needs an identity-budget audit row`)
          .toHaveProperty(attribute);
      }
    }
  });

  const recordedTotals: Record<Identity, number> = {
    passing: 1.86,
    direct: -4.14,
    defensive: -0.37,
    balanced: 0,
  };

  it.each(Object.keys(identities) as Identity[])("records the %s identity vector's weighted-unit total without targeting zero", (identity) => {
    const total = weightedUnitTotal(identity);
    expect(total, `${identity} weighted-unit record changed`).toBeCloseTo(recordedTotals[identity], 12);
  });
});
