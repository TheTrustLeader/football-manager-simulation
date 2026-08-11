import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { SQUAD_GENERATION_HASH, SQUAD_GENERATION_VERSION } from "./fixtures.js";
import { readParityCompensationState } from "./gate-1a-compensation-state.js";
import { runIdentityParityControl } from "./gate-1a-identity-parity.js";
import { printRunProvenance, readGitProvenance } from "./provenance.js";
import { seedRange } from "./seed-pools.js";

const count = Number.parseInt(process.argv[2] ?? "30000", 10);
const outputPath = process.argv[3] ?? "evidence/GATE-1A-identity-parity-control.json";
if (!Number.isInteger(count) || count <= 0) throw new Error("Seed count must be a positive integer");

const command = process.argv[1]?.endsWith(".js")
  ? `node dist/src/gate-1a-identity-parity-runner.js ${count} ${outputPath}`
  : `npm run gate1a:identity-parity -- ${count} ${outputPath}`;
const seeds = seedRange("tuning", count);
const provenance = readGitProvenance();
const compensationState = readParityCompensationState();
printRunProvenance("GATE 1A IDENTITY PARITY CONTROL", provenance);
const started = performance.now();
const result = runIdentityParityControl(seeds);
const elapsedMs = performance.now() - started;

const evidence = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  purpose: "Named REVIEW-007 D8 identity-parity control",
  command,
  gitCommit: provenance.gitCommit,
  dirtyTree: provenance.dirtyTree,
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
    seedPool: "tuning-v1",
    seedRange: { start: seeds[0], end: seeds.at(-1), count: seeds.length },
    validationSeedsUsed: false,
    twelveQuestionMatrixRun: false,
    level: 10,
    northbridge: {
      identity: "passing",
      tactics: { formation: "4-4-2", style: "passing", approach: "balanced", tackling: "normal" },
    },
    redmere: {
      identity: "direct",
      tactics: { formation: "4-4-2", style: "direct", approach: "balanced", tackling: "normal" },
    },
    venueMethod: result.venueMethod,
    tolerance: ENGINE_CONFIG.squadGeneration.identityParity.pointsPerMatchTolerance,
    blockSize: result.blockSize,
  },
  result,
  performance: {
    elapsedMs,
    simulatedMatches: count,
    note: "The combined result is aggregated from the named 10,000-seed blocks.",
  },
  limitations: [
    "This control uses tuning seeds only. The validation seed pool remains sealed.",
    "The 12-question matrix was not run.",
    "This runner measures the existing temporary direct-identity compensation. It does not tune or change it.",
  ],
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  gitCommit: evidence.gitCommit,
  dirtyTree: evidence.dirtyTree,
  compensationState: evidence.compensationState,
  controls: evidence.controls,
  blocks: evidence.result.blocks,
  combined: evidence.result.combined,
  performance: evidence.performance,
}, null, 2));
