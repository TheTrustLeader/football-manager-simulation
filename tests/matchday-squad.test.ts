import { describe, expect, it } from "vitest";
import { simulateMatch } from "../src/engine.js";
import { makeTeam } from "../src/fixtures.js";
import { newPlayableSeason, playMatchday, playableSquad } from "../src/playable-season.js";
import { rulesForSeason, SEASON_RULES } from "../src/rules.js";
import type { MatchdaySelection } from "../src/playable-season.js";
import type { SeasonRule } from "../src/rules.js";

const tactics = { formation: "4-4-2", style: "balanced", approach: "balanced", tackling: "normal" } as const;
function rotatedSelection(seed = 101): { state: ReturnType<typeof newPlayableSeason>; selection: MatchdaySelection; rested: string; replacement: string } {
  const state = newPlayableSeason(1981, seed, "club-1");
  const squad = playableSquad(state);
  const rested = squad.find((player) => state.selection.starterIds.includes(player.id) && player.primaryPosition === "FW")!;
  const replacement = squad.find((player) => !state.selection.starterIds.includes(player.id) && player.primaryPosition === "FW")!;
  return { state, rested: rested.id, replacement: replacement.id, selection: {
    starterIds: state.selection.starterIds.map((id) => id === rested.id ? replacement.id : id),
    substituteIds: [rested.id],
  } };
}

describe("matchday squad management", () => {
  it("plays the chosen eleven rather than selecting an eleven in the engine", () => {
    const { state, selection, rested, replacement } = rotatedSelection();
    const played = playMatchday(state, { ...tactics, selection });
    const match = played.matches.find((candidate) => candidate.homeTeamId === "club-1" || candidate.awayTeamId === "club-1")!;
    expect(match.contributions.find((entry) => entry.playerId === replacement)?.minutesPlayed).toBe(90);
    expect(match.contributions.find((entry) => entry.playerId === rested)?.minutesPlayed).toBe(0);
  });

  it("carries condition so a rested player is fresher next match", () => {
    const { state, selection, rested, replacement } = rotatedSelection(202);
    const restedState = playMatchday(state, { ...tactics, selection });
    const playedSelection = { ...selection, starterIds: selection.starterIds.map((id) => id === replacement ? rested : id), substituteIds: [replacement] };
    const playedState = playMatchday(state, { ...tactics, selection: playedSelection });
    const restedThenPlayed = playMatchday(restedState, { ...tactics, selection: playedSelection });
    const playedTwice = playMatchday(playedState, { ...tactics, selection: playedSelection });
    expect(restedThenPlayed.playerConditions[rested]).toBeGreaterThan(playedTwice.playerConditions[rested]!);
  });

  it("makes tired elevens cost points over a 42-match season sample", () => {
    // Prediction recorded before the paired calculation: the tired eleven will earn fewer points.
    const points = (condition: number) => Array.from({ length: 42 }, (_, index) => index + 1).reduce((total, seed) => {
      const home = makeTeam("condition-home", 10); const away = makeTeam("condition-away", 10);
      home.starters.forEach((player) => { player.state.condition = condition; });
      home.substitutes = home.substitutes.slice(0, 1); away.substitutes = away.substitutes.slice(0, 1);
      const result = simulateMatch({ seed, home, away, seasonRules: rulesForSeason(1981) });
      return total + (result.home.goals > result.away.goals ? 3 : result.home.goals === result.away.goals ? 1 : 0);
    }, 0);
    const fit = points(100); const tired = points(35);
    expect({ fit, tired, pointsCost: fit - tired }).toEqual({ fit: 75, tired: 64, pointsCost: 11 });
  });

  it("only a named and actually used substitute changes the match", () => {
    const home = makeTeam("home", 10); const away = makeTeam("away", 10);
    home.substitutes = home.substitutes.slice(0, 1); away.substitutes = away.substitutes.slice(0, 1);
    const base = { seed: 77, home, away, seasonRules: rulesForSeason(1981) };
    const unused = simulateMatch(base);
    const used = simulateMatch({ ...base, decisions: [{ minute: 60, teamId: home.id, type: "substitution" as const, playerOff: home.starters[0]!.id, playerOn: home.substitutes[0]!.id }] });
    expect(used.events.some((event) => event.type === "substitution")).toBe(true);
    expect(used.finalCondition[home.starters[0]!.id]).not.toBe(unused.finalCondition[home.starters[0]!.id]);
    expect(() => simulateMatch({ ...base, decisions: [{ minute: 60, teamId: home.id, type: "substitution", playerOff: home.starters[0]!.id, playerOn: makeTeam("outsider", 10).substitutes[0]!.id }] })).toThrow("not an available substitute");
  });

  it("enforces named and used dated rules rather than a fixed engine number", () => {
    const home = makeTeam("home", 10); const away = makeTeam("away", 10);
    home.substitutes = home.substitutes.slice(0, 2); away.substitutes = away.substitutes.slice(0, 1);
    expect(() => simulateMatch({ seed: 1, home, away, seasonRules: rulesForSeason(1981) })).toThrow("cannot name more than 1");
    const custom = SEASON_RULES.map((row) => row.rule === "substitutesNamed" ? { ...row, value: 5 } : row.rule === "substitutesUsed" ? { ...row, value: 3 } : row) as SeasonRule[];
    const rules = rulesForSeason(1981, custom); home.substitutes = makeTeam("home", 10).substitutes.slice(0, 5);
    const decisions = [home.substitutes[0]!, home.substitutes[1]!, home.substitutes[3]!, home.substitutes[4]!].map((player, index) => ({ minute: 20 + index, teamId: home.id, type: "substitution" as const, playerOff: home.starters.find((starter) => starter.primaryPosition === player.primaryPosition)!.id, playerOn: player.id }));
    expect(() => simulateMatch({ seed: 1, home, away, decisions, seasonRules: rules })).toThrow("cannot make more than 3");
    expect(() => simulateMatch({ seed: 1, home, away, decisions: decisions.slice(0, 3), seasonRules: rules })).not.toThrow();
  });
});
