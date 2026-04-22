// packages/shared/src/engine.ts

import { randomUUID } from "node:crypto";

import { BASE_CARDS } from "./cards.js";
import { resolvePlayAction } from "./rules.js";
import type { ActionResult } from "./rules.js";
import type { CardID, CardInstance, GameState, PlayerID, PlayerState, PlayerViewState, PublicGameState, RoomID } from "./types.js";

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildDeck(): CardInstance[] {
  const deck: CardInstance[] = [];
  for (const def of BASE_CARDS) {
    for (let i = 0; i < def.copies; i++) {
      deck.push({
        instanceId: `${def.id}-${i}-${randomUUID()}`,
        cardId: def.id,
      });
    }
  }
  return shuffle(deck);
}

function getActivePlayers(players: PlayerState[]): PlayerState[] {
  return players.filter((player) => player.status === "active");
}

function getPlayerById(players: PlayerState[], playerId: PlayerID): PlayerState | undefined {
  return players.find((player) => player.id === playerId);
}

function getCardValue(cardId: CardID): number {
  const card = BASE_CARDS.find((candidate) => candidate.id === cardId);
  if (!card) {
    throw new Error(`Unknown card id: ${cardId}`);
  }
  return card.value;
}

function getWinningTokenCount(playerCount: number): number {
  if (playerCount <= 2) return 7;
  if (playerCount === 3) return 5;
  return 4;
}

function getFirstActivePlayerId(players: PlayerState[]): PlayerID | null {
  return players.find((player) => player.status === "active")?.id ?? null;
}

export function canStartLobbyRound(state: GameState): boolean {
  return state.phase === "lobby" && state.players.length >= 2 && state.players.every((player) => player.isReady);
}

function drawToActivePlayer(state: GameState, playerId: PlayerID): GameState {
  if (!state.round) return state;

  const players = state.players.map((player) => ({
    ...player,
    hand: [...player.hand],
    discardPile: [...player.discardPile],
  }));
  const round = { ...state.round, deck: [...state.round.deck], visibleRemovedCards: [...state.round.visibleRemovedCards], roundWinners: [...state.round.roundWinners] };
  const player = getPlayerById(players, playerId);
  if (!player || player.status !== "active") {
    return state;
  }

  player.protectedUntilNextTurn = false;
  const drawn = round.deck.shift();
  if (drawn) {
    player.hand.push(drawn);
    return {
      ...state,
      players,
      round,
      log: [...state.log, { type: "card_drawn", playerId }],
    };
  }

  return {
    ...state,
    players,
    round,
  };
}

function getNextActivePlayerId(players: PlayerState[], currentPlayerId: PlayerID): PlayerID | null {
  const currentIndex = players.findIndex((player) => player.id === currentPlayerId);
  if (currentIndex === -1) return null;

  for (let offset = 1; offset <= players.length; offset += 1) {
    const candidate = players[(currentIndex + offset) % players.length];
    if (candidate.status === "active") {
      return candidate.id;
    }
  }

  return null;
}

function finishRound(state: GameState, winnerIds: PlayerID[]): GameState {
  const tokenTarget = getWinningTokenCount(state.players.length);
  const players = state.players.map((player) => {
    const nextTokens = winnerIds.includes(player.id) ? player.tokens + 1 : player.tokens;
    return {
      ...player,
      hand: [...player.hand],
      discardPile: [...player.discardPile],
      tokens: nextTokens,
    };
  });
  const matchWinnerIds = players.filter((player) => player.tokens >= tokenTarget).map((player) => player.id);
  const awardedLogs = players
    .filter((player) => winnerIds.includes(player.id))
    .map((player) => ({ type: "token_awarded" as const, playerId: player.id, tokens: player.tokens }));
  const endLogs = [
    ...state.log,
    { type: "round_ended" as const, winnerIds },
    ...awardedLogs,
    ...(matchWinnerIds.length > 0 ? [{ type: "match_ended" as const, winnerIds: matchWinnerIds }] : []),
  ];

  return {
    ...state,
    phase: matchWinnerIds.length > 0 ? "match_over" : "round_over",
    players,
    round: state.round
      ? {
          ...state.round,
          roundWinners: [...winnerIds],
        }
      : null,
    roundWinnerIds: [...winnerIds],
    matchWinnerIds,
    log: endLogs,
  };
}

