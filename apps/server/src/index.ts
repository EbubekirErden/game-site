import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

import { Server } from "socket.io";

import { addPlayer, canStartReadyRound, cardinalPeekAction, createGame, playCardAction, removePlayer, setGameMode, setPlayerReady, startRound, toPlayerViewState } from "@game-site/shared/engine";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const rooms = new Map<string, ReturnType<typeof createGame>>();
const playerBySocketId = new Map<string, { roomId: string; playerId: string }>();
const activeSocketByPlayerKey = new Map<string, string>();
const pendingRemovalByPlayerKey = new Map<string, NodeJS.Timeout>();
const DISCONNECT_GRACE_MS = 30_000;

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

function removePlayerFromRoom(roomId: string, playerId: string): void {
  clearPendingRemoval(roomId, playerId);
  activeSocketByPlayerKey.delete(getPlayerKey(roomId, playerId));

  const game = rooms.get(roomId);
  if (!game) return;

  const next = removePlayer(game, playerId);
  if (next.players.length === 0) {
    rooms.delete(roomId);
    return;
  }

  rooms.set(roomId, next);
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
    if (!existingPlayer && game.phase !== "lobby") {
      socket.emit("action:error", { reason: "game_already_started" });
      respond?.({ ok: false, reason: "game_already_started" });
      return;
    }

    const next = existingPlayer ? game : addPlayer(game, normalizedPlayerId, name);
    rooms.set(normalizedRoomId, next);
    bindSocketToPlayer(socket.id, normalizedRoomId, normalizedPlayerId);
    socket.join(normalizedRoomId);
    socket.join(getPlayerKey(normalizedRoomId, normalizedPlayerId));
    emitRoomState(normalizedRoomId);
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
    if (!existingPlayer) {
      respond?.({ ok: false, reason: "player_not_found" });
      return;
    }

    bindSocketToPlayer(socket.id, normalizedRoomId, normalizedPlayerId);
    socket.join(normalizedRoomId);
    socket.join(getPlayerKey(normalizedRoomId, normalizedPlayerId));
    emitRoomState(normalizedRoomId);
    respond?.({ ok: true, roomId: normalizedRoomId });
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

    for (const effect of result.privateEffects ?? []) {
      io.to(getPlayerKey(normalizedRoomId, effect.viewerPlayerId)).emit("action:effect", effect);
    }
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

    for (const effect of result.privateEffects ?? []) {
      io.to(getPlayerKey(normalizedRoomId, effect.viewerPlayerId)).emit("action:effect", effect);
    }
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
