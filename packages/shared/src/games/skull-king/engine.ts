import { randomUUID } from "node:crypto";

import { buildSkullKingDeck } from "./cards.js";
import { getNextPlayerId, getNextTrickLeadPlayerId, getTrickBonusEvents, getWinningPlayIndex, materializePlayedCard, canPlayCard } from "./rules.js";
import { applyRoundScores } from "./scoring.js";
import type {
  PlayerID,
  PlayerOrderMode,
  RoomID,
  SkullKingActionResult,
  SkullKingBotStrategy,
  SkullKingCardInstance,
  SkullKingCompletedTrick,
  SkullKingGameState,
  SkullKingPlayerState,
  SkullKingPlayerViewState,
  SkullKingSettings,
  SkullKingSpectatorState,
  TigressPlayMode,
} from "./types.js";

const DEFAULT_SETTINGS: SkullKingSettings = {
  turnDurationSeconds: 20,
  orderMode: "fixed",
};

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createCardId(): string {
  return randomUUID();
}

function clonePlayers(players: SkullKingPlayerState[]): SkullKingPlayerState[] {
  return players.map((player) => ({
    ...player,
    hand: [...player.hand],
  }));
}

function getRoundPlayerOrder(players: SkullKingPlayerState[], completedRoundCount: number, orderMode: PlayerOrderMode): PlayerID[] {
  if (orderMode === "fixed") return players.map((player) => player.id);
  if (orderMode === "reverse_each_round" && completedRoundCount % 2 === 1) return [...players.map((player) => player.id)].reverse();
  if (orderMode === "rotate_each_round") {
    const ids = players.map((player) => player.id);
    const offset = ids.length === 0 ? 0 : completedRoundCount % ids.length;
    return [...ids.slice(offset), ...ids.slice(0, offset)];
  }
  return players.map((player) => player.id);
}

function findPlayer(players: SkullKingPlayerState[], playerId: PlayerID): SkullKingPlayerState | undefined {
  return players.find((player) => player.id === playerId);
}

function getRoundMax(state: SkullKingGameState): number {
  return 10;
}

function scoreCurrentRound(state: SkullKingGameState): SkullKingGameState {
  if (!state.round) return state;

  const bonusEvents = state.round.completedTricks.flatMap((trick) => trick.bonusEvents);
  const scoredPlayers = applyRoundScores(state.players, state.round.roundNumber, bonusEvents).map((player) => ({
    ...player,
    bid: null,
    tricksWon: 0,
    hand: [],
    isReady: Boolean(player.isBot),
  }));
  const highestScore = Math.max(...scoredPlayers.map((player) => player.totalScore));
  const isFinalRound = state.round.roundNumber >= getRoundMax(state);

  return {
    ...state,
    phase: isFinalRound ? "match_over" : "round_over",
    players: scoredPlayers,
    round: null,
    completedRoundCount: state.completedRoundCount + 1,
    matchWinnerIds: isFinalRound ? scoredPlayers.filter((player) => player.totalScore === highestScore).map((player) => player.id) : [],
    log: [
      ...state.log,
      { type: "round_scored", roundNumber: state.round.roundNumber },
      ...(isFinalRound ? [{ type: "match_ended" as const, winnerIds: scoredPlayers.filter((player) => player.totalScore === highestScore).map((player) => player.id) }] : []),
    ],
  };
}

