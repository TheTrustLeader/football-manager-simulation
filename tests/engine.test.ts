import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH, stableHash } from "../src/engine-config.js";
import { simulateMatch, validateMatchInput } from "../src/engine.js";
import { makeTeam } from "../src/fixtures.js";
import type { Formation, MatchInput, MatchOutput, PlayerContribution, Style } from "../src/types.js";

function input(seed = 12345): MatchInput {
  return { seed, neutralVenue: true, home: makeTeam("home"), away: makeTeam("away") };
}

function aggregate(count: number, homeOverrides = {}, awayOverrides = {}) {
  let homeGoals = 0;
  let awayGoals = 0;
  let homeChances = 0;
  let homeShots = 0;
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  for (let seed = 1; seed <= count; seed += 1) {
    const result = simulateMatch({ seed, neutralVenue: true, home: makeTeam("home", 10, homeOverrides), away: makeTeam("away", 10, awayOverrides) });
    homeGoals += result.home.goals;
    awayGoals += result.away.goals;
    homeChances += result.home.chances;
    homeShots += result.home.shots;
    if (result.home.goals > result.away.goals) homeWins += 1;
    else if (result.home.goals < result.away.goals) awayWins += 1;
    else draws += 1;
  }
  return {
    goalsPerMatch: (homeGoals + awayGoals) / count,
    homeGoalsPerMatch: homeGoals / count,
    chancesPerMatch: homeChances / count,
    shotConversion: homeShots === 0 ? 0 : homeGoals / homeShots,
    homeWinRate: homeWins / count,
    awayWinRate: awayWins / count,
    drawRate: draws / count,
  };
}

function assertInvariants(result: MatchOutput, source: MatchInput): void {
  for (const stats of [result.home, result.away]) {
    expect(stats.chances).toBeGreaterThanOrEqual(stats.shots);
    expect(stats.shots).toBeGreaterThanOrEqual(stats.shotsOnTarget);
    expect(stats.shotsOnTarget).toBeGreaterThanOrEqual(stats.goals);
  }
  const contributionIds = new Set(result.contributions.map((contribution) => contribution.playerId));
  for (const event of result.events) {
    if (event.playerId) expect(contributionIds.has(event.playerId)).toBe(true);
    if (event.secondaryPlayerId) expect(contributionIds.has(event.secondaryPlayerId)).toBe(true);
  }
  const playerTeam = new Map<string, "home" | "away">();
  for (const player of [...source.home.starters, ...source.home.substitutes]) playerTeam.set(player.id, "home");
  for (const player of [...source.away.starters, ...source.away.substitutes]) playerTeam.set(player.id, "away");
  const totals = {
    home: { goals: 0, shots: 0, shotsOnTarget: 0, yellowCards: 0, redCards: 0 },
    away: { goals: 0, shots: 0, shotsOnTarget: 0, yellowCards: 0, redCards: 0 },
  };
  for (const contribution of result.contributions) {
    const side = playerTeam.get(contribution.playerId);
    if (!side) throw new Error(`Unknown contribution player ${contribution.playerId}`);
    totals[side].goals += contribution.goals;
    totals[side].shots += contribution.shots;
    totals[side].shotsOnTarget += contribution.shotsOnTarget;
    totals[side].yellowCards += contribution.yellowCards;
    totals[side].redCards += contribution.redCards;
  }
  for (const side of ["home", "away"] as const) {
    expect(totals[side].goals).toBe(result[side].goals);
    expect(totals[side].shots).toBe(result[side].shots);
    expect(totals[side].shotsOnTarget).toBe(result[side].shotsOnTarget);
    expect(totals[side].yellowCards).toBe(result[side].yellowCards);
    expect(totals[side].redCards).toBe(result[side].redCards);
  }
  const loggedHomeGoals = result.events.filter((event) => event.type === "goal" && event.teamId === source.home.id).length;
  const loggedAwayGoals = result.events.filter((event) => event.type === "goal" && event.teamId === source.away.id).length;
  expect(loggedHomeGoals).toBe(result.home.goals);
  expect(loggedAwayGoals).toBe(result.away.goals);
}

function collectRatingCoverage(count: number): Record<keyof Omit<PlayerContribution, "playerId" | "minutesPlayed" | "rating">, number> {
  const coverage = { goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, chancesCreated: 0, progressionActions: 0, defensiveActions: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0, majorErrors: 0 };
  for (let seed = 1; seed <= count; seed += 1) {
    const result = simulateMatch(input(seed));
    for (const contribution of result.contributions) {
      for (const key of Object.keys(coverage) as (keyof typeof coverage)[]) coverage[key] += contribution[key];
    }
  }
  return coverage;
}

