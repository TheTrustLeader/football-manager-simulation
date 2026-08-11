import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import {
  makeTeam,
  resolveSquadGeneration,
  SQUAD_GENERATION_HASH,
  SQUAD_GENERATION_VERSION,
} from "./fixtures.js";
import { printRunProvenance, readGitProvenance } from "./provenance.js";
import { seedRange } from "./seed-pools.js";
import type { Approach, GoalkeeperAttribute, MatchOutput, OutfieldAttribute, Player, Position, Style, TeamInput } from "./types.js";

interface Aggregate {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  shotsFor: number;
  shotsAgainst: number;
  shotsOnTargetFor: number;
  shotsOnTargetAgainst: number;
  possessionTicksFor: number;
  possessionTicksAgainst: number;
  morePossession: number;
  equalPossession: number;
  minimumPossessionTicks: number;
  maximumPossessionTicks: number;
  possessionTickSumFailures: number;
}

interface TacticalSetup {
  style: Extract<Style, "direct" | "passing">;
  approach: Approach;
}

const outfieldAttributeKeys = ENGINE_CONFIG.squadGeneration.attributeKeys.outfield as readonly OutfieldAttribute[];
const goalkeeperAttributeKeys = ENGINE_CONFIG.squadGeneration.attributeKeys.goalkeeper as readonly GoalkeeperAttribute[];
const hiddenKeys = ["consistency", "injurySusceptibility", "temperament", "adaptability"] as const;
const formationPositionRequirements = ENGINE_CONFIG.squadGeneration.formationPositionRequirements as Record<string, Partial<Record<Position, number>>>;
const setups: TacticalSetup[] = [
  { style: "direct", approach: "attacking" },
  { style: "passing", approach: "attacking" },
  { style: "direct", approach: "balanced" },
  { style: "passing", approach: "balanced" },
  { style: "direct", approach: "cautious" },
  { style: "passing", approach: "cautious" },
];

function emptyAggregate(): Aggregate {
  return {
    matches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    shotsFor: 0,
    shotsAgainst: 0,
    shotsOnTargetFor: 0,
    shotsOnTargetAgainst: 0,
    possessionTicksFor: 0,
    possessionTicksAgainst: 0,
    morePossession: 0,
    equalPossession: 0,
    minimumPossessionTicks: Number.POSITIVE_INFINITY,
    maximumPossessionTicks: Number.NEGATIVE_INFINITY,
    possessionTickSumFailures: 0,
  };
}