export function resolveCurrentTrick(state: SkullKingGameState): SkullKingGameState {
  if (!state.round) return state;
  if (state.phase !== "playing") return state;
  if (state.round.currentTrick.plays.length !== state.round.playerOrder.length) return state;

  const winningPlayIndex = state.round.currentTrick.winningPlayIndex;
  const winnerPlayerId = winningPlayIndex === null ? null : state.round.currentTrick.plays[winningPlayIndex]?.playerId ?? null;
  const completedTrick: SkullKingCompletedTrick = {
    trickNumber: state.round.currentTrick.trickNumber,
    leadPlayerId: state.round.currentTrick.leadPlayerId,
    plays: [...state.round.currentTrick.plays],
    winnerPlayerId,
    winningPlayIndex,
    bonusEvents: [],
  };
  completedTrick.bonusEvents = getTrickBonusEvents(completedTrick);

  const players = clonePlayers(state.players);
  if (winnerPlayerId) {
    const winner = findPlayer(players, winnerPlayerId);
    if (winner) winner.tricksWon += 1;
  }

  const roundNumber = state.round.roundNumber;
  const playedOutRound = players.every((player) => player.hand.length === 0);
  if (playedOutRound) {
    return scoreCurrentRound({
      ...state,
      players,
      round: {
        ...state.round,
        completedTricks: [...state.round.completedTricks, completedTrick],
      },
      log: [...state.log, { type: "trick_completed", trickNumber: completedTrick.trickNumber, winnerPlayerId }],
    });
  }

  const nextLeadPlayerId = winnerPlayerId ?? getNextTrickLeadPlayerId(completedTrick.plays) ?? state.round.leadPlayerId;
  return {
    ...state,
    players,
    round: {
      ...state.round,
      leadPlayerId: nextLeadPlayerId,
      currentPlayerId: nextLeadPlayerId,
      turnStartedAt: Date.now(),
      completedTricks: [...state.round.completedTricks, completedTrick],
      currentTrick: {
        trickNumber: completedTrick.trickNumber + 1,
        leadPlayerId: nextLeadPlayerId,
        plays: [],
        winningPlayIndex: null,
      },
    },
    log: [...state.log, { type: "trick_completed", trickNumber: completedTrick.trickNumber, winnerPlayerId }],
  };
}

export function createGame(roomId: RoomID, creatorId: PlayerID): SkullKingGameState {
  return {
    gameId: "skull-king",
    roomId,
    creatorId,
    phase: "lobby",
    players: [],
    spectators: [],
    settings: DEFAULT_SETTINGS,
    round: null,
    completedRoundCount: 0,
    matchWinnerIds: [],
    log: [],
  };
}

export function addPlayer(state: SkullKingGameState, id: string, name: string, options?: { isBot?: boolean; botStrategy?: SkullKingBotStrategy }): SkullKingGameState {
  if (state.phase !== "lobby") return state;
  if (state.players.some((player) => player.id === id) || state.spectators.some((spectator) => spectator.id === id)) return state;

  return {
    ...state,
    players: [
      ...state.players,
      {
        id,
        name,
        isBot: options?.isBot,
        botStrategy: options?.isBot ? options.botStrategy ?? "random" : undefined,
        hand: [],
        bid: null,
        tricksWon: 0,
        roundScore: 0,
        bonusScore: 0,
        totalScore: 0,
        isReady: false,
      },
    ],
    log: [...state.log, { type: "player_joined", playerId: id, name }],
  };
}

export function addSpectator(state: SkullKingGameState, id: string, name: string): SkullKingGameState {
  if (state.players.some((player) => player.id === id) || state.spectators.some((spectator) => spectator.id === id)) return state;
  return {
    ...state,
    spectators: [...state.spectators, { id, name }],
    log: [...state.log, { type: "spectator_joined", spectatorId: id, name }],
  };
}

export function setPlayerReady(state: SkullKingGameState, playerId: PlayerID, isReady: boolean): SkullKingGameState {
  if (state.phase !== "lobby" && state.phase !== "round_over") return state;
  return {
    ...state,
    players: state.players.map((player) => (player.id === playerId ? { ...player, isReady } : player)),
    log: [...state.log, { type: "player_ready_changed", playerId, isReady }],
  };
}

export function updateSettings(state: SkullKingGameState, playerId: PlayerID, settings: Partial<SkullKingSettings>): SkullKingGameState {
  if (state.creatorId !== playerId || state.phase !== "lobby") return state;
  const turnDurationSeconds = Math.max(5, Math.min(60, settings.turnDurationSeconds ?? state.settings.turnDurationSeconds));
  const nextSettings: SkullKingSettings = {
    turnDurationSeconds,
    orderMode: settings.orderMode ?? state.settings.orderMode,
  };
  return {
    ...state,
    settings: nextSettings,
    log: [...state.log, { type: "settings_changed", settings: nextSettings }],
  };
}

