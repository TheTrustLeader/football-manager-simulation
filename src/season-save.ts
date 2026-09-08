import type { SeasonResult } from "./competition.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasFields(value: unknown, fields: readonly string[]): value is UnknownRecord {
  return isRecord(value) && fields.every((field) => Object.hasOwn(value, field));
}

function hasNumberFields(value: unknown, fields: readonly string[]): value is UnknownRecord {
  return hasFields(value, fields) && fields.every((field) => typeof value[field] === "number"
    && Number.isFinite(value[field]));
}

function hasStringFields(value: unknown, fields: readonly string[]): value is UnknownRecord {
  return hasFields(value, fields) && fields.every((field) => typeof value[field] === "string");
}

function isFixture(value: unknown): boolean {
  return hasNumberFields(value, ["round"])
    && hasStringFields(value, ["homeId", "awayId"]);
}

function isTableRow(value: unknown): boolean {
  return hasStringFields(value, ["teamId"])
    && hasNumberFields(value, [
      "played", "won", "drawn", "lost", "goalsFor", "goalsAgainst",
      "goalDifference", "points",
    ]);
}

function isDiagnostics(value: unknown): boolean {
  if (!hasFields(value, ["homeAdvantage", "fatigue", "gameState"])) return false;
  const homeAdvantage = value.homeAdvantage;
  const fatigue = value.fatigue;
  const gameState = value.gameState;
  if (!hasFields(homeAdvantage, ["applied"])
    || typeof homeAdvantage.applied !== "boolean"
    || !hasNumberFields(homeAdvantage, [
      "homeProgressionProbabilityBoost", "awayTravelConditionPenalty",
      "awayDefendingFoulProbabilityAdd",
    ])
    || !hasFields(fatigue, ["applied"])
    || typeof fatigue.applied !== "boolean"
    || !hasNumberFields(fatigue, ["baseConditionLossPerMinute", "minimumCondition"])
    || !hasNumberFields(gameState, ["progressionProbabilityShift"])
    || !hasFields(gameState, ["scoreStateMinutes", "attackingState"])) return false;

  const scoreStateMinutes = gameState.scoreStateMinutes;
  const attackingState = gameState.attackingState;
  return hasNumberFields(scoreStateMinutes, ["level", "homeLeading", "awayLeading"])
    && hasFields(attackingState, ["level", "leading", "trailing"])
    && [attackingState.level, attackingState.leading, attackingState.trailing]
      .every((state) => hasNumberFields(state, ["possessions", "progressions"]));
}

function isMatch(value: unknown): boolean {
  if (!hasStringFields(value, ["engineConfigVersion", "engineConfigHash", "homeTeamId", "awayTeamId"])
    || !hasNumberFields(value, ["seed"])
    || !hasFields(value, ["home", "away", "events", "contributions", "finalCondition", "diagnostics"])) return false;

  const statFields = ["goals", "shots", "shotsOnTarget", "chances", "possessionTicks", "fouls", "yellowCards", "redCards"];
  return hasNumberFields(value.home, statFields)
    && hasNumberFields(value.away, statFields)
    && Array.isArray(value.events)
    && value.events.every((event) => hasNumberFields(event, ["minute"])
      && hasStringFields(event, ["type", "detail"]))
    && Array.isArray(value.contributions)
    && value.contributions.every((contribution) => hasStringFields(contribution, ["playerId"])
      && hasNumberFields(contribution, [
        "minutesPlayed", "goals", "assists", "shots", "shotsOnTarget",
        "chancesCreated", "progressionActions", "defensiveActions", "saves",
        "fouls", "yellowCards", "redCards", "majorErrors", "rating",
      ]))
    && isRecord(value.finalCondition)
    && Object.values(value.finalCondition).every((condition) => typeof condition === "number" && Number.isFinite(condition))
    && isDiagnostics(value.diagnostics);
}

function isSeasonResult(value: unknown): value is SeasonResult {
  return hasNumberFields(value, ["seed"])
    && hasFields(value, ["teamIds", "fixtures", "matches", "table"])
    && Array.isArray(value.teamIds)
    && value.teamIds.every((id) => typeof id === "string")
    && Array.isArray(value.fixtures)
    && value.fixtures.every(isFixture)
    && Array.isArray(value.matches)
    && value.matches.every(isMatch)
    && Array.isArray(value.table)
    && value.table.every(isTableRow);
}

/** Serialise a season without filesystem policy, versioning, or migration. */
export function saveSeason(result: SeasonResult): string {
  return JSON.stringify(result);
}

/**
 * Parse a complete SeasonResult. Invalid JSON and values missing required
 * season, fixture, match, contribution, or table fields are malformed: those
 * values cannot safely be consumed as an engine-produced season.
 */
export function loadSeason(json: string): SeasonResult {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("Malformed season save: invalid JSON");
  }

  if (!isSeasonResult(value)) {
    throw new Error("Malformed season save: expected a complete SeasonResult");
  }
  return value;
}