function getRoundWinners(players: PlayerState[]): PlayerID[] {
  const activePlayers = getActivePlayers(players);
  if (activePlayers.length <= 1) {
    return activePlayers.map((player) => player.id);
  }

  const highestValue = Math.max(...activePlayers.map((player) => getCardValue(player.hand[0].cardId)));
  const highestPlayers = activePlayers.filter((player) => getCardValue(player.hand[0].cardId) === highestValue);
  if (highestPlayers.length <= 1) {
    return highestPlayers.map((player) => player.id);
  }

  const bestDiscardTotal = Math.max(
    ...highestPlayers.map((player) => player.discardPile.reduce((total, card) => total + getCardValue(card.cardId), 0)),
  );

  return highestPlayers
    .filter((player) => player.discardPile.reduce((total, card) => total + getCardValue(card.cardId), 0) === bestDiscardTotal)
    .map((player) => player.id);
}

export function createGame(roomId: RoomID, creatorId: PlayerID): GameState {
  return {
    roomId,
    creatorId,
    phase: "lobby",
    players: [],
    round: null,
    roundWinnerIds: [],
    matchWinnerIds: [],
    log: [],
  };
}

export function addPlayer(state: GameState, id: string, name: string): GameState {
  if (state.phase !== "lobby") return state;
  if (state.players.some((p) => p.id === id)) return state;

  const player: PlayerState = {
    id,
    name,
    hand: [],
    discardPile: [],
    status: "active",
    protectedUntilNextTurn: false,
    tokens: 0,
    isReady: false,
  };

  return {
    ...state,
    players: [...state.players, player],
    log: [...state.log, { type: "player_joined", playerId: id, name }],
  };
}

export function setPlayerReady(state: GameState, playerId: PlayerID, isReady: boolean): GameState {
  if (state.phase !== "lobby") return state;

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.isReady === isReady) return state;

  return {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            isReady,
          }
        : candidate,
    ),
    log: [...state.log, { type: "player_ready_changed", playerId, isReady }],
  };
}

export function removePlayer(state: GameState, playerId: PlayerID): GameState {
  const leavingPlayer = state.players.find((player) => player.id === playerId);
  if (!leavingPlayer) return state;

  const players = state.players.filter((player) => player.id !== playerId);
  const nextCreatorId = state.creatorId === playerId ? players[0]?.id ?? state.creatorId : state.creatorId;
  const round =
    state.round === null
      ? null
      : {
          ...state.round,
          currentPlayerId:
            state.round.currentPlayerId === playerId ? getFirstActivePlayerId(players) : state.round.currentPlayerId,
        };

  return {
    ...state,
    creatorId: nextCreatorId,
    players,
    round,
    roundWinnerIds: state.roundWinnerIds.filter((winnerId) => winnerId !== playerId),
    matchWinnerIds: state.matchWinnerIds.filter((winnerId) => winnerId !== playerId),
    log: [...state.log, { type: "player_left", playerId: leavingPlayer.id, name: leavingPlayer.name }],
  };
}

