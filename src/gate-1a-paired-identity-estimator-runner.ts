import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { SQUAD_GENERATION_HASH, SQUAD_GENERATION_VERSION } from "./fixtures.js";
import { readParityCompensationState } from "./gate-1a-compensation-state.js";
import {
  PAIRED_ESTIMATOR_GENERATOR_SEEDS,
  PAIRED_ESTIMATOR_IDENTITIES,
  runPairedIdentityEstimator,
} from "./gate-1a-paired-identity-estimator.js";
import { printRunProvenance, readEvidenceProvenance } from "./provenance.js";
import { seedRange } from "./seed-pools.js";

const MATCH_SEED_COUNT = 30_000;
const BLOCK_SIZE = 10_000;
const outputPath = process.argv[2] ?? "evidence/GATE-1A-D8-paired-identity-estimator.json";
const command = process.argv[1]?.endsWith(".js")
  ? `node dist/src/gate-1a-paired-identity-estimator-runner.js ${outputPath}`
  : `npm run gate1a:paired-identity-estimator -- ${outputPath}`;
const matchSeeds = seedRange("tuning", MATCH_SEED_COUNT);
const provenance = readEvidenceProvenance();
const compensationState = readParityCompensationState();
if (compensationState.state !== "out" || compensationState.activeIdentities.length > 0) {
  throw new Error("DECISION-001 baseline requires compensationState out with no active identities");
}
printRunProvenance("GATE 1A D8 PAIRED IDENTITY ESTIMATOR", provenance);
const started = performance.now();
const result = runPairedIdentityEstimator(
  PAIRED_ESTIMATOR_GENERATOR_SEEDS,
  matchSeeds,
  BLOCK_SIZE,
  PAIRED_ESTIMATOR_IDENTITIES,
);
const elapsedMs = performance.now() - started;
const simulatedMatches = result.estimates.length
  * PAIRED_ESTIMATOR_GENERATOR_SEEDS.length
  * MATCH_SEED_COUNT;

const evidence = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  purpose: "DECISION-001 compensation-out baseline for the replacement D8 estimator; residual gaps are recorded and deferred",
  command,
  gitCommit: provenance.gitCommit,
  dirtyTree: provenance.dirtyTree,
  dirtyFiles: provenance.dirtyFiles,
  compensationState,
  engineConfigVersion: ENGINE_CONFIG.version,
  engineConfigHash: ENGINE_CONFIG_HASH,
  squadGenerationVersion: SQUAD_GENERATION_VERSION,
  squadGenerationHash: SQUAD_GENERATION_HASH,
  runtime: {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  controls: {
    estimator: result.method,
    generatorSeedPool: {
      name: "gate-1a-review-011-v1",
      seeds: PAIRED_ESTIMATOR_GENERATOR_SEEDS,
      count: PAIRED_ESTIMATOR_GENERATOR_SEEDS.length,
    },
    matchSeedPool: "tuning-v1",
    matchSeedRange: result.matchSeedRange,
    blocks: result.estimates[0]!.pairedSamples[0]!.blocks.map((block) => block.matchSeedRange),
    validationSeedsUsed: false,
    twelveQuestionMatrixRun: false,
    level: 10,
    identities: PAIRED_ESTIMATOR_IDENTITIES,
    identityPairCount: result.estimates.length,
    tactics: { formation: "4-4-2", style: "balanced", approach: "balanced", tackling: "normal" },
    venueMethod: result.venueMethod,
    toleranceSet: false,
  },
  result,
  performance: {
    elapsedMs,
    simulatedMatches,
    note: "Each generator-seed sample aggregates the same three fixed 10,000-match-seed blocks.",
  },
  limitations: [
    "This estimator uses tuning match seeds 1-30,000 only. The validation seed pool remains sealed.",
    "The 12-question matrix was not run.",
    "No parity tolerance is configured or applied by the runner.",
    "Compensation state is stamped from engine config and must be out with no active identities for this baseline.",
    "The measured residuals are regression records, not tuning targets.",
    "Effect-weighted identity-budget units are not used as a tuning or calibration target.",
  ],
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  gitCommit: evidence.gitCommit,
  dirtyTree: evidence.dirtyTree,
  compensationState: evidence.compensationState,
  controls: evidence.controls,
  estimates: evidence.result.estimates.map((estimate) => ({
    firstIdentity: estimate.firstIdentity,
    secondIdentity: estimate.secondIdentity,
    pairedSamples: estimate.pairedSamples.map((sample) => ({
      generatorSeed: sample.generatorSeed,
      blocks: sample.blocks.map((block) => block.pointsPerMatchDifference),
      combined: sample.combined.pointsPerMatchDifference,
    })),
    meanPointsPerMatchDifference: estimate.meanPointsPerMatchDifference,
    absoluteMeanPointsPerMatchDifference: estimate.absoluteMeanPointsPerMatchDifference,
    sampleStandardDeviation: estimate.sampleStandardDeviation,
    standardErrorOfMean: estimate.standardErrorOfMean,
  })),
  performance: evidence.performance,
}, null, 2));
