import { teamsForPlayableSeason, topScorers } from "./playable-season.js";
import { rulesForSeason } from "./rules.js";
import type { Fixture } from "./competition.js";
import type { PlayableSeason } from "./playable-season.js";
import type { SeasonId, SeasonRule } from "./rules.js";

export function ordinal(value: number): string {
  const remainder100 = Math.abs(value) % 100;
  const remainder10 = Math.abs(value) % 10;
  const suffix = remainder100 >= 11 && remainder100 <= 13
    ? "th"
    : remainder10 === 1 ? "st" : remainder10 === 2 ? "nd" : remainder10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

export function matchdayCountForSeason(season: SeasonId, table: readonly SeasonRule[]): number {
  return (rulesForSeason(season, table).firstDivisionTeams - 1) * 2;
}

export function matchdayCountFromFixtures(fixtures: readonly Fixture[]): number {
  return Math.max(0, ...fixtures.map((fixture) => fixture.round));
}

export interface ScorerRow {
  playerId: string;
  playerName: string;
  clubName: string;
  goals: number;
}

export function scorerRows(state: PlayableSeason): ScorerRow[] {
  const players = new Map(teamsForPlayableSeason(state).flatMap((team) =>
    [...team.starters, ...team.substitutes].map((player) => [player.id, { playerName: player.name, clubName: team.name }] as const),
  ));
  return topScorers(state).map((scorer) => {
    const player = players.get(scorer.playerId);
    if (!player) throw new Error(`Scorer ${scorer.playerId} is not in this season's squads`);
    return { playerId: scorer.playerId, ...player, goals: scorer.goals };
  });
}
