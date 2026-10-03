import "./web.css";
import { isFinished, loadPlayableSeason, playableSquad, playMatchday, prepareNewPlayableSeason, ruleDescriptions, seasonTable, serializePlayableSeason } from "./playable-season.js";
import { rulesForSeason, SEASON_RULES } from "./rules.js";
import type { PlayableSeason } from "./playable-season.js";
import type { Approach, Formation, Style, Tackling } from "./types.js";
import { matchdayCountForSeason, matchdayCountFromFixtures, ordinal, scorerRows } from "./web-display.js";

const SEASON = 1981;
const SEASON_LABEL = `${SEASON}/${String(SEASON + 1).slice(-2)}`;
const KEY = "football-manager-simulation-save";
const app = document.querySelector<HTMLElement>("#app")!;
let state: PlayableSeason | undefined;
let message = "";
let newGameSeed = Math.floor(Math.random() * 0xffffffff);
const clubName = (id: string) => state?.clubs.find((club) => club.id === id)?.name ?? id;

function persist(): void { if (state) localStorage.setItem(KEY, serializePlayableSeason(state)); }
function select(name: string, values: readonly string[], selected: string): string { return `<label>${name}<select name="${name.toLowerCase()}">${values.map((v) => `<option ${v === selected ? "selected" : ""}>${v}</option>`).join("")}</select></label>`; }
function tableHtml(): string { return `<div class="scroll"><table><thead><tr><th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>F</th><th>A</th><th>GD</th><th>Pts</th></tr></thead><tbody>${seasonTable(state!).map((r, i) => `<tr class="${r.teamId === state!.userClubId ? "mine" : ""}"><td>${i + 1}</td><td>${clubName(r.teamId)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.goalsFor}</td><td>${r.goalsAgainst}</td><td>${r.goalDifference}</td><td>${r.points}</td></tr>`).join("")}</tbody></table></div>`; }

function renderStart(): void {
  const newGame = prepareNewPlayableSeason(SEASON, newGameSeed);
  const clubs = newGame.clubs;
  const descriptions = ruleDescriptions(SEASON);
  app.innerHTML = `<header><p class="eyebrow">${SEASON_LABEL}</p><h1>Football Manager Simulation: Eras</h1><p>Pick a fictional First Division club and guide it through all ${matchdayCountForSeason(SEASON, SEASON_RULES)} matches.</p></header><section><h2>Rules in force</h2>${SEASON_RULES.map((r, i) => `<p><strong>${descriptions[i]}</strong><br><small>${r.source}</small></p>`).join("")}</section><section><h2>Choose your club</h2><div class="clubs">${clubs.map((c) => `<button data-club="${c.id}"><strong>${c.name}</strong><span>Strength ${"●".repeat(Math.round(c.strength / 2))}</span></button>`).join("")}</div></section>${message ? `<p class="error">${message}</p>` : ""}`;
  app.querySelectorAll<HTMLButtonElement>("[data-club]").forEach((button) => button.onclick = () => { state = newGame.start(button.dataset.club!); persist(); renderGame(); });
}

