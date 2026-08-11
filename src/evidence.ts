import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import { printRunProvenance, readGitProvenance } from "./provenance.js";
import { seedRange, type SeedPoolName } from "./seed-pools.js";
import type { Formation, ScoreState, Style } from "./types.js";

interface Aggregate {
  matches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  homeGoals: number;
  awayGoals: number;
  homeChances: number;
  homeShots: number;
  scorelines: Record<string, number>;
}

interface StateCounter {
  possessions: number;
  progressions: number;
}

function emptyAggregate(): Aggregate {
  return { matches: 0, homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, homeChances: 0, homeShots: 0, scorelines: {} };
}

function emptyStateCounters(): Record<ScoreState, StateCounter> {
  return {
    level: { possessions: 0, progressions: 0 },
    leading: { possessions: 0, progressions: 0 },
    trailing: { possessions: 0, progressions: 0 },
  };
}

function addResult(aggregate: Aggregate, result: ReturnType<typeof simulateMatch>): void {
  const homeGoals = result.home.goals;
  const awayGoals = result.away.goals;
  aggregate.matches += 1;
  aggregate.homeGoals += homeGoals;
  aggregate.awayGoals += awayGoals;
  aggregate.homeChances += result.home.chances;
  aggregate.homeShots += result.home.shots;
  if (homeGoals > awayGoals) aggregate.homeWins += 1;
  else if (homeGoals < awayGoals) aggregate.awayWins += 1;
  else aggregate.draws += 1;
  const key = `${homeGoals}-${awayGoals}`;
  aggregate.scorelines[key] = (aggregate.scorelines[key] ?? 0) + 1;
}

function rates(aggregate: Aggregate) {
  return {
    goalsPerMatch: (aggregate.homeGoals + aggregate.awayGoals) / aggregate.matches,
    homeGoalsPerMatch: aggregate.homeGoals / aggregate.matches,
    awayGoalsPerMatch: aggregate.awayGoals / aggregate.matches,
    homeChancesPerMatch: aggregate.homeChances / aggregate.matches,
    homeShotConversion: aggregate.homeShots === 0 ? 0 : aggregate.homeGoals / aggregate.homeShots,
    homeWinRate: aggregate.homeWins / aggregate.matches,
    drawRate: aggregate.draws / aggregate.matches,
    awayWinRate: aggregate.awayWins / aggregate.matches,
  };
}

function bandCheck(actual: number, min: number, max: number) {
  return { min, max, actual, pass: actual >= min && actual <= max };
}

function poissonProbability(lambda: number, goals: number): number {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) factorial *= value;
  return Math.exp(-lambda) * Math.pow(lambda, goals) / factorial;
}

function poissonDrawRate(homeLambda: number, awayLambda: number): number {
  let rate = 0;
  for (let goals = 0; goals <= 15; goals += 1) rate += poissonProbability(homeLambda, goals) * poissonProbability(awayLambda, goals);
  return rate;
}

const count = Number.parseInt(process.argv[2] ?? `${ENGINE_CONFIG.ciGuardrails.sampleMatches}`, 10);
const pool = (process.argv[3] ?? "tuning") as SeedPoolName;
const outputPath = process.argv[4] ?? "evidence/match-lab-evidence.json";
if (pool !== "tuning" && pool !== "validation") throw new Error(`Unknown seed pool: ${pool}`);
const provenance = readGitProvenance();
printRunProvenance("MATCH LAB EVIDENCE RUN", provenance);
const seeds = seedRange(pool, count);

const baseline = emptyAggregate();
const mirror = emptyAggregate();
const ability = emptyAggregate();
const formationBaseline = emptyAggregate();
const formationCandidates: Record<Formation, Aggregate> = {
  "4-4-2": formationBaseline,
  "4-3-3": emptyAggregate(),
  "4-5-1": emptyAggregate(),
  "3-5-2": emptyAggregate(),
  "5-3-2": emptyAggregate(),
};
const styleBaseline = emptyAggregate();
const styleCandidates: Record<Style, Aggregate> = {
  balanced: styleBaseline,
  passing: emptyAggregate(),
  direct: emptyAggregate(),
  counter: emptyAggregate(),
};
const gameStateCounters = emptyStateCounters();
const scoreStateMinutes = { level: 0, homeLeading: 0, awayLeading: 0 };
const invariantFailingSeeds: number[] = [];
const started = performance.now();
const controlSeeds = ENGINE_CONFIG.squadGeneration.testControlSeeds;

