import { buildLeagueTable, buildSeasonPlayerStats, generateFixtures } from "./competition.js";
import { simulateMatch } from "./engine.js";
import { actualSquadRating, makeTeam } from "./fixtures.js";
import { SeededRandom } from "./random.js";
import { rulesForSeason, SEASON_RULES } from "./rules.js";
import type { Fixture, LeagueTableRow, SeasonPlayerStats } from "./competition.js";
import type { SeasonId, SeasonRule } from "./rules.js";
import type { MatchOutput, Tactics, TeamInput } from "./types.js";

export const PLAYABLE_SAVE_VERSION = 2;

export interface Club { id: string; squadId: string; name: string; strength: number; squadLevel: number }
export interface PlayableSeason {
  version: typeof PLAYABLE_SAVE_VERSION;
  seed: number;
  season: SeasonId;
  userClubId: string;
  clubs: Club[];
  fixtures: Fixture[];
  matches: MatchOutput[];
  nextRound: number;
  tactics: Tactics;
}

const CLUB_NAMES = ["Ashford Athletic", "Bramble Town", "Cedar Rovers", "Dunwich City", "Elmstead", "Foxley United", "Grantham Vale", "Hartwick", "Ironbridge", "Juniper Albion", "Kingsmere", "Larchfield", "Moorland County", "Northport", "Oakham Wanderers", "Penrose", "Queensbury", "Redcliffe", "Stonehaven", "Thornbury", "Upton Rangers", "Westcombe"];

export const DEFAULT_TACTICS: Omit<Tactics, "captainId" | "creatorId" | "targetForwardId"> = {
  formation: "4-4-2", style: "balanced", approach: "balanced", tackling: "normal",
};

export function ruleDescriptions(season: SeasonId, table: readonly SeasonRule[] = SEASON_RULES): string[] {
  const rules = rulesForSeason(season, table);
  return table.filter((row) => season >= row.firstSeason && (row.lastSeason === undefined || season <= row.lastSeason)).map((row) => row.rule === "pointsForAWin"
    ? `${rules.pointsForAWin} points for a win`
    : row.rule === "tableTieBreak"
      ? rules.tableTieBreak === "goalDifference" ? "Goal difference" : "Goal average"
      : `${rules.firstDivisionTeams} clubs in the First Division`);
}

export function clubsForSeason(season: SeasonId, table: readonly SeasonRule[] = SEASON_RULES, seed: number): Club[] {
  const count = rulesForSeason(season, table).firstDivisionTeams;
  if (!Number.isInteger(count) || count < 2 || count > CLUB_NAMES.length) throw new Error(`Unsupported First Division size: ${count}`);
  // Keep the established 7–13 range, but make genuinely exceptional squads rare
  // instead of distributing nominal levels uniformly across the division.
  const strengths = Array.from({ length: count }, (_, index) => 7 + (6 * (index / (count - 1)) ** 2));
  const random = new SeededRandom(seed);
  for (let index = strengths.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random.next() * (index + 1));
    [strengths[index], strengths[target]] = [strengths[target]!, strengths[index]!];
  }
  return CLUB_NAMES.slice(0, count).map((name, index) => {
    const squadLevel = strengths[index]!;
    const squadId = `game-${seed}-club-${index + 1}`;
    return {
      id: `club-${index + 1}`,
      squadId,
      name,
      squadLevel,
      strength: actualSquadRating(makeTeam(squadId, squadLevel)),
    };
  });
}

export function teamsForPlayableSeason(state: Pick<PlayableSeason, "clubs" | "tactics" | "userClubId">): TeamInput[] {
  return state.clubs.map((club) => {
    const team = makeTeam(club.squadId, club.squadLevel);
    team.id = club.id;
    team.name = club.name;
    if (club.id === state.userClubId) team.tactics = { ...team.tactics, ...state.tactics };
    return team;
  });
}

export function newPlayableSeason(season: SeasonId, seed: number, userClubId: string, table: readonly SeasonRule[] = SEASON_RULES): PlayableSeason {
  const clubs = clubsForSeason(season, table, seed);
  if (!clubs.some((club) => club.id === userClubId)) throw new Error("Choose a club in this division");
  const userClub = clubs.find((club) => club.id === userClubId)!;
  const user = makeTeam(userClub.squadId, userClub.squadLevel);
  const tactics = { ...user.tactics, ...DEFAULT_TACTICS };
  return { version: PLAYABLE_SAVE_VERSION, seed, season, userClubId, clubs, fixtures: generateFixtures(clubs.map((club) => club.id), seed), matches: [], nextRound: 1, tactics };
}

/** One seeded league shared by club selection and the season that selection starts. */
export function prepareNewPlayableSeason(season: SeasonId, seed: number, table: readonly SeasonRule[] = SEASON_RULES) {
  const clubs = clubsForSeason(season, table, seed);
  return {
    clubs,
    start(userClubId: string): PlayableSeason {
      const state = newPlayableSeason(season, seed, userClubId, table);
      return { ...state, clubs };
    },
  };
}

export function playMatchday(state: PlayableSeason, choices: Pick<Tactics, "formation" | "style" | "approach" | "tackling">, table: readonly SeasonRule[] = SEASON_RULES): PlayableSeason {
  if (state.nextRound > state.clubs.length * 2 - 2) throw new Error("The season is already complete");
  const tactics = { ...state.tactics, ...choices };
  const current = { ...state, tactics };
  const byId = new Map(teamsForPlayableSeason(current).map((team) => [team.id, team]));
  const roundFixtures = state.fixtures.filter((fixture) => fixture.round === state.nextRound);
  const additions = roundFixtures.map((fixture) => {
    const index = state.fixtures.findIndex((candidate) => candidate.round === fixture.round && candidate.homeId === fixture.homeId && candidate.awayId === fixture.awayId);
    return simulateMatch({ seed: (state.seed + index * 7919) >>> 0, home: byId.get(fixture.homeId)!, away: byId.get(fixture.awayId)! });
  });
  // Resolve rules now as well as when presenting the table, so invalid/custom data cannot be ignored.
  rulesForSeason(state.season, table);
  return { ...current, matches: [...state.matches, ...additions], nextRound: state.nextRound + 1 };
}

export function seasonTable(state: PlayableSeason, table: readonly SeasonRule[] = SEASON_RULES): LeagueTableRow[] {
  const played = buildLeagueTable(state.matches, rulesForSeason(state.season, table));
  const byId = new Map(played.map((row) => [row.teamId, row]));
  return state.clubs.map((club) => byId.get(club.id) ?? { teamId: club.id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 })
    .sort((a, b) => played.indexOf(a) - played.indexOf(b));
}

export function topScorers(state: PlayableSeason): SeasonPlayerStats[] { return buildSeasonPlayerStats(state.matches); }
export function isFinished(state: PlayableSeason): boolean { return state.nextRound > state.clubs.length * 2 - 2; }
export function serializePlayableSeason(state: PlayableSeason): string { return JSON.stringify(state); }
export function loadPlayableSeason(json: string): PlayableSeason {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new Error("This saved game is not valid."); }
  if (typeof value !== "object" || value === null || !("version" in value)) throw new Error("This saved game is not valid.");
  if ((value as { version: unknown }).version !== PLAYABLE_SAVE_VERSION) throw new Error("This saved game was made by a different version and cannot be loaded.");
  const state = value as PlayableSeason;
  if (!Array.isArray(state.clubs) || !Array.isArray(state.fixtures) || !Array.isArray(state.matches) || typeof state.season !== "number") throw new Error("This saved game is not valid.");
  return state;
}
