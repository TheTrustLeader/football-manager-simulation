import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import { printRunProvenance, readGitProvenance } from "./provenance.js";
import { seedRange } from "./seed-pools.js";
import type { Formation, MatchOutput, OutfieldPlayer, Position, Style, TeamInput } from "./types.js";

interface Aggregate {
  matches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  homeGoals: number;
  awayGoals: number;
  homeChances: number;
  awayChances: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
}

interface RatingSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  histogram: Record<string, number>;
}

interface MatrixCell {
  matches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  homeGoals: number;
  awayGoals: number;
  homeChances: number;
  homeShots: number;
}

const formations: Formation[] = ["4-4-2", "4-3-3", "4-5-1", "3-5-2", "5-3-2"];
const styles: Style[] = ["balanced", "passing", "direct", "counter"];
const positions: Position[] = ["GK", "CB", "FB", "CM", "WM", "FW"];

function emptyAggregate(): Aggregate {
  return { matches: 0, homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, homeChances: 0, awayChances: 0, homeShots: 0, awayShots: 0, homeShotsOnTarget: 0, awayShotsOnTarget: 0 };
}

function addAggregate(aggregate: Aggregate, result: MatchOutput): void {
  aggregate.matches += 1;
  aggregate.homeGoals += result.home.goals;
  aggregate.awayGoals += result.away.goals;
  aggregate.homeChances += result.home.chances;
  aggregate.awayChances += result.away.chances;
  aggregate.homeShots += result.home.shots;
  aggregate.awayShots += result.away.shots;
  aggregate.homeShotsOnTarget += result.home.shotsOnTarget;
  aggregate.awayShotsOnTarget += result.away.shotsOnTarget;
  if (result.home.goals > result.away.goals) aggregate.homeWins += 1;
  else if (result.home.goals < result.away.goals) aggregate.awayWins += 1;
  else aggregate.draws += 1;
}

function aggregateRates(aggregate: Aggregate) {
  return {
    matches: aggregate.matches,
    goalsPerMatch: (aggregate.homeGoals + aggregate.awayGoals) / aggregate.matches,
    homeGoalsPerMatch: aggregate.homeGoals / aggregate.matches,
    awayGoalsPerMatch: aggregate.awayGoals / aggregate.matches,
    homeWinRate: aggregate.homeWins / aggregate.matches,
    drawRate: aggregate.draws / aggregate.matches,
    awayWinRate: aggregate.awayWins / aggregate.matches,
    homeChancesPerMatch: aggregate.homeChances / aggregate.matches,
    awayChancesPerMatch: aggregate.awayChances / aggregate.matches,
    homeShotsPerMatch: aggregate.homeShots / aggregate.matches,
    awayShotsPerMatch: aggregate.awayShots / aggregate.matches,
    homeShotConversion: aggregate.homeShots === 0 ? 0 : aggregate.homeGoals / aggregate.homeShots,
    awayShotConversion: aggregate.awayShots === 0 ? 0 : aggregate.awayGoals / aggregate.awayShots,
  };
}

function emptyRatingSummary(): RatingSummary {
  return { count: 0, sum: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, histogram: {} };
}

function addRating(summary: RatingSummary, rating: number): void {
  summary.count += 1;
  summary.sum += rating;
  summary.min = Math.min(summary.min, rating);
  summary.max = Math.max(summary.max, rating);
  const key = rating.toFixed(1);
  summary.histogram[key] = (summary.histogram[key] ?? 0) + 1;
}

function finaliseRating(summary: RatingSummary) {
  return {
    count: summary.count,
    mean: summary.count === 0 ? null : summary.sum / summary.count,
    min: summary.count === 0 ? null : summary.min,
    max: summary.count === 0 ? null : summary.max,
    distinctValues: Object.keys(summary.histogram).length,
    histogram: summary.histogram,
  };
}

function emptyMatrixCell(): MatrixCell {
  return { matches: 0, homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, homeChances: 0, homeShots: 0 };
}

function addMatrixCell(cell: MatrixCell, result: MatchOutput): void {
  cell.matches += 1;
  cell.homeGoals += result.home.goals;
  cell.awayGoals += result.away.goals;
  cell.homeChances += result.home.chances;
  cell.homeShots += result.home.shots;
  if (result.home.goals > result.away.goals) cell.homeWins += 1;
  else if (result.home.goals < result.away.goals) cell.awayWins += 1;
  else cell.draws += 1;
}

