import { describe, expect, it } from "vitest";
import { newPlayableSeason, playMatchday, teamsForPlayableSeason } from "../src/playable-season.js";
import { SEASON_RULES } from "../src/rules.js";
import { matchdayCountForSeason, matchdayCountFromFixtures, ordinal, scorerRows } from "../src/web-display.js";
import type { SeasonRule } from "../src/rules.js";

const twentyClubRules: readonly SeasonRule[] = SEASON_RULES.map((rule) =>
  rule.rule === "firstDivisionTeams" ? { ...rule, value: 20 } : rule,
);

describe("web display", () => {
  it.each([
    [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"],
    [11, "11th"], [12, "12th"], [13, "13th"],
    [21, "21st"], [22, "22nd"], [23, "23rd"],
    [101, "101st"], [111, "111th"], [112, "112th"], [113, "113th"],
  ])("formats %i as %s", (position, expected) => {
    expect(ordinal(position)).toBe(expected);
  });

  it("derives the matchday total from the season rules and then the fixtures", () => {
    const state = newPlayableSeason(1981, 7001, "club-1", twentyClubRules);
    expect(matchdayCountForSeason(1981, twentyClubRules)).toBe(38);
    expect(matchdayCountFromFixtures(state.fixtures)).toBe(38);
  });

  it("resolves every scorer to that season's player name and club", () => {
    let state = newPlayableSeason(1981, 7002, "club-1", twentyClubRules);
    state = playMatchday(state, { formation: "4-4-2", style: "balanced", approach: "balanced", tackling: "normal" }, twentyClubRules);
    const squads = teamsForPlayableSeason(state);
    const players = new Map(squads.flatMap((team) =>
      [...team.starters, ...team.substitutes].map((player) => [player.id, { name: player.name, club: team.name }] as const),
    ));
    const rows = scorerRows(state);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.playerName).toBe(players.get(row.playerId)?.name);
      expect(row.clubName).toBe(players.get(row.playerId)?.club);
      expect(row.playerName).not.toBe(row.playerId);
    }
  });
});