for (const seed of seeds) {
  const baselineResult = simulateMatch({
    seed,
    home: makeTeam("home", 10, {}, { seed: controlSeeds.baseline, identity: "balanced" }),
    away: makeTeam("away", 10, {}, { seed: controlSeeds.baseline, identity: "balanced" }),
  });
  addResult(baseline, baselineResult);
  for (const state of ["level", "leading", "trailing"] as const) {
    gameStateCounters[state].possessions += baselineResult.diagnostics.gameState.attackingState[state].possessions;
    gameStateCounters[state].progressions += baselineResult.diagnostics.gameState.attackingState[state].progressions;
  }
  scoreStateMinutes.level += baselineResult.diagnostics.gameState.scoreStateMinutes.level;
  scoreStateMinutes.homeLeading += baselineResult.diagnostics.gameState.scoreStateMinutes.homeLeading;
  scoreStateMinutes.awayLeading += baselineResult.diagnostics.gameState.scoreStateMinutes.awayLeading;

  const neutralResult = simulateMatch({
    seed,
    neutralVenue: true,
    home: makeTeam("mirror-home", 10, {}, { seed: controlSeeds.mirror, identity: "balanced" }),
    away: makeTeam("mirror-away", 10, {}, { seed: controlSeeds.mirror, identity: "balanced" }),
  });
  addResult(mirror, neutralResult);

  const abilityResult = simulateMatch({
    seed,
    neutralVenue: true,
    home: makeTeam("strong", 14, {}, { seed: controlSeeds.ability, identity: "balanced" }),
    away: makeTeam("weak", 8, {}, { seed: controlSeeds.ability, identity: "balanced" }),
  });
  addResult(ability, abilityResult);

  const formationBaselineResult = simulateMatch({
    seed,
    neutralVenue: true,
    home: makeTeam("formation-home", 10, { formation: "4-4-2" }, { seed: controlSeeds.formation, identity: "balanced" }),
    away: makeTeam("formation-away", 10, { formation: "4-4-2" }, { seed: controlSeeds.formation, identity: "balanced" }),
  });
  addResult(formationBaseline, formationBaselineResult);
  for (const formation of ["4-3-3", "4-5-1", "3-5-2", "5-3-2"] as const) {
    addResult(formationCandidates[formation], simulateMatch({
      seed,
      neutralVenue: true,
      home: makeTeam("formation-home", 10, { formation }, { seed: controlSeeds.formation, identity: "balanced" }),
      away: makeTeam("formation-away", 10, { formation: "4-4-2" }, { seed: controlSeeds.formation, identity: "balanced" }),
    }));
  }

  const styleBaselineResult = simulateMatch({
    seed,
    neutralVenue: true,
    home: makeTeam("style-home", 10, { style: "balanced" }, { seed: controlSeeds.style, identity: "balanced" }),
    away: makeTeam("style-away", 10, { style: "balanced" }, { seed: controlSeeds.style, identity: "balanced" }),
  });
  addResult(styleBaseline, styleBaselineResult);
  for (const style of ["passing", "direct", "counter"] as const) {
    addResult(styleCandidates[style], simulateMatch({
      seed,
      neutralVenue: true,
      home: makeTeam("style-home", 10, { style }, { seed: controlSeeds.style, identity: "balanced" }),
      away: makeTeam("style-away", 10, { style: "balanced" }, { seed: controlSeeds.style, identity: "balanced" }),
    }));
  }

  for (const result of [baselineResult, neutralResult, abilityResult]) {
    for (const stats of [result.home, result.away]) {
      if (!(stats.chances >= stats.shots && stats.shots >= stats.shotsOnTarget && stats.shotsOnTarget >= stats.goals)) {
        invariantFailingSeeds.push(seed);
      }
    }
  }
}

const elapsedMs = performance.now() - started;
const baselineRates = rates(baseline);
const mirrorRates = rates(mirror);
const abilityRates = rates(ability);
const formationBaselineRates = rates(formationBaseline);
const styleBaselineRates = rates(styleBaseline);
const targets = ENGINE_CONFIG.calibrationTargets;
const guardrails = ENGINE_CONFIG.ciGuardrails;
const presenceThresholds = ENGINE_CONFIG.presenceTests;

