import React from "react";
import ReactDOM from "react-dom/client";
import { io, type Socket } from "socket.io-client";

import { getCardDef } from "@game-site/shared";
import type { CardInstance, CardID, GameEvent, PlayerID, PlayerViewState } from "@game-site/shared";

import { CardView } from "./components/CardView.js";
import "./styles.css";

type ActionNote =
  | { type: "peek"; playerId: PlayerID; targetPlayerId: PlayerID; seenCard: CardInstance | null }
  | { type: "compare"; playerId: PlayerID; targetPlayerId: PlayerID; playerCard: CardInstance | null; targetCard: CardInstance | null };

const socket: Socket = io("http://localhost:3001");

function App() {
  const [roomId, setRoomId] = React.useState("love-letter");
  const [playerName, setPlayerName] = React.useState("");
  const [joinedRoomId, setJoinedRoomId] = React.useState("");
  const [state, setState] = React.useState<PlayerViewState | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = React.useState<string | null>(null);
  const [targetPlayerId, setTargetPlayerId] = React.useState<string>("");
  const [guessedValue, setGuessedValue] = React.useState("2");
  const [message, setMessage] = React.useState("Create or join a room to begin.");
  const [lastNote, setLastNote] = React.useState<string>("");

  React.useEffect(() => {
    const onState = (nextState: PlayerViewState) => {
      setState(nextState);
      setJoinedRoomId(nextState.roomId);
    };

    const onError = (payload: { reason?: string }) => {
      setMessage(formatReason(payload.reason ?? "invalid_action"));
    };

    const onNote = (note: ActionNote) => {
      setLastNote(formatNote(note));
    };

    socket.on("state", onState);
    socket.on("action:error", onError);
    socket.on("action:note", onNote);

    return () => {
      socket.off("state", onState);
      socket.off("action:error", onError);
      socket.off("action:note", onNote);
    };
  }, []);

  const self = state?.players.find((player) => player.id === state.selfPlayerId) ?? null;
  const selectedCard = self?.hand.find((card) => card.instanceId === selectedInstanceId) ?? null;
  const selectedCardDef = selectedCard ? getCardDef(selectedCard.cardId) : null;
  const isMyTurn = Boolean(state && self && state.round?.currentPlayerId === self.id && state.phase === "in_round");
  const guessNeeded = selectedCardDef?.id === "guard";
  const targetNeeded =
    selectedCardDef?.id === "guard" ||
    selectedCardDef?.id === "priest" ||
    selectedCardDef?.id === "baron" ||
    selectedCardDef?.id === "king" ||
    selectedCardDef?.id === "prince";

  const targetablePlayers = React.useMemo(() => {
    if (!state || !self || !selectedCardDef) return [];

    if (selectedCardDef.id === "prince") {
      const otherOptions = state.players.filter((player) => player.id !== self.id && player.status === "active" && !player.protectedUntilNextTurn);
      if (otherOptions.length === 0) {
        return [self];
      }
      return [self, ...otherOptions];
    }

    if (selectedCardDef.targetRule === "single_other_non_protected") {
      return state.players.filter((player) => player.id !== self.id && player.status === "active" && !player.protectedUntilNextTurn);
    }

    if (selectedCardDef.targetRule === "self") {
      return [self];
    }

    return [];
  }, [selectedCardDef, self, state]);

  React.useEffect(() => {
    if (!selectedCardDef) {
      setTargetPlayerId("");
      return;
    }

    if (!targetNeeded) {
      setTargetPlayerId("");
      return;
    }

    const currentStillValid = targetablePlayers.some((player) => player.id === targetPlayerId);
    if (!currentStillValid) {
      setTargetPlayerId(targetablePlayers[0]?.id ?? "");
    }
  }, [selectedCardDef, targetNeeded, targetPlayerId, targetablePlayers]);

  function joinRoom(mode: "create" | "join") {
    const trimmedRoomId = roomId.trim();
    const trimmedName = playerName.trim();

    if (!trimmedRoomId || !trimmedName) {
      setMessage("Room ID and player name are both required.");
      return;
    }

    setJoinedRoomId(trimmedRoomId);
    setMessage(mode === "create" ? "Creating room..." : "Joining room...");
    socket.emit(mode === "create" ? "room:create" : "room:join", {
      roomId: trimmedRoomId,
      name: trimmedName,
    });
  }

  function startRound() {
    if (!joinedRoomId) return;
    socket.emit("round:start", { roomId: joinedRoomId });
    setMessage("Starting round...");
    setLastNote("");
  }

  function playSelectedCard() {
    if (!joinedRoomId || !selectedCard || !selectedCardDef) return;

    socket.emit("card:play", {
      roomId: joinedRoomId,
      instanceId: selectedCard.instanceId,
      targetPlayerId: targetNeeded ? targetPlayerId : undefined,
      guessedValue: guessNeeded ? Number(guessedValue) : undefined,
    });

    setMessage(`Played ${selectedCardDef.name}.`);
    setSelectedInstanceId(null);
  }

  const playDisabled =
    !isMyTurn ||
    !selectedCard ||
    (targetNeeded && !targetPlayerId) ||
    (guessNeeded && !guessedValue);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Love Letter</p>
          <h1>Courtly play, very little clutter.</h1>
          <p className="hero-copy">
            A simple room-based table for testing the classic game flow while we keep the interface intentionally calm.
          </p>
        </div>
        <div className="status-panel">
          <span className={`status-pill${isMyTurn ? " is-active" : ""}`}>
            {state ? (isMyTurn ? "Your turn" : "Waiting") : "Offline"}
          </span>
          <span className="status-pill">{joinedRoomId ? `Room ${joinedRoomId}` : "No room yet"}</span>
        </div>
      </header>

      <main className="layout">
        <section className="panel lobby-panel">
          <h2>Seat Yourself</h2>
          <label>
            Room ID
            <input value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="love-letter" />
          </label>
          <label>
            Name
            <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Annette admirer" />
          </label>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => joinRoom("create")}>
              Create room
            </button>
            <button type="button" className="secondary-button" onClick={() => joinRoom("join")}>
              Join room
            </button>
          </div>
          <p className="helper-text">{message}</p>
          {lastNote ? <p className="note-box">{lastNote}</p> : null}
        </section>

        <section className="panel board-panel">
          <div className="board-header">
            <div>
              <h2>Table</h2>
              <p className="muted">
                {state
                  ? `Phase: ${state.phase.replaceAll("_", " ")}`
                  : "Join a room to receive live state."}
              </p>
            </div>
            <div className="round-meta">
              <span>Deck {state?.round?.deckCount ?? 0}</span>
              <span>Turn {state?.round?.turnNumber ?? 0}</span>
            </div>
          </div>

          <div className="players-grid">
            {state?.players.map((player) => (
              <article key={player.id} className={`player-tile${player.id === state.selfPlayerId ? " is-self" : ""}`}>
                <div className="player-heading">
                  <div>
                    <strong>{player.name}</strong>
                    <p>
                      {player.status}
                      {player.protectedUntilNextTurn ? " • protected" : ""}
                    </p>
                  </div>
                  <span className="token-badge">{player.tokens} token{player.tokens === 1 ? "" : "s"}</span>
                </div>
                <p className="muted small-copy">Hand {player.handCount}</p>
                <div className="discard-row">
                  {player.discardPile.length === 0 ? <span className="empty-label">No discards yet</span> : null}
                  {player.discardPile.map((card) => (
                    <CardView key={card.instanceId} card={card} compact />
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="board-footer">
            <div>
              <h3>Removed cards</h3>
              <div className="discard-row">
                {state?.round?.visibleRemovedCards.length ? (
                  state.round.visibleRemovedCards.map((card) => <CardView key={card.instanceId} card={card} compact />)
                ) : (
                  <span className="empty-label">Only visible in 2-player rounds.</span>
                )}
              </div>
            </div>
            <div className="round-actions">
              <button
                type="button"
                className="primary-button"
                onClick={startRound}
                disabled={!state || state.players.length < 2 || state.phase === "in_round" || state.phase === "match_over"}
              >
                {state?.phase === "round_over" ? "Start next round" : "Start round"}
              </button>
              {state?.roundWinnerIds.length ? (
                <p className="helper-text">
                  Round winners: {state.roundWinnerIds.map((playerId) => playerNameById(state, playerId)).join(", ")}
                </p>
              ) : null}
              {state?.matchWinnerIds.length ? (
                <p className="note-box">
                  Match winner: {state.matchWinnerIds.map((playerId) => playerNameById(state, playerId)).join(", ")}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="panel hand-panel">
          <div className="board-header">
            <div>
              <h2>Your hand</h2>
              <p className="muted">{isMyTurn ? "Choose a card to play." : "Your hand stays visible to you only."}</p>
            </div>
          </div>

          <div className="hand-row">
            {self?.hand.map((card) => (
              <CardView
                key={card.instanceId}
                card={card}
                selectable={isMyTurn}
                selected={card.instanceId === selectedInstanceId}
                onClick={isMyTurn ? () => setSelectedInstanceId(card.instanceId) : undefined}
              />
            ))}
            {!self?.hand.length ? <span className="empty-label">No hand yet. Start a round.</span> : null}
          </div>

          <div className="action-panel">
            <div>
              <h3>Play selection</h3>
              <p className="muted">
                {selectedCardDef ? `${selectedCardDef.name} (${selectedCardDef.value})` : "Pick a card from your hand."}
              </p>
            </div>

            {targetNeeded ? (
              <label>
                Target
                <select value={targetPlayerId} onChange={(event) => setTargetPlayerId(event.target.value)}>
                  {targetablePlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {guessNeeded ? (
              <label>
                Guard guess
                <select value={guessedValue} onChange={(event) => setGuessedValue(event.target.value)}>
                  {[2, 3, 4, 5, 6, 7, 8].map((value) => (
                    <option key={value} value={value}>
                      {value} • {getCardDef(cardIdByValue(value)).name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <button type="button" className="primary-button" disabled={playDisabled} onClick={playSelectedCard}>
              Play card
            </button>
          </div>
        </section>

        <section className="panel log-panel">
          <h2>Recent table talk</h2>
          <div className="log-list">
            {(state ? state.log.slice(-8).reverse() : []).map((event, index) => (
              <div key={`${event.type}-${index}`} className="log-item">
                {state ? formatEvent(event, state) : ""}
              </div>
            ))}
            {!state?.log.length ? <span className="empty-label">No actions yet.</span> : null}
          </div>
        </section>
      </main>
    </div>
  );
}

function playerNameById(state: PlayerViewState, playerId: PlayerID): string {
  return state.players.find((player) => player.id === playerId)?.name ?? "Unknown player";
}

function cardIdByValue(value: number): CardID {
  const entry = Object.entries({
    1: "guard",
    2: "priest",
    3: "baron",
    4: "handmaid",
    5: "prince",
    6: "king",
    7: "countess",
    8: "princess",
  }) as Array<[string, CardID]>;

  return entry.find(([key]) => Number(key) === value)?.[1] ?? "guard";
}

function formatReason(reason: string): string {
  return reason.replaceAll("_", " ");
}

function formatNote(note: ActionNote): string {
  if (note.type === "peek") {
    return note.seenCard ? `You peeked and saw ${getCardDef(note.seenCard.cardId).name}.` : "You peeked but saw no card.";
  }

  const playerCard = note.playerCard ? getCardDef(note.playerCard.cardId).name : "nothing";
  const targetCard = note.targetCard ? getCardDef(note.targetCard.cardId).name : "nothing";
  return `Baron comparison: you had ${playerCard}, they had ${targetCard}.`;
}

function formatEvent(event: GameEvent, state: PlayerViewState): string {
  switch (event.type) {
    case "player_joined":
      return `${playerNameById(state, event.playerId)} joined the room.`;
    case "round_started":
      return "A new round started.";
    case "card_drawn":
      return `${playerNameById(state, event.playerId)} drew a card.`;
    case "card_played":
      return `${playerNameById(state, event.playerId)} played ${getCardDef(event.cardId).name}.`;
    case "card_guessed":
      return `${playerNameById(state, event.playerId)} guessed ${event.guessedValue} against ${playerNameById(state, event.targetPlayerId)}.`;
    case "card_compared":
      return `${playerNameById(state, event.playerId)} compared hands with ${playerNameById(state, event.targetPlayerId)}.`;
    case "card_swapped":
      return `${playerNameById(state, event.playerId)} swapped hands with ${playerNameById(state, event.targetPlayerId)}.`;
    case "player_protected":
      return `${playerNameById(state, event.playerId)} is protected until their next turn.`;
    case "player_eliminated":
      return `${playerNameById(state, event.playerId)} is out of the round.`;
    case "round_ended":
      return `Round ended. Winner: ${event.winnerIds.map((playerId) => playerNameById(state, playerId)).join(", ")}.`;
    case "token_awarded":
      return `${playerNameById(state, event.playerId)} now has ${event.tokens} token${event.tokens === 1 ? "" : "s"}.`;
    case "match_ended":
      return `Match ended. Winner: ${event.winnerIds.map((playerId) => playerNameById(state, playerId)).join(", ")}.`;
    default:
      return event.type.replaceAll("_", " ");
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
