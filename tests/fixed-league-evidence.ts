import { eraBandsForSeason } from "../src/era-bands.js";
import { runFixedLeagueEvidenceYielding } from "../src/season-calibration-evidence.js";
import { readCommittedWeights, SEASON_NUMBERS } from "../src/strength-resolution-evidence.js";

const fixedLeagueRuns = new Map<number, ReturnType<typeof runFixedLeagueEvidenceYielding>>();

export function fixedLeagueEvidence(teamCount: number) {
  let run = fixedLeagueRuns.get(teamCount);
  if (!run) {
    run = runFixedLeagueEvidenceYielding(teamCount, SEASON_NUMBERS, 1981, eraBandsForSeason(1981), readCommittedWeights());
    fixedLeagueRuns.set(teamCount, run);
  }
  return run;
}
