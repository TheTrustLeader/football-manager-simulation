import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveEraBandRow, eraBandsForSeason, readSeasonCounts } from "../src/era-bands.js";

describe("dated era bands", () => {
  it("derives the 1978/79-1985/86 bands from the committed counts", () => {
    const row = deriveEraBandRow();
    expect({ first: row.sourceFirstSeason, last: row.sourceLastSeason, matches: row.sourceMatches }).toEqual({ first: "1978/79", last: "1985/86", matches: 3696 });
    expect(Object.values(row.bands.goalsPerMatch).map((value) => value.toFixed(4))).toEqual(["2.4585", "2.8808", "2.6696", "0.1056"]);
    expect(Object.values(row.bands.homeWinRate).map((value) => value.toFixed(4))).toEqual(["0.4335", "0.5627", "0.4981", "0.0323"]);
    expect(Object.values(row.bands.drawRate).map((value) => value.toFixed(4))).toEqual(["0.2056", "0.3156", "0.2606", "0.0275"]);
  });

  it("rejects a season before the first dated row", () => {
    expect(() => eraBandsForSeason(1980)).toThrow(/1980.*no matching row/);
  });

  it("checks every CSV row's result counts", () => {
    const csv = readFileSync("data/english-first-division-seasons.csv", "utf8");
    expect(readSeasonCounts(csv).length).toBeGreaterThan(0);
    expect(() => readSeasonCounts(csv.replace("1974/75,1974,462,235,124,103", "1974/75,1974,462,235,123,103"))).toThrow(/Inconsistent result counts for 1974\/75/);
  });
});
