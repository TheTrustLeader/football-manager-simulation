import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { simulateMatch } from "./engine.js";
import { DEFAULT_TACTICS, newPlayableSeason, seasonTable, teamsForPlayableSeason } from "./playable-season.js";

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
}

export interface PlayableSeasonEvidenceTotals {
  games: number;
  matches: number;
  goals: number;
  homeWins: number;
  draws: number;
  shownFavouriteTitles: number;
  shownTopFiveTitles: number;
}

export function generatePlayableSeasonEvidenceRange(firstSeed: number, lastSeed: number): PlayableSeasonEvidenceTotals {
  let matches = 0;
  let goals = 0;
  let homeWins = 0;
  let draws = 0;
  let shownFavouriteTitles = 0;
  let shownTopFiveTitles = 0;

  for (let seed = firstSeed; seed <= lastSeed; seed += 1) {
    let state = newPlayableSeason(PLAYABLE_EVIDENCE_SEASON, seed, "club-1");
    const shownOrder = [...state.clubs].sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
    const shownFavouriteId = shownOrder[0]!.id;
    const shownTopFiveIds = new Set(shownOrder.slice(0, 5).map((club) => club.id));
    state = { ...state, tactics: { ...state.tactics, ...DEFAULT_TACTICS } };
    const byId = new Map(teamsForPlayableSeason(state).map((team) => [team.id, team]));
    state = {
      ...state,
      matches: state.fixtures.map((fixture, index) => simulateMatch({
        seed: (state.seed + index * 7919) >>> 0,
        home: byId.get(fixture.homeId)!,
        away: byId.get(fixture.awayId)!,
      })),
      nextRound: state.clubs.length * 2 - 1,
    };
    for (const match of state.matches) {
      matches += 1;
      goals += match.home.goals + match.away.goals;
      if (match.home.goals > match.away.goals) homeWins += 1;
      if (match.home.goals === match.away.goals) draws += 1;
    }
    const championId = seasonTable(state)[0]!.teamId;
    if (championId === shownFavouriteId) shownFavouriteTitles += 1;
    if (shownTopFiveIds.has(championId)) shownTopFiveTitles += 1;
  }

  return { games: lastSeed - firstSeed + 1, matches, goals, homeWins, draws, shownFavouriteTitles, shownTopFiveTitles };
}

export async function generatePlayableSeasonEvidence(): Promise<PlayableSeasonEvidenceReport> {
  const execFileAsync = promisify(execFile);
  const ranges = [[900001, 900250], [900251, 900500], [900501, 900750], [900751, 901000]] as const;
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
  }), { games: 0, matches: 0, goals: 0, homeWins: 0, draws: 0, shownFavouriteTitles: 0, shownTopFiveTitles: 0 });
  return {
    season: PLAYABLE_EVIDENCE_SEASON,
    firstSeed: PLAYABLE_EVIDENCE_FIRST_SEED,
    lastSeed: PLAYABLE_EVIDENCE_LAST_SEED,
    userClubId: "club-1",
    games: totals.games,
    matches: totals.matches,
    goalsPerMatch: totals.goals / totals.matches,
    homeWinRate: totals.homeWins / totals.matches,
    drawRate: totals.draws / totals.matches,
    shownFavouriteTitles: totals.shownFavouriteTitles,
    shownTopFiveTitles: totals.shownTopFiveTitles,
  };
}