function addMatch(aggregate: Aggregate, result: MatchOutput, managedHome: boolean): void {
  const own = managedHome ? result.home : result.away;
  const opposition = managedHome ? result.away : result.home;
  aggregate.matches += 1;
  aggregate.goalsFor += own.goals;
  aggregate.goalsAgainst += opposition.goals;
  aggregate.shotsFor += own.shots;
  aggregate.shotsAgainst += opposition.shots;
  aggregate.shotsOnTargetFor += own.shotsOnTarget;
  aggregate.shotsOnTargetAgainst += opposition.shotsOnTarget;
  aggregate.possessionTicksFor += own.possessionTicks;
  aggregate.possessionTicksAgainst += opposition.possessionTicks;
  aggregate.minimumPossessionTicks = Math.min(aggregate.minimumPossessionTicks, own.possessionTicks);
  aggregate.maximumPossessionTicks = Math.max(aggregate.maximumPossessionTicks, own.possessionTicks);
  if (own.possessionTicks > opposition.possessionTicks) aggregate.morePossession += 1;
  else if (own.possessionTicks === opposition.possessionTicks) aggregate.equalPossession += 1;
  if (own.possessionTicks + opposition.possessionTicks !== ENGINE_CONFIG.matchMinutes) aggregate.possessionTickSumFailures += 1;
  if (own.goals > opposition.goals) aggregate.wins += 1;
  else if (own.goals < opposition.goals) aggregate.losses += 1;
  else aggregate.draws += 1;
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function metrics(aggregate: Aggregate) {
  const totalShots = aggregate.shotsFor + aggregate.shotsAgainst;
  const totalShotsOnTarget = aggregate.shotsOnTargetFor + aggregate.shotsOnTargetAgainst;
  return {
    matches: aggregate.matches,
    goalsPerMatch: divide(aggregate.goalsFor + aggregate.goalsAgainst, aggregate.matches),
    drawRate: divide(aggregate.draws, aggregate.matches),
    shotAccuracy: divide(totalShotsOnTarget, totalShots),
    managed: {
      shotsPerMatch: divide(aggregate.shotsFor, aggregate.matches),
      goalsForPerMatch: divide(aggregate.goalsFor, aggregate.matches),
      goalsAgainstPerMatch: divide(aggregate.goalsAgainst, aggregate.matches),
      pointsPerMatch: divide(aggregate.wins * 3 + aggregate.draws, aggregate.matches),
      shotAccuracy: divide(aggregate.shotsOnTargetFor, aggregate.shotsFor),
      possessionPercent: divide(aggregate.possessionTicksFor * 100, aggregate.matches * ENGINE_CONFIG.matchMinutes),
      morePossessionRate: divide(aggregate.morePossession, aggregate.matches),
      equalPossessionRate: divide(aggregate.equalPossession, aggregate.matches),
      minimumPossessionPercent: divide(aggregate.minimumPossessionTicks * 100, ENGINE_CONFIG.matchMinutes),
      maximumPossessionPercent: divide(aggregate.maximumPossessionTicks * 100, ENGINE_CONFIG.matchMinutes),
    },
    opposition: {
      shotsPerMatch: divide(aggregate.shotsAgainst, aggregate.matches),
      shotAccuracy: divide(aggregate.shotsOnTargetAgainst, aggregate.shotsAgainst),
      possessionPercent: divide(aggregate.possessionTicksAgainst * 100, aggregate.matches * ENGINE_CONFIG.matchMinutes),
    },
    possessionTickSumFailures: aggregate.possessionTickSumFailures,
    counts: aggregate,
  };
}

function playSeed(seed: number, northbridge: TeamInput, redmere: TeamInput): { result: MatchOutput; managedHome: boolean } {
  const managedHome = seed % 2 === 1;
  return {
    managedHome,
    result: simulateMatch({
      seed,
      home: managedHome ? northbridge : redmere,
      away: managedHome ? redmere : northbridge,
    }),
  };
}

function range(values: number[]) {
  return { minimum: Math.min(...values), maximum: Math.max(...values) };
}

function playerSummary(player: Player) {
  return {
    id: player.id,
    name: player.name,
    age: player.age,
    position: player.primaryPosition,
    attributes: player.attributes,
    hidden: player.hidden,
  };
}

function squadEvidence(id: string) {
  const team = makeTeam(id, 10);
  const outfield = team.starters.filter((player) => player.primaryPosition !== "GK");
  const roster = [...team.starters, ...team.substitutes];
  const outfieldRoster = roster.filter((player) => player.primaryPosition !== "GK");
  const goalkeepers = roster.filter((player) => player.primaryPosition === "GK");
  const outfieldAttributeMeans = Object.fromEntries(outfieldAttributeKeys.map((key) => [
    key,
    divide(outfield.reduce((total, player) => total + player.attributes[key], 0), outfield.length),
  ]));
  const goalkeeperAttributeMeans = Object.fromEntries(goalkeeperAttributeKeys.map((key) => [
    key,
    divide(goalkeepers.reduce((total, player) => total + player.attributes[key], 0), goalkeepers.length),
  ]));
  const hiddenRanges = Object.fromEntries(hiddenKeys.map((key) => [key, range(roster.map((player) => player.hidden[key]))]));
  const positionCounts = Object.fromEntries((["GK", "CB", "FB", "CM", "WM", "FW"] as Position[]).map((position) => [
    position,
    roster.filter((player) => player.primaryPosition === position).length,
  ]));
  const formationCoverage = Object.fromEntries(Object.entries(formationPositionRequirements).map(([formation, requirements]) => [
    formation,
    Object.entries(requirements).every(([position, required]) => (positionCounts[position] ?? 0) >= required + 1),
  ]));
  return {
    generation: resolveSquadGeneration(id, 10),
    outfieldAttributeMeans,
    goalkeeperAttributeMeans,
    hiddenRanges,
    positionCounts,
    formationCoverageWithNaturalPositionSubstitute: formationCoverage,
    outfieldRosterAttributeCount: outfieldRoster.map((player) => Object.keys(player.attributes).length),
    goalkeeperAttributeCount: goalkeepers.map((player) => Object.keys(player.attributes).length),
    starters: team.starters.map(playerSummary),
    substitutes: team.substitutes.map(playerSummary),
  };
}

const count = Number.parseInt(process.argv[2] ?? "30000", 10);
const outputPath = process.argv[3] ?? "evidence/gate-1a-squad-variation-rebaseline.json";
if (!Number.isInteger(count) || count <= 0) throw new Error("Match count must be a positive integer");
const command = process.argv[1]?.endsWith(".js")
  ? `node dist/src/gate-1a-squad-variation-evidence.js ${count} ${outputPath}`
  : `npm run gate1a:evidence -- ${count} ${outputPath}`;
const seeds = seedRange("tuning", count);
const provenance = readGitProvenance();
printRunProvenance("GATE 1A SQUAD VARIATION RE-BASELINE", provenance);

const baseline = emptyAggregate();
const baselineNorthbridge = makeTeam("northbridge", 10);
const baselineRedmere = makeTeam("redmere", 10);
const setupAggregates = Object.fromEntries(setups.map((setup) => [`${setup.style}/${setup.approach}`, emptyAggregate()])) as Record<string, Aggregate>;
const setupTeams = Object.fromEntries(setups.map((setup) => [
  `${setup.style}/${setup.approach}`,
  makeTeam("northbridge", 10, {
    formation: "4-4-2",
    style: setup.style,
    approach: setup.approach,
    tackling: "normal",
  }),
])) as Record<string, TeamInput>;
const started = performance.now();

for (const seed of seeds) {
  const baselineMatch = playSeed(seed, baselineNorthbridge, baselineRedmere);
  addMatch(baseline, baselineMatch.result, baselineMatch.managedHome);
  for (const setup of setups) {
    const key = `${setup.style}/${setup.approach}`;
    const setupMatch = playSeed(seed, setupTeams[key]!, baselineRedmere);
    addMatch(setupAggregates[key]!, setupMatch.result, setupMatch.managedHome);
  }
}

const elapsedMs = performance.now() - started;
const simulatedMatches = count * (1 + setups.length);
const sixSetupTable = setups.map((setup) => {
  const key = `${setup.style}/${setup.approach}`;
  return { setup: key, style: setup.style, approach: setup.approach, ...metrics(setupAggregates[key]!) };
});
const evidence = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  purpose: "Gate 1A item 1 squad-variation re-baseline and REVIEW-006 section 2 six-setup replay",
  command,
  gitCommit: provenance.gitCommit,
  dirtyTree: provenance.dirtyTree,
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
    alternatingVenue: "Northbridge home on odd seeds and away on even seeds",
    engineTuned: false,
    conditionOrFatigueChanged: false,
  },
  inputs: {
    level: 10,
    baseline: {
      northbridgeTactics: baselineNorthbridge.tactics,
      redmereTactics: baselineRedmere.tactics,
    },
    sixSetupControls: {
      formation: "4-4-2",
      tackling: "normal",
      redmereTactics: baselineRedmere.tactics,
    },
    squads: {
      northbridge: squadEvidence("northbridge"),
      redmere: squadEvidence("redmere"),
    },
  },
  baseline: metrics(baseline),
  sixSetupTable,
  performance: {
    elapsedMs,
    simulatedMatches,
    matchesPerSecond: divide(simulatedMatches * 1000, elapsedMs),
  },
  limitations: [
    "This run uses tuning seeds only. The validation seed pool remains sealed.",
    "The 12-question matrix was not run.",
    "Figures are observations after squad variation and the D1 goalkeeper-curve repair; no tuning or threshold change was made.",
    "H3 perceptibility was not rerun because it is outside this bounded Gate 1A item.",
  ],
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  gitCommit: evidence.gitCommit,
  dirtyTree: evidence.dirtyTree,
  engineConfigHash: evidence.engineConfigHash,
  squadGenerationHash: evidence.squadGenerationHash,
  seedRange: evidence.controls.seedRange,
  baseline: evidence.baseline,
  sixSetupTable: evidence.sixSetupTable,
  performance: evidence.performance,
}, null, 2));
