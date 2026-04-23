import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

import { Server } from "socket.io";

import { isGameId } from "@game-site/shared";
import { addPlayer, addSpectator, canStartReadyRound, cardinalPeekAction, createGame, playCardAction, removePlayer, removeSpectator, resetMatchToLobby, setGameMode, setPlayerReady, startRound, toPlayerViewState } from "@game-site/shared/games/love-letter/engine";
import type { GameState as LoveLetterGameState } from "@game-site/shared/games/love-letter/types";
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

const rooms = new Map<string, RoomRecord>();
const roomChats = new Map<string, ChatMessage[]>();
const playerBySocketId = new Map<string, { roomId: string; playerId: string }>();
const activeSocketByPlayerKey = new Map<string, string>();
const pendingRemovalByPlayerKey = new Map<string, NodeJS.Timeout>();
const DISCONNECT_GRACE_MS = 30_000;
const MAX_CHAT_HISTORY = 80;

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

  const room = rooms.get(roomId);
  if (!room) return;

  if (room.gameId === "love-letter") {
    const next = room.state.players.some((player) => player.id === playerId)
      ? removePlayer(room.state, playerId)
      : removeSpectator(room.state, playerId);

    if (next.players.length === 0 && next.spectators.length === 0) {
      rooms.delete(roomId);
      roomChats.delete(roomId);
      return;
    }

    setRoomState(roomId, room, next);
  } else {
    const next = room.state.players.some((player) => player.id === playerId)
      ? removeSkullKingPlayer(room.state, playerId)
      : removeSkullKingSpectator(room.state, playerId);

    if (next.players.length === 0 && next.spectators.length === 0) {
      rooms.delete(roomId);
      roomChats.delete(roomId);
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

io.on("connection", (socket) => {
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

    const room = getLoveLetterRoom(normalizedRoomId);
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

      setRoomState(normalizedRoomId, room, startRound(game));
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

    for (const effect of result.privateEffects ?? []) {
      io.to(getPlayerKey(normalizedRoomId, effect.viewerPlayerId)).emit("action:effect", effect);
    }
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
