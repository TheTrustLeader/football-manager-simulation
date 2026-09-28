import { readFileSync } from "node:fs";
import { eraBandsForSeason } from "./era-bands.js";
import { generatePlayableSeasonEvidence, PLAYABLE_EVIDENCE_SEASON } from "./playable-season-evidence-report.js";
import type { PlayableSeasonEvidenceReport } from "./playable-season-evidence-report.js";

const path = "evidence/playable-season-1000-games.json";
const committed = JSON.parse(readFileSync(path, "utf8")) as PlayableSeasonEvidenceReport;
const fresh = await generatePlayableSeasonEvidence();

if (JSON.stringify(fresh) !== JSON.stringify(committed)) {
  throw new Error(`${path} does not match a fresh 1,000-game run`);
}
if (fresh.shownFavouriteTitles < 300) {
  throw new Error(`Shown favourite won only ${fresh.shownFavouriteTitles}/1,000 titles; expected at least 300`);
}
if (fresh.shownTopFiveTitles < 850) {
  throw new Error(`Shown top five won only ${fresh.shownTopFiveTitles}/1,000 titles; expected at least 850`);
}
const goalsBand = eraBandsForSeason(PLAYABLE_EVIDENCE_SEASON).bands.goalsPerMatch;
if (fresh.goalsPerMatch < goalsBand.minimum || fresh.goalsPerMatch > goalsBand.maximum) {
  throw new Error(`Goals per match ${fresh.goalsPerMatch} is outside the ${PLAYABLE_EVIDENCE_SEASON} band ${goalsBand.minimum}–${goalsBand.maximum}`);
}

console.log(JSON.stringify(fresh, null, 2));
console.log(`Verified against ${path}; goals band ${goalsBand.minimum}–${goalsBand.maximum}`);
