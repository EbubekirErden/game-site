import React from "react";
import { Anchor, Check, ChevronLeft, ChevronRight, Clock3, Copy, Crown, Flag, Hand, Info, RefreshCcw, Rocket } from "lucide-react";

import type { SkullKingCard, SkullKingCardInstance, SkullKingCompletedTrick, SkullKingPlayerViewState, SkullKingTrickPlay, TigressPlayMode } from "@game-site/shared/games/skull-king/types";

import { RoomChat } from "../components/RoomChat.js";
import { SkullKingCardInfoPopup } from "../components/SkullKingCardInfoPopup.js";
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

function getLeadSuitFromPlays(plays: SkullKingTrickPlay[]): string | null {
  const firstNumber = plays.find((play) => play.card.card.type === "number");
  return firstNumber?.card.card.type === "number" ? firstNumber.card.card.suit : null;
}

function describeWinningReason(trick: Pick<SkullKingCompletedTrick, "plays" | "winnerPlayerId" | "winningPlayIndex">): string {
  if (trick.winnerPlayerId === null || trick.winningPlayIndex === null) {
    return trick.plays.some((play) => play.card.card.type === "kraken")
      ? "Kraken cancelled the trick, so nobody takes it."
      : "No card took this trick.";
  }

  const winningCard = trick.plays[trick.winningPlayIndex]?.card.card;
  if (!winningCard) return "This card is currently winning.";

  if (trick.plays.some((play) => play.card.card.type === "white_whale")) {
    const leadSuit = getLeadSuitFromPlays(trick.plays);
    return leadSuit
      ? `White Whale made the highest ${leadSuit} card win.`
      : "White Whale won because no numbered suit was led.";
  }

  if (winningCard.type === "mermaid" && trick.plays.some((play) => play.card.card.type === "skull_king")) {
    return "Mermaid wins because it beats Skull King.";
  }

  if (winningCard.type === "skull_king") {
    return "Skull King beats Pirates and all numbered cards.";
  }

  if (winningCard.type === "pirate" || (winningCard.type === "tigress" && winningCard.mode === "pirate")) {
    return "Pirate beats Mermaid and numbered cards.";
  }

  if (winningCard.type === "mermaid") {
    return "Mermaid beats numbered cards when no Pirate or Skull King takes it.";
  }

  if (winningCard.type === "number" && winningCard.suit === "black") {
    return "Black is trump, so the highest black card wins.";
  }

  if (winningCard.type === "number") {
    return `Highest ${winningCard.suit} card wins because that suit was led.`;
  }

  return `${describeCard(winningCard)} is currently winning.`;
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
  const [infoCard, setInfoCard] = React.useState<SkullKingCard | null>(null);
  const [lastResolvedTrick, setLastResolvedTrick] = React.useState<SkullKingCompletedTrick | null>(null);
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
  const completedTricks = state.round?.completedTricks ?? [];
  const latestCompletedTrick = completedTricks.at(-1) ?? (state.phase === "round_over" || state.phase === "match_over" ? lastResolvedTrick : null);
  const currentTrickPlays = state.round?.currentTrick.plays ?? [];
  const displayTrick = currentTrickPlays.length > 0
    ? {
        kind: "current" as const,
        trickNumber: state.round?.currentTrick.trickNumber ?? 1,
        plays: currentTrickPlays,
        winnerPlayerId: state.round?.currentTrick.winningPlayIndex === null || state.round?.currentTrick.winningPlayIndex === undefined
          ? null
          : currentTrickPlays[state.round.currentTrick.winningPlayIndex]?.playerId ?? null,
        winningPlayIndex: state.round?.currentTrick.winningPlayIndex ?? null,
      }
    : latestCompletedTrick
      ? { kind: "resolved" as const, ...latestCompletedTrick }
      : null;
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

  React.useEffect(() => {
    const nextResolvedTrick = completedTricks.at(-1) ?? null;
    if (nextResolvedTrick) {
      setLastResolvedTrick(nextResolvedTrick);
      return;
    }

    if (state.phase === "lobby" || state.phase === "bidding") {
      setLastResolvedTrick(null);
    }
  }, [completedTricks, state.phase]);

  const isDisplayedWinningCard = (instanceId: string) => {
    if (!displayTrick || displayTrick.winningPlayIndex === null || displayTrick.winningPlayIndex === undefined) return false;
    return displayTrick.plays[displayTrick.winningPlayIndex]?.card.instanceId === instanceId;
  };

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
              <div key={player.id} className={`skull-player-row ${player.id === state.selfPlayerId ? "is-self" : ""} ${state.round?.currentPlayerId === player.id ? "is-current" : ""}`}>
                <div className="skull-player-row-main">
                  <strong>
                    {index + 1}. {player.name} {player.id === state.creatorId ? <Crown size={13} strokeWidth={2.2} aria-hidden="true" /> : null}
                  </strong>
                  <span className="muted-text">
                    Bid {player.bid ?? "-"} | Tricks {player.tricksWon} | Score {player.totalScore}
                    {state.round?.leadPlayerId === player.id ? " | Lead" : ""}
                    {state.round?.currentPlayerId === player.id ? " | Turn" : ""}
                  </span>
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
                <h3>{displayTrick?.kind === "resolved" ? `Trick ${displayTrick.trickNumber} Result` : "Current Trick"}</h3>
                {displayTrick?.kind === "resolved" ? (
                  <span className="mini-pill is-hot">
                    {displayTrick.winnerPlayerId ? `${state.players.find((player) => player.id === displayTrick.winnerPlayerId)?.name ?? "Winner"} took it` : "No winner"}
                  </span>
                ) : state.round?.currentPlayerId ? (
                  <span className="mini-pill is-hot">Waiting on {state.players.find((player) => player.id === state.round?.currentPlayerId)?.name ?? "player"}</span>
                ) : null}
              </div>
              <div className="skull-trick-table">
                {displayTrick?.plays.length ? (
                  displayTrick.plays.map((play) => (
                    <article key={play.card.instanceId} className={`skull-trick-card ${isDisplayedWinningCard(play.card.instanceId) ? "is-winning" : ""}`}>
                      {isDisplayedWinningCard(play.card.instanceId) ? (
                        <div className="skull-winning-badge">
                          <Flag size={14} strokeWidth={2.2} aria-hidden="true" />
                        </div>
                      ) : null}
                      <SkullKingCardView card={play.card.card} compact />
                      <button type="button" className="skull-card-info-button" aria-label={`Show ${describeCard(play.card.card)} details`} onClick={() => setInfoCard(play.card.card)}>
                        <Info size={13} strokeWidth={2.3} aria-hidden="true" />
                      </button>
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
              {displayTrick ? <p className="skull-trick-reason">{describeWinningReason(displayTrick)}</p> : null}
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
                    <div className="skull-bid-grid" role="group" aria-label="Choose your bid">
                      {Array.from({ length: (state.round?.roundNumber ?? 1) + 1 }, (_, bidValue) => (
                        <button
                          key={bidValue}
                          type="button"
                          className={`skull-bid-option ${selectedBid === bidValue ? "is-selected" : ""}`}
                          onClick={() => setSelectedBid(bidValue)}
                          disabled={!isMyTurn}
                          aria-pressed={selectedBid === bidValue}
                        >
                          {bidValue}
                        </button>
                      ))}
                    </div>
                    <div className="skull-bid-row">
                      <button type="button" className="primary-button" disabled={!isMyTurn} onClick={() => void onSubmitBid(selectedBid)}>
                        Submit Bid
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="skull-hand-list">
                {(self?.hand ?? []).map((card) => (
                  <article
                    key={card.instanceId}
                    className={`skull-hand-card ${selectedCardId === card.instanceId ? "is-selected" : ""}`}
                  >
                    <button
                      type="button"
                      className="skull-card-select-button"
                      onClick={() => setSelectedCardId((current) => (current === card.instanceId ? null : card.instanceId))}
                      disabled={!playing || !isMyTurn}
                      aria-label={`Select ${describeCard(card.card)}`}
                    >
                      <SkullKingCardView card={card.card} compact />
                    </button>
                    <button type="button" className="skull-card-info-button" aria-label={`Show ${describeCard(card.card)} details`} onClick={() => setInfoCard(card.card)}>
                      <Info size={13} strokeWidth={2.3} aria-hidden="true" />
                    </button>
                  </article>
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
          {completedTricks.length > 0 ? (
            <section className="game-panel activity-panel skull-summary-panel">
              <div className="panel-header-inline">
                <h3>Last Tricks</h3>
                <RefreshCcw size={15} strokeWidth={2.2} aria-hidden="true" />
              </div>
              <div className="skull-trick-history">
                {completedTricks.slice(-4).reverse().map((trick) => (
                  <div key={trick.trickNumber} className="skull-history-row">
                    <span>Trick {trick.trickNumber}</span>
                    <strong>{trick.winnerPlayerId ? state.players.find((player) => player.id === trick.winnerPlayerId)?.name ?? trick.winnerPlayerId : "No winner"}</strong>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

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
      {infoCard ? <SkullKingCardInfoPopup card={infoCard} onClose={() => setInfoCard(null)} /> : null}
    </main>
  );
}
