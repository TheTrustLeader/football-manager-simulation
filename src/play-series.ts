import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { printRunProvenance, readEvidenceProvenance, type GitProvenance } from "./provenance.js";
import type { Approach, Formation, Style, Tackling, TeamInput } from "./types.js";

const rl = createInterface({ input, output });
const formations: Formation[] = ["4-4-2", "4-3-3", "4-5-1", "3-5-2", "5-3-2"];
const styles: Style[] = ["balanced", "passing", "direct", "counter"];
const approaches: Approach[] = ["cautious", "balanced", "attacking"];
const tacklingOptions: Tackling[] = ["careful", "normal", "hard"];

type HumanJudgement = "yes" | "no" | "unsure";

interface SeriesMatchRecord {
  match: number;
  seed: number;
  managedClub: string;
  opponent: string;
  venue: "home" | "away";
  tactics: {
    formation: Formation;
    style: Style;
    approach: Approach;
    tackling: Tackling;
  };
  score: { managed: number; opponent: number };
  result: "W" | "D" | "L";
  managedStats: {
    chances: number;
    shots: number;
    shotsOnTarget: number;
    possessionPercent: number;
    yellowCards: number;
    redCards: number;
  };
  opponentStats: {
    chances: number;
    shots: number;
    shotsOnTarget: number;
    possessionPercent: number;
    yellowCards: number;
    redCards: number;
  };
  averageFinalCondition: number;
  scorelineBelievable: HumanJudgement;
  note: string;
}

function line(char = "-", width = 72): string {
  return char.repeat(width);
}

async function choose<T extends string>(title: string, options: readonly T[], labels?: Partial<Record<T, string>>): Promise<T> {
  while (true) {
    console.log(`\n${title}`);
    options.forEach((option, index) => console.log(`  ${index + 1}. ${labels?.[option] ?? option}`));
    const answer = (await rl.question("> ")).trim();
    const index = Number.parseInt(answer, 10) - 1;
    if (Number.isInteger(index) && index >= 0 && index < options.length) return options[index]!;
    console.log("Choose one of the numbered options.");
  }
}

async function yesNoUnsure(question: string): Promise<HumanJudgement> {
  while (true) {
    const answer = (await rl.question(`${question} (y/n/u): `)).trim().toLowerCase();
    if (answer === "y" || answer === "yes") return "yes";
    if (answer === "n" || answer === "no") return "no";
    if (answer === "u" || answer === "unsure") return "unsure";
    console.log("Type y, n or u.");
  }
}

