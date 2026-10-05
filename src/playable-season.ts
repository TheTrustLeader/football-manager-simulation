import { buildLeagueTable, buildSeasonPlayerStats, generateFixtures } from "./competition.js";
import { simulateMatch } from "./engine.js";
import { ENGINE_CONFIG } from "./engine-config.js";
import { actualSquadRating, makeTeam } from "./fixtures.js";
import { SeededRandom } from "./random.js";
import { rulesForSeason, SEASON_RULES } from "./rules.js";
import type { Fixture, LeagueTableRow, SeasonPlayerStats } from "./competition.js";
import type { SeasonId, SeasonRule } from "./rules.js";
import type { MatchDecision, MatchOutput, Player, Position, Style, Tactics, TeamInput } from "./types.js";

export const PLAYABLE_SAVE_VERSION = 4;

/**
 * Players regain ten condition points per clear day between fixtures. A typical
 * full match costs roughly forty points, so a seven-day league week restores a
 * regular starter, while a three-day turnaround compounds fatigue and makes a
 * one-match rest materially useful.
 */
export const CONDITION_RECOVERY_PER_DAY = 10;

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
  selection: MatchdaySelection;
  playerConditions: Record<string, number>;
}

export interface MatchdaySelection {
  starterIds: string[];
  playedPositions: Record<string, Position>;
  substituteIds: string[];
  substitutePlan?: { minute: number; playerOff: string; playerOn: string; whenTrailing: boolean };
}

export interface MatchdayChoices extends Pick<Tactics, "formation" | "style" | "approach" | "tackling"> {
  selection?: MatchdaySelection;
}

export const CLUB_NAMES = ["Ashford Athletic", "Bramble Town", "Cedar Rovers", "Dunwich City", "Elmstead", "Foxley United", "Grantham Vale", "Hartwick", "Ironbridge", "Juniper Albion", "Kingsmere", "Larchfield", "Moorland County", "Northport", "Oakham Wanderers", "Penrose", "Queensbury", "Redcliffe", "Stonehaven", "Thornbury", "Upton Rangers", "Westcombe"];

export const DEFAULT_TACTICS: Omit<Tactics, "captainId" | "creatorId" | "targetForwardId"> = {
  formation: "4-4-2", style: "balanced", approach: "balanced", tackling: "normal",
};

const STYLES: readonly Style[] = ["passing", "direct", "counter", "balanced"];

/** The usual style is wholly derived from the visible attributes of the current eleven. */
export function usualStyle(team: TeamInput): Style {
  const players = team.starters.filter((player) => player.primaryPosition !== "GK");
  const average = (attribute: "passing" | "creativity" | "pace" | "aerial" | "finishing" | "defending" | "stamina" | "leadership") =>
    players.reduce((sum, player) => sum + player.attributes[attribute], 0) / players.length;
  const overall = (["passing", "creativity", "pace", "aerial", "finishing", "defending"] as const)
    .reduce((sum, attribute) => sum + average(attribute), 0) / 6;
  const scores: Record<Style, number> = {
    passing: (average("passing") + average("creativity")) / 2 - overall - ENGINE_CONFIG.style.fit.profileOffset.passing,
    direct: (average("pace") + average("aerial") + average("finishing")) / 3 - overall - ENGINE_CONFIG.style.fit.profileOffset.direct,
    counter: (average("defending") + average("aerial")) / 2 - overall - ENGINE_CONFIG.style.fit.profileOffset.counter,
    balanced: (average("stamina") + average("leadership")) / 2 - overall - ENGINE_CONFIG.style.fit.profileOffset.balanced,
  };
  return STYLES.reduce((best, style) => scores[style] > scores[best] ? style : best);
}

export function styleThatBeats(opponentStyle: Style, matchups: ReturnType<typeof rulesForSeason>["styleMatchups"]): Style {
  const best = STYLES.reduce((winner, style) => matchups[style][opponentStyle] > matchups[winner][opponentStyle] ? style : winner);
  return matchups[best][opponentStyle] > 1 ? best : "balanced";
}

