import { execFileSync } from "node:child_process";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";

export interface GitProvenance {
  gitCommit: string;
  dirtyTree: boolean;
  dirtyFiles?: string[] | undefined;
}

function git(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot record engine provenance: git ${args.join(" ")} failed. ${message}`);
  }
}

export function readGitProvenance(cwd = process.cwd()): GitProvenance {
  const root = git(["rev-parse", "--show-toplevel"], cwd);
  const gitCommit = git(["-C", root, "rev-parse", "HEAD"], root);
  const status = git([
    "-C",
    root,
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ".",
    ":(exclude)evidence/**",
    ":(exclude)node_modules/**",
    ":(exclude)dist/**",
    ":(exclude)coverage/**",
  ], root);
  const dirtyFiles = status.length > 0
    ? status.split("\n").filter((line) => line.length > 0)
    : undefined;
  return { gitCommit, dirtyTree: dirtyFiles !== undefined, dirtyFiles };
}

export function assertEvidenceWriteAllowed(
  provenance: GitProvenance,
  allowDirtyEvidence = process.env.ALLOW_DIRTY_EVIDENCE,
): void {
  if (!provenance.dirtyTree) return;
  if (allowDirtyEvidence === "1") {
    if (!provenance.dirtyFiles || provenance.dirtyFiles.length === 0) {
      throw new Error("Dirty evidence escape requires a non-empty dirtyFiles provenance list");
    }
    return;
  }
  throw new Error(
    "Evidence write refused because the source tree is dirty. Commit or restore the source changes, "
      + "or set ALLOW_DIRTY_EVIDENCE=1 to stamp dirtyTree: true and dirtyFiles explicitly.",
  );
}

export function readEvidenceProvenance(cwd = process.cwd()): GitProvenance {
  const provenance = readGitProvenance(cwd);
  assertEvidenceWriteAllowed(provenance);
  return provenance;
}

export function formatRunProvenance(label: string, provenance: GitProvenance): string {
  const heading = `${label} — ENGINE PROVENANCE`;
  return [
    heading,
    "-".repeat(heading.length),
    `Git commit: ${provenance.gitCommit}`,
    `Dirty tree: ${provenance.dirtyTree}`,
    ...(provenance.dirtyFiles ? [`Dirty files: ${provenance.dirtyFiles.join(", ")}`] : []),
    `Engine config: ${ENGINE_CONFIG.version}`,
    `Engine config hash: ${ENGINE_CONFIG_HASH}`,
  ].join("\n");
}

export function printRunProvenance(label: string, provenance: GitProvenance): void {
  console.log(`${formatRunProvenance(label, provenance)}\n`);
}
