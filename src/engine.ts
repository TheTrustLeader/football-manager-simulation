import { ENGINE_CONFIG, ENGINE_CONFIG_HASH } from "./engine-config.js";
import { SeededRandom } from "./random.js";
import type { MatchEvent, MatchInput, MatchOutput, Player, PlayerContribution, TeamInput, TeamStats } from "./types.js";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

interface PlayerRuntime {
  player: Player;
  initialCondition: number;
  lossPerWorkload: number;
  floorBreakpoint: number;
  formFactor: number;
  moraleFactor: number;
  exitWorkload?: number;
}

interface AttributeCurveEntry {
  weight: number;
  initialCondition: number;
  lossPerWorkload: number;
  floorBreakpoint: number;
}

interface AttributeCurve {
  count: number;
  sumWeight: number;
  totalWeightedInitialCondition: number;
  totalWeightedLossPerWorkload: number;
  affineIntercept: number;
  affineSlope: number;
  minimumFloorBreakpoint: number;
  entries: AttributeCurveEntry[];
}

interface ProfileCurves {
  passing: AttributeCurve;
  creativity: AttributeCurve;
  pace: AttributeCurve;
  aerial: AttributeCurve;
  finishing: AttributeCurve;
  defending: AttributeCurve;
  goalkeeping: AttributeCurve;
}

interface TeamRuntime {
  workload: number;
  players: Map<string, PlayerRuntime>;
  activePlayers: PlayerRuntime[];
  curves: ProfileCurves;
}

function conditionFor(player: Player, conditions: Map<string, number>): number {
  const value = conditions.get(player.id);
  if (value === undefined) throw new Error(`Missing condition state for ${player.id}`);
  return value;
}

function createPlayerRuntime(player: Player, initialCondition: number): PlayerRuntime {
  const c = ENGINE_CONFIG;
  const f = c.fatigue;
  const staminaFactor = Math.max(0.65, 1 + (f.staminaBaseline - player.attributes.stamina) * f.staminaSensitivity);
  const lossPerWorkload = f.baseConditionLossPerMinute * staminaFactor;
  const floorBreakpoint = lossPerWorkload === 0 ? Number.POSITIVE_INFINITY : Math.max(0, (initialCondition - f.minimumCondition) / lossPerWorkload);
  return {
    player,
    initialCondition,
    lossPerWorkload,
    floorBreakpoint,
    formFactor: 1 + clamp(player.state.recentForm, -c.form.maxMagnitude, c.form.maxMagnitude) * c.form.effect,
    moraleFactor: c.morale[player.state.morale],
  };
}

function createAttributeCurve(players: PlayerRuntime[], key: keyof Player["attributes"]): AttributeCurve {
  if (players.length === 0) throw new Error(`Cannot build empty ${String(key)} attribute curve`);
  const entries: AttributeCurveEntry[] = [];
  let sumWeight = 0;
  let totalWeightedInitialCondition = 0;
  let totalWeightedLossPerWorkload = 0;
  let minimumFloorBreakpoint = Number.POSITIVE_INFINITY;

  for (const runtime of players) {
    const weight = runtime.player.attributes[key] * runtime.formFactor * runtime.moraleFactor;
    entries.push({
      weight,
      initialCondition: runtime.initialCondition,
      lossPerWorkload: runtime.lossPerWorkload,
      floorBreakpoint: runtime.floorBreakpoint,
    });
    sumWeight += weight;
    totalWeightedInitialCondition += weight * runtime.initialCondition;
    totalWeightedLossPerWorkload += weight * runtime.lossPerWorkload;
    minimumFloorBreakpoint = Math.min(minimumFloorBreakpoint, runtime.floorBreakpoint);
  }

  const condition = ENGINE_CONFIG.condition;
  const scaledRange = condition.range / condition.scale;
  return {
    count: players.length,
    sumWeight,
    totalWeightedInitialCondition,
    totalWeightedLossPerWorkload,
    affineIntercept: (condition.base * sumWeight + scaledRange * totalWeightedInitialCondition) / players.length,
    affineSlope: (scaledRange * totalWeightedLossPerWorkload) / players.length,
    minimumFloorBreakpoint,
    entries,
  };
}