function finaliseMatrixCell(cell: MatrixCell) {
  return {
    matches: cell.matches,
    homeWinRate: cell.homeWins / cell.matches,
    drawRate: cell.draws / cell.matches,
    awayWinRate: cell.awayWins / cell.matches,
    homeGoalsPerMatch: cell.homeGoals / cell.matches,
    awayGoalsPerMatch: cell.awayGoals / cell.matches,
    homePointsPerMatch: (cell.homeWins * 3 + cell.draws) / cell.matches,
    awayPointsPerMatch: (cell.awayWins * 3 + cell.draws) / cell.matches,
    homeChancesPerMatch: cell.homeChances / cell.matches,
    homeShotConversion: cell.homeShots === 0 ? 0 : cell.homeGoals / cell.homeShots,
  };
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

function targetCheck(actual: number, min: number, max: number) {
  return { min, max, actual, pass: actual >= min && actual <= max };
}

function teamForMatrix(prefix: string, formation: Formation, style: Style = "balanced"): TeamInput {
  return makeTeam(prefix, 10, { formation, style });
}

const count = Number.parseInt(process.argv[2] ?? "500000", 10);
const outputPath = process.argv[3] ?? "evidence/review-002-full-evidence.json";
if (!Number.isInteger(count) || count < 500000 || count > 1000000) throw new Error("REVIEW-002 full evidence count must be between 500,000 and 1,000,000 tuning seeds");
const provenance = readGitProvenance();
printRunProvenance("REVIEW-002 EVIDENCE RUN", provenance);
const seeds = seedRange("tuning", count);
const started = performance.now();

// 1. Equal-team baseline. Reused for calibration, ratings, fatigue and goal timing.
const baseline = emptyAggregate();
const baselineHome = makeTeam("baseline-home", 10);
const baselineAway = makeTeam("baseline-away", 10);
const baselinePositions = new Map<string, Position>();
for (const player of [...baselineHome.starters, ...baselineAway.starters]) baselinePositions.set(player.id, player.primaryPosition);
const ratings = Object.fromEntries(positions.map((position) => [position, emptyRatingSummary()])) as Record<Position, RatingSummary>;
const goalsBy15MinuteBlock = [0, 0, 0, 0, 0, 0];
let homeUndismissedConditionSum = 0;
let homeUndismissedConditionCount = 0;
let awayUndismissedConditionSum = 0;
let awayUndismissedConditionCount = 0;
let homeFinalConditionMin = Number.POSITIVE_INFINITY;
let homeFinalConditionMax = Number.NEGATIVE_INFINITY;
let awayFinalConditionMin = Number.POSITIVE_INFINITY;
let awayFinalConditionMax = Number.NEGATIVE_INFINITY;

for (const seed of seeds) {
  const result = simulateMatch({ seed, home: baselineHome, away: baselineAway });
  addAggregate(baseline, result);
  for (const event of result.events) {
    if (event.type !== "goal" || event.minute < 1) continue;
    const block = Math.min(5, Math.floor((event.minute - 1) / 15));
    goalsBy15MinuteBlock[block]! += 1;
  }
  for (const contribution of result.contributions) {
    const position = baselinePositions.get(contribution.playerId);
    if (!position) continue;
    addRating(ratings[position], contribution.rating);
    const condition = result.finalCondition[contribution.playerId];
    if (condition === undefined) continue;
    const homePlayer = contribution.playerId.startsWith("baseline-home-");
    if (homePlayer) {
      homeFinalConditionMin = Math.min(homeFinalConditionMin, condition);
      homeFinalConditionMax = Math.max(homeFinalConditionMax, condition);
      if (contribution.minutesPlayed === ENGINE_CONFIG.matchMinutes) {
        homeUndismissedConditionSum += condition;
        homeUndismissedConditionCount += 1;
      }
    } else {
      awayFinalConditionMin = Math.min(awayFinalConditionMin, condition);
      awayFinalConditionMax = Math.max(awayFinalConditionMax, condition);
      if (contribution.minutesPlayed === ENGINE_CONFIG.matchMinutes) {
        awayUndismissedConditionSum += condition;
        awayUndismissedConditionCount += 1;
      }
    }
  }
}

const baselineRates = aggregateRates(baseline);
const targets = ENGINE_CONFIG.calibrationTargets;
const calibrationChecks = {
  goalsPerMatch: targetCheck(baselineRates.goalsPerMatch, targets.goalsPerMatchMin, targets.goalsPerMatchMax),
  drawRate: targetCheck(baselineRates.drawRate, targets.drawRateMin, targets.drawRateMax),
  homeWinRate: targetCheck(baselineRates.homeWinRate, targets.homeWinRateMin, targets.homeWinRateMax),
};
const expectedPoissonDrawRate = poissonDrawRate(baselineRates.homeGoalsPerMatch, baselineRates.awayGoalsPerMatch);

// 2. Full formation matrix, 500k–1m total matches distributed equally across 25 cells.
const formationMatchesPerCell = Math.floor(count / (formations.length * formations.length));
const formationSeeds = seedRange("tuning", formationMatchesPerCell);
const formationMatrix: Record<string, ReturnType<typeof finaliseMatrixCell>> = {};
const formationPoints = Object.fromEntries(formations.map((formation) => [formation, { points: 0, teamMatches: 0 }])) as Record<Formation, { points: number; teamMatches: number }>;
for (const homeFormation of formations) {
  for (const awayFormation of formations) {
    const cell = emptyMatrixCell();
    const home = teamForMatrix(`formation-${homeFormation}-home`, homeFormation);
    const away = teamForMatrix(`formation-${awayFormation}-away`, awayFormation);
    for (const seed of formationSeeds) {
      const result = simulateMatch({ seed, neutralVenue: true, home, away });
      addMatrixCell(cell, result);
    }
    const final = finaliseMatrixCell(cell);
    formationMatrix[`${homeFormation}_vs_${awayFormation}`] = final;
    formationPoints[homeFormation].points += cell.homeWins * 3 + cell.draws;
    formationPoints[homeFormation].teamMatches += cell.matches;
    formationPoints[awayFormation].points += cell.awayWins * 3 + cell.draws;
    formationPoints[awayFormation].teamMatches += cell.matches;
  }
}
const formationSummary = Object.fromEntries(formations.map((formation) => [formation, {
  pointsPerMatch: formationPoints[formation].points / formationPoints[formation].teamMatches,
  teamMatches: formationPoints[formation].teamMatches,
}]));

// 3. Full style matrix, 500k–1m total matches distributed equally across 16 cells.
const styleMatchesPerCell = Math.floor(count / (styles.length * styles.length));
const styleSeeds = seedRange("tuning", styleMatchesPerCell);
const styleMatrix: Record<string, ReturnType<typeof finaliseMatrixCell>> = {};
const stylePoints = Object.fromEntries(styles.map((style) => [style, { points: 0, teamMatches: 0 }])) as Record<Style, { points: number; teamMatches: number }>;
for (const homeStyle of styles) {
  for (const awayStyle of styles) {
    const cell = emptyMatrixCell();
    const home = makeTeam(`style-${homeStyle}-home`, 10, { style: homeStyle });
    const away = makeTeam(`style-${awayStyle}-away`, 10, { style: awayStyle });
    for (const seed of styleSeeds) {
      const result = simulateMatch({ seed, neutralVenue: true, home, away });
      addMatrixCell(cell, result);
    }
    const final = finaliseMatrixCell(cell);
    styleMatrix[`${homeStyle}_vs_${awayStyle}`] = final;
    stylePoints[homeStyle].points += cell.homeWins * 3 + cell.draws;
    stylePoints[homeStyle].teamMatches += cell.matches;
    stylePoints[awayStyle].points += cell.awayWins * 3 + cell.draws;
    stylePoints[awayStyle].teamMatches += cell.matches;
  }
}
const styleSummary = Object.fromEntries(styles.map((style) => [style, {
  pointsPerMatch: stylePoints[style].points / stylePoints[style].teamMatches,
  teamMatches: stylePoints[style].teamMatches,
}]));

// 4. Ability signal at full scheduled-run depth.
const ability = emptyAggregate();
const strong = makeTeam("ability-strong", 14);
const weak = makeTeam("ability-weak", 8);
for (const seed of seeds) addAggregate(ability, simulateMatch({ seed, neutralVenue: true, home: strong, away: weak }));
const abilityRates = aggregateRates(ability);

// 5. REVIEW-002 N4/N5 focused evidence without opening validation seeds.
const focusedCount = Math.min(100000, count);
const focusedSeeds = seedRange("tuning", focusedCount);
let redCards = 0;
let duplicateRedContributions = 0;
let postDismissalAppearances = 0;
let singleDismissalMatches = 0;
let fullStrengthPostRedGoals = 0;
let dismissedSidePostRedGoals = 0;
const hardHome = makeTeam("red-home", 10, { tackling: "hard" });
const hardAway = makeTeam("red-away", 10, { tackling: "hard" });
for (const seed of focusedSeeds) {
  const result = simulateMatch({ seed, neutralVenue: true, home: hardHome, away: hardAway });
  const redEvents = result.events.filter((event) => event.type === "red-card" && event.playerId && event.teamId);
  redCards += redEvents.length;
  duplicateRedContributions += result.contributions.filter((contribution) => contribution.redCards > 1).length;
  for (const red of redEvents) {
    const redIndex = result.events.indexOf(red);
    if (result.events.slice(redIndex + 1).some((event) => event.playerId === red.playerId || event.secondaryPlayerId === red.playerId)) postDismissalAppearances += 1;
  }
  if (redEvents.length === 1) {
    singleDismissalMatches += 1;
    const red = redEvents[0]!;
    for (const event of result.events) {
      if (event.type !== "goal" || event.minute <= red.minute || !event.teamId) continue;
      if (event.teamId === red.teamId) dismissedSidePostRedGoals += 1;
      else fullStrengthPostRedGoals += 1;
    }
  }
}

const defenceHome = makeTeam("defence-signal-home", 10);
const defenceAway = makeTeam("defence-signal-away", 10);
const defenders = defenceHome.starters.filter((player): player is OutfieldPlayer => player.primaryPosition === "CB");
defenders[0]!.attributes.defending = 20;
defenders[1]!.attributes.defending = 2;
let strongDefensiveActions = 0;
let weakDefensiveActions = 0;
for (const seed of focusedSeeds) {
  const result = simulateMatch({ seed, neutralVenue: true, home: defenceHome, away: defenceAway });
  strongDefensiveActions += result.contributions.find((entry) => entry.playerId === defenders[0]!.id)!.defensiveActions;
  weakDefensiveActions += result.contributions.find((entry) => entry.playerId === defenders[1]!.id)!.defensiveActions;
}

const elapsedMs = performance.now() - started;
const matrixMatches = formationMatchesPerCell * 25 + styleMatchesPerCell * 16;
const totalSimulatedMatches = count * 2 + matrixMatches + focusedCount * 2;
const homeUndismissedFinalCondition = homeUndismissedConditionSum / homeUndismissedConditionCount;
const awayUndismissedFinalCondition = awayUndismissedConditionSum / awayUndismissedConditionCount;
const startFactor = ENGINE_CONFIG.condition.base + ENGINE_CONFIG.condition.range;
const homeEndFactor = ENGINE_CONFIG.condition.base + ENGINE_CONFIG.condition.range * (homeUndismissedFinalCondition / ENGINE_CONFIG.condition.scale);

const evidence = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  buildVersion: provenance.gitCommit,
  gitCommit: provenance.gitCommit,
  dirtyTree: provenance.dirtyTree,
  engineConfigVersion: ENGINE_CONFIG.version,
  engineConfigHash: ENGINE_CONFIG_HASH,
  command: `npm run review002:evidence -- ${count} ${outputPath}`,
  seedGovernance: {
    pool: "tuning-v1",
    seedRange: { start: seeds[0], end: seeds.at(-1), count: seeds.length },
    validationSeedsUsed: false,
    twelveQuestionMatrixRun: false,
  },
  calibration: {
    source: "02_Research-and-Period-Rules/PERIOD-MATCH-CALIBRATION_v1_2026-08-09.md",
    targets,
    checks: calibrationChecks,
    baseline: baselineRates,
    poisson: {
      expectedDrawRate: expectedPoissonDrawRate,
      observedDrawRate: baselineRates.drawRate,
      delta: baselineRates.drawRate - expectedPoissonDrawRate,
    },
  },
  goalsBy15MinuteBlock: goalsBy15MinuteBlock.map((goals, index) => ({
    block: `${index * 15 + 1}-${(index + 1) * 15}`,
    goalsPerMatch: goals / count,
    goals,
  })),
  fatigue: {
    approvedTargetFinalCondition: { min: 55, max: 65, centre: 60 },
    homeUndismissedFinalCondition,
    awayUndismissedFinalCondition,
    homeAllStarterFinalConditionRange: { min: homeFinalConditionMin, max: homeFinalConditionMax },
    awayAllStarterFinalConditionRange: { min: awayFinalConditionMin, max: awayFinalConditionMax },
    homeEffectiveAttributeDecay: 1 - homeEndFactor / startFactor,
    matchIndependent: true,
    ageDirectEffect: false,
  },
  ratings: Object.fromEntries(positions.map((position) => [position, finaliseRating(ratings[position])])),
  formationMatrix: {
    totalMatches: formationMatchesPerCell * 25,
    matchesPerCell: formationMatchesPerCell,
    cells: formationMatrix,
    summary: formationSummary,
  },
  styleMatrix: {
    totalMatches: styleMatchesPerCell * 16,
    matchesPerCell: styleMatchesPerCell,
    cells: styleMatrix,
    summary: styleSummary,
  },
  abilitySignal: {
    ...abilityRates,
    strongLevel: 14,
    weakLevel: 8,
  },
  redCards: {
    matches: focusedCount,
    redCards,
    duplicateRedContributions,
    postDismissalAppearances,
    singleDismissalMatches,
    postRedGoals: {
      fullStrengthSide: fullStrengthPostRedGoals,
      dismissedSide: dismissedSidePostRedGoals,
      fullStrengthToDismissedRatio: dismissedSidePostRedGoals === 0 ? null : fullStrengthPostRedGoals / dismissedSidePostRedGoals,
    },
  },
  defensiveCreditSignal: {
    matches: focusedCount,
    strongDefendingAttribute: 20,
    weakDefendingAttribute: 2,
    strongDefensiveActions,
    weakDefensiveActions,
    actionRatio: weakDefensiveActions === 0 ? null : strongDefensiveActions / weakDefensiveActions,
  },
  performance: {
    elapsedMs,
    totalSimulatedMatches,
    matchesPerSecond: totalSimulatedMatches / (elapsedMs / 1000),
  },
  structuralChecks: {
    redCardRemoval: postDismissalAppearances === 0 && duplicateRedContributions === 0,
    defensiveAbilitySignal: strongDefensiveActions > weakDefensiveActions * 3,
    fatigueInApprovedRange: homeUndismissedFinalCondition >= 55 && homeUndismissedFinalCondition <= 65,
  },
  limitations: [
    "This is the bounded REVIEW-002 rerun, not the prohibited 12-question matrix.",
    "All runs use tuning-v1 seeds; the validation pool remains sealed.",
    "Formation and style matrices distribute the scheduled-run volume across all pairwise cells; each cell reports its own sample size.",
    "Game-state response has not been implemented, so the Poisson diagnostic remains an expected outstanding design issue.",
  ],
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  buildVersion: evidence.buildVersion,
  gitCommit: evidence.gitCommit,
  dirtyTree: evidence.dirtyTree,
  engineConfigVersion: evidence.engineConfigVersion,
  engineConfigHash: evidence.engineConfigHash,
  calibration: evidence.calibration,
  fatigue: evidence.fatigue,
  formationSummary: evidence.formationMatrix.summary,
  styleSummary: evidence.styleMatrix.summary,
  abilitySignal: evidence.abilitySignal,
  redCards: evidence.redCards,
  defensiveCreditSignal: evidence.defensiveCreditSignal,
  structuralChecks: evidence.structuralChecks,
  performance: evidence.performance,
}, null, 2));

const structuralFailures = Object.entries(evidence.structuralChecks).filter(([, pass]) => !pass).map(([name]) => name);
if (structuralFailures.length > 0) throw new Error(`REVIEW-002 structural evidence failed: ${structuralFailures.join(", ")}`);
