import { describe, expect, it } from "vitest";
import { simulateMatch, validateMatchInput } from "../src/engine.js";
import { makeTeam } from "../src/fixtures.js";

function input(seed = 12345) {
  return {
    seed,
    neutralVenue: true,
    home: makeTeam("home"),
    away: makeTeam("away"),
  };
}

describe("Match Engine", () => {
  it("replays the same seed exactly", () => {
    const first = simulateMatch(input(777));
    const second = simulateMatch(input(777));
    expect(second).toEqual(first);
  });

  it("changes output when the seed changes", () => {
    const first = simulateMatch(input(777));
    const second = simulateMatch(input(778));
    expect(second.events).not.toEqual(first.events);
  });

  it("returns a complete result and contribution ledger", () => {
    const result = simulateMatch(input());
    expect(result.events[0]?.type).toBe("kick-off");
    expect(result.events.at(-1)?.type).toBe("full-time");
    expect(result.contributions).toHaveLength(30);
    expect(result.home.goals).toBeGreaterThanOrEqual(0);
    expect(result.away.goals).toBeGreaterThanOrEqual(0);
  });

  it("rejects an invalid starting XI", () => {
    const bad = input();
    bad.home.starters = bad.home.starters.slice(0, 10);
    expect(() => validateMatchInput(bad)).toThrow(/11 starters/);
  });

  it("gives stronger teams a long-run advantage", () => {
    let strongPoints = 0;
    let weakPoints = 0;

    for (let seed = 1; seed <= 2000; seed += 1) {
      const result = simulateMatch({
        seed,
        neutralVenue: true,
        home: makeTeam("strong", 14),
        away: makeTeam("weak", 8),
      });
      if (result.home.goals > result.away.goals) strongPoints += 3;
      else if (result.home.goals < result.away.goals) weakPoints += 3;
      else {
        strongPoints += 1;
        weakPoints += 1;
      }
    }

    expect(strongPoints).toBeGreaterThan(weakPoints);
  });
});
