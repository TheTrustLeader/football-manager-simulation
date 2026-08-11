import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import type { PlayingIdentity } from "./fixtures.js";

export const PAIRED_ESTIMATOR_IDENTITIES = ["passing", "direct", "defensive", "balanced"] as const;

export const PAIRED_ESTIMATOR_GENERATOR_SEEDS = [
  198_811_001,
  198_811_002,
  198_811_003,
  198_811_004,
  198_811_005,
  198_811_006,
  198_811_007,
  198_811_008,
] as const;

export interface PairedIdentitySideResult {
  identity: PlayingIdentity;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  pointsPerMatch: number;
}

export interface PairedIdentityGapResult {
  matchSeedRange: {
    start: number;
    end: number;
    count: number;
  };
  matches: number;
  first: PairedIdentitySideResult;
  second: PairedIdentitySideResult;
  pointsPerMatchDifference: number;
  absolutePointsPerMatchDifference: number;
}

export interface GeneratorSeedPairResult {
  generatorSeed: number;
  blocks: PairedIdentityGapResult[];
  combined: PairedIdentityGapResult;
}

export interface IdentityPairEstimate {
  firstIdentity: PlayingIdentity;
  secondIdentity: PlayingIdentity;
  pairedSamples: GeneratorSeedPairResult[];
  meanPointsPerMatchDifference: number;
  absoluteMeanPointsPerMatchDifference: number;
  meanAbsolutePointsPerMatchDifference: number;
  sampleStandardDeviation: number;
  standardErrorOfMean: number;
  minimumPointsPerMatchDifference: number;
  maximumPointsPerMatchDifference: number;
}

export interface PairedIdentityEstimatorResult {
  method: string;
  venueMethod: string;
  blockSize: number;
  generatorSeeds: number[];
  matchSeedRange: {
    start: number;
    end: number;
    count: number;
  };
  identities: PlayingIdentity[];
  estimates: IdentityPairEstimate[];
}

interface PairCounts {
  matches: number;
  firstWins: number;
  draws: number;
  secondWins: number;
}

const FIXED_TACTICS = {
  formation: "4-4-2",
  style: "balanced",
  approach: "balanced",
  tackling: "normal",
} as const;

function emptyCounts(): PairCounts {
  return { matches: 0, firstWins: 0, draws: 0, secondWins: 0 };
}

function addCounts(target: PairCounts, source: PairCounts): void {
  target.matches += source.matches;
  target.firstWins += source.firstWins;
  target.draws += source.draws;
  target.secondWins += source.secondWins;
}

function countMatchSeeds(
  firstIdentity: PlayingIdentity,
  secondIdentity: PlayingIdentity,
  generatorSeed: number,
  matchSeeds: readonly number[],
): PairCounts {
  const first = makeTeam(`paired-${generatorSeed}-${firstIdentity}`, 10, FIXED_TACTICS, {
    seed: generatorSeed,
    identity: firstIdentity,
  });
  const second = makeTeam(`paired-${generatorSeed}-${secondIdentity}`, 10, FIXED_TACTICS, {
    seed: generatorSeed,
    identity: secondIdentity,
  });
  const counts = emptyCounts();

  for (const matchSeed of matchSeeds) {
    const firstHome = matchSeed % 2 === 1;
    const match = simulateMatch({
      seed: matchSeed,
      home: firstHome ? first : second,
      away: firstHome ? second : first,
    });
    const firstGoals = firstHome ? match.home.goals : match.away.goals;
    const secondGoals = firstHome ? match.away.goals : match.home.goals;
    counts.matches += 1;
    if (firstGoals > secondGoals) counts.firstWins += 1;
    else if (firstGoals < secondGoals) counts.secondWins += 1;
    else counts.draws += 1;
  }

  return counts;
}

