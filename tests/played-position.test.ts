import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/engine-config.js";
import { positionAdjustedAttribute, positionMultiplier, simulateMatch } from "../src/engine.js";
import { makeTeam } from "../src/fixtures.js";
import { loadPlayableSeason, newPlayableSeason, playMatchday, playableSquad, serializePlayableSeason } from "../src/playable-season.js";
import { EXHIBITION_RULES_1981 } from "../src/rules.js";
import type { OutfieldAttribute, OutfieldPlayer, OutfieldPosition, Player, TeamInput } from "../src/types.js";

const choices = { formation: "4-4-2", style: "balanced", approach: "balanced", tackling: "normal" } as const;

function match(home: TeamInput, seed = 1) {
  return simulateMatch({ seed, home, away: makeTeam(`away-${seed}`), neutralVenue: true, seasonRules: EXHIBITION_RULES_1981 });
}

function convertForward(team: TeamInput, natural: OutfieldPosition): OutfieldPlayer {
  const forward = team.starters.find((player) => player.primaryPosition === "FW") as OutfieldPlayer;
  const converted = { ...forward, primaryPosition: natural, playedPosition: "FW" as const } as OutfieldPlayer;
  team.starters = team.starters.map((player) => player.id === forward.id ? converted : player);
  return converted;
}

