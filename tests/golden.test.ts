import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "../src/engine-config.js";
import { simulateMatch } from "../src/engine.js";
import { makeTeam } from "../src/fixtures.js";
import { MATCH_RESULT_FIELDS, NOT_THE_FOOTBALL, matchResultHash } from "../src/match-result.js";

interface GoldenOutput {
  seed: number;
  engineConfigVersion: string;
  engineConfigHash: string;
  matchResultHash: string;
}

const golden = JSON.parse(
  readFileSync(new URL("./golden-output.json", import.meta.url), "utf8"),
) as GoldenOutput;

const REBASELINE = "npm run --silent golden:print > tests/golden-output.json "
  + "(the --silent matters: without it npm writes its own banner into the file). "
  + "Run the command, never hand-type the values.";

const versionMatches = ENGINE_CONFIG.version === golden.engineConfigVersion;
const configMatches = ENGINE_CONFIG_HASH === golden.engineConfigHash;

const output = simulateMatch({
  seed: golden.seed,
  neutralVenue: true,
  home: makeTeam("golden-home", 10),
  away: makeTeam("golden-away", 10),
});

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
    const actual = matchResultHash(output);

    // If the config itself has moved, this match is SUPPOSED to differ. Raising an
    // alarm here would cry wolf on every deliberate tuning change, which is how a
    // tripwire gets ignored. The check above already reported the real situation.
    if (!versionMatches || !configMatches) {
      expect(
        actual,
        "The football differs, which is expected because the config above has changed. "
          + "This is not a separate problem. Fix the config check first.",
      ).not.toBe(golden.matchResultHash);
      return;
    }

    // The real alarm, and it now means ONE thing. This hash covers the football
    // only — who played, the stats, every event in order, the contributions and the
    // final condition — and deliberately excludes the config labels and the
    // diagnostics block. So a red here cannot be caused by adding a telemetry
    // field. It means a match genuinely plays differently.
    expect(
      actual,
      `UNINTENDED BEHAVIOUR CHANGE. The engine config is byte-identical to the `
        + `reference, so no tuning was intended, yet seed ${golden.seed} now produces a `
        + `different match — a different score, event log, contribution ledger or final `
        + `condition. Adding a diagnostics or telemetry field CANNOT cause this. `
        + `Do not rebaseline to make this pass — find the cause first.`,
    ).toBe(golden.matchResultHash);
  });

  it("every field of a match output is consciously classified as football or not", () => {
    // The hash above is an allow-list, which is what stops additive telemetry
    // tripping it. The cost is that a genuinely footballing new field would be
    // silently uncovered. This is the guard against that: add a field to
    // MatchOutput and this fails until someone decides which side it belongs on.
    const classified = [...MATCH_RESULT_FIELDS, ...NOT_THE_FOOTBALL].sort();
    expect(
      Object.keys(output).sort(),
      `A match output field is not classified. Decide whether the new field is part `
        + `of THE FOOTBALL (add it to MATCH_RESULT_FIELDS and to matchResult() in `
        + `src/match-result.ts, then rebaseline) or is a label or measurement (add it `
        + `to NOT_THE_FOOTBALL with a one-line reason). Do not skip this test: an `
        + `unclassified field means the golden hash is no longer watching the whole game.`,
    ).toEqual(classified);
  });
});
