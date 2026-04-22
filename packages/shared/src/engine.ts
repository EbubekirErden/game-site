// packages/shared/src/engine.ts

import { randomUUID } from "node:crypto";

import { BASE_CARDS } from "./cards.js";
import type { CardInstance, GameState, PlayerState, RoomID } from "./types.js";

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

export function createGame(roomId: RoomID): GameState {
  return {
    roomId,
    phase: "lobby",
    players: [],
    round: null,
    winnerId: null,
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
    status: "active",
    protectedUntilNextTurn: false,
    score: 0,
  };

  return {
    ...state,
    players: [...state.players, player],
    log: [...state.log, { type: "player_joined", playerId: id, name }],
  };
}

export function startRound(state: GameState): GameState {
  if (state.players.length < 2) return state;

  const deck = buildDeck();
  const burned = deck.splice(0, 1);

  const players = state.players.map((p) => ({
    ...p,
    hand: [deck.shift()!],
    status: "active" as const,
    protectedUntilNextTurn: false,
  }));

  const firstPlayerId = players[0]?.id ?? null;

  if (firstPlayerId) {
    players[0].hand.push(deck.shift()!);
  }

  return {
    ...state,
    phase: "in_round",
    players,
    round: {
      deck,
      discardPile: [],
      burnedCardCount: burned.length,
      currentPlayerId: firstPlayerId,
      turnNumber: 1,
    },
    winnerId: null,
    log: [...state.log, { type: "round_started" }, ...(firstPlayerId ? [{ type: "card_drawn" as const, playerId: firstPlayerId }] : [])],
  };
}