export function canStartRound(state: SkullKingGameState): boolean {
  return state.players.length >= 2 && (state.phase === "lobby" || state.phase === "round_over") && state.players.every((player) => player.isReady);
}

export function startRound(state: SkullKingGameState): SkullKingGameState {
  if (!canStartRound(state)) return state;

  const roundNumber = state.completedRoundCount + 1;
  const playerOrder = getRoundPlayerOrder(state.players, state.completedRoundCount, state.settings.orderMode);
  const starterPlayerId = playerOrder[0] ?? state.players[0]?.id;
  if (!starterPlayerId) return state;

  const deck = shuffle(buildSkullKingDeck(createCardId));
  const players = clonePlayers(state.players).map((player) => ({
    ...player,
    hand: [],
    bid: null,
    tricksWon: 0,
    roundScore: 0,
    bonusScore: 0,
    isReady: false,
  }));

  for (let dealIndex = 0; dealIndex < roundNumber; dealIndex += 1) {
    for (const playerId of playerOrder) {
      const player = findPlayer(players, playerId);
      const card = deck.shift();
      if (player && card) player.hand.push(card);
    }
  }

  return {
    ...state,
    phase: "bidding",
    players,
    round: {
      roundNumber,
      deck,
      playerOrder,
      starterPlayerId,
      leadPlayerId: starterPlayerId,
      currentPlayerId: null,
      turnStartedAt: Date.now(),
      currentTrick: {
        trickNumber: 1,
        leadPlayerId: starterPlayerId,
        plays: [],
        winningPlayIndex: null,
      },
      completedTricks: [],
    },
    matchWinnerIds: [],
    log: [...state.log, { type: "round_started", roundNumber, starterPlayerId }],
  };
}

