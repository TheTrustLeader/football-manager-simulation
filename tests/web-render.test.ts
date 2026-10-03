import { beforeEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { playableSquad, prepareNewPlayableSeason } from "../src/playable-season.js";
import { SEASON_RULES } from "../src/rules.js";
import type { SeasonRule } from "../src/rules.js";

const RANDOM = 0.25;
const SEED = Math.floor(RANDOM * 0xffffffff);

async function loadPage() {
  vi.resetModules();
  vi.spyOn(Math, "random").mockReturnValue(RANDOM);
  const window = new Window();
  Object.assign(globalThis, {
    window,
    document: window.document,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    FormData: window.FormData,
  });
  document.body.innerHTML = '<main id="app"></main>';
  localStorage.clear();
  return import("../src/web.js");
}

beforeEach(() => vi.restoreAllMocks());

describe("rendered web page", () => {
  it("shows every engine attribute, rounded, for every squad player", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    const expected = prepareNewPlayableSeason(1981, SEED).start("club-1");
    const squad = playableSquad(expected);

    for (const player of squad) {
      const row = document.querySelector(`[data-player="${player.id}"]`)!;
      for (const attribute of Object.keys(player.attributes)) {
        expect(row.querySelector(`[data-attribute="${attribute}"]`)?.textContent).toBe(
          String(Math.round((player.attributes as unknown as Record<string, number>)[attribute]!)),
        );
      }
    }
  });

  it("does not expose hidden traits", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    const page = document.querySelector("#app")!.textContent!.toLowerCase();
    for (const trait of ["consistency", "injury susceptibility", "temperament", "potential", "adaptability"]) {
      expect(page).not.toContain(trait);
    }
  });

  it("puts the squad table on the matchday screen in its own scrolling box", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    expect(document.querySelector(".scroll.squad table")).not.toBeNull();
    const expectedCount = playableSquad(prepareNewPlayableSeason(1981, SEED).start("club-1")).length;
    expect(document.querySelectorAll(".scroll.squad [data-player]")).toHaveLength(expectedCount);
  });

  it("explains squad strength and labels every club's dots", async () => {
    await loadPage();
    const page = document.querySelector("#app")!.textContent!;
    expect(page).toContain("The dots show how strong each squad is at the start of the season.");
    expect(page).toContain("For a gentler first season, pick one of the stronger clubs and chase the title.");
    expect(page).toContain("For a real test, take a weaker club: staying up is the first job, and anything more is a bonus.");
    expect([...document.querySelectorAll(".clubs span")].every((label) => label.textContent!.startsWith("Squad strength "))).toBe(true);
  });

  it("shows only player-facing rules and reads their values from the supplied rule table", async () => {
    const { renderStart } = await loadPage();
    const twoSubstitutes: readonly SeasonRule[] = SEASON_RULES.map((row) =>
      row.rule === "substitutesNamed" ? { ...row, value: 2 } : row,
    );
    renderStart(twoSubstitutes);
    const page = document.querySelector("#app")!.textContent!;

    expect(page).toContain("How the season works");
    expect(page).toContain("22 clubs, 42 league matches each: everyone plays everyone home and away.");
    expect(page).toContain("3 points for a win, 1 for a draw.");
    expect(page).toContain("Clubs level on points are separated by goal difference, then goals scored.");
    expect(page).toContain("2 substitutes named, and 1 can come on, per match.");
    expect(page).not.toMatch(/Rules in force|worldfootball|Design decision|adapt|match-up|round gap|25%/i);
  });
});
