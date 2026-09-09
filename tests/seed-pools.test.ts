import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SEALED_VALIDATION_SEED_POOL,
  TUNING_SEED_POOL,
  seedRange,
} from "../src/seed-pools.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("seedRange", () => {
  it("returns the requested contiguous tuning seeds from the pool start", () => {
    expect(seedRange("tuning", 5)).toEqual([
      TUNING_SEED_POOL.start,
      TUNING_SEED_POOL.start + 1,
      TUNING_SEED_POOL.start + 2,
      TUNING_SEED_POOL.start + 3,
      TUNING_SEED_POOL.start + 4,
    ]);
  });

  it.each([0, -1, 1.5])("rejects an invalid count of %s", (count) => {
    expect(() => seedRange("tuning", count)).toThrow("Seed count must be a positive integer");
  });

  it("names the pool when the requested count exceeds its size", () => {
    const poolSize = TUNING_SEED_POOL.end - TUNING_SEED_POOL.start + 1;

    expect(() => seedRange("tuning", poolSize + 1)).toThrow(TUNING_SEED_POOL.name);
  });

  it("blocks sealed validation seeds when permission is unset", () => {
    vi.stubEnv("ALLOW_SEALED_VALIDATION", undefined);

    expect(() => seedRange("validation", 2)).toThrow("Sealed validation seeds are blocked during tuning");
  });

  it("returns validation seeds when formal validation permission is set", () => {
    vi.stubEnv("ALLOW_SEALED_VALIDATION", "1");

    expect(seedRange("validation", 3)).toEqual([
      SEALED_VALIDATION_SEED_POOL.start,
      SEALED_VALIDATION_SEED_POOL.start + 1,
      SEALED_VALIDATION_SEED_POOL.start + 2,
    ]);
  });

  it("keeps the tuning and validation pools disjoint", () => {
    expect(TUNING_SEED_POOL.end).toBeLessThan(SEALED_VALIDATION_SEED_POOL.start);
  });
});
