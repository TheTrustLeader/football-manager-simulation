import { ENGINE_CONFIG } from "./engine-config.js";
import { makeTeam } from "./fixtures.js";
import { strengthenedHomeCountryClubsForSeason } from "./club-world.js";
import type { Division } from "./league-structure.js";

const DIVISIONS = [1, 2, 3, 4] as const;
const SEEDS = 1_000;
const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

export interface WorldStrengthEvidenceRow {
  division: Division;
  average: number;
  minimum: number;
  median: number;
  maximum: number;
  strongMinimum: number;
  strongMaximum: number;
  overlapAbovePercent: number | null;
  belowAboveMedianPercent: number | null;
}

export function worldStrengthEvidence(seeds: number) {
  const ratings = new Map(DIVISIONS.map((division) => [division, [] as number[]]));
  const strongRatings = new Map(DIVISIONS.map((division) => [division, [] as number[]]));
  const overlap = [0, 0, 0, 0];
  const belowMedian = [0, 0, 0, 0];
  let division4FloorAttributes = 0;
  for (let seed = 0; seed < seeds; seed += 1) {
    const clubs = strengthenedHomeCountryClubsForSeason(1981, seed);
    for (const division of DIVISIONS) {
      const group = clubs.filter((club) => club.division === division);
      ratings.get(division)!.push(...group.map((club) => club.strength));
      strongRatings.get(division)!.push(...group.filter((club) => club.strong).map((club) => club.strength));
      if (division > 1) {
        const above = clubs.filter((club) => club.division === division - 1);
        const strongest = Math.max(...group.map((club) => club.strength));
        if (strongest > Math.min(...above.map((club) => club.strength))) overlap[division - 1]! += 1;
        if (strongest < median(above.map((club) => club.strength))) belowMedian[division - 1]! += 1;
      }
    }
    for (const club of clubs.filter((candidate) => candidate.division === 4)) {
      const team = makeTeam(club.squadId, club.squadLevel);
      division4FloorAttributes += [...team.starters, ...team.substitutes]
        .flatMap((player) => Object.values(player.attributes))
        .filter((value) => value === ENGINE_CONFIG.squadGeneration.attributeMinimum).length;
    }
  }
  const rows: WorldStrengthEvidenceRow[] = DIVISIONS.map((division) => {
    const values = ratings.get(division)!;
    const strong = strongRatings.get(division)!;
    return {
      division, average: values.reduce((sum, value) => sum + value, 0) / values.length,
      minimum: Math.min(...values), median: median(values), maximum: Math.max(...values),
      strongMinimum: Math.min(...strong), strongMaximum: Math.max(...strong),
      overlapAbovePercent: division === 1 ? null : overlap[division - 1]! * 100 / seeds,
      belowAboveMedianPercent: division === 1 ? null : belowMedian[division - 1]! * 100 / seeds,
    };
  });
  return { seeds, rows, division4FloorAttributes };
}

if (process.argv[1]?.endsWith("world-strength-evidence.ts")) {
  const report = worldStrengthEvidence(SEEDS);
  console.table(report.rows);
  console.log(`Division 4 attributes at floor (${ENGINE_CONFIG.squadGeneration.attributeMinimum}): ${report.division4FloorAttributes}`);
}
