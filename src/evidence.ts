import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import { seedRange, type SeedPoolName } from "./seed-pools.js";

interface Aggregate {
  matches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  homeGoals: number;
  awayGoals: number;
  scorelines: Record<string, number>;
}

function emptyAggregate(): Aggregate {
  return { matches: 0, homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, scorelines: {} };
}

function addResult(aggregate: Aggregate, homeGoals: number, awayGoals: number): void {
  aggregate.matches += 1;
  aggregate.homeGoals += homeGoals;
  aggregate.awayGoals += awayGoals;
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
    homeWinRate: aggregate.homeWins / aggregate.matches,
    drawRate: aggregate.draws / aggregate.matches,
    awayWinRate: aggregate.awayWins / aggregate.matches,
  };
}

function poissonProbability(lambda: number, goals: number): number {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) factorial *= value;
  return Math.exp(-lambda) * Math.pow(lambda, goals) / factorial;
}

const count = Number.parseInt(process.argv[2] ?? `${ENGINE_CONFIG.ciGuardrails.sampleMatches}`, 10);
const pool = (process.argv[3] ?? "tuning") as SeedPoolName;
const outputPath = process.argv[4] ?? "evidence/match-lab-evidence.json";
if (pool !== "tuning" && pool !== "validation") throw new Error(`Unknown seed pool: ${pool}`);
const seeds = seedRange(pool, count);

const baseline = emptyAggregate();
const mirror = emptyAggregate();
const ability = emptyAggregate();
const invariantFailingSeeds: number[] = [];
const started = performance.now();

for (const seed of seeds) {
  const baselineResult = simulateMatch({ seed, home: makeTeam("home", 10), away: makeTeam("away", 10) });
  addResult(baseline, baselineResult.home.goals, baselineResult.away.goals);

  const neutralResult = simulateMatch({ seed, neutralVenue: true, home: makeTeam("mirror-home", 10), away: makeTeam("mirror-away", 10) });
  addResult(mirror, neutralResult.home.goals, neutralResult.away.goals);

  const abilityResult = simulateMatch({ seed, neutralVenue: true, home: makeTeam("strong", 14), away: makeTeam("weak", 8) });
  addResult(ability, abilityResult.home.goals, abilityResult.away.goals);

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
const guardrails = ENGINE_CONFIG.ciGuardrails;
const checks = {
  goalsPerMatch: {
    min: guardrails.goalsPerMatchMin,
    max: guardrails.goalsPerMatchMax,
    actual: baselineRates.goalsPerMatch,
    pass: baselineRates.goalsPerMatch >= guardrails.goalsPerMatchMin && baselineRates.goalsPerMatch <= guardrails.goalsPerMatchMax,
  },
  drawRate: {
    min: guardrails.drawRateMin,
    max: guardrails.drawRateMax,
    actual: baselineRates.drawRate,
    pass: baselineRates.drawRate >= guardrails.drawRateMin && baselineRates.drawRate <= guardrails.drawRateMax,
  },
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

const evidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  buildVersion: process.env.GITHUB_SHA ?? "local-uncommitted",
  engineConfigVersion: ENGINE_CONFIG.version,
  engineConfigHash: ENGINE_CONFIG_HASH,
  command: `npm run evidence -- ${count} ${pool} ${outputPath}`,
  seedPool: pool,
  seedRange: { start: seeds[0], end: seeds.at(-1), count: seeds.length },
  thresholds: guardrails,
  checks,
  baseline: { ...baselineRates, counts: baseline, scorelineMatrix: baseline.scorelines },
  neutralMirror: { ...mirrorRates, counts: mirror },
  abilitySignal: { ...abilityRates, counts: ability, strongLevel: 14, weakLevel: 8 },
  poissonReference,
  failingSeeds: { invariants: [...new Set(invariantFailingSeeds)].slice(0, 100) },
  performance: {
    elapsedMs,
    simulatedMatches: count * 3,
    matchesPerSecond: (count * 3 / elapsedMs) * 1000,
  },
  limitations: [
    "CI guardrails are remediation safety bounds, not Gate 1 acceptance thresholds.",
    "The 12-question simulation matrix remains blocked pending REVIEW-001 remediation and re-review.",
    "Poisson comparison is diagnostic evidence only; it is not an optimisation target.",
  ],
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ buildVersion: evidence.buildVersion, configHash: ENGINE_CONFIG_HASH, checks, performance: evidence.performance }, null, 2));

const failedChecks = Object.entries(checks).filter(([, value]) => !value.pass).map(([name]) => name);
if (failedChecks.length > 0) {
  throw new Error(`Simulation evidence gate failed: ${failedChecks.join(", ")}. Evidence written to ${outputPath}`);
}
