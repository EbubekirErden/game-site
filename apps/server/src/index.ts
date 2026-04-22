import { createServer } from "node:http";

import { Server } from "socket.io";

import { addPlayer, createGame, startRound } from "@game-site/shared";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const rooms = new Map<string, ReturnType<typeof createGame>>();

io.on("connection", (socket) => {
  socket.on("room:create", ({ roomId, name }) => {
    const game = createGame(roomId);
    const next = addPlayer(game, socket.id, name);
    rooms.set(roomId, next);
    socket.join(roomId);
    io.to(roomId).emit("state", next);
  });

  socket.on("room:join", ({ roomId, name }) => {
    const game = rooms.get(roomId);
    if (!game) return;
    const next = addPlayer(game, socket.id, name);
    rooms.set(roomId, next);
    socket.join(roomId);
    io.to(roomId).emit("state", next);
  });

  socket.on("round:start", ({ roomId }) => {
    const game = rooms.get(roomId);
    if (!game) return;
    const next = startRound(game);
    rooms.set(roomId, next);
    io.to(roomId).emit("state", next);
  });
});

httpServer.listen(3001, () => {
  console.log("server listening on :3001");
});
