import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LEAGUE_STRUCTURES,
  checkStructureBalance,
  leagueStructureForSeason,
  seasonMovements,
  type Division,
  type FinalTableRow,
  type FinalTables,
  type LeagueStructure,
} from "../src/league-structure.js";
import { rulesForSeason } from "../src/rules.js";

interface CsvRow extends FinalTableRow {
  season: number;
  division: Division;
  position: number;
  played: number;
  club: string;
}

function csvRows(): CsvRow[] {
  const lines = readFileSync(new URL("../data/football-league-final-tables-1981-1983.csv", import.meta.url), "utf8").trim().split("\n");
  return lines.slice(1).map((line) => {
    const [season, division, position, club, played, points, goalsFor, goalsAgainst] = line.split(",");
    return {
      season: Number(season), division: Number(division) as Division, position: Number(position),
      club: club!, teamId: club!, played: Number(played), points: Number(points),
      goalsFor: Number(goalsFor), goalsAgainst: Number(goalsAgainst),
    };
  });
}

function tablesFor(season: number): FinalTables {
  const rows = csvRows().filter((row) => row.season === season);
  return Object.fromEntries(([1, 2, 3, 4] as const).map((division) => [
    division, rows.filter((row) => row.division === division),
  ]));
}

describe("dated league structures", () => {
  it("covers only the two sourced seasons", () => {
    expect(leagueStructureForSeason(1981).divisionSizes).toEqual({ 1: 22, 2: 22, 3: 24, 4: 24 });
    expect(leagueStructureForSeason(1982).lowestDivision).toEqual({ kind: "re-election", applicants: 4, reElected: 4 });
    expect(() => leagueStructureForSeason(1983)).toThrow("not sourced yet");
    expect(() => seasonMovements(1983, {})).toThrow("not sourced yet");
  });

  it("agrees with the existing first-division rule in every covered season", () => {
    for (const row of LEAGUE_STRUCTURES) for (let season = row.firstSeason; season <= row.lastSeason; season += 1) {
      expect(rulesForSeason(season).firstDivisionTeams).toBe(leagueStructureForSeason(season).divisionSizes[1]);
    }
  });

  it("balances every division between consecutive sourced seasons", () => {
    expect(() => checkStructureBalance(LEAGUE_STRUCTURES)).not.toThrow();
  });

  it("checks balance across separate rows and identifies the first mismatch", () => {
    const current = leagueStructureForSeason(1981);
    const next: LeagueStructure = {
      ...current, firstSeason: 1983, lastSeason: 1983,
      divisionSizes: { ...current.divisionSizes, 1: 21 }, source: "test",
    };
    expect(() => checkStructureBalance([
      { ...current, lastSeason: 1982 },
      next,
    ])).toThrow("Division 1 does not balance from 1982 to 1983");
  });

  it("accepts a correctly balanced pair of separate rows", () => {
    const current = leagueStructureForSeason(1981);
    const next: LeagueStructure = { ...current, firstSeason: 1983, lastSeason: 1983, source: "test" };
    expect(() => checkStructureBalance([{ ...current, lastSeason: 1982 }, next])).not.toThrow();
  });

  it("balances an uneven top-flight promotion and relegation exchange", () => {
    const current: LeagueStructure = {
      firstSeason: 2000, lastSeason: 2000,
      divisionSizes: { 1: 22, 2: 22, 3: 24, 4: 24 },
      movements: [{ from: 2, to: 1, promoted: 3, relegated: 4 }],
      lowestDivision: { kind: "re-election", applicants: 4, reElected: 4 },
      source: "test",
    };
    const next = (divisionSizes: LeagueStructure["divisionSizes"]): LeagueStructure => ({
      ...current, firstSeason: 2001, lastSeason: 2001, divisionSizes,
    });

    expect(() => checkStructureBalance([
      current,
      next({ 1: 21, 2: 23, 3: 24, 4: 24 }),
    ])).not.toThrow();
    expect(() => checkStructureBalance([
      current,
      next({ 1: 23, 2: 21, 3: 24, 4: 24 }),
    ])).toThrow("Division 1 does not balance");
  });

  it("accounts for a club lost through re-election", () => {
    const current: LeagueStructure = {
      firstSeason: 2000, lastSeason: 2000,
      divisionSizes: { 1: 22, 2: 22, 3: 24, 4: 24 }, movements: [],
      lowestDivision: { kind: "re-election", applicants: 4, reElected: 3 }, source: "test",
    };
    const next = (divisionFourSize: number): LeagueStructure => ({
      ...current, firstSeason: 2001, lastSeason: 2001,
      divisionSizes: { ...current.divisionSizes, 4: divisionFourSize },
    });

    expect(() => checkStructureBalance([current, next(23)])).not.toThrow();
    expect(() => checkStructureBalance([current, next(24)])).toThrow("Division 4 does not balance");
  });

  it("accounts for automatic relegation and non-League promotion", () => {
    const current: LeagueStructure = {
      firstSeason: 2000, lastSeason: 2000,
      divisionSizes: { 1: 22, 2: 22, 3: 24, 4: 24 }, movements: [],
      lowestDivision: { kind: "automatic-relegation", relegated: 1, promotedFromNonLeague: 0 }, source: "test",
    };
    const next = (divisionFourSize: number): LeagueStructure => ({
      ...current, firstSeason: 2001, lastSeason: 2001,
      divisionSizes: { ...current.divisionSizes, 4: divisionFourSize },
    });

    expect(() => checkStructureBalance([current, next(23)])).not.toThrow();
    expect(() => checkStructureBalance([current, next(24)])).toThrow("Division 4 does not balance");
    expect(() => checkStructureBalance([
      { ...current, lowestDivision: { kind: "automatic-relegation", relegated: 1, promotedFromNonLeague: 1 } },
      next(24),
    ])).not.toThrow();
  });
});