function computerStyle(team: TeamInput, opponent: TeamInput, seed: number, adaptRate: number, matchups: ReturnType<typeof rulesForSeason>["styleMatchups"]): Style {
  const usual = usualStyle(team);
  const roll = new SeededRandom((seed ^ [...team.id].reduce((hash, character) => Math.imul(hash, 31) + character.charCodeAt(0), 0)) >>> 0).next();
  if (roll >= adaptRate) return usual;
  const opponentUsual = usualStyle(opponent);
  return styleThatBeats(opponentUsual, matchups);
}

let cachedSquadKey = "";
let cachedTeams: TeamInput[] = [];

export function ruleDescriptions(season: SeasonId, table: readonly SeasonRule[] = SEASON_RULES): string[] {
  const rules = rulesForSeason(season, table);
  return table.filter((row) => season >= row.firstSeason && (row.lastSeason === undefined || season <= row.lastSeason)).map((row) => row.rule === "leagueRoundGapDays"
    ? `League round gaps repeat every ${rules.leagueRoundGapDays.join(", ")} days`
    : row.rule === "pointsForAWin"
      ? `${rules.pointsForAWin} points for a win`
    : row.rule === "tableTieBreak"
      ? rules.tableTieBreak === "goalDifference" ? "Goal difference" : "Goal average"
      : row.rule === "firstDivisionTeams"
        ? `${rules.firstDivisionTeams} clubs in the First Division`
        : row.rule === "leagueShape"
          ? `${rules.leagueShape.strongClubCount} strong clubs`
        : row.rule === "substitutesNamed"
            ? `${rules.substitutesNamed} substitute named`
            : row.rule === "substitutesUsed"
              ? `${rules.substitutesUsed} substitute used`
              : row.rule === "computerStyleAdaptRate"
                ? `Computer clubs adapt in ${Math.round(rules.computerStyleAdaptRate * 100)}% of matches`
                : "Dated tactical match-ups" );
}

function evenlySpread(count: number, minimum: number, maximum: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [minimum];
  return Array.from({ length: count }, (_, index) => minimum + ((maximum - minimum) * index / (count - 1)));
}

export function clubsForSeason(season: SeasonId, table: readonly SeasonRule[] = SEASON_RULES, seed: number): Club[] {
  const rules = rulesForSeason(season, table);
  const count = rules.firstDivisionTeams;
  if (!Number.isInteger(count) || count < 2 || count > CLUB_NAMES.length) throw new Error(`Unsupported First Division size: ${count}`);
  const shape = rules.leagueShape;
  if (!Number.isInteger(shape.strongClubCount) || shape.strongClubCount < 0 || shape.strongClubCount > count) {
    throw new Error(`Invalid league shape for season ${season}: ${shape.strongClubCount} strong clubs for ${count} teams`);
  }
  const strengths = [
    ...evenlySpread(count - shape.strongClubCount, shape.otherMinimum, shape.otherMaximum),
    ...evenlySpread(shape.strongClubCount, shape.strongMinimum, shape.strongMaximum),
  ];
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
  const key = state.clubs.map((club) => club.squadId).join("|");
  if (key !== cachedSquadKey) {
    cachedSquadKey = key;
    cachedTeams = state.clubs.map((club) => makeTeam(club.squadId, club.squadLevel));
  }
  return state.clubs.map((club, index) => {
    const team = { ...cachedTeams[index]! };
    team.id = club.id;
    team.name = club.name;
    if (club.id === state.userClubId) team.tactics = { ...team.tactics, ...state.tactics };
    return team;
  });
}

export function playableSquad(state: Pick<PlayableSeason, "clubs" | "userClubId">): Player[] {
  const club = state.clubs.find((candidate) => candidate.id === state.userClubId)!;
  const team = teamsForPlayableSeason({ ...state, tactics: DEFAULT_TACTICS as Tactics })
    .find((candidate) => candidate.id === club.id)!;
  return [...team.starters, ...team.substitutes];
}

