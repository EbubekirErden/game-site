import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";

import { Server } from "socket.io";

import { addPlayer, addSpectator, canStartReadyRound, cardinalPeekAction, createGame, playCardAction, removePlayer, removeSpectator, resetMatchToLobby, setGameMode, setPlayerReady, startRound, toBotObservation, toPlayerViewState } from "@game-site/shared/engine";
import type { BotMemorySnapshot, BotObservedCardFact, CardInstance, PrivateEffectPresentation } from "@game-site/shared";
import { chooseRandomBotPlay, chooseRandomCardinalPeekTarget, getBotDisplayName } from "./botBrain.js";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

type RoomGame = ReturnType<typeof createGame>;

const rooms = new Map<string, RoomGame>();
const roomChats = new Map<string, ChatMessage[]>();
const playerBySocketId = new Map<string, { roomId: string; playerId: string }>();
const activeSocketByPlayerKey = new Map<string, string>();
const pendingRemovalByPlayerKey = new Map<string, NodeJS.Timeout>();
const botPlayerIdsByRoomId = new Map<string, Set<string>>();
const botMemoryByPlayerKey = new Map<string, BotMemorySnapshot>();
const pendingBotActionByRoomId = new Map<string, NodeJS.Timeout>();
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

function registerBotPlayer(roomId: string, playerId: string): void {
  const roomBots = botPlayerIdsByRoomId.get(roomId) ?? new Set<string>();
  roomBots.add(playerId);
  botPlayerIdsByRoomId.set(roomId, roomBots);
  botMemoryByPlayerKey.set(getPlayerKey(roomId, playerId), {
    observedPrivateEffects: [],
    observedCardFacts: [],
  });
}

function unregisterBotPlayer(roomId: string, playerId: string): void {
  const roomBots = botPlayerIdsByRoomId.get(roomId);
  botMemoryByPlayerKey.delete(getPlayerKey(roomId, playerId));
  if (!roomBots) return;

  roomBots.delete(playerId);
  if (roomBots.size === 0) {
    botPlayerIdsByRoomId.delete(roomId);
  }
}

function isBotPlayer(roomId: string, playerId: string): boolean {
  return botPlayerIdsByRoomId.get(roomId)?.has(playerId) ?? false;
}

function destroyRoom(roomId: string): void {
  const game = rooms.get(roomId);
  if (game) {
    for (const participant of [...game.players, ...game.spectators]) {
      clearPendingRemoval(roomId, participant.id);
      activeSocketByPlayerKey.delete(getPlayerKey(roomId, participant.id));
      botMemoryByPlayerKey.delete(getPlayerKey(roomId, participant.id));
    }
  }

  clearPendingBotAction(roomId);
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
        makeObservedCardFact(
          effect,
          effect.targetPlayerId,
          effect.targetPlayerName,
          effect.revealedCard,
          "hand",
          "peek",
          `${effect.targetPlayerName}'s hand was revealed to the viewer.`,
        ),
      ];
    case "multi_peek":
      return effect.seen.map((entry) =>
        makeObservedCardFact(
          effect,
          entry.targetPlayerId,
          entry.targetPlayerName,
          entry.revealedCard,
          "hand",
          "multi_peek",
          `${entry.targetPlayerName}'s hand was revealed to the viewer.`,
        ),
      );
    case "compare":
      return [
        makeObservedCardFact(
          effect,
          effect.selfPlayerId,
          effect.selfPlayerName,
          effect.selfCard,
          "hand",
          "compare",
          `${effect.selfPlayerName}'s compared hand was visible in a private comparison.`,
        ),
        makeObservedCardFact(
          effect,
          effect.opposingPlayerId,
          effect.opposingPlayerName,
          effect.opposingCard,
          "hand",
          "compare",
          `${effect.opposingPlayerName}'s compared hand was visible in a private comparison.`,
        ),
      ];
    case "cardinal_reveal":
      return [
        makeObservedCardFact(
          effect,
          effect.chosenPlayerId,
          effect.chosenPlayerName,
          effect.revealedCard,
          "hand",
          "cardinal_reveal",
          `${effect.chosenPlayerName}'s swapped hand was revealed after Cardinal.`,
        ),
      ];
    case "discard_reveal":
      return [
        makeObservedCardFact(
          effect,
          effect.targetPlayerId,
          effect.targetPlayerName,
          effect.discardedCard,
          "discard",
          "discard_reveal",
          `${effect.targetPlayerName} discarded this card due to a forced discard.`,
        ),
      ];
    case "guess":
      return effect.revealedCards.map((card, index) =>
        makeObservedCardFact(
          effect,
          effect.targetPlayerId,
          effect.targetPlayerName,
          card,
          "discard",
          "guess",
          index === 0
            ? `${effect.targetPlayerName}'s card was revealed after a guess action.`
            : `${effect.targetPlayerName} revealed an additional card after a guess action.`,
        ),
      );
    default:
      return [];
  }
}