async function configureManagedTeam(team: TeamInput): Promise<void> {
  console.log(`\nChoose one tactical setup and keep it for all eight matches.`);
  team.tactics.formation = await choose("Formation", formations);
  team.tactics.style = await choose("Style", styles, {
    balanced: "Balanced",
    passing: "Passing",
    direct: "Direct",
    counter: "Counter-attacking",
  });
  team.tactics.approach = await choose("Approach", approaches, {
    cautious: "Cautious",
    balanced: "Balanced",
    attacking: "Attacking",
  });
  team.tactics.tackling = await choose("Tackling", tacklingOptions, {
    careful: "Careful",
    normal: "Normal",
    hard: "Hard",
  });
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function managedCondition(team: TeamInput, finalCondition: Record<string, number>): number {
  return average(team.starters.map((player) => finalCondition[player.id] ?? player.state.condition));
}

function resultLetter(managedGoals: number, opponentGoals: number): "W" | "D" | "L" {
  if (managedGoals > opponentGoals) return "W";
  if (managedGoals < opponentGoals) return "L";
  return "D";
}

function printMatchRecord(record: SeriesMatchRecord): void {
  console.log(`\nMatch ${record.match}: ${record.managedClub} ${record.score.managed}-${record.score.opponent} ${record.opponent}  [${record.result}]`);
  console.log(`Seed: ${record.seed}`);
  console.log(`Chances ${record.managedStats.chances}-${record.opponentStats.chances} | Shots ${record.managedStats.shots}-${record.opponentStats.shots} | SOT ${record.managedStats.shotsOnTarget}-${record.opponentStats.shotsOnTarget} | Poss ${record.managedStats.possessionPercent}-${record.opponentStats.possessionPercent}%`);
  console.log(`Average final condition: ${record.averageFinalCondition.toFixed(1)}`);
}

function writeEvidence(records: SeriesMatchRecord[], managed: TeamInput, tacticsPatternRecognisable: HumanJudgement, seriesNote: string, provenance: GitProvenance): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `evidence/human-playtest-series-${timestamp}.json`;
  mkdirSync("evidence", { recursive: true });
  const wins = records.filter((record) => record.result === "W").length;
  const draws = records.filter((record) => record.result === "D").length;
  const losses = records.filter((record) => record.result === "L").length;
  const evidence = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    purpose: "Gate 1 human playtest — eight-match same-side engine sequence",
    gitCommit: provenance.gitCommit,
    dirtyTree: provenance.dirtyTree,
    dirtyFiles: provenance.dirtyFiles,
    engineConfigVersion: ENGINE_CONFIG.version,
    engineConfigHash: ENGINE_CONFIG_HASH,
    validationSeedsUsed: false,
    twelveQuestionMatrixRun: false,
    managedClub: managed.name,
    tactics: {
      formation: managed.tactics.formation,
      style: managed.tactics.style,
      approach: managed.tactics.approach,
      tackling: managed.tactics.tackling,
    },
    summary: {
      matches: records.length,
      wins,
      draws,
      losses,
      goalsFor: records.reduce((sum, record) => sum + record.score.managed, 0),
      goalsAgainst: records.reduce((sum, record) => sum + record.score.opponent, 0),
      believableYes: records.filter((record) => record.scorelineBelievable === "yes").length,
      believableNo: records.filter((record) => record.scorelineBelievable === "no").length,
      believableUnsure: records.filter((record) => record.scorelineBelievable === "unsure").length,
      tacticsPatternRecognisable,
      seriesNote,
    },
    matches: records,
    limitation: "Human judgement is split deliberately: per-match questions assess whether the scoreline looks believable from the displayed match stats; the end-of-series question assesses whether the fixed tactical setup produced a recognisable pattern across eight results. This is not the sealed validation run and not the 12-question matrix.",
  };
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return path;
}

