import { beforeEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { playableSquad, prepareNewPlayableSeason } from "../src/playable-season.js";
import { SEASON_RULES } from "../src/rules.js";
import { ENGINE_CONFIG } from "../src/engine-config.js";
import type { SeasonRule } from "../src/rules.js";

const RANDOM = 0.25;
const SEED = Math.floor(RANDOM * 0xffffffff);

async function loadPage(saved?: string) {
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
  if (saved) localStorage.setItem("football-manager-simulation-save", saved);
  return import("../src/web.js");
}

function playButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>("form > button")!;
}

function savedGame() {
  return JSON.parse(localStorage.getItem("football-manager-simulation-save")!);
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

  it("leaves pitch and bench selections unique when a player is tapped onto his own place", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    const pitchPlayer = document.querySelector<HTMLElement>('[data-position="CB"] [data-pick]')!;
    const pitchId = pitchPlayer.dataset.pick!;
    pitchPlayer.click();
    document.querySelector<HTMLElement>(`[data-position="CB"] [data-pick="${pitchId}"]`)!.closest<HTMLElement>("[data-spot]")!.click();
    const afterPitch = savedGame();
    expect(afterPitch.selection.starterIds).toHaveLength(11);
    expect(new Set(afterPitch.selection.starterIds)).toHaveLength(11);

    const benchPlayer = document.querySelector<HTMLElement>("[data-bench] [data-pick]")!;
    const benchId = benchPlayer.dataset.pick!;
    benchPlayer.click();
    document.querySelector<HTMLElement>(`[data-bench] [data-pick="${benchId}"]`)!.closest<HTMLElement>("[data-bench]")!.click();
    const afterBench = savedGame();
    expect(afterBench.selection.substituteIds).toEqual([benchId]);
    playButton().click();
    expect(savedGame().nextRound).toBe(2);
  });

  it("submits the pitch spot as the player's played position", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    const winger = document.querySelector<HTMLElement>('[data-position="WM"] [data-pick]')!;
    const wingerId = winger.dataset.pick!;
    winger.click(); document.querySelector<HTMLElement>('[data-position="FW"]')!.click();
    playButton().click();
    const saved = savedGame();
    expect(saved.nextRound).toBe(2);
    expect(saved.selection.playedPositions[wingerId]).toBe("FW");
  });

  it("uses drag and drop to make the same placement as tapping", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    const winger = document.querySelector<HTMLElement>('[data-position="WM"] [data-pick]')!;
    const wingerId = winger.dataset.pick!;
    const target = document.querySelector<HTMLElement>('[data-position="FW"]')!;
    const transfer = { value: "", setData(_type: string, value: string) { this.value = value; }, getData() { return this.value; } };
    for (const [element, type] of [[winger, "dragstart"], [target, "dragover"], [target, "drop"]] as const) {
      const event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: transfer });
      element.dispatchEvent(event);
    }
    expect(savedGame().selection.playedPositions[wingerId]).toBe("FW");
    expect(document.querySelector(`[data-position="FW"] [data-pick="${wingerId}"]`)).not.toBeNull();
  });

  it("derives penalty markers from injected config and omits them for natural positions", async () => {
    const { renderGame } = await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    const changed = { ...ENGINE_CONFIG, positionPenalty: { ...ENGINE_CONFIG.positionPenalty, neighbouring: 0.8, far: 0.6 } };
    renderGame(changed);
    const winger = document.querySelector<HTMLElement>('[data-position="WM"] [data-pick]')!;
    const wingerId = winger.dataset.pick!;
    winger.click(); document.querySelector<HTMLElement>('[data-position="FW"]')!.click();
    expect(document.querySelector(`[data-position="FW"] [data-pick="${wingerId}"]`)!.textContent).toContain("plays at 80%");
    const centreBack = document.querySelector<HTMLElement>('[data-position="CB"] [data-pick]')!;
    const centreBackId = centreBack.dataset.pick!;
    centreBack.click(); document.querySelector<HTMLElement>('[data-position="FW"]')!.click();
    expect(document.querySelector(`[data-position="FW"] [data-pick="${centreBackId}"]`)!.textContent).toContain("plays at 60%");
    expect(document.querySelector('[data-position="GK"] [data-pick]')!.textContent).not.toContain("out of position");
  });

  it("refuses an outfield player in goal and leaves the goalkeeper in place", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    const keeperId = document.querySelector<HTMLElement>('[data-position="GK"] [data-pick]')!.dataset.pick!;
    const outfielder = document.querySelector<HTMLElement>('[data-position="CB"] [data-pick]')!;
    outfielder.click(); document.querySelector<HTMLElement>('[data-position="GK"]')!.click();
    expect(document.querySelector(".error")!.textContent).toContain("Only a natural goalkeeper can play in goal.");
    expect(document.querySelector(`[data-position="GK"] [data-pick="${keeperId}"]`)).not.toBeNull();
  });

  it("keeps nine compatible starters and returns both wingers on a 4-4-2 to 4-3-3 change", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    const before = savedGame();
    const wingerIds = before.selection.starterIds.filter((id: string) => before.selection.playedPositions[id] === "WM");
    const kept = Object.fromEntries(Object.entries(before.selection.playedPositions).filter(([id]) => !wingerIds.includes(id)));
    const formation = document.querySelector<HTMLSelectElement>('select[name="formation"]')!;
    formation.value = "4-3-3"; formation.dispatchEvent(new window.Event("change", { bubbles: true }));
    const after = savedGame();
    expect(after.selection.playedPositions).toEqual(kept);
    expect(after.selection.starterIds).toHaveLength(9);
    expect(wingerIds.every((id: string) => document.querySelector(`[data-squad] [data-pick="${id}"]`))).toBe(true);
    expect(document.querySelector(".selection-status")!.textContent).toContain("2 pitch spots empty");
  });

  it("restores an out-of-position spot on reload and submits that spot", async () => {
    await loadPage();
    document.querySelector<HTMLButtonElement>("[data-club]")!.click();
    const winger = document.querySelector<HTMLElement>('[data-position="WM"] [data-pick]')!;
    const wingerId = winger.dataset.pick!;
    winger.click(); document.querySelector<HTMLElement>('[data-position="FW"]')!.click();
    const saved = localStorage.getItem("football-manager-simulation-save")!;
    await loadPage(saved);
    expect(document.querySelector(`[data-position="FW"] [data-pick="${wingerId}"]`)).not.toBeNull();
    playButton().click();
    expect(savedGame().nextRound).toBe(2);
    expect(savedGame().selection.playedPositions[wingerId]).toBe("FW");
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