function hasHumanParticipants(game: RoomGame): boolean {
  return (
    game.players.some((player) => !isBotPlayer(game.roomId, player.id)) ||
    game.spectators.some((spectator) => !isBotPlayer(game.roomId, spectator.id))
  );
}

function getPreferredCreatorId(game: RoomGame): string {
  return (
    game.players.find((player) => !isBotPlayer(game.roomId, player.id))?.id ??
    game.spectators.find((spectator) => !isBotPlayer(game.roomId, spectator.id))?.id ??
    game.creatorId
  );
}

function normalizeCreator(game: RoomGame): RoomGame {
  const preferredCreatorId = getPreferredCreatorId(game);
  if (preferredCreatorId === game.creatorId) {
    return game;
  }

  return {
    ...game,
    creatorId: preferredCreatorId,
  };
}

function emitPrivateEffects(roomId: string, gameEffects: ReturnType<typeof playCardAction>["privateEffects"]): void {
  for (const effect of gameEffects ?? []) {
    if (isBotPlayer(roomId, effect.viewerPlayerId)) {
      appendBotMemory(roomId, effect.viewerPlayerId, effect);
    }
    io.to(getPlayerKey(roomId, effect.viewerPlayerId)).emit("action:effect", effect);
  }
}

function ensureBotsReady(roomId: string): void {
  const game = rooms.get(roomId);
  if (!game || (game.phase !== "lobby" && game.phase !== "round_over")) {
    return;
  }

  let next = game;
  let changed = false;
  for (const player of game.players) {
    if (isBotPlayer(roomId, player.id) && !player.isReady) {
      next = setPlayerReady(next, player.id, true);
      changed = true;
    }
  }

  if (!changed) return;

  rooms.set(roomId, normalizeCreator(next));
  emitRoomState(roomId);
}

function runBotTurn(roomId: string): void {
  pendingBotActionByRoomId.delete(roomId);

  const game = rooms.get(roomId);
  if (!game || game.phase !== "in_round" || !game.round) return;

  const cardinalActorId = game.round.pendingCardinalPeek?.actorPlayerId ?? null;
  if (cardinalActorId && isBotPlayer(roomId, cardinalActorId)) {
    const targetPlayerId = chooseRandomCardinalPeekTarget(toBotObservation(game, cardinalActorId, getBotMemory(roomId, cardinalActorId)));
    if (!targetPlayerId) return;

    const result = cardinalPeekAction(game, cardinalActorId, targetPlayerId);
    if (!result.ok || !result.state) return;

    rooms.set(roomId, normalizeCreator(result.state));
    emitRoomState(roomId);
    emitPrivateEffects(roomId, result.privateEffects);
    return;
  }

  const currentPlayerId = game.round.currentPlayerId;
  if (!currentPlayerId || !isBotPlayer(roomId, currentPlayerId)) return;

  const decision = chooseRandomBotPlay(toBotObservation(game, currentPlayerId, getBotMemory(roomId, currentPlayerId)));
  if (!decision) return;

  const result = playCardAction(game, currentPlayerId, decision.instanceId, {
    targetPlayerId: decision.targetPlayerId,
    targetPlayerIds: decision.targetPlayerIds,
    guessedValue: decision.guessedValue,
  });

  if (!result.ok || !result.state) return;

  rooms.set(roomId, normalizeCreator(result.state));
  emitRoomState(roomId);
  emitPrivateEffects(roomId, result.privateEffects);
}

