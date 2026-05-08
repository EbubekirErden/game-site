import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";

import { Server } from "socket.io";

import { isGameId } from "@game-site/shared";
import { addPlayer, addSpectator, canStartReadyRound, cardinalPeekAction, createGame, playCardAction, removePlayer, removeSpectator, resetMatchToLobby, setGameMode, setPlayerReady, startRound, toBotObservation, toPlayerViewState } from "@game-site/shared/games/love-letter/engine";
import type { BotMemorySnapshot, BotObservedCardFact, CardInstance, GameState as LoveLetterGameState, PrivateEffectPresentation } from "@game-site/shared/games/love-letter/types";
import {
  addPlayer as addSkullKingPlayer,
  addSpectator as addSkullKingSpectator,
  applyBidTimeout,
  applyPlayTimeout,
  canStartRound as canStartSkullKingRound,
  createGame as createSkullKingGame,
  playCard as playSkullKingCard,
  removePlayer as removeSkullKingPlayer,
  removeSpectator as removeSkullKingSpectator,
  resetMatchToLobby as resetSkullKingMatchToLobby,
  setPlayerReady as setSkullKingPlayerReady,
  startRound as startSkullKingRound,
  submitBid,
  toPlayerViewState as toSkullKingPlayerViewState,
  updateSettings as updateSkullKingSettings,
} from "@game-site/shared/games/skull-king/engine";
import type { SkullKingGameState } from "@game-site/shared/games/skull-king/types";
import { chooseRandomBotPlay, chooseRandomCardinalPeekTarget, getBotDisplayName } from "./botBrain.js";
import { chooseSmartBotPlay, chooseSmartCardinalPeekTarget, getSmartBotDisplayName } from "./smartBotBrain.js";
import { chooseCodexBotPlay, chooseCodexCardinalPeekTarget, getCodexBotDisplayName } from "./codexBotBrain.js";
import { getCodexBotStatus } from "./codexClient.js";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

type LoveLetterRoomRecord = {
  gameId: "love-letter";
  state: LoveLetterGameState;
};

type SkullKingRoomRecord = {
  gameId: "skull-king";
  state: SkullKingGameState;
};

type RoomRecord = LoveLetterRoomRecord | SkullKingRoomRecord;
type LoveLetterBotStrategy = "random" | "smart" | "codex";

const rooms = new Map<string, RoomRecord>();
const roomChats = new Map<string, ChatMessage[]>();
const playerBySocketId = new Map<string, { roomId: string; playerId: string }>();
const activeSocketByPlayerKey = new Map<string, string>();
const pendingRemovalByPlayerKey = new Map<string, NodeJS.Timeout>();
const botPlayerIdsByRoomId = new Map<string, Set<string>>();
const botStrategyByPlayerKey = new Map<string, LoveLetterBotStrategy>();
const botMemoryByPlayerKey = new Map<string, BotMemorySnapshot>();
const pendingBotActionByRoomId = new Map<string, NodeJS.Timeout>();
const botActionInFlightByRoomId = new Set<string>();
const DISCONNECT_GRACE_MS = 30_000;
const MAX_CHAT_HISTORY = 80;
const BOT_ACTION_DELAY_MS = 3_000;

type ChatMessage = {
  id: string;
  roomId: string;
  playerId: string;
  playerName: string;
  text: string;
  createdAt: number;
};

function getPlayerKey(roomId: string, playerId: string): string {
  return `${roomId}:${playerId}`;
}

function clearPendingRemoval(roomId: string, playerId: string): void {
  const playerKey = getPlayerKey(roomId, playerId);
  const timeout = pendingRemovalByPlayerKey.get(playerKey);
  if (!timeout) return;

  clearTimeout(timeout);
  pendingRemovalByPlayerKey.delete(playerKey);
}

function bindSocketToPlayer(socketId: string, roomId: string, playerId: string): void {
  const playerKey = getPlayerKey(roomId, playerId);
  playerBySocketId.set(socketId, { roomId, playerId });
  activeSocketByPlayerKey.set(playerKey, socketId);
  clearPendingRemoval(roomId, playerId);
}

function clearPendingBotAction(roomId: string): void {
  const timeout = pendingBotActionByRoomId.get(roomId);
  if (!timeout) return;

  clearTimeout(timeout);
  pendingBotActionByRoomId.delete(roomId);
}

