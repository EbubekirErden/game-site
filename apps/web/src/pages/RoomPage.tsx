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
  Swords,
  Trophy,
} from "lucide-react";

import { getCardDef } from "@game-site/shared";
import type { LoveLetterMode, PlayerViewState, PrivateEffectPresentation } from "@game-site/shared";

import { ActivityFeed } from "../components/ActivityFeed.js";
import { CardView } from "../components/CardView.js";
import { DiscardResolutionOverlay } from "../components/DiscardResolutionOverlay.js";
import { LoveLetterInfoDrawer } from "../components/LoveLetterInfoDrawer.js";
import { RoomChat } from "../components/RoomChat.js";
import type { RoomChatMessage } from "../app/App.js";
import { cardNamesByValue, playerNameById } from "../lib/gamePresentation.js";

type RoomPageProps = {
  state: PlayerViewState;
  gameTitle: string;
  message: string;
  activeEffectPresentation: PrivateEffectPresentation | null;
  selectedInstanceId: string | null;
  selectedTargetPlayerIds: string[];
  guessedValue: string;
  onSelectCard: (instanceId: string | null) => void;
  onTargetPlayerIdsChange: (playerIds: string[]) => void;
  onGuessedValueChange: (value: string) => void;
  onToggleReady: (isReady: boolean) => void;
  onSetMode: (mode: LoveLetterMode) => void;
  onStartRound: () => void;
  onReturnToLobby: () => void;
  onPlayCard: () => Promise<boolean>;
  onDismissEffect: () => void;
  onCardinalPeek: (targetPlayerId: string) => Promise<boolean>;
  chatMessages: RoomChatMessage[];
  onSendChatMessage: (text: string) => Promise<boolean>;
  onLeaveRoom: () => void;
};

