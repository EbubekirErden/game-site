import React from "react";
import { Navigate, Route, Routes, matchPath, useLocation, useNavigate } from "react-router-dom";

import { getCardDef } from "@game-site/shared";
import type { LoveLetterMode, PrivateEffectPresentation, PlayerViewState } from "@game-site/shared";

import { formatErrorReason } from "../lib/gamePresentation.js";
import { socket } from "../lib/socket.js";
import { HomePage } from "../pages/HomePage.js";
import { RoomPage } from "../pages/RoomPage.js";
import "../styles.css";

const SESSION_STORAGE_KEY = "game-site:session";

type PersistedSession = {
  playerId: string;
  playerName: string;
  selectedGame: string | null;
  selectedMode: LoveLetterMode;
  roomId: string | null;
};

export type RoomChatMessage = {
  id: string;
  roomId: string;
  playerId: string;
  playerName: string;
  text: string;
  createdAt: number;
};

const GAMES = [
  {
    id: "love-letter",
    title: "Love Letter",
    description: "Classic deduction card game",
    available: true,
  },
  {
    id: "coming-soon",
    title: "More Games Soon",
    description: "This page is structured to support additional games.",
    available: false,
  },
];

function createPlayerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `player-${Math.random().toString(36).slice(2, 10)}`;
}

function readPersistedSession(): PersistedSession {
  if (typeof window === "undefined") {
    return {
      playerId: createPlayerId(),
      playerName: "",
      selectedGame: null,
      selectedMode: "classic",
      roomId: null,
    };
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return {
        playerId: createPlayerId(),
        playerName: "",
        selectedGame: null,
        selectedMode: "classic",
        roomId: null,
      };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    return {
      playerId: typeof parsed.playerId === "string" && parsed.playerId ? parsed.playerId : createPlayerId(),
      playerName: typeof parsed.playerName === "string" ? parsed.playerName : "",
      selectedGame: parsed.selectedGame === "love-letter" ? parsed.selectedGame : null,
      selectedMode: parsed.selectedMode === "premium" ? "premium" : "classic",
      roomId: typeof parsed.roomId === "string" && parsed.roomId ? parsed.roomId : null,
    };
  } catch {
    return {
      playerId: createPlayerId(),
      playerName: "",
      selectedGame: null,
      selectedMode: "classic",
      roomId: null,
    };
  }
}

