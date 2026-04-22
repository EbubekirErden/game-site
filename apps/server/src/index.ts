import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

import { Server } from "socket.io";

import { addPlayer, canStartLobbyRound, createGame, playCardAction, setPlayerReady, startRound, toPlayerViewState } from "@game-site/shared/engine";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const rooms = new Map<string, ReturnType<typeof createGame>>();

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
    io.to(player.id).emit("state", toPlayerViewState(game, player.id));
  }
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name }) => {
    const roomId = generateRoomCode();
    const game = createGame(roomId, socket.id);
    const next = addPlayer(game, socket.id, name);
    rooms.set(roomId, next);
    socket.join(roomId);
    emitRoomState(roomId);
  });

  socket.on("room:join", ({ roomId, name }) => {
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    const game = rooms.get(normalizedRoomId);
    if (!game) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }
    const next = addPlayer(game, socket.id, name);
    rooms.set(normalizedRoomId, next);
    socket.join(normalizedRoomId);
    emitRoomState(normalizedRoomId);
  });

  socket.on("room:set-ready", ({ roomId, isReady }) => {
    const game = rooms.get(roomId);
    if (!game) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }

    const next = setPlayerReady(game, socket.id, Boolean(isReady));
    rooms.set(roomId, next);
    emitRoomState(roomId);
  });

  socket.on("round:start", ({ roomId }) => {
    const game = rooms.get(roomId);
    if (!game) {
      socket.emit("action:error", { reason: "room_not_found" });
      return;
    }

    if (game.creatorId !== socket.id) {
      socket.emit("action:error", { reason: "only_creator_can_start" });
      return;
    }

    if (game.phase === "lobby" && !canStartLobbyRound(game)) {
      socket.emit("action:error", { reason: "players_not_ready" });
      return;
    }

    const next = startRound(game);
    rooms.set(roomId, next);
    emitRoomState(roomId);
  });

  socket.on("card:play", ({ roomId, instanceId, targetPlayerId, guessedValue }) => {
    const game = rooms.get(roomId);
    if (!game) return;

    const result = playCardAction(game, socket.id, instanceId, {
      targetPlayerId,
      guessedValue,
    });

    if (!result.ok || !result.state) {
      socket.emit("action:error", { reason: result.reason ?? "invalid_action" });
      return;
    }

    rooms.set(roomId, result.state);
    emitRoomState(roomId);

    for (const note of result.privateNotes ?? []) {
      io.to(note.playerId).emit("action:note", note);
    }
  });
});

httpServer.listen(3001, () => {
  console.log("server listening on :3001");
});
