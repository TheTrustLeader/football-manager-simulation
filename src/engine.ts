import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { SeededRandom } from "./random.js";
import type { MatchEvent, MatchInput, MatchOutput, Player, PlayerContribution, TeamInput, TeamStats } from "./types.js";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function average(values: number[], label: string): number {
  if (values.length === 0) throw new Error(`Cannot average empty ${label}`);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function effectiveAttribute(player: Player, key: keyof Player["attributes"]): number {
  const c = ENGINE_CONFIG;
  const condition = c.condition.base + c.condition.range * clamp(player.state.condition / c.condition.scale, 0, 1);
  const form = 1 + clamp(player.state.recentForm, -c.form.maxMagnitude, c.form.maxMagnitude) * c.form.effect;
  return player.attributes[key] * condition * form * c.morale[player.state.morale];
}

function teamProfile(team: TeamInput) {
  const c = ENGINE_CONFIG;
  const xi = team.starters;
  const passing = average(xi.map((player) => effectiveAttribute(player, "passing")), "passing attributes");
  const creativity = average(xi.map((player) => effectiveAttribute(player, "creativity")), "creativity attributes");
  const pace = average(xi.map((player) => effectiveAttribute(player, "pace")), "pace attributes");
  const aerial = average(xi.map((player) => effectiveAttribute(player, "aerial")), "aerial attributes");
  const forwards = xi.filter((player) => player.primaryPosition === "FW");
  const finishing = average(forwards.map((player) => effectiveAttribute(player, "finishing")), "forward finishing attributes");
  const defending = average(xi.map((player) => effectiveAttribute(player, "defending")), "defending attributes");
  const goalkeeperPlayer = xi.find((player) => player.primaryPosition === "GK");
  if (!goalkeeperPlayer) throw new Error(`${team.name} has no starting goalkeeper`);
  const goalkeeper = effectiveAttribute(goalkeeperPlayer, "goalkeeping");

  let retention = passing * c.profileWeights.retention.passing + creativity * c.profileWeights.retention.creativity;
  let progression = passing * c.profileWeights.progression.passing + creativity * c.profileWeights.progression.creativity + pace * c.profileWeights.progression.pace + aerial * c.profileWeights.progression.aerial;
  let attack = creativity * c.profileWeights.attack.creativity + pace * c.profileWeights.attack.pace + finishing * c.profileWeights.attack.finishing + aerial * c.profileWeights.attack.aerial;
  let defence = defending * c.profileWeights.defence.defending + pace * c.profileWeights.defence.pace + aerial * c.profileWeights.defence.aerial;

  const formation = c.formation[team.tactics.formation];
  retention *= formation.retention;
  progression *= formation.progression;
  attack *= formation.attack;
  defence *= formation.defence;

  const style = c.style[team.tactics.style];
  retention *= style.retention;
  progression *= style.progression;
  attack *= style.attack;

  if (team.tactics.style === "direct") {
    progression *= 1 + clamp((aerial - c.style.attributeBaseline) / c.style.attributeDivisor, c.style.attributeMin, c.style.attributeMax);
  } else if (team.tactics.style === "counter") {
    attack *= 1 + clamp((pace - c.style.attributeBaseline) / c.style.attributeDivisor, c.style.attributeMin, c.style.attributeMax);
  }

  const approach = c.approach[team.tactics.approach];
  attack *= approach.attack;
  defence *= approach.defence;
  return { retention, progression, attack, defence, goalkeeper };
}

function emptyStats(): TeamStats {
  return { goals: 0, shots: 0, shotsOnTarget: 0, chances: 0, possessionTicks: 0, fouls: 0, yellowCards: 0, redCards: 0 };
}

function createContribution(player: Player, starter: boolean): PlayerContribution {
  return { playerId: player.id, minutesPlayed: starter ? ENGINE_CONFIG.matchMinutes : 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, chancesCreated: 0, progressionActions: 0, defensiveActions: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0, majorErrors: 0, rating: ENGINE_CONFIG.ratings.baseline };
}

function contributionFor(contributions: Map<string, PlayerContribution>, player: Player): PlayerContribution {
  const contribution = contributions.get(player.id);
  if (!contribution) throw new Error(`Missing contribution record for ${player.id}`);
  return contribution;
}

function chooseAttacker(random: SeededRandom, team: TeamInput): Player {
  const forwards = team.starters.filter((player) => player.primaryPosition === "FW");
  if (forwards.length === 0) throw new Error(`${team.name} has no starting forward`);
  return random.pick(forwards);
}

function chooseCreator(random: SeededRandom, team: TeamInput): Player {
  const designated = team.starters.find((player) => player.id === team.tactics.creatorId);
  if (designated && random.chance(ENGINE_CONFIG.creator.designatedShare)) return designated;
  const candidates = team.starters.filter((player) => player.primaryPosition === "MF" || player.primaryPosition === "FW");
  if (candidates.length === 0) throw new Error(`${team.name} has no eligible creator`);
  return random.pick(candidates);
}

export function simulateMatch(input: MatchInput): MatchOutput {
  validateMatchInput(input);
  const c = ENGINE_CONFIG;
  const random = new SeededRandom(input.seed);
  const homeProfile = teamProfile(input.home);
  const awayProfile = teamProfile(input.away);
  const homeStats = emptyStats();
  const awayStats = emptyStats();
  const events: MatchEvent[] = [{ minute: 0, type: "kick-off", detail: "Kick-off" }];
  const contributions = new Map<string, PlayerContribution>();
  for (const team of [input.home, input.away]) {
    for (const player of team.starters) contributions.set(player.id, createContribution(player, true));
    for (const player of team.substitutes) contributions.set(player.id, createContribution(player, false));
  }

  for (let minute = 1; minute <= c.matchMinutes; minute += 1) {
    const homePossession = input.neutralVenue ? c.neutralPossession : c.homePossessionBase;
    const retentionDelta = (homeProfile.retention - awayProfile.retention) / c.retentionDeltaDivisor;
    const homeHasBall = random.chance(clamp(homePossession + retentionDelta, c.possessionMin, c.possessionMax));
    const attackingTeam = homeHasBall ? input.home : input.away;
    const defendingTeam = homeHasBall ? input.away : input.home;
    const attackProfile = homeHasBall ? homeProfile : awayProfile;
    const defenceProfile = homeHasBall ? awayProfile : homeProfile;
    const attackStats = homeHasBall ? homeStats : awayStats;
    const defenceStats = homeHasBall ? awayStats : homeStats;
    attackStats.possessionTicks += 1;

    const progressionProbability = clamp(c.progression.base + (attackProfile.progression - defenceProfile.defence) / c.progression.differenceDivisor, c.progression.min, c.progression.max);
    if (!random.chance(progressionProbability)) continue;
    const creator = chooseCreator(random, attackingTeam);
    contributionFor(contributions, creator).progressionActions += 1;

    const chanceProbability = clamp(c.chance.base + (attackProfile.attack - defenceProfile.defence) / c.chance.differenceDivisor, c.chance.min, c.chance.max);
    if (!random.chance(chanceProbability)) continue;
    attackStats.chances += 1;
    contributionFor(contributions, creator).chancesCreated += 1;
    events.push({ minute, type: "chance", teamId: attackingTeam.id, playerId: creator.id, detail: `${attackingTeam.name} create a chance` });

    const shooter = chooseAttacker(random, attackingTeam);
    const shooterContribution = contributionFor(contributions, shooter);
    attackStats.shots += 1;
    shooterContribution.shots += 1;
    const onTargetProbability = clamp(c.onTarget.base + (effectiveAttribute(shooter, "finishing") - c.onTarget.finishingBaseline) / c.onTarget.finishingDivisor, c.onTarget.min, c.onTarget.max);
    if (!random.chance(onTargetProbability)) {
      events.push({ minute, type: "shot", teamId: attackingTeam.id, playerId: shooter.id, detail: `${shooter.name} shoots wide` });
      continue;
    }

    attackStats.shotsOnTarget += 1;
    shooterContribution.shotsOnTarget += 1;
    const goalProbability = clamp(c.goal.base + (effectiveAttribute(shooter, "finishing") - defenceProfile.goalkeeper) / c.goal.finishingGoalkeeperDivisor, c.goal.min, c.goal.max);
    if (random.chance(goalProbability)) {
      attackStats.goals += 1;
      shooterContribution.goals += 1;
      if (creator.id !== shooter.id) contributionFor(contributions, creator).assists += 1;
      events.push({ minute, type: "goal", teamId: attackingTeam.id, playerId: shooter.id, secondaryPlayerId: creator.id, detail: `${shooter.name} scores` });
    } else {
      const keeper = defendingTeam.starters.find((player) => player.primaryPosition === "GK");
      if (!keeper) throw new Error(`${defendingTeam.name} has no starting goalkeeper`);
      contributionFor(contributions, keeper).saves += 1;
      events.push({ minute, type: "save", teamId: defendingTeam.id, playerId: keeper.id, secondaryPlayerId: shooter.id, detail: `${keeper.name} makes the save` });
    }

    const foulProbability = defendingTeam.tactics.tackling === "hard" ? c.tackling.hardFoul : defendingTeam.tactics.tackling === "careful" ? c.tackling.carefulFoul : c.tackling.normalFoul;
    if (random.chance(foulProbability)) {
      const outfield = defendingTeam.starters.filter((player) => player.primaryPosition !== "GK");
      if (outfield.length === 0) throw new Error(`${defendingTeam.name} has no outfield players`);
      const defender = random.pick(outfield);
      const defenderContribution = contributionFor(contributions, defender);
      defenceStats.fouls += 1;
      defenderContribution.fouls += 1;
      events.push({ minute, type: "foul", teamId: defendingTeam.id, playerId: defender.id, detail: `${defender.name} commits a foul` });
      const cardProbability = defendingTeam.tactics.tackling === "hard" ? c.tackling.hardCard : defendingTeam.tactics.tackling === "careful" ? c.tackling.carefulCard : c.tackling.normalCard;
      if (random.chance(cardProbability)) {
        defenceStats.yellowCards += 1;
        defenderContribution.yellowCards += 1;
        events.push({ minute, type: "yellow-card", teamId: defendingTeam.id, playerId: defender.id, detail: `${defender.name} is booked` });
      }
    }
  }

  for (const contribution of contributions.values()) {
    const r = c.ratings;
    const raw = r.baseline + contribution.goals * r.goal + contribution.assists * r.assist + contribution.shotsOnTarget * r.shotOnTarget + contribution.chancesCreated * r.chanceCreated + contribution.progressionActions * r.progressionAction + contribution.defensiveActions * r.defensiveAction + contribution.saves * r.save + contribution.majorErrors * r.majorError + contribution.redCards * r.redCard + contribution.yellowCards * r.yellowCard;
    contribution.rating = Math.round(clamp(raw, r.min, r.max) * r.precision) / r.precision;
  }

  events.push({ minute: c.matchMinutes, type: "full-time", detail: `Full-time: ${input.home.name} ${homeStats.goals}-${awayStats.goals} ${input.away.name}` });
  return { seed: input.seed, engineConfigVersion: c.version, engineConfigHash: ENGINE_CONFIG_HASH, homeTeamId: input.home.id, awayTeamId: input.away.id, home: homeStats, away: awayStats, events, contributions: [...contributions.values()] };
}

export function validateMatchInput(input: MatchInput): void {
  for (const team of [input.home, input.away]) {
    if (team.starters.length !== 11) throw new Error(`${team.name} must have exactly 11 starters`);
    if (team.starters.filter((player) => player.primaryPosition === "GK").length !== 1) throw new Error(`${team.name} must have exactly one starting goalkeeper`);
    if (team.starters.filter((player) => player.primaryPosition === "FW").length === 0) throw new Error(`${team.name} must have at least one starting forward`);
    const ids = new Set([...team.starters, ...team.substitutes].map((player) => player.id));
    if (ids.size !== team.starters.length + team.substitutes.length) throw new Error(`${team.name} contains duplicate player ids`);
  }
}
