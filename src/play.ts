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

function teamForEvent(event: MatchEvent, home: TeamInput, away: TeamInput): TeamInput | undefined {
  if (event.teamId === home.id) return home;
  if (event.teamId === away.id) return away;
  return undefined;
}

function teamName(event: MatchEvent, home: TeamInput, away: TeamInput): string {
  return teamForEvent(event, home, away)?.name ?? "The team";
}

function playerNumber(playerId: string | undefined, home: TeamInput, away: TeamInput): number | undefined {
  if (!playerId) return undefined;
  for (const team of [home, away]) {
    const starterIndex = team.starters.findIndex((player) => player.id === playerId);
    if (starterIndex >= 0) return starterIndex + 1;
    const substituteIndex = team.substitutes.findIndex((player) => player.id === playerId);
    if (substituteIndex >= 0) return 12 + substituteIndex;
  }
  return undefined;
}

function playerLabel(playerId: string | undefined, home: TeamInput, away: TeamInput, players: Map<string, Player>, fallback = "a player"): string {
  if (!playerId) return fallback;
  const number = playerNumber(playerId, home, away);
  const player = players.get(playerId);
  if (number !== undefined) return `Player ${number}`;
  return player?.name ?? fallback;
}

function phraseIndex(event: MatchEvent, size: number, salt = ""): number {
  const text = `${event.minute}:${event.type}:${event.playerId ?? ""}:${event.secondaryPlayerId ?? ""}:${salt}`;
  let value = 0;
  for (const character of text) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value % size;
}

function pickPhrase(event: MatchEvent, phrases: string[], salt = ""): string {
  return phrases[phraseIndex(event, phrases.length, salt)]!;
}

function laneFor(event: MatchEvent): string {
  return ["down the left", "through the middle", "down the right"][phraseIndex(event, 3, "lane")]!;
}

function shotLocationFor(event: MatchEvent): string {
  return ["from the edge of the box", "from outside the box", "from inside the area", "first time"][phraseIndex(event, 4, "shot-location")]!;
}

function attackCommentary(event: MatchEvent, home: TeamInput, away: TeamInput, players: Map<string, Player>): string {
  const team = teamForEvent(event, home, away);
  const teamText = team?.name ?? "The team";
  const player = playerLabel(event.playerId, home, away, players);
  const lane = laneFor(event);
  const style = team?.tactics.style ?? "balanced";

  if (style === "direct") {
    return pickPhrase(event, [
      `${teamText} go early and direct. ${player} attacks the space ${lane}.`,
      `${teamText} send it forward quickly. ${player} is onto it ${lane}.`,
      `${player} drives ${lane} as ${teamText} look to get the ball in early.`,
    ], "direct");
  }
  if (style === "passing") {
    return pickPhrase(event, [
      `${teamText} keep the ball moving. ${player} finds a pocket ${lane}.`,
      `${teamText} work it patiently from player to player. ${player} receives ${lane}.`,
      `${player} joins a neat passing move as ${teamText} probe ${lane}.`,
    ], "passing");
  }
  if (style === "counter") {
    return pickPhrase(event, [
      `${teamText} break quickly. ${player} carries it ${lane}.`,
      `Suddenly ${teamText} are away. ${player} races into space ${lane}.`,
      `${player} leads the counter for ${teamText}, surging ${lane}.`,
    ], "counter");
  }
  return pickPhrase(event, [
    `${player} takes ${teamText} forward ${lane}.`,
    `${teamText} push on, with ${player} finding room ${lane}.`,
    `${player} moves into space ${lane} for ${teamText}.`,
  ], "balanced");
}

