import { describe, expect, it } from "vitest";
import { formatSummary, summariseSeason } from "../src/season-evidence.js";
import type { SeasonResult } from "../src/competition.js";
import type { MatchOutput } from "../src/types.js";

function match(homeTeamId: string, homeGoals: number, awayTeamId: string, awayGoals: number): MatchOutput {
  return { homeTeamId, awayTeamId, home: { goals: homeGoals }, away: { goals: awayGoals } } as MatchOutput;
}

describe("season scale evidence", () => {
  it("derives every requested football and performance measure", () => {
    const matches = [match("strong", 2, "middle", 0), match("bottom", 1, "strong", 1)];
    const row = summariseSeason({
      seed: 1,
      teamIds: ["strong", "middle", "bottom"],
      fixtures: [{ round: 1, homeId: "strong", awayId: "middle" }, { round: 2, homeId: "bottom", awayId: "strong" }],
      matches,
      table: [
        { teamId: "strong", played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 3, goalsAgainst: 1, goalDifference: 2, points: 4 },
        { teamId: "middle", played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 2, goalDifference: -2, points: 0 },
        { teamId: "bottom", played: 1, won: 0, drawn: 1, lost: 0, goalsFor: 1, goalsAgainst: 1, goalDifference: 0, points: 1 },
      ],
    }, "strong", 4);

    expect(row).toEqual({
      teamCount: 3, fixturesGenerated: 2, matchesPlayed: 2,
      elapsedMs: 4, matchesPerSecond: 500, goalsPerMatch: 2,
      homeWinRate: 0.5, drawRate: 0.5,
      champion: { teamId: "strong", points: 4 },
      bottom: { teamId: "bottom", points: 1 }, pointsGap: 3,
      strongestTeamId: "strong", strongestFinishedTop: true,
    });
    expect(formatSummary([row])).toContain("Strongest top");
    expect(formatSummary([row])).toContain("50.0%");
  });
});
