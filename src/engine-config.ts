export const ENGINE_CONFIG = {
  version: "match-engine-config-0.9.0",
  matchMinutes: 90,
  possessionBase: 0.5,
  possessionMin: 0.38,
  possessionMax: 0.62,
  retentionDeltaDivisor: 120,
  homeAdvantage: {
    homeProgressionProbabilityBoost: 0.085,
    awayTravelConditionPenalty: 2,
    awayDefendingFoulProbabilityAdd: 0.003,
  },
  gameState: {
    progressionProbabilityShift: 0.04,
  },
  fatigue: {
    baseConditionLossPerMinute: 0.675,
    staminaBaseline: 10,
    staminaSensitivity: 0.025,
    minimumCondition: 35,
    approachMultiplier: { cautious: 0.9, balanced: 1, attacking: 1.12 },
    phaseMultiplier: {
      firstHalf: 0.25,
      minutes46To60: 0.6,
      minutes61To75: 1.05,
      minutes76To90: 1.55,
    },
  },
  condition: { base: 0.78, range: 0.22, scale: 100 },
  form: { maxMagnitude: 1, effect: 0.025 },
  morale: { "very-low": 0.94, low: 0.97, steady: 1, good: 1.02, high: 1.04 },
  profileWeights: {
    retention: { passing: 0.65, creativity: 0.35 },
    progression: { passing: 0.35, creativity: 0.3, pace: 0.2, aerial: 0.15 },
    attack: { creativity: 0.3, pace: 0.25, finishing: 0.3, aerial: 0.15 },
    defence: {
      outfieldShare: 0.9,
      goalkeeperShare: 0.1,
      outfield: { defending: 0.7, pace: 0.15, aerial: 0.15 },
      goalkeeper: { handling: 0.4, aerial: 0.35, leadership: 0.25 },
    },
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
    cautious: { attack: 0.92, defence: 1.05, territorialProgressionAdd: -0.02, spaceBehindProgressionAdd: -0.015 },
    balanced: { attack: 1, defence: 1, territorialProgressionAdd: 0, spaceBehindProgressionAdd: 0 },
    attacking: { attack: 1.08, defence: 0.95, territorialProgressionAdd: 0.04, spaceBehindProgressionAdd: 0.045 },
  },
  approachAcceptance: {
    minimumAttackingVsCautiousGoalsForPerMatchDelta: 0.08,
    minimumAttackingVsCautiousGoalsAgainstPerMatchDelta: 0.08,
  },
  progression: { base: 0.42, differenceDivisor: 170, min: 0.24, max: 0.6 },
  chance: { base: 0.5, differenceDivisor: 180, min: 0.28, max: 0.68 },
  shot: { base: 0.9, min: 0.55, max: 0.96 },
  onTarget: { base: 0.45, finishingBaseline: 10, finishingDivisor: 80, min: 0.28, max: 0.68 },
  goal: { base: 0.29, finishingGoalkeeperDivisor: 90, min: 0.14, max: 0.44 },
  creator: { designatedShare: 0.35 },
  defending: { stopCreditShare: 0.7, stopCreditWeightFloor: 1, majorErrorChance: 0.006 },
  dismissal: { baselinePlayers: 11, profileExponent: 0.75 },
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
  squadGeneration: {
    version: "squad-generation-2.1.0",
    attributeMinimum: 1,
    attributeMaximum: 20,
    defaultCondition: 100,
    hiddenBaseline: 10,
    ageMinimum: 23,
    ageMaximum: 31,
    attributeKeys: {
      outfield: ["defending", "passing", "creativity", "pace", "aerial", "finishing", "stamina", "leadership", "crossing"],
      goalkeeper: ["shotStopping", "handling", "kicking", "aerial", "leadership"],
    },
    roster: {
      starters: ["GK", "CB", "CB", "FB", "FB", "CM", "CM", "WM", "WM", "FW", "FW"],
      substitutes: ["GK", "CB", "CB", "FB", "FB", "CM", "CM", "WM", "WM", "FW", "FW"],
    },
    formationPositionRequirements: {
      "4-4-2": { GK: 1, CB: 2, FB: 2, CM: 2, WM: 2, FW: 2 },
      "4-3-3": { GK: 1, CB: 2, FB: 2, CM: 3, FW: 3 },
      "4-5-1": { GK: 1, CB: 2, FB: 2, CM: 3, WM: 2, FW: 1 },
      "3-5-2": { GK: 1, CB: 3, FB: 2, CM: 3, FW: 2 },
      "5-3-2": { GK: 1, CB: 3, FB: 2, CM: 3, FW: 2 },
    },
    clubProfiles: {
      northbridge: { seed: 198_808_091, identity: "passing" },
      redmere: { seed: 198_808_092, identity: "direct" },
    },
    testControlSeeds: {
      baseline: 198_809_001,
      mirror: 198_809_002,
      ability: 198_809_003,
      formation: 198_809_004,
      style: 198_809_005,
    },
    identityBiases: {
      passing: { passing: 2, creativity: 2, aerial: -2, pace: -2 },
      direct: { pace: 2, aerial: 2, crossing: 2, finishing: 1, passing: -3, creativity: -3, defending: -1 },
      defensive: { defending: 2, aerial: 2, creativity: -2, finishing: -2 },
      balanced: {},
    },
    identityParity: {
      sampleMatches: 10000,
      pointsPerMatchTolerance: 0.1,
      control: "matching identity style, balanced approach, 4-4-2, normal tackling, alternating venue",
      interimAdjustmentsUntilCrossingIsConsumed: {
        passing: { outfield: {}, goalkeeper: {} },
        direct: {
          outfield: { finishing: 1 },
          goalkeeper: { shotStopping: 6, handling: 1, kicking: 1, aerial: 1, leadership: 1 },
        },
        defensive: { outfield: {}, goalkeeper: {} },
        balanced: { outfield: {}, goalkeeper: {} },
      },
    },
    positionBases: {
      GK: { shotStopping: 3, handling: 2, kicking: 0, aerial: 1, leadership: 0 },
      CB: { defending: 2, passing: -1, creativity: -1, pace: -1, aerial: 2, finishing: -3, stamina: 0, leadership: 1, crossing: -2 },
      FB: { defending: 1, passing: 0, creativity: 0, pace: 2, aerial: -1, finishing: -2, stamina: 2, leadership: 0, crossing: 2 },
      CM: { defending: 1, passing: 2, creativity: 2, pace: -1, aerial: -1, finishing: 0, stamina: 1, leadership: 0, crossing: -1 },
      WM: { defending: -2, passing: 0, creativity: 1, pace: 2, aerial: -2, finishing: -1, stamina: 1, leadership: 0, crossing: 3 },
      FW: { defending: -3, passing: -1, creativity: 1, pace: 2, aerial: 2, finishing: 3, stamina: 0, leadership: 0, crossing: -2 },
    },
    playerTypes: {
      GK: [
        { name: "commanding shot stopper", attributes: { shotStopping: 2, handling: 1, aerial: 1, leadership: 1, kicking: -5 }, hidden: { consistency: 1, adaptability: -2 } },
        { name: "strong distributor", attributes: { kicking: 4, handling: 1, leadership: 1, shotStopping: -3, aerial: -3 }, hidden: { adaptability: 3 } },
      ],
      CB: [
        { name: "stopper", attributes: { defending: 3, aerial: 3, leadership: 1, pace: -3, passing: -2, creativity: -1, crossing: -1 }, hidden: { adaptability: -2 } },
        { name: "ball-playing centre-back", attributes: { passing: 3, creativity: 2, pace: 1, crossing: 1, defending: -2, aerial: -2, leadership: -1, finishing: -1, stamina: -1 }, hidden: { adaptability: 1 } },
        { name: "quick covering centre-back", attributes: { pace: 4, stamina: 2, defending: 1, passing: 1, aerial: -4, leadership: -1, creativity: -1, finishing: -1, crossing: -1 }, hidden: { adaptability: 3 } },
        { name: "organiser", attributes: { defending: 2, aerial: 1, leadership: 3, stamina: 1, pace: -2, creativity: -2, finishing: -1, crossing: -2 }, hidden: { consistency: 2, adaptability: -1 } },
      ],
      FB: [
        { name: "defensive full-back", attributes: { defending: 3, stamina: 1, leadership: 1, aerial: 1, pace: -1, crossing: -2, creativity: -1, finishing: -1, passing: -1 }, hidden: { adaptability: -1 } },
        { name: "overlapping full-back", attributes: { pace: 3, crossing: 3, stamina: 2, defending: -2, aerial: -2, finishing: -2, leadership: -1, passing: -1 }, hidden: { adaptability: 2 } },
        { name: "cultured full-back", attributes: { passing: 3, creativity: 2, crossing: 2, leadership: 1, defending: -2, pace: -2, aerial: -2, finishing: -1, stamina: -1 }, hidden: { adaptability: 2 } },
        { name: "recovery full-back", attributes: { pace: 3, stamina: 3, defending: 2, aerial: -2, passing: -2, creativity: -1, finishing: -1, leadership: -1, crossing: -1 }, hidden: { adaptability: 1 } },
      ],
      CM: [
        { name: "creator", attributes: { passing: 3, creativity: 3, crossing: 1, defending: -2, aerial: -2, stamina: -1, leadership: -1, finishing: -1 }, hidden: { adaptability: 1 } },
        { name: "ball winner", attributes: { defending: 4, stamina: 3, leadership: 1, creativity: -3, finishing: -2, passing: -1, crossing: -1, aerial: -1 }, hidden: { temperament: -1, adaptability: -1 } },
        { name: "box-to-box runner", attributes: { pace: 3, stamina: 3, finishing: 1, creativity: -2, aerial: -2, passing: -1, leadership: -1, crossing: -1 }, hidden: { adaptability: 2 } },
        { name: "deep playmaker", attributes: { passing: 3, creativity: 2, leadership: 2, defending: 1, pace: -2, aerial: -2, finishing: -2, crossing: -1, stamina: -1 }, hidden: { consistency: 1, adaptability: -1 } },
      ],
      WM: [
        { name: "touchline crosser", attributes: { crossing: 3, pace: 2, creativity: 1, stamina: 1, defending: -2, aerial: -2, finishing: -1, passing: -1, leadership: -1 }, hidden: { adaptability: -1 } },
        { name: "wide creator", attributes: { passing: 2, creativity: 3, crossing: 2, leadership: 1, pace: -2, defending: -2, aerial: -2, finishing: -1, stamina: -1 }, hidden: { adaptability: 2 } },
        { name: "wide runner", attributes: { pace: 3, stamina: 3, crossing: 1, creativity: -2, passing: -2, aerial: -1, finishing: -1, leadership: -1 }, hidden: { adaptability: 2 } },
        { name: "wide scorer", attributes: { pace: 2, finishing: 3, creativity: 1, crossing: 1, defending: -2, aerial: -2, passing: -1, stamina: -1, leadership: -1 }, hidden: { adaptability: 1 } },
      ],
      FW: [
        { name: "quick forward", attributes: { pace: 3, finishing: 2, creativity: 1, aerial: -3, passing: -1, leadership: -1, crossing: -1 }, hidden: { adaptability: 2 } },
        { name: "target forward", attributes: { aerial: 3, leadership: 2, finishing: 1, pace: -3, passing: -1, creativity: -1, crossing: -1 }, hidden: { adaptability: -2 } },
        { name: "finisher", attributes: { finishing: 3, pace: 1, stamina: 1, passing: -2, creativity: -1, aerial: -1, crossing: -1 }, hidden: { consistency: 1, adaptability: -1 } },
        { name: "link forward", attributes: { passing: 3, creativity: 3, leadership: 1, finishing: -2, aerial: -2, pace: -1, crossing: -1, stamina: -1 }, hidden: { adaptability: 3 } },
      ],
    },
    variation: {
      quality: [-1, 0, 1],
      technical: [-1, 0, 1],
      physical: [-1, 0, 1],
      mentality: [-1, 0, 1],
      adaptability: [-2, -1, 0, 1, 2],
      injurySusceptibility: [-2, -1, 0, 1, 2],
      potential: [-2, -1, 0, 1, 2],
    },
  },
  ageCurves: {
    applicationPoint: "season-rollover-only",
    attributesConstantDuringMatch: true,
    curves: {
      pace: { pattern: "physical-decline", startsAroundAge: 30, relativeRate: 1 },
      stamina: { pattern: "physical-decline", startsAroundAge: 30, relativeRate: 1 },
      injurySusceptibility: { pattern: "risk-increase", startsAroundAge: 30, relativeRate: 1, higherIsWorse: true },
      aerial: { pattern: "physical-decline", startsAroundAge: 30, relativeRate: 0.5 },
      passing: { pattern: "hold-or-improve-into-thirties" },
      creativity: { pattern: "hold-or-improve-into-thirties" },
      leadership: { pattern: "hold-or-improve-into-thirties" },
      defending: { pattern: "broad-plateau" },
      finishing: { pattern: "broad-plateau" },
      crossing: { pattern: "broad-plateau" },
    },
  },
  presenceTests: {
    sampleMatches: 2000,
    formationMinimumGoalRateDelta: 0.02,
    styleMinimumChanceRateDelta: 0.03,
    styleMinimumConversionDelta: 0.002,
    ratingCoverageMatches: 1000,
  },
  calibrationTargets: {
    goalsPerMatchMin: 2.4,
    goalsPerMatchMax: 2.7,
    drawRateMin: 0.27,
    drawRateMax: 0.31,
    homeWinRateMin: 0.41,
    homeWinRateMax: 0.47,
  },
  ciGuardrails: {
    sampleMatches: 20000,
    goalsPerMatchMin: 2.375,
    goalsPerMatchMax: 2.725,
    drawRateMin: 0.263,
    drawRateMax: 0.317,
    homeWinRateMin: 0.403,
    homeWinRateMax: 0.477,
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
