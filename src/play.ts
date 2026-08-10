import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import type { Approach, Formation, MatchEvent, Style, Tackling, TeamInput } from "./types.js";

const rl = createInterface({ input, output });

const formations: Formation[] = ["4-4-2", "4-3-3", "4-5-1", "3-5-2", "5-3-2"];
const styles: Style[] = ["balanced", "passing", "direct", "counter"];
const approaches: Approach[] = ["cautious", "balanced", "attacking"];
const tacklingOptions: Tackling[] = ["careful", "normal", "hard"];

function line(char = "-", width = 68): string {
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

async function chooseSeed(): Promise<number> {
  const answer = (await rl.question("\nMatch seed (press Enter for a random seed): ")).trim();
  if (answer === "") return Math.floor(Math.random() * 2_000_000_000) + 1;
  const seed = Number.parseInt(answer, 10);
  if (Number.isFinite(seed) && seed > 0) return seed;
  console.log("That seed was not valid, so this match will use seed 1.");
  return 1;
}

function printSquad(team: TeamInput): void {
  console.log(`\n${team.name} — STARTING XI`);
  console.log(line());
  console.log("No  Pos  Player                         Cond  Key attributes");
  team.starters.forEach((player, index) => {
    const key = player.primaryPosition === "GK"
      ? `GK ${player.attributes.goalkeeping}`
      : player.primaryPosition === "DF"
        ? `DEF ${player.attributes.defending}  PAC ${player.attributes.pace}`
        : player.primaryPosition === "MF"
          ? `PAS ${player.attributes.passing}  CRE ${player.attributes.creativity}`
          : `FIN ${player.attributes.finishing}  PAC ${player.attributes.pace}`;
    console.log(`${String(index + 1).padStart(2)}  ${player.primaryPosition.padEnd(3)}  ${player.name.padEnd(29)} ${String(player.state.condition).padStart(3)}   ${key}`);
  });
}

function eventLabel(event: MatchEvent): string {
  switch (event.type) {
    case "goal": return "GOAL";
    case "save": return "SAVE";
    case "yellow-card": return "BOOKING";
    case "red-card": return "SENT OFF";
    case "injury": return "INJURY";
    case "substitution": return "SUB";
    case "tactical-change": return "TACTICS";
    case "chance": return "CHANCE";
    case "shot": return "SHOT";
    case "attack": return "ATTACK";
    case "foul": return "FOUL";
    default: return event.type.toUpperCase();
  }
}

function printMatchEvents(events: MatchEvent[]): void {
  console.log("\nMATCH COMMENTARY");
  console.log(line());
  const keyTypes = new Set(["goal", "save", "yellow-card", "red-card", "injury", "substitution", "tactical-change", "chance", "shot", "attack"]);
  for (const event of events) {
    if (event.type === "kick-off") {
      console.log(" 0'  KICK-OFF");
      continue;
    }
    if (event.type === "full-time") continue;
    if (!keyTypes.has(event.type)) continue;
    console.log(`${String(event.minute).padStart(2)}'  ${eventLabel(event).padEnd(9)} ${event.detail}`);
  }
}

function printRatings(team: TeamInput, contributions: ReturnType<typeof simulateMatch>["contributions"], finalCondition: Record<string, number>): void {
  const byId = new Map(contributions.map((contribution) => [contribution.playerId, contribution]));
  console.log(`\n${team.name} — PLAYER RATINGS`);
  console.log(line());
  console.log("Player                         Rat  Cond  G  A  YC RC");
  for (const player of team.starters) {
    const c = byId.get(player.id);
    if (!c) continue;
    const condition = finalCondition[player.id] ?? player.state.condition;
    console.log(`${player.name.padEnd(30)} ${c.rating.toFixed(1).padStart(3)}  ${condition.toFixed(0).padStart(4)}  ${String(c.goals).padStart(1)}  ${String(c.assists).padStart(1)}  ${String(c.yellowCards).padStart(2)} ${String(c.redCards).padStart(2)}`);
  }
}

async function configureManagedTeam(team: TeamInput): Promise<void> {
  console.log(`\nSet up ${team.name}. Keep it simple and pick what you would actually use.`);
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

async function playOne(): Promise<void> {
  console.clear();
  console.log(line("="));
  console.log("             FOOTBALL MANAGER SIMULATION — MATCH LAB");
  console.log(line("="));
  console.log("Human playtest harness. Same match engine as the automated evidence runs.");

  const managed = await choose("Choose your club", ["northbridge", "redmere"] as const, {
    northbridge: "Northbridge (home)",
    redmere: "Redmere (away)",
  });

  const northbridge = makeTeam("northbridge", 10);
  const redmere = makeTeam("redmere", 10);
  const managedTeam = managed === "northbridge" ? northbridge : redmere;

  printSquad(managedTeam);
  await configureManagedTeam(managedTeam);
  const seed = await chooseSeed();

  console.log("\nYOUR TACTICS");
  console.log(line());
  console.log(`Club:      ${managedTeam.name}`);
  console.log(`Formation: ${managedTeam.tactics.formation}`);
  console.log(`Style:     ${managedTeam.tactics.style}`);
  console.log(`Approach:  ${managedTeam.tactics.approach}`);
  console.log(`Tackling:  ${managedTeam.tactics.tackling}`);
  console.log(`Seed:      ${seed}`);
  await rl.question("\nPress Enter to kick off...");

  const result = simulateMatch({ seed, home: northbridge, away: redmere });
  printMatchEvents(result.events);

  console.log(`\n${line("=")}`);
  console.log(`FULL-TIME: NORTHBRIDGE ${result.home.goals}-${result.away.goals} REDMERE`);
  console.log(line("="));
  console.log(`Chances:       ${result.home.chances}-${result.away.chances}`);
  console.log(`Shots:         ${result.home.shots}-${result.away.shots}`);
  console.log(`Shots on tgt:  ${result.home.shotsOnTarget}-${result.away.shotsOnTarget}`);
  console.log(`Possession:    ${Math.round((result.home.possessionTicks / 90) * 100)}%-${Math.round((result.away.possessionTicks / 90) * 100)}%`);
  console.log(`Cards:         ${result.home.yellowCards}Y/${result.home.redCards}R - ${result.away.yellowCards}Y/${result.away.redCards}R`);
  console.log(`Replay seed:   ${seed}`);

  printRatings(northbridge, result.contributions, result.finalCondition);
  printRatings(redmere, result.contributions, result.finalCondition);

  console.log("\nPLAYTEST NOTES TO THINK ABOUT");
  console.log("• Did your tactical choice seem to show up in the match?");
  console.log("• Did the score and chances feel believable?");
  console.log("• Did late-match condition look sensible?");
  console.log("• Did the ratings broadly match what happened?");
  console.log("• Was anything obviously silly or too repetitive?");
}

async function main(): Promise<void> {
  try {
    let again = true;
    while (again) {
      await playOne();
      const answer = (await rl.question("\nPlay another match? (y/n): ")).trim().toLowerCase();
      again = answer === "y" || answer === "yes";
    }
    console.log("\nMatch Lab closed. Keep any replay seed for a match you want investigated.\n");
  } finally {
    rl.close();
  }
}

await main();