async function main(): Promise<void> {
  const provenance = readEvidenceProvenance();
  try {
    console.clear();
    console.log(line("="));
    console.log("              MATCH LAB — 8 MATCH ENGINE PLAYTEST");
    console.log(line("="));
    printRunProvenance("EIGHT-MATCH HUMAN PLAYTEST", provenance);
    console.log("Purpose: judge whether individual scorelines look believable, then judge the pattern across all eight matches.");
    console.log("Every seed and result will be saved automatically. Validation seeds remain sealed.\n");

    const managedChoice = await choose("Choose the club you will keep for all eight matches", ["northbridge", "redmere"] as const, {
      northbridge: "Northbridge",
      redmere: "Redmere",
    });

    const managedTemplate = makeTeam(managedChoice, 10);
    await configureManagedTeam(managedTemplate);

    console.log("\nFIXED SETUP FOR ALL EIGHT MATCHES");
    console.log(line());
    console.log(`Club:      ${managedTemplate.name}`);
    console.log(`Formation: ${managedTemplate.tactics.formation}`);
    console.log(`Style:     ${managedTemplate.tactics.style}`);
    console.log(`Approach:  ${managedTemplate.tactics.approach}`);
    console.log(`Tackling:  ${managedTemplate.tactics.tackling}`);
    await rl.question("\nPress Enter to start the eight-match sequence...");

    const records: SeriesMatchRecord[] = [];

    for (let match = 1; match <= 8; match += 1) {
      const managed = makeTeam(managedChoice, 10, managedTemplate.tactics);
      const opponentChoice = managedChoice === "northbridge" ? "redmere" : "northbridge";
      const opponent = makeTeam(opponentChoice, 10);
      const managedHome = match % 2 === 1;
      const home = managedHome ? managed : opponent;
      const away = managedHome ? opponent : managed;
      const seed = Math.floor(Math.random() * 2_000_000_000) + 1;

      console.log(`\n${line("=")}`);
      console.log(`MATCH ${match} OF 8 — ${managedHome ? "HOME" : "AWAY"}`);
      console.log(`Seed: ${seed}`);
      console.log(line("="));

      const result = simulateMatch({ seed, home, away });
      const managedStats = managedHome ? result.home : result.away;
      const opponentStats = managedHome ? result.away : result.home;
      const managedGoals = managedStats.goals;
      const opponentGoals = opponentStats.goals;
      const record: SeriesMatchRecord = {
        match,
        seed,
        managedClub: managed.name,
        opponent: opponent.name,
        venue: managedHome ? "home" : "away",
        tactics: {
          formation: managed.tactics.formation,
          style: managed.tactics.style,
          approach: managed.tactics.approach,
          tackling: managed.tactics.tackling,
        },
        score: { managed: managedGoals, opponent: opponentGoals },
        result: resultLetter(managedGoals, opponentGoals),
        managedStats: {
          chances: managedStats.chances,
          shots: managedStats.shots,
          shotsOnTarget: managedStats.shotsOnTarget,
          possessionPercent: Math.round((managedStats.possessionTicks / ENGINE_CONFIG.matchMinutes) * 100),
          yellowCards: managedStats.yellowCards,
          redCards: managedStats.redCards,
        },
        opponentStats: {
          chances: opponentStats.chances,
          shots: opponentStats.shots,
          shotsOnTarget: opponentStats.shotsOnTarget,
          possessionPercent: Math.round((opponentStats.possessionTicks / ENGINE_CONFIG.matchMinutes) * 100),
          yellowCards: opponentStats.yellowCards,
          redCards: opponentStats.redCards,
        },
        averageFinalCondition: managedCondition(managed, result.finalCondition),
        scorelineBelievable: "unsure",
        note: "",
      };

      printMatchRecord(record);
      record.scorelineBelievable = await yesNoUnsure("Does that scoreline look believable from the match stats shown?");
      record.note = (await rl.question("Optional short note (press Enter to skip): ")).trim();
      records.push(record);
    }

    const wins = records.filter((record) => record.result === "W").length;
    const draws = records.filter((record) => record.result === "D").length;
    const losses = records.filter((record) => record.result === "L").length;

    console.log(`\n${line("=")}`);
    console.log("8-MATCH SUMMARY");
    console.log(line("="));
    console.log(`Record: ${wins}W ${draws}D ${losses}L`);
    console.log(`Goals: ${records.reduce((sum, record) => sum + record.score.managed, 0)} for, ${records.reduce((sum, record) => sum + record.score.opponent, 0)} against`);
    console.log(`Scorelines believable: ${records.filter((record) => record.scorelineBelievable === "yes").length} yes, ${records.filter((record) => record.scorelineBelievable === "no").length} no, ${records.filter((record) => record.scorelineBelievable === "unsure").length} unsure`);

    const tacticsPatternRecognisable = await yesNoUnsure("Across all eight matches, did your fixed tactics seem to produce a recognisable pattern?");
    const seriesNote = (await rl.question("Optional overall note on the eight-match run (press Enter to skip): ")).trim();
    const path = writeEvidence(records, managedTemplate, tacticsPatternRecognisable, seriesNote, provenance);

    console.log(`Evidence saved: ${path}`);
    console.log("\nKeep this file. If any scoreline looked wrong, its exact seed is recorded inside.\n");
  } finally {
    rl.close();
  }
}

await main();
