import { writeFileSync } from "node:fs";
import { DEFAULT_TACTICS, newPlayableSeason, playMatchday, seasonTable } from "./playable-season.js";

const prediction = {
  goalsPerMatch: 2.70,
  homeWinRate: 0.475,
  drawRate: 0.247,
  strongestClubTitles: 95,
};

let matches = 0;
let goals = 0;
let homeWins = 0;
let draws = 0;
let strongestClubTitles = 0;

for (let seed = 500001; seed <= 500200; seed += 1) {
  let state = newPlayableSeason(1981, seed, "club-1");
  const strongestClubId = state.clubs.reduce((best, club) => club.strength > best.strength ? club : best).id;
  while (state.nextRound <= state.clubs.length * 2 - 2) state = playMatchday(state, DEFAULT_TACTICS);
  for (const match of state.matches) {
    matches += 1;
    goals += match.home.goals + match.away.goals;
    if (match.home.goals > match.away.goals) homeWins += 1;
    if (match.home.goals === match.away.goals) draws += 1;
  }
  if (seasonTable(state)[0]!.teamId === strongestClubId) strongestClubTitles += 1;
}

const report = {
  prediction,
  actual: {
    games: 200,
    matches,
    goalsPerMatch: goals / matches,
    homeWinRate: homeWins / matches,
    drawRate: draws / matches,
    strongestClubTitles,
  },
};

writeFileSync("evidence/playable-season-200-games.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
