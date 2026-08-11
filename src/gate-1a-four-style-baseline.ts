import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import { makeTeam, resolveSquadGeneration, SQUAD_GENERATION_HASH, SQUAD_GENERATION_VERSION } from "./fixtures.js";
import { printRunProvenance, readEvidenceProvenance } from "./provenance.js";
import { seedRange } from "./seed-pools.js";
import type { Approach, MatchOutput, Style, TeamInput } from "./types.js";

type ManagedClub = "northbridge" | "redmere";

interface Aggregate {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  chancesFor: number;
  chancesAgainst: number;
  shotsFor: number;
  shotsAgainst: number;
  shotsOnTargetFor: number;
  shotsOnTargetAgainst: number;
}

const managedClubs: ManagedClub[] = ["northbridge", "redmere"];
const styles: Style[] = ["passing", "direct", "counter", "balanced"];
const approaches: Approach[] = ["attacking", "balanced", "cautious"];

function emptyAggregate(): Aggregate {
  return {
    matches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    chancesFor: 0,
    chancesAgainst: 0,
    shotsFor: 0,
    shotsAgainst: 0,
    shotsOnTargetFor: 0,
    shotsOnTargetAgainst: 0,
  };
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function addMatch(aggregate: Aggregate, result: MatchOutput, managedHome: boolean): void {
  const own = managedHome ? result.home : result.away;
  const opposition = managedHome ? result.away : result.home;
  aggregate.matches += 1;
  aggregate.goalsFor += own.goals;
  aggregate.goalsAgainst += opposition.goals;
  aggregate.chancesFor += own.chances;
  aggregate.chancesAgainst += opposition.chances;
  aggregate.shotsFor += own.shots;
  aggregate.shotsAgainst += opposition.shots;
  aggregate.shotsOnTargetFor += own.shotsOnTarget;
  aggregate.shotsOnTargetAgainst += opposition.shotsOnTarget;
  if (own.goals > opposition.goals) aggregate.wins += 1;
  else if (own.goals < opposition.goals) aggregate.losses += 1;
  else aggregate.draws += 1;
}

function metrics(aggregate: Aggregate) {
  return {
    matches: aggregate.matches,
    pointsPerMatch: divide(aggregate.wins * 3 + aggregate.draws, aggregate.matches),
    winRate: divide(aggregate.wins, aggregate.matches),
    drawRate: divide(aggregate.draws, aggregate.matches),
    lossRate: divide(aggregate.losses, aggregate.matches),
    goalsForPerMatch: divide(aggregate.goalsFor, aggregate.matches),
    goalsAgainstPerMatch: divide(aggregate.goalsAgainst, aggregate.matches),
    chancesForPerMatch: divide(aggregate.chancesFor, aggregate.matches),
    chancesAgainstPerMatch: divide(aggregate.chancesAgainst, aggregate.matches),
    shotsForPerMatch: divide(aggregate.shotsFor, aggregate.matches),
    shotsAgainstPerMatch: divide(aggregate.shotsAgainst, aggregate.matches),
    shotRate: divide(aggregate.shotsFor, aggregate.chancesFor),
    shotAccuracy: divide(aggregate.shotsOnTargetFor, aggregate.shotsFor),
    goalConversionPerChance: divide(aggregate.goalsFor, aggregate.chancesFor),
    goalConversionPerShot: divide(aggregate.goalsFor, aggregate.shotsFor),
    goalConversionPerShotOnTarget: divide(aggregate.goalsFor, aggregate.shotsOnTargetFor),
    counts: aggregate,
  };
}

type BaselineRow = ReturnType<typeof metrics> & {
  managedClub: ManagedClub;
  opponentClub: ManagedClub;
  style: Style;
  approach: Approach;
};

function playSeed(seed: number, managed: TeamInput, opponent: TeamInput): { result: MatchOutput; managedHome: boolean } {
  const managedHome = seed % 2 === 1;
  return {
    managedHome,
    result: simulateMatch({
      seed,
      home: managedHome ? managed : opponent,
      away: managedHome ? opponent : managed,
    }),
  };
}

const count = Number.parseInt(process.argv[2] ?? "30000", 10);
const outputPath = process.argv[3] ?? "evidence/GATE-1A-four-style-baseline.json";
if (!Number.isInteger(count) || count <= 0) throw new Error("Seed count must be a positive integer");
const command = process.argv[1]?.endsWith(".js")
  ? `node dist/src/gate-1a-four-style-baseline.js ${count} ${outputPath}`
  : `npm run gate1a:four-style-baseline -- ${count} ${outputPath}`;
const seeds = seedRange("tuning", count);
const provenance = readEvidenceProvenance();
printRunProvenance("GATE 1A FOUR-STYLE BASELINE", provenance);
const started = performance.now();

const rows: BaselineRow[] = [];
for (const managedClub of managedClubs) {
  const opponentClub: ManagedClub = managedClub === "northbridge" ? "redmere" : "northbridge";
  const opponent = makeTeam(opponentClub, 10, {
    formation: "4-4-2",
    style: "balanced",
    approach: "balanced",
    tackling: "normal",
  });

  for (const style of styles) {
    for (const approach of approaches) {
      const managed = makeTeam(managedClub, 10, {
        formation: "4-4-2",
        style,
        approach,
        tackling: "normal",
      });
      const aggregate = emptyAggregate();
      for (const seed of seeds) {
        const match = playSeed(seed, managed, opponent);
        addMatch(aggregate, match.result, match.managedHome);
      }
      rows.push({ managedClub, opponentClub, style, approach, ...metrics(aggregate) });
    }
  }
}

const byClub = Object.fromEntries(managedClubs.map((club) => [
  club,
  rows.filter((row) => row.managedClub === club),
]));
const counterComparisons = managedClubs.flatMap((managedClub) => approaches.map((approach) => {
  const peers = rows.filter((row) => row.managedClub === managedClub && row.approach === approach);
  const counter = peers.find((row) => row.style === "counter")!;
  const bestPoints = Math.max(...peers.map((row) => row.pointsPerMatch));
  const worstPoints = Math.min(...peers.map((row) => row.pointsPerMatch));
  const fewestChances = Math.min(...peers.map((row) => row.chancesForPerMatch));
  const highestConversion = Math.max(...peers.map((row) => row.goalConversionPerShot));
  return {
    managedClub,
    approach,
    counterPointsPerMatch: counter.pointsPerMatch,
    pointsRank: [...peers].sort((a, b) => b.pointsPerMatch - a.pointsPerMatch).findIndex((row) => row.style === "counter") + 1,
    pointsBehindBest: counter.pointsPerMatch - bestPoints,
    pointsAboveWorst: counter.pointsPerMatch - worstPoints,
    counterChancesPerMatch: counter.chancesForPerMatch,
    counterHasFewestChances: counter.chancesForPerMatch === fewestChances,
    counterGoalConversionPerShot: counter.goalConversionPerShot,
    counterHasHighestGoalConversionPerShot: counter.goalConversionPerShot === highestConversion,
  };
}));
const cautiousComparisons = managedClubs.flatMap((managedClub) => styles.map((style) => {
  const cautious = rows.find((row) => row.managedClub === managedClub && row.style === style && row.approach === "cautious")!;
  const balanced = rows.find((row) => row.managedClub === managedClub && row.style === style && row.approach === "balanced")!;
  return {
    managedClub,
    style,
    cautiousMinusBalanced: {
      pointsPerMatch: cautious.pointsPerMatch - balanced.pointsPerMatch,
      goalsForPerMatch: cautious.goalsForPerMatch - balanced.goalsForPerMatch,
      goalsAgainstPerMatch: cautious.goalsAgainstPerMatch - balanced.goalsAgainstPerMatch,
      chancesForPerMatch: cautious.chancesForPerMatch - balanced.chancesForPerMatch,
      shotsForPerMatch: cautious.shotsForPerMatch - balanced.shotsForPerMatch,
      goalConversionPerShot: cautious.goalConversionPerShot - balanced.goalConversionPerShot,
    },
  };
}));
const elapsedMs = performance.now() - started;
const evidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  purpose: "Gate 1A four-style re-baseline without tuning",
  command,
  gitCommit: provenance.gitCommit,
  dirtyTree: provenance.dirtyTree,
  dirtyFiles: provenance.dirtyFiles,
  engineConfigVersion: ENGINE_CONFIG.version,
  engineConfigHash: ENGINE_CONFIG_HASH,
  squadGenerationVersion: SQUAD_GENERATION_VERSION,
  squadGenerationHash: SQUAD_GENERATION_HASH,
  runtime: {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  controls: {
    seedPool: "tuning-v1",
    seedRange: { start: seeds[0], end: seeds.at(-1), count: seeds.length },
    validationSeedsUsed: false,
    twelveQuestionMatrixRun: false,
    managedClubs: managedClubs.map((club) => ({ club, identity: resolveSquadGeneration(club, 10).identity })),
    styles,
    approaches,
    formation: "4-4-2",
    tackling: "normal",
    opponentStyle: "balanced",
    opponentApproach: "balanced",
    alternatingVenue: "Managed club home on odd seeds and away on even seeds",
    engineOrConfigTuned: false,
  },
  metricDefinitions: {
    conversion: "goalConversionPerShot = managed goals divided by managed shots",
    shotRate: "managed shots divided by managed chances",
    shotAccuracy: "managed shots on target divided by managed shots",
  },
  rows,
  byClub,
  counterComparisons,
  cautiousComparisons,
  performance: {
    elapsedMs,
    simulatedMatches: rows.length * count,
    matchesPerSecond: divide(rows.length * count * 1000, elapsedMs),
  },
  limitations: [
    "This run uses tuning seeds only. The validation seed pool remains sealed.",
    "The 12-question matrix was not run.",
    "Only Northbridge's passing identity and Redmere's direct identity are represented by managed clubs.",
    "No pace-and-finishing-led, poor-retention identity exists in the current four-identity generator, so counter fit can be described but not validated against its intended archetype.",
    "No engine, configuration, identity, approach or style coefficient was changed for this re-baseline.",
  ],
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  gitCommit: evidence.gitCommit,
  dirtyTree: evidence.dirtyTree,
  controls: evidence.controls,
  rows: evidence.rows,
  counterComparisons: evidence.counterComparisons,
  cautiousComparisons: evidence.cautiousComparisons,
  performance: evidence.performance,
}, null, 2));
