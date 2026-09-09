import { describe, expect, it, vi } from "vitest";
import { SeededRandom } from "../src/random.js";

describe("SeededRandom", () => {
  it("produces the same sequence from the same seed", () => {
    const first = new SeededRandom(91_827);
    const second = new SeededRandom(91_827);

    expect(Array.from({ length: 100 }, () => first.next())).toEqual(
      Array.from({ length: 100 }, () => second.next()),
    );
  });

  it("produces different sequences from different seeds", () => {
    const first = new SeededRandom(91_827);
    const second = new SeededRandom(91_828);

    expect(Array.from({ length: 100 }, () => first.next())).not.toEqual(
      Array.from({ length: 100 }, () => second.next()),
    );
  });

  it("keeps every draw in the half-open interval from zero to one", () => {
    const random = new SeededRandom(0);

    for (let draw = 0; draw < 10_000; draw += 1) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("clamps probabilities below zero to false and above one to true", () => {
    const random = new SeededRandom(12_345);

    for (let draw = 0; draw < 1_000; draw += 1) {
      expect(random.chance(-1)).toBe(false);
      expect(random.chance(2)).toBe(true);
    }
  });

  it("treats zero as impossible and one as certain", () => {
    const random = new SeededRandom(54_321);

    for (let draw = 0; draw < 1_000; draw += 1) {
      expect(random.chance(0)).toBe(false);
      expect(random.chance(1)).toBe(true);
    }
  });

  it("rejects an empty collection", () => {
    expect(() => new SeededRandom(1).pick([])).toThrow("Cannot pick from an empty collection");
  });

  it("clamps the calculated index to a collection's final item", () => {
    const random = new SeededRandom(1);
    vi.spyOn(random, "next").mockReturnValue(1);

    expect(random.pick(["only"])).toBe("only");
    expect(random.pick(["first", "last"])).toBe("last");
    expect(random.pick(["first", "last"])).not.toBeUndefined();
  });
});
