import { describe, expect, it } from "vitest";
import { buildLeagueTable, buildSeasonPlayerStats, generateFixtures, runSeason } from "../src/competition.js";
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

const sweepSeeds = [0, 1, 2, 7, 42, 99, 424242, 0xffffffff];
const seasonSweepSeeds = [0, 1, 7, 42, 424242];
const sweepSizes = [2, 3, 4, 5, 6, 7, 8];

function sweptTeams(size: number) {
  return Array.from({ length: size }, (_, i) => makeTeam(`sweep-${size}-${i + 1}`, 8 + (i % 5)));
}

function contributions(...players: Array<[string, number, number, number]>): MatchOutput {
  return {
    contributions: players.map(([playerId, minutesPlayed, goals, rating]) => ({
      playerId, minutesPlayed, goals, rating,
    })),
  } as unknown as MatchOutput;
}

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

  it("reconciles player totals with the raw matches and league table", () => {
    const season = runSeason(teams(), 11);
    const playerGoals = season.playerStats.reduce((total, player) => total + player.goals, 0);
    const contributionGoals = season.matches.flatMap((match) => match.contributions)
      .reduce((total, player) => total + player.goals, 0);
    const tableGoals = season.table.reduce((total, team) => total + team.goalsFor, 0);

    expect(playerGoals).toBe(contributionGoals);
    expect(playerGoals).toBe(tableGoals);
    expect(season.playerStats.every((player) => player.appearances > 0)).toBe(true);
  });

  it("orders player stats by goals, rating, appearances, then player id", () => {
    const stats = buildSeasonPlayerStats([
      contributions(
        ["goals-first", 90, 2, 5],
        ["rating-next", 90, 1, 8],
        ["apps-next", 90, 1, 7],
        ["alpha-final", 90, 1, 7],
        ["zulu-final", 90, 1, 7],
        ["unused", 0, 0, 10],
      ),
      contributions(["apps-next", 45, 0, 7]),
    ]);

    expect(stats.map((player) => player.playerId)).toEqual([
      "goals-first", "rating-next", "apps-next", "alpha-final", "zulu-final",
    ]);
    expect(stats.find((player) => player.playerId === "apps-next")).toMatchObject({
      appearances: 2,
      goals: 1,
      meanRating: 7,
    });
  });

  it("produces byte-identical player stats from the same season seed", () => {
    const first = runSeason(teams(), 424242).playerStats;
    const second = runSeason(teams(), 424242).playerStats;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("refuses duplicate teams", () => {
    const duplicated = [makeTeam("same", 10), makeTeam("same", 10)];
    expect(() => runSeason(duplicated, 1)).toThrow(/unique/);
  });
});

describe("seed-swept competition invariants", () => {
  it("generates a valid double round-robin for team counts 2 through 8 across seeds", () => {
    for (const size of sweepSizes) {
      const ids = sweptTeams(size).map((team) => team.id);
      const expectedPairs = orderedPairs(ids);

      for (const seed of sweepSeeds) {
        const context = `${size} teams, seed ${seed}`;
        const fixtures = generateFixtures(ids, seed);
        const playedPairs = fixtures
          .map((fixture) => `${fixture.homeId} v ${fixture.awayId}`)
          .sort();

        expect(playedPairs, `${context}: every ordered pair appears exactly once`)
          .toEqual(expectedPairs);
        expect(new Set(playedPairs).size, `${context}: no duplicate ordered pair`)
          .toBe(fixtures.length);
        expect(fixtures.every((fixture) => fixture.homeId !== fixture.awayId), `${context}: no self-play`)
          .toBe(true);

        const rounds = new Map<number, string[]>();
        for (const fixture of fixtures) {
          const participants = rounds.get(fixture.round) ?? [];
          participants.push(fixture.homeId, fixture.awayId);
          rounds.set(fixture.round, participants);
        }
        for (const [round, participants] of rounds) {
          expect(new Set(participants).size, `${context}, round ${round}: no team plays twice`)
            .toBe(participants.length);
        }

        const appearances = new Map(ids.map((id) => [id, 0]));
        for (const fixture of fixtures) {
          appearances.set(fixture.homeId, appearances.get(fixture.homeId)! + 1);
          appearances.set(fixture.awayId, appearances.get(fixture.awayId)! + 1);
        }
        expect([...appearances.values()], `${context}: equal matches per team`)
          .toEqual(Array(size).fill(2 * (size - 1)));
      }
    }
  });

  it("reconciles season results and replays deterministically across the sweep", () => {
    for (const size of sweepSizes) {
      for (const seed of seasonSweepSeeds) {
        const context = `${size} teams, seed ${seed}`;
        const teams = sweptTeams(size);
        const season = runSeason(teams, seed);
        const replay = runSeason(sweptTeams(size), seed);
        const other = runSeason(sweptTeams(size), (seed + 1) >>> 0);

        expect(JSON.stringify(replay), `${context}: identical seed replays byte-identically`)
          .toBe(JSON.stringify(season));
        const withoutSeed = ({ seed: _seed, ...result }: typeof season) => result;
        expect(JSON.stringify(withoutSeed(other)), `${context}: another seed changes the season`)
          .not.toBe(JSON.stringify(withoutSeed(season)));
        expect(season.matches, `${context}: every fixture is played`)
          .toHaveLength(season.fixtures.length);

        const goals = new Map(teams.map((team) => [team.id, { for: 0, against: 0 }]));
        for (const match of season.matches) {
          goals.get(match.homeTeamId)!.for += match.home.goals;
          goals.get(match.homeTeamId)!.against += match.away.goals;
          goals.get(match.awayTeamId)!.for += match.away.goals;
          goals.get(match.awayTeamId)!.against += match.home.goals;
        }
        for (const row of season.table) {
          expect(row.played, `${context}, ${row.teamId}: equal matches played`).toBe(2 * (size - 1));
          expect(row.goalsFor, `${context}, ${row.teamId}: goals for reconcile`).toBe(goals.get(row.teamId)!.for);
          expect(row.goalsAgainst, `${context}, ${row.teamId}: goals against reconcile`).toBe(goals.get(row.teamId)!.against);
        }

        const matchGoals = season.matches.reduce(
          (total, match) => total + match.home.goals + match.away.goals,
          0,
        );
        expect(season.table.reduce((total, row) => total + row.goalsFor, 0), `${context}: total goals for`)
          .toBe(matchGoals);
        expect(season.table.reduce((total, row) => total + row.goalsAgainst, 0), `${context}: total goals against`)
          .toBe(matchGoals);

        const expectedPoints = season.matches.reduce(
          (total, match) => total + (match.home.goals === match.away.goals ? 2 : 3),
          0,
        );
        expect(season.table.reduce((total, row) => total + row.points, 0), `${context}: points conserved`)
          .toBe(expectedPoints);
      }
    }
  });
});
