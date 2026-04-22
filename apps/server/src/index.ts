import { createServer } from "node:http";

import { Server } from "socket.io";

import { addPlayer, createGame, playCardAction, startRound, toPlayerViewState } from "@game-site/shared";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const rooms = new Map<string, ReturnType<typeof createGame>>();

function emitRoomState(roomId: string): void {
  const game = rooms.get(roomId);
  if (!game) return;

  for (const player of game.players) {
    io.to(player.id).emit("state", toPlayerViewState(game, player.id));
  }
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ roomId, name }) => {
    const game = createGame(roomId);
    const next = addPlayer(game, socket.id, name);
    rooms.set(roomId, next);
    socket.join(roomId);
    emitRoomState(roomId);
  });

  socket.on("room:join", ({ roomId, name }) => {
    const game = rooms.get(roomId);
    if (!game) return;
    const next = addPlayer(game, socket.id, name);
    rooms.set(roomId, next);
    socket.join(roomId);
    emitRoomState(roomId);
  });

  socket.on("round:start", ({ roomId }) => {
    const game = rooms.get(roomId);
    if (!game) return;
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
