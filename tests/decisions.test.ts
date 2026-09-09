import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../src/engine-config.js";
import { simulateMatch } from "../src/engine.js";
import { makeTeam } from "../src/fixtures.js";
import type { MatchDecision, MatchInput, Player } from "../src/types.js";

function input(seed = 12345): MatchInput {
  return {
    seed,
    neutralVenue: true,
    home: makeTeam("decision-home"),
    away: makeTeam("decision-away"),
  };
}

function substitution(match: MatchInput, minute = 20, playerOff = 1, playerOn = 1): MatchDecision {
  return {
    minute,
    teamId: match.home.id,
    type: "substitution",
    playerOff: match.home.starters[playerOff]!.id,
    playerOn: match.home.substitutes[playerOn]!.id,
  };
}

function cloneAtCondition(player: Player, id: string, condition: number): Player {
  return { ...player, id, name: `${player.name} replacement`, state: { ...player.state, condition } };
}

describe("match decisions", () => {
  it("applies a substitution at the top of its minute and records both players' minutes", () => {
    const match = input();
    const decision = substitution(match, 60);
    match.decisions = [decision];

    const result = simulateMatch(match);
    const event = result.events.find((candidate) => candidate.type === "substitution");
    const before = result.minuteSnapshots[58]!;
    const after = result.minuteSnapshots[59]!;

    expect(event).toMatchObject({
      minute: 60,
      teamId: match.home.id,
      playerId: decision.playerOn,
      secondaryPlayerId: decision.playerOff,
    });
    expect(before.players.some((player) => player.playerId === decision.playerOff)).toBe(true);
    expect(before.players.some((player) => player.playerId === decision.playerOn)).toBe(false);
    expect(after.players.some((player) => player.playerId === decision.playerOff)).toBe(false);
    expect(after.players.some((player) => player.playerId === decision.playerOn)).toBe(true);
    expect(result.contributions.find((entry) => entry.playerId === decision.playerOff)?.minutesPlayed).toBe(59);
    expect(result.contributions.find((entry) => entry.playerId === decision.playerOn)?.minutesPlayed).toBe(31);
  });

  it("preserves all earlier events and possession without consuming a random draw", () => {
    const baselineInput = input(99881);
    const decidedInput = structuredClone(baselineInput);
    const minute = 20;
    const off = decidedInput.home.starters[1]!;
    if (off.primaryPosition === "GK") throw new Error("test fixture requires an outfield player");
    const workloadBeforeDecision = (minute - 1) * ENGINE_CONFIG.fatigue.phaseMultiplier.firstHalf
      * ENGINE_CONFIG.fatigue.approachMultiplier[decidedInput.home.tactics.approach];
    const staminaFactor = Math.max(
      0.65,
      1 + (ENGINE_CONFIG.fatigue.staminaBaseline - off.attributes.stamina)
        * ENGINE_CONFIG.fatigue.staminaSensitivity,
    );
    const conditionAtDecision = off.state.condition
      - workloadBeforeDecision * ENGINE_CONFIG.fatigue.baseConditionLossPerMinute * staminaFactor;
    const on = cloneAtCondition(off, decidedInput.home.substitutes[1]!.id, conditionAtDecision);
    decidedInput.home.substitutes[1] = on;
    decidedInput.decisions = [substitution(decidedInput, minute)];

    const baseline = simulateMatch(baselineInput);
    const decided = simulateMatch(decidedInput);

    expect(decided.events.filter((event) => event.minute < minute))
      .toEqual(baseline.events.filter((event) => event.minute < minute));
    expect(decided.possessionByMinute.slice(0, minute - 1))
      .toEqual(baseline.possessionByMinute.slice(0, minute - 1));
    // Identical profiles make possession a direct witness of the random stream:
    // one draw in decision application shifts this sequence and fails here.
    expect(decided.possessionByMinute).toEqual(baseline.possessionByMinute);
  });

  it("rejects substituting a player who is not on the pitch", () => {
    const match = input();
    match.decisions = [substitution(match, 20, 1, 1)];
    match.decisions[0]!.playerOff = match.home.substitutes[2]!.id;
    expect(() => simulateMatch(match)).toThrow(/not on the pitch/);
  });

  it("rejects substituting a player who has already been sent off", () => {
    let match: MatchInput | undefined;
    let redCard: ReturnType<typeof simulateMatch>["events"][number] | undefined;
    for (let seed = 1; seed <= 500 && !redCard; seed += 1) {
      const candidate = input(seed);
      const result = simulateMatch(candidate);
      const found = result.events.find((event) => event.type === "red-card" && event.minute < ENGINE_CONFIG.matchMinutes);
      if (found) {
        match = candidate;
        redCard = found;
      }
    }
    expect(redCard, "expected a deterministic seed with a dismissal").toBeDefined();
    const team = redCard!.teamId === match!.home.id ? match!.home : match!.away;
    match!.decisions = [{
      minute: redCard!.minute + 1,
      teamId: team.id,
      type: "substitution",
      playerOff: redCard!.playerId!,
      playerOn: team.substitutes[1]!.id,
    }];
    expect(() => simulateMatch(match!)).toThrow(/after being sent off/);
  });

  it("rejects bringing the same player on twice", () => {
    const match = input();
    const first = substitution(match, 20, 1, 1);
    const second = substitution(match, 30, 2, 1);
    match.decisions = [first, second];
    expect(() => simulateMatch(match)).toThrow(/brought on twice/);
  });

  it("only permits a goalkeeper to replace a goalkeeper", () => {
    const match = input();
    match.decisions = [substitution(match, 20, 0, 1)];
    expect(() => simulateMatch(match)).toThrow(/goalkeeper may only be replaced by a goalkeeper/i);
  });

  it("enforces the configured maximum substitutions", () => {
    const match = input();
    match.decisions = Array.from({ length: ENGINE_CONFIG.substitutions.maximum + 1 }, (_, index) =>
      substitution(match, 20 + index, index + 1, index + 1));
    expect(() => simulateMatch(match)).toThrow(/cannot make more than 5 substitutions/);
  });
});
