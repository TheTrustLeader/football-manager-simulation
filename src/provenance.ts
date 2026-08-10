import { execFileSync } from "node:child_process";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";

export interface GitProvenance {
  gitCommit: string;
  dirtyTree: boolean;
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
  return { gitCommit, dirtyTree: status.length > 0 };
}

export function formatRunProvenance(label: string, provenance: GitProvenance): string {
  const heading = `${label} — ENGINE PROVENANCE`;
  return [
    heading,
    "-".repeat(heading.length),
    `Git commit: ${provenance.gitCommit}`,
    `Dirty tree: ${provenance.dirtyTree}`,
    `Engine config: ${ENGINE_CONFIG.version}`,
    `Engine config hash: ${ENGINE_CONFIG_HASH}`,
  ].join("\n");
}

export function printRunProvenance(label: string, provenance: GitProvenance): void {
  console.log(`${formatRunProvenance(label, provenance)}\n`);
}