function registerBotPlayer(roomId: string, playerId: string, strategy: LoveLetterBotStrategy = "random"): void {
  const roomBots = botPlayerIdsByRoomId.get(roomId) ?? new Set<string>();
  roomBots.add(playerId);
  botPlayerIdsByRoomId.set(roomId, roomBots);
  const playerKey = getPlayerKey(roomId, playerId);
  botStrategyByPlayerKey.set(playerKey, strategy);
  botMemoryByPlayerKey.set(playerKey, {
    observedPrivateEffects: [],
    observedCardFacts: [],
  });
}

function unregisterBotPlayer(roomId: string, playerId: string): void {
  const roomBots = botPlayerIdsByRoomId.get(roomId);
  const playerKey = getPlayerKey(roomId, playerId);
  botMemoryByPlayerKey.delete(playerKey);
  botStrategyByPlayerKey.delete(playerKey);
  if (!roomBots) return;

  roomBots.delete(playerId);
  if (roomBots.size === 0) {
    botPlayerIdsByRoomId.delete(roomId);
  }
}

function isBotPlayer(roomId: string, playerId: string): boolean {
  return botPlayerIdsByRoomId.get(roomId)?.has(playerId) ?? false;
}

function getBotStrategy(roomId: string, playerId: string): LoveLetterBotStrategy {
  return botStrategyByPlayerKey.get(getPlayerKey(roomId, playerId)) ?? "random";
}

function destroyRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (room) {
    for (const participant of [...room.state.players, ...room.state.spectators]) {
      clearPendingRemoval(roomId, participant.id);
      activeSocketByPlayerKey.delete(getPlayerKey(roomId, participant.id));
      botMemoryByPlayerKey.delete(getPlayerKey(roomId, participant.id));
      botStrategyByPlayerKey.delete(getPlayerKey(roomId, participant.id));
    }
  }

  clearPendingBotAction(roomId);
  botActionInFlightByRoomId.delete(roomId);
  botPlayerIdsByRoomId.delete(roomId);
  rooms.delete(roomId);
  roomChats.delete(roomId);
}

function getBotMemory(roomId: string, playerId: string): BotMemorySnapshot {
  return botMemoryByPlayerKey.get(getPlayerKey(roomId, playerId)) ?? {
    observedPrivateEffects: [],
    observedCardFacts: [],
  };
}

function appendBotMemory(roomId: string, playerId: string, effect: PrivateEffectPresentation): void {
  const playerKey = getPlayerKey(roomId, playerId);
  const current = getBotMemory(roomId, playerId);
  const nextFacts = [...current.observedCardFacts, ...extractObservedCardFacts(effect)];

  botMemoryByPlayerKey.set(playerKey, {
    observedPrivateEffects: [...current.observedPrivateEffects, effect],
    observedCardFacts: nextFacts,
  });
}

function resetBotMemory(roomId: string, playerId: string): void {
  botMemoryByPlayerKey.set(getPlayerKey(roomId, playerId), {
    observedPrivateEffects: [],
    observedCardFacts: [],
  });
}

function resetRoomBotMemories(roomId: string): void {
  const roomBots = botPlayerIdsByRoomId.get(roomId);
  if (!roomBots) return;

  for (const playerId of roomBots) {
    resetBotMemory(roomId, playerId);
  }
}

function makeObservedCardFact(
  effect: PrivateEffectPresentation,
  playerId: string,
  playerName: string,
  card: CardInstance | null,
  location: BotObservedCardFact["location"],
  source: BotObservedCardFact["source"],
  note: string,
): BotObservedCardFact {
  return {
    factId: `${effect.effectId}:${source}:${playerId}:${location}:${card?.instanceId ?? "none"}`,
    effectId: effect.effectId,
    viewerPlayerId: effect.viewerPlayerId,
    actorPlayerId: effect.actorPlayerId,
    playerId,
    playerName,
    card,
    location,
    source,
    turnNumber: effect.turnNumber,
    note,
  };
}