export function startRound(state: GameState): GameState {
  if (state.phase === "lobby" && !canStartLobbyRound(state)) return state;
  if (state.players.length < 2 || state.phase === "match_over") return state;

  const deck = buildDeck();
  const burned = deck.splice(0, 1);
  const visibleRemovedCards = state.players.length === 2 ? deck.splice(0, 3) : [];
  const starterId =
    state.roundWinnerIds.find((winnerId) => state.players.some((player) => player.id === winnerId)) ??
    state.players[0]?.id ??
    null;

  const players = state.players.map((p) => ({
    ...p,
    hand: [deck.shift()!],
    discardPile: [],
    status: "active" as const,
    protectedUntilNextTurn: false,
    isReady: false,
  }));

  const firstPlayerId = starterId;

  if (firstPlayerId) {
    const firstPlayer = getPlayerById(players, firstPlayerId);
    const firstDraw = deck.shift();
    if (firstPlayer && firstDraw) {
      firstPlayer.hand.push(firstDraw);
    }
  }

  const nextState: GameState = {
    ...state,
    phase: "in_round",
    players,
    round: {
      deck,
      setAsideCard: burned[0] ?? null,
      visibleRemovedCards,
      currentPlayerId: firstPlayerId,
      turnNumber: 1,
      roundWinners: [],
      lastRoundStarterId: firstPlayerId,
    },
    roundWinnerIds: [],
    log: [...state.log, { type: "round_started" }],
  };

  const nextLog = firstPlayerId ? [...nextState.log, { type: "card_drawn" as const, playerId: firstPlayerId }] : nextState.log;
  return {
    ...nextState,
    log: nextLog,
  };
}

export function playCard(
  state: GameState,
  playerId: PlayerID,
  instanceId: string,
  options: { targetPlayerId?: PlayerID; guessedValue?: number } = {},
): GameState {
  const result = playCardAction(state, playerId, instanceId, options);
  return result.state ?? state;
}

export function playCardAction(
  state: GameState,
  playerId: PlayerID,
  instanceId: string,
  options: { targetPlayerId?: PlayerID; guessedValue?: number } = {},
): ActionResult {
  const result = resolvePlayAction(state, {
    type: "play_card",
    playerId,
    instanceId,
    targetPlayerId: options.targetPlayerId,
    guessedValue: options.guessedValue,
  });

  if (!result.ok || !result.state || !result.state.round) {
    return result;
  }

  const resolvedState = result.state;
  const resolvedRound = resolvedState.round!;
  const activePlayers = getActivePlayers(resolvedState.players);

  if (activePlayers.length <= 1) {
    return {
      ...result,
      state: finishRound(resolvedState, activePlayers.map((player) => player.id)),
    };
  }

  if (resolvedRound.deck.length === 0) {
    return {
      ...result,
      state: finishRound(resolvedState, getRoundWinners(resolvedState.players)),
    };
  }

  const nextPlayerId = getNextActivePlayerId(resolvedState.players, playerId);
  if (!nextPlayerId) {
    return {
      ...result,
      state: finishRound(resolvedState, getRoundWinners(resolvedState.players)),
    };
  }

  const advancedState: GameState = {
    ...resolvedState,
    round: {
      ...resolvedRound,
      currentPlayerId: nextPlayerId,
      turnNumber: resolvedRound.turnNumber + 1,
    },
  };

  return {
    ...result,
    state: drawToActivePlayer(advancedState, nextPlayerId),
  };
}

export function toPublicGameState(state: GameState): PublicGameState {
  return {
    roomId: state.roomId,
    creatorId: state.creatorId,
    phase: state.phase,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      handCount: player.hand.length,
      discardPile: [...player.discardPile],
      status: player.status,
      protectedUntilNextTurn: player.protectedUntilNextTurn,
      tokens: player.tokens,
      isReady: player.isReady,
    })),
    round: state.round
      ? {
          deckCount: state.round.deck.length,
          visibleRemovedCards: [...state.round.visibleRemovedCards],
          currentPlayerId: state.round.currentPlayerId,
          turnNumber: state.round.turnNumber,
          roundWinners: [...state.round.roundWinners],
          lastRoundStarterId: state.round.lastRoundStarterId,
        }
      : null,
    roundWinnerIds: [...state.roundWinnerIds],
    matchWinnerIds: [...state.matchWinnerIds],
    log: [...state.log],
  };
}

export function toPlayerViewState(state: GameState, selfPlayerId: PlayerID): PlayerViewState {
  return {
    ...toPublicGameState(state),
    selfPlayerId,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      handCount: player.hand.length,
      hand: player.id === selfPlayerId ? [...player.hand] : [],
      discardPile: [...player.discardPile],
      status: player.status,
      protectedUntilNextTurn: player.protectedUntilNextTurn,
      tokens: player.tokens,
      isReady: player.isReady,
    })),
  };
}
