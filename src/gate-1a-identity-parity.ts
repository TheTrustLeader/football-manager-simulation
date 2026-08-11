import { ENGINE_CONFIG } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";

export interface IdentityParityResult {
  seedRange: {
    start: number;
    end: number;
    count: number;
  };
  matches: number;
  northbridge: {
    wins: number;
    draws: number;
    losses: number;
    points: number;
    pointsPerMatch: number;
  };
  redmere: {
    wins: number;
    draws: number;
    losses: number;
    points: number;
    pointsPerMatch: number;
  };
  absolutePointsPerMatchDifference: number;
  tolerance: number;
  pass: boolean;
}

export interface IdentityParityControlResult {
  control: string;
  blockSize: number;
  venueMethod: string;
  blocks: IdentityParityResult[];
  combined: IdentityParityResult;
}

interface IdentityParityCounts {
  matches: number;
  northbridgeWins: number;
  draws: number;
  redmereWins: number;
}

function countSeeds(seeds: readonly number[]): IdentityParityCounts {
  const northbridge = makeTeam("northbridge", 10, {
    formation: "4-4-2",
    style: "passing",
    approach: "balanced",
    tackling: "normal",
  });
  const redmere = makeTeam("redmere", 10, {
    formation: "4-4-2",
    style: "direct",
    approach: "balanced",
    tackling: "normal",
  });
  const counts: IdentityParityCounts = {
    matches: 0,
    northbridgeWins: 0,
    draws: 0,
    redmereWins: 0,
  };

  for (const seed of seeds) {
    const northbridgeHome = seed % 2 === 1;
    const match = simulateMatch({
      seed,
      home: northbridgeHome ? northbridge : redmere,
      away: northbridgeHome ? redmere : northbridge,
    });
    const northbridgeGoals = northbridgeHome ? match.home.goals : match.away.goals;
    const redmereGoals = northbridgeHome ? match.away.goals : match.home.goals;
    counts.matches += 1;
    if (northbridgeGoals > redmereGoals) counts.northbridgeWins += 1;
    else if (northbridgeGoals < redmereGoals) counts.redmereWins += 1;
    else counts.draws += 1;
  }

  return counts;
}

function resultFromCounts(
  seedRange: IdentityParityResult["seedRange"],
  counts: IdentityParityCounts,
): IdentityParityResult {

  const northbridgePoints = counts.northbridgeWins * 3 + counts.draws;
  const redmerePoints = counts.redmereWins * 3 + counts.draws;
  const northbridgePointsPerMatch = northbridgePoints / counts.matches;
  const redmerePointsPerMatch = redmerePoints / counts.matches;
  const difference = Math.abs(northbridgePointsPerMatch - redmerePointsPerMatch);
  const tolerance = ENGINE_CONFIG.squadGeneration.identityParity.pointsPerMatchTolerance;

  return {
    seedRange,
    matches: counts.matches,
    northbridge: {
      wins: counts.northbridgeWins,
      draws: counts.draws,
      losses: counts.redmereWins,
      points: northbridgePoints,
      pointsPerMatch: northbridgePointsPerMatch,
    },
    redmere: {
      wins: counts.redmereWins,
      draws: counts.draws,
      losses: counts.northbridgeWins,
      points: redmerePoints,
      pointsPerMatch: redmerePointsPerMatch,
    },
    absolutePointsPerMatchDifference: difference,
    tolerance,
    pass: difference <= tolerance,
  };
}

export function runIdentityParityControl(
  seeds: readonly number[],
  blockSize = ENGINE_CONFIG.squadGeneration.identityParity.sampleMatches,
): IdentityParityControlResult {
  if (!Number.isInteger(blockSize) || blockSize <= 0) throw new Error("Block size must be a positive integer");
  if (seeds.length === 0) throw new Error("Identity parity control requires at least one seed");

  const blocks: IdentityParityResult[] = [];
  const combinedCounts: IdentityParityCounts = {
    matches: 0,
    northbridgeWins: 0,
    draws: 0,
    redmereWins: 0,
  };
  for (let start = 0; start < seeds.length; start += blockSize) {
    const blockSeeds = seeds.slice(start, start + blockSize);
    const counts = countSeeds(blockSeeds);
    combinedCounts.matches += counts.matches;
    combinedCounts.northbridgeWins += counts.northbridgeWins;
    combinedCounts.draws += counts.draws;
    combinedCounts.redmereWins += counts.redmereWins;
    blocks.push(resultFromCounts(
      { start: blockSeeds[0]!, end: blockSeeds.at(-1)!, count: blockSeeds.length },
      counts,
    ));
  }

  return {
    control: ENGINE_CONFIG.squadGeneration.identityParity.control,
    blockSize,
    venueMethod: "Northbridge home on odd seeds and Redmere home on even seeds",
    blocks,
    combined: resultFromCounts(
      { start: seeds[0]!, end: seeds.at(-1)!, count: seeds.length },
      combinedCounts,
    ),
  };
}