function extractObservedCardFacts(effect: PrivateEffectPresentation): BotObservedCardFact[] {
  switch (effect.kind) {
    case "peek":
      return [
        makeObservedCardFact(effect, effect.targetPlayerId, effect.targetPlayerName, effect.revealedCard, "hand", "peek", `${effect.targetPlayerName}'s hand was revealed to the viewer.`),
      ];
    case "multi_peek":
      return effect.seen.map((entry) =>
        makeObservedCardFact(effect, entry.targetPlayerId, entry.targetPlayerName, entry.revealedCard, "hand", "multi_peek", `${entry.targetPlayerName}'s hand was revealed to the viewer.`),
      );
    case "compare":
      return [
        makeObservedCardFact(effect, effect.selfPlayerId, effect.selfPlayerName, effect.selfCard, "hand", "compare", `${effect.selfPlayerName}'s compared hand was visible in a private comparison.`),
        makeObservedCardFact(effect, effect.opposingPlayerId, effect.opposingPlayerName, effect.opposingCard, "hand", "compare", `${effect.opposingPlayerName}'s compared hand was visible in a private comparison.`),
      ];
    case "cardinal_reveal":
      return [
        makeObservedCardFact(effect, effect.chosenPlayerId, effect.chosenPlayerName, effect.revealedCard, "hand", "cardinal_reveal", `${effect.chosenPlayerName}'s swapped hand was revealed after Cardinal.`),
      ];
    case "discard_reveal":
      return [
        makeObservedCardFact(effect, effect.targetPlayerId, effect.targetPlayerName, effect.discardedCard, "discard", "discard_reveal", `${effect.targetPlayerName}'s discarded card was revealed.`),
      ];
    case "guess":
      if (effect.revealedCards.length === 0) return [];
      return effect.revealedCards.map((card) =>
        makeObservedCardFact(
          effect,
          effect.targetPlayerId,
          effect.targetPlayerName,
          card,
          effect.outcome === "correct" || effect.outcome === "assassin_rebound" ? "discard" : "hand",
          "guess",
          effect.outcome === "wrong" ? `${effect.targetPlayerName}'s card was checked by a guess action.` : `${effect.targetPlayerName} revealed an additional card after a guess action.`,
        ),
      );
    default:
      return [];
  }
}

function emitPrivateEffects(roomId: string, effects: PrivateEffectPresentation[] = []): void {
  for (const effect of effects) {
    if (isBotPlayer(roomId, effect.viewerPlayerId)) {
      appendBotMemory(roomId, effect.viewerPlayerId, effect);
      continue;
    }

    io.to(getPlayerKey(roomId, effect.viewerPlayerId)).emit("action:effect", effect);
  }
}

function getLoveLetterRoom(roomId: string): LoveLetterRoomRecord | null {
  const room = rooms.get(roomId);
  return room?.gameId === "love-letter" ? room : null;
}

function getSkullKingRoom(roomId: string): SkullKingRoomRecord | null {
  const room = rooms.get(roomId);
  return room?.gameId === "skull-king" ? room : null;
}

function setRoomState(roomId: string, room: LoveLetterRoomRecord, state: LoveLetterGameState): void;
function setRoomState(roomId: string, room: SkullKingRoomRecord, state: SkullKingGameState): void;
function setRoomState(roomId: string, room: RoomRecord, state: LoveLetterGameState | SkullKingGameState): void {
  rooms.set(roomId, {
    ...room,
    state: state as never,
  });
}

function removePlayerFromRoom(roomId: string, playerId: string): void {
  clearPendingRemoval(roomId, playerId);
  activeSocketByPlayerKey.delete(getPlayerKey(roomId, playerId));
  unregisterBotPlayer(roomId, playerId);

  const room = rooms.get(roomId);
  if (!room) return;

  if (room.gameId === "love-letter") {
    const next = room.state.players.some((player) => player.id === playerId)
      ? removePlayer(room.state, playerId)
      : removeSpectator(room.state, playerId);

    if (next.players.length === 0 && next.spectators.length === 0) {
      destroyRoom(roomId);
      return;
    }

    setRoomState(roomId, room, next);
  } else {
    const next = room.state.players.some((player) => player.id === playerId)
      ? removeSkullKingPlayer(room.state, playerId)
      : removeSkullKingSpectator(room.state, playerId);

    if (next.players.length === 0 && next.spectators.length === 0) {
      destroyRoom(roomId);
      return;
    }

    setRoomState(roomId, room, next);
  }

  emitRoomState(roomId);
}

function schedulePlayerRemoval(roomId: string, playerId: string): void {
  clearPendingRemoval(roomId, playerId);

  const playerKey = getPlayerKey(roomId, playerId);
  const timeout = setTimeout(() => {
    pendingRemovalByPlayerKey.delete(playerKey);

    if (activeSocketByPlayerKey.has(playerKey)) {
      return;
    }

    removePlayerFromRoom(roomId, playerId);
  }, DISCONNECT_GRACE_MS);

  pendingRemovalByPlayerKey.set(playerKey, timeout);
}

