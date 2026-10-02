import type { SeasonId } from "./rules.js";

export type Division = 1 | 2 | 3 | 4;
export type MovementStatus = "promoted" | "relegated" | "re-elected" | "stays";

export interface DivisionMovementRule {
  from: Division;
  to: Division;
  promoted: number;
  relegated: number;
  /** Reserved for the historically different play-off rules used in later seasons. */
  playOffPlaces?: number;
}

export type LowestDivisionRule =
  | { kind: "re-election"; applicants: number; reElected: number }
  | { kind: "automatic-relegation"; relegated: number; promotedFromNonLeague: number };

export interface LeagueStructure {
  firstSeason: SeasonId;
  lastSeason: SeasonId;
  divisionSizes: Readonly<Record<Division, number>>;
  movements: readonly DivisionMovementRule[];
  lowestDivision: LowestDivisionRule;
  source: string;
}

const SOURCE = "Wikipedia, ‘1981–82 Football League’ and ‘1982–83 Football League’; englishfootballleaguetables.co.uk final tables";

export const LEAGUE_STRUCTURES: readonly LeagueStructure[] = [
  {
    firstSeason: 1981,
    lastSeason: 1982,
    divisionSizes: { 1: 22, 2: 22, 3: 24, 4: 24 },
    movements: [
      { from: 2, to: 1, promoted: 3, relegated: 3 },
      { from: 3, to: 2, promoted: 3, relegated: 3 },
      { from: 4, to: 3, promoted: 4, relegated: 4 },
    ],
    lowestDivision: { kind: "re-election", applicants: 4, reElected: 4 },
    source: SOURCE,
  },
];

export function leagueStructureForSeason(
  season: SeasonId,
  table: readonly LeagueStructure[] = LEAGUE_STRUCTURES,
): LeagueStructure {
  if (!Number.isInteger(season)) throw new Error(`Season ${season} must be an integer`);
  const matches = table.filter((row) => season >= row.firstSeason && season <= row.lastSeason);
  if (matches.length === 0) throw new Error(`Season ${season}'s league structure is not sourced yet`);
  if (matches.length > 1) throw new Error(`Season ${season}'s league structure has overlapping rows`);
  return matches[0]!;
}

export interface FinalTableRow {
  teamId: string;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference?: number;
}

export type FinalTables = Readonly<Partial<Record<Division, readonly FinalTableRow[]>>>;

export interface ClubMovement {
  teamId: string;
  fromDivision: Division;
  nextDivision: Division;
  status: MovementStatus;
}

export interface UnresolvedBoundary {
  division: Division;
  boundary: "promotion" | "relegation" | "re-election";
  clubs: readonly [string, string];
}

export interface SeasonMovements {
  clubs: ClubMovement[];
  unresolvedBoundaries: UnresolvedBoundary[];
}

function footballLevel(row: FinalTableRow): readonly [number, number, number] {
  return [row.points, row.goalDifference ?? row.goalsFor - row.goalsAgainst, row.goalsFor];
}

function boundaryIsUnresolved(rows: readonly FinalTableRow[], after: number): boolean {
  if (after <= 0 || after >= rows.length) return false;
  const above = footballLevel(rows[after - 1]!);
  const below = footballLevel(rows[after]!);
  return above.every((value, index) => value === below[index]);
}

/** Resolve end-of-season movements from final tables which are already in final order. */
export function seasonMovements(
  season: SeasonId,
  finalTables: FinalTables,
  structures: readonly LeagueStructure[] = LEAGUE_STRUCTURES,
): SeasonMovements {
  const structure = leagueStructureForSeason(season, structures);
  const seen = new Set<string>();
  const clubs: ClubMovement[] = [];
  for (const division of [1, 2, 3, 4] as const) {
    const rows = finalTables[division];
    if (!rows) throw new Error(`Final table is missing Division ${division}`);
    if (rows.length !== structure.divisionSizes[division]) {
      throw new Error(`Division ${division} has ${rows.length} clubs; expected ${structure.divisionSizes[division]}`);
    }
    for (const row of rows) {
      if (seen.has(row.teamId)) throw new Error(`Club ${row.teamId} appears in more than one division`);
      seen.add(row.teamId);
      clubs.push({ teamId: row.teamId, fromDivision: division, nextDivision: division, status: "stays" });
    }
  }

  const unresolvedBoundaries: UnresolvedBoundary[] = [];
  const applyBoundary = (division: Division, boundary: UnresolvedBoundary["boundary"], after: number, selected: readonly FinalTableRow[], status: MovementStatus, nextDivision: Division) => {
    const rows = finalTables[division]!;
    if (boundaryIsUnresolved(rows, after)) {
      unresolvedBoundaries.push({ division, boundary, clubs: [rows[after - 1]!.teamId, rows[after]!.teamId] });
      return;
    }
    for (const row of selected) {
      const club = clubs.find((candidate) => candidate.teamId === row.teamId)!;
      club.status = status;
      club.nextDivision = nextDivision;
    }
  };

  for (const rule of structure.movements) {
    const lower = finalTables[rule.from]!;
    const upper = finalTables[rule.to]!;
    applyBoundary(rule.from, "promotion", rule.promoted, lower.slice(0, rule.promoted), "promoted", rule.to);
    const relegationLine = upper.length - rule.relegated;
    applyBoundary(rule.to, "relegation", relegationLine, upper.slice(relegationLine), "relegated", rule.from);
  }

  if (structure.lowestDivision.kind === "re-election") {
    const rows = finalTables[4]!;
    const line = rows.length - structure.lowestDivision.applicants;
    applyBoundary(4, "re-election", line, rows.slice(line), "re-elected", 4);
  } else {
    const rows = finalTables[4]!;
    const line = rows.length - structure.lowestDivision.relegated;
    applyBoundary(4, "relegation", line, rows.slice(line), "relegated", 4);
  }

  return { clubs, unresolvedBoundaries };
}
