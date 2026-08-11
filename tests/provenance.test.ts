import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/engine-config.js";
import {
  assertEvidenceWriteAllowed,
  formatRunProvenance,
  readGitProvenance,
} from "../src/provenance.js";

describe("run provenance", () => {
  it("reads the checked-out commit and dirty-tree flag", () => {
    const provenance = readGitProvenance();
    expect(provenance.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof provenance.dirtyTree).toBe("boolean");
  });

  it("prints both Git fields with the engine configuration", () => {
    const text = formatRunProvenance("TEST RUN", {
      gitCommit: "0123456789abcdef0123456789abcdef01234567",
      dirtyTree: true,
    });
    expect(text).toContain("Git commit: 0123456789abcdef0123456789abcdef01234567");
    expect(text).toContain("Dirty tree: true");
    expect(text).toContain(`Engine config: ${ENGINE_CONFIG.version}`);
  });

  it("refuses to write evidence from a dirty tree without the explicit escape", () => {
    expect(() => assertEvidenceWriteAllowed({
      gitCommit: "0123456789abcdef0123456789abcdef01234567",
      dirtyTree: true,
      dirtyFiles: [" M src/engine.ts"],
    })).toThrow(/ALLOW_DIRTY_EVIDENCE=1/);
  });

  it("allows the explicit dirty-evidence escape only with a recorded file list", () => {
    const provenance = {
      gitCommit: "0123456789abcdef0123456789abcdef01234567",
      dirtyTree: true,
      dirtyFiles: [" M src/engine.ts"],
    };
    expect(() => assertEvidenceWriteAllowed(provenance, "1")).not.toThrow();
    expect(() => assertEvidenceWriteAllowed({ ...provenance, dirtyFiles: undefined }, "1"))
      .toThrow(/dirtyFiles/);
  });
});