function getBoundPlayer(socketId: string): { roomId: string; playerId: string } | null {
  const binding = playerBySocketId.get(socketId);
  if (!binding) return null;

  const playerKey = getPlayerKey(binding.roomId, binding.playerId);
  if (activeSocketByPlayerKey.get(playerKey) !== socketId) {
    return null;
  }

  return binding;
}

function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = randomBytes(6);
    const code = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
    if (!rooms.has(code)) {
      return code;
    }
  }

  throw new Error("Unable to generate room code");
}

function emitRoomState(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const player of room.state.players) {
    io
      .to(getPlayerKey(roomId, player.id))
      .emit("state", room.gameId === "love-letter" ? toPlayerViewState(room.state, player.id) : toSkullKingPlayerViewState(room.state, player.id));
  }
  for (const spectator of room.state.spectators) {
    io
      .to(getPlayerKey(roomId, spectator.id))
      .emit("state", room.gameId === "love-letter" ? toPlayerViewState(room.state, spectator.id) : toSkullKingPlayerViewState(room.state, spectator.id));
  }

  if (room.gameId === "love-letter") {
    scheduleBotAction(roomId);
  }
}

function getParticipantName(room: RoomRecord, playerId: string): string | null {
  const game = room.state;

  return (
    game.players.find((player) => player.id === playerId)?.name ??
    game.spectators.find((spectator) => spectator.id === playerId)?.name ??
    null
  );
}

function emitChatHistory(roomId: string, playerId: string): void {
  io.to(getPlayerKey(roomId, playerId)).emit("chat:history", roomChats.get(roomId) ?? []);
}

function ensureBotsReady(roomId: string): void {
  const room = getLoveLetterRoom(roomId);
  if (!room) return;

  let next = room.state;
  for (const player of room.state.players) {
    if (isBotPlayer(roomId, player.id) && !player.isReady) {
      next = setPlayerReady(next, player.id, true);
    }
  }

  if (next !== room.state) {
    setRoomState(roomId, room, next);
  }
}

async function runBotTurn(roomId: string): Promise<void> {
  pendingBotActionByRoomId.delete(roomId);
  if (botActionInFlightByRoomId.has(roomId)) return;

  botActionInFlightByRoomId.add(roomId);
  try {
    const room = getLoveLetterRoom(roomId);
    if (!room || room.state.phase !== "in_round" || !room.state.round) return;

    const cardinalActorId = room.state.round.pendingCardinalPeek?.actorPlayerId ?? null;
    if (cardinalActorId && isBotPlayer(roomId, cardinalActorId)) {
      const observation = toBotObservation(room.state, cardinalActorId, getBotMemory(roomId, cardinalActorId));
      const strategy = getBotStrategy(roomId, cardinalActorId);
      const targetPlayerId = strategy === "codex"
        ? await chooseCodexCardinalPeekTarget(observation)
        : strategy === "smart"
          ? chooseSmartCardinalPeekTarget(observation)
          : chooseRandomCardinalPeekTarget(observation);
      if (!targetPlayerId) return;

      const result = cardinalPeekAction(room.state, cardinalActorId, targetPlayerId);
      if (!result.ok || !result.state) return;

      setRoomState(roomId, room, result.state);
      botActionInFlightByRoomId.delete(roomId);
      emitRoomState(roomId);
      emitPrivateEffects(roomId, result.privateEffects);
      return;
    }

    const currentPlayerId = room.state.round.currentPlayerId;
    if (!currentPlayerId || !isBotPlayer(roomId, currentPlayerId)) return;

    const observation = toBotObservation(room.state, currentPlayerId, getBotMemory(roomId, currentPlayerId));
    const strategy = getBotStrategy(roomId, currentPlayerId);
    const decision = strategy === "codex"
      ? await chooseCodexBotPlay(observation)
      : strategy === "smart"
        ? chooseSmartBotPlay(observation)
        : chooseRandomBotPlay(observation);
    if (!decision) return;

    const result = playCardAction(room.state, currentPlayerId, decision.instanceId, {
      targetPlayerId: decision.targetPlayerId,
      targetPlayerIds: decision.targetPlayerIds,
      guessedValue: decision.guessedValue,
    });
    if (!result.ok || !result.state) return;

    setRoomState(roomId, room, result.state);
    botActionInFlightByRoomId.delete(roomId);
    emitRoomState(roomId);
    emitPrivateEffects(roomId, result.privateEffects);
  } finally {
    botActionInFlightByRoomId.delete(roomId);
  }
}

