import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH, stableHash } from "../src/engine-config.js";
import { simulateMatch } from "../src/engine.js";
import { makeTeam } from "../src/fixtures.js";

interface GoldenOutput {
  seed: number;
  engineConfigVersion: string;
  engineConfigHash: string;
  outputHash: string;
}

const golden = JSON.parse(
  readFileSync(new URL("./golden-output.json", import.meta.url), "utf8"),
) as GoldenOutput;

const REBASELINE = "npm run golden:print, then copy seed, engineConfigVersion, "
  + "engineConfigHash and outputHash into tests/golden-output.json.";

const versionMatches = ENGINE_CONFIG.version === golden.engineConfigVersion;
const configMatches = ENGINE_CONFIG_HASH === golden.engineConfigHash;

describe("golden match output", () => {
  it("the recorded reference describes the config in this tree", () => {
    // A declared tuning change. Expected, harmless, and the commonest reason this
    // file goes red. Say so plainly so nobody has to decode a hash.
    expect(
      ENGINE_CONFIG.version,
      `REBASELINE NEEDED — not a defect. The config version was changed on purpose `
        + `(reference records "${golden.engineConfigVersion}", the tree is now `
        + `"${ENGINE_CONFIG.version}") and this reference was not refreshed with it. `
        + `Nothing is wrong with the engine. To clear: ${REBASELINE}`,
    ).toBe(golden.engineConfigVersion);

    // An undeclared tuning change: a number moved but the version did not. Worth
    // catching, because from here on the version no longer identifies the engine.
    expect(
      ENGINE_CONFIG_HASH,
      `UNDECLARED CONFIG CHANGE. The version still reads "${ENGINE_CONFIG.version}" but `
        + `the config contents have changed, so a tuning change was made without `
        + `declaring it. Bump the version, then: ${REBASELINE}`,
    ).toBe(golden.engineConfigHash);
  });

  it("one fixed match still plays out exactly as recorded", () => {
    const output = simulateMatch({
      seed: golden.seed,
      neutralVenue: true,
      home: makeTeam("golden-home", 10),
      away: makeTeam("golden-away", 10),
    });
    const actual = stableHash(output);

    // If the config itself has moved, this match is SUPPOSED to differ. Raising an
    // alarm here would cry wolf on every deliberate tuning change, which is how a
    // tripwire gets ignored. The check above already reported the real situation.
    if (!versionMatches || !configMatches) {
      expect(
        actual,
        "Match output differs, which is expected because the config above has changed. "
          + "This is not a separate problem. Fix the config check first.",
      ).not.toBe(golden.outputHash);
      return;
    }

    // The real alarm. Config byte-identical, so nobody intended to change how a match
    // plays — and yet it plays differently. This is the unintended impact worth
    // blocking a merge for.
    expect(
      actual,
      `UNINTENDED BEHAVIOUR CHANGE. The engine config is byte-identical to the `
        + `reference, so no tuning was intended, yet seed ${golden.seed} now produces a `
        + `different match. Something outside the config has changed how matches play. `
        + `Do not rebaseline to make this pass — find the cause first.`,
    ).toBe(golden.outputHash);
  });
});
