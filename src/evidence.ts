import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import { seedRange, type SeedPoolName } from "./seed-pools.js";
import type { Formation, Style } from "./types.js";

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

function emptyAggregate(): Aggregate {
  return { matches: 0, homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, homeChances: 0, homeShots: 0, scorelines: {} };
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
const invariantFailingSeeds: number[] = [];
const started = performance.now();

for (const seed of seeds) {
  const baselineResult = simulateMatch({ seed, home: makeTeam("home", 10), away: makeTeam("away", 10) });
  addResult(baseline, baselineResult);

  const neutralResult = simulateMatch({ seed, neutralVenue: true, home: makeTeam("mirror-home", 10), away: makeTeam("mirror-away", 10) });
  addResult(mirror, neutralResult);

  const abilityResult = simulateMatch({ seed, neutralVenue: true, home: makeTeam("strong", 14), away: makeTeam("weak", 8) });
  addResult(ability, abilityResult);

  const formationBaselineResult = simulateMatch({
    seed,
    neutralVenue: true,
    home: makeTeam("formation-home", 10, { formation: "4-4-2" }),
    away: makeTeam("formation-away", 10, { formation: "4-4-2" }),
  });
  addResult(formationBaseline, formationBaselineResult);
  for (const formation of ["4-3-3", "4-5-1", "3-5-2", "5-3-2"] as const) {
    addResult(formationCandidates[formation], simulateMatch({
      seed,
      neutralVenue: true,
      home: makeTeam("formation-home", 10, { formation }),
      away: makeTeam("formation-away", 10, { formation: "4-4-2" }),
    }));
  }

  const styleBaselineResult = simulateMatch({
    seed,
    neutralVenue: true,
    home: makeTeam("style-home", 10, { style: "balanced" }),
    away: makeTeam("style-away", 10, { style: "balanced" }),
  });
  addResult(styleBaseline, styleBaselineResult);
  for (const style of ["passing", "direct", "counter"] as const) {
    addResult(styleCandidates[style], simulateMatch({
      seed,
      neutralVenue: true,
      home: makeTeam("style-home", 10, { style }),
      away: makeTeam("style-away", 10, { style: "balanced" }),
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
  homeWinRate: {
    min: guardrails.homeWinRateMin,
    max: guardrails.homeWinRateMax,
    actual: baselineRates.homeWinRate,
    pass: baselineRates.homeWinRate >= guardrails.homeWinRateMin && baselineRates.homeWinRate <= guardrails.homeWinRateMax,
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
  formationPresence: {
    pass: Object.values(formationPresence).every((value) => value.pass),
    failing: Object.entries(formationPresence).filter(([, value]) => !value.pass).map(([formation]) => formation),
  },
  stylePresence: {
    pass: Object.values(stylePresence).every((value) => value.pass),
    failing: Object.entries(stylePresence).filter(([, value]) => !value.pass).map(([style]) => style),
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
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  buildVersion: process.env.GITHUB_SHA ?? "local-uncommitted",
  engineConfigVersion: ENGINE_CONFIG.version,
  engineConfigHash: ENGINE_CONFIG_HASH,
  command: `npm run evidence -- ${count} ${pool} ${outputPath}`,
  seedPool: pool,
  seedRange: { start: seeds[0], end: seeds.at(-1), count: seeds.length },
  calibrationSource: "02_Research-and-Period-Rules/PERIOD-MATCH-CALIBRATION_v1_2026-08-09.md",
  thresholds: guardrails,
  presenceThresholds,
  checks,
  baseline: { ...baselineRates, counts: baseline, scorelineMatrix: baseline.scorelines },
  neutralMirror: { ...mirrorRates, counts: mirror },
  abilitySignal: { ...abilityRates, counts: ability, strongLevel: 14, weakLevel: 8 },
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
    "Goals, draw and home-win CI bands are the sourced period calibration bands currently approved for Gate 1 tuning.",
    "Formation and style presence are mechanism-presence checks, not claims that their final magnitudes are balanced.",
    "The 12-question simulation matrix remains blocked pending REVIEW-002 remediation and re-review.",
    "Validation seeds remain sealed during tuning.",
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
