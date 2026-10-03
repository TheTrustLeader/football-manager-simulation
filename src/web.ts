import "./web.css";
import { isFinished, loadPlayableSeason, playableSquad, playMatchday, prepareNewPlayableSeason, seasonTable, serializePlayableSeason } from "./playable-season.js";
import { rulesForSeason, SEASON_RULES } from "./rules.js";
import type { PlayableSeason } from "./playable-season.js";
import type { SeasonRule } from "./rules.js";
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

export function renderStart(ruleTable: readonly SeasonRule[] = SEASON_RULES): void {
  const newGame = prepareNewPlayableSeason(SEASON, newGameSeed);
  const clubs = newGame.clubs;
  const rules = rulesForSeason(SEASON, ruleTable);
  const matchdays = matchdayCountForSeason(SEASON, ruleTable);
  const tieBreak = rules.tableTieBreak === "goalDifference" ? "goal difference, then goals scored" : "goal average";
  app.innerHTML = `<header><p class="eyebrow">${SEASON_LABEL}</p><h1>Football Manager Simulation: Eras</h1><p>Pick a fictional First Division club and guide it through all ${matchdays} matches.</p></header><section><h2>How the season works</h2><ul><li>${rules.firstDivisionTeams} clubs, ${matchdays} league matches each: everyone plays everyone home and away.</li><li>${rules.pointsForAWin} points for a win, 1 for a draw.</li><li>Clubs level on points are separated by ${tieBreak}.</li><li>${rules.substitutesNamed} substitute${rules.substitutesNamed === 1 ? "" : "s"} named, and ${rules.substitutesUsed} can come on, per match.</li></ul></section><section><h2>Choose your club</h2><p>The dots show how strong each squad is at the start of the season. For a gentler first season, pick one of the stronger clubs and chase the title. For a real test, take a weaker club: staying up is the first job, and anything more is a bonus.</p><div class="clubs">${clubs.map((c) => { const dots = Math.round(c.strength / 2); return `<button data-club="${c.id}"><strong>${c.name}</strong><span>Squad strength ${"●".repeat(dots)}${"○".repeat(7 - dots)}</span></button>`; }).join("")}</div></section>${message ? `<p class="error">${message}</p>` : ""}`;
  app.querySelectorAll<HTMLButtonElement>("[data-club]").forEach((button) => button.onclick = () => { state = newGame.start(button.dataset.club!); persist(); renderGame(); });
}

const ATTRIBUTE_HEADINGS: Readonly<Record<string, string>> = { defending: "Def", passing: "Pas", creativity: "Cre", pace: "Pac", aerial: "Air", finishing: "Fin", crossing: "Cro", stamina: "Sta", leadership: "Ldr", shotStopping: "Sho", handling: "Han", kicking: "Kic" };

function squadTableHtml(squad: ReturnType<typeof playableSquad>): string {
  const attributes = [...new Set(squad.flatMap((player) => Object.keys(player.attributes)))];
  return `<div class="scroll squad"><table><thead><tr><th>Name</th><th>Pos</th><th>Fit</th>${attributes.map((attribute) => `<th>${ATTRIBUTE_HEADINGS[attribute] ?? attribute}</th>`).join("")}</tr></thead><tbody>${squad.map((player) => `<tr data-player="${player.id}"><td>${player.name}</td><td>${player.primaryPosition}</td><td>${Math.round(state!.playerConditions[player.id] ?? player.state.condition)}%</td>${attributes.map((attribute) => `<td data-attribute="${attribute}">${attribute in player.attributes ? Math.round((player.attributes as unknown as Record<string, number>)[attribute]!) : ""}</td>`).join("")}</tr>`).join("")}</tbody></table><p class="attribute-key">Def defending · Pas passing · Cre creativity · Pac pace · Air aerial · Fin finishing · Cro crossing · Sta stamina · Ldr leadership · Sho shot stopping · Han handling · Kic kicking</p></div>`;
}

