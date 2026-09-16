import { describe, expect, it } from "vitest";
import { buildLeagueTable, runSeason } from "../src/competition.js";
import { makeTeam } from "../src/fixtures.js";
import { rulesForSeason } from "../src/rules.js";
import type { SeasonRule } from "../src/rules.js";
import type { MatchOutput } from "../src/types.js";

const CHANGING_RULES: readonly SeasonRule[] = [
  {
    rule: "pointsForAWin", value: 3, firstSeason: 1981, lastSeason: 1989,
    source: "Test boundary before the invented change.",
  },
  {
    rule: "pointsForAWin", value: 2, firstSeason: 1990,
    source: "Test boundary after the invented change.",
  },
  {
    rule: "tableTieBreak", value: "goalDifference", firstSeason: 1981,
    source: "Test tie-break row.",
  },
];

function result(homeTeamId: string, homeGoals: number, awayTeamId: string, awayGoals: number): MatchOutput {
  return { homeTeamId, awayTeamId, home: { goals: homeGoals }, away: { goals: awayGoals } } as MatchOutput;
}

const MATCHES = [
  result("alpha", 1, "bravo", 0),
  result("alpha", 1, "charlie", 1),
];

describe("season rules", () => {
  it("changes the same match results when the win-points rule changes", () => {
    const table1989 = buildLeagueTable(MATCHES, rulesForSeason(1989, CHANGING_RULES));
    const table1990 = buildLeagueTable(MATCHES, rulesForSeason(1990, CHANGING_RULES));

    expect(table1989.find((row) => row.teamId === "alpha")?.points).toBe(4);
    expect(table1990.find((row) => row.teamId === "alpha")?.points).toBe(3);
  });

  it("selects both sides of an inclusive season boundary from the supplied table", () => {
    expect(rulesForSeason(1989, CHANGING_RULES).pointsForAWin).toBe(3);
    expect(rulesForSeason(1990, CHANGING_RULES).pointsForAWin).toBe(2);
  });

  it("has the English rules in force at the game start", () => {
    expect(rulesForSeason(1981)).toEqual({
      pointsForAWin: 3,
      tableTieBreak: "goalDifference",
    });
  });

  it("rejects seasons before the game starts through lookup and season play", () => {
    expect(() => rulesForSeason(1980)).toThrow("before the game starts");
    expect(() => runSeason([makeTeam("alpha", 10), makeTeam("bravo", 10)], 1, 1980))
      .toThrow("before the game starts");
  });

  it("rejects a non-integer season", () => {
    expect(() => rulesForSeason(1981.5)).toThrow("must be an integer");
  });

  it.each([1989, 1990])("conserves points under the rules for %i", (season) => {
    const rules = rulesForSeason(season, CHANGING_RULES);
    const table = buildLeagueTable(MATCHES, rules);
    const wins = table.reduce((total, row) => total + row.won, 0);
    const draws = table.reduce((total, row) => total + row.drawn, 0) / 2;
    const points = table.reduce((total, row) => total + row.points, 0);

    expect(points).toBe(wins * rules.pointsForAWin + draws * 2);
  });

  it("rejects a gap with the rule name and season", () => {
    const gap = CHANGING_RULES.filter((row) => row.rule !== "pointsForAWin");
    expect(() => rulesForSeason(1989, gap)).toThrow("pointsForAWin for season 1989: no matching row");
  });

  it("rejects overlapping rows with the rule name and season", () => {
    const overlap: readonly SeasonRule[] = [
      ...CHANGING_RULES,
      { rule: "pointsForAWin", value: 4, firstSeason: 1989, source: "Test overlap." },
    ];
    expect(() => rulesForSeason(1989, overlap))
      .toThrow("pointsForAWin for season 1989: overlapping rows");
  });
});
