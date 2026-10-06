import { describe, expect, it } from "vitest";
import { clubsForSeason, loadPlayableSeason, newPlayableSeason, playMatchday, prepareNewPlayableSeason, ruleDescriptions, seasonTable, serializePlayableSeason, teamsForPlayableSeason, usualStyle } from "../src/playable-season.js";
import { rulesForSeason, SEASON_RULES } from "../src/rules.js";
import { actualSquadRating, makeTeam } from "../src/fixtures.js";
import type { PlayableSeason } from "../src/playable-season.js";
import type { SeasonRule } from "../src/rules.js";

const choices = { formation: "4-4-2", style: "balanced", approach: "balanced", tackling: "normal" } as const;
const finish = (initial: PlayableSeason, approach: "balanced" | "cautious" | "attacking" = "balanced") => {
  let state = initial;
  while (state.nextRound <= state.clubs.length * 2 - 2) state = playMatchday(state, { ...choices, approach });
  return state;
};

describe("playable season", () => {
  it("uses the dated 1981/82 five-strong-club league shape for several seeds", () => {
    for (const seed of [1, 1234, 900001, 0xffffffff]) {
      const levels = clubsForSeason(1981, SEASON_RULES, seed).map((club) => club.squadLevel);
      expect(levels.filter((level) => level >= 12 && level <= 13)).toHaveLength(5);
      expect(levels.filter((level) => level >= 7 && level <= 10.5)).toHaveLength(17);
      expect(levels.every((level) => (level >= 12 && level <= 13) || (level >= 7 && level <= 10.5))).toBe(true);
    }
  });

  it("shows each club's actual generated squad rating", () => {
    for (const club of clubsForSeason(1981, SEASON_RULES, 900001)) {
      expect(club.strength).toBe(actualSquadRating(makeTeam(club.squadId, club.squadLevel)));
    }
  });

  it("throws clearly when the season has no league-shape rule", () => {
    const withoutShape = SEASON_RULES.filter((rule) => rule.rule !== "divisionShapes");
    expect(() => clubsForSeason(1981, withoutShape, 1)).toThrow("divisionShapes for season 1981: no matching row");
  });

  it("builds a repeatable, seed-specific league and strength order", () => {
    const first = newPlayableSeason(1981, 1234, "club-1");
    const replay = newPlayableSeason(1981, 1234, "club-1");
    const other = newPlayableSeason(1981, 5678, "club-1");
    const strongest = (state: PlayableSeason) => state.clubs.reduce((best, club) => club.strength > best.strength ? club : best).id;

    expect(replay.clubs).toEqual(first.clubs);
    expect(teamsForPlayableSeason(replay)).toEqual(teamsForPlayableSeason(first));
    expect(teamsForPlayableSeason(other).map((team) => team.starters)).not.toEqual(teamsForPlayableSeason(first).map((team) => team.starters));
    expect(strongest(other)).not.toBe(strongest(first));
    expect(Math.min(...first.clubs.map((club) => club.squadLevel))).toBe(7);
    expect(Math.max(...first.clubs.map((club) => club.squadLevel))).toBe(13);
  });

  it("gives every game seed its own players even at the same squad level", () => {
    const first = clubsForSeason(1981, SEASON_RULES, 1234)[0]!;
    const generatedOther = clubsForSeason(1981, SEASON_RULES, 5678)[0]!;
    const other = { ...generatedOther, squadLevel: first.squadLevel };
    const firstPlayers = teamsForPlayableSeason({ clubs: [first], tactics: newPlayableSeason(1981, 1234, first.id).tactics, userClubId: first.id })[0]!.starters;
    const otherPlayers = teamsForPlayableSeason({ clubs: [other], tactics: newPlayableSeason(1981, 5678, other.id).tactics, userClubId: other.id })[0]!.starters;
    expect(other.squadId).not.toBe(first.squadId);
    expect(otherPlayers).not.toEqual(firstPlayers);
  });

  it("starts the exact league offered on the club-selection screen", () => {
    const offered = prepareNewPlayableSeason(1981, 2468);
    const started = offered.start("club-4");
    expect(started.seed).toBe(2468);
    expect(started.clubs).toEqual(offered.clubs);
    expect(started.fixtures).toEqual(newPlayableSeason(1981, 2468, "club-4").fixtures);
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

  it("uses the dated round-gap pattern for fixtures and player recovery", () => {
    const sixTeamRules = SEASON_RULES.map((rule) => {
      if (rule.rule === "firstDivisionTeams") return { ...rule, value: 6 };
      return rule;
    }) as SeasonRule[];
    const shortGapRules = sixTeamRules.map((rule) => rule.rule === "leagueRoundGapDays"
      ? { ...rule, value: [7, 3], source: "Test calendar alternating weekly and midweek rounds." }
      : rule) as SeasonRule[];
    const playWith = (table: readonly SeasonRule[]) => {
      let state = newPlayableSeason(1981, 13579, "club-1", table);
      while (state.nextRound <= state.clubs.length * 2 - 2) state = playMatchday(state, choices, table);
      return state;
    };

    const weekly = playWith(sixTeamRules);
    const midweek = playWith(shortGapRules);
    const averageCondition = (state: PlayableSeason) => Object.values(state.playerConditions)
      .reduce((total, condition) => total + condition, 0) / Object.keys(state.playerConditions).length;

    expect(midweek.fixtures.map((fixture) => fixture.daysSincePreviousRound))
      .not.toEqual(weekly.fixtures.map((fixture) => fixture.daysSincePreviousRound));
    expect(new Set(midweek.fixtures.map((fixture) => fixture.daysSincePreviousRound))).toEqual(new Set([3, 7]));
    expect(averageCondition(midweek)).toBeLessThan(averageCondition(weekly));
  }, 60_000);

  it("dates and describes the computer-club adaptation rate", () => {
    expect(rulesForSeason(1981).computerStyleAdaptRate).toBe(0.25);
    expect(ruleDescriptions(1981)).toContain("Computer clubs adapt in 25% of matches");
  });

  it("derives a computer club's usual style from its eleven's visible attributes", () => {
    const team = makeTeam("usual-style", 10);
    const passingTeam = structuredClone(team);
    for (const player of passingTeam.starters) if (player.primaryPosition !== "GK") {
      player.attributes.passing = 20;
      player.attributes.creativity = 20;
    }
    expect(usualStyle(passingTeam)).toBe("passing");
    for (const player of passingTeam.starters) player.hidden.adaptability *= -1;
    expect(usualStyle(passingTeam)).toBe("passing");
  });

  it("builds league size from rules data", () => {
    const custom = SEASON_RULES.map((rule) => rule.rule === "firstDivisionTeams" ? { ...rule, value: 6 } : rule) as SeasonRule[];
    expect(clubsForSeason(1981, custom, 1)).toHaveLength(6);
    expect(newPlayableSeason(1981, 1, "club-1", custom).clubs).toHaveLength(6);
  });

  it("plainly refuses another save version", () => {
    const json = serializePlayableSeason(newPlayableSeason(1981, 1, "club-1")).replace(`"version":4`, `"version":1`);
    expect(() => loadPlayableSeason(json)).toThrow("different version");
  });
});
