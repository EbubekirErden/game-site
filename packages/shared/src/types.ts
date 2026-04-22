// packages/shared/src/types.ts

export type PlayerID = string;
export type RoomID = string;
export type CardID =
  | "guard"
  | "priest"
  | "baron"
  | "handmaid"
  | "prince"
  | "king"
  | "countess"
  | "princess";

export type PlayerStatus = "active" | "eliminated";
export type GamePhase = "lobby" | "in_round" | "round_over" | "match_over";

export interface CardDef {
  id: CardID;
  name: string;
  value: number;
  copies: number;
  effect: CardEffectType;
  targetRule: TargetRule;
  imageUrl?: string;
  iconUrl?: string;
  theme?: string;
}

export type CardEffectType =
  | "guess_knockout"
  | "peek_hand"
  | "compare_hands"
  | "protection"
  | "force_discard"
  | "swap_hands"
  | "forced_discard"
  | "princess_discard";

export type TargetRule =
  | "none"
  | "self"
  | "single_other"
  | "single_other_non_protected"
  | "optional_other";

export interface CardInstance {
  instanceId: string;
  cardId: CardID;
}

export interface PlayerState {
  id: PlayerID;
  name: string;
  hand: CardInstance[];
  discardPile: CardInstance[];
  status: PlayerStatus;
  protectedUntilNextTurn: boolean;
  tokens: number;
  isReady: boolean;
}

export interface PublicPlayerState {
  id: PlayerID;
  name: string;
  handCount: number;
  discardPile: CardInstance[];
  status: PlayerStatus;
  protectedUntilNextTurn: boolean;
  tokens: number;
  isReady: boolean;
}

export interface RoundState {
  deck: CardInstance[];
  setAsideCard: CardInstance | null;
  visibleRemovedCards: CardInstance[];
  currentPlayerId: PlayerID | null;
  turnNumber: number;
  roundWinners: PlayerID[];
  lastRoundStarterId: PlayerID | null;
}

export interface GameState {
  roomId: RoomID;
  creatorId: PlayerID;
  phase: GamePhase;
  players: PlayerState[];
  round: RoundState | null;
  roundWinnerIds: PlayerID[];
  matchWinnerIds: PlayerID[];
  log: GameEvent[];
}

export type GameEvent =
  | { type: "player_joined"; playerId: PlayerID; name: string }
  | { type: "player_left"; playerId: PlayerID; name: string }
  | { type: "player_ready_changed"; playerId: PlayerID; isReady: boolean }
  | { type: "round_started" }
  | { type: "card_drawn"; playerId: PlayerID }
  | { type: "card_played"; playerId: PlayerID; cardId: CardID }
  | { type: "card_guessed"; playerId: PlayerID; targetPlayerId: PlayerID; guessedValue: number }
  | { type: "card_compared"; playerId: PlayerID; targetPlayerId: PlayerID }
  | { type: "card_swapped"; playerId: PlayerID; targetPlayerId: PlayerID }
  | { type: "card_seen"; playerId: PlayerID; targetPlayerId: PlayerID; seenCardId: CardID }
  | { type: "player_protected"; playerId: PlayerID }
  | { type: "player_eliminated"; playerId: PlayerID; reason?: string; sourceCardId?: CardID }
  | { type: "round_ended"; winnerIds: PlayerID[] }
  | { type: "token_awarded"; playerId: PlayerID; tokens: number }
  | { type: "match_ended"; winnerIds: PlayerID[] };

export interface PublicGameState {
  roomId: RoomID;
  creatorId: PlayerID;
  phase: GamePhase;
  players: PublicPlayerState[];
  round: {
    deckCount: number;
    visibleRemovedCards: CardInstance[];
    currentPlayerId: PlayerID | null;
    turnNumber: number;
    roundWinners: PlayerID[];
    lastRoundStarterId: PlayerID | null;
  } | null;
  roundWinnerIds: PlayerID[];
  matchWinnerIds: PlayerID[];
  log: GameEvent[];
}

export interface PlayerViewState extends PublicGameState {
  selfPlayerId: PlayerID;
  players: Array<
    PublicPlayerState & {
      hand: CardInstance[];
    }
  >;
}
