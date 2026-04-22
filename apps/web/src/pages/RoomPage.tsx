import React from "react";
import {
  ArrowLeft,
  Check,
  Coins,
  Copy,
  Crown,
  Info,
  Rocket,
  Shield,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";

import { getCardDef } from "@game-site/shared";
import type { CardID, PlayerViewState } from "@game-site/shared";

import { ActivityFeed } from "../components/ActivityFeed.js";
import { CardView } from "../components/CardView.js";
import { LoveLetterInfoDrawer } from "../components/LoveLetterInfoDrawer.js";
import { cardNamesByValue, playerNameById } from "../lib/gamePresentation.js";

type RoomPageProps = {
  state: PlayerViewState;
  gameTitle: string;
  message: string;
  lastNote:
    | {
        kind: "peek";
        text: string;
        cardId: CardID | null;
      }
    | {
        kind: "compare";
        text: string;
        ownCardId: CardID | null;
        otherCardId: CardID | null;
      }
    | {
        kind: "multi_peek";
        text: string;
        seen: Array<{
          targetPlayerId: string;
          cardId: CardID | null;
        }>;
      }
    | null;
  selectedInstanceId: string | null;
  selectedTargetPlayerIds: string[];
  peekPlayerId: string;
  guessedValue: string;
  onSelectCard: (instanceId: string | null) => void;
  onTargetPlayerIdsChange: (playerIds: string[]) => void;
  onPeekPlayerChange: (playerId: string) => void;
  onGuessedValueChange: (value: string) => void;
  onToggleReady: (isReady: boolean) => void;
  onStartRound: () => void;
  onPlayCard: () => Promise<boolean>;
  onLeaveRoom: () => void;
  onBackToGames: () => void;
};

export function RoomPage({
  state,
  gameTitle,
  message,
  lastNote,
  selectedInstanceId,
  selectedTargetPlayerIds,
  peekPlayerId,
  guessedValue,
  onSelectCard,
  onTargetPlayerIdsChange,
  onPeekPlayerChange,
  onGuessedValueChange,
  onToggleReady,
  onStartRound,
  onPlayCard,
  onLeaveRoom,
  onBackToGames,
}: RoomPageProps) {
  const [playStage, setPlayStage] = React.useState<"select_card" | "setup_action">("select_card");
  const [dismissedNote, setDismissedNote] = React.useState<string | null>(null);
  const [noteTurnNumber, setNoteTurnNumber] = React.useState<number | null>(null);
  const [copied, setCopied] = React.useState(false); // Copy button state

  const self = state.players?.find((player) => player.id === state.selfPlayerId) ?? null;
  const isCreator = state.creatorId === state.selfPlayerId;
  const selectedCard = self?.hand?.find((card) => card.instanceId === selectedInstanceId) ?? null;
  const selectedCardDef = selectedCard ? getCardDef(selectedCard.cardId) : null;
  const selfHandDefs = self?.hand?.map((card) => getCardDef(card.cardId)) ?? [];
  const isMyTurn = Boolean(self && state.round?.currentPlayerId === self.id && state.phase === "in_round");
  const currentTurnName = state.round?.currentPlayerId ? playerNameById(state, state.round.currentPlayerId) : null;
  const playerCount = state.players?.length || 0;
  const readyCount = state.players?.filter((player) => player.isReady).length || 0;
  const allReady = playerCount >= 2 && state.players?.every((player) => player.isReady);
  const showLobby = state.phase === "lobby";
  const showBetweenRounds = state.phase === "round_over";
  const showMatchOver = state.phase === "match_over";
  const showReadyPills = showLobby || showBetweenRounds;
  const statusMessage = ![
    "Room ready. Players can toggle ready.",
    "Game in progress.",
    "Round over. Everyone can confirm ready for the next round.",
    "Match over.",
  ].includes(message) ? message : "";
  const statusTone = statusMessage.startsWith("Played ")
    ? "success"
    : statusMessage.startsWith("Rejoining room") || statusMessage.startsWith("Connection lost")
      ? "info"
      : "error";
  const targetPlayerId = selectedTargetPlayerIds[0] ?? "";
  const cardId = selectedCardDef?.id ?? null;
  const guessNeeded = cardId === "guard" || cardId === "bishop";
  const singleTargetNeeded = [
    "guard",
    "bishop",
    "priest",
    "baron",
    "sycophant",
    "prince",
    "king",
    "dowager_queen",
    "jester",
  ].includes(cardId ?? "");
  const multiTargetNeeded = cardId === "baroness" || cardId === "cardinal";
  const targetNeeded = singleTargetNeeded || multiTargetNeeded;
  const forcedTargetPlayerId = state.round?.forcedTargetPlayerId ?? null;
  const guessValues = React.useMemo(() => {
    if (cardId === "guard") {
      return state.mode === "premium" ? [0, 2, 3, 4, 5, 6, 7, 8, 9] : [2, 3, 4, 5, 6, 7, 8];
    }

    if (cardId === "bishop") {
      return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    }

    return [];
  }, [cardId, state.mode]);

  const sameTargetSet = React.useCallback((left: string[], right: string[]) => {
    if (left.length !== right.length) return false;
    const a = [...left].sort();
    const b = [...right].sort();
    return a.every((value, index) => value === b[index]);
  }, []);

  const legalTargetSets = React.useMemo(() => {
    if (!self || !cardId || !state.players) return [];

    const targetableOthers = state.players
      .filter((player) => player.id !== self.id && player.status === "active" && !player.protectedUntilNextTurn)
      .map((player) => player.id);
    const selfAndTargetableOthers = state.players
      .filter((player) => player.status === "active" && (player.id === self.id || !player.protectedUntilNextTurn))
      .map((player) => player.id);
    const makePairs = (ids: string[]) => {
      const pairs: string[][] = [];
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          pairs.push([ids[i]!, ids[j]!]);
        }
      }
      return pairs;
    };

    let sets: string[][] = [];

    switch (cardId) {
      case "guard":
      case "bishop":
      case "priest":
      case "baron":
      case "king":
      case "dowager_queen":
      case "jester":
        sets = targetableOthers.map((id) => [id]);
        break;
      case "sycophant":
      case "prince":
        sets = selfAndTargetableOthers.map((id) => [id]);
        break;
      case "baroness":
        sets = [...targetableOthers.map((id) => [id]), ...makePairs(targetableOthers)];
        break;
      case "cardinal":
        sets = makePairs(selfAndTargetableOthers);
        break;
      default:
        sets = [];
        break;
    }

    if (forcedTargetPlayerId && cardId !== "sycophant") {
      sets = sets.filter((targetSet) => targetSet.includes(forcedTargetPlayerId));
    }

    return sets;
  }, [cardId, forcedTargetPlayerId, self, state.players]);

  const selectableTargetIds = React.useMemo(
    () => [...new Set(legalTargetSets.flat())],
    [legalTargetSets],
  );
  const isTargetSelectionValid = React.useMemo(
    () => legalTargetSets.some((targetSet) => sameTargetSet(targetSet, selectedTargetPlayerIds)),
    [legalTargetSets, sameTargetSet, selectedTargetPlayerIds],
  );

  React.useEffect(() => {
    if (!isMyTurn) setPlayStage("select_card");
  }, [isMyTurn, state.round?.turnNumber, state.phase]);

  React.useEffect(() => {
    setDismissedNote(null);
    setNoteTurnNumber(lastNote ? (state.round?.turnNumber ?? null) : null);
  }, [lastNote]);

  React.useEffect(() => {
    if (!lastNote || dismissedNote === lastNote.text) return;
    if (state.phase !== "in_round") return;
    if (state.round?.currentPlayerId !== state.selfPlayerId) return;
    if (noteTurnNumber === null) return;
    if (state.round.turnNumber <= noteTurnNumber) return;

    setDismissedNote(lastNote.text);
  }, [dismissedNote, lastNote, noteTurnNumber, state.phase, state.round?.currentPlayerId, state.round?.turnNumber, state.selfPlayerId]);

  const handleInitiatePlay = async () => {
    if (targetNeeded || guessNeeded) {
      setPlayStage("setup_action");
      return;
    }

    const didPlay = await onPlayCard();
    if (didPlay) {
      setPlayStage("select_card");
    }
  };

  const handleConfirmPlay = async () => {
    const didPlay = await onPlayCard();
    if (didPlay) {
      setPlayStage("select_card");
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(state.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activePrivateNote = lastNote && dismissedNote !== lastNote.text ? lastNote : null;
  const jesterTargetedPlayerIds = React.useMemo(
    () => new Set((state.round?.jesterAssignments ?? []).map((assignment) => assignment.targetPlayerId)),
    [state.round?.jesterAssignments],
  );
  const targetOptions = React.useMemo(
    () =>
      (state.players ?? [])
        .filter((player) => selectableTargetIds.includes(player.id))
        .map((player) => ({
          player,
          selectable: true,
          protectedByHandmaid: player.id !== self?.id && player.protectedUntilNextTurn,
        })),
    [selectableTargetIds, self?.id, state.players],
  );

  const hasSelectableTarget = legalTargetSets.length > 0;
  const activeOpponentsCount = state.players?.filter((player) => player.id !== self?.id && player.status === "active").length ?? 0;
  const canPlayWithoutTarget = Boolean(
    selectedCardDef &&
    targetNeeded &&
    !hasSelectableTarget,
  );
  const mustPlayCountess = Boolean(
    selectedCardDef &&
    selectedCardDef.id !== "countess" &&
    selfHandDefs.some((card) => card.id === "countess") &&
    selfHandDefs.some((card) => card.id === "prince" || card.id === "king"),
  );
  const targetHintText =
    targetNeeded && !hasSelectableTarget
      ? activeOpponentsCount === 0
        ? "No opponent is left in the round, so this card will be played without effect."
        : forcedTargetPlayerId
          ? "The current Sycophant choice makes this card fizzle, so it will be discarded without effect."
          : "All available opponents are protected by Handmaid, so this card will be played without effect."
      : null;

  React.useEffect(() => {
    if (!targetNeeded) {
      if (selectedTargetPlayerIds.length > 0) {
        onTargetPlayerIdsChange([]);
      }
      return;
    }

    if (multiTargetNeeded) {
      if (selectedTargetPlayerIds.length > 0 && !isTargetSelectionValid) {
        onTargetPlayerIdsChange([]);
      }
      return;
    }

    const defaultTargetId = legalTargetSets[0]?.[0] ?? "";
    if (!targetPlayerId) {
      if (defaultTargetId) {
        onTargetPlayerIdsChange([defaultTargetId]);
      }
      return;
    }

    const selectedTargetStillValid = legalTargetSets.some((targetSet) => sameTargetSet(targetSet, [targetPlayerId]));
    if (!selectedTargetStillValid) {
      onTargetPlayerIdsChange(defaultTargetId ? [defaultTargetId] : []);
    }
  }, [isTargetSelectionValid, legalTargetSets, multiTargetNeeded, onTargetPlayerIdsChange, sameTargetSet, selectedTargetPlayerIds, targetNeeded, targetPlayerId]);

  React.useEffect(() => {
    if (cardId !== "cardinal") {
      if (peekPlayerId) {
        onPeekPlayerChange("");
      }
      return;
    }

    if (peekPlayerId && !selectedTargetPlayerIds.includes(peekPlayerId)) {
      onPeekPlayerChange("");
    }
  }, [cardId, onPeekPlayerChange, peekPlayerId, selectedTargetPlayerIds]);

  const handleTargetToggle = (playerId: string) => {
    if (!multiTargetNeeded) {
      onTargetPlayerIdsChange([playerId]);
      return;
    }

    if (selectedTargetPlayerIds.includes(playerId)) {
      onTargetPlayerIdsChange(selectedTargetPlayerIds.filter((id) => id !== playerId));
      return;
    }

    const nextIds = [...selectedTargetPlayerIds, playerId];
    const trimmedNextIds = cardId === "cardinal" && nextIds.length > 2 ? nextIds.slice(nextIds.length - 2) : nextIds;
    onTargetPlayerIdsChange(trimmedNextIds);
  };

  return (
    <main className="table-layout">
      <header className="table-topbar">
        <div className="topbar-info">
          <h1>{gameTitle}</h1>
          <span className="phase-badge">{showLobby ? "Waiting Room" : state.phase?.replaceAll("_", " ")}</span>
          <span className="phase-badge">{state.mode === "premium" ? "Premium (5-8 people)" : "Classic"}</span>
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
          {state.phase === "in_round" && (
            <span className={`turn-indicator ${isMyTurn ? "is-my-turn" : ""}`}>
              {isMyTurn ? "Your Turn" : currentTurnName ? `${currentTurnName}'s Turn` : "Turn in progress"}
            </span>
          )}
          <button type="button" className="danger-button topbar-leave-button" onClick={onLeaveRoom}>Leave</button>
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
                    <strong className="player-name-row">
                      <span>{player.name}</span>
                      {player.id === state.creatorId ? <Crown size={14} strokeWidth={2} aria-hidden="true" /> : null}
                    </strong>
                    <span className="player-status-text">
                      <span className="status-inline">{player.status}</span>
                      {player.protectedUntilNextTurn ? (
                        <span className="status-inline">
                          <Shield size={12} strokeWidth={2.1} aria-hidden="true" />
                          Protected
                        </span>
                      ) : null}
                      <span className="status-inline">
                        <Coins size={12} strokeWidth={2.1} aria-hidden="true" />
                        {player.tokens || 0}
                      </span>
                      {forcedTargetPlayerId === player.id ? (
                        <span className="status-inline">Sycophant</span>
                      ) : null}
                      {jesterTargetedPlayerIds.has(player.id) ? (
                        <span className="status-inline">Jester</span>
                      ) : null}
                    </span>
                  </div>
                  {showReadyPills && <span className={`mini-ready-pill ${player.isReady ? "ready" : ""}`} title={player.isReady ? "Ready" : "Not ready"} />}
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
                  {allReady ? (
                    <span className="button-content">
                      <Rocket size={16} strokeWidth={2.2} aria-hidden="true" />
                      Start Game
                    </span>
                  ) : (
                    `Waiting for players... (${readyCount}/${playerCount})`
                  )}
                </button>
              )}
            </section>
          )}

          {activePrivateNote && (
            <section className="game-panel alert-panel">
              <div className="alert-header">
                <h3>Result / Info</h3>
                <button type="button" className="dismiss-btn" onClick={() => setDismissedNote(activePrivateNote.text)} aria-label="Dismiss note">
                  <X size={16} strokeWidth={2.3} aria-hidden="true" />
                </button>
              </div>
              <p>{activePrivateNote.text}</p>
              {activePrivateNote.kind === "compare" ? (
                <div className="comparison-reveal">
                  <div className="comparison-card-lane comparison-card-lane-self">
                    <span className="comparison-card-label">Your card</span>
                    {activePrivateNote.ownCardId ? (
                      <CardView card={{ instanceId: "compare-self", cardId: activePrivateNote.ownCardId }} compact />
                    ) : (
                      <div className="comparison-empty-card">No card revealed</div>
                    )}
                  </div>
                  <div className="comparison-divider">vs</div>
                  <div className="comparison-card-lane comparison-card-lane-opponent">
                    <span className="comparison-card-label">Opposing card</span>
                    {activePrivateNote.otherCardId ? (
                      <CardView card={{ instanceId: "compare-other", cardId: activePrivateNote.otherCardId }} compact />
                    ) : (
                      <div className="comparison-empty-card">No card revealed</div>
                    )}
                  </div>
                </div>
              ) : activePrivateNote.kind === "multi_peek" ? (
                <div className="discard-spread discard-spread-tight">
                  {activePrivateNote.seen.map((entry) => (
                    <div key={entry.targetPlayerId} className="comparison-card-lane comparison-card-lane-self">
                      <span className="comparison-card-label">{playerNameById(state, entry.targetPlayerId)}</span>
                      {entry.cardId ? (
                        <CardView card={{ instanceId: `peek-${entry.targetPlayerId}`, cardId: entry.cardId }} compact />
                      ) : (
                        <div className="comparison-empty-card">No card revealed</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : activePrivateNote.cardId ? (
                <div className="private-card-showcase">
                  <CardView card={{ instanceId: "temp", cardId: activePrivateNote.cardId }} compact />
                </div>
              ) : null}
            </section>
          )}
        </aside>

        <section className="table-center">
          {showLobby ? (
            <div className="game-panel center-lobby">
              <h2>Waiting for players...</h2>
              <p>
                Need at least 2 players. Everyone must be ready to start.
                {state.mode === "premium" ? " Premium is intended for 5 to 8 people." : ""}
              </p>
              <div className="lobby-stats">
                <div className="stat-box"><strong>{playerCount}</strong> <span>Players</span></div>
                <div className="stat-box"><strong>{readyCount}</strong> <span>Ready</span></div>
              </div>
              <p className="error-text">{message}</p>
            </div>
          ) : showBetweenRounds ? (
            <>
              {statusMessage && (
                <div className={`game-panel status-banner-panel is-${statusTone}`}>
                  <p className={`status-banner-text is-${statusTone}`}>{statusMessage}</p>
                </div>
              )}
              <div className="game-panel round-over-panel">
                <h2>Round Over!</h2>
                <p>Everyone needs to confirm ready before the next round can begin.</p>

                <div className="winners-circle">
                  <Trophy size={20} strokeWidth={2.2} aria-hidden="true" />
                  <span>Winner(s): {state.roundWinnerIds?.map((id) => playerNameById(state, id)).join(", ")}</span>
                </div>

                <div className="tokens-summary">
                  {state.players?.map((player) => (
                    <div key={player.id} className={`token-row ${player.isReady ? "is-ready-row" : ""}`}>
                      <span className="token-row-name">
                        <span>{player.name}</span>
                        {state.roundWinnerIds?.includes(player.id) ? <Sparkles size={14} strokeWidth={2.2} aria-hidden="true" /> : null}
                      </span>
                      <span className="token-row-value">
                        <Coins size={14} strokeWidth={2.1} aria-hidden="true" />
                        {player.tokens}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="round-actions" style={{ display: "flex", gap: "16px", marginTop: "32px", justifyContent: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={`primary-button ${self?.isReady ? "is-ready-btn" : ""}`}
                    onClick={() => onToggleReady(!self?.isReady)}
                    style={{ width: "220px" }}
                  >
                    {self?.isReady ? "Ready Confirmed" : "Confirm Ready"}
                  </button>
                  {isCreator ? (
                    <button
                      type="button"
                      className={allReady ? "ready-start-btn" : "secondary-button"}
                      onClick={onStartRound}
                      disabled={!allReady}
                      style={{ width: "250px" }}
                    >
                      {allReady ? (
                        <span className="button-content">
                          <Rocket size={16} strokeWidth={2.2} aria-hidden="true" />
                          Start Next Round
                        </span>
                      ) : (
                        `Waiting for everyone... (${readyCount}/${playerCount})`
                      )}
                    </button>
                  ) : (
                    <p className="muted-text">{allReady ? "Host can start the next round now." : `Ready players: ${readyCount}/${playerCount}`}</p>
                  )}
                </div>
              </div>

              <div className="game-panel board-area">
                <div className="board-header">
                  <h3>Previous Round Table</h3>
                  <div className="deck-info">Deck: {state.round?.deckCount ?? 0} cards remaining</div>
                </div>

                <div className="table-grid">
                  {state.players?.map((player) => (
                    <div key={player.id} className={`table-zone ${player.id === state.selfPlayerId ? "is-self-zone" : ""}`}>
                      <div className="zone-nameplate">
                        {player.name} {player.id === state.selfPlayerId && "(You)"}
                        <span className="token-count">
                          <Coins size={14} strokeWidth={2.1} aria-hidden="true" />
                          {player.tokens || 0}
                        </span>
                      </div>

                      {(!player.discardPile || player.discardPile.length === 0) ? (
                        <span className="muted-text" style={{ fontSize: "0.85rem" }}>No discards</span>
                      ) : (
                        <div className="discard-fan">
                          {player.discardPile?.map((card, index) => (
                            <div className="fan-card" key={card.instanceId} style={{ zIndex: index }}>
                              <CardView card={card} mini />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : showMatchOver ? (
            <div className="game-panel round-over-panel">
              <h2>Match Over!</h2>
              <p>A player reached the token goal for this player count, so the full match is finished.</p>

              <div className="winners-circle">
                <Trophy size={20} strokeWidth={2.2} aria-hidden="true" />
                <span>Match Winner(s): {state.matchWinnerIds?.map((id) => playerNameById(state, id)).join(", ")}</span>
              </div>

              <div className="tokens-summary">
                {state.players?.map((player) => (
                  <div key={player.id} className="token-row">
                    <span className="token-row-name">
                      <span>{player.name}</span>
                      {state.matchWinnerIds?.includes(player.id) ? <Sparkles size={14} strokeWidth={2.2} aria-hidden="true" /> : null}
                    </span>
                    <span className="token-row-value">
                      <Coins size={14} strokeWidth={2.1} aria-hidden="true" />
                      {player.tokens}
                    </span>
                  </div>
                ))}
              </div>

              <p className="muted-text" style={{ marginTop: "24px" }}>
                Start a fresh game when you want to play another full match.
              </p>

              <div className="round-actions" style={{ display: "flex", gap: "16px", marginTop: "24px", justifyContent: "center", flexWrap: "wrap" }}>
                <button type="button" className="primary-button" onClick={onBackToGames}>
                  Start New Game
                </button>
                <button type="button" className="danger-button" onClick={onLeaveRoom}>
                  Leave Room
                </button>
              </div>
            </div>
          ) : (
            <>
              {statusMessage && (
                <div className={`game-panel status-banner-panel is-${statusTone}`}>
                  <p className={`status-banner-text is-${statusTone}`}>{statusMessage}</p>
                </div>
              )}
              <div className="game-panel player-area">
                {playStage === "select_card" ? (
                  <div className="focus-hand-area">
                    <div className="player-area-header">
                      <h3>{isMyTurn ? "Your Turn - Select a Card" : "Your Hand"}</h3>
                    </div>
                    <div className="hand-cards-large">
                      {self?.hand?.map((card) => (
                        <div className="hand-card-wrapper" key={card.instanceId}>
                          <CardView
                            card={card}
                            selectable={isMyTurn}
                            selected={card.instanceId === selectedInstanceId}
                            onClick={isMyTurn ? () => onSelectCard(card.instanceId) : undefined}
                            spotlight={card.instanceId === selectedInstanceId}
                          />
                          {card.instanceId === selectedInstanceId && isMyTurn && (
                            <button type="button" className="primary-button inline-play-btn" onClick={handleInitiatePlay}>
                              Play Card
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="focus-action-area">
                    <div className="step-2-header">
                      <button type="button" className="secondary-button button-content" onClick={() => setPlayStage("select_card")}>
                        <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />
                        Back to Hand
                      </button>
                      <h3>You are playing: {selectedCardDef?.name ?? "a card"}</h3>
                    </div>
                    
                    <div className="play-stage-horizontal">
                      <div className={`stage-card-slot ${!selectedCard ? "is-empty" : ""}`}>
                        {selectedCard ? <CardView card={selectedCard} spotlight /> : <div className="empty-slot">Waiting for table update...</div>}
                      </div>

                      <div className="stage-actions">
                        {mustPlayCountess && (
                          <p className="error-text">
                            You are holding Countess, so the rules force you to play Countess instead of Prince or King.
                          </p>
                        )}

                        {forcedTargetPlayerId ? (
                          <p className="muted-text">
                            Sycophant is active: the next targeting effect must include {playerNameById(state, forcedTargetPlayerId)}.
                          </p>
                        ) : null}

                        {targetNeeded && (
                          <div className="selection-group">
                            <label className="dark-label">
                              {multiTargetNeeded ? "1. Choose Target Players" : "1. Choose a Target"}
                            </label>
                            {targetHintText && <p className="muted-text">{targetHintText}</p>}
                            <div className="selection-grid">
                              {targetOptions.map(({ player, selectable, protectedByHandmaid }) => (
                                <button 
                                  key={player.id} 
                                  type="button"
                                  className={`grid-btn ${selectedTargetPlayerIds.includes(player.id) ? "selected" : ""} ${!selectable ? "is-disabled" : ""}`}
                                  onClick={() => selectable && handleTargetToggle(player.id)}
                                  disabled={!selectable}
                                  title={protectedByHandmaid ? `${player.name} is protected by Handmaid.` : undefined}
                                >
                                  <span>{player.id === self?.id ? `${player.name} (You)` : player.name}</span>
                                  {protectedByHandmaid && <span className="grid-btn-note">Protected</span>}
                                  {forcedTargetPlayerId === player.id && <span className="grid-btn-note">Required</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {guessNeeded && hasSelectableTarget && (
                          <div className="selection-group">
                            <label className="dark-label">2. Guess their Card</label>
                            <div className="selection-grid">
                              {guessValues.map((val) => (
                                <button
                                  key={val}
                                  type="button"
                                  className={`grid-btn ${guessedValue === val.toString() ? "selected" : ""}`}
                                  onClick={() => onGuessedValueChange(val.toString())}
                                >
                                  <span className="guess-val">{val}</span>
                                  <span className="guess-name">{cardNamesByValue(val, state.mode).join(" / ")}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {cardId === "cardinal" && selectedTargetPlayerIds.length === 2 ? (
                          <div className="selection-group">
                            <label className="dark-label">3. Optional Peek After Swap</label>
                            <div className="selection-grid">
                              {selectedTargetPlayerIds.map((id) => (
                                <button
                                  key={id}
                                  type="button"
                                  className={`grid-btn ${peekPlayerId === id ? "selected" : ""}`}
                                  onClick={() => onPeekPlayerChange(peekPlayerId === id ? "" : id)}
                                >
                                  <span>{playerNameById(state, id)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          className="primary-button play-btn"
                          disabled={
                            !isMyTurn ||
                            !selectedCard ||
                            mustPlayCountess ||
                            (targetNeeded && !isTargetSelectionValid && !canPlayWithoutTarget) ||
                            (guessNeeded && hasSelectableTarget && !guessedValue)
                          }
                          onClick={handleConfirmPlay}
                        >
                          Confirm & Play
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="game-panel board-area live-board-area">
                <div className="board-header">
                  <h3>Round Table</h3>
                  <div className="deck-info">Deck: {state.round?.deckCount ?? 0} cards remaining</div>
                </div>
                
                <div className="table-grid">
                  {state.players?.map((player) => (
                    <div key={player.id} className={`table-zone ${player.id === state.selfPlayerId ? "is-self-zone" : ""}`}>
                      <div className="zone-nameplate">
                        {player.name} {player.id === state.selfPlayerId && "(You)"}
                        <span className="token-count">
                          <Coins size={14} strokeWidth={2.1} aria-hidden="true" />
                          {player.tokens || 0}
                        </span>
                      </div>
                      
                      {(!player.discardPile || player.discardPile.length === 0) ? (
                         <span className="muted-text" style={{fontSize: '0.85rem'}}>No discards</span>
                      ) : (
                        <div className="discard-fan">
                          {player.discardPile?.map((card, index) => (
                            <div className="fan-card" key={card.instanceId} style={{ zIndex: index }}>
                              <CardView card={card} mini />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="board-meta-row">
                  <div className="board-meta-card board-meta-card-burned">
                    <span className="board-meta-eyebrow">Burned Setup Cards</span>
                    {(state.round?.visibleRemovedCards?.length ?? 0) > 0 ? (
                      <div className="discard-spread discard-spread-tight">
                        {state.round?.visibleRemovedCards?.map((card) => (
                          <CardView key={card.instanceId} card={card} mini />
                        ))}
                      </div>
                    ) : (
                      <p>No face-up setup cards were removed this round.</p>
                    )}
                  </div>
                  <div className="board-meta-card">
                    <span className="board-meta-eyebrow">Discard Reading Tip</span>
                    <p>Public discards stay visible so everyone can track what has already been played.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="table-sidebar table-right-sidebar">
          <section className="game-panel activity-panel">
            <h3>Activity Log</h3>
            <ActivityFeed events={state.log || []} state={state} />
          </section>
        </aside>

      </div>
      <LoveLetterInfoDrawer
        buttonClassName="info-trigger-button room-floating-info-button"
        buttonLabel={
          <>
            <Info size={18} strokeWidth={2.3} aria-hidden="true" />
            <span className="room-floating-info-label">Guide</span>
          </>
        }
        buttonTitle="Open Love Letter rules and card guide"
        mode={state.mode}
      />
    </main>
  );
}