const formationPresence = Object.fromEntries((["4-3-3", "4-5-1", "3-5-2", "5-3-2"] as Formation[]).map((formation) => {
  const candidateRates = rates(formationCandidates[formation]);
  const goalsScoredDelta = Math.abs(candidateRates.homeGoalsPerMatch - formationBaselineRates.homeGoalsPerMatch);
  const goalsConcededDelta = Math.abs(candidateRates.awayGoalsPerMatch - formationBaselineRates.awayGoalsPerMatch);
  const twoSidedDelta = Math.max(goalsScoredDelta, goalsConcededDelta);
  return [formation, {
    goalsScoredDelta,
    goalsConcededDelta,
    twoSidedDelta,
    minimumDelta: presenceThresholds.formationMinimumGoalRateDelta,
    pass: twoSidedDelta >= presenceThresholds.formationMinimumGoalRateDelta,
    rates: candidateRates,
  }];
}));

const stylePresence = Object.fromEntries((["passing", "direct", "counter"] as Style[]).map((style) => {
  const candidateRates = rates(styleCandidates[style]);
  const chanceRateDelta = Math.abs(candidateRates.homeChancesPerMatch - styleBaselineRates.homeChancesPerMatch);
  const conversionDelta = Math.abs(candidateRates.homeShotConversion - styleBaselineRates.homeShotConversion);
  return [style, {
    chanceRateDelta,
    conversionDelta,
    minimumChanceRateDelta: presenceThresholds.styleMinimumChanceRateDelta,
    minimumConversionDelta: presenceThresholds.styleMinimumConversionDelta,
    pass: chanceRateDelta >= presenceThresholds.styleMinimumChanceRateDelta && conversionDelta >= presenceThresholds.styleMinimumConversionDelta,
    rates: candidateRates,
  }];
}));

const progressionRates = Object.fromEntries((["level", "leading", "trailing"] as ScoreState[]).map((state) => [state, {
  possessions: gameStateCounters[state].possessions,
  progressions: gameStateCounters[state].progressions,
  rate: gameStateCounters[state].possessions === 0 ? null : gameStateCounters[state].progressions / gameStateCounters[state].possessions,
}])) as Record<ScoreState, { possessions: number; progressions: number; rate: number | null }>;
const gameStateOrderingPass = progressionRates.trailing.rate !== null && progressionRates.level.rate !== null && progressionRates.leading.rate !== null
  && progressionRates.trailing.rate > progressionRates.level.rate
  && progressionRates.level.rate > progressionRates.leading.rate;

const expectedPoissonDrawRate = poissonDrawRate(baselineRates.homeGoalsPerMatch, baselineRates.awayGoalsPerMatch);
const drawExcessOverPoisson = baselineRates.drawRate - expectedPoissonDrawRate;

const calibrationChecks = {
  goalsPerMatch: bandCheck(baselineRates.goalsPerMatch, targets.goalsPerMatchMin, targets.goalsPerMatchMax),
  drawRate: bandCheck(baselineRates.drawRate, targets.drawRateMin, targets.drawRateMax),
  homeWinRate: bandCheck(baselineRates.homeWinRate, targets.homeWinRateMin, targets.homeWinRateMax),
};

const ciChecks = {
  goalsPerMatch: bandCheck(baselineRates.goalsPerMatch, guardrails.goalsPerMatchMin, guardrails.goalsPerMatchMax),
  drawRate: bandCheck(baselineRates.drawRate, guardrails.drawRateMin, guardrails.drawRateMax),
  homeWinRate: bandCheck(baselineRates.homeWinRate, guardrails.homeWinRateMin, guardrails.homeWinRateMax),
  mirrorFairness: {
    tolerance: guardrails.mirrorWinRateTolerance,
    actualDifference: Math.abs(mirrorRates.homeWinRate - mirrorRates.awayWinRate),
    pass: Math.abs(mirrorRates.homeWinRate - mirrorRates.awayWinRate) <= guardrails.mirrorWinRateTolerance,
  },
  abilityStrongWinRate: {
    min: guardrails.abilityStrongWinRateMin,
    actual: abilityRates.homeWinRate,
    pass: abilityRates.homeWinRate >= guardrails.abilityStrongWinRateMin,
  },
  abilityWeakWinRate: {
    max: guardrails.abilityWeakWinRateMax,
    actual: abilityRates.awayWinRate,
    pass: abilityRates.awayWinRate <= guardrails.abilityWeakWinRateMax,
  },
  formationPresence: {
    pass: Object.values(formationPresence).every((value) => value.pass),
    failing: Object.entries(formationPresence).filter(([, value]) => !value.pass).map(([formation]) => formation),
  },
  stylePresence: {
    pass: Object.values(stylePresence).every((value) => value.pass),
    failing: Object.entries(stylePresence).filter(([, value]) => !value.pass).map(([style]) => style),
  },
  gameStateOrdering: {
    trailingRate: progressionRates.trailing.rate,
    levelRate: progressionRates.level.rate,
    leadingRate: progressionRates.leading.rate,
    pass: gameStateOrderingPass,
  },
  invariants: {
    failingSeedCount: invariantFailingSeeds.length,
    pass: invariantFailingSeeds.length === 0,
  },
};

