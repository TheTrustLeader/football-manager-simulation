import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import { printRunProvenance, readGitProvenance } from "./provenance.js";

const requested = Number.parseInt(process.argv[2] ?? "1000", 10);
const count = Number.isFinite(requested) && requested > 0 ? requested : 1000;
const provenance = readGitProvenance();
printRunProvenance("MATCH LAB SIMULATION", provenance);

let homeWins = 0;
let draws = 0;
let awayWins = 0;
let homeGoals = 0;
let awayGoals = 0;

const started = performance.now();

for (let seed = 1; seed <= count; seed += 1) {
  const result = simulateMatch({
    seed,
    home: makeTeam("northbridge", 10),
    away: makeTeam("redmere", 10),
  });

  homeGoals += result.home.goals;
  awayGoals += result.away.goals;

  if (result.home.goals > result.away.goals) homeWins += 1;
  else if (result.home.goals < result.away.goals) awayWins += 1;
  else draws += 1;
}

const elapsedMs = performance.now() - started;
const totalGoals = homeGoals + awayGoals;
const percent = (value: number) => `${((value / count) * 100).toFixed(1)}%`;

console.log(`Matches: ${count.toLocaleString()}`);
console.log(`Home wins: ${homeWins.toLocaleString()} (${percent(homeWins)})`);
console.log(`Draws: ${draws.toLocaleString()} (${percent(draws)})`);
console.log(`Away wins: ${awayWins.toLocaleString()} (${percent(awayWins)})`);
console.log(`Goals/match: ${(totalGoals / count).toFixed(3)}`);
console.log(`Home goals/match: ${(homeGoals / count).toFixed(3)}`);
console.log(`Away goals/match: ${(awayGoals / count).toFixed(3)}`);
console.log(`Elapsed: ${elapsedMs.toFixed(1)} ms`);
console.log(`Throughput: ${((count / elapsedMs) * 1000).toFixed(0)} matches/sec`);
