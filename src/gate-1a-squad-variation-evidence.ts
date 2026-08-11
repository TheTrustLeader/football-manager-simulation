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
import { readParityCompensationState } from "./gate-1a-compensation-state.js";
import { printRunProvenance, readEvidenceProvenance } from "./provenance.js";
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

type ManagedClub = "northbridge" | "redmere";

const outfieldAttributeKeys = ENGINE_CONFIG.squadGeneration.attributeKeys.outfield as readonly OutfieldAttribute[];
const goalkeeperAttributeKeys = ENGINE_CONFIG.squadGeneration.attributeKeys.goalkeeper as readonly GoalkeeperAttribute[];
const hiddenKeys = ["consistency", "injurySusceptibility", "temperament", "potential", "adaptability"] as const;
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

function pointsPerMatch(aggregate: Aggregate): number {
  return divide(aggregate.wins * 3 + aggregate.draws, aggregate.matches);
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
const managedClub = (process.argv[4] ?? "northbridge") as ManagedClub;
const opponentClub: ManagedClub = managedClub === "northbridge" ? "redmere" : "northbridge";
const outputPath = process.argv[3] ?? `evidence/gate-1a-${managedClub}-managed.json`;
if (!Number.isInteger(count) || count <= 0) throw new Error("Match count must be a positive integer");
if (managedClub !== "northbridge" && managedClub !== "redmere") throw new Error("Managed club must be northbridge or redmere");
const command = process.argv[1]?.endsWith(".js")
  ? `node dist/src/gate-1a-squad-variation-evidence.js ${count} ${outputPath} ${managedClub}`
  : `npm run gate1a:evidence -- ${count} ${outputPath} ${managedClub}`;
const seeds = seedRange("tuning", count);
const provenance = readEvidenceProvenance();
printRunProvenance(`GATE 1A ${managedClub.toUpperCase()} MANAGED`, provenance);

const baseline = emptyAggregate();
const baselineManaged = makeTeam(managedClub, 10);
const baselineOpponent = makeTeam(opponentClub, 10);
const setupAggregates = Object.fromEntries(setups.map((setup) => [`${setup.style}/${setup.approach}`, emptyAggregate()])) as Record<string, Aggregate>;
const setupTeams = Object.fromEntries(setups.map((setup) => [
  `${setup.style}/${setup.approach}`,
  makeTeam(managedClub, 10, {
    formation: "4-4-2",
    style: setup.style,
    approach: setup.approach,
    tackling: "normal",
  }),
])) as Record<string, TeamInput>;
const started = performance.now();

for (const seed of seeds) {
  const baselineMatch = playSeed(seed, baselineManaged, baselineOpponent);
  addMatch(baseline, baselineMatch.result, baselineMatch.managedHome);
  for (const setup of setups) {
    const key = `${setup.style}/${setup.approach}`;
    const setupMatch = playSeed(seed, setupTeams[key]!, baselineOpponent);
    addMatch(setupAggregates[key]!, setupMatch.result, setupMatch.managedHome);
  }
}

const elapsedMs = performance.now() - started;
const simulatedMatches = count * (1 + setups.length);
const sixSetupTable = setups.map((setup) => {
  const key = `${setup.style}/${setup.approach}`;
  return { setup: key, style: setup.style, approach: setup.approach, ...metrics(setupAggregates[key]!) };
});
const setupByKey = Object.fromEntries(sixSetupTable.map((row) => [row.setup, row])) as Record<string, (typeof sixSetupTable)[number]>;
const expectedStyle = resolveSquadGeneration(managedClub, 10).identity === "passing" ? "passing" : "direct";
const otherStyle = expectedStyle === "passing" ? "direct" : "passing";
const styleFitComparisons = (["attacking", "balanced", "cautious"] as Approach[]).map((approach) => ({
  approach,
  expectedStyle,
  expectedStylePointsPerMatch: setupByKey[`${expectedStyle}/${approach}`]!.managed.pointsPerMatch,
  otherStylePointsPerMatch: setupByKey[`${otherStyle}/${approach}`]!.managed.pointsPerMatch,
  expectedMinusOther: setupByKey[`${expectedStyle}/${approach}`]!.managed.pointsPerMatch
    - setupByKey[`${otherStyle}/${approach}`]!.managed.pointsPerMatch,
}));
const approachBestByStyle = (["direct", "passing"] as const).map((style) => {
  const rows = sixSetupTable.filter((row) => row.style === style);
  const best = rows.reduce((winner, row) => row.managed.pointsPerMatch > winner.managed.pointsPerMatch ? row : winner);
  return { style, bestApproach: best.approach, bestPointsPerMatch: best.managed.pointsPerMatch };
});
const riskReward = (["direct", "passing"] as const).map((style) => {
  const attacking = setupByKey[`${style}/attacking`]!;
  const cautious = setupByKey[`${style}/cautious`]!;
  const goalsForDelta = attacking.managed.goalsForPerMatch - cautious.managed.goalsForPerMatch;
  const goalsAgainstDelta = attacking.managed.goalsAgainstPerMatch - cautious.managed.goalsAgainstPerMatch;
  return {
    style,
    attackingMinusCautious: { goalsForPerMatch: goalsForDelta, goalsAgainstPerMatch: goalsAgainstDelta },
    pass: goalsForDelta >= ENGINE_CONFIG.approachAcceptance.minimumAttackingVsCautiousGoalsForPerMatchDelta
      && goalsAgainstDelta >= ENGINE_CONFIG.approachAcceptance.minimumAttackingVsCautiousGoalsAgainstPerMatchDelta,
  };
});
const compensationState = readParityCompensationState();
const evidence = {
  schemaVersion: 5,
  generatedAt: new Date().toISOString(),
  purpose: `Gate 1A squad-variation baseline with ${managedClub} managed after DECISION-001 D8 deferral`,
  command,
  gitCommit: provenance.gitCommit,
  dirtyTree: provenance.dirtyTree,
  dirtyFiles: provenance.dirtyFiles,
  compensationState,
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
    managedClub,
    managedClubIdentity: resolveSquadGeneration(managedClub, 10).identity,
    opponentClub,
    opponentClubIdentity: resolveSquadGeneration(opponentClub, 10).identity,
    alternatingVenue: `${managedClub} home on odd seeds and away on even seeds`,
    approachRiskRewardChanged: true,
    identityGenerationChanged: true,
    styleFitCoefficientsChanged: false,
    conditionOrFatigueChanged: false,
    ageCurvesApplied: false,
  },
  inputs: {
    level: 10,
    baseline: {
      managedClub,
      managedClubTactics: baselineManaged.tactics,
      opponentClub,
      opponentClubTactics: baselineOpponent.tactics,
    },
    sixSetupControls: {
      formation: "4-4-2",
      tackling: "normal",
      opponentTactics: baselineOpponent.tactics,
    },
    squads: {
      northbridge: squadEvidence("northbridge"),
      redmere: squadEvidence("redmere"),
    },
  },
  baseline: metrics(baseline),
  sixSetupTable,
  styleFitComparisons,
  directionalStyleFitPass: styleFitComparisons.every((row) => row.expectedMinusOther > 0),
  approachRiskReward: {
    acceptance: ENGINE_CONFIG.approachAcceptance,
    comparisons: riskReward,
    pass: riskReward.every((row) => row.pass),
    bestByStyle: approachBestByStyle,
  },
  ageCurveSeam: {
    applicationPoint: ENGINE_CONFIG.ageCurves.applicationPoint,
    attributesConstantDuringMatch: ENGINE_CONFIG.ageCurves.attributesConstantDuringMatch,
    appliedByThisBuild: false,
  },
  calibrationBandProvenance: {
    band: { goalsPerMatchMinimum: 2.4, goalsPerMatchMaximum: 2.7 },
    projectRecord: "02_Research-and-Period-Rules/PERIOD-MATCH-CALIBRATION_v1_2026-08-09.md",
    source: "RSSSF Football Statistics Archive English Division One tables for 1987-88, 1988-89 and 1989-90",
    derivation: "The project record derives 2,997 goals in 1,180 matches, or 2.54 per match, then sets the broad 2.4-2.7 initial calibration band.",
    isSpecificToEnglishLeagueFootball1988_89: false,
    season1988_89ObservedRate: "962 goals in 380 matches, or 2.5316 per match",
    status: "Broad three-season calibration anchor; not a 1988-89-specific band and not adjusted by this build.",
  },
  performance: {
    elapsedMs,
    simulatedMatches,
    matchesPerSecond: divide(simulatedMatches * 1000, elapsedMs),
  },
  limitations: [
    "This run uses tuning seeds only. The validation seed pool remains sealed.",
    "The 12-question matrix was not run.",
    "The superseded single-club identity-parity control is not run or reported. The paired estimator is the sole D8 measurement instrument.",
    "Identity compensation is removed. The remaining paired identity gaps are recorded and deferred by DECISION-001, with no parity tolerance configured.",
    "Age curves are configuration only and are not applied in a match or elsewhere by this build.",
    "H3 perceptibility was not rerun because it is outside this bounded Gate 1A item.",
  ],
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  gitCommit: evidence.gitCommit,
  dirtyTree: evidence.dirtyTree,
  compensationState: evidence.compensationState,
  engineConfigHash: evidence.engineConfigHash,
  squadGenerationHash: evidence.squadGenerationHash,
  seedRange: evidence.controls.seedRange,
  baseline: evidence.baseline,
  sixSetupTable: evidence.sixSetupTable,
  directionalStyleFitPass: evidence.directionalStyleFitPass,
  approachRiskReward: evidence.approachRiskReward,
  performance: evidence.performance,
}, null, 2));
