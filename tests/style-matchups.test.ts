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

function profilePair(style: Style, seed: number): [TeamInput, TeamInput] {
  const base = makeTeam(`${style}-profile`, 10, undefined, { seed, identity: "balanced" });
  const suited = structuredClone(base);
  const unsuited = structuredClone(base);
  const favoured = style === "passing" ? ["passing", "creativity"]
    : style === "direct" ? ["pace", "aerial", "finishing"]
      : style === "counter" ? ["defending", "aerial"] : ["stamina", "leadership"];
  for (const [team, direction] of [[suited, 1], [unsuited, -1]] as const) {
    for (const player of team.starters) {
      if (player.primaryPosition === "GK") continue;
      for (const attribute of favoured) {
        const attributes = player.attributes as unknown as Record<string, number>;
        const shift = style === "balanced" ? 7 : 4;
        attributes[attribute] = Math.max(1, Math.min(20, attributes[attribute]! + direction * shift));
      }
    }
  }
  return [suited, unsuited];
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

  it.each(styles)("a %s-suited eleven does better than an unsuited eleven playing the same style", (style) => {
    const [suited, unsuited] = profilePair(style, 51_100 + styles.indexOf(style));
    const opponent = makeTeam(`${style}-opponent`, 10, undefined, { seed: 51_200 + styles.indexOf(style), identity: "balanced" });
    // Every team plays the same style, so the match-up table is exactly neutral.
    const measured = paired(withStyle(suited, style), withStyle(opponent, style));
    const wrong = paired(withStyle(unsuited, style), withStyle(opponent, style));
    const gap = measured.difference - wrong.difference;
    const combinedSe = Math.hypot(measured.standardError, wrong.standardError);
    console.log(`FIT ${style} suited-v-unsuited gap=${gap.toFixed(4)} combined_se=${combinedSe.toFixed(4)}`);
    expect(gap).toBeGreaterThan(2 * combinedSe);
    const comparisonStyle: Style = style === "balanced" ? "passing" : "balanced";
    const comparisonSuited = paired(withStyle(suited, comparisonStyle), withStyle(opponent, comparisonStyle));
    const comparisonUnsuited = paired(withStyle(unsuited, comparisonStyle), withStyle(opponent, comparisonStyle));
    const interaction = gap - (comparisonSuited.difference - comparisonUnsuited.difference);
    console.log(`FIT_CONTROL ${style} interaction=${interaction.toFixed(4)}`);
    expect(interaction).toBeGreaterThan(style === "direct" ? 0.04 : 0.05);
  });
});