function chanceCommentary(event: MatchEvent, home: TeamInput, away: TeamInput, players: Map<string, Player>): string {
  const team = teamForEvent(event, home, away);
  const teamText = team?.name ?? "The team";
  const player = playerLabel(event.playerId, home, away, players);
  const style = team?.tactics.style ?? "balanced";

  if (style === "direct") {
    return pickPhrase(event, [
      `${player} gets the cross in early — ${teamText} have numbers in the box.`,
      `${player} clips it into the area. This could open up for ${teamText}.`,
      `${player} delivers towards the forwards. ${teamText} have a chance here.`,
    ], "direct-chance");
  }
  if (style === "passing") {
    return pickPhrase(event, [
      `${player} slips a pass through the gap — ${teamText} have worked an opening.`,
      `${player} combines neatly around the area. ${teamText} are in.`,
      `${player} finds the final pass. ${teamText} have opened the defence up.`,
    ], "passing-chance");
  }
  if (style === "counter") {
    return pickPhrase(event, [
      `${player} releases the ball at just the right moment — ${teamText} are in behind.`,
      `${player} finds the runner on the break. A real chance for ${teamText}.`,
      `${teamText} turn defence into attack and ${player} makes the decisive pass.`,
    ], "counter-chance");
  }
  return pickPhrase(event, [
    `${player} gets the final ball right — ${teamText} have an opening.`,
    `${player} creates the space. ${teamText} have a chance.`,
    `${player} picks the pass and ${teamText} are threatening now.`,
  ], "balanced-chance");
}

function eventClockSecond(event: MatchEvent, indexWithinMinute: number): number {
  const minuteStart = Math.max(0, event.minute - 1) * 60;
  const offsets = [8, 20, 32, 44, 52, 57];
  return Math.min(90 * 60, minuteStart + offsets[Math.min(indexWithinMinute, offsets.length - 1)]!);
}

