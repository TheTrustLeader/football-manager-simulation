import { simulateMatch } from "./engine.js";
import { SeededRandom } from "./random.js";
import type { MatchOutput, TeamInput } from "./types.js";

/**
 * GATE 2 GROUNDWORK - the smallest thing that turns a match engine into a
 * competition: a fixture list, a table, and a season that replays exactly.
 *
 * Pure functions over the EXISTING match output. The engine is not touched and
 * knows nothing about this file.
 *
 * Deliberately absent, because they are product decisions and not groundwork:
 * promotion, relegation, cups, transfers, finances, ageing between seasons,
 * squad rotation, injuries, league size and team naming.
 */

export interface Fixture {
  round: number;
  homeId: string;
  awayId: string;
}

export interface LeagueTableRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface SeasonPlayerStats {
  playerId: string;
  appearances: number;
  goals: number;
  meanRating: number;
}

export interface SeasonResult {
  seed: number;
  teamIds: string[];
  fixtures: Fixture[];
  matches: MatchOutput[];
  table: LeagueTableRow[];
  playerStats: SeasonPlayerStats[];
}

const POINTS_FOR_A_WIN = 3;
const POINTS_FOR_A_DRAW = 1;
const BYE = " bye";

/** Fisher-Yates driven by the repo's own seeded generator, so a seed fixes the order. */
function seededShuffle<T>(values: readonly T[], random: SeededRandom): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random.next() * (i + 1));
    const held = out[i]!;
    out[i] = out[j]!;
    out[j] = held;
  }
  return out;
}

/**
 * Double round-robin: every team plays every other twice, once at home and once
 * away, so each ORDERED pair appears exactly once.
 *
 * Circle method. One team is held fixed while the rest rotate, which pairs
 * everyone exactly once per half. An odd number of teams gets a bye placeholder
 * whose fixtures are dropped, so that team simply has a free round. The second
 * half repeats the first with home and away swapped, which is also what balances
 * home and away counts across the season.
 */
export function generateFixtures(teamIds: readonly string[], seed: number): Fixture[] {
  if (teamIds.length < 2) throw new Error("A competition needs at least two teams");
  if (new Set(teamIds).size !== teamIds.length) throw new Error("Team ids must be unique");

  const order = seededShuffle(teamIds, new SeededRandom(seed));
  const entries = order.length % 2 === 0 ? order : [...order, BYE];
  const half = entries.length / 2;
  const roundsPerHalf = entries.length - 1;

  const fixtures: Fixture[] = [];
  let rotation = entries.slice(1);

  for (let round = 0; round < roundsPerHalf; round += 1) {
    const arrangement = [entries[0]!, ...rotation];
    for (let i = 0; i < half; i += 1) {
      const a = arrangement[i]!;
      const b = arrangement[arrangement.length - 1 - i]!;
      if (a === BYE || b === BYE) continue;
      fixtures.push({ round: round + 1, homeId: a, awayId: b });
      fixtures.push({ round: round + 1 + roundsPerHalf, homeId: b, awayId: a });
    }
    rotation = [rotation[rotation.length - 1]!, ...rotation.slice(0, -1)];
  }

  return fixtures.sort((x, y) => x.round - y.round
    || x.homeId.localeCompare(y.homeId)
    || x.awayId.localeCompare(y.awayId));
}

/**
 * Build the table. 3 for a win, 1 for a draw.
 *
 * Ordering: points, then goal difference, then goals scored, then team id. That
 * last one is not a footballing rule. It is there so the order is never
 * ambiguous, because two teams level on everything must still come out in the
 * same order every run or "byte-identical season" means nothing.
 */
export function buildLeagueTable(matches: readonly MatchOutput[]): LeagueTableRow[] {
  const rows = new Map<string, LeagueTableRow>();
  const row = (teamId: string): LeagueTableRow => {
    const existing = rows.get(teamId);
    if (existing) return existing;
    const fresh: LeagueTableRow = {
      teamId, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    };
    rows.set(teamId, fresh);
    return fresh;
  };

  for (const match of matches) {
    const home = row(match.homeTeamId);
    const away = row(match.awayTeamId);
    const homeGoals = match.home.goals;
    const awayGoals = match.away.goals;

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeGoals;
    home.goalsAgainst += awayGoals;
    away.goalsFor += awayGoals;
    away.goalsAgainst += homeGoals;

    if (homeGoals > awayGoals) {
      home.won += 1;
      away.lost += 1;
      home.points += POINTS_FOR_A_WIN;
    } else if (homeGoals < awayGoals) {
      away.won += 1;
      home.lost += 1;
      away.points += POINTS_FOR_A_WIN;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += POINTS_FOR_A_DRAW;
      away.points += POINTS_FOR_A_DRAW;
    }
  }

  for (const entry of rows.values()) {
    entry.goalDifference = entry.goalsFor - entry.goalsAgainst;
  }

  return [...rows.values()].sort((a, b) => b.points - a.points
    || b.goalDifference - a.goalDifference
    || b.goalsFor - a.goalsFor
    || a.teamId.localeCompare(b.teamId));
}

