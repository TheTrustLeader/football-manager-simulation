export const ENGINE_CONFIG = {
  version: "match-engine-config-0.3.5",
  matchMinutes: 90,
  neutralPossession: 0.5,
  homePossessionBase: 0.515,
  possessionMin: 0.38,
  possessionMax: 0.62,
  retentionDeltaDivisor: 120,
  condition: { base: 0.78, range: 0.22, scale: 100 },
  form: { maxMagnitude: 1, effect: 0.025 },
  morale: { "very-low": 0.94, low: 0.97, steady: 1, good: 1.02, high: 1.04 },
  profileWeights: {
    retention: { passing: 0.65, creativity: 0.35 },
    progression: { passing: 0.35, creativity: 0.3, pace: 0.2, aerial: 0.15 },
    attack: { creativity: 0.3, pace: 0.25, finishing: 0.3, aerial: 0.15 },
    defence: { defending: 0.7, pace: 0.15, aerial: 0.15 },
  },
  style: {
    passing: { retention: 1.08, progression: 1.03, attack: 1, chanceRate: 1.05, shotRate: 0.93, shotQuality: 1.08 },
    direct: { retention: 0.94, progression: 1.04, attack: 1, chanceRate: 1.08, shotRate: 1.08, shotQuality: 0.96 },
    counter: { retention: 0.96, progression: 1, attack: 1.02, chanceRate: 0.93, shotRate: 0.92, shotQuality: 1.12 },
    balanced: { retention: 1, progression: 1, attack: 1, chanceRate: 1, shotRate: 1, shotQuality: 1 },
    attributeBaseline: 10,
    attributeDivisor: 200,
    attributeMin: -0.03,
    attributeMax: 0.05,
  },
  approach: {
    cautious: { attack: 0.92, defence: 1.05 },
    balanced: { attack: 1, defence: 1 },
    attacking: { attack: 1.08, defence: 0.95 },
  },
  progression: { base: 0.42, differenceDivisor: 170, min: 0.24, max: 0.6 },
  chance: { base: 0.5, differenceDivisor: 180, min: 0.28, max: 0.68 },
  shot: { base: 0.82, min: 0.55, max: 0.96 },
  onTarget: { base: 0.45, finishingBaseline: 10, finishingDivisor: 80, min: 0.28, max: 0.68 },
  goal: { base: 0.28, finishingGoalkeeperDivisor: 90, min: 0.14, max: 0.44 },
  creator: { designatedShare: 0.35 },
  defending: { stopCreditShare: 0.7, majorErrorChance: 0.006 },
  tackling: {
    hardFoul: 0.055,
    normalFoul: 0.038,
    carefulFoul: 0.025,
    hardCard: 0.28,
    normalCard: 0.18,
    carefulCard: 0.11,
    hardRed: 0.04,
    normalRed: 0.025,
    carefulRed: 0.012,
  },
  ratings: {
    baseline: 6,
    goal: 0.9,
    assist: 0.45,
    shot: 0.01,
    shotOnTarget: 0.04,
    chanceCreated: 0.08,
    progressionAction: 0.015,
    defensiveAction: 0.04,
    save: 0.12,
    majorError: -0.6,
    redCard: -1.2,
    yellowCard: -0.08,
    min: 1,
    max: 10,
    precision: 10,
  },
  formation: {
    "4-4-2": { retention: 1, progression: 1, attack: 1, defence: 1 },
    "4-3-3": { retention: 0.98, progression: 1.07, attack: 1.12, defence: 0.94 },
    "4-5-1": { retention: 1.05, progression: 0.97, attack: 0.9, defence: 1.08 },
    "3-5-2": { retention: 1.04, progression: 1.06, attack: 1.05, defence: 0.96 },
    "5-3-2": { retention: 0.96, progression: 0.94, attack: 0.9, defence: 1.1 },
  },
  presenceTests: {
    sampleMatches: 2000,
    formationMinimumGoalRateDelta: 0.02,
    styleMinimumChanceRateDelta: 0.03,
    styleMinimumConversionDelta: 0.002,
    ratingCoverageMatches: 1000,
  },
  ciGuardrails: {
    sampleMatches: 20000,
    goalsPerMatchMin: 2.2,
    goalsPerMatchMax: 2.9,
    drawRateMin: 0.23,
    drawRateMax: 0.33,
    mirrorWinRateTolerance: 0.025,
    abilityStrongWinRateMin: 0.42,
    abilityWeakWinRateMax: 0.18,
  },
} as const;

export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalise(object[key])}`).join(",")}}`;
}

export function stableHash(value: unknown): string {
  const text = typeof value === "string" ? value : canonicalise(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const character of text) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = (hash * prime) & mask;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

export const ENGINE_CONFIG_HASH = stableHash(ENGINE_CONFIG);
