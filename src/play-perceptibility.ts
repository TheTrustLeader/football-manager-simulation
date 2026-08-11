import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface, type Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import {
  assertEvidenceWriteAllowed,
  printRunProvenance,
  readEvidenceProvenance,
  type GitProvenance,
} from "./provenance.js";
import { SeededRandom } from "./random.js";
import { TUNING_SEED_POOL } from "./seed-pools.js";
import type { MatchOutput, Tactics } from "./types.js";

export const PAIR_COUNT = 18;
export const PASS_THRESHOLD = 13;
export const ALPHA = 0.05;

export const ATTACKING_TACTICS: Partial<Tactics> = {
  formation: "4-3-3",
  style: "direct",
  approach: "attacking",
  tackling: "hard",
};

export const BASELINE_TACTICS: Partial<Tactics> = {
  formation: "4-4-2",
  style: "balanced",
  approach: "balanced",
  tackling: "normal",
};

export type Arm = "attacking" | "baseline";
export type Side = "left" | "right";
export type PerceptibilityAnswer = Side | "cant-tell";

export interface DisplayStats {
  chances: number;
  shots: number;
  shotsOnTarget: number;
  possessionPercent: number;
}

export interface PairSimulation {
  attacking: DisplayStats;
  baseline: DisplayStats;
}

export interface KeptPair extends PairSimulation {
  pair: number;
  seed: number;
  venue: "home" | "away";
  leftArm: Arm;
  rightArm: Arm;
}

export type SeedDrawRecord =
  | (PairSimulation & {
      draw: number;
      seed: number;
      venue: "home" | "away";
      status: "discarded";
      discardReason: "equal-northbridge-shots";
    })
  | (PairSimulation & {
      draw: number;
      seed: number;
      venue: "home" | "away";
      status: "kept";
      pair: number;
    });

export interface PairSelection {
  seedsDrawn: SeedDrawRecord[];
  pairs: KeptPair[];
}

export interface PairResponse {
  pair: number;
  seed: number;
  venue: "home" | "away";
  attacking: DisplayStats;
  baseline: DisplayStats;
  leftArm: Arm;
  rightArm: Arm;
  answer: PerceptibilityAnswer;
  note: string;
  attackingSide: Side;
  correct: boolean;
}

export interface Assessment {
  totalPairs: number;
  correct: number;
  incorrect: number;
  cantTell: number;
  passThreshold: number;
  nullProbability: number;
  alternative: "greater";
  alpha: number;
  pValue: number;
  verdict: "PASS" | "FAIL";
}

type PairSimulator = (seed: number, managedHome: boolean) => PairSimulation;

function displayStats(result: MatchOutput, managedHome: boolean): DisplayStats {
  const stats = managedHome ? result.home : result.away;
  return {
    chances: stats.chances,
    shots: stats.shots,
    shotsOnTarget: stats.shotsOnTarget,
    possessionPercent: Math.round((stats.possessionTicks / ENGINE_CONFIG.matchMinutes) * 100),
  };
}

export function simulatePerceptibilityPair(seed: number, managedHome: boolean): PairSimulation {
  function run(tactics: Partial<Tactics>): DisplayStats {
    const northbridge = makeTeam("northbridge", 10, tactics);
    const redmere = makeTeam("redmere", 10);
    const result = simulateMatch({
      seed,
      home: managedHome ? northbridge : redmere,
      away: managedHome ? redmere : northbridge,
    });
    return displayStats(result, managedHome);
  }

  return {
    attacking: run(ATTACKING_TACTICS),
    baseline: run(BASELINE_TACTICS),
  };
}

export function leftArmForSeed(seed: number): Arm {
  const random = new SeededRandom(seed ^ 0x48335031);
  return random.chance(0.5) ? "attacking" : "baseline";
}

export function selectDecidablePairs(
  pairCount = PAIR_COUNT,
  simulatePair: PairSimulator = simulatePerceptibilityPair,
): PairSelection {
  if (!Number.isInteger(pairCount) || pairCount <= 0) {
    throw new Error("Pair count must be a positive integer");
  }

  const seedsDrawn: SeedDrawRecord[] = [];
  const pairs: KeptPair[] = [];
  let seed = TUNING_SEED_POOL.start;

  while (pairs.length < pairCount) {
    if (seed > TUNING_SEED_POOL.end) {
      throw new Error(`Could not find ${pairCount} decidable pairs inside ${TUNING_SEED_POOL.name}`);
    }

    const pairNumber = pairs.length + 1;
    const managedHome = pairNumber % 2 === 1;
    const venue = managedHome ? "home" : "away";
    const simulation = simulatePair(seed, managedHome);
    const draw = seedsDrawn.length + 1;

    if (simulation.attacking.shots === simulation.baseline.shots) {
      seedsDrawn.push({
        draw,
        seed,
        venue,
        status: "discarded",
        discardReason: "equal-northbridge-shots",
        ...simulation,
      });
      seed += 1;
      continue;
    }

    const leftArm = leftArmForSeed(seed);
    const rightArm: Arm = leftArm === "attacking" ? "baseline" : "attacking";
    const pair: KeptPair = {
      pair: pairNumber,
      seed,
      venue,
      leftArm,
      rightArm,
      ...simulation,
    };
    pairs.push(pair);
    seedsDrawn.push({
      draw,
      seed,
      venue,
      status: "kept",
      pair: pairNumber,
      ...simulation,
    });
    seed += 1;
  }

  return { seedsDrawn, pairs };
}