function renderGame(): void {
  if (!state) return renderStart();
  const finished = isFinished(state);
  const fixture = state.fixtures.find((f) => f.round === state!.nextRound && (f.homeId === state!.userClubId || f.awayId === state!.userClubId));
  const last = [...state.matches].reverse().find((m) => m.homeTeamId === state!.userClubId || m.awayTeamId === state!.userClubId);
  const squad = playableSquad(state);
  const option = (player: typeof squad[number], chosen: string) => `<option value="${player.id}" ${player.id === chosen ? "selected" : ""}>${player.name} · ${player.primaryPosition} · ${Math.round(state!.playerConditions[player.id] ?? player.state.condition)}%</option>`;
  const playerSelect = (name: string, chosen: string, players = squad) => `<label>${name}<select name="${name}">${players.map((player) => option(player, chosen)).join("")}</select></label>`;
  const rules = rulesForSeason(state.season);
  const selection = `<fieldset><legend>Starting eleven</legend>${state.selection.starterIds.map((id, index) => playerSelect(`starter-${index}`, id)).join("")}</fieldset><fieldset><legend>Named substitutes (${rules.substitutesNamed})</legend>${state.selection.substituteIds.map((id, index) => playerSelect(`substitute-${index}`, id)).join("")}<label><input type="checkbox" name="use-sub" ${state.selection.substitutePlan ? "checked" : ""}> Bring on at 60 minutes if behind</label>${playerSelect("player-off", state.selection.substitutePlan?.playerOff ?? state.selection.starterIds.at(-1)!, squad.filter((player) => state!.selection.starterIds.includes(player.id)))}</fieldset>`;
  app.innerHTML = `<header><p class="eyebrow">${SEASON_LABEL} · ${clubName(state.userClubId)}</p><h1>${finished ? "Season complete" : `Matchday ${state.nextRound} of ${matchdayCountFromFixtures(state.fixtures)}`}</h1>${last ? `<div class="result">Latest: ${clubName(last.homeTeamId)} ${last.home.goals}–${last.away.goals} ${clubName(last.awayTeamId)}</div><details><summary>Key events</summary>${last.events.filter((e) => ["goal", "yellow-card", "red-card", "substitution"].includes(e.type)).map((e) => `<p>${e.minute}' ${e.detail}</p>`).join("") || "No key events."}</details>` : ""}</header>${finished ? `<section><h2>You finished ${ordinal(seasonTable(state).findIndex((r) => r.teamId === state!.userClubId) + 1)}</h2><h3>Top scorers</h3><ol>${scorerRows(state).slice(0, 10).map((row) => `<li>${row.playerName} (${row.clubName}): ${row.goals}</li>`).join("")}</ol><button id="new">New season</button></section>` : `<section><h2>${fixture?.homeId === state.userClubId ? "Home" : "Away"}: ${clubName(fixture?.homeId === state.userClubId ? fixture.awayId : fixture!.homeId)}</h2><form>${select("Formation", ["4-4-2","4-3-3","4-5-1","3-5-2","5-3-2"], state.tactics.formation)}${select("Style", ["balanced","passing","direct","counter"], state.tactics.style)}${select("Approach", ["cautious","balanced","attacking"], state.tactics.approach)}${select("Tackling", ["careful","normal","hard"], state.tactics.tackling)}${selection}${message ? `<p class="error">${message}</p>` : ""}<button>Play matchday</button></form></section>`}<section><h2>League table</h2>${tableHtml()}</section><button class="link" id="new">Start a new game</button>`;
  app.querySelector<HTMLFormElement>("form")?.addEventListener("submit", (event) => { event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement); const starterIds = Array.from({ length: 11 }, (_, index) => String(data.get(`starter-${index}`))); const substituteIds = Array.from({ length: rules.substitutesNamed }, (_, index) => String(data.get(`substitute-${index}`))); const playerOn = substituteIds[0]!; const naturalPositions = new Map(squad.map((player) => [player.id, player.primaryPosition])); try { state = playMatchday(state!, { formation: data.get("formation") as Formation, style: data.get("style") as Style, approach: data.get("approach") as Approach, tackling: data.get("tackling") as Tackling, selection: { starterIds, playedPositions: Object.fromEntries(starterIds.map((id) => [id, naturalPositions.get(id)!])), substituteIds, ...(data.get("use-sub") ? { substitutePlan: { minute: 60, playerOff: String(data.get("player-off")), playerOn, whenTrailing: true } } : {}) } }); message = ""; persist(); renderGame(); } catch (error) { message = error instanceof Error ? error.message : "Invalid selection"; renderGame(); } });
  app.querySelectorAll<HTMLButtonElement>("#new").forEach((b) => b.onclick = () => { if (confirm("Start over and erase this season?")) { localStorage.removeItem(KEY); state = undefined; newGameSeed = Math.floor(Math.random() * 0xffffffff); renderStart(); } });
}

const saved = localStorage.getItem(KEY);
if (saved) { try { state = loadPlayableSeason(saved); } catch (error) { message = error instanceof Error ? error.message : "The saved game cannot be loaded."; } }
if (state) renderGame(); else renderStart();
