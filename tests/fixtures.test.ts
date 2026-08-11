import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/engine-config.js";
import { simulateMatch } from "../src/engine.js";
import { makeTeam, resolveSquadGeneration } from "../src/fixtures.js";
import type { GoalkeeperPlayer, OutfieldAttribute, OutfieldPlayer, Player, Position, TeamInput } from "../src/types.js";

const roster = (team: TeamInput): Player[] => [...team.starters, ...team.substitutes];
const outfield = (team: TeamInput): OutfieldPlayer[] => roster(team).filter((player): player is OutfieldPlayer => player.primaryPosition !== "GK");
const goalkeepers = (team: TeamInput): GoalkeeperPlayer[] => roster(team).filter((player): player is GoalkeeperPlayer => player.primaryPosition === "GK");

function mean(team: TeamInput, key: OutfieldAttribute): number {
  const players = outfield(team);
  return players.reduce((total, player) => total + player.attributes[key], 0) / players.length;
}

function outfieldAttributeTotal(team: TeamInput): number {
  const keys = ENGINE_CONFIG.squadGeneration.attributeKeys.outfield;
  return outfield(team).reduce((total, player) => total + keys.reduce((sum, key) => sum + player.attributes[key], 0), 0);
}

describe("approved player data model", () => {
  it("uses six positions and carries natural cover for every formation", () => {
    const team = makeTeam("coverage", 10, {}, { seed: 9182, identity: "balanced" });
    const players = roster(team);
    const counts = Object.fromEntries((["GK", "CB", "FB", "CM", "WM", "FW"] as Position[]).map((position) => [
      position,
      players.filter((player) => player.primaryPosition === position).length,
    ])) as Record<Position, number>;

    expect(counts).toEqual({ GK: 2, CB: 4, FB: 4, CM: 4, WM: 4, FW: 4 });
    for (const requirements of Object.values(ENGINE_CONFIG.squadGeneration.formationPositionRequirements)) {
      for (const [position, required] of Object.entries(requirements) as [Position, number][]) {
        expect(counts[position]).toBeGreaterThanOrEqual(required + 1);
      }
    }
  });

  it("rates outfielders on nine attributes and goalkeepers on five", () => {
    const team = makeTeam("attribute-schema", 10, {}, { seed: 9182, identity: "balanced" });
    const expectedOutfield = [...ENGINE_CONFIG.squadGeneration.attributeKeys.outfield].sort();
    const expectedGoalkeeper = [...ENGINE_CONFIG.squadGeneration.attributeKeys.goalkeeper].sort();

    for (const player of outfield(team)) expect(Object.keys(player.attributes).sort()).toEqual(expectedOutfield);
    for (const player of goalkeepers(team)) expect(Object.keys(player.attributes).sort()).toEqual(expectedGoalkeeper);
  });
});

describe("seeded squad generation", () => {
  it("reproduces the same squad from the same inputs and seed", () => {
    const first = makeTeam("seeded", 10, {}, { seed: 90210, identity: "balanced" });
    const second = makeTeam("seeded", 10, {}, { seed: 90210, identity: "balanced" });
    expect(second).toEqual(first);
  });

  it("changes the squad when its generation seed changes", () => {
    const first = makeTeam("seeded", 10, {}, { seed: 90210, identity: "balanced" });
    const second = makeTeam("seeded", 10, {}, { seed: 90211, identity: "balanced" });
    expect(second.starters).not.toEqual(first.starters);
  });

  it("varies players within every position", () => {
    const team = makeTeam("varied", 10, {}, { seed: 734, identity: "balanced" });
    for (const position of ["GK", "CB", "FB", "CM", "WM", "FW"] as const) {
      const vectors = roster(team)
        .filter((player) => player.primaryPosition === position)
        .map((player) => JSON.stringify(player.attributes));
      expect(new Set(vectors).size).toBe(vectors.length);
    }
  });

  it("creates correlated, recognisable player types", () => {
    const team = makeTeam("types", 10, {}, { seed: 734, identity: "balanced" });
    const centreBacks = outfield(team).filter((player) => player.primaryPosition === "CB");
    const centralMidfielders = outfield(team).filter((player) => player.primaryPosition === "CM");
    const forwards = outfield(team).filter((player) => player.primaryPosition === "FW");
    const keepers = goalkeepers(team);

    expect(centreBacks.some((player) => player.attributes.pace - player.attributes.aerial >= 4)).toBe(true);
    expect(centreBacks.some((player) => player.attributes.aerial - player.attributes.pace >= 4)).toBe(true);
    expect(forwards.some((player) => player.attributes.pace - player.attributes.aerial >= 4)).toBe(true);
    expect(forwards.some((player) => player.attributes.aerial - player.attributes.pace >= 4)).toBe(true);
    expect(centralMidfielders.some((player) => player.attributes.creativity - player.attributes.defending >= 4)).toBe(true);
    expect(centralMidfielders.some((player) => player.attributes.defending - player.attributes.creativity >= 4)).toBe(true);
    expect(keepers.some((player) => player.attributes.shotStopping - player.attributes.kicking >= 4)).toBe(true);
    expect(keepers.some((player) => player.attributes.kicking - player.attributes.shotStopping >= 4)).toBe(true);
  });

  it("gives equal-level clubs different playing identities without adding aggregate ability", () => {
    const passing = makeTeam("passing-shape", 10, {}, { seed: 4312, identity: "passing" });
    const direct = makeTeam("direct-shape", 10, {}, { seed: 4312, identity: "direct" });

    expect(mean(passing, "passing")).toBeGreaterThan(mean(direct, "passing"));
    expect(mean(passing, "creativity")).toBeGreaterThan(mean(direct, "creativity"));
    expect(mean(direct, "pace")).toBeGreaterThan(mean(passing, "pace"));
    expect(mean(direct, "aerial")).toBeGreaterThan(mean(passing, "aerial"));
    expect(mean(direct, "crossing")).toBeGreaterThan(mean(passing, "crossing"));
    expect(mean(direct, "finishing")).toBeGreaterThan(mean(passing, "finishing"));
    expect(outfieldAttributeTotal(passing)).toBe(outfieldAttributeTotal(direct));
  });

  it("defaults Northbridge to passing and Redmere to direct identities", () => {
    expect(resolveSquadGeneration("northbridge")).toEqual({ seed: 198_808_091, identity: "passing" });
    expect(resolveSquadGeneration("redmere")).toEqual({ seed: 198_808_092, identity: "direct" });

    const northbridge = makeTeam("northbridge");
    const redmere = makeTeam("redmere");
    expect(mean(northbridge, "passing")).toBeGreaterThan(mean(redmere, "passing"));
    expect(mean(northbridge, "creativity")).toBeGreaterThan(mean(redmere, "creativity"));
    expect(mean(redmere, "pace")).toBeGreaterThan(mean(northbridge, "pace"));
    expect(mean(redmere, "aerial")).toBeGreaterThan(mean(northbridge, "aerial"));
    expect(mean(redmere, "crossing")).toBeGreaterThan(mean(northbridge, "crossing"));
    expect(mean(redmere, "finishing")).toBeGreaterThan(mean(northbridge, "finishing"));
  });

  it("varies hidden traits, especially adaptability, inside valid bounds", () => {
    const team = makeTeam("hidden", 10, {}, { seed: 5109, identity: "defensive" });
    const players = roster(team);
    const adaptability = players.map((player) => player.hidden.adaptability);

    expect(new Set(adaptability).size).toBeGreaterThanOrEqual(6);
    expect(Math.max(...adaptability) - Math.min(...adaptability)).toBeGreaterThanOrEqual(6);
    for (const player of players) {
      for (const value of [...Object.values(player.attributes), ...Object.values(player.hidden)]) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(20);
      }
    }
  });
});