function scheduleBotAction(roomId: string): void {
  clearPendingBotAction(roomId);

  const room = getLoveLetterRoom(roomId);
  if (!room) return;

  if (room.state.phase === "lobby" || room.state.phase === "round_over") {
    ensureBotsReady(roomId);
    return;
  }

  if (room.state.phase !== "in_round" || !room.state.round) return;
  if (botActionInFlightByRoomId.has(roomId)) return;

  const actingBotId = room.state.round.pendingCardinalPeek?.actorPlayerId ?? room.state.round.currentPlayerId;
  if (!actingBotId || !isBotPlayer(roomId, actingBotId)) {
    return;
  }

  const timeout = setTimeout(() => {
    void runBotTurn(roomId);
  }, BOT_ACTION_DELAY_MS);

  pendingBotActionByRoomId.set(roomId, timeout);
}

function addBot(room: LoveLetterRoomRecord, strategy: LoveLetterBotStrategy): LoveLetterGameState {
  const botPlayerId = `bot-${randomUUID()}`;
  const existingNames = [
    ...room.state.players.map((player) => player.name),
    ...room.state.spectators.map((spectator) => spectator.name),
  ];
  const botName = strategy === "codex"
    ? getCodexBotDisplayName(existingNames)
    : strategy === "smart"
      ? getSmartBotDisplayName(existingNames)
      : getBotDisplayName(existingNames);
  const withBot = addPlayer(room.state, botPlayerId, botName);
  if (withBot === room.state) {
    return room.state;
  }

  registerBotPlayer(room.state.roomId, botPlayerId, strategy);
  return setPlayerReady(withBot, botPlayerId, true);
}

function addRandomBot(room: LoveLetterRoomRecord): LoveLetterGameState {
  return addBot(room, "random");
}

function addSmartBot(room: LoveLetterRoomRecord): LoveLetterGameState {
  return addBot(room, "smart");
}

function addCodexBot(room: LoveLetterRoomRecord): LoveLetterGameState {
  return addBot(room, "codex");
}