/** Roll the contribution ledger up for players who appeared in each match. */
export function buildSeasonPlayerStats(matches: readonly MatchOutput[]): SeasonPlayerStats[] {
  const totals = new Map<string, { appearances: number; goals: number; ratingTotal: number }>();

  for (const match of matches) {
    for (const contribution of match.contributions) {
      if (contribution.minutesPlayed <= 0) continue;
      const entry = totals.get(contribution.playerId) ?? {
        appearances: 0,
        goals: 0,
        ratingTotal: 0,
      };
      entry.appearances += 1;
      entry.goals += contribution.goals;
      entry.ratingTotal += contribution.rating;
      totals.set(contribution.playerId, entry);
    }
  }

  return [...totals.entries()].map(([playerId, total]) => ({
    playerId,
    appearances: total.appearances,
    goals: total.goals,
    meanRating: total.ratingTotal / total.appearances,
  })).sort((a, b) => b.goals - a.goals
    || b.meanRating - a.meanRating
    || b.appearances - a.appearances
    || a.playerId.localeCompare(b.playerId));
}

/**
 * Play a whole fixture list through the existing engine.
 *
 * Each match seed is derived from the season seed and the fixture's position, so
 * the same season seed with the same teams reproduces the season exactly, and a
 * different seed does not.
 */
export function runSeason(teams: readonly TeamInput[], seed: number): SeasonResult {
  const byId = new Map(teams.map((team) => [team.id, team]));
  if (byId.size !== teams.length) throw new Error("Team ids must be unique");

  const teamIds = teams.map((team) => team.id);
  const fixtures = generateFixtures(teamIds, seed);
  const matches = fixtures.map((fixture, index) => simulateMatch({
    seed: (seed + index * 7919) >>> 0,
    home: byId.get(fixture.homeId)!,
    away: byId.get(fixture.awayId)!,
  }));

  return {
    seed,
    teamIds,
    fixtures,
    matches,
    table: buildLeagueTable(matches),
    playerStats: buildSeasonPlayerStats(matches),
  };
}

/** A table a human can read, so the football can be eyeballed for sanity. */
export function formatLeagueTable(table: readonly LeagueTableRow[]): string {
  const head = ["#", "Team", "P", "W", "D", "L", "F", "A", "GD", "Pts"];
  const body = table.map((r, i) => [
    String(i + 1), r.teamId, String(r.played), String(r.won), String(r.drawn),
    String(r.lost), String(r.goalsFor), String(r.goalsAgainst),
    r.goalDifference > 0 ? `+${r.goalDifference}` : String(r.goalDifference),
    String(r.points),
  ]);
  const widths = head.map((_, col) => Math.max(
    head[col]!.length,
    ...body.map((r) => r[col]!.length),
  ));
  const line = (cells: string[]): string => cells
    .map((cell, col) => (col === 1 ? cell.padEnd(widths[col]!) : cell.padStart(widths[col]!)))
    .join("  ");
  return [line(head), widths.map((w) => "-".repeat(w)).join("  "), ...body.map(line)].join("\n");
}

/** A compact scoring leaderboard, retaining rating precision from the ledger. */
export function formatTopScorers(playerStats: readonly SeasonPlayerStats[], limit = 10): string {
  const head = ["#", "Player", "Apps", "Goals", "Avg"];
  const body = playerStats.slice(0, limit).map((player, index) => [
    String(index + 1),
    player.playerId,
    String(player.appearances),
    String(player.goals),
    player.meanRating.toFixed(2),
  ]);
  const widths = head.map((_, col) => Math.max(
    head[col]!.length,
    ...body.map((row) => row[col]!.length),
  ));
  const line = (cells: string[]): string => cells
    .map((cell, col) => (col === 1 ? cell.padEnd(widths[col]!) : cell.padStart(widths[col]!)))
    .join("  ");
  return [line(head), widths.map((width) => "-".repeat(width)).join("  "), ...body.map(line)].join("\n");
}
