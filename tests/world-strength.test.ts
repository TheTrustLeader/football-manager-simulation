import { describe, expect, it } from "vitest";
import { HOME_COUNTRY_CLUBS, strengthenedHomeCountryClubsForSeason } from "../src/club-world.js";
import { checkFirstDivisionSizesAgree, LEAGUE_STRUCTURES } from "../src/league-structure.js";
import { clubsForSeason } from "../src/playable-season.js";
import { rulesForSeason, SEASON_RULES, type DivisionShapes, type SeasonRule } from "../src/rules.js";
import { worldStrengthEvidence } from "../src/world-strength-evidence.js";

const mutateShapes = (change: (shapes: DivisionShapes) => DivisionShapes): SeasonRule[] => SEASON_RULES.map((row) =>
  row.rule === "divisionShapes" ? { ...row, value: change(row.value), source: "Injected test shape." } : row) as SeasonRule[];

describe("world club strength", () => {
  let evidence: ReturnType<typeof worldStrengthEvidence> | undefined;
  const report = () => (evidence ??= worldStrengthEvidence(1_000));

  it("steps down in average rating", () => {
    for (let index = 0; index < 3; index += 1) {
      expect(report().rows[index]!.average - report().rows[index + 1]!.average).toBeGreaterThan(0.2);
    }
  }, 60_000);

  it("overlaps adjacent divisions in at least 80% of seeds", () => {
    for (let index = 1; index < 4; index += 1) expect(report().rows[index]!.overlapAbovePercent).toBeGreaterThanOrEqual(80);
  }, 60_000);

  it("keeps the lower strongest club below the upper median in at least 80% of seeds", () => {
    for (let index = 1; index < 4; index += 1) expect(report().rows[index]!.belowAboveMedianPercent).toBeGreaterThanOrEqual(80);
  }, 60_000);

  it("reads each strong group from the injected rule and keeps it on top", () => {
    const zeroThird = mutateShapes((shapes) => ({ ...shapes, 3: { ...shapes[3], strongClubCount: 0 } }));
    expect(strengthenedHomeCountryClubsForSeason(1981, 4, zeroThird).filter((club) => club.division === 3 && club.strong)).toHaveLength(0);
    const clubs = strengthenedHomeCountryClubsForSeason(1981, 4);
    for (const division of [1, 2, 3, 4] as const) {
      const group = clubs.filter((club) => club.division === division);
      const strong = group.filter((club) => club.strong);
      expect(strong).toHaveLength(rulesForSeason(1981).divisionShapes[division].strongClubCount);
      expect(Math.min(...strong.map((club) => club.squadLevel))).toBeGreaterThanOrEqual(Math.max(...group.filter((club) => !club.strong).map((club) => club.squadLevel)));
    }
  });

  it("gives every identity its seed-derived fair chance of being strong", () => {
    const counts = new Map(HOME_COUNTRY_CLUBS.map((_, index) => [`home-club-${index + 1}`, 0]));
    for (let seed = 0; seed < 1_000; seed += 1) for (const club of strengthenedHomeCountryClubsForSeason(1981, seed)) if (club.strong) counts.set(club.id, counts.get(club.id)! + 1);
    const strong = Object.values(rulesForSeason(1981).divisionShapes).reduce((sum, shape) => sum + shape.strongClubCount, 0);
    const probability = strong / HOME_COUNTRY_CLUBS.length;
    const allowance = 2 * Math.sqrt(1_000 * probability * (1 - probability));
    for (const count of counts.values()) expect(Math.abs(count - 1_000 * probability)).toBeLessThanOrEqual(allowance);
  }, 60_000);

  it("reads injected Division 2 shape and Division 4 structure size", () => {
    const changed = mutateShapes((shapes) => ({ ...shapes, 2: { ...shapes[2], otherMinimum: 1, otherMaximum: 1 } }));
    expect(strengthenedHomeCountryClubsForSeason(1981, 9, changed).filter((club) => club.division === 2 && !club.strong).every((club) => club.squadLevel === 1)).toBe(true);
    const structure = [{ ...LEAGUE_STRUCTURES[0]!, divisionSizes: { ...LEAGUE_STRUCTURES[0]!.divisionSizes, 4: 23 } }];
    expect(strengthenedHomeCountryClubsForSeason(1981, 9, SEASON_RULES, structure).filter((club) => club.division === 4)).toHaveLength(23);
  });

  it("does not alter the playable league when another division changes", () => {
    const changed = mutateShapes((shapes) => ({ ...shapes, 2: { ...shapes[1] } }));
    expect(clubsForSeason(1981, changed, 2468)).toEqual(clubsForSeason(1981, SEASON_RULES, 2468));
  });

  it("rejects disagreement between the two sourced Division 1 sizes", () => {
    expect(() => checkFirstDivisionSizesAgree()).not.toThrow();
    const changed = SEASON_RULES.map((row) => row.rule === "firstDivisionTeams" ? { ...row, value: 20 } : row) as SeasonRule[];
    expect(() => checkFirstDivisionSizesAgree(changed)).toThrow("rule has 20, structure has 22");
  });

  it("is identical for one seed and different for another", () => {
    expect(strengthenedHomeCountryClubsForSeason(1981, 77)).toEqual(strengthenedHomeCountryClubsForSeason(1981, 77));
    expect(strengthenedHomeCountryClubsForSeason(1981, 78)).not.toEqual(strengthenedHomeCountryClubsForSeason(1981, 77));
  });
});
