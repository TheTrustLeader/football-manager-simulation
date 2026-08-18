import { describe, expect, it } from "vitest";
import { conditionForDisplay } from "../src/condition-display.js";
import { ENGINE_CONFIG } from "../src/engine-config.js";

describe("condition display", () => {
  it("shows the performance effect of internal condition without changing engine state", () => {
    expect(conditionForDisplay(ENGINE_CONFIG.condition.scale)).toBe(100);
    expect(conditionForDisplay(60)).toBeCloseTo(91.2, 10);
    expect(conditionForDisplay(ENGINE_CONFIG.fatigue.minimumCondition)).toBeCloseTo(85.7, 10);
  });
});
