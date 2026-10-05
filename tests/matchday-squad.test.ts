import { describe, expect, it } from "vitest";
import { simulateMatch } from "../src/engine.js";
import { makeTeam } from "../src/fixtures.js";
import { CONDITION_RECOVERY_PER_DAY, newPlayableSeason, playableSquad, playMatchday } from "../src/playable-season.js";
import { rulesForSeason, SEASON_RULES } from "../src/rules.js";
import type { MatchdaySelection } from "../src/playable-season.js";
import type { MatchInput } from "../src/types.js";
import type { SeasonRule } from "../src/rules.js";

const tactics = { formation: "4-4-2", style: "balanced", approach: "balanced", tackling: "normal" } as const;

function rotatedSelection(seed = 101): { state: ReturnType<typeof newPlayableSeason>; selection: MatchdaySelection; rested: string; replacement: string } {
  const state = newPlayableSeason(1981, seed, "club-1");
  const squad = playableSquad(state);
  const rested = squad.find((player) => state.selection.starterIds.includes(player.id) && player.primaryPosition === "FW")!;
  const replacement = squad.find((player) => !state.selection.starterIds.includes(player.id) && player.primaryPosition === "FW")!;
  return { state, rested: rested.id, replacement: replacement.id, selection: {
    starterIds: state.selection.starterIds.map((id) => id === rested.id ? replacement.id : id),
    playedPositions: { ...state.selection.playedPositions, [replacement.id]: replacement.primaryPosition },
    substituteIds: [rested.id],
  } };
}

function ruleTable(named: number, used: number): SeasonRule[] {
  return SEASON_RULES.map((row) => row.rule === "substitutesNamed" ? { ...row, value: named }
    : row.rule === "substitutesUsed" ? { ...row, value: used } : row) as SeasonRule[];
}

