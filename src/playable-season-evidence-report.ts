import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_TACTICS, newPlayableSeason, playMatchday, seasonTable, styleThatBeats, teamsForPlayableSeason, usualStyle } from "./playable-season.js";
import { rulesForSeason } from "./rules.js";
import type { Style } from "./types.js";

export const PLAYABLE_EVIDENCE_SEASON = 1981;
export const PLAYABLE_EVIDENCE_FIRST_SEED = 900001;
export const PLAYABLE_EVIDENCE_LAST_SEED = 901000;

export interface PlayableSeasonEvidenceReport {
  season: number;
  firstSeed: number;
  lastSeed: number;
  userClubId: string;
  games: number;
  matches: number;
  goalsPerMatch: number;
  homeWinRate: number;
  drawRate: number;
  shownFavouriteTitles: number;
  shownTopFiveTitles: number;
  computerStyleUses: Record<Style, number>;
  weakestClubStrategies: Record<"balanced" | Style | "reading", StrategyEvidence>;
}

export interface StrategyEvidence { meanPosition: number; standardError: number; topFiveFinishes: number }

export interface PlayableSeasonEvidenceTotals {
  games: number;
  matches: number;
  goals: number;
  homeWins: number;
  draws: number;
  shownFavouriteTitles: number;
  shownTopFiveTitles: number;
  computerStyleUses: Record<Style, number>;
  strategyPositions: Record<"balanced" | Style | "reading", number[]>;
}

const STRATEGIES = ["balanced", "passing", "direct", "counter", "reading"] as const;

function finishWeakest(seed: number, strategy: typeof STRATEGIES[number], reusableComputerMatches: ReadonlyMap<number, import("./types.js").MatchOutput>): number {
  const offered = newPlayableSeason(PLAYABLE_EVIDENCE_SEASON, seed, "club-1");
  const weakest = [...offered.clubs].sort((a, b) => a.strength - b.strength || a.id.localeCompare(b.id))[0]!.id;
  let state = newPlayableSeason(PLAYABLE_EVIDENCE_SEASON, seed, weakest);
  const rules = rulesForSeason(PLAYABLE_EVIDENCE_SEASON);
  while (state.nextRound <= state.clubs.length * 2 - 2) {
    let style: Style = strategy === "reading" ? "balanced" : strategy;
    if (strategy === "reading") {
      const fixture = state.fixtures.find((candidate) => candidate.round === state.nextRound && (candidate.homeId === weakest || candidate.awayId === weakest))!;
      const opponentId = fixture.homeId === weakest ? fixture.awayId : fixture.homeId;
      const opponent = teamsForPlayableSeason(state).find((team) => team.id === opponentId)!;
      style = styleThatBeats(usualStyle(opponent), rules.styleMatchups);
    }
    state = playMatchday(state, { ...DEFAULT_TACTICS, style }, undefined, reusableComputerMatches);
  }
  return seasonTable(state).findIndex((row) => row.teamId === weakest) + 1;
}

export function generatePlayableSeasonEvidenceRange(firstSeed: number, lastSeed: number): PlayableSeasonEvidenceTotals {
  let matches = 0;
  let goals = 0;
  let homeWins = 0;
  let draws = 0;
  let shownFavouriteTitles = 0;
  let shownTopFiveTitles = 0;
  const computerStyleUses: Record<Style, number> = { passing: 0, direct: 0, counter: 0, balanced: 0 };
  const strategyPositions: PlayableSeasonEvidenceTotals["strategyPositions"] = { balanced: [], passing: [], direct: [], counter: [], reading: [] };

  for (let seed = firstSeed; seed <= lastSeed; seed += 1) {
    const offered = newPlayableSeason(PLAYABLE_EVIDENCE_SEASON, seed, "club-1");
    const weakestId = [...offered.clubs].sort((a, b) => a.strength - b.strength || a.id.localeCompare(b.id))[0]!.id;
    let state = newPlayableSeason(PLAYABLE_EVIDENCE_SEASON, seed, weakestId);
    const shownOrder = [...state.clubs].sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
    const shownFavouriteId = shownOrder[0]!.id;
    const shownTopFiveIds = new Set(shownOrder.slice(0, 5).map((club) => club.id));
    state = { ...state, tactics: { ...state.tactics, ...DEFAULT_TACTICS } };
    while (state.nextRound <= state.clubs.length * 2 - 2) state = playMatchday(state, DEFAULT_TACTICS);
    for (const match of state.matches) {
      matches += 1;
      goals += match.home.goals + match.away.goals;
      if (match.home.goals > match.away.goals) homeWins += 1;
      if (match.home.goals === match.away.goals) draws += 1;
      if (match.homeTeamId !== state.userClubId) computerStyleUses[match.homeStyle] += 1;
      if (match.awayTeamId !== state.userClubId) computerStyleUses[match.awayStyle] += 1;
    }
    const championId = seasonTable(state)[0]!.teamId;
    if (championId === shownFavouriteId) shownFavouriteTitles += 1;
    if (shownTopFiveIds.has(championId)) shownTopFiveTitles += 1;
    const reusableComputerMatches = new Map<number, (typeof state.matches)[number]>();
    for (const match of state.matches) {
      if (match.homeTeamId === weakestId || match.awayTeamId === weakestId) continue;
      const index = state.fixtures.findIndex((fixture) => fixture.homeId === match.homeTeamId && fixture.awayId === match.awayTeamId);
      reusableComputerMatches.set(index, match);
    }
    strategyPositions.balanced.push(seasonTable(state).findIndex((row) => row.teamId === weakestId) + 1);
    for (const strategy of STRATEGIES) if (strategy !== "balanced") strategyPositions[strategy].push(finishWeakest(seed, strategy, reusableComputerMatches));
  }

  return { games: lastSeed - firstSeed + 1, matches, goals, homeWins, draws, shownFavouriteTitles, shownTopFiveTitles, computerStyleUses, strategyPositions };
}

