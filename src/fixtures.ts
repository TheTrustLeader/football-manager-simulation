import type { Attributes, Player, Position, TeamInput, Tactics } from "./types.js";

const positions: Position[] = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "FW", "FW"];

function attributes(level: number, position: Position): Attributes {
  return {
    defending: position === "DF" ? level + 2 : position === "GK" ? level - 3 : level,
    passing: position === "MF" ? level + 2 : level,
    creativity: position === "MF" ? level + 2 : position === "FW" ? level + 1 : level - 1,
    pace: position === "FW" ? level + 2 : level,
    aerial: position === "DF" || position === "FW" ? level + 2 : level,
    finishing: position === "FW" ? level + 3 : level - 2,
    stamina: level,
    leadership: level,
    goalkeeping: position === "GK" ? level + 4 : 1,
  };
}

function player(teamId: string, index: number, level: number, position: Position): Player {
  return {
    id: `${teamId}-p${index + 1}`,
    name: `${teamId.toUpperCase()} Player ${index + 1}`,
    age: 27,
    primaryPosition: position,
    attributes: attributes(level, position),
    hidden: {
      consistency: 10,
      injurySusceptibility: 10,
      temperament: 10,
      adaptability: 10,
    },
    state: {
      condition: 100,
      morale: "steady",
      recentForm: 0,
    },
  };
}

export function makeTeam(id: string, level = 10, overrides: Partial<Tactics> = {}): TeamInput {
  const starters = positions.map((position, index) => player(id, index, level, position));
  const substitutes = [
    player(`${id}-sub`, 0, level, "GK"),
    player(`${id}-sub`, 1, level, "DF"),
    player(`${id}-sub`, 2, level, "MF"),
    player(`${id}-sub`, 3, level, "FW"),
  ];

  const tactics: Tactics = {
    formation: "4-4-2",
    style: "balanced",
    approach: "balanced",
    tackling: "normal",
    captainId: starters[4]!.id,
    creatorId: starters[7]!.id,
    targetForwardId: starters[9]!.id,
    ...overrides,
  };

  return { id, name: id.toUpperCase(), starters, substitutes, tactics };
}