function buildProfileCurves(players: PlayerRuntime[]): ProfileCurves {
  if (players.length === 0) throw new Error("Cannot build a team profile with no active players");
  const outfield = players.filter((runtime) => runtime.player.primaryPosition !== "GK");
  const forwards = players.filter((runtime) => runtime.player.primaryPosition === "FW");
  const keepers = players.filter((runtime) => runtime.player.primaryPosition === "GK");
  if (keepers.length === 0) throw new Error("Active team has no goalkeeper");
  const finishers = forwards.length > 0 ? forwards : outfield;
  if (finishers.length === 0) throw new Error("Active team has no eligible finisher");
  return {
    passing: createAttributeCurve(players, "passing"),
    creativity: createAttributeCurve(players, "creativity"),
    pace: createAttributeCurve(players, "pace"),
    aerial: createAttributeCurve(players, "aerial"),
    finishing: createAttributeCurve(finishers, "finishing"),
    defending: createAttributeCurve(players, "defending"),
    goalkeeping: createAttributeCurve(keepers, "goalkeeping"),
  };
}

function createTeamRuntime(team: TeamInput, conditions: Map<string, number>): TeamRuntime {
  const players = team.starters.map((player) => createPlayerRuntime(player, conditionFor(player, conditions)));
  return {
    workload: 0,
    players: new Map(players.map((runtime) => [runtime.player.id, runtime])),
    activePlayers: [...players],
    curves: buildProfileCurves(players),
  };
}

function weightedCondition(curve: AttributeCurve, workload: number): number {
  const floor = ENGINE_CONFIG.fatigue.minimumCondition;
  let total = 0;
  for (const entry of curve.entries) {
    const condition = workload >= entry.floorBreakpoint
      ? floor
      : entry.initialCondition - workload * entry.lossPerWorkload;
    total += entry.weight * condition;
  }
  return total;
}

function curveAverage(curve: AttributeCurve, workload: number): number {
  if (workload === 0 || workload < curve.minimumFloorBreakpoint) {
    return curve.affineIntercept - workload * curve.affineSlope;
  }
  const c = ENGINE_CONFIG.condition;
  const conditionWeighted = weightedCondition(curve, workload);
  return (c.base * curve.sumWeight + (c.range / c.scale) * conditionWeighted) / curve.count;
}

function teamProfile(team: TeamInput, runtime: TeamRuntime) {
  const c = ENGINE_CONFIG;
  const passing = curveAverage(runtime.curves.passing, runtime.workload);
  const creativity = curveAverage(runtime.curves.creativity, runtime.workload);
  const pace = curveAverage(runtime.curves.pace, runtime.workload);
  const aerial = curveAverage(runtime.curves.aerial, runtime.workload);
  const finishing = curveAverage(runtime.curves.finishing, runtime.workload);
  const defending = curveAverage(runtime.curves.defending, runtime.workload);
  const goalkeeping = curveAverage(runtime.curves.goalkeeping, runtime.workload);

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
  const manpower = Math.pow(runtime.activePlayers.length / c.dismissal.baselinePlayers, c.dismissal.profileExponent);
  return {
    retention: retention * manpower,
    progression: progression * manpower,
    attack: attack * approach.attack * manpower,
    defence: defence * approach.defence * manpower,
    goalkeeper: goalkeeping,
  };
}

function playerCondition(runtime: TeamRuntime, playerRuntime: PlayerRuntime): number {
  const workload = playerRuntime.exitWorkload ?? runtime.workload;
  if (workload === 0) return playerRuntime.initialCondition;
  return Math.max(ENGINE_CONFIG.fatigue.minimumCondition, playerRuntime.initialCondition - workload * playerRuntime.lossPerWorkload);
}