describe("played positions", () => {
  it("reads both penalty sizes and every outfield attribute from the single config table", () => {
    const team = makeTeam("penalties");
    const player = team.starters.find((candidate) => candidate.primaryPosition === "CM") as OutfieldPlayer;
    const attributes = Object.keys(player.attributes) as OutfieldAttribute[];
    expect(positionMultiplier("CM", "FW")).toBe(ENGINE_CONFIG.positionPenalty.neighbouring);
    expect(positionMultiplier("CM", "FB")).toBe(ENGINE_CONFIG.positionPenalty.far);
    for (const attribute of attributes) {
      expect(positionAdjustedAttribute(player, "FW", attribute)).toBe(player.attributes[attribute] * 0.90);
      expect(positionAdjustedAttribute(player, "FB", attribute)).toBe(player.attributes[attribute] * 0.75);
    }
  });

  it("uses played forward, not natural position, to select attackers and allocate shots", () => {
    const home = makeTeam("played-attacker");
    const converted = convertForward(home, "WM");
    let shots = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      shots += match(home, seed).contributions.find((row) => row.playerId === converted.id)!.shots;
    }
    expect(shots).toBeGreaterThan(0);
  });

  it("makes neighbouring and far forwards perceptibly weaker over 1,000 seeded matches", { timeout: 60_000 }, () => {
    const goals = (natural: "FW" | "WM" | "CB") => {
      const home = makeTeam("perception");
      const target = home.starters.find((player) => player.primaryPosition === "FW") as OutfieldPlayer;
      if (natural !== "FW") {
        const converted = { ...target, primaryPosition: natural, playedPosition: "FW" as const } as OutfieldPlayer;
        home.starters = home.starters.map((player) => player.id === target.id ? converted : player);
      }
      const perMatch: number[] = [];
      for (let seed = 1; seed <= 1_000; seed += 1) {
        perMatch.push(match(home, seed).contributions.find((row) => row.playerId === target.id)!.goals);
      }
      return perMatch;
    };
    const naturalMatches = goals("FW");
    const neighbouringMatches = goals("WM");
    const farMatches = goals("CB");
    const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);
    const pairedCountStandardError = (left: number[], right: number[]) => {
      const differences = left.map((value, index) => value - right[index]!);
      const mean = total(differences) / differences.length;
      return Math.sqrt(differences.reduce((sum, value) => sum + (value - mean) ** 2, 0));
    };
    const natural = total(naturalMatches);
    const neighbouring = total(neighbouringMatches);
    const far = total(farMatches);
    expect(natural - neighbouring).toBeGreaterThan(2 * pairedCountStandardError(naturalMatches, neighbouringMatches));
    expect(neighbouring - far).toBeGreaterThan(0);
    expect({ natural, neighbouring, far }).toMatchInlineSnapshot(`
      {
        "far": 345,
        "natural": 411,
        "neighbouring": 382,
      }
    `);
  });

  it("checks formation counts using played positions", () => {
    const state = newPlayableSeason(1981, 84, "club-1");
    const squad = playableSquad(state);
    const forward = squad.find((player) => state.selection.starterIds.includes(player.id) && player.primaryPosition === "FW")!;
    const winger = squad.find((player) => state.selection.starterIds.includes(player.id) && player.primaryPosition === "WM")!;
    const accepted = { ...state.selection, playedPositions: { ...state.selection.playedPositions, [forward.id]: "WM" as const, [winger.id]: "FW" as const } };
    expect(() => playMatchday(state, { ...choices, selection: accepted })).not.toThrow();
    const rejected = { ...state.selection, playedPositions: { ...state.selection.playedPositions, [forward.id]: "WM" as const } };
    expect(() => playMatchday(state, { ...choices, selection: rejected })).toThrow("cannot fill 4-4-2");
  });

  it("rejects either direction of goalkeeper misuse", () => {
    const outfieldInGoal = makeTeam("outfield-in-goal");
    const outfield = outfieldInGoal.starters.find((player) => player.primaryPosition === "CB")!;
    outfield.playedPosition = "GK";
    expect(() => match(outfieldInGoal)).toThrow("only a natural goalkeeper can play in goal");

    const keeperOutfield = makeTeam("keeper-outfield");
    keeperOutfield.starters.find((player) => player.primaryPosition === "GK")!.playedPosition = "CB";
    expect(() => match(keeperOutfield)).toThrow("natural goalkeeper cannot play outfield");
  });

  it("requires every engine and playMatchday starter position and migrates version 3 once", () => {
    const home = makeTeam("missing-position");
    delete home.starters[1]!.playedPosition;
    expect(() => match(home)).toThrow("missing a played position");

    const state = newPlayableSeason(1981, 840, "club-1");
    const missing = { ...state.selection, playedPositions: { ...state.selection.playedPositions } };
    delete missing.playedPositions[missing.starterIds[1]!];
    expect(() => playMatchday(state, { ...choices, selection: missing })).toThrow("missing a played position");

    const old = JSON.parse(serializePlayableSeason(state)) as { version: number; selection: { playedPositions?: unknown } };
    old.version = 3;
    delete old.selection.playedPositions;
    const migrated = loadPlayableSeason(JSON.stringify(old));
    expect(migrated.version).toBe(4);
    expect(migrated.selection.playedPositions).toEqual(Object.fromEntries(playableSquad(migrated)
      .filter((player) => migrated.selection.starterIds.includes(player.id)).map((player) => [player.id, player.primaryPosition])));
    expect(() => playMatchday(migrated, choices)).not.toThrow();
  });

  it("gives a substitute the replaced player's played position and penalty", () => {
    const home = makeTeam("sub-position");
    const on = home.substitutes.find((player) => player.primaryPosition === "CM")!;
    const off = home.starters.find((player) => player.primaryPosition === "FW")!;
    home.substitutes = [on];
    let shots = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const away = makeTeam(`sub-away-${seed}`);
      away.substitutes = away.substitutes.slice(0, 1);
      const result = simulateMatch({ seed, home, away, neutralVenue: true,
        decisions: [{ minute: 1, teamId: home.id, type: "substitution", playerOff: off.id, playerOn: on.id }], seasonRules: { ...EXHIBITION_RULES_1981, substitutesNamed: 1 } });
      shots += result.contributions.find((row) => row.playerId === on.id)!.shots;
    }
    expect(positionMultiplier("CM", "FW")).toBe(0.90);
    expect(shots).toBeGreaterThan(0);
  });

  it("leaves naturally positioned teams byte-identical apart from config identity", () => {
    const first = match(makeTeam("natural"), 99);
    const secondHome = makeTeam("natural");
    secondHome.starters.forEach((player) => { player.playedPosition = player.primaryPosition; });
    expect(match(secondHome, 99)).toEqual(first);
  });
});
