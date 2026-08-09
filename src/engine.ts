import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { SeededRandom } from "./random.js";
import type { MatchEvent, MatchInput, MatchOutput, Player, PlayerContribution, TeamInput, TeamStats } from "./types.js";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function average(values: number[], label: string): number {
  if (values.length === 0) throw new Error(`Cannot average empty ${label}`);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function conditionFor(player: Player, conditions: Map<string, number>): number {
  const value = conditions.get(player.id);
  if (value === undefined) throw new Error(`Missing condition state for ${player.id}`);
  return value;
}

function effectiveAttribute(player: Player, key: keyof Player["attributes"], conditions: Map<string, number>): number {
  const c = ENGINE_CONFIG;
  const conditionValue = conditionFor(player, conditions);
  const condition = c.condition.base + c.condition.range * clamp(conditionValue / c.condition.scale, 0, 1);
  const form = 1 + clamp(player.state.recentForm, -c.form.maxMagnitude, c.form.maxMagnitude) * c.form.effect;
  return player.attributes[key] * condition * form * c.morale[player.state.morale];
}

function teamProfile(team: TeamInput, conditions: Map<string, number>) {
  const c = ENGINE_CONFIG;
  const xi = team.starters;
  const passing = average(xi.map((p) => effectiveAttribute(p, "passing", conditions)), "passing attributes");
  const creativity = average(xi.map((p) => effectiveAttribute(p, "creativity", conditions)), "creativity attributes");
  const pace = average(xi.map((p) => effectiveAttribute(p, "pace", conditions)), "pace attributes");
  const aerial = average(xi.map((p) => effectiveAttribute(p, "aerial", conditions)), "aerial attributes");
  const forwards = xi.filter((p) => p.primaryPosition === "FW");
  const finishing = average(forwards.map((p) => effectiveAttribute(p, "finishing", conditions)), "forward finishing attributes");
  const defending = average(xi.map((p) => effectiveAttribute(p, "defending", conditions)), "defending attributes");
  const keeper = xi.find((p) => p.primaryPosition === "GK");
  if (!keeper) throw new Error(`${team.name} has no starting goalkeeper`);
  const goalkeeping = effectiveAttribute(keeper, "goalkeeping", conditions);

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
  if (team.tactics.style === "direct") progression *= 1 + clamp((aerial - c.style.attributeBaseline) / c.style.attributeDivisor, c.style.attributeMin, c.style.attributeMax);
  if (team.tactics.style === "counter") attack *= 1 + clamp((pace - c.style.attributeBaseline) / c.style.attributeDivisor, c.style.attributeMin, c.style.attributeMax);

  const approach = c.approach[team.tactics.approach];
  return { retention, progression, attack: attack * approach.attack, defence: defence * approach.defence, goalkeeper: goalkeeping };
}

function emptyStats(): TeamStats {
  return { goals: 0, shots: 0, shotsOnTarget: 0, chances: 0, possessionTicks: 0, fouls: 0, yellowCards: 0, redCards: 0 };
}

function createContribution(player: Player, starter: boolean): PlayerContribution {
  return { playerId: player.id, minutesPlayed: starter ? ENGINE_CONFIG.matchMinutes : 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, chancesCreated: 0, progressionActions: 0, defensiveActions: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0, majorErrors: 0, rating: ENGINE_CONFIG.ratings.baseline };
}

function contributionFor(map: Map<string, PlayerContribution>, player: Player): PlayerContribution {
  const value = map.get(player.id);
  if (!value) throw new Error(`Missing contribution record for ${player.id}`);
  return value;
}

function outfieldPlayers(team: TeamInput): Player[] {
  const players = team.starters.filter((p) => p.primaryPosition !== "GK");
  if (players.length === 0) throw new Error(`${team.name} has no outfield players`);
  return players;
}

function creditDefensiveStop(random: SeededRandom, team: TeamInput, contributions: Map<string, PlayerContribution>): void {
  if (random.chance(ENGINE_CONFIG.defending.stopCreditShare)) contributionFor(contributions, random.pick(outfieldPlayers(team))).defensiveActions += 1;
}

function chooseAttacker(random: SeededRandom, team: TeamInput): Player {
  const forwards = team.starters.filter((p) => p.primaryPosition === "FW");
  if (forwards.length === 0) throw new Error(`${team.name} has no starting forward`);
  return random.pick(forwards);
}

function chooseCreator(random: SeededRandom, team: TeamInput): Player {
  const designated = team.starters.find((p) => p.id === team.tactics.creatorId);
  if (designated && random.chance(ENGINE_CONFIG.creator.designatedShare)) return designated;
  const candidates = team.starters.filter((p) => p.primaryPosition === "MF" || p.primaryPosition === "FW");
  if (candidates.length === 0) throw new Error(`${team.name} has no eligible creator`);
  return random.pick(candidates);
}

function fatiguePhaseMultiplier(minute: number): number {
  const phases = ENGINE_CONFIG.fatigue.phaseMultiplier;
  if (minute <= 45) return phases.firstHalf;
  if (minute <= 60) return phases.minutes46To60;
  if (minute <= 75) return phases.minutes61To75;
  return phases.minutes76To90;
}

function applyFatigue(team: TeamInput, conditions: Map<string, number>, minute: number): void {
  const f = ENGINE_CONFIG.fatigue;
  const approachMultiplier = f.approachMultiplier[team.tactics.approach];
  const phaseMultiplier = fatiguePhaseMultiplier(minute);
  for (const player of team.starters) {
    const current = conditionFor(player, conditions);
    const staminaFactor = Math.max(0.65, 1 + (f.staminaBaseline - player.attributes.stamina) * f.staminaSensitivity);
    const loss = f.baseConditionLossPerMinute * phaseMultiplier * approachMultiplier * staminaFactor;
    conditions.set(player.id, Math.max(f.minimumCondition, current - loss));
  }
}

export function simulateMatch(input: MatchInput): MatchOutput {
  validateMatchInput(input);
  const c = ENGINE_CONFIG;
  const random = new SeededRandom(input.seed);
  const homeAdvantageApplied = !input.neutralVenue;
  const awayTravelConditionPenalty = homeAdvantageApplied ? c.homeAdvantage.awayTravelConditionPenalty : 0;
  const homeProgressionProbabilityBoost = homeAdvantageApplied ? c.homeAdvantage.homeProgressionProbabilityBoost : 0;
  const awayDefendingFoulProbabilityAdd = homeAdvantageApplied ? c.homeAdvantage.awayDefendingFoulProbabilityAdd : 0;

  const conditions = new Map<string, number>();
  for (const player of [...input.home.starters, ...input.home.substitutes]) conditions.set(player.id, player.state.condition);
  for (const player of [...input.away.starters, ...input.away.substitutes]) conditions.set(player.id, clamp(player.state.condition - awayTravelConditionPenalty, 0, c.condition.scale));

  const homeStats = emptyStats();
  const awayStats = emptyStats();
  const events: MatchEvent[] = [{ minute: 0, type: "kick-off", detail: "Kick-off" }];
  const contributions = new Map<string, PlayerContribution>();
  for (const team of [input.home, input.away]) {
    for (const player of team.starters) contributions.set(player.id, createContribution(player, true));
    for (const player of team.substitutes) contributions.set(player.id, createContribution(player, false));
  }

  for (let minute = 1; minute <= c.matchMinutes; minute += 1) {
    const homeProfile = teamProfile(input.home, conditions);
    const awayProfile = teamProfile(input.away, conditions);
    const retentionDelta = (homeProfile.retention - awayProfile.retention) / c.retentionDeltaDivisor;
    const homeHasBall = random.chance(clamp(c.possessionBase + retentionDelta, c.possessionMin, c.possessionMax));
    const attackingTeam = homeHasBall ? input.home : input.away;
    const defendingTeam = homeHasBall ? input.away : input.home;
    const attackProfile = homeHasBall ? homeProfile : awayProfile;
    const defenceProfile = homeHasBall ? awayProfile : homeProfile;
    const attackStats = homeHasBall ? homeStats : awayStats;
    const defenceStats = homeHasBall ? awayStats : homeStats;
    const style = c.style[attackingTeam.tactics.style];
    attackStats.possessionTicks += 1;

    const progressionProbability = clamp(c.progression.base + (homeHasBall ? homeProgressionProbabilityBoost : 0) + (attackProfile.progression - defenceProfile.defence) / c.progression.differenceDivisor, c.progression.min, c.progression.max);
    if (!random.chance(progressionProbability)) {
      creditDefensiveStop(random, defendingTeam, contributions);
      applyFatigue(input.home, conditions, minute);
      applyFatigue(input.away, conditions, minute);
      continue;
    }

    const creator = chooseCreator(random, attackingTeam);
    contributionFor(contributions, creator).progressionActions += 1;
    const errorDefender = random.pick(outfieldPlayers(defendingTeam));
    const majorError = random.chance(c.defending.majorErrorChance);
    if (majorError) {
      contributionFor(contributions, errorDefender).majorErrors += 1;
      events.push({ minute, type: "attack", teamId: defendingTeam.id, playerId: errorDefender.id, detail: `${errorDefender.name} makes a major error` });
    }

    const chanceProbability = clamp((c.chance.base + (attackProfile.attack - defenceProfile.defence) / c.chance.differenceDivisor) * style.chanceRate, c.chance.min, c.chance.max);
    if (!majorError && !random.chance(chanceProbability)) {
      creditDefensiveStop(random, defendingTeam, contributions);
      applyFatigue(input.home, conditions, minute);
      applyFatigue(input.away, conditions, minute);
      continue;
    }

    attackStats.chances += 1;
    contributionFor(contributions, creator).chancesCreated += 1;
    events.push({ minute, type: "chance", teamId: attackingTeam.id, playerId: creator.id, detail: `${attackingTeam.name} create a chance` });
    if (random.chance(clamp(c.shot.base * style.shotRate, c.shot.min, c.shot.max))) {
      const shooter = chooseAttacker(random, attackingTeam);
      const shooterContribution = contributionFor(contributions, shooter);
      attackStats.shots += 1;
      shooterContribution.shots += 1;
      const onTargetProbability = clamp(c.onTarget.base + (effectiveAttribute(shooter, "finishing", conditions) - c.onTarget.finishingBaseline) / c.onTarget.finishingDivisor, c.onTarget.min, c.onTarget.max);
      if (random.chance(onTargetProbability)) {
        attackStats.shotsOnTarget += 1;
        shooterContribution.shotsOnTarget += 1;
        const goalProbability = clamp((c.goal.base + (effectiveAttribute(shooter, "finishing", conditions) - defenceProfile.goalkeeper) / c.goal.finishingGoalkeeperDivisor) * style.shotQuality, c.goal.min, c.goal.max);
        if (random.chance(goalProbability)) {
          attackStats.goals += 1;
          shooterContribution.goals += 1;
          if (creator.id !== shooter.id) contributionFor(contributions, creator).assists += 1;
          events.push({ minute, type: "goal", teamId: attackingTeam.id, playerId: shooter.id, secondaryPlayerId: creator.id, detail: `${shooter.name} scores` });
        } else {
          const keeper = defendingTeam.starters.find((p) => p.primaryPosition === "GK");
          if (!keeper) throw new Error(`${defendingTeam.name} has no starting goalkeeper`);
          contributionFor(contributions, keeper).saves += 1;
          events.push({ minute, type: "save", teamId: defendingTeam.id, playerId: keeper.id, secondaryPlayerId: shooter.id, detail: `${keeper.name} makes the save` });
        }
      } else {
        events.push({ minute, type: "shot", teamId: attackingTeam.id, playerId: shooter.id, detail: `${shooter.name} shoots wide` });
      }
    } else {
      creditDefensiveStop(random, defendingTeam, contributions);
    }

    const baseFoul = defendingTeam.tactics.tackling === "hard" ? c.tackling.hardFoul : defendingTeam.tactics.tackling === "careful" ? c.tackling.carefulFoul : c.tackling.normalFoul;
    if (random.chance(baseFoul + (defendingTeam === input.away ? awayDefendingFoulProbabilityAdd : 0))) {
      const defender = random.pick(outfieldPlayers(defendingTeam));
      const dc = contributionFor(contributions, defender);
      defenceStats.fouls += 1;
      dc.fouls += 1;
      events.push({ minute, type: "foul", teamId: defendingTeam.id, playerId: defender.id, detail: `${defender.name} commits a foul` });
      const redP = defendingTeam.tactics.tackling === "hard" ? c.tackling.hardRed : defendingTeam.tactics.tackling === "careful" ? c.tackling.carefulRed : c.tackling.normalRed;
      if (random.chance(redP)) {
        defenceStats.redCards += 1;
        dc.redCards += 1;
        events.push({ minute, type: "red-card", teamId: defendingTeam.id, playerId: defender.id, detail: `${defender.name} is sent off` });
      } else {
        const yellowP = defendingTeam.tactics.tackling === "hard" ? c.tackling.hardCard : defendingTeam.tactics.tackling === "careful" ? c.tackling.carefulCard : c.tackling.normalCard;
        if (random.chance(yellowP)) {
          defenceStats.yellowCards += 1;
          dc.yellowCards += 1;
          events.push({ minute, type: "yellow-card", teamId: defendingTeam.id, playerId: defender.id, detail: `${defender.name} is booked` });
        }
      }
    }

    applyFatigue(input.home, conditions, minute);
    applyFatigue(input.away, conditions, minute);
  }

  for (const contribution of contributions.values()) {
    const r = c.ratings;
    const raw = r.baseline + contribution.goals * r.goal + contribution.assists * r.assist + contribution.shots * r.shot + contribution.shotsOnTarget * r.shotOnTarget + contribution.chancesCreated * r.chanceCreated + contribution.progressionActions * r.progressionAction + contribution.defensiveActions * r.defensiveAction + contribution.saves * r.save + contribution.majorErrors * r.majorError + contribution.redCards * r.redCard + contribution.yellowCards * r.yellowCard;
    contribution.rating = Math.round(clamp(raw, r.min, r.max) * r.precision) / r.precision;
  }

  events.push({ minute: c.matchMinutes, type: "full-time", detail: `Full-time: ${input.home.name} ${homeStats.goals}-${awayStats.goals} ${input.away.name}` });
  return {
    seed: input.seed,
    engineConfigVersion: c.version,
    engineConfigHash: ENGINE_CONFIG_HASH,
    homeTeamId: input.home.id,
    awayTeamId: input.away.id,
    home: homeStats,
    away: awayStats,
    events,
    contributions: [...contributions.values()],
    finalCondition: Object.fromEntries(conditions),
    diagnostics: {
      homeAdvantage: { applied: homeAdvantageApplied, homeProgressionProbabilityBoost, awayTravelConditionPenalty, awayDefendingFoulProbabilityAdd },
      fatigue: { applied: true, baseConditionLossPerMinute: c.fatigue.baseConditionLossPerMinute, minimumCondition: c.fatigue.minimumCondition },
    },
  };
}

export function validateMatchInput(input: MatchInput): void {
  for (const team of [input.home, input.away]) {
    if (team.starters.length !== 11) throw new Error(`${team.name} must have exactly 11 starters`);
    if (team.starters.filter((p) => p.primaryPosition === "GK").length !== 1) throw new Error(`${team.name} must have exactly one starting goalkeeper`);
    if (team.starters.filter((p) => p.primaryPosition === "FW").length === 0) throw new Error(`${team.name} must have at least one starting forward`);
    const ids = new Set([...team.starters, ...team.substitutes].map((p) => p.id));
    if (ids.size !== team.starters.length + team.substitutes.length) throw new Error(`${team.name} contains duplicate player ids`);
  }
}
