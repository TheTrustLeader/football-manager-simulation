import { describe, expect, it } from "vitest";
import { buildLeagueTable, generateFixtures, runSeason } from "../src/competition.js";
import { makeTeam } from "../src/fixtures.js";
import type { MatchOutput } from "../src/types.js";

// buildLeagueTable reads only the four fields below, so a table test does not
// need a real simulated match. Stating that plainly beats a fixture that looks
// like a match output but is not one.
function result(homeTeamId: string, homeGoals: number, awayTeamId: string, awayGoals: number): MatchOutput {
  return {
    homeTeamId,
    awayTeamId,
    home: { goals: homeGoals },
    away: { goals: awayGoals },
  } as unknown as MatchOutput;
}

const orderedPairs = (ids: readonly string[]): string[] => ids
  .flatMap((home) => ids.filter((away) => away !== home).map((away) => `${home} v ${away}`))
  .sort();

describe("fixture generation", () => {
  it("schedules every team home and away against every other, exactly once", () => {
    for (const size of [2, 3, 4, 5, 6]) {
      const ids = Array.from({ length: size }, (_, i) => `team-${i + 1}`);
      const fixtures = generateFixtures(ids, 424242);
      const played = fixtures.map((f) => `${f.homeId} v ${f.awayId}`).sort();

      expect(played, `${size} teams: every ordered pairing exactly once`)
        .toEqual(orderedPairs(ids));
      expect(new Set(played).size, `${size} teams: no fixture is duplicated`)
        .toBe(played.length);
      expect(fixtures.every((f) => f.homeId !== f.awayId)).toBe(true);
    }
  });

  it("never asks a team to play twice in the same round", () => {
    const ids = Array.from({ length: 6 }, (_, i) => `team-${i + 1}`);
    const byRound = new Map<number, string[]>();
    for (const fixture of generateFixtures(ids, 99)) {
      const teams = byRound.get(fixture.round) ?? [];
      teams.push(fixture.homeId, fixture.awayId);
      byRound.set(fixture.round, teams);
    }
    for (const [round, teams] of byRound) {
      expect(new Set(teams).size, `round ${round} has a team playing twice`).toBe(teams.length);
    }
  });

  it("is fixed by the seed, and a different seed gives a different order", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    expect(generateFixtures(ids, 1)).toEqual(generateFixtures(ids, 1));
    expect(generateFixtures(ids, 1)).not.toEqual(generateFixtures(ids, 2));
  });

  it("refuses a competition it cannot schedule", () => {
    expect(() => generateFixtures(["only-one"], 1)).toThrow(/at least two teams/);
    expect(() => generateFixtures(["a", "a"], 1)).toThrow(/unique/);
  });
});

describe("league table", () => {
  it("awards 3 for a win and 1 for a draw, and counts the goals both ways", () => {
    const table = buildLeagueTable([
      result("alpha", 2, "bravo", 1),
      result("bravo", 3, "alpha", 3),
    ]);
    const alpha = table.find((r) => r.teamId === "alpha")!;
    const bravo = table.find((r) => r.teamId === "bravo")!;

    expect(alpha).toMatchObject({
      played: 2, won: 1, drawn: 1, lost: 0,
      goalsFor: 5, goalsAgainst: 4, goalDifference: 1, points: 4,
    });
    expect(bravo).toMatchObject({
      played: 2, won: 0, drawn: 1, lost: 1,
      goalsFor: 4, goalsAgainst: 5, goalDifference: -1, points: 1,
    });
  });

  it("breaks ties by goal difference, then goals scored, then name", () => {
    // Four teams deliberately level on points. Each step of the chain is the
    // ONLY thing separating one pair, so a broken step changes the order.
    //   gd-winner   +2 GD
    //   goals-more   0 GD, 5 scored
    //   goals-fewer  0 GD, 1 scored   <- separated from goals-more by goals only
    //   zzz-last     0 GD, 1 scored   <- separated from goals-fewer by name only
    const table = buildLeagueTable([
      result("gd-winner", 3, "opponent-a", 1),
      result("opponent-a", 0, "gd-winner", 0),
      result("goals-more", 5, "opponent-b", 5),
      result("opponent-b", 0, "goals-more", 0),
      result("goals-fewer", 1, "opponent-c", 1),
      result("opponent-c", 0, "goals-fewer", 0),
      result("zzz-last", 1, "opponent-d", 1),
      result("opponent-d", 0, "zzz-last", 0),
    ]);
    const contenders = table
      .filter((r) => !r.teamId.startsWith("opponent"))
      .map((r) => r.teamId);

    expect(contenders).toEqual(["gd-winner", "goals-more", "goals-fewer", "zzz-last"]);
  });

  it("orders a level table the same way every time it is built", () => {
    const matches = [result("b", 1, "a", 1), result("a", 1, "b", 1)];
    expect(buildLeagueTable(matches).map((r) => r.teamId))
      .toEqual(buildLeagueTable([...matches].reverse()).map((r) => r.teamId));
  });
});

describe("season", () => {
  const teams = () => [
    makeTeam("northbridge", 12),
    makeTeam("redmere", 10),
    makeTeam("kingsford", 10),
    makeTeam("ashvale", 8),
  ];

  it("replays byte-identically from the same seed, and differently from another", () => {
    const first = runSeason(teams(), 424242);
    const second = runSeason(teams(), 424242);
    const other = runSeason(teams(), 424243);

    // The whole season, not just the table: fixtures, every match output and the
    // standings. A table can match by coincidence; the full object cannot.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(first));
  });

  it("plays every fixture and gives every team the same number of games", () => {
    const season = runSeason(teams(), 7);
    expect(season.matches).toHaveLength(season.fixtures.length);
    expect(season.fixtures).toHaveLength(4 * 3); // every ordered pair of 4 teams

    const played = season.table.map((r) => r.played);
    expect(new Set(played).size, "every team should play the same number of games").toBe(1);
    expect(played[0]).toBe(6);
  });

  it("produces a table whose points and goals agree with the matches played", () => {
    const season = runSeason(teams(), 11);
    const goalsFor = season.table.reduce((total, r) => total + r.goalsFor, 0);
    const goalsAgainst = season.table.reduce((total, r) => total + r.goalsAgainst, 0);
    const matchGoals = season.matches.reduce((t, m) => t + m.home.goals + m.away.goals, 0);

    expect(goalsFor).toBe(matchGoals);
    expect(goalsAgainst).toBe(matchGoals);

    // A decided match puts 3 points into the league, a draw puts 2. Deriving the
    // expected total from the actual results is the point: a hard-coded
    // matches * 3 would be wrong the moment a match is drawn.
    const decided = season.matches.filter((m) => m.home.goals !== m.away.goals).length;
    const drawn = season.matches.length - decided;
    const points = season.table.reduce((total, r) => total + r.points, 0);
    expect(points).toBe(decided * 3 + drawn * 2);
  });

  it("refuses duplicate teams", () => {
    const duplicated = [makeTeam("same", 10), makeTeam("same", 10)];
    expect(() => runSeason(duplicated, 1)).toThrow(/unique/);
  });
});
