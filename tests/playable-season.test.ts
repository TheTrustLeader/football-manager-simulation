import { describe, expect, it } from "vitest";
import { clubsForSeason, loadPlayableSeason, newPlayableSeason, playMatchday, ruleDescriptions, seasonTable, serializePlayableSeason, teamsForPlayableSeason } from "../src/playable-season.js";
import { SEASON_RULES } from "../src/rules.js";
import type { PlayableSeason } from "../src/playable-season.js";
import type { SeasonRule } from "../src/rules.js";

const choices = { formation: "4-4-2", style: "balanced", approach: "balanced", tackling: "normal" } as const;
const finish = (initial: PlayableSeason, approach: "balanced" | "cautious" | "attacking" = "balanced") => {
  let state = initial;
  while (state.nextRound <= state.clubs.length * 2 - 2) state = playMatchday(state, { ...choices, approach });
  return state;
};

describe("playable season", () => {
  it("builds a repeatable, seed-specific league and strength order", () => {
    const first = newPlayableSeason(1981, 1234, "club-1");
    const replay = newPlayableSeason(1981, 1234, "club-1");
    const other = newPlayableSeason(1981, 5678, "club-1");
    const strongest = (state: PlayableSeason) => state.clubs.reduce((best, club) => club.strength > best.strength ? club : best).id;

    expect(replay.clubs).toEqual(first.clubs);
    expect(teamsForPlayableSeason(replay)).toEqual(teamsForPlayableSeason(first));
    expect(teamsForPlayableSeason(other).map((team) => team.starters)).not.toEqual(teamsForPlayableSeason(first).map((team) => team.starters));
    expect(strongest(other)).not.toBe(strongest(first));
    expect(Math.min(...first.clubs.map((club) => club.strength))).toBe(7);
    expect(Math.max(...first.clubs.map((club) => club.strength))).toBe(13);
  });

  it("plays a reconciled 22-club, 462-match season", () => {
    const state = finish(newPlayableSeason(1981, 13579, "club-1"));
    expect(state.clubs).toHaveLength(22);
    expect(state.matches).toHaveLength(462);
    const table = seasonTable(state);
    expect(table).toHaveLength(22);
    for (const row of table) {
      expect(row.played).toBe(42);
      expect(row.points).toBe(3 * row.won + row.drawn);
      expect(row.goalDifference).toBe(row.goalsFor - row.goalsAgainst);
      const fixtures = state.fixtures.filter((f) => f.homeId === row.teamId || f.awayId === row.teamId);
      expect(fixtures.filter((f) => f.homeId === row.teamId)).toHaveLength(21);
      expect(fixtures.filter((f) => f.awayId === row.teamId)).toHaveLength(21);
    }
    expect(table).toEqual([...table].sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.teamId.localeCompare(b.teamId)));
  }, 60_000);

  it("passes user choices only into matches involving that club", () => {
    const cautious = finish(newPlayableSeason(1981, 24680, "club-1"), "cautious");
    const attacking = finish(newPlayableSeason(1981, 24680, "club-1"), "attacking");
    const score = (m: typeof cautious.matches[number]) => `${m.home.goals}-${m.away.goals}`;
    const userIndexes = cautious.matches.map((m, i) => m.homeTeamId === "club-1" || m.awayTeamId === "club-1" ? i : -1).filter((i) => i >= 0);
    const otherIndexes = cautious.matches.map((m, i) => m.homeTeamId !== "club-1" && m.awayTeamId !== "club-1" ? i : -1).filter((i) => i >= 0);
    expect(userIndexes.some((i) => score(cautious.matches[i]!) !== score(attacking.matches[i]!))).toBe(true);
    expect(otherIndexes.map((i) => attacking.matches[i])).toEqual(otherIndexes.map((i) => cautious.matches[i]));
  }, 60_000);

  it("resumes after ten matchdays byte-identically", () => {
    const initial = newPlayableSeason(1981, 97531, "club-7");
    const straight = finish(initial);
    let paused = initial;
    for (let i = 0; i < 10; i += 1) paused = playMatchday(paused, choices);
    const resumed = finish(loadPlayableSeason(serializePlayableSeason(paused)));
    expect(serializePlayableSeason(resumed) === serializePlayableSeason(straight)).toBe(true);
  }, 60_000);

  it("uses rules data for displayed text and table points", () => {
    const custom = SEASON_RULES.map((rule) => rule.rule === "pointsForAWin" ? { ...rule, value: 2, source: "Test league awards 2 points for a win." } : rule) as SeasonRule[];
    let state = newPlayableSeason(1981, 111, "club-1", custom);
    state = playMatchday(state, choices, custom);
    const winner = seasonTable(state, custom).find((row) => row.won === 1);
    expect(winner?.points).toBe(2);
    expect(ruleDescriptions(1981, custom)).toContain("2 points for a win");
  });

  it("builds league size from rules data", () => {
    const custom = SEASON_RULES.map((rule) => rule.rule === "firstDivisionTeams" ? { ...rule, value: 6 } : rule) as SeasonRule[];
    expect(clubsForSeason(1981, custom)).toHaveLength(6);
    expect(newPlayableSeason(1981, 1, "club-1", custom).clubs).toHaveLength(6);
  });

  it("plainly refuses another save version", () => {
    const json = serializePlayableSeason(newPlayableSeason(1981, 1, "club-1")).replace('"version":1', '"version":999');
    expect(() => loadPlayableSeason(json)).toThrow("different version");
  });
});
