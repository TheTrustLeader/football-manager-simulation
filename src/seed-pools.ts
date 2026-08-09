export const TUNING_SEED_POOL = {
  name: "tuning-v1",
  start: 1,
  end: 1_000_000,
} as const;

export const SEALED_VALIDATION_SEED_POOL = {
  name: "validation-v1",
  start: 10_000_001,
  end: 11_000_000,
} as const;

export type SeedPoolName = "tuning" | "validation";

export function seedRange(pool: SeedPoolName, count: number): number[] {
  if (!Number.isInteger(count) || count <= 0) throw new Error("Seed count must be a positive integer");
  const spec = pool === "tuning" ? TUNING_SEED_POOL : SEALED_VALIDATION_SEED_POOL;
  const available = spec.end - spec.start + 1;
  if (count > available) throw new Error(`${spec.name} contains only ${available} seeds`);

  if (pool === "validation" && process.env.ALLOW_SEALED_VALIDATION !== "1") {
    throw new Error("Sealed validation seeds are blocked during tuning. Set ALLOW_SEALED_VALIDATION=1 only for a formal validation run.");
  }

  return Array.from({ length: count }, (_, index) => spec.start + index);
}