io.on("connection", (socket) => {
  socket.on("server:capabilities", async (respond?: (payload: { codexBot: Awaited<ReturnType<typeof getCodexBotStatus>> }) => void) => {
    respond?.({ codexBot: await getCodexBotStatus() });
  });

  socket.on("room:create", ({ name, playerId, mode, gameId }, respond?: (payload: { ok: boolean; roomId?: string; reason?: string }) => void) => {
    const roomId = generateRoomCode();
    const normalizedPlayerId = String(playerId ?? "").trim();
    if (!normalizedPlayerId) {
      respond?.({ ok: false, reason: "invalid_action" });
      return;
    }

    const normalizedGameId = isGameId(gameId) ? gameId : "love-letter";
    if (normalizedGameId === "love-letter") {
      const normalizedMode = mode === "premium" ? "premium" : "classic";
      const game = createGame(roomId, normalizedPlayerId, normalizedMode);
      const next = addPlayer(game, normalizedPlayerId, name);
      rooms.set(roomId, { gameId: "love-letter", state: next });
    } else if (normalizedGameId === "skull-king") {
      const game = createSkullKingGame(roomId, normalizedPlayerId);
      const next = addSkullKingPlayer(game, normalizedPlayerId, name);
      rooms.set(roomId, { gameId: "skull-king", state: next });
    } else {
      respond?.({ ok: false, reason: "game_not_available" });
      return;
    }

    bindSocketToPlayer(socket.id, roomId, normalizedPlayerId);
    socket.join(roomId);
    socket.join(getPlayerKey(roomId, normalizedPlayerId));
    emitRoomState(roomId);
    emitChatHistory(roomId, normalizedPlayerId);
    respond?.({ ok: true, roomId });
  });

  socket.on("room:join", ({ roomId, name, playerId }, respond?: (payload: { ok: boolean; roomId?: string; reason?: string }) => void) => {
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    const normalizedPlayerId = String(playerId ?? "").trim();
    const room = rooms.get(normalizedRoomId);
    if (!room || !normalizedPlayerId) {
      socket.emit("action:error", { reason: !normalizedPlayerId ? "invalid_action" : "room_not_found" });
      respond?.({ ok: false, reason: !normalizedPlayerId ? "invalid_action" : "room_not_found" });
      return;
    }

    if (room.gameId === "love-letter") {
      const game = room.state;
      const existingPlayer = game.players.find((player) => player.id === normalizedPlayerId);
      const existingSpectator = game.spectators.find((spectator) => spectator.id === normalizedPlayerId);
      const next =
        existingPlayer || existingSpectator
          ? game
          : game.phase === "lobby"
            ? addPlayer(game, normalizedPlayerId, name)
            : addSpectator(game, normalizedPlayerId, name);
      setRoomState(normalizedRoomId, room, next);
    } else {
      const game = room.state;
      const existingPlayer = game.players.find((player) => player.id === normalizedPlayerId);
      const existingSpectator = game.spectators.find((spectator) => spectator.id === normalizedPlayerId);
      const next =
        existingPlayer || existingSpectator
          ? game
          : game.phase === "lobby"
            ? addSkullKingPlayer(game, normalizedPlayerId, name)
            : addSkullKingSpectator(game, normalizedPlayerId, name);
      setRoomState(normalizedRoomId, room, next);
    }

    bindSocketToPlayer(socket.id, normalizedRoomId, normalizedPlayerId);
    socket.join(normalizedRoomId);
    socket.join(getPlayerKey(normalizedRoomId, normalizedPlayerId));
    emitRoomState(normalizedRoomId);
    emitChatHistory(normalizedRoomId, normalizedPlayerId);
    respond?.({ ok: true, roomId: normalizedRoomId });
  });

  socket.on("room:reconnect", ({ roomId, playerId }, respond?: (payload: { ok: boolean; roomId?: string; reason?: string }) => void) => {
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    const normalizedPlayerId = String(playerId ?? "").trim();
    const room = rooms.get(normalizedRoomId);
    const game = room?.state;

    if (!game) {
      socket.emit("action:error", { reason: "room_not_found" });
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const existingPlayer = game.players.find((player) => player.id === normalizedPlayerId);
    const existingSpectator = game.spectators.find((spectator) => spectator.id === normalizedPlayerId);
    if (!existingPlayer && !existingSpectator) {
      respond?.({ ok: false, reason: "player_not_found" });
      return;
    }

    bindSocketToPlayer(socket.id, normalizedRoomId, normalizedPlayerId);
    socket.join(normalizedRoomId);
    socket.join(getPlayerKey(normalizedRoomId, normalizedPlayerId));
    emitRoomState(normalizedRoomId);
    emitChatHistory(normalizedRoomId, normalizedPlayerId);
    respond?.({ ok: true, roomId: normalizedRoomId });
  });

  socket.on("chat:send", ({ roomId, text }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const room = rooms.get(normalizedRoomId);
    if (!room) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const playerName = getParticipantName(room, binding.playerId);
    if (!playerName) {
      respond?.({ ok: false, reason: "player_not_found" });
      return;
    }

    const trimmedText = String(text ?? "").trim().replace(/\s+/g, " ");
    if (!trimmedText) {
      respond?.({ ok: false, reason: "empty_message" });
      return;
    }

    const message: ChatMessage = {
      id: `${Date.now()}-${binding.playerId}-${randomBytes(4).toString("hex")}`,
      roomId: normalizedRoomId,
      playerId: binding.playerId,
      playerName,
      text: trimmedText.slice(0, 240),
      createdAt: Date.now(),
    };
    const nextHistory = [...(roomChats.get(normalizedRoomId) ?? []), message].slice(-MAX_CHAT_HISTORY);
    roomChats.set(normalizedRoomId, nextHistory);
    io.to(normalizedRoomId).emit("chat:message", message);
    respond?.({ ok: true });
  });

  socket.on("room:set-ready", ({ roomId, isReady }) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }

    const room = rooms.get(normalizedRoomId);
    if (!room) return;

    if (room.gameId === "love-letter") {
      const next = setPlayerReady(room.state, binding.playerId, Boolean(isReady));
      setRoomState(normalizedRoomId, room, next);
    } else {
      const next = setSkullKingPlayerReady(room.state, binding.playerId, Boolean(isReady));
      setRoomState(normalizedRoomId, room, next);
    }
    emitRoomState(normalizedRoomId);
  });

  socket.on("room:set-mode", ({ roomId, mode }) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }

    const room = getLoveLetterRoom(normalizedRoomId);
    if (!room) return;
    const game = room.state;

    if (game.creatorId !== binding.playerId) {
      socket.emit("action:error", { reason: "only_creator_can_change_mode" });
      return;
    }

    if (game.phase !== "lobby") {
      socket.emit("action:error", { reason: "cannot_change_mode_now" });
      return;
    }

    const normalizedMode = mode === "premium" ? "premium" : "classic";
    const next = setGameMode(game, binding.playerId, normalizedMode);
    setRoomState(normalizedRoomId, room, next);
    emitRoomState(normalizedRoomId);
  });

  socket.on("room:add-bot", ({ roomId }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const room = getLoveLetterRoom(normalizedRoomId);
    if (!room) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    if (room.state.creatorId !== binding.playerId) {
      respond?.({ ok: false, reason: "only_creator_can_manage_bots" });
      return;
    }

    if (room.state.phase !== "lobby") {
      respond?.({ ok: false, reason: "cannot_add_bot_now" });
      return;
    }

    setRoomState(normalizedRoomId, room, addRandomBot(room));
    emitRoomState(normalizedRoomId);
    respond?.({ ok: true });
  });

  socket.on("room:add-smart-bot", ({ roomId }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const room = getLoveLetterRoom(normalizedRoomId);
    if (!room) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    if (room.state.creatorId !== binding.playerId) {
      respond?.({ ok: false, reason: "only_creator_can_manage_bots" });
      return;
    }

    if (room.state.phase !== "lobby") {
      respond?.({ ok: false, reason: "cannot_add_bot_now" });
      return;
    }

    setRoomState(normalizedRoomId, room, addSmartBot(room));
    emitRoomState(normalizedRoomId);
    respond?.({ ok: true });
  });

  socket.on("room:add-codex-bot", async ({ roomId }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const codexStatus = await getCodexBotStatus();
    if (!codexStatus.configured) {
      respond?.({ ok: false, reason: "codex_bot_not_configured" });
      return;
    }

    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const room = getLoveLetterRoom(normalizedRoomId);
    if (!room) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    if (room.state.creatorId !== binding.playerId) {
      respond?.({ ok: false, reason: "only_creator_can_manage_bots" });
      return;
    }

    if (room.state.phase !== "lobby") {
      respond?.({ ok: false, reason: "cannot_add_bot_now" });
      return;
    }

    setRoomState(normalizedRoomId, room, addCodexBot(room));
    emitRoomState(normalizedRoomId);
    respond?.({ ok: true });
  });

  socket.on("room:leave", ({ roomId }) => {
    const binding = playerBySocketId.get(socket.id);
    playerBySocketId.delete(socket.id);
    if (!binding) return;

    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (binding.roomId !== normalizedRoomId) {
      return;
    }

    const playerKey = getPlayerKey(binding.roomId, binding.playerId);
    if (activeSocketByPlayerKey.get(playerKey) === socket.id) {
      activeSocketByPlayerKey.delete(playerKey);
    }
    socket.leave(normalizedRoomId);
    socket.leave(playerKey);
    removePlayerFromRoom(binding.roomId, binding.playerId);
  });

  socket.on("round:start", ({ roomId }) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }

    const room = rooms.get(normalizedRoomId);
    if (!room) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }

    if (room.state.creatorId !== binding.playerId) {
      socket.emit("action:error", { reason: "only_creator_can_start" });
      return;
    }

    if (room.gameId === "love-letter") {
      const game = room.state;
      if ((game.phase === "lobby" || game.phase === "round_over") && !canStartReadyRound(game)) {
        socket.emit("action:error", { reason: "players_not_ready" });
        return;
      }

      const next = startRound(game);
      setRoomState(normalizedRoomId, room, next);
      resetRoomBotMemories(normalizedRoomId);
    } else {
      const game = room.state;
      if ((game.phase === "lobby" || game.phase === "round_over") && !canStartSkullKingRound(game)) {
        socket.emit("action:error", { reason: "players_not_ready" });
        return;
      }

      setRoomState(normalizedRoomId, room, startSkullKingRound(game));
    }

    emitRoomState(normalizedRoomId);
  });

  socket.on("match:return-to-lobby", ({ roomId }) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }

    const room = rooms.get(normalizedRoomId);
    if (!room) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }

    if (room.state.creatorId !== binding.playerId) {
      socket.emit("action:error", { reason: "only_creator_can_start" });
      return;
    }

    if (room.gameId === "love-letter") {
      setRoomState(normalizedRoomId, room, resetMatchToLobby(room.state));
    } else {
      setRoomState(normalizedRoomId, room, resetSkullKingMatchToLobby(room.state));
    }
    emitRoomState(normalizedRoomId);
  });

  socket.on("card:play", ({ roomId, instanceId, targetPlayerId, targetPlayerIds, guessedValue }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const room = getLoveLetterRoom(normalizedRoomId);
    const game = room?.state;
    if (!game || !room) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const result = playCardAction(game, binding.playerId, instanceId, {
      targetPlayerId,
      targetPlayerIds,
      guessedValue,
    });

    if (!result.ok || !result.state) {
      socket.emit("action:error", { reason: result.reason ?? "invalid_action" });
      respond?.({ ok: false, reason: result.reason ?? "invalid_action" });
      return;
    }

    setRoomState(normalizedRoomId, room, result.state);
    emitRoomState(normalizedRoomId);
    respond?.({ ok: true });

    emitPrivateEffects(normalizedRoomId, result.privateEffects);
  });

  socket.on("cardinal:peek", ({ roomId, targetPlayerId }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const room = getLoveLetterRoom(normalizedRoomId);
    const game = room?.state;
    if (!game || !room) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const result = cardinalPeekAction(game, binding.playerId, String(targetPlayerId ?? "").trim());

    if (!result.ok || !result.state) {
      socket.emit("action:error", { reason: result.reason ?? "invalid_action" });
      respond?.({ ok: false, reason: result.reason ?? "invalid_action" });
      return;
    }

    setRoomState(normalizedRoomId, room, result.state);
    emitRoomState(normalizedRoomId);
    respond?.({ ok: true });

    emitPrivateEffects(normalizedRoomId, result.privateEffects);
  });

  socket.on("skull:update-settings", ({ roomId, settings }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const room = getSkullKingRoom(normalizedRoomId);
    if (!room) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const next = updateSkullKingSettings(room.state, binding.playerId, settings ?? {});
    setRoomState(normalizedRoomId, room, next);
    emitRoomState(normalizedRoomId);
    respond?.({ ok: true });
  });

  socket.on("skull:bid", ({ roomId, bid }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const room = getSkullKingRoom(normalizedRoomId);
    if (!room) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const result = submitBid(room.state, binding.playerId, Number(bid ?? 1));
    if (!result.ok || !result.state) {
      respond?.({ ok: false, reason: result.reason ?? "invalid_action" });
      return;
    }

    setRoomState(normalizedRoomId, room, result.state);
    emitRoomState(normalizedRoomId);
    respond?.({ ok: true });
  });

  socket.on("skull:play-card", ({ roomId, instanceId, tigressMode }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const room = getSkullKingRoom(normalizedRoomId);
    if (!room) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const result = playSkullKingCard(room.state, binding.playerId, String(instanceId ?? ""), { tigressMode });
    if (!result.ok || !result.state) {
      respond?.({ ok: false, reason: result.reason ?? "invalid_action" });
      return;
    }

    setRoomState(normalizedRoomId, room, result.state);
    emitRoomState(normalizedRoomId);
    respond?.({ ok: true });
  });

  socket.on("skull:timeout-bid", ({ roomId }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const room = getSkullKingRoom(normalizedRoomId);
    if (!room) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const result = applyBidTimeout(room.state, binding.playerId);
    if (!result.ok || !result.state) {
      respond?.({ ok: false, reason: result.reason ?? "invalid_action" });
      return;
    }

    setRoomState(normalizedRoomId, room, result.state);
    emitRoomState(normalizedRoomId);
    respond?.({ ok: true });
  });

  socket.on("skull:timeout-play", ({ roomId }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const room = getSkullKingRoom(normalizedRoomId);
    if (!room) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const result = applyPlayTimeout(room.state, binding.playerId);
    if (!result.ok || !result.state) {
      respond?.({ ok: false, reason: result.reason ?? "invalid_action" });
      return;
    }

    setRoomState(normalizedRoomId, room, result.state);
    emitRoomState(normalizedRoomId);
    respond?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const binding = playerBySocketId.get(socket.id);
    playerBySocketId.delete(socket.id);
    if (!binding) return;

    const playerKey = getPlayerKey(binding.roomId, binding.playerId);
    if (activeSocketByPlayerKey.get(playerKey) !== socket.id) {
      return;
    }

    activeSocketByPlayerKey.delete(playerKey);
    schedulePlayerRemoval(binding.roomId, binding.playerId);
  });
});

httpServer.listen(3001, () => {
  console.log("server listening on :3001");
});
