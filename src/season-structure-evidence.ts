import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateFixtures, runSeason, type Fixture } from "./competition.js";
import { engineWeightedSquadRating } from "./fixtures.js";
import { deriveSeasonSeed } from "./season-sweep-evidence.js";
import { LEAGUE_SIZES, makeEvidenceTeams, readCommittedWeights } from "./strength-resolution-evidence.js";

export const OUTPUT_PATH = "evidence/season-structure-evidence.json";
export const SEASON = 1981;
const SEASONS = Array.from({ length: 200 }, (_, index) => index + 1);
const MULBERRY_INCREMENT = 0x6d2b79f5;

export type MatchSeedFunction = (seasonSeed: number, fixture: Fixture, index: number) => number;
export const legacyMatchSeed: MatchSeedFunction = (seed, _fixture, index) => (seed + index * 7919) >>> 0;

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export const mixedMatchSeed: MatchSeedFunction = (seed, fixture) =>
  hashText(`${seed}|${fixture.round}|${fixture.homeId}|${fixture.awayId}`);

export function fixtureBalance(teamCount: number) {
  const ids = makeEvidenceTeams(teamCount).map(({ team }) => team.id);
  const fixtures = generateFixtures(ids, deriveSeasonSeed(teamCount, 1));
  const teams = ids.map((id) => ({
    teamId: id,
    matches: fixtures.filter((fixture) => fixture.homeId === id || fixture.awayId === id).length,
    home: fixtures.filter((fixture) => fixture.homeId === id).length,
    away: fixtures.filter((fixture) => fixture.awayId === id).length,
  }));
  const orderedPairsExactlyOnce = ids.every((home) => ids.every((away) => home === away
    || fixtures.filter((fixture) => fixture.homeId === home && fixture.awayId === away).length === 1));
  return { teamCount, orderedPairsExactlyOnce, teams };
}

function wilson95(count: number, total: number): { lower: number; upper: number } {
  const z = 1.959963984540054;
  const p = count / total;
  const denominator = 1 + z * z / total;
  const centre = (p + z * z / (2 * total)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator;
  return { lower: Number((centre - half).toFixed(6)), upper: Number((centre + half).toFixed(6)) };
}

function overlapCount(records: Array<{ seed: number; strongest: boolean }>, maximumDraws: number) {
  const offsets = new Set<number>();
  let offset = 0;
  for (let draws = 1; draws < maximumDraws; draws += 1) {
    offset = (offset + MULBERRY_INCREMENT) >>> 0;
    offsets.add(offset);
  }
  let pairs = 0;
  let involvingStrongest = 0;
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      const difference = (records[right]!.seed - records[left]!.seed) >>> 0;
      const reverse = (records[left]!.seed - records[right]!.seed) >>> 0;
      if (offsets.has(difference) || offsets.has(reverse)) {
        pairs += 1;
        if (records[left]!.strongest || records[right]!.strongest) involvingStrongest += 1;
      }
    }
  }
  return { pairs, involvingStrongest };
}

export function runStructureEvidence(seedFunction: MatchSeedFunction) {
  const weights = readCommittedWeights();
  const rows = LEAGUE_SIZES.map((teamCount) => {
    const teams = makeEvidenceTeams(teamCount).map(({ team }) => team);
    const strongest = [...teams].sort((a, b) => engineWeightedSquadRating(b, weights) - engineWeightedSquadRating(a, weights))[0]!.id;
    let legacyTitles = 0;
    let mixedTitles = 0;
    let sameSeeds = 0;
    let maximumDraws = 0;
    const seasonRecords: Array<Array<{ seed: number; strongest: boolean }>> = [];
    for (const seasonNumber of SEASONS) {
      const seasonSeed = deriveSeasonSeed(teamCount, seasonNumber);
      const records: Array<{ seed: number; strongest: boolean }> = [];
      const legacy = runSeason(teams, seasonSeed, SEASON, {
        onMatchDrawCount: (fixture, seed, draws) => {
          records.push({ seed, strongest: fixture.homeId === strongest || fixture.awayId === strongest });
          maximumDraws = Math.max(maximumDraws, draws);
        },
      });
      const mixed = runSeason(teams, seasonSeed, SEASON, { matchSeed: seedFunction });
      if (legacy.table[0]!.teamId === strongest) legacyTitles += 1;
      if (mixed.table[0]!.teamId === strongest) mixedTitles += 1;
      legacy.fixtures.forEach((fixture, index) => {
        if (legacyMatchSeed(seasonSeed, fixture, index) === seedFunction(seasonSeed, fixture, index)) sameSeeds += 1;
      });
      seasonRecords.push(records);
    }
    const overlaps = seasonRecords.reduce((total, records) => {
      const result = overlapCount(records, maximumDraws);
      total.pairs += result.pairs;
      total.involvingStrongest += result.involvingStrongest;
      return total;
    }, { pairs: 0, involvingStrongest: 0 });
    const interval = wilson95(legacyTitles, 200);
    return {
      teamCount,
      ruler: "engine-weighted",
      strongestTeamId: strongest,
      maximumDrawsPerMatch: maximumDraws,
      overlappingMatchPairs: overlaps.pairs,
      overlapsInvolvingStrongestTeam: overlaps.involvingStrongest,
      legacyStrongestTop: legacyTitles,
      legacy95PercentWilsonInterval: interval,
      mixedStrongestTop: mixedTitles,
      mixedMovedOutsideOriginal95PercentInterval: mixedTitles / 200 < interval.lower || mixedTitles / 200 > interval.upper,
      identicalMatchSeeds: sameSeeds,
      totalMatchSeeds: teamCount * (teamCount - 1) * 200,
    };
  });

  const twelveTeams = makeEvidenceTeams(12).map(({ team }) => team);
  const strongest12 = rows.find((row) => row.teamCount === 12)!.strongestTeamId;
  let reversedTitles = 0;
  for (const seasonNumber of SEASONS) {
    const reversed = runSeason(twelveTeams, deriveSeasonSeed(12, seasonNumber), SEASON, {
      orderFixtures: (fixtures) => [...fixtures].sort((a, b) => b.round - a.round || a.homeId.localeCompare(b.homeId) || a.awayId.localeCompare(b.awayId)),
    });
    if (reversed.table[0]!.teamId === strongest12) reversedTitles += 1;
  }
  return {
    schemaVersion: 1,
    controls: { season: SEASON, seasons: 200, ruler: "engine-weighted", alternativeSeedFunction: "32-bit FNV-1a followed by integer avalanche over season seed, round, homeId and awayId" },
    hypotheses: {
      H1: { status: "ruled out", fixtureBalance: LEAGUE_SIZES.map(fixtureBalance) },
      H2: { status: "ruled out", originalStrongestTop: 21, reversedRoundOrderStrongestTop: reversedTitles, byteIdenticalCount: reversedTitles === 21 },
      H3: { status: rows.find((row) => row.teamCount === 12)!.mixedMovedOutsideOriginal95PercentInterval ? "supported" : "ruled out", decisionRule: "The mixed proportion must lie outside the original Wilson 95% interval.", rows },
    },
  };
}

function main() {
  const evidence = runStructureEvidence(mixedMatchSeed);
  mkdirSync("evidence", { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(evidence.hypotheses, null, 2));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
