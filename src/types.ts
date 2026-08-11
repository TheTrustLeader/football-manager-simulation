export type Formation = "4-4-2" | "4-3-3" | "4-5-1" | "3-5-2" | "5-3-2";
export type Style = "passing" | "direct" | "counter" | "balanced";
export type Approach = "cautious" | "balanced" | "attacking";
export type Tackling = "careful" | "normal" | "hard";
export type GoalkeeperPosition = "GK";
export type OutfieldPosition = "CB" | "FB" | "CM" | "WM" | "FW";
export type Position = GoalkeeperPosition | OutfieldPosition;
export type Morale = "very-low" | "low" | "steady" | "good" | "high";
export type ScoreState = "level" | "leading" | "trailing";

export interface OutfieldAttributes {
  defending: number;
  passing: number;
  creativity: number;
  pace: number;
  aerial: number;
  finishing: number;
  stamina: number;
  leadership: number;
  crossing: number;
}

export interface GoalkeeperAttributes {
  shotStopping: number;
  handling: number;
  kicking: number;
  aerial: number;
  leadership: number;
}

export type Attributes = OutfieldAttributes | GoalkeeperAttributes;
export type OutfieldAttribute = keyof OutfieldAttributes;
export type GoalkeeperAttribute = keyof GoalkeeperAttributes;
export type AttributeName = OutfieldAttribute | GoalkeeperAttribute;

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

interface PlayerBase {
  id: string;
  name: string;
  age: number;
  hidden: HiddenTraits;
  state: PlayerState;
}

export interface GoalkeeperPlayer extends PlayerBase {
  primaryPosition: GoalkeeperPosition;
  attributes: GoalkeeperAttributes;
}

export interface OutfieldPlayer extends PlayerBase {
  primaryPosition: OutfieldPosition;
  attributes: OutfieldAttributes;
}

export type Player = GoalkeeperPlayer | OutfieldPlayer;

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

export interface ScoreStateDiagnostic {
  possessions: number;
  progressions: number;
}

export interface MatchDiagnostics {
  homeAdvantage: {
    applied: boolean;
    homeProgressionProbabilityBoost: number;
    awayTravelConditionPenalty: number;
    awayDefendingFoulProbabilityAdd: number;
  };
  fatigue: {
    applied: boolean;
    baseConditionLossPerMinute: number;
    minimumCondition: number;
  };
  gameState: {
    progressionProbabilityShift: number;
    scoreStateMinutes: {
      level: number;
      homeLeading: number;
      awayLeading: number;
    };
    attackingState: Record<ScoreState, ScoreStateDiagnostic>;
  };
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
  finalCondition: Record<string, number>;
  diagnostics: MatchDiagnostics;
}
