import { SeededRandom } from "./random.js";
import type {
  MatchEvent,
  MatchInput,
  MatchOutput,
  Player,
  PlayerContribution,
  TeamInput,
  TeamStats,
} from "./types.js";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

function moraleFactor(morale: Player["state"]["morale"]): number {
  return { "very-low": 0.94, low: 0.97, steady: 1, good: 1.02, high: 1.04 }[morale];
}

function effectiveAttribute(player: Player, key: keyof Player["attributes"]): number {
  const condition = 0.78 + 0.22 * clamp(player.state.condition / 100, 0, 1);
  const form = 1 + clamp(player.state.recentForm, -1, 1) * 0.025;
  return player.attributes[key] * condition * form * moraleFactor(player.state.morale);
}

function teamProfile(team: TeamInput) {
  const xi = team.starters;
  const passing = average(xi.map((p) => effectiveAttribute(p, "passing")));
  const creativity = average(xi.map((p) => effectiveAttribute(p, "creativity")));
  const pace = average(xi.map((p) => effectiveAttribute(p, "pace")));
  const aerial = average(xi.map((p) => effectiveAttribute(p, "aerial")));
  const finishing = average(xi.filter((p) => p.primaryPosition === "FW").map((p) => effectiveAttribute(p, "finishing")) || [10]);
  const defending = average(xi.map((p) => effectiveAttribute(p, "defending")));
  const goalkeeper = effectiveAttribute(xi.find((p) => p.primaryPosition === "GK") ?? xi[0]!, "goalkeeping");

  let retention = passing * 0.65 + creativity * 0.35;
  let progression = passing * 0.35 + creativity * 0.3 + pace * 0.2 + aerial * 0.15;
  let attack = creativity * 0.3 + pace * 0.25 + finishing * 0.3 + aerial * 0.15;
  let defence = defending * 0.7 + pace * 0.15 + aerial * 0.15;

  if (team.tactics.style === "passing") {
    retention *= 1.08;
    progression *= 1.03;
  } else if (team.tactics.style === "direct") {
    retention *= 0.94;
    progression *= 1.04 + clamp((aerial - 10) / 200, -0.03, 0.05);
  } else if (team.tactics.style === "counter") {
    retention *= 0.96;
    attack *= 1.02 + clamp((pace - 10) / 200, -0.03, 0.05);
  }

  const approachFactor = team.tactics.approach === "attacking" ? 1.08 : team.tactics.approach === "cautious" ? 0.92 : 1;
  attack *= approachFactor;
  defence *= team.tactics.approach === "attacking" ? 0.95 : team.tactics.approach === "cautious" ? 1.05 : 1;

  return { retention, progression, attack, defence, goalkeeper };
}

function emptyStats(): TeamStats {
  return { goals: 0, shots: 0, shotsOnTarget: 0, chances: 0, fouls: 0, yellowCards: 0, redCards: 0 };
}

function createContribution(player: Player): PlayerContribution {
  return {
    playerId: player.id,
    minutesPlayed: 90,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    chancesCreated: 0,
    progressionActions: 0,
    defensiveActions: 0,
    saves: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    majorErrors: 0,
    rating: 6,
  };
}

function chooseAttacker(random: SeededRandom, team: TeamInput): Player {
  const forwards = team.starters.filter((p) => p.primaryPosition === "FW");
  return random.pick(forwards.length > 0 ? forwards : team.starters);
}

function chooseCreator(random: SeededRandom, team: TeamInput): Player {
  const designated = team.starters.find((p) => p.id === team.tactics.creatorId);
  if (designated && random.chance(0.35)) return designated;
  const candidates = team.starters.filter((p) => p.primaryPosition === "MF" || p.primaryPosition === "FW");
  return random.pick(candidates.length > 0 ? candidates : team.starters);
}

function addEvent(events: MatchEvent[], event: MatchEvent): void {
  events.push(event);
}

