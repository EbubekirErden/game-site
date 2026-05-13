export type PlayerID = string;
export type RoomID = string;

export type SkullKingPhase = "lobby" | "bidding" | "playing" | "round_over" | "match_over";
export type SkullKingSuit = "green" | "yellow" | "purple" | "black";
export type PlayerOrderMode = "fixed" | "reverse_each_round" | "rotate_each_round";
export type TigressPlayMode = "escape" | "pirate";

export type SkullKingCard =
  | {
      type: "number";
      suit: SkullKingSuit;
      rank: number;
    }
  | {
      type: "escape" | "pirate" | "mermaid" | "loot" | "kraken" | "white_whale" | "skull_king";
    }
  | {
      type: "tigress";
      mode?: TigressPlayMode;
    };

export interface SkullKingCardInstance {
  instanceId: string;
  card: SkullKingCard;
}

export interface SkullKingPlayerState {
  id: PlayerID;
  name: string;
  isBot?: boolean;
  hand: SkullKingCardInstance[];
  bid: number | null;
  tricksWon: number;
  roundScore: number;
  bonusScore: number;
  totalScore: number;
  isReady: boolean;
}

export interface SkullKingPublicPlayerState {
  id: PlayerID;
  name: string;
  isBot?: boolean;
  handCount: number;
  bid: number | null;
  tricksWon: number;
  roundScore: number;
  bonusScore: number;
  totalScore: number;
  isReady: boolean;
}

export interface SkullKingSpectatorState {
  id: PlayerID;
  name: string;
}

export interface SkullKingSettings {
  turnDurationSeconds: number;
  orderMode: PlayerOrderMode;
}

export interface SkullKingTrickPlay {
  playerId: PlayerID;
  card: SkullKingCardInstance;
}

export interface SkullKingBonusEvent {
  playerId: PlayerID;
  points: number;
  reason:
    | "skull_king_pirate_capture"
    | "mermaid_skull_king_capture"
    | "pirate_mermaid_capture"
    | "standard_fourteen_capture"
    | "black_fourteen_capture"
    | "loot_success";
  requiredExactPlayerIds?: PlayerID[];
}

export interface SkullKingCompletedTrick {
  trickNumber: number;
  leadPlayerId: PlayerID;
  plays: SkullKingTrickPlay[];
  winnerPlayerId: PlayerID | null;
  winningPlayIndex: number | null;
  bonusEvents: SkullKingBonusEvent[];
}

export interface SkullKingRoundState {
  roundNumber: number;
  deck: SkullKingCardInstance[];
  playerOrder: PlayerID[];
  starterPlayerId: PlayerID;
  leadPlayerId: PlayerID;
  currentPlayerId: PlayerID | null;
  turnStartedAt: number;
  currentTrick: {
    trickNumber: number;
    leadPlayerId: PlayerID;
    plays: SkullKingTrickPlay[];
    winningPlayIndex: number | null;
  };
  completedTricks: SkullKingCompletedTrick[];
}

export interface SkullKingGameState {
  gameId: "skull-king";
  roomId: RoomID;
  creatorId: PlayerID;
  phase: SkullKingPhase;
  players: SkullKingPlayerState[];
  spectators: SkullKingSpectatorState[];
  settings: SkullKingSettings;
  round: SkullKingRoundState | null;
  completedRoundCount: number;
  matchWinnerIds: PlayerID[];
  log: SkullKingGameEvent[];
}

export type SkullKingGameEvent =
  | { type: "player_joined"; playerId: PlayerID; name: string }
  | { type: "spectator_joined"; spectatorId: PlayerID; name: string }
  | { type: "player_ready_changed"; playerId: PlayerID; isReady: boolean }
  | { type: "settings_changed"; settings: SkullKingSettings }
  | { type: "round_started"; roundNumber: number; starterPlayerId: PlayerID }
  | { type: "bid_submitted"; playerId: PlayerID; bid: number | null; timedOut?: boolean }
  | { type: "card_played"; playerId: PlayerID; card: SkullKingCard; timedOut?: boolean }
  | { type: "trick_completed"; trickNumber: number; winnerPlayerId: PlayerID | null }
  | { type: "round_scored"; roundNumber: number }
  | { type: "match_ended"; winnerIds: PlayerID[] };

export interface SkullKingPlayerViewState
  extends Omit<SkullKingGameState, "players" | "round"> {
  selfPlayerId: PlayerID;
  selfRole: "player" | "spectator";
  players: Array<
    SkullKingPublicPlayerState & {
      hand: SkullKingCardInstance[];
    }
  >;
  round: (Omit<SkullKingRoundState, "deck"> & { deckCount: number }) | null;
}

export interface SkullKingActionResult {
  ok: boolean;
  reason?: string;
  state?: SkullKingGameState;
}
