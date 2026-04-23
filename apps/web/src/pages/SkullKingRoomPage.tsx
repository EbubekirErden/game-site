import React from "react";
import { Anchor, Check, ChevronLeft, ChevronRight, Clock3, Copy, Crown, Flag, Hand, RefreshCcw, Rocket } from "lucide-react";

import type { SkullKingCardInstance, SkullKingPlayerViewState, TigressPlayMode } from "@game-site/shared/games/skull-king/types";

import { RoomChat } from "../components/RoomChat.js";
import type { RoomChatMessage } from "../app/App.js";

type SkullKingRoomPageProps = {
  state: SkullKingPlayerViewState;
  message: string;
  chatMessages: RoomChatMessage[];
  onSendChatMessage: (text: string) => Promise<boolean>;
  onLeaveRoom: () => void;
  onToggleReady: (isReady: boolean) => void;
  onStartRound: () => void;
  onReturnToLobby: () => void;
  onSubmitBid: (bid: number) => Promise<boolean>;
  onPlayCard: (instanceId: string, tigressMode?: TigressPlayMode) => Promise<boolean>;
  onTimeoutBid: () => Promise<boolean>;
  onTimeoutPlay: () => Promise<boolean>;
  onUpdateSettings: (settings: { turnDurationSeconds?: number; orderMode?: "fixed" | "reverse_each_round" | "rotate_each_round" }) => Promise<boolean>;
};