export function simulateMatch(input: MatchInput): MatchOutput {
  validateMatchInput(input);
  const random = new SeededRandom(input.seed);
  const homeProfile = teamProfile(input.home);
  const awayProfile = teamProfile(input.away);
  const homeStats = emptyStats();
  const awayStats = emptyStats();
  const events: MatchEvent[] = [{ minute: 0, type: "kick-off", detail: "Kick-off" }];
  const contributions = new Map<string, PlayerContribution>();

  for (const player of [...input.home.starters, ...input.away.starters]) {
    contributions.set(player.id, createContribution(player));
  }

  for (let minute = 1; minute <= 90; minute += 1) {
    const homePossession = input.neutralVenue ? 0.5 : 0.515;
    const retentionDelta = (homeProfile.retention - awayProfile.retention) / 120;
    const attackingTeam = random.chance(clamp(homePossession + retentionDelta, 0.38, 0.62)) ? input.home : input.away;
    const defendingTeam = attackingTeam === input.home ? input.away : input.home;
    const attackProfile = attackingTeam === input.home ? homeProfile : awayProfile;
    const defenceProfile = defendingTeam === input.home ? homeProfile : awayProfile;
    const attackStats = attackingTeam === input.home ? homeStats : awayStats;
    const defenceStats = defendingTeam === input.home ? homeStats : awayStats;

    const progressionProbability = clamp(0.24 + (attackProfile.progression - defenceProfile.defence) / 180, 0.12, 0.38);
    if (!random.chance(progressionProbability)) continue;

    const creator = chooseCreator(random, attackingTeam);
    contributions.get(creator.id)!.progressionActions += 1;

    if (!random.chance(clamp(0.28 + (attackProfile.attack - defenceProfile.defence) / 200, 0.14, 0.42))) continue;

    attackStats.chances += 1;
    contributions.get(creator.id)!.chancesCreated += 1;
    addEvent(events, { minute, type: "chance", teamId: attackingTeam.id, playerId: creator.id, detail: `${attackingTeam.name} create a chance` });

    const shooter = chooseAttacker(random, attackingTeam);
    const shooterContribution = contributions.get(shooter.id)!;
    attackStats.shots += 1;
    shooterContribution.shots += 1;

    const onTargetProbability = clamp(0.42 + (effectiveAttribute(shooter, "finishing") - 10) / 80, 0.25, 0.66);
    if (!random.chance(onTargetProbability)) {
      addEvent(events, { minute, type: "shot", teamId: attackingTeam.id, playerId: shooter.id, detail: `${shooter.name} shoots wide` });
      continue;
    }

    attackStats.shotsOnTarget += 1;
    shooterContribution.shotsOnTarget += 1;
    const goalProbability = clamp(0.25 + (effectiveAttribute(shooter, "finishing") - defenceProfile.goalkeeper) / 90, 0.12, 0.42);

    if (random.chance(goalProbability)) {
      attackStats.goals += 1;
      shooterContribution.goals += 1;
      if (creator.id !== shooter.id) contributions.get(creator.id)!.assists += 1;
      addEvent(events, { minute, type: "goal", teamId: attackingTeam.id, playerId: shooter.id, secondaryPlayerId: creator.id, detail: `${shooter.name} scores` });
    } else {
      const keeper = defendingTeam.starters.find((p) => p.primaryPosition === "GK") ?? defendingTeam.starters[0]!;
      contributions.get(keeper.id)!.saves += 1;
      addEvent(events, { minute, type: "save", teamId: defendingTeam.id, playerId: keeper.id, secondaryPlayerId: shooter.id, detail: `${keeper.name} makes the save` });
    }

    const tacklingBase = defendingTeam.tactics.tackling === "hard" ? 0.055 : defendingTeam.tactics.tackling === "careful" ? 0.025 : 0.038;
    if (random.chance(tacklingBase)) {
      const defender = random.pick(defendingTeam.starters.filter((p) => p.primaryPosition !== "GK"));
      const defenderContribution = contributions.get(defender.id)!;
      defenceStats.fouls += 1;
      defenderContribution.fouls += 1;
      addEvent(events, { minute, type: "foul", teamId: defendingTeam.id, playerId: defender.id, detail: `${defender.name} commits a foul` });
      const cardChance = defendingTeam.tactics.tackling === "hard" ? 0.28 : defendingTeam.tactics.tackling === "careful" ? 0.11 : 0.18;
      if (random.chance(cardChance)) {
        defenceStats.yellowCards += 1;
        defenderContribution.yellowCards += 1;
        addEvent(events, { minute, type: "yellow-card", teamId: defendingTeam.id, playerId: defender.id, detail: `${defender.name} is booked` });
      }
    }
  }

  for (const contribution of contributions.values()) {
    const raw =
      6 +
      contribution.goals * 0.9 +
      contribution.assists * 0.45 +
      contribution.chancesCreated * 0.08 +
      contribution.progressionActions * 0.015 +
      contribution.defensiveActions * 0.04 +
      contribution.saves * 0.12 -
      contribution.majorErrors * 0.6 -
      contribution.redCards * 1.2 -
      contribution.yellowCards * 0.08;
    contribution.rating = Math.round(clamp(raw, 1, 10) * 10) / 10;
  }

  events.push({ minute: 90, type: "full-time", detail: `Full-time: ${input.home.name} ${homeStats.goals}-${awayStats.goals} ${input.away.name}` });

  return {
    seed: input.seed,
    homeTeamId: input.home.id,
    awayTeamId: input.away.id,
    home: homeStats,
    away: awayStats,
    events,
    contributions: [...contributions.values()],
  };
}

export function validateMatchInput(input: MatchInput): void {
  for (const team of [input.home, input.away]) {
    if (team.starters.length !== 11) throw new Error(`${team.name} must have exactly 11 starters`);
    if (team.starters.filter((p) => p.primaryPosition === "GK").length !== 1) throw new Error(`${team.name} must have exactly one starting goalkeeper`);
    const ids = new Set([...team.starters, ...team.substitutes].map((p) => p.id));
    if (ids.size !== team.starters.length + team.substitutes.length) throw new Error(`${team.name} contains duplicate player ids`);
  }
}
