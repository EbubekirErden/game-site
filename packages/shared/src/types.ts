// packages/shared/src/types.ts

export type PlayerID = string;
export type RoomID = string;
export type LoveLetterMode = "classic" | "premium";
export type CardID =
  | "assassin"
  | "jester"
  | "guard"
  | "cardinal"
  | "priest"
  | "baron"
  | "baroness"
  | "handmaid"
  | "sycophant"
  | "prince"
  | "count"
  | "constable"
  | "king"
  | "countess"
  | "dowager_queen"
  | "princess"
  | "bishop";

export type PlayerStatus = "active" | "eliminated";
export type GamePhase = "lobby" | "in_round" | "round_over" | "match_over";

export interface CardDef {
  id: CardID;
  name: string;
  value: number;
  classicCopies: number;
  premiumCopies: number;
  effect: CardEffectType;
  targetRule: TargetRule;
  imageUrl?: string;
  iconUrl?: string;
  theme?: string;
}

export type CardEffectType =
  | "assassin_reaction"
  | "jester_prediction"
  | "guess_knockout"
  | "swap_two_hands"
  | "peek_hand"
  | "compare_hands"
  | "peek_up_to_two_hands"
  | "protection"
  | "mandate_target"
  | "force_discard"
  | "count_bonus"
  | "bonus_on_eliminated"
  | "swap_hands"
  | "forced_discard"
  | "reverse_compare_hands"
  | "token_guess"
  | "princess_discard";

export type TargetRule =
  | "none"
  | "self"
  | "single_any"
  | "single_other"
  | "single_other_non_protected"
  | "optional_other"
  | "up_to_two_other_non_protected"
  | "two_distinct_players";

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
  forcedTargetPlayerId: PlayerID | null;
  jesterAssignments: Array<{
    playerId: PlayerID;
    targetPlayerId: PlayerID;
  }>;
}

export interface GameState {
  roomId: RoomID;
  creatorId: PlayerID;
  mode: LoveLetterMode;
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
  | { type: "card_guessed"; playerId: PlayerID; targetPlayerId: PlayerID; guessedValue: number; sourceCardId?: CardID }
  | { type: "card_compared"; playerId: PlayerID; targetPlayerId: PlayerID; sourceCardId?: CardID }
  | { type: "card_swapped"; playerId: PlayerID; targetPlayerId: PlayerID; sourceCardId?: CardID }
  | { type: "card_seen"; playerId: PlayerID; targetPlayerId: PlayerID; seenCardId: CardID; sourceCardId?: CardID }
  | { type: "player_protected"; playerId: PlayerID; sourceCardId?: CardID }
  | { type: "player_eliminated"; playerId: PlayerID; reason?: string; sourceCardId?: CardID }
  | { type: "round_ended"; winnerIds: PlayerID[] }
  | { type: "token_awarded"; playerId: PlayerID; tokens: number }
  | { type: "match_ended"; winnerIds: PlayerID[] };

export interface PublicGameState {
  roomId: RoomID;
  creatorId: PlayerID;
  mode: LoveLetterMode;
  phase: GamePhase;
  players: PublicPlayerState[];
  round: {
    deckCount: number;
    visibleRemovedCards: CardInstance[];
    currentPlayerId: PlayerID | null;
    turnNumber: number;
    roundWinners: PlayerID[];
    lastRoundStarterId: PlayerID | null;
    forcedTargetPlayerId: PlayerID | null;
    jesterAssignments: Array<{
      playerId: PlayerID;
      targetPlayerId: PlayerID;
    }>;
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
