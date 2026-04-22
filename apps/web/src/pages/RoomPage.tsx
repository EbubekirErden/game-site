import React from "react";

import { getCardDef } from "@game-site/shared";
import type { CardInstance, PlayerID, PlayerViewState } from "@game-site/shared";

import { ActivityFeed } from "../components/ActivityFeed.js";
import { CardView } from "../components/CardView.js";
import { cardIdByValue, playerNameById } from "../lib/gamePresentation.js";

type RoomPageProps = {
  state: PlayerViewState;
  gameTitle: string;
  message: string;
  lastNote: string;
  selectedInstanceId: string | null;
  targetPlayerId: string;
  guessedValue: string;
  onSelectCard: (instanceId: string | null) => void;
  onTargetPlayerChange: (playerId: string) => void;
  onGuessedValueChange: (value: string) => void;
  onToggleReady: (isReady: boolean) => void;
  onStartRound: () => void;
  onPlayCard: () => void;
  onLeaveRoom: () => void;
  onBackToGames: () => void;
};

export function RoomPage({
  state,
  gameTitle,
  message,
  lastNote,
  selectedInstanceId,
  targetPlayerId,
  guessedValue,
  onSelectCard,
  onTargetPlayerChange,
  onGuessedValueChange,
  onToggleReady,
  onStartRound,
  onPlayCard,
  onLeaveRoom,
  onBackToGames,
}: RoomPageProps) {
  const self = state.players.find((player) => player.id === state.selfPlayerId) ?? null;
  const isCreator = state.creatorId === state.selfPlayerId;
  const selectedCard = self?.hand.find((card) => card.instanceId === selectedInstanceId) ?? null;
  const selectedCardDef = selectedCard ? getCardDef(selectedCard.cardId) : null;
  const isMyTurn = Boolean(self && state.round?.currentPlayerId === self.id && state.phase === "in_round");
  const playerCount = state.players.length;
  const readyCount = state.players.filter((player) => player.isReady).length;
  const allReady = playerCount >= 2 && state.players.every((player) => player.isReady);
  const showLobby = state.phase === "lobby";
  const guessNeeded = selectedCardDef?.id === "guard";
  const targetNeeded =
    selectedCardDef?.id === "guard" ||
    selectedCardDef?.id === "priest" ||
    selectedCardDef?.id === "baron" ||
    selectedCardDef?.id === "king" ||
    selectedCardDef?.id === "prince";

  const targetablePlayers = React.useMemo(() => {
    if (!self || !selectedCardDef) return [];

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
  }, [selectedCardDef, self, state.players]);

  return (
    <main className="room-shell">
      <section className="room-topbar">
        <div>
          <h1>{gameTitle}</h1>
          <p>{showLobby ? "Waiting room" : state.phase.replaceAll("_", " ")}</p>
        </div>
        <div className="topbar-chips">
          <button type="button" className="secondary-button topbar-button" onClick={onLeaveRoom}>
            Leave room
          </button>
          <button type="button" className="secondary-button topbar-button" onClick={onBackToGames}>
            Back to games
          </button>
          {showLobby ? <span className="status-pill">{readyCount}/{playerCount} ready</span> : null}
          {state.phase === "in_round" ? <span className={`status-pill${isMyTurn ? " is-active" : ""}`}>{isMyTurn ? "Your turn" : "Waiting"}</span> : null}
          <span className="status-pill">Room {state.roomId}</span>
        </div>
      </section>

      <div className="room-layout">
        <aside className="panel room-sidebar">
          <section className="sidebar-section">
            <h2>Room code</h2>
            <div className="room-code-box">{state.roomId}</div>
            <p className="helper-text">Share this code so another player can join.</p>
          </section>

          <section className="sidebar-section">
            <h3>Your status</h3>
            {showLobby ? (
              <button
                type="button"
                className={`ready-toggle${self?.isReady ? " is-ready" : ""}`}
                aria-pressed={self?.isReady ?? false}
                onClick={() => onToggleReady(!self?.isReady)}
              >
                <span className="ready-toggle-track">
                  <span className="ready-toggle-thumb" />
                </span>
                <span className="ready-toggle-label">{self?.isReady ? "Ready" : "Not ready"}</span>
              </button>
            ) : (
              <span className={`ready-pill${self?.isReady ? " is-ready" : ""}`}>{self?.isReady ? "Ready" : "Not ready"}</span>
            )}
          </section>

          <section className="sidebar-section">
            <h3>Players</h3>
            <div className="player-list">
              {state.players.map((player) => (
                <div key={player.id} className={`player-list-item${player.id === state.selfPlayerId ? " is-self" : ""}`}>
                  <div>
                    <strong>{player.name}</strong>
                    <p>{player.id === state.creatorId ? "Creator" : "Player"}</p>
                  </div>
                  <span className={`ready-pill${player.isReady ? " is-ready" : ""}`}>{player.isReady ? "Ready" : "Not ready"}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="sidebar-section">
            <h3>Activity</h3>
            <ActivityFeed events={state.log} state={state} />
          </section>

          {lastNote ? (
            <section className="sidebar-section">
              <h3>Private info</h3>
              <p className="note-box">{lastNote}</p>
            </section>
          ) : null}
        </aside>

        <div className="room-main">
          {showLobby ? (
            <section className="panel lobby-board">
              <div className="section-header">
                <div>
                  <h2>Table</h2>
                  <p className="muted">Need at least 2 players. Everyone must be ready before the creator can start.</p>
                </div>
                {isCreator ? (
                  <button type="button" className="primary-button" onClick={onStartRound} disabled={!allReady}>
                    Start game
                  </button>
                ) : (
                  <span className="status-pill">Waiting for creator</span>
                )}
              </div>

              <div className="lobby-summary-grid">
                <div className="summary-card">
                  <span>Players</span>
                  <strong>{playerCount}</strong>
                  <p>Minimum 2</p>
                </div>
                <div className="summary-card">
                  <span>Ready</span>
                  <strong>{readyCount}</strong>
                  <p>{allReady ? "All set" : "Waiting on players"}</p>
                </div>
                <div className="summary-card">
                  <span>Deck</span>
                  <strong>16</strong>
                  <p>Classic Love Letter</p>
                </div>
              </div>

              <p className="helper-text">{message}</p>
            </section>
          ) : (
            <>
              <section className="panel board-panel">
                <div className="section-header">
                  <div>
                    <h2>Table</h2>
                    <p className="muted">Players, discard piles, and round state.</p>
                  </div>
                  <div className="table-meta">
                    <span className="status-pill">Deck {state.round?.deckCount ?? 0}</span>
                    <span className="status-pill">Turn {state.round?.turnNumber ?? 0}</span>
                  </div>
                </div>

                <div className="players-grid">
                  {state.players.map((player) => (
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
                        {player.discardPile.length === 0 ? <span className="empty-label">No discards</span> : null}
                        {player.discardPile.map((card) => (
                          <CardView key={card.instanceId} card={card} compact />
                        ))}
                      </div>
                    </article>
                  ))}
                </div>

                {state.round?.visibleRemovedCards.length ? (
                  <div className="removed-section">
                    <h3>Visible removed cards</h3>
                    <div className="discard-row">
                      {state.round.visibleRemovedCards.map((card) => (
                        <CardView key={card.instanceId} card={card} compact />
                      ))}
                    </div>
                  </div>
                ) : null}

                {state.roundWinnerIds.length ? (
                  <div className="round-banner">
                    Round winner: {state.roundWinnerIds.map((playerId) => playerNameById(state, playerId)).join(", ")}
                  </div>
                ) : null}
              </section>

              <section className="panel hand-panel">
                <div className="section-header">
                  <div>
                    <h2>Your hand</h2>
                    <p className="muted">{isMyTurn ? "Choose a card, then confirm the action." : "Waiting for your turn."}</p>
                  </div>
                  {isCreator && state.phase === "round_over" ? (
                    <button type="button" className="secondary-button" onClick={onStartRound}>
                      Start next round
                    </button>
                  ) : null}
                </div>

                <div className="hand-row">
                  {self?.hand.map((card) => (
                    <CardView
                      key={card.instanceId}
                      card={card}
                      selectable={isMyTurn}
                      selected={card.instanceId === selectedInstanceId}
                      onClick={isMyTurn ? () => onSelectCard(card.instanceId) : undefined}
                    />
                  ))}
                  {!self?.hand.length ? <span className="empty-label">No hand available.</span> : null}
                </div>

                <div className="action-panel">
                  <div className="action-summary">
                    <h3>Selected action</h3>
                    <p className="muted">{selectedCardDef ? `${selectedCardDef.name} (${selectedCardDef.value})` : "Select a card from your hand."}</p>
                  </div>

                  <div className="action-controls">
                    {targetNeeded ? (
                      <label>
                        Target
                        <select value={targetPlayerId} onChange={(event) => onTargetPlayerChange(event.target.value)}>
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
                        <select value={guessedValue} onChange={(event) => onGuessedValueChange(event.target.value)}>
                          {[2, 3, 4, 5, 6, 7, 8].map((value) => (
                            <option key={value} value={value}>
                              {value} • {getCardDef(cardIdByValue(value)).name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <button
                      type="button"
                      className="primary-button"
                      disabled={!isMyTurn || !selectedCard || (targetNeeded && !targetPlayerId) || (guessNeeded && !guessedValue)}
                      onClick={onPlayCard}
                    >
                      Play card
                    </button>
                  </div>
                </div>

                <p className="helper-text">{message}</p>
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