function combination(n: number, k: number): number {
  const smaller = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= smaller; index += 1) {
    result = (result * (n - smaller + index)) / index;
  }
  return result;
}

export function oneSidedBinomialPValue(correct: number, total: number): number {
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total <= 0 || correct < 0 || correct > total) {
    throw new Error("Binomial inputs must be whole numbers with 0 <= correct <= total");
  }

  let probability = 0;
  for (let successes = correct; successes <= total; successes += 1) {
    probability += combination(total, successes) * (0.5 ** total);
  }
  return probability;
}

export function assessResponses(responses: PairResponse[]): Assessment {
  const correct = responses.filter((response) => response.answer === response.attackingSide).length;
  const cantTell = responses.filter((response) => response.answer === "cant-tell").length;
  const pValue = oneSidedBinomialPValue(correct, responses.length);
  return {
    totalPairs: responses.length,
    correct,
    incorrect: responses.length - correct,
    cantTell,
    passThreshold: PASS_THRESHOLD,
    nullProbability: 0.5,
    alternative: "greater",
    alpha: ALPHA,
    pValue,
    verdict: correct >= PASS_THRESHOLD && pValue < ALPHA ? "PASS" : "FAIL",
  };
}

export function assertCleanTree(provenance: GitProvenance): void {
  assertEvidenceWriteAllowed(provenance);
}

