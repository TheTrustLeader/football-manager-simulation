import { stableHash } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";

const seed = 424242;
const output = simulateMatch({
  seed,
  neutralVenue: true,
  home: makeTeam("golden-home", 10),
  away: makeTeam("golden-away", 10),
});

console.log(JSON.stringify({
  seed,
  engineConfigVersion: output.engineConfigVersion,
  engineConfigHash: output.engineConfigHash,
  outputHash: stableHash(output),
}, null, 2));
