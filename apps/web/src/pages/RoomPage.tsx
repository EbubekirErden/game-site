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
      if (otherOptions.length === 0) return [self];
      return [self, ...otherOptions];
    }

    if (selectedCardDef.targetRule === "single_other_non_protected") {
      return state.players.filter((player) => player.id !== self.id && player.status === "active" && !player.protectedUntilNextTurn);
    }

    if (selectedCardDef.targetRule === "self") return [self];
    return [];
  }, [selectedCardDef, self, state.players]);

  return (
    <main className="table-layout">
      {/* Top Navigation Bar */}
      <header className="table-topbar">
        <div className="topbar-info">
          <h1>{gameTitle}</h1>
          <span className="phase-badge">{showLobby ? "Waiting Room" : state.phase.replaceAll("_", " ")}</span>
          <span className="room-code-badge">Room: {state.roomId}</span>
        </div>
        <div className="topbar-actions">
          {state.phase === "in_round" && (
            <span className={`turn-indicator ${isMyTurn ? "is-my-turn" : ""}`}>
              {isMyTurn ? "Your Turn" : "Waiting for others..."}
            </span>
          )}
          <button type="button" className="secondary-button" onClick={onLeaveRoom}>Leave</button>
        </div>
      </header>

      {/* 3-Column Workspace */}
      <div className="table-workspace">
        
        {/* LEFT COLUMN: Players & Status */}
        <aside className="table-sidebar table-left-sidebar">
          <section className="game-panel slim-panel">
            <h3>Players</h3>
            <div className="player-list-slim">
              {state.players.map((player) => (
                <div key={player.id} className={`player-row ${player.id === state.selfPlayerId ? "is-self" : ""} ${player.status !== "active" ? "is-eliminated" : ""}`}>
                  <div className="player-row-info">
                    <strong>{player.name} {player.id === state.creatorId && "👑"}</strong>
                    <span className="player-status-text">
                      {player.status} {player.protectedUntilNextTurn && "🛡️"}
                    </span>
                  </div>
                  {/* ONLY show ready states if in the lobby */}
                  {showLobby && (
                    <span className={`mini-ready-pill ${player.isReady ? "ready" : ""}`} />
                  )}
                </div>
              ))}
            </div>
          </section>

          {showLobby && (
            <section className="game-panel slim-panel">
              <h3>Your Status</h3>
              <button
                type="button"
                className={`primary-button full-width ${self?.isReady ? "is-ready-btn" : ""}`}
                onClick={() => onToggleReady(!self?.isReady)}
              >
                {self?.isReady ? "Ready to Start!" : "Click when Ready"}
              </button>
              
              {isCreator && (
                <button type="button" className="secondary-button full-width mt-2" onClick={onStartRound} disabled={!allReady}>
                  {allReady ? "Start Game" : "Waiting for players..."}
                </button>
              )}
            </section>
          )}
        </aside>

        {/* CENTER COLUMN: The Board */}
        <section className="table-center">
          {showLobby ? (
            <div className="game-panel center-lobby">
              <h2>Waiting for players...</h2>
              <p>Need at least 2 players. Everyone must be ready to start.</p>
              <div className="lobby-stats">
                <div className="stat-box"><strong>{playerCount}</strong><span>Players</span></div>
                <div className="stat-box"><strong>{readyCount}</strong><span>Ready</span></div>
              </div>
              <p className="error-text">{message}</p>
            </div>
          ) : (
            <>
              {/* Other Players' Discards / Table Area */}
              <div className="game-panel board-area">
                <div className="board-header">
                  <h3>Table</h3>
                  <div className="deck-info">Deck: {state.round?.deckCount ?? 0} cards remaining</div>
                </div>
                
                <div className="opponent-grid">
                  {state.players.map((player) => (
                    <div key={player.id} className={`opponent-zone ${player.id === state.selfPlayerId ? "hidden" : ""}`}>
                      <div className="opponent-name">
                        {player.name} 
                        <span className="token-count">🪙 {player.tokens}</span>
                      </div>
                      <div className="discard-spread">
                        {player.discardPile.length === 0 ? <span className="muted-text">No discards</span> : null}
                        {player.discardPile.map((card) => (
                          <CardView key={card.instanceId} card={card} compact />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {state.roundWinnerIds.length > 0 && (
                  <div className="winner-banner">
                    🏆 Round winner: {state.roundWinnerIds.map((id) => playerNameById(state, id)).join(", ")}
                  </div>
                )}
              </div>

              {/* Your Play Area & Hand */}
              <div className="game-panel player-area">
                <div className="player-area-header">
                  <h3>Your Hand</h3>
                  <div className="token-count">🪙 Tokens: {self?.tokens || 0}</div>
                </div>

                {/* The Stage (where you select a card and choose targets) */}
                <div className="play-stage-horizontal">
                  <div className="stage-card-slot">
                    {selectedCard ? (
                      <CardView card={selectedCard} spotlight />
                    ) : (
                      <div className="empty-slot">Select a card</div>
                    )}
                  </div>

                  <div className="stage-actions">
                    {targetNeeded && (
                      <label className="dark-label">
                        Target Player
                        <select className="dark-select" value={targetPlayerId} onChange={(e) => onTargetPlayerChange(e.target.value)}>
                          <option value="">-- Choose Target --</option>
                          {targetablePlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                    )}

                    {guessNeeded && (
                      <label className="dark-label">
                        Guard Guess
                        <select className="dark-select" value={guessedValue} onChange={(e) => onGuessedValueChange(e.target.value)}>
                          <option value="">-- Guess Card --</option>
                          {[2, 3, 4, 5, 6, 7, 8].map((val) => (
                            <option key={val} value={val}>{val} - {getCardDef(cardIdByValue(val)).name}</option>
                          ))}
                        </select>
                      </label>
                    )}

                    <button
                      type="button"
                      className="primary-button play-btn"
                      disabled={!isMyTurn || !selectedCard || (targetNeeded && !targetPlayerId) || (guessNeeded && !guessedValue)}
                      onClick={onPlayCard}
                    >
                      Play Card
                    </button>
                  </div>
                </div>

                {/* Hand Dock */}
                <div className="hand-dock-horizontal">
                  {self?.hand.map((card) => (
                    <CardView
                      key={card.instanceId}
                      card={card}
                      selectable={isMyTurn}
                      selected={card.instanceId === selectedInstanceId}
                      onClick={isMyTurn ? () => onSelectCard(card.instanceId) : undefined}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* RIGHT COLUMN: Activity & Info */}
        <aside className="table-sidebar table-right-sidebar">
          {lastNote && (
            <section className="game-panel alert-panel">
              <h3>Private Info</h3>
              <p>{lastNote}</p>
            </section>
          )}

          <section className="game-panel activity-panel">
            <h3>Activity Log</h3>
            <ActivityFeed events={state.log} state={state} />
          </section>
        </aside>

      </div>
    </main>
  );
}