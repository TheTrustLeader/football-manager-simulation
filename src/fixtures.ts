import { ENGINE_CONFIG, stableHash } from "./engine-config.js";
import { SeededRandom } from "./random.js";
import type {
  AttributeName,
  GoalkeeperAttributes,
  HiddenTraits,
  OutfieldAttributes,
  Player,
  Position,
  TeamInput,
  Tactics,
} from "./types.js";

export type PlayingIdentity = "passing" | "direct" | "defensive" | "balanced";

export interface SquadGenerationOptions {
  seed?: number;
  identity?: PlayingIdentity;
}

export interface ResolvedSquadGeneration {
  seed: number;
  identity: PlayingIdentity;
}

interface PlayerTypeProfile {
  name: string;
  attributes: Partial<Record<AttributeName, number>>;
  hidden?: Partial<HiddenTraits>;
}

type AttributeModifiers = Partial<Record<AttributeName, number>>;

const generationConfig = ENGINE_CONFIG.squadGeneration;
const outfieldAttributeKeys = generationConfig.attributeKeys.outfield;
const goalkeeperAttributeKeys = generationConfig.attributeKeys.goalkeeper;
const starterPositions = generationConfig.roster.starters as readonly Position[];
const substitutePositions = generationConfig.roster.substitutes as readonly Position[];
const clubProfiles = generationConfig.clubProfiles as Record<string, ResolvedSquadGeneration>;
const identityBiases = generationConfig.identityBiases as Record<PlayingIdentity, AttributeModifiers>;
const identityParityAdjustments = generationConfig.identityParity.interimAdjustmentsUntilCrossingIsConsumed as unknown as Record<PlayingIdentity, {
  outfield: AttributeModifiers;
  goalkeeper: AttributeModifiers;
}>;
const positionBases = generationConfig.positionBases as Record<Position, AttributeModifiers>;
const playerTypes = generationConfig.playerTypes as unknown as Record<Position, readonly PlayerTypeProfile[]>;

export const SQUAD_GENERATION_VERSION = generationConfig.version;
export const SQUAD_GENERATION_HASH = stableHash(generationConfig);

function clampAttribute(value: number): number {
  return Math.max(generationConfig.attributeMinimum, Math.min(generationConfig.attributeMaximum, Math.round(value)));
}

function seedFromText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 1;
}

function integer(random: SeededRandom, min: number, max: number): number {
  return min + Math.floor(random.next() * (max - min + 1));
}

function shuffled<T>(values: readonly T[], random: SeededRandom): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random.next() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

function balancedDeck(random: SeededRandom, size: number, values: readonly number[]): number[] {
  return shuffled(Array.from({ length: size }, (_, index) => values[index % values.length]!), random);
}

function attributeModifiers(
  quality: number,
  technical: number,
  physical: number,
  mentality: number,
): Record<AttributeName, number> {
  return {
    defending: quality + mentality,
    passing: quality + technical,
    creativity: quality + technical,
    pace: quality + physical,
    aerial: quality + physical,
    finishing: quality + technical,
    stamina: quality + physical,
    leadership: quality + mentality,
    crossing: quality + technical,
    shotStopping: quality + technical,
    handling: quality + mentality,
    kicking: quality + technical,
  };
}

function makeAttributes(
  level: number,
  position: Position,
  identity: PlayingIdentity,
  profile: PlayerTypeProfile,
  correlated: Record<AttributeName, number>,
): GoalkeeperAttributes | OutfieldAttributes {
  const keys = position === "GK" ? goalkeeperAttributeKeys : outfieldAttributeKeys;
  const identityBias = position === "GK" ? {} : identityBiases[identity];
  const parityAdjustment = position === "GK"
    ? identityParityAdjustments[identity].goalkeeper
    : identityParityAdjustments[identity].outfield;
  const base = positionBases[position];
  return Object.fromEntries(keys.map((key) => [
    key,
    clampAttribute(level + (base[key] ?? 0) + (identityBias[key] ?? 0) + (parityAdjustment[key] ?? 0) + (profile.attributes[key] ?? 0) + correlated[key]),
  ])) as unknown as GoalkeeperAttributes | OutfieldAttributes;
}

export function resolveSquadGeneration(id: string, level = 10, options: SquadGenerationOptions = {}): ResolvedSquadGeneration {
  const known = clubProfiles[id.toLowerCase()];
  const identity = options.identity ?? known?.identity ?? "balanced";
  const seed = options.seed ?? known?.seed ?? seedFromText(`${id.toLowerCase()}|${level}|${identity}`);
  return { seed, identity };
}