function statForArm(pair: KeptPair, arm: Arm): DisplayStats {
  return arm === "attacking" ? pair.attacking : pair.baseline;
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

export function formatPair(pair: KeptPair): string {
  const left = statForArm(pair, pair.leftArm);
  const right = statForArm(pair, pair.rightArm);
  const labelWidth = 20;
  const valueWidth = 18;
  const row = (label: string, leftValue: string | number, rightValue: string | number) =>
    `${label.padEnd(labelWidth)}${pad(leftValue, valueWidth)}${pad(rightValue, valueWidth)}`;

  return [
    `PAIR ${pair.pair} OF ${PAIR_COUNT} — NORTHBRIDGE ${pair.venue.toUpperCase()}`,
    row("", "Setup 1 (left)", "Setup 2 (right)"),
    row("Chances", left.chances, right.chances),
    row("Shots", left.shots, right.shots),
    row("Shots on target", left.shotsOnTarget, right.shotsOnTarget),
    row("Possession", `${left.possessionPercent}%`, `${right.possessionPercent}%`),
  ].join("\n");
}

export function normaliseAnswer(value: string): PerceptibilityAnswer | null {
  const answer = value.trim().toLowerCase().replaceAll("’", "'");
  if (answer === "left" || answer === "l") return "left";
  if (answer === "right" || answer === "r") return "right";
  if (answer === "can't tell" || answer === "cant tell" || answer === "can't-tell" || answer === "cant-tell" || answer === "c") {
    return "cant-tell";
  }
  return null;
}

async function askAnswer(rl: Interface): Promise<PerceptibilityAnswer> {
  while (true) {
    console.log("Which of these two was the attacking setup?");
    const answer = normaliseAnswer(await rl.question("> "));
    if (answer) return answer;
    console.log("Type left, right, or can't tell.");
  }
}

export function createEvidence(
  selection: PairSelection,
  responses: PairResponse[],
  assessment: Assessment,
  provenance: GitProvenance,
  generatedAt = new Date().toISOString(),
) {
  return {
    schemaVersion: 1,
    generatedAt,
    purpose: "Gate 1 H3 paired tactical perceptibility playtest",
    gitCommit: provenance.gitCommit,
    dirtyTree: provenance.dirtyTree,
    dirtyFiles: provenance.dirtyFiles,
    engineConfigVersion: ENGINE_CONFIG.version,
    engineConfigHash: ENGINE_CONFIG_HASH,
    controls: {
      seedPool: TUNING_SEED_POOL.name,
      validationSeedsUsed: false,
      twelveQuestionMatrixRun: false,
      engineTuned: false,
      pairCount: PAIR_COUNT,
      discardRule: "Discard pairs with equal Northbridge shots",
      venueRule: "Alternate Northbridge home and away across kept pairs; both arms share venue",
      opponentRule: "Both arms use a fresh identical Redmere level-10 team with default tactics",
      blindingRule: "Setup 1/left versus Setup 2/right uses the first SeededRandom draw from seed XOR 0x48335031",
      cantTellCountsAsIncorrect: true,
      binomialTest: {
        nullProbability: 0.5,
        alternative: "greater",
        alpha: ALPHA,
        passThreshold: PASS_THRESHOLD,
      },
    },
    arms: {
      attacking: {
        club: "NORTHBRIDGE",
        level: 10,
        tactics: ATTACKING_TACTICS,
      },
      baseline: {
        club: "NORTHBRIDGE",
        level: 10,
        tactics: BASELINE_TACTICS,
      },
      opponent: {
        club: "REDMERE",
        level: 10,
        tactics: BASELINE_TACTICS,
      },
    },
    seedsDrawn: selection.seedsDrawn,
    pairs: responses.map((response) => ({
      pair: response.pair,
      seed: response.seed,
      venue: response.venue,
      armAssignment: {
        attacking: response.attacking,
        baseline: response.baseline,
      },
      displayAssignment: {
        setup1Left: response.leftArm,
        setup2Right: response.rightArm,
      },
      answer: response.answer,
      note: response.note,
      attackingSide: response.attackingSide,
      correct: response.answer === response.attackingSide,
    })),
    assessment,
    limitation: "This tests whether Scott can identify the higher-shot tactical arm from paired chances and shot detail. It does not test match outcomes, enjoyment, or the 12-question matrix.",
  };
}

function writeEvidence(evidence: ReturnType<typeof createEvidence>): string {
  const timestamp = evidence.generatedAt.replace(/[:.]/g, "-");
  const path = `evidence/h3-perceptibility-playtest-${timestamp}.json`;
  mkdirSync("evidence", { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return path;
}

function line(char = "=", width = 72): string {
  return char.repeat(width);
}

export async function runPerceptibilityPlaytest(): Promise<void> {
  const provenance = readEvidenceProvenance();
  printRunProvenance("H3 PERCEPTIBILITY PLAYTEST", provenance);
  assertCleanTree(provenance);

  const rl = createInterface({ input, output });
  try {
    console.log(line());
    console.log("              MATCH LAB — H3 PERCEPTIBILITY PLAYTEST");
    console.log(line());
    console.log("You will see 18 paired Northbridge stat lines.");
    console.log("For each pair, choose left, right, or can't tell.");
    console.log("A can't tell answer counts as incorrect.");
    console.log(`The pass threshold is ${PASS_THRESHOLD} correct out of ${PAIR_COUNT}.`);
    console.log("No setup identities will be revealed until all 18 answers are complete.");
    console.log("Validation seeds remain sealed. The 12-question matrix remains blocked.\n");
    await rl.question("Press Enter to prepare the 18 paired comparisons...");

    const selection = selectDecidablePairs();
    const responses: PairResponse[] = [];

    for (const pair of selection.pairs) {
      console.log(`\n${line()}`);
      console.log(formatPair(pair));
      console.log(line("-"));
      const answer = await askAnswer(rl);
      const note = (await rl.question("Optional short note (press Enter to skip): ")).trim();
      const attackingSide: Side = pair.leftArm === "attacking" ? "left" : "right";
      responses.push({
        ...pair,
        answer,
        note,
        attackingSide,
        correct: answer === attackingSide,
      });
      console.log("Answer recorded. Setup identities remain hidden.");
    }

    const assessment = assessResponses(responses);
    const evidence = createEvidence(selection, responses, assessment, provenance);
    const path = writeEvidence(evidence);

    console.log(`\n${line()}`);
    console.log("ALL 18 ANSWERS COMPLETE — SETUPS NOW REVEALED");
    console.log(line());
    for (const response of responses) {
      const setup = response.attackingSide === "left" ? "Setup 1 (left)" : "Setup 2 (right)";
      console.log(`Pair ${response.pair}: ${setup} was attacking — ${response.correct ? "correct" : "incorrect"}`);
    }
    console.log(`\nCorrect: ${assessment.correct}/${assessment.totalPairs}`);
    console.log(`Can't tell: ${assessment.cantTell} (counted as incorrect)`);
    console.log(`One-sided binomial p-value: ${assessment.pValue.toFixed(6)}`);
    console.log(`Verdict: ${assessment.verdict}`);
    console.log(`Evidence saved: ${path}\n`);
  } finally {
    rl.close();
  }
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (invokedDirectly()) {
  await runPerceptibilityPlaytest();
}