describe("season movements", () => {
  it("refuses a re-election result that would remove clubs from the League", () => {
    const base = leagueStructureForSeason(1981);
    const changed: LeagueStructure = {
      ...base,
      lowestDivision: { kind: "re-election", applicants: 4, reElected: 3 },
    };
    expect(() => seasonMovements(1981, tablesFor(1981), [changed])).toThrow("re-election vote not modelled yet");
  });

  it("refuses automatic relegation until those seasons are sourced", () => {
    const base = leagueStructureForSeason(1981);
    const changed: LeagueStructure = {
      ...base,
      lowestDivision: { kind: "automatic-relegation", relegated: 1, promotedFromNonLeague: 1 },
    };
    expect(() => seasonMovements(1981, tablesFor(1981), [changed])).toThrow("automatic relegation from the League not modelled yet");
  });

  it("maps all 92 clubs from 1981/82 into their real 1982/83 divisions", () => {
    const result = seasonMovements(1981, tablesFor(1981));
    const next = new Map(csvRows().filter((row) => row.season === 1982).map((row) => [row.club, row.division]));
    expect(result.clubs).toHaveLength(92);
    expect(result.unresolvedBoundaries).toEqual([]);
    for (const club of result.clubs) expect(club.nextDivision, club.teamId).toBe(next.get(club.teamId));
    expect(result.clubs.filter((club) => club.nextDivision !== club.fromDivision)).toHaveLength(20);
    expect(result.clubs.filter((club) => club.status === "stays")).toHaveLength(68);
    expect(result.clubs.filter((club) => club.status === "re-elected").map((club) => club.teamId)).toEqual([
      "Rochdale", "Northampton Town", "Scunthorpe United", "Crewe Alexandra",
    ]);
  });

  it("selects the recorded 1982/83 movers", () => {
    const movers = seasonMovements(1982, tablesFor(1982)).clubs.filter((club) => club.status !== "stays");
    expect(movers.map((club) => club.teamId).sort()).toEqual([
      "Manchester City", "Swansea City", "Brighton & Hove Albion", "Queens Park Rangers", "Wolverhampton Wanderers", "Leicester City",
      "Rotherham United", "Burnley", "Bolton Wanderers", "Portsmouth", "Cardiff City", "Huddersfield Town",
      "Reading", "Wrexham", "Doncaster Rovers", "Chesterfield", "Wimbledon", "Hull City", "Port Vale", "Scunthorpe United",
      "Blackpool", "Hartlepool United", "Crewe Alexandra", "Hereford United",
    ].sort());
  });

  it("refuses missing, wrongly sized, and duplicate-club tables", () => {
    const tables = tablesFor(1981);
    expect(() => seasonMovements(1981, { ...tables, 3: tables[3]!.slice(0, 22) })).toThrow("expected 24");
    expect(() => seasonMovements(1981, { ...tables, 3: tables[3]!.slice(0, 23) })).toThrow("expected 24");
    const { 4: _omitted, ...missingFourth } = tables;
    expect(() => seasonMovements(1981, missingFourth)).toThrow("missing Division 4");
    const duplicate = [...tables[4]!]; duplicate[0] = tables[1]![0]!;
    expect(() => seasonMovements(1981, { ...tables, 4: duplicate })).toThrow("appears in more than one division");
  });

  it("takes movement counts from an injected structure", () => {
    const base = leagueStructureForSeason(1981);
    const changed: LeagueStructure = { ...base, movements: [{ from: 2, to: 1, promoted: 2, relegated: 2 }, ...base.movements.slice(1)] };
    const real = seasonMovements(1981, tablesFor(1981)).clubs.filter((club) => club.nextDivision !== club.fromDivision).map((club) => club.teamId);
    const altered = seasonMovements(1981, tablesFor(1981), [changed]).clubs.filter((club) => club.nextDivision !== club.fromDivision).map((club) => club.teamId);
    expect(altered).not.toEqual(real);
    expect(altered).not.toContain("Norwich City");
  });

  it("reports a club-id-only relegation boundary but accepts a goals-scored separation", () => {
    const structure: LeagueStructure = {
      firstSeason: 2000, lastSeason: 2000, divisionSizes: { 1: 3, 2: 3, 3: 3, 4: 3 },
      movements: [{ from: 2, to: 1, promoted: 1, relegated: 1 }],
      lowestDivision: { kind: "re-election", applicants: 1, reElected: 1 }, source: "test",
    };
    const row = (teamId: string, points: number, goalsFor = points): FinalTableRow => ({ teamId, points, goalsFor, goalsAgainst: goalsFor });
    const tables: FinalTables = {
      1: [row("top", 10), row("club-10", 5), row("club-2", 5)],
      2: [row("up", 10), row("middle-2", 5), row("bottom-2", 1)],
      3: [row("top-3", 10), row("middle-3", 5), row("bottom-3", 1)],
      4: [row("top-4", 10), row("middle-4", 5), row("bottom-4", 1)],
    };
    expect(seasonMovements(2000, tables, [structure]).unresolvedBoundaries).toContainEqual({
      division: 1, boundary: "relegation", clubs: ["club-10", "club-2"],
    });
    const separated = { ...tables, 1: [row("top", 10), row("club-10", 5, 6), row("club-2", 5, 5)] };
    expect(seasonMovements(2000, separated, [structure]).unresolvedBoundaries).not.toContainEqual(expect.objectContaining({ division: 1 }));
  });
});

describe("final-table evidence", () => {
  it("checks positions, sizes, points, games and balanced goals", () => {
    const rows = csvRows();
    for (const season of [1981, 1982]) for (const division of [1, 2, 3, 4] as const) {
      const table = rows.filter((row) => row.season === season && row.division === division);
      expect(table.map((row) => row.position)).toEqual(Array.from({ length: leagueStructureForSeason(season).divisionSizes[division] }, (_, i) => i + 1));
      expect(table.every((row, index) => index === 0 || row.points <= table[index - 1]!.points)).toBe(true);
      expect(table.every((row) => row.played === (division <= 2 ? 42 : 46))).toBe(true);
      expect(table.reduce((sum, row) => sum + row.goalsFor, 0)).toBe(table.reduce((sum, row) => sum + row.goalsAgainst, 0));
    }
  });
});
