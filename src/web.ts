import "./web.css";
import { clubsForSeason, isFinished, loadPlayableSeason, newPlayableSeason, playMatchday, ruleDescriptions, seasonTable, serializePlayableSeason, topScorers } from "./playable-season.js";
import { SEASON_RULES } from "./rules.js";
import type { PlayableSeason } from "./playable-season.js";
import type { Approach, Formation, Style, Tackling } from "./types.js";

const SEASON = 1981;
const KEY = "football-manager-simulation-save";
const app = document.querySelector<HTMLElement>("#app")!;
let state: PlayableSeason | undefined;
let message = "";
const clubName = (id: string) => state?.clubs.find((club) => club.id === id)?.name ?? id;

function persist(): void { if (state) localStorage.setItem(KEY, serializePlayableSeason(state)); }
function select(name: string, values: readonly string[], selected: string): string { return `<label>${name}<select name="${name.toLowerCase()}">${values.map((v) => `<option ${v === selected ? "selected" : ""}>${v}</option>`).join("")}</select></label>`; }
function tableHtml(): string { return `<div class="scroll"><table><thead><tr><th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>F</th><th>A</th><th>GD</th><th>Pts</th></tr></thead><tbody>${seasonTable(state!).map((r, i) => `<tr class="${r.teamId === state!.userClubId ? "mine" : ""}"><td>${i + 1}</td><td>${clubName(r.teamId)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.goalsFor}</td><td>${r.goalsAgainst}</td><td>${r.goalDifference}</td><td>${r.points}</td></tr>`).join("")}</tbody></table></div>`; }

function renderStart(): void {
  const clubs = clubsForSeason(SEASON);
  const descriptions = ruleDescriptions(SEASON);
  app.innerHTML = `<header><p class="eyebrow">1981/82</p><h1>Football Manager Simulation: Eras</h1><p>Pick a fictional First Division club and guide it through all 42 matches.</p></header><section><h2>Rules in force</h2>${SEASON_RULES.map((r, i) => `<p><strong>${descriptions[i]}</strong><br><small>${r.source}</small></p>`).join("")}</section><section><h2>Choose your club</h2><div class="clubs">${clubs.map((c) => `<button data-club="${c.id}"><strong>${c.name}</strong><span>Strength ${"●".repeat(Math.round(c.strength / 2))}</span></button>`).join("")}</div></section>${message ? `<p class="error">${message}</p>` : ""}`;
  app.querySelectorAll<HTMLButtonElement>("[data-club]").forEach((button) => button.onclick = () => { state = newPlayableSeason(SEASON, Math.floor(Math.random() * 0xffffffff), button.dataset.club!); persist(); renderGame(); });
}

function renderGame(): void {
  if (!state) return renderStart();
  const finished = isFinished(state);
  const fixture = state.fixtures.find((f) => f.round === state!.nextRound && (f.homeId === state!.userClubId || f.awayId === state!.userClubId));
  const last = [...state.matches].reverse().find((m) => m.homeTeamId === state!.userClubId || m.awayTeamId === state!.userClubId);
  app.innerHTML = `<header><p class="eyebrow">1981/82 · ${clubName(state.userClubId)}</p><h1>${finished ? "Season complete" : `Matchday ${state.nextRound} of 42`}</h1>${last ? `<div class="result">Latest: ${clubName(last.homeTeamId)} ${last.home.goals}–${last.away.goals} ${clubName(last.awayTeamId)}</div><details><summary>Key events</summary>${last.events.filter((e) => ["goal", "yellow-card", "red-card"].includes(e.type)).map((e) => `<p>${e.minute}' ${e.detail}</p>`).join("") || "No goals or cards."}</details>` : ""}</header>${finished ? `<section><h2>You finished ${seasonTable(state).findIndex((r) => r.teamId === state!.userClubId) + 1}${["th","st","nd","rd"][Math.min(4, seasonTable(state).findIndex((r) => r.teamId === state!.userClubId) + 1)] ?? "th"}</h2><h3>Top scorers</h3><ol>${topScorers(state).slice(0, 10).map((p) => `<li>${p.playerId}: ${p.goals}</li>`).join("")}</ol><button id="new">New season</button></section>` : `<section><h2>${fixture?.homeId === state.userClubId ? "Home" : "Away"}: ${clubName(fixture?.homeId === state.userClubId ? fixture.awayId : fixture!.homeId)}</h2><form>${select("Formation", ["4-4-2","4-3-3","4-5-1","3-5-2","5-3-2"], state.tactics.formation)}${select("Style", ["balanced","passing","direct","counter"], state.tactics.style)}${select("Approach", ["cautious","balanced","attacking"], state.tactics.approach)}${select("Tackling", ["careful","normal","hard"], state.tactics.tackling)}<button>Play matchday</button></form></section>`}<section><h2>League table</h2>${tableHtml()}</section><button class="link" id="new">Start a new game</button>`;
  app.querySelector<HTMLFormElement>("form")?.addEventListener("submit", (event) => { event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement); state = playMatchday(state!, { formation: data.get("formation") as Formation, style: data.get("style") as Style, approach: data.get("approach") as Approach, tackling: data.get("tackling") as Tackling }); persist(); renderGame(); });
  app.querySelectorAll<HTMLButtonElement>("#new").forEach((b) => b.onclick = () => { if (confirm("Start over and erase this season?")) { localStorage.removeItem(KEY); state = undefined; renderStart(); } });
}

const saved = localStorage.getItem(KEY);
if (saved) { try { state = loadPlayableSeason(saved); } catch (error) { message = error instanceof Error ? error.message : "The saved game cannot be loaded."; } }
if (state) renderGame(); else renderStart();