describe("matchday squad management", () => {
  it("requires explicit substitute rules for every match engine call", () => {
    const home = makeTeam("home", 10); const away = makeTeam("away", 10);
    expect(() => simulateMatch({ seed: 1, home, away } as MatchInput)).toThrow("must include season rules");
  });
  it("recovers every player by the stored gap while short turnarounds compound fatigue", () => {
    const starts = (days: number, restRound?: number) => {
      let state = newPlayableSeason(1981, 303, "club-1");
      state = { ...state, fixtures: state.fixtures.map((fixture) => ({ ...fixture, daysSincePreviousRound: days })) };
      const tracked = state.selection.starterIds.find((id) => playableSquad(state).find((player) => player.id === id)?.primaryPosition === "FW")!;
      const replacement = playableSquad(state).find((player) => !state.selection.starterIds.includes(player.id) && player.primaryPosition === "FW")!.id;
      const table: number[] = [];
      for (let round = 1; round <= 6; round += 1) {
        table.push(round === 1 ? state.playerConditions[tracked]! : Math.min(100, state.playerConditions[tracked]! + days * CONDITION_RECOVERY_PER_DAY));
        const resting = round === restRound;
        const selection = resting ? {
          starterIds: state.selection.starterIds.map((id) => id === tracked ? replacement : id),
          playedPositions: { ...state.selection.playedPositions, [replacement]: playableSquad(state).find((player) => player.id === replacement)!.primaryPosition },
          substituteIds: [tracked],
        } : state.selection;
        state = playMatchday(state, { ...tactics, selection });
      }
      return table.map(Math.round);
    };

    const weekly = starts(7);
    const short = starts(3);
    const shortWithRest = starts(3, 5);
    expect(weekly.slice(1).every((condition) => condition >= 90)).toBe(true);
    expect(short.slice(0, 5)).toEqual([...short.slice(0, 5)].sort((a, b) => b - a));
    expect(short[4]).toBeLessThanOrEqual(75);
    expect(shortWithRest[5]).toBeGreaterThan(85);
    expect({ weekly, short, shortWithRest }).toMatchInlineSnapshot(`
      {
        "short": [
          100,
          90,
          80,
          70,
          65,
          65,
        ],
        "shortWithRest": [
          100,
          90,
          80,
          70,
          65,
          95,
        ],
        "weekly": [
          100,
          100,
          100,
          100,
          100,
          100,
        ],
      }
    `);
  });

  it("refuses an oversized 1981/82 matchday bench in playable season play", () => {
    const state = newPlayableSeason(1981, 404, "club-1");
    const extra = playableSquad(state).find((player) => !state.selection.starterIds.includes(player.id) && !state.selection.substituteIds.includes(player.id))!;
    expect(() => playMatchday(state, { ...tactics, selection: { ...state.selection, substituteIds: [...state.selection.substituteIds, extra.id] } })).toThrow("Name exactly 1 substitute");
  });
  it("plays the chosen eleven rather than selecting an eleven in the engine", () => {
    const { state, selection, rested, replacement } = rotatedSelection();
    const played = playMatchday(state, { ...tactics, selection });
    const match = played.matches.find((candidate) => candidate.homeTeamId === "club-1" || candidate.awayTeamId === "club-1")!;
    expect(match.contributions.find((entry) => entry.playerId === replacement)?.minutesPlayed).toBe(90);
    expect(match.contributions.find((entry) => entry.playerId === rested)?.minutesPlayed).toBe(0);
  });

  it("carries condition so a rested player starts the following match fresher", () => {
    const setup = rotatedSelection(202);
    const state = { ...setup.state, fixtures: setup.state.fixtures.map((fixture) => ({ ...fixture, daysSincePreviousRound: 3 })) };
    const { selection, rested, replacement } = setup;
    const restedState = playMatchday(state, { ...tactics, selection });
    const playedSelection = { ...selection, starterIds: selection.starterIds.map((id) => id === replacement ? rested : id), substituteIds: [replacement] };
    const playedState = playMatchday(state, { ...tactics, selection: playedSelection });
    const restedThenPlayed = playMatchday(restedState, { ...tactics, selection: playedSelection });
    const playedTwice = playMatchday(playedState, { ...tactics, selection: playedSelection });
    expect(restedThenPlayed.playerConditions[rested]).toBeGreaterThan(playedTwice.playerConditions[rested]!);
  });

  it("makes tired elevens cost points over a season-sized paired sample", () => {
    // Prediction recorded before calculation: the tired eleven will earn fewer points.
    const points = (condition: number) => Array.from({ length: 42 }, (_, index) => index + 1).reduce((total, seed) => {
      const home = makeTeam("condition-home", 10); const away = makeTeam("condition-away", 10);
      home.starters.forEach((player) => { player.state.condition = condition; });
      home.substitutes = home.substitutes.slice(0, 1); away.substitutes = away.substitutes.slice(0, 1);
      const result = simulateMatch({ seed, home, away, seasonRules: rulesForSeason(1981) });
      return total + (result.home.goals > result.away.goals ? 3 : result.home.goals === result.away.goals ? 1 : 0);
    }, 0);
    const fit = points(100); const tired = points(35);
    expect(tired).toBeLessThan(fit);
    expect({ fit, tired, pointsCost: fit - tired }).toMatchInlineSnapshot(`
      {
        "fit": 71,
        "pointsCost": 7,
        "tired": 64,
      }
    `);
  });

  it("only a named and actually used substitute changes the match", () => {
    const home = makeTeam("home", 10); const away = makeTeam("away", 10);
    home.substitutes = home.substitutes.slice(0, 1); away.substitutes = away.substitutes.slice(0, 1);
    const base = { seed: 77, home, away, seasonRules: rulesForSeason(1981) };
    const unused = simulateMatch(base);
    const used = simulateMatch({ ...base, decisions: [{ minute: 60, teamId: home.id, type: "substitution" as const, playerOff: home.starters.find((player) => player.primaryPosition === home.substitutes[0]!.primaryPosition)!.id, playerOn: home.substitutes[0]!.id }] });
    expect(used.events.some((event) => event.type === "substitution")).toBe(true);
    const playerOff = home.starters.find((player) => player.primaryPosition === home.substitutes[0]!.primaryPosition)!;
    expect(used.finalCondition[playerOff.id]).not.toBe(unused.finalCondition[playerOff.id]);
    expect(() => simulateMatch({ ...base, decisions: [{ minute: 60, teamId: home.id, type: "substitution", playerOff: home.starters[1]!.id, playerOn: makeTeam("outsider", 10).substitutes[1]!.id }] })).toThrow("not an available substitute");
  });

  it("enforces both 1981 limits and reads larger limits from a test rules table", () => {
    const home = makeTeam("home", 10); const away = makeTeam("away", 10);
    home.substitutes = home.substitutes.slice(0, 2); away.substitutes = away.substitutes.slice(0, 1);
    expect(() => simulateMatch({ seed: 1, home, away, seasonRules: rulesForSeason(1981) })).toThrow("cannot name more than 1");
    home.substitutes = home.substitutes.slice(0, 1);
    const repeated = [20, 30].map((minute) => ({ minute, teamId: home.id, type: "substitution" as const, playerOff: home.starters.find((player) => player.primaryPosition === home.substitutes[0]!.primaryPosition)!.id, playerOn: home.substitutes[0]!.id }));
    expect(() => simulateMatch({ seed: 1, home, away, decisions: repeated, seasonRules: rulesForSeason(1981) })).toThrow("cannot make more than 1");

    const twoRules = rulesForSeason(1981, ruleTable(2, 2));
    home.substitutes = makeTeam("home", 10).substitutes.slice(0, 2);
    const twoChanges = home.substitutes.map((player, index) => ({ minute: 20 + index, teamId: home.id, type: "substitution" as const, playerOff: home.starters.find((starter) => starter.primaryPosition === player.primaryPosition)!.id, playerOn: player.id }));
    expect(() => simulateMatch({ seed: 1, home, away, decisions: twoChanges, seasonRules: twoRules })).not.toThrow();

    const fiveThree = ruleTable(5, 3);
    const state = newPlayableSeason(1981, 1, "club-1", fiveThree);
    expect(state.selection.starterIds).toHaveLength(11);
    expect(state.selection.substituteIds).toHaveLength(5);
    expect(() => simulateMatch({ seed: 1, home: { ...home, substitutes: makeTeam("home", 10).substitutes.slice(0, 5) }, away, decisions: [...twoChanges, { ...twoChanges[0]!, minute: 40 }, { ...twoChanges[0]!, minute: 50 }], seasonRules: rulesForSeason(1981, fiveThree) })).toThrow("cannot make more than 3");
  });
});
