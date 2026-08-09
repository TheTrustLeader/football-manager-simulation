import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { simulateMatchReference } from "./engine-reference-0.5.1.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import { seedRange } from "./seed-pools.js";

interface Outcome {
  homeGoals: number;
  awayGoals: number;
}

interface Aggregate {
  matches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  homeGoals: number;
  awayGoals: number;
}

interface RunningDifference {
  n: number;
  mean: number;
  m2: number;
}

function emptyAggregate(): Aggregate {
  return { matches: 0, homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0 };
}

function addAggregate(aggregate: Aggregate, outcome: Outcome): void {
  aggregate.matches += 1;
  aggregate.homeGoals += outcome.homeGoals;
  aggregate.awayGoals += outcome.awayGoals;
  if (outcome.homeGoals > outcome.awayGoals) aggregate.homeWins += 1;
  else if (outcome.homeGoals < outcome.awayGoals) aggregate.awayWins += 1;
  else aggregate.draws += 1;
}

function rates(aggregate: Aggregate) {
  return {
    goalsPerMatch: (aggregate.homeGoals + aggregate.awayGoals) / aggregate.matches,
    homeGoalsPerMatch: aggregate.homeGoals / aggregate.matches,
    awayGoalsPerMatch: aggregate.awayGoals / aggregate.matches,
    homeWinRate: aggregate.homeWins / aggregate.matches,
    drawRate: aggregate.draws / aggregate.matches,
    awayWinRate: aggregate.awayWins / aggregate.matches,
  };
}

function addDifference(state: RunningDifference, value: number): void {
  state.n += 1;
  const delta = value - state.mean;
  state.mean += delta / state.n;
  const delta2 = value - state.mean;
  state.m2 += delta * delta2;
}

function differenceSummary(state: RunningDifference) {
  const sampleVariance = state.n > 1 ? state.m2 / (state.n - 1) : 0;
  const standardError = Math.sqrt(sampleVariance / Math.max(1, state.n));
  return {
    difference: state.mean,
    pairedStandardError: standardError,
    zScore: standardError === 0 ? (state.mean === 0 ? 0 : null) : state.mean / standardError,
  };
}

function scoreline(outcome: Outcome): string {
  return `${outcome.homeGoals}-${outcome.awayGoals}`;
}

const count = Number.parseInt(process.argv[2] ?? "50000", 10);
const outputPath = process.argv[3] ?? "evidence/performance-equivalence.json";
if (!Number.isInteger(count) || count <= 0) throw new Error("Equivalence count must be a positive integer");
const seeds = seedRange("tuning", count);

const referenceOutcomes: Outcome[] = new Array(count);
const referenceAggregate = emptyAggregate();
const referenceStarted = performance.now();
for (let index = 0; index < seeds.length; index += 1) {
  const seed = seeds[index]!;
  const result = simulateMatchReference({ seed, home: makeTeam("home", 10), away: makeTeam("away", 10) });
  const outcome = { homeGoals: result.home.goals, awayGoals: result.away.goals };
  referenceOutcomes[index] = outcome;
  addAggregate(referenceAggregate, outcome);
}
const referenceElapsedMs = performance.now() - referenceStarted;

const optimisedAggregate = emptyAggregate();
let changedScorelines = 0;
let maxFinalConditionAbsoluteDelta = 0;
const goalDifference: RunningDifference = { n: 0, mean: 0, m2: 0 };
const homeWinDifference: RunningDifference = { n: 0, mean: 0, m2: 0 };
const drawDifference: RunningDifference = { n: 0, mean: 0, m2: 0 };
const awayWinDifference: RunningDifference = { n: 0, mean: 0, m2: 0 };

const optimisedStarted = performance.now();
for (let index = 0; index < seeds.length; index += 1) {
  const seed = seeds[index]!;
  const reference = referenceOutcomes[index]!;
  const result = simulateMatch({ seed, home: makeTeam("home", 10), away: makeTeam("away", 10) });
  const optimised = { homeGoals: result.home.goals, awayGoals: result.away.goals };
  addAggregate(optimisedAggregate, optimised);
  if (scoreline(reference) !== scoreline(optimised)) changedScorelines += 1;

  addDifference(goalDifference, (optimised.homeGoals + optimised.awayGoals) - (reference.homeGoals + reference.awayGoals));
  addDifference(homeWinDifference, Number(optimised.homeGoals > optimised.awayGoals) - Number(reference.homeGoals > reference.awayGoals));
  addDifference(drawDifference, Number(optimised.homeGoals === optimised.awayGoals) - Number(reference.homeGoals === reference.awayGoals));
  addDifference(awayWinDifference, Number(optimised.homeGoals < optimised.awayGoals) - Number(reference.homeGoals < reference.awayGoals));

  const referenceResult = simulateMatchReference({ seed, home: makeTeam("condition-home", 10), away: makeTeam("condition-away", 10) });
  const optimisedResult = simulateMatch({ seed, home: makeTeam("condition-home", 10), away: makeTeam("condition-away", 10) });
  for (const [playerId, referenceCondition] of Object.entries(referenceResult.finalCondition)) {
    const optimisedCondition = optimisedResult.finalCondition[playerId];
    if (optimisedCondition === undefined) throw new Error(`Missing optimised final condition for ${playerId}`);
    maxFinalConditionAbsoluteDelta = Math.max(maxFinalConditionAbsoluteDelta, Math.abs(optimisedCondition - referenceCondition));
  }
}
const optimisedElapsedMs = performance.now() - optimisedStarted;

const referenceMatchesPerSecond = count / (referenceElapsedMs / 1000);
const optimisedMatchesPerSecond = count / (optimisedElapsedMs / 1000);
const evidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  buildVersion: process.env.GITHUB_SHA ?? "local-uncommitted",
  engineConfigVersion: ENGINE_CONFIG.version,
  engineConfigHash: ENGINE_CONFIG_HASH,
  referenceImplementation: "engine-reference-0.5.1",
  seedPool: "tuning-v1",
  seedRange: { start: seeds[0], end: seeds.at(-1), count: seeds.length },
  scorelineDifferences: {
    count: changedScorelines,
    proportion: changedScorelines / count,
  },
  aggregates: {
    reference: rates(referenceAggregate),
    optimised: rates(optimisedAggregate),
  },
  pairedSamplingError: {
    goalsPerMatch: differenceSummary(goalDifference),
    homeWinRate: differenceSummary(homeWinDifference),
    drawRate: differenceSummary(drawDifference),
    awayWinRate: differenceSummary(awayWinDifference),
  },
  finalCondition: {
    maxAbsoluteDelta: maxFinalConditionAbsoluteDelta,
  },
  performance: {
    referenceElapsedMs,
    optimisedElapsedMs,
    referenceMatchesPerSecond,
    optimisedMatchesPerSecond,
    speedup: optimisedMatchesPerSecond / referenceMatchesPerSecond,
  },
  governance: {
    validationSeedsUsed: false,
    goldenHashUpdated: false,
    note: "This report is mandatory evidence before any golden-output re-recording.",
  },
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evidence, null, 2));