export function RoomPage({
  state,
  gameTitle,
  message,
  activeEffectPresentation,
  selectedInstanceId,
  selectedTargetPlayerIds,
  guessedValue,
  onSelectCard,
  onTargetPlayerIdsChange,
  onGuessedValueChange,
  onToggleReady,
  onSetMode,
  onStartRound,
  onReturnToLobby,
  onPlayCard,
  onDismissEffect,
  onCardinalPeek,
  chatMessages,
  onSendChatMessage,
  onLeaveRoom,
}: RoomPageProps) {
  const [playStage, setPlayStage] = React.useState<"select_card" | "setup_action">("select_card");
  const [copied, setCopied] = React.useState(false); // Copy button state

  const self = state.players?.find((player) => player.id === state.selfPlayerId) ?? null;
  const selfSpectator = state.selfRole === "spectator";
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
  const statusTone = statusMessage.startsWith("Discarded ")
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
    "handmaid",
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
      case "handmaid":
      case "king":
      case "dowager_queen":
      case "jester":
        sets = cardId === "handmaid" ? [[self.id]] : targetableOthers.map((id) => [id]);
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
  const isCardinalDecisionPending = Boolean(state.round?.pendingCardinalPeek);

  React.useEffect(() => {
    if (!isMyTurn || isCardinalDecisionPending) setPlayStage("select_card");
  }, [isCardinalDecisionPending, isMyTurn, state.round?.turnNumber, state.phase]);

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

  const jesterTargetedPlayerIds = React.useMemo(
    () => new Set((state.round?.jesterAssignments ?? []).map((assignment) => assignment.targetPlayerId)),
    [state.round?.jesterAssignments],
  );
  const selfReminderCards = React.useMemo(
    () =>
      (self?.discardPile ?? [])
        .map((card) => card.cardId)
        .filter((cardId): cardId is "count" | "constable" => cardId === "count" || cardId === "constable"),
    [self?.discardPile],
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
      if (selectedTargetPlayerIds.length === 0 && legalTargetSets.length === 1) {
        onTargetPlayerIdsChange(legalTargetSets[0]!);
        return;
      }
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
          {selfSpectator ? <span className="phase-badge spectator-badge">Spectator</span> : null}
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
                        <span className="status-inline">
                          <Swords size={12} strokeWidth={2.1} aria-hidden="true" />
                          Marked
                        </span>
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

          {state.spectators.length > 0 && (
            <section className="game-panel slim-panel">
              <h3>Spectators</h3>
              <div className="player-list-slim">
                {state.spectators.map((spectator) => (
                  <div key={spectator.id} className={`player-row is-spectator ${spectator.id === state.selfPlayerId ? "is-self" : ""}`}>
                    <div className="player-row-info">
                      <strong className="player-name-row">
                        <span>{spectator.name}</span>
                      </strong>
                      <span className="player-status-text">
                        <span className="status-inline">watching</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showLobby && !selfSpectator && (
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

          {showLobby && (
            <section className="game-panel slim-panel">
              <h3>Room Mode</h3>
              <p className="muted-text" style={{ marginTop: 0 }}>
                {isCreator
                  ? "Choose the deck for this room before starting the round."
                  : selfSpectator
                    ? "You can watch this match and will join the next lobby as a player."
                  : `${playerNameById(state, state.creatorId)} can change the mode before the round starts.`}
              </p>
              <div className="mode-picker-options">
                <button
                  type="button"
                  className={`mode-pill ${state.mode === "classic" ? "is-selected" : ""}`}
                  onClick={() => onSetMode("classic")}
                  disabled={!isCreator}
                >
                  Classic (2-4 people)
                </button>
                <button
                  type="button"
                  className={`mode-pill ${state.mode === "premium" ? "is-selected" : ""}`}
                  onClick={() => onSetMode("premium")}
                  disabled={!isCreator}
                >
                  Extended (5-8 people)
                </button>
              </div>
            </section>
          )}

          {!showLobby && selfReminderCards.includes("constable") && (
            <section className="game-panel effect-reminder-panel">
              <h3>Constable</h3>
              <p>If you are eliminated while Constable stays in your discard pile, you gain a token.</p>
            </section>
          )}

          {!showLobby && selfReminderCards.includes("count") && (
            <section className="game-panel effect-reminder-panel">
              <h3>Count</h3>
              <p>If you reach round end, each Count in your discard pile adds to your final hand strength.</p>
            </section>
          )}

          {!showLobby && state.round?.jesterAssignments.some((assignment) => assignment.playerId === state.selfPlayerId) && (
            <section className="game-panel effect-reminder-panel">
              <h3>Jester</h3>
              <p>If your chosen player wins this round, you gain a token too.</p>
            </section>
          )}
        </aside>

        <section className="table-center">
          {showLobby ? (
            <div className="game-panel center-lobby">
              <h2>Waiting for players...</h2>
              <p>
                Need at least 2 players. Every player must be ready to start.
                {state.mode === "premium" ? " Premium is intended for 5 to 8 people." : ""}
                {state.spectators.length > 0 ? " Spectators will become players after a finished match returns here." : ""}
              </p>
              <div className="lobby-stats">
                <div className="stat-box"><strong>{playerCount}</strong> <span>Players</span></div>
                <div className="stat-box"><strong>{readyCount}</strong> <span>Ready</span></div>
                {state.spectators.length > 0 ? <div className="stat-box"><strong>{state.spectators.length}</strong> <span>Watching</span></div> : null}
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
                  {selfSpectator ? (
                    <p className="muted-text">You are watching this match and can join when the host returns the room to lobby.</p>
                  ) : (
                    <button
                      type="button"
                      className={`primary-button ${self?.isReady ? "is-ready-btn" : ""}`}
                      onClick={() => onToggleReady(!self?.isReady)}
                      style={{ width: "220px" }}
                    >
                      {self?.isReady ? "Ready Confirmed" : "Confirm Ready"}
                    </button>
                  )}
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
                Return to the lobby to reset tokens, let players leave safely, and bring current spectators into the next game.
              </p>

              <div className="round-actions" style={{ display: "flex", gap: "16px", marginTop: "24px", justifyContent: "center", flexWrap: "wrap" }}>
                {isCreator ? (
                  <button type="button" className="primary-button" onClick={onReturnToLobby}>
                    Return to Lobby
                  </button>
                ) : (
                  <p className="muted-text">Host can return this room to the lobby.</p>
                )}
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
                      <h3>{selfSpectator ? "Spectator View" : isMyTurn ? "Your Turn - Select a Card" : "Your Hand"}</h3>
                    </div>
                    {selfSpectator ? (
                      <p className="muted-text">You can follow the public table, discards, turns, and log. Private hands stay hidden.</p>
                    ) : (
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
                              Discard
                            </button>
                          )}
                        </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="focus-action-area">
                    <div className="step-2-header">
                      <button type="button" className="secondary-button button-content" onClick={() => setPlayStage("select_card")}>
                        <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />
                        Back to Hand
                      </button>
                      <h3>You are discarding: {selectedCardDef?.name ?? "a card"}</h3>
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
                            {cardId === "cardinal" ? (
                              <p className="muted-text">Cardinal needs exactly 2 players, and you may include yourself.</p>
                            ) : null}
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

                        <button
                          type="button"
                          className="primary-button play-btn"
                          disabled={
                            !isMyTurn ||
                            isCardinalDecisionPending ||
                            !selectedCard ||
                            mustPlayCountess ||
                            (targetNeeded && !isTargetSelectionValid && !canPlayWithoutTarget) ||
                            (guessNeeded && hasSelectableTarget && !guessedValue)
                          }
                          onClick={handleConfirmPlay}
                        >
                          Confirm Discard
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
          <RoomChat messages={chatMessages} state={state} onSendMessage={onSendChatMessage} />
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
      {activeEffectPresentation ? (
        <DiscardResolutionOverlay
          effect={activeEffectPresentation}
          onDismiss={onDismissEffect}
          onCardinalPeek={onCardinalPeek}
        />
      ) : null}
    </main>
  );
}