function formatClock(matchSecond: number): string {
  const clamped = Math.max(0, Math.min(90 * 60, Math.floor(matchSecond)));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clearClockLine(): void {
  output.write("\r\x1b[2K");
}

function renderClock(matchSecond: number, home: TeamInput, away: TeamInput, homeGoals: number, awayGoals: number): void {
  clearClockLine();
  output.write(` ${formatClock(matchSecond)}   ${home.name} ${homeGoals}-${awayGoals} ${away.name}`);
}

async function suspensePause(pace: CommentaryPace): Promise<void> {
  const delay = pace === "quick" ? 550 : pace === "normal" ? 1_250 : 1_750;
  output.write("        ...");
  await sleep(delay);
  clearClockLine();
}

function visibleEvents(events: MatchEvent[]): MatchEvent[] {
  const visible = new Set(["goal", "save", "yellow-card", "red-card", "injury", "substitution", "tactical-change", "chance", "shot", "attack"]);
  return events.filter((event) => visible.has(event.type));
}

interface ScheduledEvent {
  event: MatchEvent;
  matchSecond: number;
}

function scheduleEvents(events: MatchEvent[]): ScheduledEvent[] {
  const counters = new Map<number, number>();
  return visibleEvents(events).map((event) => {
    const count = counters.get(event.minute) ?? 0;
    counters.set(event.minute, count + 1);
    return { event, matchSecond: eventClockSecond(event, count) };
  });
}

async function describeEvent(event: MatchEvent, home: TeamInput, away: TeamInput, players: Map<string, Player>, pace: CommentaryPace): Promise<void> {
  const team = teamName(event, home, away);
  const player = playerLabel(event.playerId, home, away, players);
  const other = playerLabel(event.secondaryPlayerId, home, away, players);

  switch (event.type) {
    case "attack":
      console.log(`\n ${formatClock((event.minute - 1) * 60 + 8)}  ${attackCommentary(event, home, away, players)}`);
      break;
    case "chance":
      console.log(`\n ${formatClock((event.minute - 1) * 60 + 20)}  ${chanceCommentary(event, home, away, players)}`);
      break;
    case "shot":
      console.log(`\n ${formatClock((event.minute - 1) * 60 + 32)}  ${player} shoots ${shotLocationFor(event)}...`);
      await suspensePause(pace);
      console.log(` ${formatClock((event.minute - 1) * 60 + 38)}  WIDE. ${player} can't quite find the target.`);
      break;
    case "save":
      console.log(`\n ${formatClock((event.minute - 1) * 60 + 32)}  ${other} shoots ${shotLocationFor(event)}...`);
      await suspensePause(pace);
      console.log(` ${formatClock((event.minute - 1) * 60 + 38)}  SAVED! ${player} gets behind it.`);
      break;
    case "goal":
      console.log(`\n ${formatClock((event.minute - 1) * 60 + 32)}  ${player} shoots ${shotLocationFor(event)}...`);
      await suspensePause(pace);
      console.log(` ${formatClock((event.minute - 1) * 60 + 38)}  GOAL! ${player} scores for ${team}!`);
      break;
    case "yellow-card":
      console.log(`\n ${formatClock((event.minute - 1) * 60 + 28)}  BOOKING. ${player} goes into the referee's notebook.`);
      break;
    case "red-card":
      console.log(`\n ${formatClock((event.minute - 1) * 60 + 28)}  RED CARD! ${player} is sent off. ${team} are down to ten.`);
      break;
    case "injury":
      console.log(`\n ${formatClock((event.minute - 1) * 60 + 28)}  ${player} is down and needs attention.`);
      break;
    case "substitution":
      console.log(`\n ${formatClock((event.minute - 1) * 60 + 28)}  ${team} make a change: ${event.detail}`);
      break;
    case "tactical-change":
      console.log(`\n ${formatClock((event.minute - 1) * 60 + 28)}  ${team} change their approach: ${event.detail}`);
      break;
    default:
      break;
  }
}

async function playMatchCommentary(result: MatchOutput, home: TeamInput, away: TeamInput, pace: CommentaryPace): Promise<void> {
  console.log("\nLIVE MATCH");
  console.log(line());
  console.log("The clock keeps moving. Key moments will interrupt the live line below.\n");

  const players = playerLookup(home, away);
  const events = scheduleEvents(result.events);
  const durationMs = targetDurationMs[pace];
  const realMsPerMatchSecond = durationMs / (90 * 60);
  const tickRealMs = pace === "quick" ? 180 : 220;
  let matchSecond = 0;
  let eventIndex = 0;
  let homeGoals = 0;
  let awayGoals = 0;
  let halfTimeShown = false;
  let lastReal = performance.now();

  console.log(" 00:00  KICK-OFF");

  while (matchSecond < 90 * 60) {
    const now = performance.now();
    const elapsedReal = now - lastReal;
    lastReal = now;
    matchSecond += elapsedReal / realMsPerMatchSecond;

    if (!halfTimeShown && matchSecond >= 45 * 60) {
      clearClockLine();
      console.log(`\n 45:00  HALF-TIME — ${home.name} ${homeGoals}-${awayGoals} ${away.name}\n`);
      halfTimeShown = true;
      await sleep(pace === "quick" ? 700 : 1_500);
      lastReal = performance.now();
    }

    while (eventIndex < events.length && events[eventIndex]!.matchSecond <= matchSecond) {
      const scheduled = events[eventIndex]!;
      clearClockLine();
      await describeEvent(scheduled.event, home, away, players, pace);
      if (scheduled.event.type === "goal") {
        if (scheduled.event.teamId === home.id) homeGoals += 1;
        if (scheduled.event.teamId === away.id) awayGoals += 1;
        console.log(`        SCORE: ${home.name} ${homeGoals}-${awayGoals} ${away.name}\n`);
      }
      eventIndex += 1;
      lastReal = performance.now();
    }

    renderClock(matchSecond, home, away, homeGoals, awayGoals);
    await sleep(tickRealMs);
  }

  clearClockLine();
  console.log(`\n 90:00  FULL-TIME — ${home.name} ${result.home.goals}-${result.away.goals} ${away.name}`);
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
  console.log("Human playtest harness. Match outcomes come from the real Match Lab engine.");
  console.log("Pitch locations and move descriptions are presentation-only at this stage.");

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
  console.log("• Did the running clock make quiet periods feel better?");
  console.log("• Did the attack/chance/shot sequences feel like football?");
  console.log("• Could you recognise your chosen style in the commentary?");
  console.log("• Were the suspense pauses enjoyable or irritating?");
  console.log("• Did the score, chances, condition and ratings feel believable?");
  console.log("• Keep the replay seed for anything that felt wrong.");
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
