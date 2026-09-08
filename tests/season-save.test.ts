import { describe, expect, it } from "vitest";
import { runSeason } from "../src/competition.js";
import { makeTeam } from "../src/fixtures.js";
import { loadSeason, saveSeason } from "../src/season-save.js";

describe("season saves", () => {
  it("round-trips a real engine season byte-identically", () => {
    const season = runSeason([
      makeTeam("northbridge", 12),
      makeTeam("redmere", 10),
      makeTeam("kingsford", 10),
      makeTeam("ashvale", 8),
    ], 424242);

    const loaded = loadSeason(saveSeason(season));

    expect(loaded).toEqual(season);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(season));
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
