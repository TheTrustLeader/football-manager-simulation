import { describe, expect, it } from "vitest";
import {
  assessResponses,
  assertCleanTree,
  createEvidence,
  formatPair,
  leftArmForSeed,
  normaliseAnswer,
  oneSidedBinomialPValue,
  selectDecidablePairs,
  type DisplayStats,
  type PairResponse,
  type PairSimulation,
} from "../src/play-perceptibility.js";

function stats(shots: number): DisplayStats {
  return {
    chances: shots + 1,
    shots,
    shotsOnTarget: Math.floor(shots / 2),
    possessionPercent: 50,
  };
}

function response(pair: number, correct: boolean, cantTell = false): PairResponse {
  const leftArm = pair % 2 === 0 ? "attacking" : "baseline";
  const attackingSide = leftArm === "attacking" ? "left" : "right";
  return {
    pair,
    seed: pair,
    venue: pair % 2 === 1 ? "home" : "away",
    attacking: stats(12),
    baseline: stats(9),
    leftArm,
    rightArm: leftArm === "attacking" ? "baseline" : "attacking",
    answer: cantTell ? "cant-tell" : correct ? attackingSide : attackingSide === "left" ? "right" : "left",
    note: "",
    attackingSide,
    correct: !cantTell && correct,
  };
}

describe("H3 perceptibility harness", () => {
  it("keeps drawing tuning seeds, discards shot ties, and alternates venue across kept pairs", () => {
    const simulations: Record<number, PairSimulation> = {
      1: { attacking: stats(10), baseline: stats(10) },
      2: { attacking: stats(12), baseline: stats(9) },
      3: { attacking: stats(8), baseline: stats(8) },
      4: { attacking: stats(11), baseline: stats(9) },
      5: { attacking: stats(13), baseline: stats(10) },
    };
    const seenVenues: Array<[number, boolean]> = [];
    const selection = selectDecidablePairs(3, (seed, managedHome) => {
      seenVenues.push([seed, managedHome]);
      const simulation = simulations[seed];
      if (!simulation) throw new Error(`Unexpected seed ${seed}`);
      return simulation;
    });

    expect(selection.pairs.map((pair) => pair.seed)).toEqual([2, 4, 5]);
    expect(selection.pairs.map((pair) => pair.venue)).toEqual(["home", "away", "home"]);
    expect(seenVenues).toEqual([[1, true], [2, true], [3, false], [4, false], [5, true]]);
    expect(selection.seedsDrawn).toHaveLength(5);
    expect(selection.seedsDrawn[0]).toMatchObject({
      seed: 1,
      status: "discarded",
      discardReason: "equal-northbridge-shots",
    });
  });

  it("derives the blind left/right assignment only from the seed", () => {
    expect(leftArmForSeed(42)).toBe(leftArmForSeed(42));
    expect(["attacking", "baseline"]).toContain(leftArmForSeed(43));
  });

  it("uses the exact 13-of-18 one-sided binomial threshold", () => {
    const thirteenCorrect = Array.from({ length: 18 }, (_, index) => response(index + 1, index < 13));
    const twelveCorrect = Array.from({ length: 18 }, (_, index) => response(index + 1, index < 12));
    const pass = assessResponses(thirteenCorrect);
    const fail = assessResponses(twelveCorrect);

    expect(oneSidedBinomialPValue(13, 18)).toBeCloseTo(0.048126220703125, 12);
    expect(pass).toMatchObject({ correct: 13, passThreshold: 13, verdict: "PASS" });
    expect(fail).toMatchObject({ correct: 12, passThreshold: 13, verdict: "FAIL" });
  });

  it("counts can't tell as incorrect", () => {
    const responses = Array.from({ length: 18 }, (_, index) => response(index + 1, index < 13, index === 0));
    const assessment = assessResponses(responses);
    expect(assessment.correct).toBe(12);
    expect(assessment.cantTell).toBe(1);
    expect(assessment.verdict).toBe("FAIL");
  });

  it("refuses a dirty tracked tree before the run", () => {
    expect(() => assertCleanTree({ gitCommit: "a".repeat(40), dirtyTree: true })).toThrow(/refused/);
    expect(() => assertCleanTree({ gitCommit: "a".repeat(40), dirtyTree: false })).not.toThrow();
  });

  it("shows only the four allowed stat fields while the setups are blinded", () => {
    const selection = selectDecidablePairs(1, () => ({ attacking: stats(12), baseline: stats(9) }));
    const text = formatPair(selection.pairs[0]!);
    expect(text).toContain("Setup 1 (left)");
    expect(text).toContain("Setup 2 (right)");
    expect(text).toContain("Chances");
    expect(text).toContain("Shots on target");
    expect(text.toLowerCase()).not.toContain("goal");
    expect(text.toLowerCase()).not.toContain("condition");
    expect(text).not.toContain("attacking");
    expect(text).not.toContain("baseline");
  });

  it("records provenance, discarded seeds, assignments, answers and the verdict without match outcomes", () => {
    const selection = selectDecidablePairs(1, (seed) => seed === 1
      ? { attacking: stats(10), baseline: stats(10) }
      : { attacking: stats(12), baseline: stats(9) });
    const pair = selection.pairs[0]!;
    const attackingSide = pair.leftArm === "attacking" ? "left" : "right";
    const responses: PairResponse[] = [{
      ...pair,
      answer: attackingSide,
      note: "clear difference",
      attackingSide,
      correct: true,
    }];
    const assessment = assessResponses(responses);
    const evidence = createEvidence(
      selection,
      responses,
      assessment,
      { gitCommit: "1".repeat(40), dirtyTree: false },
      "2026-08-10T20:00:00.000Z",
    );
    const serialised = JSON.stringify(evidence);

    expect(evidence).toMatchObject({
      gitCommit: "1".repeat(40),
      dirtyTree: false,
      engineConfigVersion: "match-engine-config-0.7.1",
      controls: { seedPool: "tuning-v1", validationSeedsUsed: false },
      assessment: { correct: 1, verdict: "FAIL" },
    });
    expect(evidence.seedsDrawn).toHaveLength(2);
    expect(evidence.pairs[0]).toMatchObject({
      seed: 2,
      displayAssignment: { setup1Left: pair.leftArm, setup2Right: pair.rightArm },
      answer: attackingSide,
      correct: true,
    });
    expect(serialised.toLowerCase()).not.toContain("scoreline");
    expect(serialised.toLowerCase()).not.toContain('"goals"');
  });

  it("accepts the stated answer vocabulary", () => {
    expect(normaliseAnswer("left")).toBe("left");
    expect(normaliseAnswer("RIGHT")).toBe("right");
    expect(normaliseAnswer("can't tell")).toBe("cant-tell");
    expect(normaliseAnswer("cant tell")).toBe("cant-tell");
    expect(normaliseAnswer("1")).toBeNull();
  });
});