function scheduleBotAction(roomId: string): void {
  clearPendingBotAction(roomId);

  const game = rooms.get(roomId);
  if (!game) return;

  if (game.phase === "lobby" || game.phase === "round_over") {
    ensureBotsReady(roomId);
    return;
  }

  if (game.phase !== "in_round" || !game.round) return;

  const actingBotId = game.round.pendingCardinalPeek?.actorPlayerId ?? game.round.currentPlayerId;
  if (!actingBotId || !isBotPlayer(roomId, actingBotId)) {
    return;
  }

  const timeout = setTimeout(() => {
    runBotTurn(roomId);
  }, BOT_ACTION_DELAY_MS);

  pendingBotActionByRoomId.set(roomId, timeout);
}

function removePlayerFromRoom(roomId: string, playerId: string): void {
  clearPendingRemoval(roomId, playerId);
  activeSocketByPlayerKey.delete(getPlayerKey(roomId, playerId));

  const game = rooms.get(roomId);
  if (!game) {
    unregisterBotPlayer(roomId, playerId);
    return;
  }

  const next = game.players.some((player) => player.id === playerId)
    ? removePlayer(game, playerId)
    : removeSpectator(game, playerId);
  if (isBotPlayer(roomId, playerId)) {
    unregisterBotPlayer(roomId, playerId);
  }

  const normalizedNext = normalizeCreator(next);
  if (normalizedNext.players.length === 0 && normalizedNext.spectators.length === 0) {
    destroyRoom(roomId);
    return;
  }

  if (!hasHumanParticipants(normalizedNext)) {
    destroyRoom(roomId);
    return;
  }

  rooms.set(roomId, normalizedNext);
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
  const game = rooms.get(roomId);
  if (!game) return;

  for (const player of game.players) {
    io.to(getPlayerKey(roomId, player.id)).emit("state", toPlayerViewState(game, player.id));
  }
  for (const spectator of game.spectators) {
    io.to(getPlayerKey(roomId, spectator.id)).emit("state", toPlayerViewState(game, spectator.id));
  }

  scheduleBotAction(roomId);
}

function getParticipantName(game: RoomGame, playerId: string): string | null {
  return (
    game.players.find((player) => player.id === playerId)?.name ??
    game.spectators.find((spectator) => spectator.id === playerId)?.name ??
    null
  );
}

function emitChatHistory(roomId: string, playerId: string): void {
  io.to(getPlayerKey(roomId, playerId)).emit("chat:history", roomChats.get(roomId) ?? []);
}

