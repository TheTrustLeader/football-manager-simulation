import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import { printRunProvenance, readEvidenceProvenance } from "./provenance.js";
import { seedRange } from "./seed-pools.js";
import type { ScoreState } from "./types.js";

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

const count = Number.parseInt(process.argv[2] ?? "500000", 10);
const outputPath = process.argv[3] ?? "evidence/game-state-full-evidence.json";
if (!Number.isInteger(count) || count < 500000 || count > 1000000) throw new Error("Game-state evidence count must be between 500,000 and 1,000,000 tuning seeds");
const provenance = readEvidenceProvenance();
printRunProvenance("GAME-STATE EVIDENCE RUN", provenance);
const seeds = seedRange("tuning", count);

let homeWins = 0;
let draws = 0;
let awayWins = 0;
let homeGoals = 0;
let awayGoals = 0;
const scoreStateMinutes = { level: 0, homeLeading: 0, awayLeading: 0 };
const state = {
  level: { possessions: 0, progressions: 0 },
  leading: { possessions: 0, progressions: 0 },
  trailing: { possessions: 0, progressions: 0 },
} satisfies Record<ScoreState, { possessions: number; progressions: number }>;

const started = performance.now();
for (const seed of seeds) {
  const result = simulateMatch({ seed, home: makeTeam("game-state-home", 10), away: makeTeam("game-state-away", 10) });
  homeGoals += result.home.goals;
  awayGoals += result.away.goals;
  if (result.home.goals > result.away.goals) homeWins += 1;
  else if (result.home.goals < result.away.goals) awayWins += 1;
  else draws += 1;

  scoreStateMinutes.level += result.diagnostics.gameState.scoreStateMinutes.level;
  scoreStateMinutes.homeLeading += result.diagnostics.gameState.scoreStateMinutes.homeLeading;
  scoreStateMinutes.awayLeading += result.diagnostics.gameState.scoreStateMinutes.awayLeading;
  for (const scoreState of ["level", "leading", "trailing"] as const) {
    state[scoreState].possessions += result.diagnostics.gameState.attackingState[scoreState].possessions;
    state[scoreState].progressions += result.diagnostics.gameState.attackingState[scoreState].progressions;
  }
}
const elapsedMs = performance.now() - started;

const homeGoalsPerMatch = homeGoals / count;
const awayGoalsPerMatch = awayGoals / count;
const goalsPerMatch = homeGoalsPerMatch + awayGoalsPerMatch;
const homeWinRate = homeWins / count;
const drawRate = draws / count;
const awayWinRate = awayWins / count;
const expectedPoissonDrawRate = poissonDrawRate(homeGoalsPerMatch, awayGoalsPerMatch);
const drawExcessOverPoisson = drawRate - expectedPoissonDrawRate;
const progressionRates = Object.fromEntries((["level", "leading", "trailing"] as ScoreState[]).map((scoreState) => [scoreState, {
  possessions: state[scoreState].possessions,
  progressions: state[scoreState].progressions,
  rate: state[scoreState].possessions === 0 ? null : state[scoreState].progressions / state[scoreState].possessions,
}])) as Record<ScoreState, { possessions: number; progressions: number; rate: number | null }>;

const targets = ENGINE_CONFIG.calibrationTargets;
const checks = {
  goalsPerMatch: { actual: goalsPerMatch, min: targets.goalsPerMatchMin, max: targets.goalsPerMatchMax, pass: goalsPerMatch >= targets.goalsPerMatchMin && goalsPerMatch <= targets.goalsPerMatchMax },
  drawRate: { actual: drawRate, min: targets.drawRateMin, max: targets.drawRateMax, pass: drawRate >= targets.drawRateMin && drawRate <= targets.drawRateMax },
  homeWinRate: { actual: homeWinRate, min: targets.homeWinRateMin, max: targets.homeWinRateMax, pass: homeWinRate >= targets.homeWinRateMin && homeWinRate <= targets.homeWinRateMax },
  progressionOrdering: {
    trailing: progressionRates.trailing.rate,
    level: progressionRates.level.rate,
    leading: progressionRates.leading.rate,
    pass: progressionRates.trailing.rate !== null && progressionRates.level.rate !== null && progressionRates.leading.rate !== null
      && progressionRates.trailing.rate > progressionRates.level.rate
      && progressionRates.level.rate > progressionRates.leading.rate,
  },
  drawExcessOverPoisson: {
    actual: drawExcessOverPoisson,
    minimumMaterialExcess: 0.01,
    pass: drawExcessOverPoisson >= 0.01,
  },
};

const preGameStateReference = {
  source: "Decision 005 / EVIDENCE-REVIEW-002-STEPS-1-3_2026-08-09.zip",
  engineConfigVersion: "match-engine-config-0.6.3",
  matches: 500000,
  goalsPerMatch: 2.502084,
  homeWinRate: 0.411358,
  drawRate: 0.267152,
  independentPoissonDrawRate: 0.26845691,
  drawExcessOverPoisson: -0.00130491,
};

const evidence = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  buildVersion: provenance.gitCommit,
  gitCommit: provenance.gitCommit,
  dirtyTree: provenance.dirtyTree,
  dirtyFiles: provenance.dirtyFiles,
  engineConfigVersion: ENGINE_CONFIG.version,
  engineConfigHash: ENGINE_CONFIG_HASH,
  command: `npm run game-state:evidence -- ${count} ${outputPath}`,
  seedGovernance: {
    pool: "tuning-v1",
    seedRange: { start: seeds[0], end: seeds.at(-1), count: seeds.length },
    validationSeedsUsed: false,
    twelveQuestionMatrixRun: false,
  },
  mechanism: {
    progressionProbabilityShift: ENGINE_CONFIG.gameState.progressionProbabilityShift,
    homeProgressionProbabilityBoost: ENGINE_CONFIG.homeAdvantage.homeProgressionProbabilityBoost,
    scoreStateMinutes,
    progressionRates,
  },
  aggregate: {
    goalsPerMatch,
    homeGoalsPerMatch,
    awayGoalsPerMatch,
    homeWinRate,
    drawRate,
    awayWinRate,
    independentPoissonDrawRate: expectedPoissonDrawRate,
    drawExcessOverPoisson,
  },
  checks,
  preGameStateReference,
  changeFrom0_6_3: {
    goalsPerMatch: goalsPerMatch - preGameStateReference.goalsPerMatch,
    homeWinRate: homeWinRate - preGameStateReference.homeWinRate,
    drawRate: drawRate - preGameStateReference.drawRate,
    drawExcessOverPoisson: drawExcessOverPoisson - preGameStateReference.drawExcessOverPoisson,
  },
  performance: {
    elapsedMs,
    matchesPerSecond: count / (elapsedMs / 1000),
  },
  limitations: [
    "This is the isolated game-state evidence sample, not the prohibited 12-question matrix.",
    "All seeds are tuning-v1; the validation pool remains sealed.",
    "The full REVIEW-002 rerun is a separate evidence file and remains required after the match-loop change.",
    "The 1 percentage-point minimum draw excess is an evidence threshold chosen before this clean 500,000-match run to distinguish a material correlation from sampling noise.",
  ],
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify(evidence, null, 2));

const failed = Object.entries(checks).filter(([, check]) => !check.pass).map(([name]) => name);
if (failed.length > 0) throw new Error(`Game-state full evidence failed: ${failed.join(", ")}`);
