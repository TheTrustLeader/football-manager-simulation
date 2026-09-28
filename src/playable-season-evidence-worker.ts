import { generatePlayableSeasonEvidenceRange } from "./playable-season-evidence-report.js";

const firstSeed = Number(process.argv[2]);
const lastSeed = Number(process.argv[3]);
if (!Number.isInteger(firstSeed) || !Number.isInteger(lastSeed) || firstSeed > lastSeed) {
  throw new Error("Evidence worker requires an integer first and last seed");
}
console.log(JSON.stringify(generatePlayableSeasonEvidenceRange(firstSeed, lastSeed)));
