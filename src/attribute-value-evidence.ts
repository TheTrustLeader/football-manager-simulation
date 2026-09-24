import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runSeason } from "./competition.js";
import { makeEvidenceTeams } from "./strength-resolution-evidence.js";
import type { AttributeName, TeamInput } from "./types.js";
import { deriveSeasonSeed } from "./season-sweep-evidence.js";

export const ATTRIBUTE_VALUE_OUTPUT_PATH = "evidence/attribute-value-evidence.json";
export const ATTRIBUTE_VALUE_SEASONS = Array.from({ length: 50 }, (_, index) => index + 1);
export const TREATED_TEAM_INDICES = [9, 10, 11] as const;
export const ATTRIBUTE_NAMES = [
  "defending", "passing", "creativity", "pace", "aerial", "finishing", "stamina",
  "leadership", "crossing", "shotStopping", "handling", "kicking",
] as const satisfies readonly AttributeName[];

export interface TreatmentResult {
  kind: "ZERO_CONTROL" | "MEASURED" | "UNMEASURABLE";
  teamId: string;
  amount: number;
  playersChanged: number;
  totalAttributePointsAdded: number;
  seasons: number;
  pointsChange: number | "UNMEASURABLE";
  standardError: number | "UNMEASURABLE";
}

export interface AttributeResult {
  attribute: AttributeName;
  pointsValue: number | "UNMEASURABLE";
  seasons: number;
  standardError: number | "UNMEASURABLE";
  playersChanged: number;
  totalAttributePointsAdded: number;
  treatments: TreatmentResult[];
}

export interface AttributeValueEvidence {
  schemaVersion: 1;
  purpose: string;
  command: string;
  controls: { teamCount: 12; seasonNumbers: { first: number; last: number; count: number }; treatedTeamIds: string[] };
  zeroTreatment: TreatmentResult;
  attributes: AttributeResult[];
}

const rounded = (value: number): number => Number(value.toFixed(6));

function cloneTeams(teams: readonly TeamInput[]): TeamInput[] {
  return structuredClone([...teams]);
}