export async function generatePlayableSeasonEvidence(): Promise<PlayableSeasonEvidenceReport> {
  const execFileAsync = promisify(execFile);
  // Match the three available CI workers; a fourth process only adds contention.
  const ranges = [[900001, 900334], [900335, 900667], [900668, 901000]] as const;
  const partials = await Promise.all(ranges.map(async ([firstSeed, lastSeed]) => {
    const { stdout } = await execFileAsync("node_modules/.bin/tsx", ["src/playable-season-evidence-worker.ts", String(firstSeed), String(lastSeed)], { maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout) as PlayableSeasonEvidenceTotals;
  }));
  const totals = partials.reduce<PlayableSeasonEvidenceTotals>((sum, part) => ({
    games: sum.games + part.games,
    matches: sum.matches + part.matches,
    goals: sum.goals + part.goals,
    homeWins: sum.homeWins + part.homeWins,
    draws: sum.draws + part.draws,
    shownFavouriteTitles: sum.shownFavouriteTitles + part.shownFavouriteTitles,
    shownTopFiveTitles: sum.shownTopFiveTitles + part.shownTopFiveTitles,
    computerStyleUses: Object.fromEntries(Object.keys(sum.computerStyleUses).map((style) => [style, sum.computerStyleUses[style as Style] + part.computerStyleUses[style as Style]])) as Record<Style, number>,
    strategyPositions: Object.fromEntries(STRATEGIES.map((strategy) => [strategy, [...sum.strategyPositions[strategy], ...part.strategyPositions[strategy]]])) as PlayableSeasonEvidenceTotals["strategyPositions"],
  }), { games: 0, matches: 0, goals: 0, homeWins: 0, draws: 0, shownFavouriteTitles: 0, shownTopFiveTitles: 0, computerStyleUses: { passing: 0, direct: 0, counter: 0, balanced: 0 }, strategyPositions: { balanced: [], passing: [], direct: [], counter: [], reading: [] } });
  const weakestClubStrategies = Object.fromEntries(STRATEGIES.map((strategy) => {
    const values = totals.strategyPositions[strategy];
    const meanPosition = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - meanPosition) ** 2, 0) / (values.length - 1);
    return [strategy, { meanPosition, standardError: Math.sqrt(variance / values.length), topFiveFinishes: values.filter((value) => value <= 5).length }];
  })) as PlayableSeasonEvidenceReport["weakestClubStrategies"];
  return {
    season: PLAYABLE_EVIDENCE_SEASON,
    firstSeed: PLAYABLE_EVIDENCE_FIRST_SEED,
    lastSeed: PLAYABLE_EVIDENCE_LAST_SEED,
    userClubId: "weakest-shown-strength-per-seed",
    games: totals.games,
    matches: totals.matches,
    goalsPerMatch: totals.goals / totals.matches,
    homeWinRate: totals.homeWins / totals.matches,
    drawRate: totals.draws / totals.matches,
    shownFavouriteTitles: totals.shownFavouriteTitles,
    shownTopFiveTitles: totals.shownTopFiveTitles,
    computerStyleUses: totals.computerStyleUses,
    weakestClubStrategies,
  };
}
