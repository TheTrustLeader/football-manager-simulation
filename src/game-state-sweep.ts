import { ENGINE_CONFIG } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
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

const count = Number.parseInt(process.argv[2] ?? "10000", 10);
const seeds = seedRange("tuning", count);
const mutable = ENGINE_CONFIG as unknown as { gameState: { progressionProbabilityShift: number } };
const originalShift = mutable.gameState.progressionProbabilityShift;
const shifts = [0, 0.02, 0.04, 0.06, 0.08, 0.1];
const output: unknown[] = [];

try {
  for (const progressionProbabilityShift of shifts) {
    mutable.gameState.progressionProbabilityShift = progressionProbabilityShift;
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    let homeGoals = 0;
    let awayGoals = 0;
    const state = {
      level: { possessions: 0, progressions: 0 },
      leading: { possessions: 0, progressions: 0 },
      trailing: { possessions: 0, progressions: 0 },
    } satisfies Record<ScoreState, { possessions: number; progressions: number }>;

    for (const seed of seeds) {
      const result = simulateMatch({ seed, home: makeTeam("sweep-home", 10), away: makeTeam("sweep-away", 10) });
      homeGoals += result.home.goals;
      awayGoals += result.away.goals;
      if (result.home.goals > result.away.goals) homeWins += 1;
      else if (result.home.goals < result.away.goals) awayWins += 1;
      else draws += 1;
      for (const scoreState of ["level", "leading", "trailing"] as const) {
        state[scoreState].possessions += result.diagnostics.gameState.attackingState[scoreState].possessions;
        state[scoreState].progressions += result.diagnostics.gameState.attackingState[scoreState].progressions;
      }
    }

    const homeGoalsPerMatch = homeGoals / count;
    const awayGoalsPerMatch = awayGoals / count;
    const goalsPerMatch = homeGoalsPerMatch + awayGoalsPerMatch;
    const drawRate = draws / count;
    const homeWinRate = homeWins / count;
    const awayWinRate = awayWins / count;
    const expectedPoissonDrawRate = poissonDrawRate(homeGoalsPerMatch, awayGoalsPerMatch);
    const progressionRates = Object.fromEntries((["level", "leading", "trailing"] as ScoreState[]).map((scoreState) => [scoreState, {
      possessions: state[scoreState].possessions,
      progressions: state[scoreState].progressions,
      rate: state[scoreState].possessions === 0 ? null : state[scoreState].progressions / state[scoreState].possessions,
    }]));

    output.push({
      progressionProbabilityShift,
      goalsPerMatch,
      homeGoalsPerMatch,
      awayGoalsPerMatch,
      homeWinRate,
      drawRate,
      awayWinRate,
      expectedPoissonDrawRate,
      drawExcessOverPoisson: drawRate - expectedPoissonDrawRate,
      progressionRates,
      withinSourcedTargets:
        goalsPerMatch >= ENGINE_CONFIG.calibrationTargets.goalsPerMatchMin &&
        goalsPerMatch <= ENGINE_CONFIG.calibrationTargets.goalsPerMatchMax &&
        drawRate >= ENGINE_CONFIG.calibrationTargets.drawRateMin &&
        drawRate <= ENGINE_CONFIG.calibrationTargets.drawRateMax &&
        homeWinRate >= ENGINE_CONFIG.calibrationTargets.homeWinRateMin &&
        homeWinRate <= ENGINE_CONFIG.calibrationTargets.homeWinRateMax,
    });
  }
} finally {
  mutable.gameState.progressionProbabilityShift = originalShift;
}

console.log(JSON.stringify({
  seedPool: "tuning-v1",
  seedRange: { start: seeds[0], end: seeds.at(-1), count: seeds.length },
  fixedParameters: {
    goalBase: ENGINE_CONFIG.goal.base,
    homeProgressionProbabilityBoost: ENGINE_CONFIG.homeAdvantage.homeProgressionProbabilityBoost,
    fatigueBaseConditionLossPerMinute: ENGINE_CONFIG.fatigue.baseConditionLossPerMinute,
  },
  results: output,
}, null, 2));
