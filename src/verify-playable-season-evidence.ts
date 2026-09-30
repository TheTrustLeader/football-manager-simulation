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
if (fresh.shownFavouriteTitles < 279) {
  throw new Error(`Shown favourite won only ${fresh.shownFavouriteTitles}/1,000 titles; expected at least 279`);
}
if (fresh.shownTopFiveTitles < 850) {
  throw new Error(`Shown top five won only ${fresh.shownTopFiveTitles}/1,000 titles; expected at least 850`);
}
const strategies = fresh.weakestClubStrategies;
const fixed = [strategies.passing, strategies.direct, strategies.counter, strategies.balanced]
  .reduce((best, candidate) => candidate.meanPosition < best.meanPosition ? candidate : best);
const readingImprovement = strategies.balanced.meanPosition - strategies.reading.meanPosition;
if (readingImprovement < 2 || readingImprovement > 4) throw new Error(`Reading the opponent improved the weakest club by ${readingImprovement}; expected 2–4 places`);
if (fixed.meanPosition - strategies.reading.meanPosition <= 2 * Math.hypot(fixed.standardError, strategies.reading.standardError)) throw new Error("Reading the opponent did not beat the best fixed style by more than two standard errors");
for (const [name, result] of Object.entries(strategies)) if (result.topFiveFinishes > 50) throw new Error(`${name} put the weakest club in the top five ${result.topFiveFinishes}/1,000 times`);
if (Object.values(fresh.computerStyleUses).some((uses) => uses === 0)) throw new Error("Computer clubs did not exercise every style");
const goalsBand = eraBandsForSeason(PLAYABLE_EVIDENCE_SEASON).bands.goalsPerMatch;
if (fresh.goalsPerMatch < goalsBand.minimum || fresh.goalsPerMatch > goalsBand.maximum) {
  throw new Error(`Goals per match ${fresh.goalsPerMatch} is outside the ${PLAYABLE_EVIDENCE_SEASON} band ${goalsBand.minimum}–${goalsBand.maximum}`);
}

console.log(JSON.stringify(fresh, null, 2));
console.log(`Verified against ${path}; goals band ${goalsBand.minimum}–${goalsBand.maximum}`);
