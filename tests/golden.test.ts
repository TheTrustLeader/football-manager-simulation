import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stableHash } from "../src/engine-config.js";
import { simulateMatch } from "../src/engine.js";
import { makeTeam } from "../src/fixtures.js";

interface GoldenOutput {
  seed: number;
  engineConfigVersion: string;
  engineConfigHash: string;
  outputHash: string;
}

const golden = JSON.parse(readFileSync(new URL("./golden-output.json", import.meta.url), "utf8")) as GoldenOutput;

describe("golden Match Engine output", () => {
  it("matches the committed deterministic output", () => {
    const output = simulateMatch({
      seed: golden.seed,
      neutralVenue: true,
      home: makeTeam("golden-home", 10),
      away: makeTeam("golden-away", 10),
    });

    expect(output.engineConfigVersion).toBe(golden.engineConfigVersion);
    expect(output.engineConfigHash).toBe(golden.engineConfigHash);
    expect(stableHash(output)).toBe(golden.outputHash);
  });
});
