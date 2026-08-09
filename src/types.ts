export type Formation = "4-4-2" | "4-3-3" | "4-5-1" | "3-5-2" | "5-3-2";
export type Style = "passing" | "direct" | "counter" | "balanced";
export type Approach = "cautious" | "balanced" | "attacking";
export type Tackling = "careful" | "normal" | "hard";
export type Position = "GK" | "DF" | "MF" | "FW";
export type Morale = "very-low" | "low" | "steady" | "good" | "high";

export interface Attributes {
  defending: number;
  passing: number;
  creativity: number;
  pace: number;
  aerial: number;
  finishing: number;
  stamina: number;
  leadership: number;
  goalkeeping: number;
}

export interface HiddenTraits {
  consistency: number;
  injurySusceptibility: number;
  temperament: number;
  adaptability: number;
}

export interface PlayerState {
  condition: number;
  morale: Morale;
  recentForm: number;
}

export interface Player {
  id: string;
  name: string;
  primaryPosition: Position;
  attributes: Attributes;
  hidden: HiddenTraits;
  state: PlayerState;
}

export interface Tactics {
  formation: Formation;
  style: Style;
  approach: Approach;
  tackling: Tackling;
  captainId: string;
  creatorId: string;
  targetForwardId: string;
}

export interface TeamInput {
  id: string;
  name: string;
  starters: Player[];
  substitutes: Player[];
  tactics: Tactics;
}

export interface MatchInput {
  seed: number;
  home: TeamInput;
  away: TeamInput;
  neutralVenue?: boolean;
}

export type MatchEventType =
  | "kick-off"
  | "attack"
  | "chance"
  | "shot"
  | "save"
  | "goal"
  | "foul"
  | "yellow-card"
  | "red-card"
  | "injury"
  | "substitution"
  | "tactical-change"
  | "full-time";

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  teamId?: string;
  playerId?: string;
  secondaryPlayerId?: string;
  detail: string;
}

export interface PlayerContribution {
  playerId: string;
  minutesPlayed: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  chancesCreated: number;
  progressionActions: number;
  defensiveActions: number;
  saves: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  majorErrors: number;
  rating: number;
}

export interface TeamStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  chances: number;
  possessionTicks: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

export interface MatchOutput {
  seed: number;
  engineConfigVersion: string;
  engineConfigHash: string;
  homeTeamId: string;
  awayTeamId: string;
  home: TeamStats;
  away: TeamStats;
  events: MatchEvent[];
  contributions: PlayerContribution[];
}