export function submitBid(state: SkullKingGameState, playerId: PlayerID, bid: number, timedOut = false): SkullKingActionResult {
  if (state.phase !== "bidding" || !state.round) {
    return { ok: false, reason: "round_not_active" };
  }

  const normalizedBid = Math.max(0, Math.min(state.round.roundNumber, Math.floor(bid)));
  const players = clonePlayers(state.players);
  const player = findPlayer(players, playerId);
  if (!player) return { ok: false, reason: "player_not_found" };
  if (player.bid !== null) return { ok: false, reason: "invalid_action" };
  player.bid = normalizedBid;

  const everyoneBid = players.every((candidate) => candidate.bid !== null);
  if (everyoneBid) {
    return {
      ok: true,
      state: {
        ...state,
        phase: "playing",
        players,
        round: {
          ...state.round,
          currentPlayerId: state.round.leadPlayerId,
          turnStartedAt: Date.now(),
        },
        log: [...state.log, { type: "bid_submitted", playerId, bid: normalizedBid, timedOut }],
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      players,
      round: {
        ...state.round,
      },
      log: [...state.log, { type: "bid_submitted", playerId, bid: normalizedBid, timedOut }],
    },
  };
}

export function playCard(
  state: SkullKingGameState,
  playerId: PlayerID,
  instanceId: string,
  options?: { tigressMode?: TigressPlayMode; timedOut?: boolean },
): SkullKingActionResult {
  if (state.phase !== "playing" || !state.round || state.round.currentPlayerId !== playerId) {
    return { ok: false, reason: "not_your_turn" };
  }
  const round = state.round;

  const players = clonePlayers(state.players);
  const player = findPlayer(players, playerId);
  if (!player) return { ok: false, reason: "player_not_found" };

  const cardIndex = player.hand.findIndex((card) => card.instanceId === instanceId);
  if (cardIndex === -1) return { ok: false, reason: "card_not_in_hand" };
  const card = player.hand[cardIndex];
  if (!card) return { ok: false, reason: "card_not_in_hand" };

  if (!canPlayCard(player.hand, round.currentTrick.plays, card)) {
    return { ok: false, reason: "must_follow_suit" };
  }

  player.hand.splice(cardIndex, 1);
  const playedCard = materializePlayedCard(card, options?.tigressMode);
  const plays = [...round.currentTrick.plays, { playerId, card: playedCard }];
  const winningPlayIndex = getWinningPlayIndex(plays);
  const nextPlayerId = getNextPlayerId(round.playerOrder, playerId);

  const nextState: SkullKingGameState = {
    ...state,
    players,
    round: {
      ...round,
      currentPlayerId: plays.length === round.playerOrder.length ? null : nextPlayerId,
      turnStartedAt: Date.now(),
      currentTrick: {
        ...round.currentTrick,
        plays,
        winningPlayIndex,
      },
    },
    log: [...state.log, { type: "card_played", playerId, card: playedCard.card, timedOut: options?.timedOut }],
  };

  return { ok: true, state: nextState };
}

export function applyBidTimeout(state: SkullKingGameState, playerId: PlayerID): SkullKingActionResult {
  return submitBid(state, playerId, 1, true);
}

export function applyPlayTimeout(state: SkullKingGameState, playerId: PlayerID): SkullKingActionResult {
  if (state.phase !== "playing" || !state.round) return { ok: false, reason: "round_not_active" };
  const round = state.round;
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return { ok: false, reason: "player_not_found" };

  const fallback = player.hand.find((card) => canPlayCard(player.hand, round.currentTrick.plays, card));
  if (!fallback) return { ok: false, reason: "card_not_in_hand" };

  return playCard(state, playerId, fallback.instanceId, { timedOut: true, tigressMode: fallback.card.type === "tigress" ? "escape" : undefined });
}

export function toPlayerViewState(state: SkullKingGameState, selfPlayerId: PlayerID): SkullKingPlayerViewState {
  const selfRole = state.players.some((player) => player.id === selfPlayerId) ? "player" : "spectator";
  const hidePendingBids = state.phase === "bidding";

  return {
    gameId: state.gameId,
    roomId: state.roomId,
    creatorId: state.creatorId,
    phase: state.phase,
    spectators: [...state.spectators],
    settings: state.settings,
    completedRoundCount: state.completedRoundCount,
    matchWinnerIds: [...state.matchWinnerIds],
    log: state.log.map((event) => {
      if (!hidePendingBids || event.type !== "bid_submitted" || event.playerId === selfPlayerId) return event;
      return { ...event, bid: null };
    }),
    selfPlayerId,
    selfRole,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      isBot: player.isBot,
      botStrategy: player.botStrategy,
      handCount: player.hand.length,
      hand: player.id === selfPlayerId ? [...player.hand] : [],
      bid: hidePendingBids && player.id !== selfPlayerId ? null : player.bid,
      tricksWon: player.tricksWon,
      roundScore: player.roundScore,
      bonusScore: player.bonusScore,
      totalScore: player.totalScore,
      isReady: player.isReady,
    })),
    round: state.round
      ? {
          ...state.round,
          deckCount: state.round.deck.length,
        }
      : null,
  };
}

export function removePlayer(state: SkullKingGameState, playerId: PlayerID): SkullKingGameState {
  return {
    ...state,
    players: state.players.filter((player) => player.id !== playerId),
    creatorId: state.creatorId === playerId ? state.players.find((player) => player.id !== playerId)?.id ?? state.creatorId : state.creatorId,
  };
}

export function removeSpectator(state: SkullKingGameState, playerId: PlayerID): SkullKingGameState {
  return {
    ...state,
    spectators: state.spectators.filter((spectator) => spectator.id !== playerId),
  };
}

export function resetMatchToLobby(state: SkullKingGameState): SkullKingGameState {
  return {
    ...state,
    phase: "lobby",
    players: state.players.map((player) => ({
      ...player,
      hand: [],
      bid: null,
      tricksWon: 0,
      roundScore: 0,
      bonusScore: 0,
      totalScore: 0,
      isReady: Boolean(player.isBot),
    })),
    round: null,
    completedRoundCount: 0,
    matchWinnerIds: [],
  };
}