function addRandomBot(game: RoomGame): RoomGame {
  const botPlayerId = `bot-${randomUUID()}`;
  const botName = getBotDisplayName([
    ...game.players.map((player) => player.name),
    ...game.spectators.map((spectator) => spectator.name),
  ]);
  const withBot = addPlayer(game, botPlayerId, botName);
  if (withBot === game) {
    return game;
  }

  registerBotPlayer(game.roomId, botPlayerId);
  return normalizeCreator(setPlayerReady(withBot, botPlayerId, true));
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name, playerId, mode }, respond?: (payload: { ok: boolean; roomId?: string; reason?: string }) => void) => {
    const roomId = generateRoomCode();
    const normalizedPlayerId = String(playerId ?? "").trim();
    if (!normalizedPlayerId) {
      respond?.({ ok: false, reason: "invalid_action" });
      return;
    }

    const normalizedMode = mode === "premium" ? "premium" : "classic";
    const game = createGame(roomId, normalizedPlayerId, normalizedMode);
    const next = addPlayer(game, normalizedPlayerId, name);
    rooms.set(roomId, next);
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
    const game = rooms.get(normalizedRoomId);
    if (!game || !normalizedPlayerId) {
      socket.emit("action:error", { reason: !normalizedPlayerId ? "invalid_action" : "room_not_found" });
      respond?.({ ok: false, reason: !normalizedPlayerId ? "invalid_action" : "room_not_found" });
      return;
    }

    const existingPlayer = game.players.find((player) => player.id === normalizedPlayerId);
    const existingSpectator = game.spectators.find((spectator) => spectator.id === normalizedPlayerId);
    const next = existingPlayer || existingSpectator
      ? game
      : game.phase === "lobby"
        ? addPlayer(game, normalizedPlayerId, name)
        : addSpectator(game, normalizedPlayerId, name);
    rooms.set(normalizedRoomId, next);
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
    const game = rooms.get(normalizedRoomId);

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

    const game = rooms.get(normalizedRoomId);
    if (!game) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const playerName = getParticipantName(game, binding.playerId);
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

    const game = rooms.get(normalizedRoomId);
    if (!game) return;

    const next = setPlayerReady(game, binding.playerId, Boolean(isReady));
    rooms.set(normalizedRoomId, next);
    emitRoomState(normalizedRoomId);
  });

  socket.on("room:set-mode", ({ roomId, mode }) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }

    const game = rooms.get(normalizedRoomId);
    if (!game) return;

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
    rooms.set(normalizedRoomId, next);
    emitRoomState(normalizedRoomId);
  });

  socket.on("room:add-bot", ({ roomId }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const game = rooms.get(normalizedRoomId);
    if (!game) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    if (game.creatorId !== binding.playerId) {
      respond?.({ ok: false, reason: "only_creator_can_manage_bots" });
      return;
    }

    if (game.phase !== "lobby") {
      respond?.({ ok: false, reason: "cannot_add_bot_now" });
      return;
    }

    const next = addRandomBot(game);
    rooms.set(normalizedRoomId, next);
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

    const game = rooms.get(normalizedRoomId);
    if (!game) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }

    if (game.creatorId !== binding.playerId) {
      socket.emit("action:error", { reason: "only_creator_can_start" });
      return;
    }

    if ((game.phase === "lobby" || game.phase === "round_over") && !canStartReadyRound(game)) {
      socket.emit("action:error", { reason: "players_not_ready" });
      return;
    }

    const next = startRound(game);
    if (next !== game && next.phase === "in_round") {
      resetRoomBotMemories(normalizedRoomId);
    }
    rooms.set(normalizedRoomId, next);
    emitRoomState(normalizedRoomId);
  });

  socket.on("match:return-to-lobby", ({ roomId }) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }

    const game = rooms.get(normalizedRoomId);
    if (!game) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }

    if (game.creatorId !== binding.playerId) {
      socket.emit("action:error", { reason: "only_creator_can_start" });
      return;
    }

    const next = resetMatchToLobby(game);
    rooms.set(normalizedRoomId, next);
    emitRoomState(normalizedRoomId);
  });

  socket.on("card:play", ({ roomId, instanceId, targetPlayerId, targetPlayerIds, guessedValue }, respond?: (payload: { ok: boolean; reason?: string }) => void) => {
    const binding = getBoundPlayer(socket.id);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    if (!binding || binding.roomId !== normalizedRoomId) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const game = rooms.get(normalizedRoomId);
    if (!game) {
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

    rooms.set(normalizedRoomId, result.state);
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

    const game = rooms.get(normalizedRoomId);
    if (!game) {
      respond?.({ ok: false, reason: "room_not_found" });
      return;
    }

    const result = cardinalPeekAction(game, binding.playerId, String(targetPlayerId ?? "").trim());

    if (!result.ok || !result.state) {
      socket.emit("action:error", { reason: result.reason ?? "invalid_action" });
      respond?.({ ok: false, reason: result.reason ?? "invalid_action" });
      return;
    }

    rooms.set(normalizedRoomId, result.state);
    emitRoomState(normalizedRoomId);
    respond?.({ ok: true });
    emitPrivateEffects(normalizedRoomId, result.privateEffects);
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
