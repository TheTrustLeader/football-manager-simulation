import { formatLeagueTable, formatTopScorers, runSeason } from "./competition.js";
import { makeTeam } from "./fixtures.js";
import { printRunProvenance, readGitProvenance } from "./provenance.js";

// A four-team example so the football can be eyeballed. Team ids and levels are
// placeholders for a demonstration, not a league design: naming and league size
// are deliberately out of scope for this groundwork.
const TEAMS = [
  makeTeam("northbridge", 12),
  makeTeam("redmere", 10),
  makeTeam("kingsford", 10),
  makeTeam("ashvale", 8),
];

const requested = Number.parseInt(process.argv[2] ?? "424242", 10);
const seed = Number.isFinite(requested) ? requested : 424242;

printRunProvenance("MATCH LAB SEASON", readGitProvenance());

const season = runSeason(TEAMS, seed);

console.log(`Season seed ${season.seed} — ${season.teamIds.length} teams, `
  + `${season.fixtures.length} fixtures, ${season.matches.length} matches played\n`);
console.log(formatLeagueTable(season.table));
console.log(`\nTop scorers\n${formatTopScorers(season.playerStats)}`);
