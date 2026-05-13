import React from "react";
import { Anchor, Bot, Check, ChevronLeft, ChevronRight, Clock3, Copy, Crown, Flag, Hand, Info, RefreshCcw, Rocket, UserPlus } from "lucide-react";

import { canPlayCard } from "@game-site/shared/games/skull-king/rules";
import type { SkullKingBotStrategy, SkullKingCardInstance, SkullKingPlayerViewState, TigressPlayMode } from "@game-site/shared/games/skull-king/types";

import { RoomChat } from "../components/RoomChat.js";
import { SkullKingCardView } from "../components/SkullKingCardView.js";
import { SkullKingInfoDrawer } from "../components/SkullKingInfoDrawer.js";
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
  onTimeoutPlay: () => Promise<boolean>;
  onAddBot: (strategy: SkullKingBotStrategy) => Promise<boolean>;
  onUpdateSettings: (settings: { turnDurationSeconds?: number; orderMode?: "fixed" | "reverse_each_round" | "rotate_each_round" }) => Promise<boolean>;
};

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
  onTimeoutPlay,
  onAddBot,
  onUpdateSettings,
}: SkullKingRoomPageProps) {
  const [selectedBid, setSelectedBid] = React.useState(1);
  const [selectedCardId, setSelectedCardId] = React.useState<string | null>(null);
  const [tigressMode, setTigressMode] = React.useState<TigressPlayMode>("escape");
  const [secondsLeft, setSecondsLeft] = React.useState(state.settings.turnDurationSeconds);
  const [draggingCardId, setDraggingCardId] = React.useState<string | null>(null);
  const [isTrickDropActive, setIsTrickDropActive] = React.useState(false);
  const draggingCardIdRef = React.useRef<string | null>(null);

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
  const canAddBot = isCreator && state.phase === "lobby" && state.players.length < 6;
  const hasSubmittedBid = self?.bid !== null && self?.bid !== undefined;
  const canSubmitBid = bidding && Boolean(self) && !hasSubmittedBid && secondsLeft > 0;
  const isResolvingTrick = Boolean(
    state.phase === "playing" &&
      state.round &&
      state.round.currentPlayerId === null &&
      state.round.currentTrick.plays.length === state.round.playerOrder.length,
  );
  const winningPlay = state.round?.currentTrick.winningPlayIndex !== null && state.round?.currentTrick.winningPlayIndex !== undefined
    ? state.round.currentTrick.plays[state.round.currentTrick.winningPlayIndex]
    : null;
  const winningPlayerName = winningPlay ? state.players.find((player) => player.id === winningPlay.playerId)?.name ?? winningPlay.playerId : null;
  const visibleMessage = message && message !== "Game in progress." ? message : "";
  const handleCopyCode = () => {
    navigator.clipboard.writeText(state.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const getCardIsPlayable = (card: SkullKingCardInstance): boolean => {
    if (!self || !state.round || !playing || !isMyTurn || isResolvingTrick) return false;
    return canPlayCard(self.hand, state.round.currentTrick.plays, card);
  };
  const getDraggedCard = () => self?.hand.find((card) => card.instanceId === draggingCardIdRef.current) ?? null;
  const playDraggedCard = (instanceId: string | null) => {
    const card = self?.hand.find((candidate) => candidate.instanceId === instanceId) ?? null;
    if (!card || !getCardIsPlayable(card)) return;

    draggingCardIdRef.current = null;
    setDraggingCardId(null);
    setIsTrickDropActive(false);
    void onPlayCard(card.instanceId, card.card.type === "tigress" ? tigressMode : undefined);
  };
  const handleCardDragStart = (event: React.DragEvent<HTMLButtonElement>, card: SkullKingCardInstance) => {
    if (!getCardIsPlayable(card)) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.instanceId);
    draggingCardIdRef.current = card.instanceId;
    setDraggingCardId(card.instanceId);
  };
  const handleTrickDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    const card = getDraggedCard();
    if (!card || !getCardIsPlayable(card)) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setIsTrickDropActive(true);
  };
  const handleTrickDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    playDraggedCard(event.dataTransfer.getData("text/plain") || draggingCardId);
  };

  React.useEffect(() => {
    if (!state.round) {
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
  }, [state.round, state.round?.currentPlayerId, state.round?.turnStartedAt, state.settings.turnDurationSeconds]);

  React.useEffect(() => {
    setSelectedCardId(null);
    draggingCardIdRef.current = null;
    setDraggingCardId(null);
    setIsTrickDropActive(false);
  }, [state.round?.currentTrick.trickNumber, state.phase]);

  React.useEffect(() => {
    if (!isMyTurn || secondsLeft > 0 || !state.round?.currentPlayerId || state.phase !== "playing") return;

    const actionKey = `${state.phase}:${state.round.currentTrick.trickNumber}:${state.round.currentPlayerId}`;
    if (autoActionSentRef.current === actionKey) return;
    autoActionSentRef.current = actionKey;

    void onTimeoutPlay();
  }, [isMyTurn, onTimeoutPlay, secondsLeft, state.phase, state.round?.currentPlayerId, state.round?.currentTrick.trickNumber]);

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
            {state.round?.leadPlayerId ? <span className="mini-pill"><Anchor size={12} /> {state.players.find((player) => player.id === state.round?.leadPlayerId)?.name ?? "?"}</span> : null}
          </div>
          <div className="skull-player-list">
            {state.players.map((player, index) => (
              <div key={player.id} className={`skull-player-row ${player.id === state.selfPlayerId ? "is-self" : ""} ${state.round?.currentPlayerId === player.id ? "is-current" : ""} ${isResolvingTrick && winningPlay?.playerId === player.id ? "is-trick-winner" : ""}`}>
                <div className="skull-player-row-main">
                  <strong>
                    {index + 1}. {player.name} {player.id === state.creatorId ? <Crown size={13} strokeWidth={2.2} aria-hidden="true" /> : null}
                    {player.isBot ? <Bot size={13} strokeWidth={2.2} aria-hidden="true" /> : null}
                  </strong>
                  <span className="skull-player-row-stats">
                    <span>{bidding && player.id !== state.selfPlayerId ? "Bid hidden" : `Bid ${player.bid ?? "-"}`}</span>
                    <span>Tricks {player.tricksWon}</span>
                  </span>
                </div>
                <strong className="skull-player-score">{player.totalScore}</strong>
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

        {state.phase === "lobby" && isCreator ? (
          <section className="game-panel slim-panel skull-bot-panel">
            <div className="panel-header-inline">
              <h3>Bots</h3>
              <span className="mini-pill">
                <Bot size={12} strokeWidth={2.2} aria-hidden="true" />
                {state.players.filter((player) => player.isBot).length}
              </span>
            </div>
            {[
              ["random", "Random Bot"],
              ["safe", "Garantici Bot"],
              ["aggressive", "Agresif Bot"],
              ["genius", "Zeki Bot"],
            ].map(([strategy, label]) => (
              <button
                key={strategy}
                type="button"
                className="secondary-button full-width"
                onClick={() => void onAddBot(strategy as SkullKingBotStrategy)}
                disabled={!canAddBot}
              >
                <span className="button-content">
                  <UserPlus size={16} strokeWidth={2.2} aria-hidden="true" />
                  Add {label}
                </span>
              </button>
            ))}
            <p className="muted-text skull-bot-note">{state.players.length >= 6 ? "Skull King supports up to 6 players here." : "Bots act from their own player view."}</p>
          </section>
        ) : null}
        </aside>

        <section className="table-center">
        {showRoundTable ? (
          <section className="skull-center-stack">
            <section className="game-panel skull-center-panel">
              <div className="panel-header-inline">
                <h3>Current Trick</h3>
                {bidding ? (
                  <span className="mini-pill is-hot">Waiting for bids</span>
                ) : isResolvingTrick ? (
                  <span className="mini-pill is-hot">{winningPlayerName ? `${winningPlayerName} takes it` : "No winner"}</span>
                ) : state.round?.currentPlayerId ? (
                  <span className="mini-pill is-hot">Waiting on {state.players.find((player) => player.id === state.round?.currentPlayerId)?.name ?? "player"}</span>
                ) : null}
              </div>
              <div
                className={`skull-trick-table ${isResolvingTrick ? "is-resolving" : ""} ${isTrickDropActive ? "is-drop-active" : ""} ${draggingCardId ? "is-drop-ready" : ""}`}
                onDragOver={handleTrickDragOver}
                onDragEnter={handleTrickDragOver}
                onDragLeave={() => setIsTrickDropActive(false)}
                onDrop={handleTrickDrop}
              >
                {state.round?.currentTrick.plays.length ? (
                  state.round.currentTrick.plays.map((play, index) => (
                    <article
                      key={play.card.instanceId}
                      className={`skull-trick-card ${isWinningCard(state, play.card.instanceId) ? "is-winning" : ""}`}
                      style={{ "--play-index": index } as React.CSSProperties}
                    >
                      {isWinningCard(state, play.card.instanceId) ? (
                        <div className="skull-winning-badge">
                          <Flag size={14} strokeWidth={2.2} aria-hidden="true" />
                        </div>
                      ) : null}
                      <SkullKingCardView card={play.card.card} compact />
                      <span className="skull-trick-player">{state.players.find((player) => player.id === play.playerId)?.name ?? play.playerId}</span>
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

            <section className={`game-panel skull-hand-panel ${playing && isMyTurn ? "is-my-turn" : ""}`}>
              <div className="panel-header-inline">
                <h3>Your Hand</h3>
                {playing && isMyTurn ? <span className="mini-pill is-hot skull-turn-pill">Your Turn</span> : null}
              </div>

              <div className="skull-hand-list">
                {(self?.hand ?? []).map((card) => {
                  const playable = getCardIsPlayable(card);
                  const blockedByRule = playing && isMyTurn && !isResolvingTrick && !playable;
                  return (
                    <button
                      key={card.instanceId}
                      type="button"
                      className={`skull-hand-card ${selectedCardId === card.instanceId ? "is-selected" : ""} ${blockedByRule ? "is-unplayable" : ""} ${draggingCardId === card.instanceId ? "is-dragging" : ""}`}
                      onClick={() => {
                        if (!playable) return;
                        setSelectedCardId((current) => (current === card.instanceId ? null : card.instanceId));
                      }}
                      disabled={playing ? !playable : true}
                      draggable={playable}
                      onDragStart={(event) => handleCardDragStart(event, card)}
                      onDragEnd={() => {
                        draggingCardIdRef.current = null;
                        setDraggingCardId(null);
                        setIsTrickDropActive(false);
                      }}
                      title={blockedByRule ? "You must follow the lead suit." : undefined}
                    >
                      <SkullKingCardView card={card.card} compact />
                    </button>
                  );
                })}
              </div>

              {bidding && self ? (
                <div className="skull-bid-panel">
                  <div className="panel-header-inline">
                    <h3>Your Bid</h3>
                    <span className={`mini-pill ${canSubmitBid ? "is-hot" : ""}`}>{hasSubmittedBid ? `Locked: ${self.bid}` : "Choose now"}</span>
                  </div>
                  <div className="skull-bid-controls">
                    <div className="skull-bid-grid" role="group" aria-label="Choose your bid">
                      {Array.from({ length: (state.round?.roundNumber ?? 1) + 1 }, (_, bidValue) => (
                        <button
                          key={bidValue}
                          type="button"
                          className={`skull-bid-option ${selectedBid === bidValue ? "is-selected" : ""}`}
                          onClick={() => setSelectedBid(bidValue)}
                          disabled={!canSubmitBid}
                          aria-pressed={selectedBid === bidValue}
                        >
                          {bidValue}
                        </button>
                      ))}
                    </div>
                    <div className="skull-bid-row">
                      <button type="button" className="primary-button" disabled={!canSubmitBid} onClick={() => void onSubmitBid(selectedBid)}>
                        {hasSubmittedBid ? "Bid Submitted" : "Submit Bid"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

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

              {playing && isMyTurn ? (
                <p className="skull-drag-hint">Drag a playable card to the table.</p>
              ) : null}

              {visibleMessage ? <p className="helper-text error-text">{visibleMessage}</p> : null}
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
      <SkullKingInfoDrawer
        buttonClassName="info-trigger-button room-floating-info-button"
        buttonLabel={
          <>
            <Info size={18} strokeWidth={2.3} aria-hidden="true" />
            <span className="room-floating-info-label">Guide</span>
          </>
        }
        buttonTitle="Open Skull King rules and card guide"
      />
    </main>
  );
}