function gapResult(
  firstIdentity: PlayingIdentity,
  secondIdentity: PlayingIdentity,
  matchSeeds: readonly number[],
  counts: PairCounts,
): PairedIdentityGapResult {
  const firstPoints = counts.firstWins * 3 + counts.draws;
  const secondPoints = counts.secondWins * 3 + counts.draws;
  const firstPointsPerMatch = firstPoints / counts.matches;
  const secondPointsPerMatch = secondPoints / counts.matches;
  const difference = firstPointsPerMatch - secondPointsPerMatch;

  return {
    matchSeedRange: {
      start: matchSeeds[0]!,
      end: matchSeeds.at(-1)!,
      count: matchSeeds.length,
    },
    matches: counts.matches,
    first: {
      identity: firstIdentity,
      wins: counts.firstWins,
      draws: counts.draws,
      losses: counts.secondWins,
      points: firstPoints,
      pointsPerMatch: firstPointsPerMatch,
    },
    second: {
      identity: secondIdentity,
      wins: counts.secondWins,
      draws: counts.draws,
      losses: counts.firstWins,
      points: secondPoints,
      pointsPerMatch: secondPointsPerMatch,
    },
    pointsPerMatchDifference: difference,
    absolutePointsPerMatchDifference: Math.abs(difference),
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sampleStandardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  const squaredDeviations = values.reduce((total, value) => total + (value - average) ** 2, 0);
  return Math.sqrt(squaredDeviations / (values.length - 1));
}

function generatorSeedPair(
  firstIdentity: PlayingIdentity,
  secondIdentity: PlayingIdentity,
  generatorSeed: number,
  matchSeeds: readonly number[],
  blockSize: number,
): GeneratorSeedPairResult {
  const blocks: PairedIdentityGapResult[] = [];
  const combinedCounts = emptyCounts();

  for (let start = 0; start < matchSeeds.length; start += blockSize) {
    const blockSeeds = matchSeeds.slice(start, start + blockSize);
    const counts = countMatchSeeds(firstIdentity, secondIdentity, generatorSeed, blockSeeds);
    addCounts(combinedCounts, counts);
    blocks.push(gapResult(firstIdentity, secondIdentity, blockSeeds, counts));
  }

  return {
    generatorSeed,
    blocks,
    combined: gapResult(firstIdentity, secondIdentity, matchSeeds, combinedCounts),
  };
}

function identityPairs(identities: readonly PlayingIdentity[]): [PlayingIdentity, PlayingIdentity][] {
  const pairs: [PlayingIdentity, PlayingIdentity][] = [];
  for (let first = 0; first < identities.length; first += 1) {
    for (let second = first + 1; second < identities.length; second += 1) {
      pairs.push([identities[first]!, identities[second]!]);
    }
  }
  return pairs;
}

export function runPairedIdentityEstimator(
  generatorSeeds: readonly number[],
  matchSeeds: readonly number[],
  blockSize: number,
  identities: readonly PlayingIdentity[] = PAIRED_ESTIMATOR_IDENTITIES,
): PairedIdentityEstimatorResult {
  if (generatorSeeds.length < 2) throw new Error("Paired identity estimator requires at least two generator seeds");
  if (new Set(generatorSeeds).size !== generatorSeeds.length) throw new Error("Generator seeds must be unique");
  if (matchSeeds.length === 0) throw new Error("Paired identity estimator requires match seeds");
  if (!Number.isInteger(blockSize) || blockSize <= 0) throw new Error("Block size must be a positive integer");
  if (matchSeeds.length % blockSize !== 0) throw new Error("Match seed count must divide into complete fixed blocks");
  if (new Set(identities).size !== identities.length || identities.length < 2) {
    throw new Error("Identity list must contain at least two unique identities");
  }

  const estimates = identityPairs(identities).map(([firstIdentity, secondIdentity]) => {
    const pairedSamples = generatorSeeds.map((generatorSeed) => generatorSeedPair(
      firstIdentity,
      secondIdentity,
      generatorSeed,
      matchSeeds,
      blockSize,
    ));
    const differences = pairedSamples.map((sample) => sample.combined.pointsPerMatchDifference);
    const absoluteDifferences = differences.map(Math.abs);
    const meanDifference = mean(differences);
    const standardDeviation = sampleStandardDeviation(differences);
    return {
      firstIdentity,
      secondIdentity,
      pairedSamples,
      meanPointsPerMatchDifference: meanDifference,
      absoluteMeanPointsPerMatchDifference: Math.abs(meanDifference),
      meanAbsolutePointsPerMatchDifference: mean(absoluteDifferences),
      sampleStandardDeviation: standardDeviation,
      standardErrorOfMean: standardDeviation / Math.sqrt(differences.length),
      minimumPointsPerMatchDifference: Math.min(...differences),
      maximumPointsPerMatchDifference: Math.max(...differences),
    };
  });

  return {
    method: "Hold generator seed constant within each pair, vary only identity, use identical balanced tactics, and average signed PPM differences across generator seeds",
    venueMethod: "First identity home on odd match seeds and second identity home on even match seeds",
    blockSize,
    generatorSeeds: [...generatorSeeds],
    matchSeedRange: {
      start: matchSeeds[0]!,
      end: matchSeeds.at(-1)!,
      count: matchSeeds.length,
    },
    identities: [...identities],
    estimates,
  };
}