function writePersistedSession(session: PersistedSession): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function getPhaseMessage(phase: PlayerViewState["phase"], selfRole: PlayerViewState["selfRole"]): string {
  if (selfRole === "spectator") {
    if (phase === "match_over") return "Match over. The host can return everyone to the lobby.";
    return "You are watching as a spectator. You can join as a player when the match returns to lobby.";
  }

  if (phase === "lobby") {
    return "Room ready. Players can toggle ready.";
  }

  if (phase === "round_over") {
    return "Round over. Everyone can confirm ready for the next round.";
  }

  if (phase === "match_over") {
    return "Match over.";
  }

  return "Game in progress.";
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const roomRouteMatch = matchPath("/games/:gameId/rooms/:roomId", location.pathname);
  const routeGameId = roomRouteMatch?.params.gameId;
  const routeRoomId = roomRouteMatch?.params.roomId;
  const initialSessionRef = React.useRef<PersistedSession | null>(null);
  if (!initialSessionRef.current) {
    initialSessionRef.current = readPersistedSession();
  }
  const initialSession = initialSessionRef.current;
  const playerIdRef = React.useRef(initialSession.playerId);
  const [selectedGame, setSelectedGame] = React.useState<string | null>(() => (routeGameId === "love-letter" ? "love-letter" : initialSession.selectedGame));
  const [selectedMode, setSelectedMode] = React.useState<LoveLetterMode>(initialSession.selectedMode);
  const [playerName, setPlayerName] = React.useState(initialSession.playerName);
  const [joinCode, setJoinCode] = React.useState(() => routeRoomId ?? initialSession.roomId ?? "");
  const [savedRoomId, setSavedRoomId] = React.useState<string | null>(initialSession.roomId);
  const [state, setState] = React.useState<PlayerViewState | null>(null);
  const [pendingAction, setPendingAction] = React.useState<"create" | "join" | null>(null);
  const [message, setMessage] = React.useState("Enter your name, then create or join a room.");
  const [activeEffectPresentation, setActiveEffectPresentation] = React.useState<PrivateEffectPresentation | null>(null);
  const [chatMessages, setChatMessages] = React.useState<RoomChatMessage[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = React.useState<string | null>(null);
  const [selectedTargetPlayerIds, setSelectedTargetPlayerIds] = React.useState<string[]>([]);
  const [guessedValue, setGuessedValue] = React.useState("2");
  const reconnectAttemptRef = React.useRef<string | null>(null);

  const attemptReconnect = React.useCallback((roomId: string) => {
    if (!roomId || !playerName.trim()) return;
    if (reconnectAttemptRef.current === roomId) return;

    reconnectAttemptRef.current = roomId;
    setPendingAction("join");
    setMessage(`Rejoining room ${roomId}...`);
    socket.emit(
      "room:reconnect",
      {
        roomId,
        playerId: playerIdRef.current,
      },
      (response: { ok: boolean; roomId?: string; reason?: string }) => {
        setPendingAction(null);
        if (response.ok) {
          return;
        }

        if (roomId === reconnectAttemptRef.current) {
          reconnectAttemptRef.current = null;
        }
        setSavedRoomId(null);
        setState(null);
        setMessage(formatErrorReason(response.reason ?? "invalid_action"));
        if (location.pathname !== "/") {
          navigate("/", { replace: true });
        }
      },
    );
  }, [location.pathname, navigate, playerName]);

  React.useEffect(() => {
    writePersistedSession({
      playerId: playerIdRef.current,
      playerName,
      selectedGame,
      selectedMode,
      roomId: savedRoomId,
    });
  }, [playerName, savedRoomId, selectedGame, selectedMode]);

  React.useEffect(() => {
    if (routeRoomId) {
      setJoinCode(routeRoomId);
    }
  }, [routeRoomId]);

  React.useEffect(() => {
    const onState = (nextState: PlayerViewState) => {
      setState(nextState);
      setSelectedGame("love-letter");
      setSelectedMode(nextState.mode);
      setPendingAction(null);
      setJoinCode(nextState.roomId);
      setSavedRoomId(nextState.roomId);
      reconnectAttemptRef.current = null;
      setMessage(getPhaseMessage(nextState.phase, nextState.selfRole));
      if (location.pathname !== `/games/love-letter/rooms/${nextState.roomId}`) {
        navigate(`/games/love-letter/rooms/${nextState.roomId}`, { replace: true });
      }
    };

    const onConnect = () => {
      if (savedRoomId && playerName.trim()) {
        attemptReconnect(savedRoomId);
        return;
      }

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

    const onEffect = (effect: PrivateEffectPresentation) => {
      setActiveEffectPresentation(effect);
    };

    const onChatHistory = (messages: RoomChatMessage[]) => {
      setChatMessages(messages);
    };

    const onChatMessage = (chatMessage: RoomChatMessage) => {
      setChatMessages((current) => {
        if (current.some((existing) => existing.id === chatMessage.id)) return current;
        return [...current, chatMessage].slice(-80);
      });
    };

    socket.on("connect", onConnect);
    socket.on("state", onState);
    socket.on("action:error", onError);
    socket.on("action:effect", onEffect);
    socket.on("chat:history", onChatHistory);
    socket.on("chat:message", onChatMessage);
    socket.on("connect_error", onConnectError);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("state", onState);
      socket.off("action:error", onError);
      socket.off("action:effect", onEffect);
      socket.off("chat:history", onChatHistory);
      socket.off("chat:message", onChatMessage);
      socket.off("connect_error", onConnectError);
      socket.off("disconnect", onDisconnect);
    };
  }, [attemptReconnect, location.pathname, navigate, playerName, savedRoomId]);

  React.useEffect(() => {
    if (!socket.connected || !savedRoomId || state?.roomId === savedRoomId) return;
    attemptReconnect(savedRoomId);
  }, [attemptReconnect, savedRoomId, state?.roomId]);

  React.useEffect(() => {
    if (routeGameId === "love-letter") {
      setSelectedGame("love-letter");
    }
  }, [routeGameId]);

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
    socket.emit("room:create", { name: trimmedName, playerId: playerIdRef.current, mode: "classic" }, (response: { ok: boolean; roomId?: string; reason?: string }) => {
      if (!response.ok) {
        setPendingAction(null);
        setMessage(formatErrorReason(response.reason ?? "invalid_action"));
        return;
      }

      if (response.roomId) {
        setJoinCode(response.roomId);
        setSavedRoomId(response.roomId);
        navigate(`/games/${selectedGame}/rooms/${response.roomId}`);
      }
    });
  }

  function handleSetMode(mode: LoveLetterMode) {
    if (!state) return;

    socket.emit("room:set-mode", {
      roomId: state.roomId,
      mode,
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
      playerId: playerIdRef.current,
    }, (response: { ok: boolean; roomId?: string; reason?: string }) => {
      if (!response.ok) {
        setPendingAction(null);
        setMessage(formatErrorReason(response.reason ?? "invalid_action"));
        return;
      }

      if (response.roomId) {
        setJoinCode(response.roomId);
        setSavedRoomId(response.roomId);
        navigate(`/games/${selectedGame}/rooms/${response.roomId}`);
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

    setActiveEffectPresentation(null);
    socket.emit("round:start", { roomId: state.roomId });
  }

  function handleReturnToLobby() {
    if (!state) return;

    setActiveEffectPresentation(null);
    socket.emit("match:return-to-lobby", { roomId: state.roomId });
  }

  function handleAddBot(): Promise<boolean> {
    if (!state) return Promise.resolve(false);

    return new Promise((resolve) => {
      socket.emit(
        "room:add-bot",
        {
          roomId: state.roomId,
        },
        (response: { ok: boolean; reason?: string }) => {
          if (!response.ok) {
            setMessage(formatErrorReason(response.reason ?? "invalid_action"));
            resolve(false);
            return;
          }

          setMessage("Random bot added to the room.");
          resolve(true);
        },
      );
    });
  }

  function handlePlayCard(): Promise<boolean> {
    if (!state) return Promise.resolve(false);

    const self = state.players.find((player) => player.id === state.selfPlayerId);
    const selectedCard = self?.hand.find((card) => card.instanceId === selectedInstanceId);
    if (!selectedCard) return Promise.resolve(false);

    const selectedCardDef = getCardDef(selectedCard.cardId);
    const targetPlayerId = selectedTargetPlayerIds[0] ?? "";
    const multiTargetIds =
      selectedCardDef.id === "baroness" || selectedCardDef.id === "cardinal"
        ? selectedTargetPlayerIds
        : undefined;
    const singleTargetNeeded = [
      "guard",
      "bishop",
      "priest",
      "baron",
      "handmaid",
      "dowager_queen",
      "king",
      "prince",
      "jester",
      "sycophant",
    ].includes(selectedCardDef.id);
    const guessNeeded = selectedCardDef.id === "guard" || selectedCardDef.id === "bishop";

    return new Promise((resolve) => {
      socket.emit(
        "card:play",
        {
          roomId: state.roomId,
          instanceId: selectedCard.instanceId,
          targetPlayerId: singleTargetNeeded ? targetPlayerId || undefined : undefined,
          targetPlayerIds: multiTargetIds && multiTargetIds.length > 0 ? multiTargetIds : undefined,
          guessedValue: guessNeeded ? Number(guessedValue) : undefined,
        },
        (response: { ok: boolean; reason?: string }) => {
          if (!response.ok) {
            setMessage(formatErrorReason(response.reason ?? "invalid_action"));
            resolve(false);
            return;
          }

          setActiveEffectPresentation(null);
          setMessage(`Discarded ${selectedCardDef.name}.`);
          setSelectedInstanceId(null);
          setSelectedTargetPlayerIds([]);
          resolve(true);
        },
      );
    });
  }

  function handleDismissEffect() {
    setActiveEffectPresentation(null);
  }

  function handleCardinalPeek(targetPlayerId: string): Promise<boolean> {
    if (!state) return Promise.resolve(false);

    return new Promise((resolve) => {
      socket.emit(
        "cardinal:peek",
        {
          roomId: state.roomId,
          targetPlayerId,
        },
        (response: { ok: boolean; reason?: string }) => {
          if (!response.ok) {
            setMessage(formatErrorReason(response.reason ?? "invalid_action"));
            resolve(false);
            return;
          }

          resolve(true);
        },
      );
    });
  }

  function handleSendChatMessage(text: string): Promise<boolean> {
    if (!state) return Promise.resolve(false);

    return new Promise((resolve) => {
      socket.emit(
        "chat:send",
        {
          roomId: state.roomId,
          text,
        },
        (response: { ok: boolean; reason?: string }) => {
          if (!response.ok) {
            setMessage(formatErrorReason(response.reason ?? "invalid_action"));
            resolve(false);
            return;
          }

          resolve(true);
        },
      );
    });
  }

  function handleLeaveRoom(backToGames: boolean) {
    if (state) {
      socket.emit("room:leave", { roomId: state.roomId });
    }

    setState(null);
    setSavedRoomId(null);
    setPendingAction(null);
    setActiveEffectPresentation(null);
    setChatMessages([]);
    setSelectedInstanceId(null);
    setSelectedTargetPlayerIds([]);
    setGuessedValue("2");
    reconnectAttemptRef.current = null;
    setMessage(backToGames ? "Choose a game to create or join a room." : "You left the room.");

    if (backToGames) {
      setSelectedGame(null);
      setJoinCode("");
    }

    navigate("/");
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
            <HomePage
              games={GAMES}
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
        }
      />
      <Route
        path="/games/:gameId/rooms/:roomId"
        element={
          state && routeRoomId === state.roomId ? (
            <RoomPage
              state={state}
              gameTitle={
                selectedGame === "love-letter"
                  ? state.mode === "premium"
                    ? "Love Letter Premium"
                    : "Love Letter"
                  : "Game Room"
              }
              message={message}
              activeEffectPresentation={activeEffectPresentation}
              selectedInstanceId={selectedInstanceId}
              selectedTargetPlayerIds={selectedTargetPlayerIds}
              guessedValue={guessedValue}
              onSelectCard={setSelectedInstanceId}
              onTargetPlayerIdsChange={setSelectedTargetPlayerIds}
              onGuessedValueChange={setGuessedValue}
              onToggleReady={handleToggleReady}
              onSetMode={handleSetMode}
              onAddBot={handleAddBot}
              onStartRound={handleStartRound}
              onReturnToLobby={handleReturnToLobby}
              onPlayCard={handlePlayCard}
              onDismissEffect={handleDismissEffect}
              onCardinalPeek={handleCardinalPeek}
              chatMessages={chatMessages}
              onSendChatMessage={handleSendChatMessage}
              onLeaveRoom={() => handleLeaveRoom(false)}
            />
          ) : routeRoomId && savedRoomId === routeRoomId && Boolean(playerName.trim()) ? (
            <main className="hub-layout">
              <section className="hub-main">
                <div className="hub-action-stage">
                  <header className="stage-header">
                    <h2>Restoring Room</h2>
                    <p>{pendingAction === "join" ? message : `Trying to rejoin room ${routeRoomId}...`}</p>
                  </header>
                </div>
              </section>
            </main>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
