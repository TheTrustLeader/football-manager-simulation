import { describe, expect, it } from "vitest";
import { simulateMatch } from "../src/engine.js";
import { makeTeam } from "../src/fixtures.js";
import { EXHIBITION_RULES_1981, rulesForSeason } from "../src/rules.js";
import type { MatchOutput, Style, TeamInput } from "../src/types.js";

const styles: Style[] = ["passing", "direct", "counter", "balanced"];
const requiredWinners: [Style, Style][] = [
  ["counter", "passing"], ["passing", "direct"], ["passing", "balanced"],
  ["direct", "counter"], ["balanced", "direct"],
];
const seeds = Array.from({ length: 1_000 }, (_, index) => 51_000_000 + index);

function withStyle(team: TeamInput, style: Style): TeamInput {
  return { ...team, tactics: { ...team.tactics, style } };
}

function points(result: MatchOutput, firstHome: boolean): number {
  const first = firstHome ? result.home.goals : result.away.goals;
  const second = firstHome ? result.away.goals : result.home.goals;
  return first > second ? 3 : first === second ? 1 : 0;
}

function paired(first: TeamInput, second: TeamInput, rules = EXHIBITION_RULES_1981) {
  const observations = seeds.map((seed, index) => {
    const firstHome = index % 2 === 0;
    const result = simulateMatch({
      seed, neutralVenue: true, seasonRules: rules,
      home: firstHome ? first : second,
      away: firstHome ? second : first,
      captureMinuteSnapshots: false,
    });
    return points(result, firstHome) - points(result, !firstHome);
  });
  const difference = observations.reduce((sum, value) => sum + value, 0) / observations.length;
  const variance = observations.reduce((sum, value) => sum + (value - difference) ** 2, 0) / (observations.length - 1);
  return { difference, standardError: Math.sqrt(variance / observations.length) };
}

describe("dated style match-ups", () => {
  const equal = makeTeam("style-equal", 10, undefined, { seed: 51_000, identity: "balanced" });

  it.each(requiredWinners)("%s beats %s by more than two standard errors", (winner, loser) => {
    const measured = paired(withStyle(equal, winner), withStyle(equal, loser));
    console.log(`MATCHUP ${winner}>${loser} difference=${measured.difference.toFixed(4)} se=${measured.standardError.toFixed(4)}`);
    expect(measured.difference).toBeGreaterThan(2 * measured.standardError);
  });

  it("stores no match-up direction between balanced and counter", () => {
    const rules = rulesForSeason(1981);
    expect(rules.styleMatchups.balanced.counter).toBe(1);
    expect(rules.styleMatchups.counter.balanced).toBe(1);
    /* The squad-derived fit may still create a result direction, as intended. */
    const measured = paired(withStyle(equal, "balanced"), withStyle(equal, "counter"));
    console.log(`MATCHUP balanced~counter difference=${measured.difference.toFixed(4)} se=${measured.standardError.toFixed(4)}`);
  });

  it("requires explicit dated match-up rules", () => {
    const rules = { ...rulesForSeason(1981), styleMatchups: undefined };
    expect(() => simulateMatch({ seed: 1, home: equal, away: equal, seasonRules: rules as never })).toThrow("dated style match-up rules");
  });

  it("uses selected-eleven visible attributes rather than hidden identity labels", () => {
    const passing = makeTeam("passing-fit", 10, undefined, { seed: 51_001, identity: "passing" });
    const renamedIdentity = structuredClone(passing);
    for (const player of [...renamedIdentity.starters, ...renamedIdentity.substitutes]) {
      player.hidden = { consistency: -5, injurySusceptibility: 5, temperament: -5, potential: 5, adaptability: -5 };
    }
    const opponent = makeTeam("fit-opponent", 10, undefined, { seed: 51_002, identity: "balanced" });
    expect(paired(withStyle(passing, "passing"), withStyle(opponent, "balanced")))
      .toEqual(paired(withStyle(renamedIdentity, "passing"), withStyle(opponent, "balanced")));
  });

  it.each(styles)("a %s-profile eleven does better with its suited style", (style) => {
    const identity = style === "counter" ? "defensive" : style;
    const suited = makeTeam(`${style}-fit`, 10, undefined, { seed: 51_100 + styles.indexOf(style), identity });
    const opponent = makeTeam(`${style}-opponent`, 10, undefined, { seed: 51_200 + styles.indexOf(style), identity: "balanced" });
    const unsuitable: Style = style === "balanced" ? "counter" : style === "counter" ? "passing" : "balanced";
    // The opponent remains identical for both tactical choices.
    const opponentStyle: Style = style === "passing" ? "direct" : style === "direct" ? "passing" : "counter";
    const measured = paired(withStyle(suited, style), withStyle(opponent, opponentStyle));
    const wrong = paired(withStyle(suited, unsuitable), withStyle(opponent, opponentStyle));
    const gap = measured.difference - wrong.difference;
    const combinedSe = Math.hypot(measured.standardError, wrong.standardError);
    console.log(`FIT ${style}>${unsuitable} gap=${gap.toFixed(4)} combined_se=${combinedSe.toFixed(4)}`);
    expect(gap).toBeGreaterThan(2 * combinedSe);
  });
});