function selectedTeam(team: TeamInput, selection: MatchdaySelection, formation: Tactics["formation"]): TeamInput {
  const squad = new Map([...team.starters, ...team.substitutes].map((player) => [player.id, player]));
  if (selection.starterIds.length !== 11 || new Set(selection.starterIds).size !== 11) throw new Error("Choose exactly 11 different starters");
  const starters = selection.starterIds.map((id) => squad.get(id));
  const substitutes = selection.substituteIds.map((id) => squad.get(id));
  if ([...starters, ...substitutes].some((player) => !player)) throw new Error("Selection contains a player outside the squad");
  if (new Set([...selection.starterIds, ...selection.substituteIds]).size !== 11 + selection.substituteIds.length) throw new Error("A player cannot be both starter and substitute");
  const picked = (starters as Player[]).map((player) => {
    const playedPosition = selection.playedPositions?.[player.id];
    if (!playedPosition) throw new Error(`${player.name} is missing a played position`);
    return { ...player, playedPosition } as Player;
  });
  const [defenders, midfielders, forwards] = formation.split("-").map(Number);
  if (picked.filter((player) => player.playedPosition === "GK").length !== 1
    || picked.filter((player) => player.playedPosition === "CB" || player.playedPosition === "FB").length !== defenders
    || picked.filter((player) => player.playedPosition === "CM" || player.playedPosition === "WM").length !== midfielders
    || picked.filter((player) => player.playedPosition === "FW").length !== forwards) throw new Error(`The chosen eleven cannot fill ${formation}`);
  return { ...team, starters: picked, substitutes: substitutes as Player[] };
}

