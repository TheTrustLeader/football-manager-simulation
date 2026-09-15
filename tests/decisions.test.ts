import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/engine-config.js";
import { buildSeasonPlayerStats } from "../src/competition.js";
import { simulateMatch } from "../src/engine.js";
import { makeTeam } from "../src/fixtures.js";
import type { MatchDecision, MatchInput, Player } from "../src/types.js";

function input(seed = 12345): MatchInput {
  return { seed, neutralVenue: true, home: makeTeam("decision-home"), away: makeTeam("decision-away") };
}

function decision(match: MatchInput, minute: number, off: Player, on: Player): MatchDecision {
  return { minute, teamId: match.home.id, type: "substitution", playerOff: off.id, playerOn: on.id };
}

function contribution(result: ReturnType<typeof simulateMatch>, playerId: string) {
  return result.contributions.find((entry) => entry.playerId === playerId)!;
}

describe("substitution decisions", () => {
  it("preserves every event and possession before the decision without drawing randomness", () => {
    const baselineInput = input(99881);
    const decidedInput = structuredClone(baselineInput);
    const minute = 20;
    decidedInput.decisions = [decision(
      decidedInput,
      minute,
      decidedInput.home.starters[1]!,
      decidedInput.home.substitutes[1]!,
    )];
    const baseline = simulateMatch(baselineInput);
    const decided = simulateMatch(decidedInput);
    expect(decided.events.filter((event) => event.minute < minute))
      .toEqual(baseline.events.filter((event) => event.minute < minute));
    expect(decided.possessionByMinute.slice(0, minute - 1))
      .toEqual(baseline.possessionByMinute.slice(0, minute - 1));
  });

  it("counts only an entrant's own minutes when they are later substituted (kills mutant 1)", () => {
    const match = input();
    const starter = match.home.starters[1]!;
    const firstEntrant = match.home.substitutes[1]!;
    const secondEntrant = match.home.substitutes[2]!;
    match.decisions = [
      decision(match, 20, starter, firstEntrant),
      decision(match, 40, firstEntrant, secondEntrant),
    ];

    const result = simulateMatch(match);
    expect(contribution(result, firstEntrant.id).minutesPlayed).toBe(20);
    expect(result.contributions
      .filter((entry) => [...match.home.starters, ...match.home.substitutes].some((player) => player.id === entry.playerId))
      .reduce((sum, entry) => sum + entry.minutesPlayed, 0)).toBe(990);
  });

  it("counts only an entrant's own minutes when they are sent off (kills mutant 2)", () => {
    let witness: { match: MatchInput; result: ReturnType<typeof simulateMatch>; entrant: Player; redMinute: number } | undefined;
    for (let seed = 1; seed <= 10_000 && !witness; seed += 1) {
      const match = input(seed);
      match.home.tactics.tackling = "hard";
      const entrant = match.home.substitutes[1]!;
      match.decisions = [decision(match, 20, match.home.starters[1]!, entrant)];
      const result = simulateMatch(match);
      const red = result.events.find((event) => event.type === "red-card" && event.playerId === entrant.id);
      if (red) witness = { match, result, entrant, redMinute: red.minute };
    }
    expect(witness, "expected a deterministic seed where the entrant is dismissed").toBeDefined();
    const { match, result, entrant, redMinute } = witness!;
    expect(contribution(result, entrant.id).minutesPlayed).toBe(redMinute - 20 + 1);
    expect(result.contributions
      .filter((entry) => [...match.home.starters, ...match.home.substitutes].some((player) => player.id === entry.playerId))
      .reduce((sum, entry) => sum + entry.minutesPlayed, 0)).toBe(990 - (90 - redMinute));
  });

  it("rejects an outfielder-to-goalkeeper replacement up front (kills mutant 3)", () => {
    const match = input();
    match.decisions = [decision(match, 20, match.home.starters[1]!, match.home.substitutes[0]!)];
    expect(() => simulateMatch(match)).toThrow(/goalkeeper may only be replaced by a goalkeeper/i);
  });

  it("keeps exactly one active goalkeeper after a valid keeper replacement", () => {
    const match = input();
    match.decisions = [decision(match, 20, match.home.starters[0]!, match.home.substitutes[0]!)];
    const result = simulateMatch(match);
    const keeperIds = new Set([...match.home.starters, ...match.home.substitutes]
      .filter((player) => player.primaryPosition === "GK").map((player) => player.id));
    for (const snapshot of result.minuteSnapshots) {
      expect(snapshot.players.filter((player) => keeperIds.has(player.playerId))).toHaveLength(1);
    }
  });

  it("uses the entrant's sharply different attributes in match play (kills mutant 5)", () => {
    let changed = false;
    for (let seed = 1; seed <= 100 && !changed; seed += 1) {
      const baselineInput = input(seed);
      const decidedInput = structuredClone(baselineInput);
      const off = decidedInput.home.starters[1]!;
      const on = decidedInput.home.substitutes[1]!;
      on.attributes = Object.fromEntries(Object.keys(on.attributes).map((key) => [key, 20])) as unknown as Player["attributes"];
      decidedInput.decisions = [decision(decidedInput, 20, off, on)];
      const baseline = simulateMatch(baselineInput);
      const decided = simulateMatch(decidedInput);
      changed = decided.possessionByMinute.slice(19).some((teamId, index) => teamId !== baseline.possessionByMinute[index + 19]);
    }
    expect(changed, "expected the extreme entrant to alter at least one post-entry possession").toBe(true);
  });

  it("starts an entrant's fatigue curve at their supplied condition (kills mutant 4)", () => {
    const match = input();
    const on = match.home.substitutes[1]!;
    on.state.condition = 91;
    match.decisions = [decision(match, 20, match.home.starters[1]!, on)];
    const result = simulateMatch(match);
    const observed = result.minuteSnapshots[19]!.players.find((player) => player.playerId === on.id)!.condition;
    const stamina = (on.attributes as { stamina: number }).stamina;
    const staminaFactor = Math.max(0.65, 1 + (ENGINE_CONFIG.fatigue.staminaBaseline - stamina)
      * ENGINE_CONFIG.fatigue.staminaSensitivity);
    const expected = on.state.condition - ENGINE_CONFIG.fatigue.baseConditionLossPerMinute
      * ENGINE_CONFIG.fatigue.phaseMultiplier.firstHalf
      * ENGINE_CONFIG.fatigue.approachMultiplier[match.home.tactics.approach]
      * staminaFactor;
    expect(observed).toBeCloseTo(expected, 10);
  });

  it("freezes a substituted player's final condition when they leave (kills mutant 6)", () => {
    const match = input();
    const off = match.home.starters[1]!;
    match.decisions = [decision(match, 20, off, match.home.substitutes[1]!)];
    const result = simulateMatch(match);
    const conditionBeforeLeaving = result.minuteSnapshots[18]!.players.find((player) => player.playerId === off.id)!.condition;
    expect(result.finalCondition[off.id]).toBeCloseTo(conditionBeforeLeaving, 10);
  });

  it("rejects minute zero and applies accepted boundary decisions exactly once (kills mutant 7)", () => {
    const invalid = input();
    invalid.decisions = [decision(invalid, 0, invalid.home.starters[1]!, invalid.home.substitutes[1]!)];
    expect(() => simulateMatch(invalid)).toThrow(/minute must be an integer from 1 to 90/i);

    for (const minute of [1, 90]) {
      const match = input(minute);
      match.decisions = [decision(match, minute, match.home.starters[1]!, match.home.substitutes[1]!)];
      const result = simulateMatch(match);
      expect(result.events.filter((event) => event.type === "substitution")).toHaveLength(1);
    }
  });

  it("validates membership before simulating and records a minute-one outgoing appearance", () => {
    const invalidOff = input();
    invalidOff.decisions = [decision(invalidOff, 60, invalidOff.home.substitutes[2]!, invalidOff.home.substitutes[1]!)];
    expect(() => simulateMatch(invalidOff)).toThrow(/not on the pitch/);
    const invalidOn = input();
    invalidOn.decisions = [{ ...decision(invalidOn, 60, invalidOn.home.starters[1]!, invalidOn.home.substitutes[1]!), playerOn: "missing" }];
    expect(() => simulateMatch(invalidOn)).toThrow(/not an available substitute/);

    const match = input();
    const off = match.home.starters[1]!;
    match.decisions = [decision(match, 1, off, match.home.substitutes[1]!)];
    const result = simulateMatch(match);
    expect(contribution(result, off.id).minutesPlayed).toBe(0);
    expect(buildSeasonPlayerStats([result]).some((entry) => entry.playerId === off.id)).toBe(true);
  });

  it("rejects a repeat entrant and the configured maximum up front", () => {
    const repeated = input();
    repeated.decisions = [
      decision(repeated, 20, repeated.home.starters[1]!, repeated.home.substitutes[1]!),
      decision(repeated, 30, repeated.home.starters[2]!, repeated.home.substitutes[1]!),
    ];
    expect(() => simulateMatch(repeated)).toThrow(/brought on twice|not an available substitute/);

    const excessive = input();
    excessive.decisions = Array.from({ length: ENGINE_CONFIG.substitutions.maximum + 1 }, (_, index) =>
      decision(excessive, 20 + index, excessive.home.starters[index + 1]!, excessive.home.substitutes[index + 1]!));
    expect(() => simulateMatch(excessive)).toThrow(/cannot make more than 5 substitutions/);
  });

  it("rejects substituting a player after a deterministic sending-off", () => {
    let witness: MatchInput | undefined;
    for (let seed = 1; seed <= 1_000 && !witness; seed += 1) {
      const candidate = input(seed);
      candidate.home.tactics.tackling = "hard";
      const baseline = simulateMatch(candidate);
      const red = baseline.events.find((event) => event.type === "red-card" && event.teamId === candidate.home.id && event.minute < 90);
      if (red) {
        candidate.decisions = [decision(candidate, red.minute + 1,
          candidate.home.starters.find((player) => player.id === red.playerId)!, candidate.home.substitutes[1]!)];
        witness = candidate;
      }
    }
    expect(witness, "expected a deterministic home dismissal").toBeDefined();
    expect(() => simulateMatch(witness!)).toThrow(/after being sent off/);
  });
});
