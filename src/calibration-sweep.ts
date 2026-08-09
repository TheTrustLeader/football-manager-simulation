import { ENGINE_CONFIG } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import { seedRange } from "./seed-pools.js";

const mutableConfig = ENGINE_CONFIG as unknown as {
  goal: { base: number };
  homeAdvantage: { homeProgressionProbabilityBoost: number };
};

const count = Number.parseInt(process.argv[2] ?? "10000", 10);
const seeds = seedRange("tuning", count);
const originalGoalBase = mutableConfig.goal.base;
const originalHomeBoost = mutableConfig.homeAdvantage.homeProgressionProbabilityBoost;
const goalBases = [0.2875, 0.29, 0.2925, 0.295];
const homeBoosts = [0.05, 0.055, 0.06, 0.065];
const results: unknown[] = [];

try {
  for (const goalBase of goalBases) {
    for (const homeProgressionProbabilityBoost of homeBoosts) {
      mutableConfig.goal.base = goalBase;
      mutableConfig.homeAdvantage.homeProgressionProbabilityBoost = homeProgressionProbabilityBoost;
      let homeWins = 0;
      let draws = 0;
      let awayWins = 0;
      let homeGoals = 0;
      let awayGoals = 0;
      for (const seed of seeds) {
        const result = simulateMatch({ seed, home: makeTeam("sweep-home", 10), away: makeTeam("sweep-away", 10) });
        homeGoals += result.home.goals;
        awayGoals += result.away.goals;
        if (result.home.goals > result.away.goals) homeWins += 1;
        else if (result.home.goals < result.away.goals) awayWins += 1;
        else draws += 1;
      }
      const rates = {
        goalBase,
        homeProgressionProbabilityBoost,
        goalsPerMatch: (homeGoals + awayGoals) / count,
        homeGoalsPerMatch: homeGoals / count,
        awayGoalsPerMatch: awayGoals / count,
        homeWinRate: homeWins / count,
        drawRate: draws / count,
        awayWinRate: awayWins / count,
      };
      results.push({
        ...rates,
        withinSourcedBands:
          rates.goalsPerMatch >= ENGINE_CONFIG.ciGuardrails.goalsPerMatchMin &&
          rates.goalsPerMatch <= ENGINE_CONFIG.ciGuardrails.goalsPerMatchMax &&
          rates.homeWinRate >= ENGINE_CONFIG.ciGuardrails.homeWinRateMin &&
          rates.homeWinRate <= ENGINE_CONFIG.ciGuardrails.homeWinRateMax &&
          rates.drawRate >= ENGINE_CONFIG.ciGuardrails.drawRateMin &&
          rates.drawRate <= ENGINE_CONFIG.ciGuardrails.drawRateMax,
      });
    }
  }
} finally {
  mutableConfig.goal.base = originalGoalBase;
  mutableConfig.homeAdvantage.homeProgressionProbabilityBoost = originalHomeBoost;
}

console.log(JSON.stringify({ seedPool: "tuning-v1", seedRange: { start: seeds[0], end: seeds.at(-1), count }, results }, null, 2));
