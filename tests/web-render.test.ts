import { beforeEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { playableSquad, prepareNewPlayableSeason } from "../src/playable-season.js";
import { SEASON_RULES } from "../src/rules.js";
import { ENGINE_CONFIG } from "../src/engine-config.js";
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
  it("uses exactly the visible player-data attributes as squad headings", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    const squad = playableSquad(prepareNewPlayableSeason(1981, SEED).start("club-1"));
    const attributes = [...new Set(squad.flatMap((player) => Object.keys(player.attributes)))];
    const abbreviations: Readonly<Record<string, string>> = { defending: "Def", passing: "Pas", creativity: "Cre", pace: "Pac", aerial: "Air", finishing: "Fin", crossing: "Cro", stamina: "Sta", leadership: "Ldr", shotStopping: "Sho", handling: "Han", kicking: "Kic" };
    const headings = [...document.querySelectorAll(".squad thead th")].map((heading) => heading.textContent);

    expect(headings).toEqual(["Name", "Pos", "Fit", ...attributes.map((attribute) => abbreviations[attribute] ?? attribute)]);
  });

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

  it("builds every formation's pitch spots from the engine requirements and removes starter dropdowns", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    for (const formation of Object.keys(ENGINE_CONFIG.squadGeneration.formationPositionRequirements)) {
      const select = document.querySelector<HTMLSelectElement>('select[name="formation"]')!;
      select.value = formation;
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
      const actual = [...document.querySelectorAll<HTMLElement>("[data-spot]")].reduce<Record<string, number>>((counts, spot) => {
        const position = spot.dataset.position!; counts[position] = (counts[position] ?? 0) + 1; return counts;
      }, {});
      expect(actual).toEqual(ENGINE_CONFIG.squadGeneration.formationPositionRequirements[formation as keyof typeof ENGINE_CONFIG.squadGeneration.formationPositionRequirements]);
      expect(document.querySelector('[name^="starter-"]')).toBeNull();
    }
  });

  it("uses tap placement, swaps occupants, removes to the squad, and autosaves the spot position", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    const winger = document.querySelector<HTMLElement>('[data-position="WM"] [data-pick]')!;
    const wingerId = winger.dataset.pick!;
    const forwardSpot = document.querySelector<HTMLElement>('[data-position="FW"]')!;
    const forwardId = forwardSpot.querySelector<HTMLElement>("[data-pick]")!.dataset.pick!;
    winger.click(); forwardSpot.click();
    const saved = JSON.parse(localStorage.getItem("football-manager-simulation-save")!);
    expect(saved.selection.playedPositions[wingerId]).toBe("FW");
    expect(saved.selection.playedPositions[forwardId]).toBe("WM");
    expect(document.querySelector(`[data-position="FW"] [data-pick="${wingerId}"]`)?.textContent).toContain("out of position · plays at 90%");

    document.querySelector<HTMLElement>(`[data-pick="${wingerId}"]`)!.click();
    document.querySelector<HTMLElement>("[data-squad]")!.click();
    expect(document.querySelector<HTMLButtonElement>('form button[type="submit"], form > button:last-of-type')?.disabled).toBe(true);
    expect(document.querySelector(".selection-status")!.textContent).toContain("1 pitch spot empty");
  });

  it("refuses goalkeeper misuse before play", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    const keeper = document.querySelector<HTMLElement>('[data-position="GK"] [data-pick]')!;
    keeper.click(); document.querySelector<HTMLElement>('[data-position="CB"]')!.click();
    expect(document.querySelector(".error")!.textContent).toContain("goalkeeper cannot play outfield");
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
    const changedRules: readonly SeasonRule[] = SEASON_RULES.map((row): SeasonRule => {
      if (row.rule === "firstDivisionTeams") return { ...row, value: 20 };
      if (row.rule === "pointsForAWin") return { ...row, value: 2 };
      if (row.rule === "tableTieBreak") return { ...row, value: "goalAverage" };
      if (row.rule === "substitutesNamed") return { ...row, value: 2 };
      return row;
    });
    renderStart(changedRules);
    const page = document.querySelector("#app")!.textContent!;

    expect(page).toContain("How the season works");
    expect(page).toContain("20 clubs, 38 league matches each: everyone plays everyone home and away.");
    expect(page).toContain("2 points for a win, 1 for a draw.");
    expect(page).toContain("Clubs level on points are separated by goal average.");
    expect(page).toContain("2 substitutes named, and 1 can come on, per match.");
    expect(page).not.toMatch(/Rules in force|worldfootball|Design decision|adapt|match-up|round gap|25%/i);
  });

  it("scales strength dots to the strongest club in the current league", async () => {
    const { renderStart } = await loadPage();
    const newGame = prepareNewPlayableSeason(1981, SEED);
    newGame.clubs[0]!.strength = 20;

    expect(() => renderStart(SEASON_RULES, newGame)).not.toThrow();
    const label = document.querySelector(`[data-club="${newGame.clubs[0]!.id}"] span`)!.textContent!;
    expect(label).toBe(`Squad strength ${"●".repeat(10)}`);
    expect(label).not.toContain("○");
  });
});