export function applyTreatment(team: TeamInput, attribute: AttributeName, amount: number): Pick<TreatmentResult, "playersChanged" | "totalAttributePointsAdded"> {
  let playersChanged = 0;
  let totalAttributePointsAdded = 0;
  for (const player of team.starters) {
    if (!(attribute in player.attributes)) continue;
    const attributes = player.attributes as unknown as Record<string, number>;
    const before = attributes[attribute]!;
    const after = Math.max(1, Math.min(20, Math.round(before + amount)));
    attributes[attribute] = after;
    if (after !== before) playersChanged += 1;
    totalAttributePointsAdded += after - before;
  }
  return { playersChanged, totalAttributePointsAdded };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardError(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

export function runTreatment(
  attribute: AttributeName,
  amount: number,
  treatedTeamIndex: number,
  seasonNumbers: readonly number[],
  season: number,
  teamFactory = makeEvidenceTeams,
): TreatmentResult {
  const baseTeams = teamFactory(12).map(({ team }) => team);
  const treatedTeams = cloneTeams(baseTeams);
  const treatedTeam = treatedTeams[treatedTeamIndex]!;
  const change = applyTreatment(treatedTeam, attribute, amount);
  const kind = amount === 0 ? "ZERO_CONTROL" : change.playersChanged === 0 ? "UNMEASURABLE" : "MEASURED";
  if (kind === "UNMEASURABLE") {
    return { kind, teamId: treatedTeam.id, amount, ...change, seasons: 0, pointsChange: "UNMEASURABLE", standardError: "UNMEASURABLE" };
  }
  const differences = seasonNumbers.map((seasonNumber) => {
    const seed = deriveSeasonSeed(12, seasonNumber);
    const baseline = runSeason(baseTeams, seed, season).table.find((row) => row.teamId === treatedTeam.id)!.points;
    const treated = runSeason(treatedTeams, seed, season).table.find((row) => row.teamId === treatedTeam.id)!.points;
    return treated - baseline;
  });
  return {
    kind,
    teamId: treatedTeam.id,
    amount,
    ...change,
    seasons: seasonNumbers.length,
    pointsChange: rounded(mean(differences)),
    standardError: rounded(standardError(differences)),
  };
}

export function createAttributeValueEvidence(seasonNumbers: readonly number[], season: number): AttributeValueEvidence {
  const zeroTreatment = runTreatment("passing", 0, TREATED_TEAM_INDICES[0], seasonNumbers, season);
  if (zeroTreatment.pointsChange !== 0) throw new Error(`ZERO TREATMENT MOVED by ${zeroTreatment.pointsChange}; measurement is broken`);
  const attributes = ATTRIBUTE_NAMES.map((attribute): AttributeResult => {
    const treatments = TREATED_TEAM_INDICES.map((index) => runTreatment(attribute, 1, index, seasonNumbers, season));
    const measured = treatments.filter((result): result is TreatmentResult & { pointsChange: number; standardError: number } => result.kind === "MEASURED");
    if (measured.length === 0) throw new Error(`${attribute} is UNMEASURABLE on every treated team; no weight can be reported`);
    const seasons = measured.reduce((sum, result) => sum + result.seasons, 0);
    const pointsValue = measured.reduce((sum, result) => sum + result.pointsChange * result.seasons, 0) / seasons;
    const standardErrorValue = Math.sqrt(measured.reduce((sum, result) => sum + (result.standardError ** 2) * (result.seasons ** 2), 0)) / seasons;
    return {
      attribute,
      pointsValue: rounded(pointsValue),
      seasons,
      standardError: rounded(standardErrorValue),
      playersChanged: measured.reduce((sum, result) => sum + result.playersChanged, 0),
      totalAttributePointsAdded: measured.reduce((sum, result) => sum + result.totalAttributePointsAdded, 0),
      treatments,
    };
  });
  const treatedTeamIds = makeEvidenceTeams(12).filter((_, index) => TREATED_TEAM_INDICES.includes(index as 9 | 10 | 11)).map(({ team }) => team.id);
  return {
    schemaVersion: 1,
    purpose: "Measure the paired mean-points value of adding one point of each generated attribute to starting players.",
    command: "npm run attribute:value",
    controls: { teamCount: 12, seasonNumbers: { first: seasonNumbers[0]!, last: seasonNumbers.at(-1)!, count: seasonNumbers.length }, treatedTeamIds },
    zeroTreatment,
    attributes,
  };
}

export function serialiseAttributeValueEvidence(evidence: AttributeValueEvidence): string {
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

export function readAttributeWeights(path = ATTRIBUTE_VALUE_OUTPUT_PATH): Record<AttributeName, number> {
  const evidence = JSON.parse(readFileSync(path, "utf8")) as AttributeValueEvidence;
  return Object.fromEntries(evidence.attributes.map((result) => {
    if (result.pointsValue === "UNMEASURABLE") throw new Error(`${result.attribute} is UNMEASURABLE and cannot be used as a weight`);
    return [result.attribute, result.pointsValue];
  })) as Record<AttributeName, number>;
}

function main(): void {
  const evidence = createAttributeValueEvidence(ATTRIBUTE_VALUE_SEASONS, 1981);
  mkdirSync("evidence", { recursive: true });
  writeFileSync(ATTRIBUTE_VALUE_OUTPUT_PATH, serialiseAttributeValueEvidence(evidence), "utf8");
  for (const result of evidence.attributes) console.log(`${result.attribute}: ${result.pointsValue} points (SE ${result.standardError}; playersChanged ${result.playersChanged})`);
  console.log(`zero: ${Number(evidence.zeroTreatment.pointsChange).toFixed(3)} points (${evidence.zeroTreatment.kind})`);
  console.log(`Wrote ${ATTRIBUTE_VALUE_OUTPUT_PATH}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
