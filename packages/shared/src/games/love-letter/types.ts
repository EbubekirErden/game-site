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

export interface SpectatorState {
  id: PlayerID;
  name: string;
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
  pendingCardinalPeek: {
    actorPlayerId: PlayerID;
    targetPlayerIds: [PlayerID, PlayerID];
  } | null;
}

export interface GameState {
  gameId: "love-letter";
  roomId: RoomID;
  creatorId: PlayerID;
  mode: LoveLetterMode;
  phase: GamePhase;
  players: PlayerState[];
  round: RoundState | null;
  roundWinnerIds: PlayerID[];
  matchWinnerIds: PlayerID[];
  spectators: SpectatorState[];
  log: GameEvent[];
}

export type GameEvent =
  | { type: "player_joined"; playerId: PlayerID; name: string }
  | { type: "player_left"; playerId: PlayerID; name: string }
  | { type: "spectator_joined"; spectatorId: PlayerID; name: string }
  | { type: "spectator_left"; spectatorId: PlayerID; name: string }
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
  gameId: "love-letter";
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
    pendingCardinalPeek: {
      actorPlayerId: PlayerID;
      targetPlayerIds: [PlayerID, PlayerID];
    } | null;
  } | null;
  roundWinnerIds: PlayerID[];
  matchWinnerIds: PlayerID[];
  spectators: SpectatorState[];
  log: GameEvent[];
}

export interface PlayerViewState extends PublicGameState {
  selfPlayerId: PlayerID;
  selfRole: "player" | "spectator";
  players: Array<
    PublicPlayerState & {
      hand: CardInstance[];
    }
  >;
}

export type BotObservedCardLocation = "hand" | "discard";
export type BotObservedCardSource =
  | "peek"
  | "multi_peek"
  | "compare"
  | "cardinal_reveal"
  | "discard_reveal"
  | "guess";

export interface BotObservedCardFact {
  factId: string;
  effectId: string;
  viewerPlayerId: PlayerID;
  actorPlayerId: PlayerID;
  playerId: PlayerID;
  playerName: string;
  card: CardInstance | null;
  location: BotObservedCardLocation;
  source: BotObservedCardSource;
  turnNumber: number;
  note: string;
}

export interface BotMemorySnapshot {
  observedPrivateEffects: PrivateEffectPresentation[];
  observedCardFacts: BotObservedCardFact[];
}

export interface BotObservation extends PlayerViewState {
  memory: BotMemorySnapshot;
}

export type PrivateEffectVisibility = "actor_only" | "actor_and_target" | "actor_and_targets";
export type PrivateEffectDecision = "none" | "cardinal_peek_choice";

interface PrivateEffectBase {
  effectId: string;
  turnNumber: number;
  viewerPlayerId: PlayerID;
  actorPlayerId: PlayerID;
  cardId: CardID;
  visibleTo: PrivateEffectVisibility;
  requiresDecision: PrivateEffectDecision;
  title: string;
  message: string;
}

export type PrivateEffectPresentation =
  | (PrivateEffectBase & {
      kind: "message";
      reminderKey?: "count" | "constable" | "jester";
      highlightPlayerId?: PlayerID | null;
      isFizzle?: boolean;
    })
  | (PrivateEffectBase & {
      kind: "peek";
      targetPlayerId: PlayerID;
      targetPlayerName: string;
      revealedCard: CardInstance | null;
    })
  | (PrivateEffectBase & {
      kind: "compare";
      compareMode: "lower_loses" | "higher_loses";
      selfPlayerId: PlayerID;
      selfPlayerName: string;
      selfCard: CardInstance | null;
      opposingPlayerId: PlayerID;
      opposingPlayerName: string;
      opposingCard: CardInstance | null;
      winningPlayerId: PlayerID | null;
      losingPlayerId: PlayerID | null;
    })
  | (PrivateEffectBase & {
      kind: "swap";
      swapMode: "king" | "cardinal";
      players: [
        { playerId: PlayerID; playerName: string; cardCount: number },
        { playerId: PlayerID; playerName: string; cardCount: number },
      ];
      peekChoices?: Array<{ playerId: PlayerID; playerName: string }>;
    })
  | (PrivateEffectBase & {
      kind: "discard_reveal";
      targetPlayerId: PlayerID;
      targetPlayerName: string;
      discardedCard: CardInstance | null;
      drewReplacement: boolean;
      causedElimination: boolean;
      eliminationReason?: string;
    })
  | (PrivateEffectBase & {
      kind: "guess";
      guessMode: "guard" | "bishop";
      targetPlayerId: PlayerID;
      targetPlayerName: string;
      guessedValue: number;
      guessedCardIds: CardID[];
      revealedCards: CardInstance[];
      outcome: "correct" | "wrong" | "assassin_rebound";
      eliminatedPlayerId?: PlayerID;
      tokenAwarded?: boolean;
      outcomeMessage: string;
    })
  | (PrivateEffectBase & {
      kind: "multi_peek";
      seen: Array<{
        targetPlayerId: PlayerID;
        targetPlayerName: string;
        revealedCard: CardInstance | null;
      }>;
    })
  | (PrivateEffectBase & {
      kind: "cardinal_reveal";
      chosenPlayerId: PlayerID;
      chosenPlayerName: string;
      revealedCard: CardInstance | null;
    });
