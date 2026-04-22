import React from "react";

import { getCardDef } from "@game-site/shared";
import type { CardInstance, PlayerID, PlayerViewState } from "@game-site/shared";

import { formatErrorReason } from "../lib/gamePresentation.js";
import { socket } from "../lib/socket.js";
import { HomePage } from "../pages/HomePage.js";
import { RoomPage } from "../pages/RoomPage.js";
import "../styles.css";

type ActionNote =
  | { type: "peek"; playerId: PlayerID; targetPlayerId: PlayerID; seenCard: CardInstance | null }
  | { type: "compare"; playerId: PlayerID; targetPlayerId: PlayerID; playerCard: CardInstance | null; targetCard: CardInstance | null };

function formatPrivateNote(note: ActionNote): string {
  if (note.type === "peek") {
    return note.seenCard ? `You saw ${getCardDef(note.seenCard.cardId).name}.` : "You looked but saw no card.";
  }

  const playerCard = note.playerCard ? getCardDef(note.playerCard.cardId).name : "nothing";
  const targetCard = note.targetCard ? getCardDef(note.targetCard.cardId).name : "nothing";
  return `Comparison result: you had ${playerCard}, they had ${targetCard}.`;
}

export function App() {
  const [selectedGame, setSelectedGame] = React.useState<string | null>(null);
  const [playerName, setPlayerName] = React.useState("");
  const [joinCode, setJoinCode] = React.useState("");
  const [state, setState] = React.useState<PlayerViewState | null>(null);
  const [pendingAction, setPendingAction] = React.useState<"create" | "join" | null>(null);
  const [message, setMessage] = React.useState("Enter your name, then create or join a room.");
  const [lastNote, setLastNote] = React.useState("");
  const [selectedInstanceId, setSelectedInstanceId] = React.useState<string | null>(null);
  const [targetPlayerId, setTargetPlayerId] = React.useState("");
  const [guessedValue, setGuessedValue] = React.useState("2");

  React.useEffect(() => {
    const onState = (nextState: PlayerViewState) => {
      setState(nextState);
      setPendingAction(null);
      setJoinCode(nextState.roomId);
      setMessage(nextState.phase === "lobby" ? "Room ready. Players can toggle ready." : "Game in progress.");
    };

    const onConnect = () => {
      setMessage((current) => (current.includes("server") ? "Connected. You can create or join a room." : current));
    };

    const onError = (payload: { reason?: string }) => {
      setPendingAction(null);
      setMessage(formatErrorReason(payload.reason ?? "invalid_action"));
    };

    const onConnectError = () => {
      setPendingAction(null);
      setMessage("Cannot reach the game server. Make sure the dev server is running.");
    };

    const onDisconnect = () => {
      setPendingAction(null);
      setMessage("Connection lost. Trying to reconnect...");
    };

    const onNote = (note: ActionNote) => {
      setLastNote(formatPrivateNote(note));
    };

    socket.on("connect", onConnect);
    socket.on("state", onState);
    socket.on("action:error", onError);
    socket.on("action:note", onNote);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("state", onState);
      socket.off("action:error", onError);
      socket.off("action:note", onNote);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  function requireName(): string | null {
    const trimmedName = playerName.trim();
    if (!trimmedName) {
      setMessage("Enter your display name first.");
      return null;
    }

    return trimmedName;
  }

  function handleCreateRoom() {
    if (!selectedGame) {
      setMessage("Choose a game first.");
      return;
    }

    const trimmedName = requireName();
    if (!trimmedName) return;

    setPendingAction("create");
    setMessage("Creating room...");
    socket.emit("room:create", { name: trimmedName }, (response: { ok: boolean; roomId?: string; reason?: string }) => {
      if (!response.ok) {
        setPendingAction(null);
        setMessage(formatErrorReason(response.reason ?? "invalid_action"));
        return;
      }

      if (response.roomId) {
        setJoinCode(response.roomId);
      }
    });
  }

  function handleJoinRoom() {
    if (!selectedGame) {
      setMessage("Choose a game first.");
      return;
    }

    const trimmedName = requireName();
    if (!trimmedName) return;

    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      setMessage("Enter the room code to join.");
      return;
    }

    setPendingAction("join");
    setMessage(`Joining room ${normalizedCode}...`);
    socket.emit("room:join", {
      roomId: normalizedCode,
      name: trimmedName,
    }, (response: { ok: boolean; roomId?: string; reason?: string }) => {
      if (!response.ok) {
        setPendingAction(null);
        setMessage(formatErrorReason(response.reason ?? "invalid_action"));
        return;
      }

      if (response.roomId) {
        setJoinCode(response.roomId);
      }
    });
  }

  function handleToggleReady(isReady: boolean) {
    if (!state) return;

    socket.emit("room:set-ready", {
      roomId: state.roomId,
      isReady,
    });
  }

  function handleStartRound() {
    if (!state) return;

    setLastNote("");
    socket.emit("round:start", { roomId: state.roomId });
  }

  function handlePlayCard() {
    if (!state) return;

    const self = state.players.find((player) => player.id === state.selfPlayerId);
    const selectedCard = self?.hand.find((card) => card.instanceId === selectedInstanceId);
    if (!selectedCard) return;

    const selectedCardDef = getCardDef(selectedCard.cardId);
    const targetNeeded =
      selectedCardDef.id === "guard" ||
      selectedCardDef.id === "priest" ||
      selectedCardDef.id === "baron" ||
      selectedCardDef.id === "king" ||
      selectedCardDef.id === "prince";
    const guessNeeded = selectedCardDef.id === "guard";

    socket.emit("card:play", {
      roomId: state.roomId,
      instanceId: selectedCard.instanceId,
      targetPlayerId: targetNeeded ? targetPlayerId : undefined,
      guessedValue: guessNeeded ? Number(guessedValue) : undefined,
    });

    setSelectedInstanceId(null);
  }

  function handleLeaveRoom(backToGames: boolean) {
    if (state) {
      socket.emit("room:leave", { roomId: state.roomId });
    }

    setState(null);
    setPendingAction(null);
    setLastNote("");
    setSelectedInstanceId(null);
    setTargetPlayerId("");
    setGuessedValue("2");
    setMessage(backToGames ? "Choose a game to create or join a room." : "You left the room.");

    if (backToGames) {
      setSelectedGame(null);
      setJoinCode("");
    }
  }

  if (!state) {
    return (
      <HomePage
        selectedGame={selectedGame}
        playerName={playerName}
        joinCode={joinCode}
        pendingAction={pendingAction}
        message={message}
        onSelectGame={setSelectedGame}
        onPlayerNameChange={setPlayerName}
        onJoinCodeChange={setJoinCode}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
      />
    );
  }

  return (
    <RoomPage
      state={state}
      gameTitle={selectedGame === "love-letter" ? "Love Letter" : "Game Room"}
      message={message}
      lastNote={lastNote}
      selectedInstanceId={selectedInstanceId}
      targetPlayerId={targetPlayerId}
      guessedValue={guessedValue}
      onSelectCard={setSelectedInstanceId}
      onTargetPlayerChange={setTargetPlayerId}
      onGuessedValueChange={setGuessedValue}
      onToggleReady={handleToggleReady}
      onStartRound={handleStartRound}
      onPlayCard={handlePlayCard}
      onLeaveRoom={() => handleLeaveRoom(false)}
      onBackToGames={() => handleLeaveRoom(true)}
    />
  );
}
