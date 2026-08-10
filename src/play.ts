import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { simulateMatch } from "./engine.js";
import { makeTeam } from "./fixtures.js";
import type { Approach, Formation, MatchEvent, MatchOutput, Player, Style, Tackling, TeamInput } from "./types.js";

const rl = createInterface({ input, output });

const formations: Formation[] = ["4-4-2", "4-3-3", "4-5-1", "3-5-2", "5-3-2"];
const styles: Style[] = ["balanced", "passing", "direct", "counter"];
const approaches: Approach[] = ["cautious", "balanced", "attacking"];
const tacklingOptions: Tackling[] = ["careful", "normal", "hard"];
const paceOptions = ["relaxed", "normal", "quick"] as const;
type CommentaryPace = typeof paceOptions[number];

const targetDurationMs: Record<CommentaryPace, number> = {
  relaxed: 180_000,
  normal: 120_000,
  quick: 60_000,
};

function line(char = "-", width = 68): string {
  return char.repeat(width);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

function playerLookup(home: TeamInput, away: TeamInput): Map<string, Player> {
  return new Map([...home.starters, ...home.substitutes, ...away.starters, ...away.substitutes].map((player) => [player.id, player]));
}

function teamName(event: MatchEvent, home: TeamInput, away: TeamInput): string {
  if (event.teamId === home.id) return home.name;
  if (event.teamId === away.id) return away.name;
  return "The team";
}

function playerName(id: string | undefined, players: Map<string, Player>, fallback = "a player"): string {
  return id ? players.get(id)?.name ?? fallback : fallback;
}

function phraseIndex(event: MatchEvent, size: number): number {
  const text = `${event.minute}:${event.type}:${event.playerId ?? ""}:${event.secondaryPlayerId ?? ""}`;
  let value = 0;
  for (const character of text) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value % size;
}

function pickPhrase(event: MatchEvent, phrases: string[]): string {
  return phrases[phraseIndex(event, phrases.length)]!;
}

function commentaryFor(event: MatchEvent, home: TeamInput, away: TeamInput, players: Map<string, Player>): string {
  const team = teamName(event, home, away);
  const player = playerName(event.playerId, players);
  const other = playerName(event.secondaryPlayerId, players);

  switch (event.type) {
    case "attack":
      return pickPhrase(event, [
        `${team} are beginning to find some space.`,
        `${team} push forward and ask a question of the defence.`,
        `${team} build patiently and move into a dangerous area.`,
      ]);
    case "chance":
      return pickPhrase(event, [
        `${player} opens things up for ${team} — this could be a chance.`,
        `${team} have worked an opening, with ${player} at the heart of it.`,
        `${player} finds the gap. ${team} are in a promising position.`,
      ]);
    case "shot":
      return pickPhrase(event, [
        `${player} tries his luck, but sends it wide.`,
        `${player} gets the shot away — not quite accurate enough.`,
        `${player} goes for goal, but it drifts past the target.`,
      ]);
    case "save":
      return pickPhrase(event, [
        `${player} is equal to it and makes the save.`,
        `${other} tests the goalkeeper, but ${player} keeps it out.`,
        `Good stop from ${player}. ${other} had made that dangerous.`,
      ]);
    case "goal":
      return pickPhrase(event, [
        `GOAL! ${player} finishes it for ${team}!`,
        `GOAL! ${team} have the breakthrough — ${player} with the finish!`,
        `GOAL! ${player} makes it count for ${team}!`,
      ]);
    case "yellow-card":
      return `${player} goes into the book.`;
    case "red-card":
      return `RED CARD! ${player} is sent off. ${team} are down to ten.`;
    case "injury":
      return `${player} is in trouble here and needs attention.`;
    case "substitution":
      return `${team} make a change: ${event.detail}`;
    case "tactical-change":
      return `${team} change their approach: ${event.detail}`;
    case "foul":
      return `${player} concedes the free kick.`;
    default:
      return event.detail;
  }
}

function keyEvents(events: MatchEvent[]): MatchEvent[] {
  const visible = new Set(["goal", "save", "yellow-card", "red-card", "injury", "substitution", "tactical-change", "chance", "shot", "attack"]);
  return events.filter((event) => visible.has(event.type));
}

async function playMatchCommentary(result: MatchOutput, home: TeamInput, away: TeamInput, pace: CommentaryPace): Promise<void> {
  console.log("\nMATCH COMMENTARY");
  console.log(line());
  console.log(" 0'  And we're underway.");

  const players = playerLookup(home, away);
  const events = keyEvents(result.events);
  let previousMinute = 0;
  let halfTimeShown = false;
  let homeGoals = 0;
  let awayGoals = 0;
  const msPerMatchMinute = targetDurationMs[pace] / 90;

  for (const event of events) {
    if (!halfTimeShown && event.minute > 45) {
      const waitToHalf = Math.max(150, (45 - previousMinute) * msPerMatchMinute);
      await sleep(Math.min(waitToHalf, 7_000));
      console.log(`\n45'  HALF-TIME — ${home.name} ${homeGoals}-${awayGoals} ${away.name}\n`);
      halfTimeShown = true;
      previousMinute = 45;
      await sleep(pace === "quick" ? 800 : 1_800);
    }

    const minuteGap = Math.max(1, event.minute - previousMinute);
    await sleep(Math.min(Math.max(180, minuteGap * msPerMatchMinute), 7_000));

    if (event.type === "goal") {
      if (event.teamId === home.id) homeGoals += 1;
      if (event.teamId === away.id) awayGoals += 1;
    }

    console.log(`${String(event.minute).padStart(2)}'  ${commentaryFor(event, home, away, players)}`);
    if (event.type === "goal") {
      console.log(`     SCORE: ${home.name} ${homeGoals}-${awayGoals} ${away.name}`);
      await sleep(pace === "quick" ? 600 : 1_500);
    }
    previousMinute = event.minute;
  }

  if (!halfTimeShown) {
    console.log(`\n45'  HALF-TIME — ${home.name} ${homeGoals}-${awayGoals} ${away.name}\n`);
    await sleep(pace === "quick" ? 500 : 1_200);
  }

  const waitToFullTime = Math.max(250, (90 - previousMinute) * msPerMatchMinute);
  await sleep(Math.min(waitToFullTime, 7_000));
  console.log(`\n90'  FULL-TIME — ${home.name} ${result.home.goals}-${result.away.goals} ${away.name}`);
}

function printRatings(team: TeamInput, contributions: MatchOutput["contributions"], finalCondition: Record<string, number>): void {
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
  const pace = await choose("Match pace", paceOptions, {
    relaxed: "Relaxed — about 3 minutes",
    normal: "Normal — about 2 minutes",
    quick: "Quick — about 1 minute",
  });
  const seed = await chooseSeed();

  console.log("\nYOUR TACTICS");
  console.log(line());
  console.log(`Club:      ${managedTeam.name}`);
  console.log(`Formation: ${managedTeam.tactics.formation}`);
  console.log(`Style:     ${managedTeam.tactics.style}`);
  console.log(`Approach:  ${managedTeam.tactics.approach}`);
  console.log(`Tackling:  ${managedTeam.tactics.tackling}`);
  console.log(`Pace:      ${pace}`);
  console.log(`Seed:      ${seed}`);
  await rl.question("\nPress Enter to kick off...");

  const result = simulateMatch({ seed, home: northbridge, away: redmere });
  await playMatchCommentary(result, northbridge, redmere, pace);

  console.log(`\n${line("=")}`);
  console.log(`FINAL SCORE: ${northbridge.name} ${result.home.goals}-${result.away.goals} ${redmere.name}`);
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
  console.log("• Did it feel like a match rather than a data dump?");
  console.log("• Did your tactical choice seem to show up in the match?");
  console.log("• Did the score and chances feel believable?");
  console.log("• Did late-match condition look sensible?");
  console.log("• Did the ratings broadly match what happened?");
  console.log("• Was the commentary repetitive, confusing or too sparse?");
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