const poissonCells = ["0-0", "1-0", "0-1", "1-1", "2-0", "0-2", "2-1", "1-2"];
const poissonReference = Object.fromEntries(poissonCells.map((scoreline) => {
  const [homeText, awayText] = scoreline.split("-");
  const homeGoals = Number(homeText);
  const awayGoals = Number(awayText);
  const observed = (baseline.scorelines[scoreline] ?? 0) / baseline.matches;
  const expected = poissonProbability(baselineRates.homeGoalsPerMatch, homeGoals) * poissonProbability(baselineRates.awayGoalsPerMatch, awayGoals);
  return [scoreline, { observed, expected, delta: observed - expected }];
}));

const simulatedMatches = count * 11;
const evidence = {
  schemaVersion: 5,
  generatedAt: new Date().toISOString(),
  buildVersion: provenance.gitCommit,
  gitCommit: provenance.gitCommit,
  dirtyTree: provenance.dirtyTree,
  engineConfigVersion: ENGINE_CONFIG.version,
  engineConfigHash: ENGINE_CONFIG_HASH,
  command: `npm run evidence -- ${count} ${pool} ${outputPath}`,
  seedPool: pool,
  seedRange: { start: seeds[0], end: seeds.at(-1), count: seeds.length },
  calibrationSource: "02_Research-and-Period-Rules/PERIOD-MATCH-CALIBRATION_v1_2026-08-09.md",
  calibrationTargets: targets,
  ciGuardrails: guardrails,
  calibrationChecks,
  ciChecks,
  presenceThresholds,
  baseline: { ...baselineRates, counts: baseline, scorelineMatrix: baseline.scorelines },
  neutralMirror: { ...mirrorRates, counts: mirror },
  abilitySignal: { ...abilityRates, counts: ability, strongLevel: 14, weakLevel: 8 },
  gameState: {
    progressionProbabilityShift: ENGINE_CONFIG.gameState.progressionProbabilityShift,
    scoreStateMinutes,
    progressionRates,
    independentPoissonDrawRate: expectedPoissonDrawRate,
    observedDrawRate: baselineRates.drawRate,
    drawExcessOverPoisson,
  },
  presence: {
    formation: { baseline: formationBaselineRates, candidates: formationPresence },
    style: { baseline: styleBaselineRates, candidates: stylePresence },
  },
  poissonReference,
  failingSeeds: { invariants: [...new Set(invariantFailingSeeds)].slice(0, 100) },
  performance: {
    elapsedMs,
    simulatedMatches,
    matchesPerSecond: (simulatedMatches / elapsedMs) * 1000,
  },
  limitations: [
    "The sourced goals, draw and home-win bands remain the football calibration targets.",
    "The 20,000-match CI safety bounds include the narrow sampling allowance recorded in Decision 004; a target miss remains visible in calibrationChecks even when ciChecks pass.",
    "Final calibration acceptance is judged on the larger 500,000–1,000,000 tuning-seed run against calibrationTargets, not the buffered CI bounds.",
    "Game-state response is evidenced by trailing > level > leading attacking progression and the observed draw excess over an independent Poisson reference.",
    "Formation and style presence are mechanism-presence checks, not claims that their final magnitudes are balanced.",
    "The 12-question simulation matrix remains blocked pending independent re-review.",
    "Validation seeds remain sealed during tuning.",
  ],
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ buildVersion: evidence.buildVersion, gitCommit: evidence.gitCommit, dirtyTree: evidence.dirtyTree, configHash: ENGINE_CONFIG_HASH, calibrationChecks, ciChecks, gameState: evidence.gameState, performance: evidence.performance }, null, 2));

const failedChecks = Object.entries(ciChecks).filter(([, value]) => !value.pass).map(([name]) => name);
if (failedChecks.length > 0) {
  throw new Error(`Simulation CI safety gate failed: ${failedChecks.join(", ")}. Evidence written to ${outputPath}`);
}