describe("Match Engine core", () => {
  it("replays the same seed exactly", () => expect(simulateMatch(input(777))).toEqual(simulateMatch(input(777))));
  it("changes output when the seed changes", () => expect(simulateMatch(input(778)).events).not.toEqual(simulateMatch(input(777)).events));
  it("stamps the versioned engine configuration", () => {
    const result = simulateMatch(input());
    expect(result.engineConfigVersion).toBe(ENGINE_CONFIG.version);
    expect(result.engineConfigHash).toBe(ENGINE_CONFIG_HASH);
  });
  it("returns contribution records for starters and substitutes", () => {
    const result = simulateMatch(input());
    expect(result.contributions).toHaveLength(30);
    expect(result.contributions.filter((contribution) => contribution.minutesPlayed === 0)).toHaveLength(8);
  });
  it("rejects an invalid starting XI", () => {
    const bad = input();
    bad.home.starters = bad.home.starters.slice(0, 10);
    expect(() => validateMatchInput(bad)).toThrow(/11 starters/);
  });
  it("maintains match, event-log and contribution invariants", () => {
    for (let seed = 1; seed <= 1000; seed += 1) {
      const source = input(seed);
      assertInvariants(simulateMatch(source), source);
    }
  });
  it("produces a stable hash for a known match output", () => expect(stableHash(simulateMatch(input(424242)))).toMatch(/^fnv1a64:[0-9a-f]{16}$/));
});

describe("Behavioural presence", () => {
  it("makes each non-baseline formation statistically distinguishable", () => {
    const count = ENGINE_CONFIG.presenceTests.sampleMatches;
    const baseline = aggregate(count, { formation: "4-4-2" as Formation });
    const alternatives: Formation[] = ["4-3-3", "4-5-1", "3-5-2", "5-3-2"];
    for (const formation of alternatives) {
      const candidate = aggregate(count, { formation });
      const delta = Math.abs(candidate.homeGoalsPerMatch - baseline.homeGoalsPerMatch);
      expect(delta, `${formation} goal-rate delta ${delta.toFixed(4)}; baseline ${baseline.homeGoalsPerMatch.toFixed(4)}, candidate ${candidate.homeGoalsPerMatch.toFixed(4)}`).toBeGreaterThanOrEqual(ENGINE_CONFIG.presenceTests.formationMinimumGoalRateDelta);
    }
  });

  it("makes styles differ in chance volume and conversion independently", () => {
    const count = ENGINE_CONFIG.presenceTests.sampleMatches;
    const baseline = aggregate(count, { style: "balanced" as Style });
    const styles: Style[] = ["passing", "direct", "counter"];
    for (const style of styles) {
      const candidate = aggregate(count, { style });
      const chanceDelta = Math.abs(candidate.chancesPerMatch - baseline.chancesPerMatch);
      const conversionDelta = Math.abs(candidate.shotConversion - baseline.shotConversion);
      expect(chanceDelta, `${style} chance delta ${chanceDelta.toFixed(4)}`).toBeGreaterThanOrEqual(ENGINE_CONFIG.presenceTests.styleMinimumChanceRateDelta);
      expect(conversionDelta, `${style} conversion delta ${conversionDelta.toFixed(4)}`).toBeGreaterThanOrEqual(ENGINE_CONFIG.presenceTests.styleMinimumConversionDelta);
    }
  });

  it("exercises every contribution field used by the ratings ledger", () => {
    const coverage = collectRatingCoverage(ENGINE_CONFIG.presenceTests.ratingCoverageMatches);
    for (const [field, total] of Object.entries(coverage)) expect(total, `${field} was never exercised`).toBeGreaterThan(0);
  });
});

describe("Statistical guardrails", () => {
  it("keeps neutral mirror results symmetric", () => {
    const result = aggregate(ENGINE_CONFIG.ciGuardrails.sampleMatches);
    expect(Math.abs(result.homeWinRate - result.awayWinRate)).toBeLessThanOrEqual(ENGINE_CONFIG.ciGuardrails.mirrorWinRateTolerance);
  });
  it("requires a material ability signal", () => {
    const count = ENGINE_CONFIG.ciGuardrails.sampleMatches;
    let strongWins = 0;
    let weakWins = 0;
    for (let seed = 1; seed <= count; seed += 1) {
      const result = simulateMatch({ seed, neutralVenue: true, home: makeTeam("strong", 14), away: makeTeam("weak", 8) });
      if (result.home.goals > result.away.goals) strongWins += 1;
      if (result.home.goals < result.away.goals) weakWins += 1;
    }
    expect(strongWins / count).toBeGreaterThanOrEqual(ENGINE_CONFIG.ciGuardrails.abilityStrongWinRateMin);
    expect(weakWins / count).toBeLessThanOrEqual(ENGINE_CONFIG.ciGuardrails.abilityWeakWinRateMax);
  });
});
