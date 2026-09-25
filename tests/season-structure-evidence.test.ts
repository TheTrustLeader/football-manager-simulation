import { describe, expect, it } from "vitest";
import { runSeason } from "../src/competition.js";
import { makeTeam } from "../src/fixtures.js";
import { fixtureBalance, mixedMatchSeed, SEASON } from "../src/season-structure-evidence.js";

describe("season structure evidence", () => {
  it("balances every requested league size and schedules every ordered pair once", () => {
    for (const teamCount of [8, 12, 16, 20]) {
      const balance = fixtureBalance(teamCount);
      expect(balance.orderedPairsExactlyOnce).toBe(true);
      expect(balance.teams).toHaveLength(teamCount);
      for (const team of balance.teams) {
        expect(team).toEqual({
          teamId: team.teamId,
          matches: 2 * (teamCount - 1),
          home: teamCount - 1,
          away: teamCount - 1,
        });
      }
    }
  });

  it("uses an injected match-seed function instead of the legacy sequence", () => {
    const seen: number[] = [];
    const injected = () => 0xdecafbad;
    runSeason([makeTeam("alpha", 10), makeTeam("bravo", 10)], 12_001, SEASON, {
      matchSeed: injected,
      onMatchDrawCount: (_fixture, seed) => seen.push(seed),
    });
    expect(seen).toEqual([0xdecafbad, 0xdecafbad]);
    expect(mixedMatchSeed(12_001, { round: 1, homeId: "alpha", awayId: "bravo" }, 0)).not.toBe(12_001);
  });
});