export function renderGame(): void {
  if (!state) return renderStart();
  const finished = isFinished(state);
  const fixture = state.fixtures.find((f) => f.round === state!.nextRound && (f.homeId === state!.userClubId || f.awayId === state!.userClubId));
  const last = [...state.matches].reverse().find((m) => m.homeTeamId === state!.userClubId || m.awayTeamId === state!.userClubId);
  const squad = playableSquad(state);
  const option = (player: typeof squad[number], chosen: string) => `<option value="${player.id}" ${player.id === chosen ? "selected" : ""}>${player.name} · ${player.primaryPosition} · ${Math.round(state!.playerConditions[player.id] ?? player.state.condition)}%</option>`;
  const playerSelect = (name: string, chosen: string, players = squad) => `<label>${name}<select name="${name}">${players.map((player) => option(player, chosen)).join("")}</select></label>`;
  const rules = rulesForSeason(state.season);
  const selection = `<fieldset><legend>Starting eleven</legend>${state.selection.starterIds.map((id, index) => playerSelect(`starter-${index}`, id)).join("")}</fieldset><fieldset><legend>Named substitutes (${rules.substitutesNamed})</legend>${state.selection.substituteIds.map((id, index) => playerSelect(`substitute-${index}`, id)).join("")}<label><input type="checkbox" name="use-sub" ${state.selection.substitutePlan ? "checked" : ""}> Bring on at 60 minutes if behind</label>${playerSelect("player-off", state.selection.substitutePlan?.playerOff ?? state.selection.starterIds.at(-1)!, squad.filter((player) => state!.selection.starterIds.includes(player.id)))}</fieldset>`;
  app.innerHTML = `<header><p class="eyebrow">${SEASON_LABEL} · ${clubName(state.userClubId)}</p><h1>${finished ? "Season complete" : `Matchday ${state.nextRound} of ${matchdayCountFromFixtures(state.fixtures)}`}</h1>${last ? `<div class="result">Latest: ${clubName(last.homeTeamId)} ${last.home.goals}–${last.away.goals} ${clubName(last.awayTeamId)}</div><details><summary>Key events</summary>${last.events.filter((e) => ["goal", "yellow-card", "red-card", "substitution"].includes(e.type)).map((e) => `<p>${e.minute}' ${e.detail}</p>`).join("") || "No key events."}</details>` : ""}</header>${finished ? `<section><h2>You finished ${ordinal(seasonTable(state).findIndex((r) => r.teamId === state!.userClubId) + 1)}</h2><h3>Top scorers</h3><ol>${scorerRows(state).slice(0, 10).map((row) => `<li>${row.playerName} (${row.clubName}): ${row.goals}</li>`).join("")}</ol><button id="new">New season</button></section>` : `<section><h2>${fixture?.homeId === state.userClubId ? "Home" : "Away"}: ${clubName(fixture?.homeId === state.userClubId ? fixture.awayId : fixture!.homeId)}</h2><h3>Squad</h3>${squadTableHtml(squad)}<form>${select("Formation", ["4-4-2","4-3-3","4-5-1","3-5-2","5-3-2"], state.tactics.formation)}${select("Style", ["balanced","passing","direct","counter"], state.tactics.style)}${select("Approach", ["cautious","balanced","attacking"], state.tactics.approach)}${select("Tackling", ["careful","normal","hard"], state.tactics.tackling)}${selection}${message ? `<p class="error">${message}</p>` : ""}<button>Play matchday</button></form></section>`}<section><h2>League table</h2>${tableHtml()}</section><button class="link" id="new">Start a new game</button>`;
  app.querySelector<HTMLFormElement>("form")?.addEventListener("submit", (event) => { event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement); const starterIds = Array.from({ length: 11 }, (_, index) => String(data.get(`starter-${index}`))); const substituteIds = Array.from({ length: rules.substitutesNamed }, (_, index) => String(data.get(`substitute-${index}`))); const playerOn = substituteIds[0]!; try { state = playMatchday(state!, { formation: data.get("formation") as Formation, style: data.get("style") as Style, approach: data.get("approach") as Approach, tackling: data.get("tackling") as Tackling, selection: { starterIds, substituteIds, ...(data.get("use-sub") ? { substitutePlan: { minute: 60, playerOff: String(data.get("player-off")), playerOn, whenTrailing: true } } : {}) } }); message = ""; persist(); renderGame(); } catch (error) { message = error instanceof Error ? error.message : "Invalid selection"; renderGame(); } });
  app.querySelectorAll<HTMLButtonElement>("#new").forEach((b) => b.onclick = () => { if (confirm("Start over and erase this season?")) { localStorage.removeItem(KEY); state = undefined; newGameSeed = Math.floor(Math.random() * 0xffffffff); renderStart(); } });
}

const saved = localStorage.getItem(KEY);
if (saved) { try { state = loadPlayableSeason(saved); } catch (error) { message = error instanceof Error ? error.message : "The saved game cannot be loaded."; } }
if (state) renderGame(); else renderStart();