function effectiveAttribute(runtime: TeamRuntime, player: Player, key: keyof Player["attributes"]): number {
  const prepared = runtime.players.get(player.id);
  if (!prepared) throw new Error(`Missing runtime state for ${player.id}`);
  const c = ENGINE_CONFIG.condition;
  const conditionFactor = c.base + c.range * clamp(playerCondition(runtime, prepared) / c.scale, 0, 1);
  return player.attributes[key] * conditionFactor * prepared.formFactor * prepared.moraleFactor;
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

function activeOutfield(runtime: TeamRuntime, teamName: string): Player[] {
  const players = runtime.activePlayers.filter((entry) => entry.player.primaryPosition !== "GK").map((entry) => entry.player);
  if (players.length === 0) throw new Error(`${teamName} has no active outfield players`);
  return players;
}

function pickDefenderByAbility(random: SeededRandom, runtime: TeamRuntime, candidates: Player[]): Player {
  const weighted = candidates.map((player) => ({
    player,
    weight: Math.max(ENGINE_CONFIG.defending.stopCreditWeightFloor, effectiveAttribute(runtime, player, "defending")),
  }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let target = random.next() * total;
  for (const entry of weighted) {
    target -= entry.weight;
    if (target < 0) return entry.player;
  }
  return weighted.at(-1)!.player;
}

function creditDefensiveStop(random: SeededRandom, team: TeamInput, runtime: TeamRuntime, contributions: Map<string, PlayerContribution>): void {
  if (!random.chance(ENGINE_CONFIG.defending.stopCreditShare)) return;
  const defender = pickDefenderByAbility(random, runtime, activeOutfield(runtime, team.name));
  contributionFor(contributions, defender).defensiveActions += 1;
}

function chooseAttacker(random: SeededRandom, team: TeamInput, runtime: TeamRuntime): Player {
  const active = runtime.activePlayers.map((entry) => entry.player);
  const forwards = active.filter((player) => player.primaryPosition === "FW");
  if (forwards.length > 0) return random.pick(forwards);
  return random.pick(activeOutfield(runtime, team.name));
}

function chooseCreator(random: SeededRandom, team: TeamInput, runtime: TeamRuntime): Player {
  const active = runtime.activePlayers.map((entry) => entry.player);
  const designated = active.find((player) => player.id === team.tactics.creatorId);
  if (designated && random.chance(ENGINE_CONFIG.creator.designatedShare)) return designated;
  const candidates = active.filter((player) => player.primaryPosition === "MF" || player.primaryPosition === "FW");
  if (candidates.length > 0) return random.pick(candidates);
  return random.pick(activeOutfield(runtime, team.name));
}

function fatiguePhaseMultiplier(minute: number): number {
  const phases = ENGINE_CONFIG.fatigue.phaseMultiplier;
  if (minute <= 45) return phases.firstHalf;
  if (minute <= 60) return phases.minutes46To60;
  if (minute <= 75) return phases.minutes61To75;
  return phases.minutes76To90;
}

function fatigueIncrement(team: TeamInput, minute: number): number {
  return fatiguePhaseMultiplier(minute) * ENGINE_CONFIG.fatigue.approachMultiplier[team.tactics.approach];
}

function advanceFatigue(runtime: TeamRuntime, team: TeamInput, minute: number): void {
  runtime.workload += fatigueIncrement(team, minute);
}

function sendOff(runtime: TeamRuntime, team: TeamInput, player: Player, minute: number, contribution: PlayerContribution): void {
  const playerRuntime = runtime.players.get(player.id);
  if (!playerRuntime) throw new Error(`Missing runtime state for dismissed player ${player.id}`);
  const index = runtime.activePlayers.findIndex((entry) => entry.player.id === player.id);
  if (index < 0) throw new Error(`${player.name} cannot be sent off twice`);
  playerRuntime.exitWorkload = runtime.workload + fatigueIncrement(team, minute);
  contribution.minutesPlayed = Math.min(contribution.minutesPlayed, minute);
  runtime.activePlayers.splice(index, 1);
  runtime.curves = buildProfileCurves(runtime.activePlayers);
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

  const homeRuntime = createTeamRuntime(input.home, conditions);
  const awayRuntime = createTeamRuntime(input.away, conditions);
  const homeStats = emptyStats();
  const awayStats = emptyStats();
  const events: MatchEvent[] = [{ minute: 0, type: "kick-off", detail: "Kick-off" }];
  const contributions = new Map<string, PlayerContribution>();
  for (const team of [input.home, input.away]) {
    for (const player of team.starters) contributions.set(player.id, createContribution(player, true));
    for (const player of team.substitutes) contributions.set(player.id, createContribution(player, false));
  }

  for (let minute = 1; minute <= c.matchMinutes; minute += 1) {
    const homeProfile = teamProfile(input.home, homeRuntime);
    const awayProfile = teamProfile(input.away, awayRuntime);
    const retentionDelta = (homeProfile.retention - awayProfile.retention) / c.retentionDeltaDivisor;
    const homeHasBall = random.chance(clamp(c.possessionBase + retentionDelta, c.possessionMin, c.possessionMax));
    const attackingTeam = homeHasBall ? input.home : input.away;
    const defendingTeam = homeHasBall ? input.away : input.home;
    const attackRuntime = homeHasBall ? homeRuntime : awayRuntime;
    const defenceRuntime = homeHasBall ? awayRuntime : homeRuntime;
    const attackProfile = homeHasBall ? homeProfile : awayProfile;
    const defenceProfile = homeHasBall ? awayProfile : homeProfile;
    const attackStats = homeHasBall ? homeStats : awayStats;
    const defenceStats = homeHasBall ? awayStats : homeStats;
    const style = c.style[attackingTeam.tactics.style];
    attackStats.possessionTicks += 1;

    const progressionProbability = clamp(c.progression.base + (homeHasBall ? homeProgressionProbabilityBoost : 0) + (attackProfile.progression - defenceProfile.defence) / c.progression.differenceDivisor, c.progression.min, c.progression.max);
    if (!random.chance(progressionProbability)) {
      creditDefensiveStop(random, defendingTeam, defenceRuntime, contributions);
      advanceFatigue(homeRuntime, input.home, minute);
      advanceFatigue(awayRuntime, input.away, minute);
      continue;
    }

    const creator = chooseCreator(random, attackingTeam, attackRuntime);
    contributionFor(contributions, creator).progressionActions += 1;
    const errorDefender = random.pick(activeOutfield(defenceRuntime, defendingTeam.name));
    const majorError = random.chance(c.defending.majorErrorChance);
    if (majorError) {
      contributionFor(contributions, errorDefender).majorErrors += 1;
      events.push({ minute, type: "attack", teamId: defendingTeam.id, playerId: errorDefender.id, detail: `${errorDefender.name} makes a major error` });
    }

    const chanceProbability = clamp((c.chance.base + (attackProfile.attack - defenceProfile.defence) / c.chance.differenceDivisor) * style.chanceRate, c.chance.min, c.chance.max);
    if (!majorError && !random.chance(chanceProbability)) {
      creditDefensiveStop(random, defendingTeam, defenceRuntime, contributions);
      advanceFatigue(homeRuntime, input.home, minute);
      advanceFatigue(awayRuntime, input.away, minute);
      continue;
    }

    attackStats.chances += 1;
    contributionFor(contributions, creator).chancesCreated += 1;
    events.push({ minute, type: "chance", teamId: attackingTeam.id, playerId: creator.id, detail: `${attackingTeam.name} create a chance` });
    if (random.chance(clamp(c.shot.base * style.shotRate, c.shot.min, c.shot.max))) {
      const shooter = chooseAttacker(random, attackingTeam, attackRuntime);
      const shooterContribution = contributionFor(contributions, shooter);
      attackStats.shots += 1;
      shooterContribution.shots += 1;
      const shooterFinishing = effectiveAttribute(attackRuntime, shooter, "finishing");
      const onTargetProbability = clamp(c.onTarget.base + (shooterFinishing - c.onTarget.finishingBaseline) / c.onTarget.finishingDivisor, c.onTarget.min, c.onTarget.max);
      if (random.chance(onTargetProbability)) {
        attackStats.shotsOnTarget += 1;
        shooterContribution.shotsOnTarget += 1;
        const goalProbability = clamp((c.goal.base + (shooterFinishing - defenceProfile.goalkeeper) / c.goal.finishingGoalkeeperDivisor) * style.shotQuality, c.goal.min, c.goal.max);
        if (random.chance(goalProbability)) {
          attackStats.goals += 1;
          shooterContribution.goals += 1;
          if (creator.id !== shooter.id) contributionFor(contributions, creator).assists += 1;
          events.push({ minute, type: "goal", teamId: attackingTeam.id, playerId: shooter.id, secondaryPlayerId: creator.id, detail: `${shooter.name} scores` });
        } else {
          const keeper = defenceRuntime.activePlayers.find((entry) => entry.player.primaryPosition === "GK")?.player;
          if (!keeper) throw new Error(`${defendingTeam.name} has no active goalkeeper`);
          contributionFor(contributions, keeper).saves += 1;
          events.push({ minute, type: "save", teamId: defendingTeam.id, playerId: keeper.id, secondaryPlayerId: shooter.id, detail: `${keeper.name} makes the save` });
        }
      } else {
        events.push({ minute, type: "shot", teamId: attackingTeam.id, playerId: shooter.id, detail: `${shooter.name} shoots wide` });
      }
    } else {
      creditDefensiveStop(random, defendingTeam, defenceRuntime, contributions);
    }

    const baseFoul = defendingTeam.tactics.tackling === "hard" ? c.tackling.hardFoul : defendingTeam.tactics.tackling === "careful" ? c.tackling.carefulFoul : c.tackling.normalFoul;
    if (random.chance(baseFoul + (defendingTeam === input.away ? awayDefendingFoulProbabilityAdd : 0))) {
      const defender = random.pick(activeOutfield(defenceRuntime, defendingTeam.name));
      const dc = contributionFor(contributions, defender);
      defenceStats.fouls += 1;
      dc.fouls += 1;
      events.push({ minute, type: "foul", teamId: defendingTeam.id, playerId: defender.id, detail: `${defender.name} commits a foul` });
      const redP = defendingTeam.tactics.tackling === "hard" ? c.tackling.hardRed : defendingTeam.tactics.tackling === "careful" ? c.tackling.carefulRed : c.tackling.normalRed;
      if (random.chance(redP)) {
        defenceStats.redCards += 1;
        dc.redCards += 1;
        events.push({ minute, type: "red-card", teamId: defendingTeam.id, playerId: defender.id, detail: `${defender.name} is sent off` });
        sendOff(defenceRuntime, defendingTeam, defender, minute, dc);
      } else {
        const yellowP = defendingTeam.tactics.tackling === "hard" ? c.tackling.hardCard : defendingTeam.tactics.tackling === "careful" ? c.tackling.carefulCard : c.tackling.normalCard;
        if (random.chance(yellowP)) {
          defenceStats.yellowCards += 1;
          dc.yellowCards += 1;
          events.push({ minute, type: "yellow-card", teamId: defendingTeam.id, playerId: defender.id, detail: `${defender.name} is booked` });
        }
      }
    }

    advanceFatigue(homeRuntime, input.home, minute);
    advanceFatigue(awayRuntime, input.away, minute);
  }

  for (const runtime of [homeRuntime, awayRuntime]) {
    for (const playerRuntime of runtime.players.values()) {
      conditions.set(playerRuntime.player.id, playerCondition(runtime, playerRuntime));
    }
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
