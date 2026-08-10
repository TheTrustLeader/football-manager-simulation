import { describe, expect, it } from "vitest";
import { formatRunProvenance, readGitProvenance } from "../src/provenance.js";

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
    expect(text).toContain("Engine config: match-engine-config-0.7.1");
  });
});
