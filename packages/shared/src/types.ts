// packages/shared/src/types.ts

export type PlayerID = string;
export type RoomID = string;
export type CardID = string;

export type PlayerStatus = "active" | "eliminated";

export type Visibility = "private" | "public";

export interface CardDef {
  id: string;
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
  | "self_discard"
  | "score_high";

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
  status: PlayerStatus;
  protectedUntilNextTurn: boolean;
  score: number;
}

export interface PublicPlayerState {
  id: PlayerID;
  name: string;
  handCount: number;
  status: PlayerStatus;
  protectedUntilNextTurn: boolean;
  score: number;
}

export interface RoundState {
  deck: CardInstance[];
  discardPile: CardInstance[];
  burnedCardCount: number;
  currentPlayerId: PlayerID | null;
  turnNumber: number;
}

export interface GameState {
  roomId: RoomID;
  phase: "lobby" | "in_round" | "round_over" | "match_over";
  players: PlayerState[];
  round: RoundState | null;
  winnerId: PlayerID | null;
  log: GameEvent[];
}

export type GameEvent =
  | { type: "player_joined"; playerId: PlayerID; name: string }
  | { type: "round_started" }
  | { type: "card_drawn"; playerId: PlayerID }
  | { type: "card_played"; playerId: PlayerID; cardId: CardID }
  | { type: "player_eliminated"; playerId: PlayerID }
  | { type: "round_ended"; winnerId: PlayerID | null }
  | { type: "score_updated"; playerId: PlayerID; score: number };

export interface PublicGameState {
  roomId: RoomID;
  phase: GameState["phase"];
  players: PublicPlayerState[];
  round: {
    discardPile: CardInstance[];
    deckCount: number;
    burnedCardCount: number;
    currentPlayerId: PlayerID | null;
    turnNumber: number;
  } | null;
  winnerId: PlayerID | null;
  log: GameEvent[];
}