import { matchResultHash } from "./match-result.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import { formatRunProvenance, readGitProvenance } from "./provenance.js";

const seed = 424242;
const provenance = readGitProvenance();

// Provenance goes to STDERR so that
//     npm run --silent golden:print > tests/golden-output.json
// writes a valid JSON file. It used to go to stdout, which meant the documented
// rebaseline could only be done by hand-copying four values out of a mixed
// human-and-JSON blob - and hand-copying a reference value is exactly how a
// wrong number gets blessed as correct.
console.error(`${formatRunProvenance("MATCH LAB GOLDEN OUTPUT", provenance)}\n`);

const output = simulateMatch({
  seed,
  neutralVenue: true,
  home: makeTeam("golden-home", 10),
  away: makeTeam("golden-away", 10),
});

// Only what the reference file needs. gitCommit and dirtyTree are deliberately
// absent: they change on every commit, so including them would make the golden
// file churn against a value no assertion reads. They are still shown above.
console.log(JSON.stringify({
  seed,
  engineConfigVersion: output.engineConfigVersion,
  engineConfigHash: output.engineConfigHash,
  matchResultHash: matchResultHash(output),
}, null, 2));
