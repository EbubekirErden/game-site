import React from "react";

import { getCardDef } from "@game-site/shared";
import type { CardInstance, PlayerViewState } from "@game-site/shared";

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
  const [playStage, setPlayStage] = React.useState<"select_card" | "setup_action">("select_card");
  const [dismissedNote, setDismissedNote] = React.useState<string | null>(null);

  const self = state.players?.find((player) => player.id === state.selfPlayerId) ?? null;
  const isCreator = state.creatorId === state.selfPlayerId;
  const selectedCard = self?.hand?.find((card) => card.instanceId === selectedInstanceId) ?? null;
  const selectedCardDef = selectedCard ? getCardDef(selectedCard.cardId) : null;
  const isMyTurn = Boolean(self && state.round?.currentPlayerId === self.id && state.phase === "in_round");
  const playerCount = state.players?.length || 0;
  const readyCount = state.players?.filter((player) => player.isReady).length || 0;
  const allReady = playerCount >= 2 && state.players?.every((player) => player.isReady);
  const showLobby = state.phase === "lobby";
  
  const guessNeeded = selectedCardDef?.id === "guard";
  const targetNeeded =
    selectedCardDef?.id === "guard" ||
    selectedCardDef?.id === "priest" ||
    selectedCardDef?.id === "baron" ||
    selectedCardDef?.id === "king" ||
    selectedCardDef?.id === "prince";

  React.useEffect(() => {
    if (!isMyTurn) setPlayStage("select_card");
    setDismissedNote(null);
  }, [isMyTurn, state.round?.turnNumber, state.phase]);

  const handleInitiatePlay = () => {
    if (targetNeeded || guessNeeded) setPlayStage("setup_action");
    else { onPlayCard(); setPlayStage("select_card"); }
  };

  const handleConfirmPlay = () => {
    onPlayCard();
    setPlayStage("select_card");
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(state.roomId);
    alert("Room code copied to clipboard!");
  };

  const privateNoteCardId = React.useMemo(() => {
    if (!lastNote) return null;
    const match = lastNote.match(/(Guard|Priest|Baron|Handmaid|Prince|King|Countess|Princess|Assassin|Jester|Bishop|Sycophant|Constable|Count)/i);
    return match ? match[1].toLowerCase() : null;
  }, [lastNote]);

  const showPrivateNote = lastNote && dismissedNote !== lastNote;

  const targetablePlayers = React.useMemo(() => {
    if (!self || !selectedCardDef || !state.players) return [];

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
      <header className="table-topbar">
        <div className="topbar-info">
          <h1>{gameTitle}</h1>
          <span className="phase-badge">{showLobby ? "Waiting Room" : state.phase?.replaceAll("_", " ")}</span>
          <span className="room-code-badge copyable" onClick={handleCopyCode} title="Click to copy">
            Room: {state.roomId} 📋
          </span>
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

      <div className="table-workspace">
        <aside className="table-sidebar table-left-sidebar">
          <section className="game-panel slim-panel">
            <h3>Players</h3>
            <div className="player-list-slim">
              {state.players?.map((player) => (
                <div key={player.id} className={`player-row ${player.id === state.selfPlayerId ? "is-self" : ""} ${player.status !== "active" ? "is-eliminated" : ""}`}>
                  <div className="player-row-info">
                    <strong>{player.name} {player.id === state.creatorId && "👑"}</strong>
                    <span className="player-status-text">
                      {player.status} {player.protectedUntilNextTurn && "🛡️"} • 🪙 {player.tokens || 0}
                    </span>
                  </div>
                  {showLobby && <span className={`mini-ready-pill ${player.isReady ? "ready" : ""}`} title={player.isReady ? "Ready" : "Not ready"} />}
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
                <button type="button" className={`full-width mt-2 ${allReady ? "ready-start-btn" : "secondary-button"}`} onClick={onStartRound} disabled={!allReady}>
                  {allReady ? "🚀 Start Game" : "Waiting for players..."}
                </button>
              )}
            </section>
          )}
        </aside>

        <section className="table-center">
          {showLobby ? (
            <div className="game-panel center-lobby">
              <h2>Waiting for players...</h2>
              <p>Need at least 2 players. Everyone must be ready to start.</p>
              <div className="lobby-stats">
                <div className="stat-box"><strong>{playerCount}</strong> <span>Players</span></div>
                <div className="stat-box"><strong>{readyCount}</strong> <span>Ready</span></div>
              </div>
              <p className="error-text">{message}</p>
            </div>
          ) : (
            <>
              <div className="game-panel board-area">
                <div className="board-header">
                  <h3>Table</h3>
                  <div className="deck-info">Deck: {state.round?.deckCount ?? 0} cards remaining</div>
                </div>
                
                <div className="table-grid">
                  {state.players?.map((player) => (
                    <div key={player.id} className={`table-zone ${player.id === state.selfPlayerId ? "is-self-zone" : ""}`}>
                      <div className="zone-nameplate">
                        {player.name} {player.id === state.selfPlayerId && "(You)"}
                        <span className="token-count">🪙 {player.tokens || 0}</span>
                      </div>
                      
                      {(!player.discardPile || player.discardPile.length === 0) ? (
                         <span className="muted-text" style={{fontSize: '0.85rem'}}>No discards</span>
                      ) : (
                        <div className="discard-fan">
                          {player.discardPile?.map((card, index) => (
                            <div className="fan-card" key={card.instanceId} style={{ zIndex: index }}>
                              <CardView card={card} compact />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {(state.round?.visibleRemovedCards?.length ?? 0) > 0 && (
                  <div className="removed-section">
                    <h4>Setup Cards (Burned)</h4>
                    <div className="discard-spread">
                      {state.round?.visibleRemovedCards?.map((card) => (
                        <CardView key={card.instanceId} card={card} compact />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {state.phase === "round_over" ? (
                <div className="game-panel round-over-panel">
                  <h2>Round Over!</h2>
                  
                  <div className="winners-circle">
                    🏆 Winner(s): {state.roundWinnerIds?.map(id => playerNameById(state, id)).join(", ")}
                  </div>

                  <div className="tokens-summary">
                    {state.players?.map(p => (
                      <div key={p.id} className="token-row">
                        <span>
                          {p.name} {state.roundWinnerIds?.includes(p.id) ? "🌟" : ""}
                        </span>
                        <span style={{color: '#f1c40f'}}>🪙 {p.tokens}</span>
                      </div>
                    ))}
                  </div>

                  <div className="round-actions" style={{ display: 'flex', gap: '16px', marginTop: '32px', justifyContent: 'center' }}>
                    {/* Bypassed the backend 'Ready' requirement since the server ignores it here */}
                    {isCreator ? (
                      <button className="ready-start-btn" onClick={onStartRound} style={{ width: '250px' }}>
                        🚀 Start Next Round
                      </button>
                    ) : (
                      <p className="muted-text">Waiting for the host to start the next round...</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="game-panel player-area">
                  <div className="player-area-header">
                    <h3>{isMyTurn ? "Your Turn" : "Your Hand"}</h3>
                  </div>

                  {playStage === "select_card" ? (
                    <div className="action-step-1">
                      {isMyTurn && <p className="instruction-text">Select a card from your hand to play or discard.</p>}
                      <div className="hand-dock-centered">
                        {self?.hand?.map((card) => (
                          <div className="hand-card-wrapper" key={card.instanceId}>
                            <CardView
                              card={card}
                              selectable={isMyTurn}
                              selected={card.instanceId === selectedInstanceId}
                              onClick={isMyTurn ? () => onSelectCard(card.instanceId) : undefined}
                            />
                            {card.instanceId === selectedInstanceId && isMyTurn && (
                              <button className="primary-button play-btn-overlay" onClick={handleInitiatePlay}>
                                Play Card
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="action-step-2">
                      <div className="step-2-header">
                        <button className="secondary-button" onClick={() => setPlayStage("select_card")}>← Cancel</button>
                        <h4>Configure Play</h4>
                      </div>
                      
                      <div className="play-stage-horizontal">
                        
                        {/* THE FIXED CARD SLOT */}
                        <div className={`stage-card-slot ${!selectedCard ? "is-empty" : ""}`}>
                          {selectedCard ? <CardView card={selectedCard} spotlight /> : <div className="empty-slot">Select a card</div>}
                        </div>

                        <div className="stage-actions">
                          {targetNeeded && (
                            <div className="selection-group">
                              <label className="dark-label">1. Choose a Target</label>
                              <div className="selection-grid">
                                {targetablePlayers.map(p => (
                                  <button 
                                    key={p.id} 
                                    className={`grid-btn ${targetPlayerId === p.id ? 'selected' : ''}`}
                                    onClick={() => onTargetPlayerChange(p.id)}
                                  >
                                    {p.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {guessNeeded && (
                            <div className="selection-group">
                              <label className="dark-label">2. Guess their Card</label>
                              <div className="selection-grid">
                                {[2, 3, 4, 5, 6, 7, 8].map(val => (
                                  <button 
                                    key={val} 
                                    className={`grid-btn ${guessedValue === val.toString() ? 'selected' : ''}`}
                                    onClick={() => onGuessedValueChange(val.toString())}
                                  >
                                    <span className="guess-val">{val}</span>
                                    <span className="guess-name">{getCardDef(cardIdByValue(val)).name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            className="primary-button play-btn"
                            disabled={!isMyTurn || !selectedCard || (targetNeeded && !targetPlayerId) || (guessNeeded && !guessedValue)}
                            onClick={handleConfirmPlay}
                          >
                            Confirm & Play
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <aside className="table-sidebar table-right-sidebar">
          {showPrivateNote && (
            <section className="game-panel alert-panel">
              <div className="alert-header">
                <h3>Private Info</h3>
                <button className="dismiss-btn" onClick={() => setDismissedNote(lastNote)}>✕</button>
              </div>
              <p>{lastNote}</p>
              {privateNoteCardId && (
                <div className="private-card-showcase">
                  <CardView card={{ instanceId: 'temp', cardId: privateNoteCardId as any }} compact />
                </div>
              )}
            </section>
          )}

          <section className="game-panel activity-panel">
            <h3>Activity Log</h3>
            <ActivityFeed events={state.log || []} state={state} />
          </section>
        </aside>

      </div>
    </main>
  );
}