import { describe, expect, it } from "vitest";
import { runSeason } from "../src/competition.js";
import { makeTeam } from "../src/fixtures.js";
import { loadSeason, saveSeason } from "../src/season-save.js";

describe("season saves", () => {
  const savedSeason = (season = 1981) => runSeason([
    makeTeam("northbridge", 12),
    makeTeam("redmere", 10),
    makeTeam("kingsford", 10),
    makeTeam("ashvale", 8),
  ], 424242, season);

  it("round-trips a real engine season byte-identically", () => {
    const season = savedSeason();

    const loaded = loadSeason(saveSeason(season));

    expect(loaded).toEqual(season);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(season));
  });

  it("records a non-1981 season and preserves it through save and load", () => {
    const season = savedSeason(1990);

    expect(season.season).toBe(1990);
    expect(loadSeason(saveSeason(season)).season).toBe(1990);
  });

  it("rejects the pre-season-field save format because a missing season cannot load", () => {
    const saved = JSON.parse(saveSeason(savedSeason())) as Record<string, unknown>;
    delete saved.season;

    expect(() => loadSeason(JSON.stringify(saved)))
      .toThrow("Malformed season save: expected a complete SeasonResult");
  });

  it.each([1981.5, "1981"])("rejects a present but non-integer season (%j)", (invalidSeason) => {
    const saved = JSON.parse(saveSeason(savedSeason())) as Record<string, unknown>;
    saved.season = invalidSeason;

    expect(() => loadSeason(JSON.stringify(saved)))
      .toThrow("Malformed season save: expected a complete SeasonResult");
  });

  it("rejects a corrupted string with a clear error", () => {
    expect(() => loadSeason("{not JSON"))
      .toThrow("Malformed season save: invalid JSON");
  });

  it("rejects valid JSON that is not a complete season", () => {
    expect(() => loadSeason('{"seed": 1}'))
      .toThrow("Malformed season save: expected a complete SeasonResult");
  });
});
