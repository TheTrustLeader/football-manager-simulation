import { ENGINE_CONFIG } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import { seedRange } from "./seed-pools.js";

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
const mutable = ENGINE_CONFIG as unknown as { homeAdvantage: { homeProgressionProbabilityBoost: number } };
const originalBoost = mutable.homeAdvantage.homeProgressionProbabilityBoost;
const boosts = [0.063, 0.07, 0.075, 0.08, 0.085, 0.09];
const output: unknown[] = [];

try {
  for (const homeProgressionProbabilityBoost of boosts) {
    mutable.homeAdvantage.homeProgressionProbabilityBoost = homeProgressionProbabilityBoost;
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    let homeGoals = 0;
    let awayGoals = 0;
    let levelPossessions = 0;
    let levelProgressions = 0;
    let leadingPossessions = 0;
    let leadingProgressions = 0;
    let trailingPossessions = 0;
    let trailingProgressions = 0;

    for (const seed of seeds) {
      const result = simulateMatch({ seed, home: makeTeam("home-sweep", 10), away: makeTeam("away-sweep", 10) });
      homeGoals += result.home.goals;
      awayGoals += result.away.goals;
      if (result.home.goals > result.away.goals) homeWins += 1;
      else if (result.home.goals < result.away.goals) awayWins += 1;
      else draws += 1;
      levelPossessions += result.diagnostics.gameState.attackingState.level.possessions;
      levelProgressions += result.diagnostics.gameState.attackingState.level.progressions;
      leadingPossessions += result.diagnostics.gameState.attackingState.leading.possessions;
      leadingProgressions += result.diagnostics.gameState.attackingState.leading.progressions;
      trailingPossessions += result.diagnostics.gameState.attackingState.trailing.possessions;
      trailingProgressions += result.diagnostics.gameState.attackingState.trailing.progressions;
    }

    const homeGoalsPerMatch = homeGoals / count;
    const awayGoalsPerMatch = awayGoals / count;
    const goalsPerMatch = homeGoalsPerMatch + awayGoalsPerMatch;
    const homeWinRate = homeWins / count;
    const drawRate = draws / count;
    const awayWinRate = awayWins / count;
    const expectedPoissonDrawRate = poissonDrawRate(homeGoalsPerMatch, awayGoalsPerMatch);
    output.push({
      homeProgressionProbabilityBoost,
      goalsPerMatch,
      homeGoalsPerMatch,
      awayGoalsPerMatch,
      homeWinRate,
      drawRate,
      awayWinRate,
      expectedPoissonDrawRate,
      drawExcessOverPoisson: drawRate - expectedPoissonDrawRate,
      progressionRates: {
        level: levelProgressions / levelPossessions,
        leading: leadingProgressions / leadingPossessions,
        trailing: trailingProgressions / trailingPossessions,
      },
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
  mutable.homeAdvantage.homeProgressionProbabilityBoost = originalBoost;
}

console.log(JSON.stringify({
  seedPool: "tuning-v1",
  seedRange: { start: seeds[0], end: seeds.at(-1), count: seeds.length },
  fixedGameStateProgressionProbabilityShift: ENGINE_CONFIG.gameState.progressionProbabilityShift,
  results: output,
}, null, 2));