describe("goalkeeper profile isolation", () => {
  it("does not use goalkeeper kicking for progression or attack", () => {
    const normal = makeTeam("keeper-isolation", 10, {}, { seed: 8128, identity: "balanced" });
    const changed = structuredClone(normal);
    changed.starters.find((player): player is GoalkeeperPlayer => player.primaryPosition === "GK")!.attributes.kicking = 20;
    const opponent = makeTeam("keeper-isolation-opponent", 10, {}, { seed: 9128, identity: "balanced" });

    const first = simulateMatch({ seed: 112233, neutralVenue: true, home: normal, away: opponent });
    const second = simulateMatch({ seed: 112233, neutralVenue: true, home: changed, away: opponent });
    expect(second).toEqual(first);
  });

  it("uses shot stopping for goalkeeper outcomes", () => {
    const low = makeTeam("keeper-stopping", 10, {}, { seed: 8128, identity: "balanced" });
    const high = structuredClone(low);
    low.starters.find((player): player is GoalkeeperPlayer => player.primaryPosition === "GK")!.attributes.shotStopping = 1;
    high.starters.find((player): player is GoalkeeperPlayer => player.primaryPosition === "GK")!.attributes.shotStopping = 20;
    const opponent = makeTeam("keeper-stopping-opponent", 10, {}, { seed: 9128, identity: "balanced" });
    let goalsAgainstLow = 0;
    let goalsAgainstHigh = 0;

    for (let seed = 1; seed <= 3000; seed += 1) {
      goalsAgainstLow += simulateMatch({ seed, neutralVenue: true, home: low, away: opponent }).away.goals;
      goalsAgainstHigh += simulateMatch({ seed, neutralVenue: true, home: high, away: opponent }).away.goals;
    }

    expect(goalsAgainstHigh).toBeLessThan(goalsAgainstLow);
  });

  it("uses handling, aerial and leadership only in team defence", () => {
    const low = makeTeam("keeper-defence", 10, {}, { seed: 8128, identity: "balanced" });
    const high = structuredClone(low);
    const lowKeeper = low.starters.find((player): player is GoalkeeperPlayer => player.primaryPosition === "GK")!;
    const highKeeper = high.starters.find((player): player is GoalkeeperPlayer => player.primaryPosition === "GK")!;
    lowKeeper.attributes.handling = 1;
    lowKeeper.attributes.aerial = 1;
    lowKeeper.attributes.leadership = 1;
    highKeeper.attributes.handling = 20;
    highKeeper.attributes.aerial = 20;
    highKeeper.attributes.leadership = 20;
    const opponent = makeTeam("keeper-defence-opponent", 10, {}, { seed: 9128, identity: "balanced" });
    let chancesAgainstLow = 0;
    let chancesAgainstHigh = 0;

    for (let seed = 1; seed <= 3000; seed += 1) {
      chancesAgainstLow += simulateMatch({ seed, neutralVenue: true, home: low, away: opponent }).away.chances;
      chancesAgainstHigh += simulateMatch({ seed, neutralVenue: true, home: high, away: opponent }).away.chances;
    }

    expect(chancesAgainstHigh).toBeLessThan(chancesAgainstLow);
  });
});
