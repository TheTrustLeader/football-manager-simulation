import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clubPlacePart, HOME_COUNTRY_CLUBS, homeCountryClubsForSeason } from "../src/club-world.js";
import { leagueStructureForSeason, type LeagueStructure } from "../src/league-structure.js";
import { CLUB_NAMES } from "../src/playable-season.js";

function normalized(value: string): string {
  return value.toLocaleLowerCase("en-GB");
}

function realClubNames(): string[] {
  const lines = readFileSync(new URL("../data/football-league-final-tables-1981-1983.csv", import.meta.url), "utf8").trim().split("\n");
  return [...new Set(lines.slice(1).map((line) => line.split(",")[3]!))];
}

function britishPlaceNames(): Set<string> {
  return new Set(readFileSync(new URL("../data/gb-place-names.txt", import.meta.url), "utf8")
    .trim().split("\n").map(normalized));
}

function expectNoBritishPlaces(pool: readonly string[]): void {
  const places = britishPlaceNames();
  for (const name of pool) {
    const place = clubPlacePart(name);
    const firstWord = place.split(/\s+/)[0]!;
    expect(places, `${name} uses the real place ${place}`).not.toContain(normalized(place));
    expect(places, `${name} starts with the real place ${firstWord}`).not.toContain(normalized(firstWord));
  }
}

function expectNoProhibitedNames(pool: readonly string[]): void {
  const oldPlaces = new Set(CLUB_NAMES.map(clubPlacePart).map(normalized));
  const realNames = new Set(realClubNames().map(normalized));
  const realPlaces = new Set(realClubNames().map(clubPlacePart).map(normalized));
  for (const name of pool) {
    expect(oldPlaces, `${name} reuses an old place`).not.toContain(normalized(clubPlacePart(name)));
    expect(realNames, `${name} is a real club`).not.toContain(normalized(name));
    expect(realPlaces, `${name} uses a real club's place`).not.toContain(normalized(clubPlacePart(name)));
  }
}

describe("home-country club world", () => {
  it("takes every division size from the season's league structure", () => {
    const standard = homeCountryClubsForSeason(1981, 7);
    const structure = leagueStructureForSeason(1981);
    for (const division of [1, 2, 3, 4] as const) {
      expect(standard.filter((club) => club.division === division)).toHaveLength(structure.divisionSizes[division]);
    }
    expect(standard).toHaveLength(Object.values(structure.divisionSizes).reduce((sum, size) => sum + size, 0));

    const smaller: LeagueStructure = {
      ...structure,
      divisionSizes: { ...structure.divisionSizes, 1: 20 },
    };
    const controlled = homeCountryClubsForSeason(1981, 7, [smaller]);
    expect(controlled).toHaveLength(90);
    expect(controlled.filter((club) => club.division === 1)).toHaveLength(20);
  });

  it("has at least 92 fixed, case-insensitively unique ids and names", () => {
    expect(HOME_COUNTRY_CLUBS.length).toBeGreaterThanOrEqual(92);
    const clubs = homeCountryClubsForSeason(1981, 11);
    expect(new Set(clubs.map((club) => normalized(club.id))).size).toBe(clubs.length);
    expect(new Set(clubs.map((club) => normalized(club.name))).size).toBe(clubs.length);
    expect(() => homeCountryClubsForSeason(1981, 11, undefined, [
      ...HOME_COUNTRY_CLUBS.slice(0, -1),
      HOME_COUNTRY_CLUBS[0]!.toLocaleLowerCase("en-GB"),
    ])).toThrow("Duplicate club name");
  });

  it("does not reuse a place from the playable clubs or the real-club CSV", () => {
    expectNoProhibitedNames(HOME_COUNTRY_CLUBS);
    expect(() => expectNoProhibitedNames([...HOME_COUNTRY_CLUBS, "Ashford Rovers"])).toThrow("reuses an old place");
    expect(() => expectNoProhibitedNames([...HOME_COUNTRY_CLUBS, "Liverpool"])).toThrow("is a real club");
    expect(() => expectNoProhibitedNames([...HOME_COUNTRY_CLUBS, "Bristol Wanderers"])).toThrow("uses a real club's place");
  });

  it("does not use a sourced British place or start a place with one", () => {
    expectNoBritishPlaces(HOME_COUNTRY_CLUBS);
    expect(() => expectNoBritishPlaces([...HOME_COUNTRY_CLUBS, "Windermere Rovers"]))
      .toThrow("uses the real place Windermere");
  });

  it("is repeatable, changes with the seed, and rejects unsourced seasons", () => {
    expect(homeCountryClubsForSeason(1981, 31415)).toEqual(homeCountryClubsForSeason(1981, 31415));
    const firstDivision = (seed: number) => homeCountryClubsForSeason(1981, seed)
      .filter((club) => club.division === 1).map((club) => club.id);
    const baseline = firstDivision(31415);
    expect(Array.from({ length: 10 }, (_, seed) => firstDivision(seed + 1))
      .some((clubs) => clubs.join("|") !== baseline.join("|"))).toBe(true);
    expect(() => homeCountryClubsForSeason(1983, 1)).toThrow("not sourced yet");
  });

  it("gives every identity a seed-independent chance to start in Division 1", () => {
    const counts = new Map(HOME_COUNTRY_CLUBS.map((_, index) => [`home-club-${index + 1}`, 0]));
    for (let seed = 0; seed < 1_000; seed += 1) {
      for (const club of homeCountryClubsForSeason(1981, seed)) {
        if (club.division === 1) counts.set(club.id, counts.get(club.id)! + 1);
      }
    }
    for (const [id, count] of counts) expect(count, id).toBeGreaterThanOrEqual(190);
    for (const [id, count] of counts) expect(count, id).toBeLessThanOrEqual(290);
  });
});