function makePlayer(
  id: string,
  name: string,
  level: number,
  position: Position,
  identity: PlayingIdentity,
  profile: PlayerTypeProfile,
  quality: number,
  technical: number,
  physical: number,
  mentality: number,
  adaptability: number,
  injuryVariance: number,
  potentialVariance: number,
  random: SeededRandom,
): Player {
  const attributes = makeAttributes(level, position, identity, profile, attributeModifiers(quality, technical, physical, mentality));
  const common = {
    id,
    name,
    age: integer(random, generationConfig.ageMinimum, generationConfig.ageMaximum),
    hidden: {
      consistency: clampAttribute(generationConfig.hiddenBaseline + quality + mentality + (profile.hidden?.consistency ?? 0)),
      injurySusceptibility: clampAttribute(generationConfig.hiddenBaseline - physical + injuryVariance),
      temperament: clampAttribute(generationConfig.hiddenBaseline + mentality + (profile.hidden?.temperament ?? 0)),
      potential: clampAttribute(generationConfig.hiddenBaseline + quality + potentialVariance),
      adaptability: clampAttribute(generationConfig.hiddenBaseline + adaptability + (profile.hidden?.adaptability ?? 0)),
    },
    state: {
      condition: generationConfig.defaultCondition,
      morale: "steady" as const,
      recentForm: 0,
    },
  };
  if (position === "GK") return { ...common, primaryPosition: position, attributes: attributes as GoalkeeperAttributes };
  return { ...common, primaryPosition: position, attributes: attributes as OutfieldAttributes };
}

export function makeTeam(id: string, level = 10, overrides: Partial<Tactics> = {}, options: SquadGenerationOptions = {}): TeamInput {
  const generation = resolveSquadGeneration(id, level, options);
  const random = new SeededRandom(generation.seed);
  const rosterSize = starterPositions.length + substitutePositions.length;
  const profileOrders = Object.fromEntries((Object.keys(playerTypes) as Position[]).map((position) => [
    position,
    shuffled(playerTypes[position], random),
  ])) as Record<Position, PlayerTypeProfile[]>;
  const positionCounts: Record<Position, number> = { GK: 0, CB: 0, FB: 0, CM: 0, WM: 0, FW: 0 };
  const variation = generationConfig.variation;
  const qualityDeck = balancedDeck(random, rosterSize, variation.quality);
  const technicalDeck = balancedDeck(random, rosterSize, variation.technical);
  const physicalDeck = balancedDeck(random, rosterSize, variation.physical);
  const mentalityDeck = balancedDeck(random, rosterSize, variation.mentality);
  const adaptabilityDeck = balancedDeck(random, rosterSize, variation.adaptability);
  const injuryDeck = balancedDeck(random, rosterSize, variation.injurySusceptibility);
  const potentialDeck = balancedDeck(random, rosterSize, variation.potential);
  let rosterIndex = 0;

  function create(position: Position, idSuffix: string, label: string): Player {
    const order = profileOrders[position];
    const profile = order[positionCounts[position] % order.length]!;
    positionCounts[position] += 1;
    const player = makePlayer(
      `${id}-${idSuffix}`,
      `${id.toUpperCase()} ${label}`,
      level,
      position,
      generation.identity,
      profile,
      qualityDeck[rosterIndex]!,
      technicalDeck[rosterIndex]!,
      physicalDeck[rosterIndex]!,
      mentalityDeck[rosterIndex]!,
      adaptabilityDeck[rosterIndex]!,
      injuryDeck[rosterIndex]!,
      potentialDeck[rosterIndex]!,
      random,
    );
    rosterIndex += 1;
    return player;
  }

  const starters = starterPositions.map((position, index) => create(position, `p${index + 1}`, `Player ${index + 1}`));
  const substitutes = substitutePositions.map((position, index) => create(position, `sub-p${index + 1}`, `Substitute ${index + 1}`));
  const captain = starters.find((player) => player.primaryPosition === "CB")!;
  const creator = starters.find((player) => player.primaryPosition === "CM")!;
  const targetForward = starters.find((player) => player.primaryPosition === "FW")!;

  const tactics: Tactics = {
    formation: "4-4-2",
    style: "balanced",
    approach: "balanced",
    tackling: "normal",
    captainId: captain.id,
    creatorId: creator.id,
    targetForwardId: targetForward.id,
    ...overrides,
  };

  return { id, name: id.toUpperCase(), starters, substitutes, tactics };
}