export function newPlayableSeason(season: SeasonId, seed: number, userClubId: string, table: readonly SeasonRule[] = SEASON_RULES): PlayableSeason {
  const clubs = clubsForSeason(season, table, seed);
  if (!clubs.some((club) => club.id === userClubId)) throw new Error("Choose a club in this division");
  const userClub = clubs.find((club) => club.id === userClubId)!;
  const user = makeTeam(userClub.squadId, userClub.squadLevel);
  const tactics = { ...user.tactics, ...DEFAULT_TACTICS };
  const teams = clubs.map((club) => makeTeam(club.squadId, club.squadLevel));
  const selectedUser = teams[clubs.findIndex((club) => club.id === userClubId)]!;
  const rules = rulesForSeason(season, table);
  const selection = {
    starterIds: selectedUser.starters.map((player) => player.id),
    playedPositions: Object.fromEntries(selectedUser.starters.map((player) => [player.id, player.primaryPosition])),
    substituteIds: selectedUser.substitutes.slice(0, rules.substitutesNamed).map((player) => player.id),
  };
  const playerConditions = Object.fromEntries(teams.flatMap((team) => [...team.starters, ...team.substitutes]).map((player) => [player.id, player.state.condition]));
  return { version: PLAYABLE_SAVE_VERSION, seed, season, userClubId, clubs, fixtures: generateFixtures(clubs.map((club) => club.id), seed, season, table), matches: [], nextRound: 1, tactics, selection, playerConditions };
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

export function playMatchday(state: PlayableSeason, choices: MatchdayChoices, table: readonly SeasonRule[] = SEASON_RULES, reusableComputerMatches?: ReadonlyMap<number, MatchOutput>): PlayableSeason {
  if (state.nextRound > state.clubs.length * 2 - 2) throw new Error("The season is already complete");
  const tactics = { ...state.tactics, ...choices };
  const rules = rulesForSeason(state.season, table);
  const selection = choices.selection ?? state.selection;
  if (selection.substituteIds.length !== rules.substitutesNamed) throw new Error(`Name exactly ${rules.substitutesNamed} substitute${rules.substitutesNamed === 1 ? "" : "s"}`);
  const current = { ...state, tactics, selection };
  const roundFixtures = state.fixtures.filter((fixture) => fixture.round === state.nextRound);
  const daysSincePreviousRound = roundFixtures[0]?.daysSincePreviousRound;
  if (daysSincePreviousRound === undefined || roundFixtures.some((fixture) => fixture.daysSincePreviousRound !== daysSincePreviousRound)) throw new Error("Every fixture in a round must state the same days since the previous round");
  const recoveredConditions = Object.fromEntries(Object.entries(state.playerConditions).map(([id, condition]) => [id,
    state.nextRound === 1 ? condition : Math.min(100, condition + daysSincePreviousRound * CONDITION_RECOVERY_PER_DAY),
  ]));
  const teams = teamsForPlayableSeason(current).map((team) => ({ ...team,
    starters: team.starters.map((player) => ({ ...player, state: { ...player.state, condition: recoveredConditions[player.id] ?? player.state.condition } })),
    substitutes: team.substitutes.map((player) => ({ ...player, state: { ...player.state, condition: recoveredConditions[player.id] ?? player.state.condition } })),
  }));
  const byId = new Map(teams.map((team) => [team.id, team]));
  byId.set(state.userClubId, selectedTeam(byId.get(state.userClubId)!, selection, tactics.formation));
  const additions = roundFixtures.map((fixture) => {
    const index = state.fixtures.findIndex((candidate) => candidate.round === fixture.round && candidate.homeId === fixture.homeId && candidate.awayId === fixture.awayId);
    const reusable = fixture.homeId !== state.userClubId && fixture.awayId !== state.userClubId ? reusableComputerMatches?.get(index) : undefined;
    if (reusable) return reusable;
    const home = byId.get(fixture.homeId)!;
    const away = byId.get(fixture.awayId)!;
    const matchSeed = (state.seed + index * 7919) >>> 0;
    let matchHome = { ...home, starters: home.starters.map((player) => ({ ...player, playedPosition: player.primaryPosition } as Player)), substitutes: home.substitutes.slice(0, rules.substitutesNamed) };
    let matchAway = { ...away, starters: away.starters.map((player) => ({ ...player, playedPosition: player.primaryPosition } as Player)), substitutes: away.substitutes.slice(0, rules.substitutesNamed) };
    if (home.id !== state.userClubId) matchHome = { ...matchHome, tactics: { ...matchHome.tactics, style: computerStyle(home, away, matchSeed, rules.computerStyleAdaptRate, rules.styleMatchups) } };
    if (away.id !== state.userClubId) matchAway = { ...matchAway, tactics: { ...matchAway.tactics, style: computerStyle(away, home, matchSeed, rules.computerStyleAdaptRate, rules.styleMatchups) } };
    const user = fixture.homeId === state.userClubId ? matchHome : fixture.awayId === state.userClubId ? matchAway : undefined;
    const plan = selection.substitutePlan;
    const decisions: MatchDecision[] | undefined = user && plan ? [{ ...plan, teamId: user.id, type: "substitution" }] : undefined;
    return simulateMatch({ seed: matchSeed, home: matchHome, away: matchAway, captureMinuteSnapshots: false, ...(decisions ? { decisions } : {}), seasonRules: rules });
  });
  // Resolve rules now as well as when presenting the table, so invalid/custom data cannot be ignored.
  const playerConditions = Object.assign({}, recoveredConditions, ...additions.map((match) => match.finalCondition));
  return { ...current, matches: [...state.matches, ...additions], nextRound: state.nextRound + 1, playerConditions };
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
  const version = (value as { version: unknown }).version;
  if (version !== PLAYABLE_SAVE_VERSION && version !== 3) throw new Error("This saved game was made by a different version and cannot be loaded.");
  let state = value as PlayableSeason;
  if (!Array.isArray(state.clubs) || !Array.isArray(state.fixtures) || !Array.isArray(state.matches) || typeof state.season !== "number") throw new Error("This saved game is not valid.");
  if (version === 3) {
    const squad = playableSquad(state);
    const natural = new Map(squad.map((player) => [player.id, player.primaryPosition]));
    const playedPositions = Object.fromEntries(state.selection.starterIds.map((id) => {
      const position = natural.get(id);
      if (!position) throw new Error("This saved game is not valid.");
      return [id, position];
    }));
    state = { ...state, version: PLAYABLE_SAVE_VERSION, selection: {
      ...state.selection,
      playedPositions,
    } };
  }
  return state;
}