function describeCard(card: SkullKingCardInstance["card"]): string {
  if (card.type === "number") return `${card.rank}`;
  if (card.type === "white_whale") return "White Whale";
  if (card.type === "skull_king") return "Skull King";
  if (card.type === "tigress") return card.mode ? `Tigress (${card.mode})` : "Tigress";
  return card.type.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function cardSuitLabel(card: SkullKingCardInstance["card"]): string {
  if (card.type !== "number") return card.type === "tigress" && card.mode === "pirate" ? "Pirate" : "Special";
  return card.suit;
}

function isWinningCard(state: SkullKingPlayerViewState, instanceId: string): boolean {
  const winningIndex = state.round?.currentTrick.winningPlayIndex;
  if (winningIndex === null || winningIndex === undefined || winningIndex < 0) return false;
  return state.round?.currentTrick.plays[winningIndex]?.card.instanceId === instanceId;
}

export function SkullKingRoomPage({
  state,
  message,
  chatMessages,
  onSendChatMessage,
  onLeaveRoom,
  onToggleReady,
  onStartRound,
  onReturnToLobby,
  onSubmitBid,
  onPlayCard,
  onTimeoutBid,
  onTimeoutPlay,
  onUpdateSettings,
}: SkullKingRoomPageProps) {
  const [selectedBid, setSelectedBid] = React.useState(1);
  const [selectedCardId, setSelectedCardId] = React.useState<string | null>(null);
  const [tigressMode, setTigressMode] = React.useState<TigressPlayMode>("escape");
  const [secondsLeft, setSecondsLeft] = React.useState(state.settings.turnDurationSeconds);

  const self = state.players.find((player) => player.id === state.selfPlayerId) ?? null;
  const isCreator = state.creatorId === state.selfPlayerId;
  const isMyTurn = state.round?.currentPlayerId === state.selfPlayerId;
  const selectedCard = self?.hand.find((card) => card.instanceId === selectedCardId) ?? null;
  const bidding = state.phase === "bidding";
  const playing = state.phase === "playing";
  const showRoundTable = bidding || playing || state.phase === "round_over" || state.phase === "match_over";
  const roundNumber = state.round?.roundNumber ?? state.completedRoundCount;
  const autoActionSentRef = React.useRef<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const readyCount = state.players.filter((player) => player.isReady).length;
  const canStartRound = state.players.length >= 2 && state.players.every((player) => player.isReady);
  const handleCopyCode = () => {
    navigator.clipboard.writeText(state.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  React.useEffect(() => {
    if (!state.round?.currentPlayerId) {
      setSecondsLeft(state.settings.turnDurationSeconds);
      return;
    }

    const update = () => {
      const startedAt = state.round?.turnStartedAt ?? Date.now();
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSecondsLeft(Math.max(0, state.settings.turnDurationSeconds - elapsed));
    };

    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [state.round?.currentPlayerId, state.round?.turnStartedAt, state.settings.turnDurationSeconds]);

  React.useEffect(() => {
    setSelectedCardId(null);
  }, [state.round?.currentTrick.trickNumber, state.phase]);

  React.useEffect(() => {
    if (!isMyTurn || secondsLeft > 0 || !state.round?.currentPlayerId) return;

    const actionKey = `${state.phase}:${state.round.currentTrick.trickNumber}:${state.round.currentPlayerId}`;
    if (autoActionSentRef.current === actionKey) return;
    autoActionSentRef.current = actionKey;

    if (state.phase === "bidding") {
      void onTimeoutBid();
      return;
    }

    if (state.phase === "playing") {
      void onTimeoutPlay();
    }
  }, [isMyTurn, onTimeoutBid, onTimeoutPlay, secondsLeft, state.phase, state.round?.currentPlayerId, state.round?.currentTrick.trickNumber]);

  React.useEffect(() => {
    autoActionSentRef.current = null;
  }, [state.round?.currentPlayerId, state.round?.turnStartedAt, state.phase]);

  return (
    <main className="table-layout skull-layout">
      <header className="table-topbar">
        <div className="topbar-info">
          <h1>Skull King</h1>
          <span className="phase-badge">Round {roundNumber}</span>
          {state.round ? <span className="phase-badge">Trick {state.round.currentTrick.trickNumber}</span> : null}
          <button
            type="button"
            className="room-code-badge room-code-button copyable"
            onClick={handleCopyCode}
            title={copied ? "Room code copied" : "Copy room code"}
          >
            <span>Room: {state.roomId}</span>
            {copied ? <Check size={15} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={15} strokeWidth={2.1} aria-hidden="true" />}
          </button>
        </div>
        <div className="topbar-actions">
          {showRoundTable ? (
            <div className="skull-timer-shell">
              <Clock3 size={16} strokeWidth={2.2} aria-hidden="true" />
              <span>{secondsLeft}s</span>
              <div className="skull-timer-bar">
                <div
                  className={`skull-timer-fill ${secondsLeft <= 5 ? "is-danger" : ""}`}
                  style={{ width: `${Math.max(0, Math.min(100, (secondsLeft / state.settings.turnDurationSeconds) * 100))}%` }}
                />
              </div>
            </div>
          ) : null}
          <button type="button" className="danger-button topbar-leave-button" onClick={onLeaveRoom}>
            Leave
          </button>
        </div>
      </header>

      <div className="table-workspace skull-workspace">
        <aside className="table-sidebar table-left-sidebar">
        <section className="game-panel slim-panel skull-order-panel">
          <div className="panel-header-inline">
            <h3>Order & Score</h3>
            {state.round?.leadPlayerId ? <span className="mini-pill"><Anchor size={12} /> Lead: {state.players.find((player) => player.id === state.round?.leadPlayerId)?.name ?? "?"}</span> : null}
          </div>
          <div className="skull-player-list">
            {state.players.map((player, index) => (
              <div key={player.id} className={`skull-player-row ${player.id === state.selfPlayerId ? "is-self" : ""} ${state.round?.currentPlayerId === player.id ? "is-current" : ""}`}>
                <div className="skull-player-row-main">
                  <strong>
                    {index + 1}. {player.name} {player.id === state.creatorId ? <Crown size={13} strokeWidth={2.2} aria-hidden="true" /> : null}
                  </strong>
                  <span className="muted-text">Bid {player.bid ?? "-"} | Tricks {player.tricksWon} | Score {player.totalScore}</span>
                </div>
                <div className="skull-player-row-badges">
                  {state.round?.leadPlayerId === player.id ? <span className="mini-pill">Lead</span> : null}
                  {state.round?.currentPlayerId === player.id ? <span className="mini-pill is-hot">Turn</span> : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        {(state.phase === "lobby" || state.phase === "round_over") && self ? (
          <section className="game-panel slim-panel">
            <h3>Your Status</h3>
            <div className="skull-lobby-actions">
              <button type="button" className={`primary-button full-width ${self.isReady ? "is-ready-btn" : ""}`} onClick={() => onToggleReady(!self.isReady)}>
                {self.isReady ? "Ready" : "Ready Up"}
              </button>
              {isCreator ? (
                <button type="button" className={`full-width mt-2 ${canStartRound ? "ready-start-btn" : "secondary-button"}`} onClick={onStartRound} disabled={!canStartRound}>
                  {canStartRound ? (
                    <span className="button-content">
                      <Rocket size={16} strokeWidth={2.2} aria-hidden="true" />
                      Start Round
                    </span>
                  ) : (
                    `Need 2+ ready players (${readyCount}/${state.players.length})`
                  )}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
        {state.phase === "match_over" && isCreator ? (
          <section className="game-panel slim-panel">
            <div className="skull-lobby-actions">
              <button type="button" className="primary-button full-width" onClick={onReturnToLobby}>
                Reset Match
              </button>
            </div>
          </section>
        ) : null}

        {state.phase === "lobby" && isCreator ? (
          <section className="game-panel slim-panel">
            <h3>Room Mode</h3>
            <div className="skull-settings">
              <div className="skull-settings-section">
                <div className="panel-header-inline">
                  <h4>Turn Timer</h4>
                </div>
                <div className="skull-timer-stepper">
                  <button
                    type="button"
                    className="icon-step-button"
                    onClick={() => void onUpdateSettings({ turnDurationSeconds: Math.max(5, state.settings.turnDurationSeconds - 5) })}
                    disabled={state.settings.turnDurationSeconds <= 5}
                    aria-label="Decrease turn timer"
                  >
                    <ChevronLeft size={18} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                  <div className="skull-timer-card">
                    <Clock3 size={18} strokeWidth={2.2} aria-hidden="true" />
                    <strong>{state.settings.turnDurationSeconds}s</strong>
                  </div>
                  <button
                    type="button"
                    className="icon-step-button"
                    onClick={() => void onUpdateSettings({ turnDurationSeconds: Math.min(60, state.settings.turnDurationSeconds + 5) })}
                    disabled={state.settings.turnDurationSeconds >= 60}
                    aria-label="Increase turn timer"
                  >
                    <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="skull-settings-section">
                <div className="panel-header-inline">
                  <h4>Game Modes</h4>
                </div>
                <div className="skull-mode-cards">
                  <button type="button" className={`skull-mode-card ${state.settings.orderMode === "fixed" ? "is-selected" : ""}`} onClick={() => void onUpdateSettings({ orderMode: "fixed" })}>
                    <strong>Fixed</strong>
                    <span>Keep the same player order every round.</span>
                  </button>
                  <button type="button" className={`skull-mode-card ${state.settings.orderMode === "reverse_each_round" ? "is-selected" : ""}`} onClick={() => void onUpdateSettings({ orderMode: "reverse_each_round" })}>
                    <strong>Reverse</strong>
                    <span>Flip the full order on each new round.</span>
                  </button>
                  <button type="button" className={`skull-mode-card ${state.settings.orderMode === "rotate_each_round" ? "is-selected" : ""}`} onClick={() => void onUpdateSettings({ orderMode: "rotate_each_round" })}>
                    <strong>Rotate</strong>
                    <span>Move the first player to the end each round.</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}
        </aside>

        <section className="table-center">
        {showRoundTable ? (
          <section className="skull-center-stack">
            <section className="game-panel skull-center-panel">
              <div className="panel-header-inline">
                <h3>Current Trick</h3>
                {state.round?.currentPlayerId ? <span className="mini-pill is-hot">Waiting on {state.players.find((player) => player.id === state.round?.currentPlayerId)?.name ?? "player"}</span> : null}
              </div>
              <div className="skull-trick-table">
                {state.round?.currentTrick.plays.length ? (
                  state.round.currentTrick.plays.map((play) => (
                    <article key={play.card.instanceId} className={`skull-trick-card ${isWinningCard(state, play.card.instanceId) ? "is-winning" : ""}`}>
                      {isWinningCard(state, play.card.instanceId) ? (
                        <div className="skull-winning-badge">
                          <Flag size={14} strokeWidth={2.2} aria-hidden="true" />
                        </div>
                      ) : null}
                      <span className="skull-trick-player">{state.players.find((player) => player.id === play.playerId)?.name ?? play.playerId}</span>
                      <strong>{describeCard(play.card.card)}</strong>
                      <span>{cardSuitLabel(play.card.card)}</span>
                    </article>
                  ))
                ) : (
                  <div className="skull-empty-trick">
                    <Hand size={20} strokeWidth={2.2} aria-hidden="true" />
                    <p>No cards on the table yet.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="game-panel skull-hand-panel">
              <div className="panel-header-inline">
                <h3>Your Hand</h3>
                {playing && isMyTurn ? <span className="mini-pill is-hot">Play Now</span> : null}
              </div>

              {bidding && self ? (
                <div className="skull-bid-panel">
                  <div className="panel-header-inline">
                    <h3>Your Bid</h3>
                    {isMyTurn ? <span className="mini-pill is-hot">Your Turn</span> : null}
                  </div>
                  <div className="skull-bid-controls">
                    <input
                      type="range"
                      min={0}
                      max={state.round?.roundNumber ?? 1}
                      step={1}
                      value={selectedBid}
                      onChange={(event) => setSelectedBid(Number(event.target.value))}
                      disabled={!isMyTurn}
                    />
                    <div className="skull-bid-row">
                      <strong>{selectedBid}</strong>
                      <button type="button" className="primary-button" disabled={!isMyTurn} onClick={() => void onSubmitBid(selectedBid)}>
                        Submit Bid
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="skull-hand-list">
                {(self?.hand ?? []).map((card) => (
                  <button
                    key={card.instanceId}
                    type="button"
                    className={`skull-hand-card ${selectedCardId === card.instanceId ? "is-selected" : ""}`}
                    onClick={() => setSelectedCardId((current) => (current === card.instanceId ? null : card.instanceId))}
                    disabled={!playing || !isMyTurn}
                  >
                    <strong>{describeCard(card.card)}</strong>
                    <span>{cardSuitLabel(card.card)}</span>
                    {card.card.type === "number" ? <span className="mini-pill">{card.card.rank}</span> : null}
                  </button>
                ))}
              </div>

              {selectedCard?.card.type === "tigress" ? (
                <div className="skull-tigress-row">
                  <button type="button" className={`mode-pill ${tigressMode === "escape" ? "is-selected" : ""}`} onClick={() => setTigressMode("escape")}>
                    Escape
                  </button>
                  <button type="button" className={`mode-pill ${tigressMode === "pirate" ? "is-selected" : ""}`} onClick={() => setTigressMode("pirate")}>
                    Pirate
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                className="primary-button"
                disabled={!selectedCardId || !playing || !isMyTurn}
                onClick={() => selectedCardId && void onPlayCard(selectedCardId, selectedCard?.card.type === "tigress" ? tigressMode : undefined)}
              >
                Play Selected Card
              </button>

              {message ? <p className="helper-text error-text">{message}</p> : null}
            </section>
          </section>
        ) : (
          <div className="game-panel center-lobby skull-lobby-placeholder">
            <h2>Waiting for players...</h2>
            <p>At least 2 people are needed, and every player must be ready before the host can start the round.</p>
            <div className="skull-lobby-stats-grid">
              <div className="skull-lobby-stat-card">
                <strong>{state.players.length}</strong>
                <span>Players</span>
              </div>
              <div className="skull-lobby-stat-card">
                <strong>{readyCount}</strong>
                <span>Ready</span>
              </div>
            </div>
            <p className="error-text">{message}</p>
          </div>
        )}
        </section>

        <aside className="table-sidebar table-right-sidebar skull-side-stack">
          <section className="game-panel activity-panel skull-summary-panel">
            <div className="panel-header-inline">
              <h3>Last Tricks</h3>
              <RefreshCcw size={15} strokeWidth={2.2} aria-hidden="true" />
            </div>
            <div className="skull-trick-history">
              {(state.round?.completedTricks ?? []).slice(-4).reverse().map((trick) => (
                <div key={trick.trickNumber} className="skull-history-row">
                  <span>Trick {trick.trickNumber}</span>
                  <strong>{trick.winnerPlayerId ? state.players.find((player) => player.id === trick.winnerPlayerId)?.name ?? trick.winnerPlayerId : "No winner"}</strong>
                </div>
              ))}
              {!(state.round?.completedTricks.length) ? <p className="muted-text">No completed tricks yet.</p> : null}
            </div>
          </section>

          <RoomChat messages={chatMessages} state={state} onSendMessage={onSendChatMessage} />
        </aside>
      </div>
    </main>
  );
}
