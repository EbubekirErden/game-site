import { randomUUID } from "node:crypto";

import { getCardCopies, getCardDef, getCardsForMode } from "./cards.js";
import { resolveCardinalPeekAction, resolvePlayAction } from "./rules.js";
import type { ActionResult } from "./rules.js";
import type { BotMemorySnapshot, BotObservation, CardID, CardInstance, GameState, LoveLetterMode, PlayerID, PlayerState, PlayerViewState, PublicGameState, RoomID } from "./types.js";

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildDeck(mode: LoveLetterMode): CardInstance[] {
  const deck: CardInstance[] = [];

  for (const def of getCardsForMode(mode)) {
    const copies = getCardCopies(def.id, mode);
    for (let i = 0; i < copies; i += 1) {
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
  return getCardDef(cardId).value;
}

function getWinningTokenCount(mode: LoveLetterMode, playerCount: number): number {
  if (mode === "premium") return 4;
  if (playerCount <= 2) return 7;
  if (playerCount === 3) return 5;
  return 4;
}

function getFirstActivePlayerId(players: PlayerState[]): PlayerID | null {
  return players.find((player) => player.status === "active")?.id ?? null;
}

function getImmediateMatchLeaders(state: GameState): PlayerID[] {
  const tokenTarget = getWinningTokenCount(state.mode, state.players.length);
  const contenders = state.players.filter((player) => player.tokens >= tokenTarget);
  if (contenders.length === 0) return [];

  const highestTokens = Math.max(...contenders.map((player) => player.tokens));
  return contenders.filter((player) => player.tokens === highestTokens).map((player) => player.id);
}

function finalizeMatchIfWon(state: GameState): GameState {
  const leaders = getImmediateMatchLeaders(state);
  if (leaders.length === 0) return state;

  if (state.mode === "premium" && leaders.length > 1) {
    return {
      ...state,
      matchWinnerIds: [],
    };
  }

  return {
    ...state,
    phase: "match_over",
    matchWinnerIds: [...leaders],
    log: [...state.log, { type: "match_ended", winnerIds: leaders }],
  };
}

function getCountBonus(player: PlayerState): number {
  return player.discardPile.filter((card) => card.cardId === "count").length;
}

function getRoundHandStrength(player: PlayerState, mode: LoveLetterMode): number {
  const card = player.hand[0];
  if (!card) return Number.NEGATIVE_INFINITY;

  return getCardValue(card.cardId) + (mode === "premium" ? getCountBonus(player) : 0);
}

function princessBeatsBishop(player: PlayerState, opponent: PlayerState, mode: LoveLetterMode): boolean {
  if (mode !== "premium") return false;

  const playerCard = player.hand[0]?.cardId ?? null;
  const opponentCard = opponent.hand[0]?.cardId ?? null;
  if (!playerCard || !opponentCard) return false;

  const playerStrength = getRoundHandStrength(player, mode);
  const opponentStrength = getRoundHandStrength(opponent, mode);

  return playerCard === "princess" && opponentCard === "bishop" && playerStrength === 8 && opponentStrength === 9;
}

export function canStartLobbyRound(state: GameState): boolean {
  return state.phase === "lobby" && state.players.length >= 2 && state.players.every((player) => player.isReady);
}

export function canStartReadyRound(state: GameState): boolean {
  return (state.phase === "lobby" || state.phase === "round_over") && state.players.length >= 2 && state.players.every((player) => player.isReady);
}

function drawToActivePlayer(state: GameState, playerId: PlayerID): GameState {
  if (!state.round) return state;

  const players = state.players.map((player) => ({
    ...player,
    hand: [...player.hand],
    discardPile: [...player.discardPile],
  }));
  const round = {
    ...state.round,
    deck: [...state.round.deck],
    visibleRemovedCards: [...state.round.visibleRemovedCards],
    roundWinners: [...state.round.roundWinners],
    jesterAssignments: [...state.round.jesterAssignments],
  };
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
  const players = state.players.map((player) => ({
    ...player,
    hand: [...player.hand],
    discardPile: [...player.discardPile],
  }));
  const log = [...state.log, { type: "round_ended" as const, winnerIds }];

  for (const winnerId of winnerIds) {
    const winner = players.find((player) => player.id === winnerId);
    if (!winner) continue;
    winner.tokens += 1;
    log.push({ type: "token_awarded", playerId: winner.id, tokens: winner.tokens });
  }

  for (const assignment of state.round?.jesterAssignments ?? []) {
    if (!winnerIds.includes(assignment.targetPlayerId)) continue;

    const bettor = players.find((player) => player.id === assignment.playerId);
    if (!bettor) continue;
    bettor.tokens += 1;
    log.push({ type: "token_awarded", playerId: bettor.id, tokens: bettor.tokens });
  }

  const nextState: GameState = {
    ...state,
    phase: "round_over",
    players,
    round: state.round
      ? {
          ...state.round,
          roundWinners: [...winnerIds],
        }
      : null,
    roundWinnerIds: [...winnerIds],
    matchWinnerIds: [],
    log,
  };

  return finalizeMatchIfWon(nextState);
}

function getRoundWinners(players: PlayerState[], mode: LoveLetterMode): PlayerID[] {
  const activePlayers = getActivePlayers(players);
  if (activePlayers.length <= 1) {
    return activePlayers.map((player) => player.id);
  }

  let bestStrength = Number.NEGATIVE_INFINITY;
  let highestPlayers: PlayerState[] = [];

  for (const player of activePlayers) {
    const strength = getRoundHandStrength(player, mode);
    if (strength > bestStrength) {
      bestStrength = strength;
      highestPlayers = [player];
      continue;
    }

    if (strength === bestStrength) {
      highestPlayers.push(player);
    }
  }

  if (mode === "premium") {
    const princessPlayers = highestPlayers.filter((player) =>
      highestPlayers.some((opponent) => princessBeatsBishop(player, opponent, mode)),
    );
    if (princessPlayers.length > 0) {
      highestPlayers = princessPlayers;
    }
  }

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

export function createGame(roomId: RoomID, creatorId: PlayerID, mode: LoveLetterMode = "classic"): GameState {
  return {
    gameId: "love-letter",
    roomId,
    creatorId,
    mode,
    phase: "lobby",
    players: [],
    round: null,
    roundWinnerIds: [],
    matchWinnerIds: [],
    spectators: [],
    log: [],
  };
}

export function addPlayer(state: GameState, id: string, name: string): GameState {
  if (state.phase !== "lobby") return state;
  if (state.players.some((player) => player.id === id)) return state;
  if (state.spectators.some((spectator) => spectator.id === id)) return state;

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

export function addSpectator(state: GameState, id: string, name: string): GameState {
  if (state.players.some((player) => player.id === id)) return state;
  if (state.spectators.some((spectator) => spectator.id === id)) return state;

  return {
    ...state,
    spectators: [...state.spectators, { id, name }],
    log: [...state.log, { type: "spectator_joined", spectatorId: id, name }],
  };
}

export function removeSpectator(state: GameState, spectatorId: PlayerID): GameState {
  const leavingSpectator = state.spectators.find((spectator) => spectator.id === spectatorId);
  if (!leavingSpectator) return state;

  return {
    ...state,
    spectators: state.spectators.filter((spectator) => spectator.id !== spectatorId),
    log: [...state.log, { type: "spectator_left", spectatorId: leavingSpectator.id, name: leavingSpectator.name }],
  };
}

export function setPlayerReady(state: GameState, playerId: PlayerID, isReady: boolean): GameState {
  if (state.phase !== "lobby" && state.phase !== "round_over") return state;

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

export function setGameMode(state: GameState, playerId: PlayerID, mode: LoveLetterMode): GameState {
  if (state.phase !== "lobby") return state;
  if (state.creatorId !== playerId) return state;
  if (state.mode === mode) return state;

  return {
    ...state,
    mode,
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
          forcedTargetPlayerId:
            state.round.forcedTargetPlayerId === playerId ? null : state.round.forcedTargetPlayerId,
          jesterAssignments: state.round.jesterAssignments.filter(
            (assignment) => assignment.playerId !== playerId && assignment.targetPlayerId !== playerId,
          ),
          pendingCardinalPeek:
            state.round.pendingCardinalPeek &&
            (state.round.pendingCardinalPeek.actorPlayerId === playerId ||
              state.round.pendingCardinalPeek.targetPlayerIds.includes(playerId))
              ? null
              : state.round.pendingCardinalPeek,
        };

  const nextState: GameState = {
    ...state,
    creatorId: nextCreatorId,
    players,
    round,
    roundWinnerIds: state.roundWinnerIds.filter((winnerId) => winnerId !== playerId),
    matchWinnerIds: state.matchWinnerIds.filter((winnerId) => winnerId !== playerId),
    log: [...state.log, { type: "player_left", playerId: leavingPlayer.id, name: leavingPlayer.name }],
  };

  if (players.length === 0) {
    return nextState;
  }

  if (state.phase === "in_round") {
    const activePlayers = getActivePlayers(players);
    if (activePlayers.length <= 1) {
      const finished = finishRound(nextState, activePlayers.map((player) => player.id));
      if (finished.phase !== "match_over" && finished.players.length < 2) {
        return {
          ...finished,
          phase: "lobby",
          round: null,
          players: finished.players.map((player) => ({
            ...player,
            hand: [],
            discardPile: [],
            status: "active",
            protectedUntilNextTurn: false,
            isReady: false,
          })),
        };
      }

      return finished;
    }
  }

  if ((state.phase === "lobby" || state.phase === "round_over") && players.length < 2) {
    return {
      ...nextState,
      phase: "lobby",
      round: null,
      players: nextState.players.map((player) => ({
        ...player,
        hand: [],
        discardPile: [],
        status: "active",
        protectedUntilNextTurn: false,
        isReady: false,
      })),
    };
  }

  return nextState;
}

export function resetMatchToLobby(state: GameState): GameState {
  if (state.phase !== "match_over") return state;

  const promotedPlayers: PlayerState[] = state.spectators
    .filter((spectator) => !state.players.some((player) => player.id === spectator.id))
    .map((spectator) => ({
      id: spectator.id,
      name: spectator.name,
      hand: [],
      discardPile: [],
      status: "active" as const,
      protectedUntilNextTurn: false,
      tokens: 0,
      isReady: false,
    }));

  return {
    ...state,
    phase: "lobby",
    creatorId: state.players.some((player) => player.id === state.creatorId)
      ? state.creatorId
      : state.players[0]?.id ?? promotedPlayers[0]?.id ?? state.creatorId,
    players: [
      ...state.players.map((player) => ({
        ...player,
        hand: [],
        discardPile: [],
        status: "active" as const,
        protectedUntilNextTurn: false,
        tokens: 0,
        isReady: false,
      })),
      ...promotedPlayers,
    ],
    round: null,
    roundWinnerIds: [],
    matchWinnerIds: [],
    spectators: [],
  };
}

export function startRound(state: GameState): GameState {
  if ((state.phase === "lobby" || state.phase === "round_over") && !canStartReadyRound(state)) return state;
  if (state.players.length < 2 || state.phase === "match_over") return state;

  const deck = buildDeck(state.mode);
  const burned = deck.splice(0, 1);
  const visibleRemovedCards = state.players.length === 2 ? deck.splice(0, 3) : [];
  const starterId =
    state.roundWinnerIds.find((winnerId) => state.players.some((player) => player.id === winnerId)) ??
    state.players[0]?.id ??
    null;

  const players = state.players.map((player) => ({
    ...player,
    hand: [deck.shift()!],
    discardPile: [],
    status: "active" as const,
    protectedUntilNextTurn: false,
    isReady: false,
  }));

  if (starterId) {
    const firstPlayer = getPlayerById(players, starterId);
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
      currentPlayerId: starterId,
      turnNumber: 1,
      roundWinners: [],
      lastRoundStarterId: starterId,
      forcedTargetPlayerId: null,
      jesterAssignments: [],
      pendingCardinalPeek: null,
    },
    roundWinnerIds: [],
    matchWinnerIds: [],
    log: [...state.log, { type: "round_started" }],
  };

  return starterId
    ? {
        ...nextState,
        log: [...nextState.log, { type: "card_drawn", playerId: starterId }],
      }
    : nextState;
}

export function playCard(
  state: GameState,
  playerId: PlayerID,
  instanceId: string,
  options: { targetPlayerId?: PlayerID; targetPlayerIds?: PlayerID[]; guessedValue?: number } = {},
): GameState {
  const result = playCardAction(state, playerId, instanceId, options);
  return result.state ?? state;
}

function advanceAfterResolvedAction(result: ActionResult, actingPlayerId: PlayerID): ActionResult {
  if (!result.ok || !result.state || !result.state.round) {
    return result;
  }

  if (result.state.round.pendingCardinalPeek) {
    return result;
  }

  const resolvedState = finalizeMatchIfWon(result.state);
  if (resolvedState.phase === "match_over") {
    return {
      ...result,
      state: resolvedState,
    };
  }

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
      state: finishRound(resolvedState, getRoundWinners(resolvedState.players, resolvedState.mode)),
    };
  }

  const nextPlayerId = getNextActivePlayerId(resolvedState.players, actingPlayerId);
  if (!nextPlayerId) {
    return {
      ...result,
      state: finishRound(resolvedState, getRoundWinners(resolvedState.players, resolvedState.mode)),
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

export function playCardAction(
  state: GameState,
  playerId: PlayerID,
  instanceId: string,
  options: { targetPlayerId?: PlayerID; targetPlayerIds?: PlayerID[]; guessedValue?: number } = {},
): ActionResult {
  return advanceAfterResolvedAction(
    resolvePlayAction(state, {
      type: "play_card",
      playerId,
      instanceId,
      targetPlayerId: options.targetPlayerId,
      targetPlayerIds: options.targetPlayerIds,
      guessedValue: options.guessedValue,
    }),
    playerId,
  );
}

export function cardinalPeekAction(
  state: GameState,
  playerId: PlayerID,
  targetPlayerId: PlayerID,
): ActionResult {
  return advanceAfterResolvedAction(
    resolveCardinalPeekAction(state, {
      type: "cardinal_peek",
      playerId,
      targetPlayerId,
    }),
    playerId,
  );
}

export function playCardActionWithoutAdvance(
  state: GameState,
  playerId: PlayerID,
  instanceId: string,
  options: { targetPlayerId?: PlayerID; targetPlayerIds?: PlayerID[]; guessedValue?: number } = {},
): ActionResult {
  return resolvePlayAction(state, {
    type: "play_card",
    playerId,
    instanceId,
    targetPlayerId: options.targetPlayerId,
    targetPlayerIds: options.targetPlayerIds,
    guessedValue: options.guessedValue,
  });
}

export function toPublicGameState(state: GameState): PublicGameState {
  return {
    gameId: state.gameId,
    roomId: state.roomId,
    creatorId: state.creatorId,
    mode: state.mode,
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
          forcedTargetPlayerId: state.round.forcedTargetPlayerId,
          jesterAssignments: [...state.round.jesterAssignments],
          pendingCardinalPeek: state.round.pendingCardinalPeek
            ? {
                actorPlayerId: state.round.pendingCardinalPeek.actorPlayerId,
                targetPlayerIds: [...state.round.pendingCardinalPeek.targetPlayerIds] as [PlayerID, PlayerID],
              }
            : null,
        }
      : null,
    roundWinnerIds: [...state.roundWinnerIds],
    matchWinnerIds: [...state.matchWinnerIds],
    spectators: [...state.spectators],
    log: [...state.log],
  };
}

export function toPlayerViewState(state: GameState, selfPlayerId: PlayerID): PlayerViewState {
  const selfRole = state.players.some((player) => player.id === selfPlayerId) ? "player" : "spectator";

  return {
    ...toPublicGameState(state),
    selfPlayerId,
    selfRole,
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

export function toBotObservation(
  state: GameState,
  selfPlayerId: PlayerID,
  memory: BotMemorySnapshot = {
    observedPrivateEffects: [],
    observedCardFacts: [],
  },
): BotObservation {
  return {
    ...toPlayerViewState(state, selfPlayerId),
    memory: {
      observedPrivateEffects: [...memory.observedPrivateEffects],
      observedCardFacts: [...memory.observedCardFacts],
    },
  };
}
