import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
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
import type { CardID, GameEvent, LoveLetterMode, PlayerViewState, PrivateEffectPresentation } from "@game-site/shared";

import { HistoryEventRow, HistoryTape, shouldShowActivityEvent } from "../components/HistoryTape.js";
import { CardInfoPopup } from "../components/CardInfoPopup.js";
import { CardView } from "../components/CardView.js";
import { LoveLetterInfoDrawer } from "../components/LoveLetterInfoDrawer.js";
import { RoomChat } from "../components/RoomChat.js";
import type { RoomChatMessage } from "../app/App.js";
import { playerNameById } from "../lib/gamePresentation.js";
import { Particles } from "../components/Particles.js";
import { RoomTopBar } from "../components/RoomTopBar.js";
import { PlayerSeat } from "../components/PlayerSeat.js";
import { ActionStage } from "../components/ActionStage.js";
import type { PlayFlowState } from "../components/ActionStage.js";
import { FloatingCardLayer } from "../components/FloatingCardLayer.js";
import type { FlyingCardAnimation } from "../components/FloatingCardLayer.js";
import { MOTION } from "../lib/animationConstants.js";
import { useCardZoneRegistry } from "../lib/useCardZoneRegistry.js";

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
  onAddBot: () => Promise<boolean>;
  onAddSmartBot: () => Promise<boolean>;
  onAddHardBot: () => Promise<boolean>;
  onStartRound: () => void;
  onReturnToLobby: () => void;
  onPlayCard: (instanceIdOverride?: string) => Promise<boolean>;
  onDismissEffect: () => void;
  onCardinalPeek: (targetPlayerId: string) => Promise<boolean>;
  chatMessages: RoomChatMessage[];
  onSendChatMessage: (text: string) => Promise<boolean>;
  onBecomeSpectator: () => Promise<boolean>;
  onBecomePlayer: () => Promise<boolean>;
  onLeaveRoom: () => void;
};

type LogAnnouncement = {
  key: string;
  event: GameEvent;
};

const LOG_ANNOUNCEMENT_HOLD_MS = 1800;
const LOG_ANNOUNCEMENT_EXIT_MS = 550;

function cardNeedsGuessSelection(cardId: CardID | null): boolean {
  return cardId === "guard" || cardId === "bishop";
}

function cardNeedsSingleTargetSelection(cardId: CardID | null): boolean {
  return [
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
}

function cardNeedsMultiTargetSelection(cardId: CardID | null): boolean {
  return cardId === "baroness" || cardId === "cardinal";
}

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
  onAddBot,
  onAddSmartBot,
  onAddHardBot,
  onStartRound,
  onReturnToLobby,
  onPlayCard,
  onDismissEffect,
  onCardinalPeek,
  chatMessages,
  onSendChatMessage,
  onBecomeSpectator,
  onBecomePlayer,
  onLeaveRoom,
}: RoomPageProps) {
  const [playFlow, setPlayFlow] = React.useState<PlayFlowState>({ step: "idle" });
  const [flyingCards, setFlyingCards] = React.useState<FlyingCardAnimation[]>([]);
  const { registerZone, getZoneRect } = useCardZoneRegistry();
  const [copied, setCopied] = React.useState(false); // Copy button state
  const [infoCardId, setInfoCardId] = React.useState<CardID | null>(null);
  const [announcementQueue, setAnnouncementQueue] = React.useState<LogAnnouncement[]>([]);
  const [activeAnnouncement, setActiveAnnouncement] = React.useState<LogAnnouncement | null>(null);
  const [announcementPhase, setAnnouncementPhase] = React.useState<"enter" | "exit">("enter");
  const processedLogCountRef = React.useRef(state.log.length);
  const processedAnimationLogCountRef = React.useRef(state.log.length);

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
  const guessNeeded = cardNeedsGuessSelection(cardId);
  const singleTargetNeeded = cardNeedsSingleTargetSelection(cardId);
  const multiTargetNeeded = cardNeedsMultiTargetSelection(cardId);
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

  const buildLegalTargetSets = React.useCallback((nextCardId: CardID | null) => {
    if (!self || !nextCardId || !state.players) return [];

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

    switch (nextCardId) {
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

    if (forcedTargetPlayerId && nextCardId !== "sycophant") {
      sets = sets.filter((targetSet) => targetSet.includes(forcedTargetPlayerId));
    }

    return sets;
  }, [forcedTargetPlayerId, self, state.players]);

  const legalTargetSets = React.useMemo(
    () => buildLegalTargetSets(cardId),
    [buildLegalTargetSets, cardId],
  );

  const selectableTargetIds = React.useMemo(
    () => [...new Set(legalTargetSets.flat())],
    [legalTargetSets],
  );
  const isTargetSelectionValid = React.useMemo(
    () => legalTargetSets.some((targetSet) => sameTargetSet(targetSet, selectedTargetPlayerIds)),
    [legalTargetSets, sameTargetSet, selectedTargetPlayerIds],
  );
  const isCardinalDecisionPending = Boolean(state.round?.pendingCardinalPeek);

  function cardNeedsSetup(nextCardId: CardID): boolean {
    return [
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
      "baroness",
      "cardinal",
    ].includes(nextCardId);
  }

  React.useEffect(() => {
    if (!isMyTurn || isCardinalDecisionPending) setPlayFlow({ step: "idle" });
  }, [isCardinalDecisionPending, isMyTurn, state.round?.turnNumber, state.phase]);

  React.useEffect(() => {
    processedLogCountRef.current = state.log.length;
    processedAnimationLogCountRef.current = state.log.length;
    setAnnouncementQueue([]);
    setActiveAnnouncement(null);
    setAnnouncementPhase("enter");
    setFlyingCards([]);
  }, [state.roomId]);

  React.useEffect(() => {
    const processedCount = processedLogCountRef.current;
    if (state.log.length < processedCount) {
      processedLogCountRef.current = state.log.length;
      setAnnouncementQueue([]);
      setActiveAnnouncement(null);
      setAnnouncementPhase("enter");
      return;
    }

    if (state.log.length === processedCount) {
      return;
    }

    const appendedEvents = state.log
      .slice(processedCount)
      .map((event, offset) => ({
        key: `${processedCount + offset}-${event.type}`,
        event,
      }))
      .filter(({ event }) => shouldShowActivityEvent(event));

    processedLogCountRef.current = state.log.length;
    setAnnouncementQueue((current) => [...current, ...appendedEvents]);
  }, [state.log]);

  React.useEffect(() => {
    const processedCount = processedAnimationLogCountRef.current;
    if (state.log.length < processedCount) {
      processedAnimationLogCountRef.current = state.log.length;
      setFlyingCards([]);
      return;
    }

    if (state.log.length === processedCount) {
      return;
    }

    const appendedEvents = state.log.slice(processedCount);
    processedAnimationLogCountRef.current = state.log.length;

    const drawAnimations = appendedEvents.reduce<FlyingCardAnimation[]>((animations, event, offset) => {
      if (event.type !== "card_drawn") {
        return animations;
      }

      const fromRect = getZoneRect("deck");
      const toRect = getZoneRect(
        event.playerId === state.selfPlayerId
          ? `player:${event.playerId}:hand`
          : `player:${event.playerId}:area`,
      );

      if (!fromRect || !toRect) {
        return animations;
      }

      const animationId = `draw-${state.roomId}-${processedCount + offset}-${event.playerId}`;
      animations.push({
        id: animationId,
        card: null,
        fromRect,
        toRect,
        faceDown: true,
        duration: MOTION.deal + 280,
        delay: offset * 140,
        onComplete: () => {
          setFlyingCards((current) => current.filter((item) => item.id !== animationId));
        },
      } satisfies FlyingCardAnimation);
      return animations;
    }, []);

    if (drawAnimations.length > 0) {
      setFlyingCards((current) => [...current, ...drawAnimations]);
    }
  }, [getZoneRect, state.log, state.roomId, state.selfPlayerId]);

  React.useEffect(() => {
    if (activeAnnouncement || announcementQueue.length === 0) {
      return;
    }

    setActiveAnnouncement(announcementQueue[0] ?? null);
    setAnnouncementQueue((current) => current.slice(1));
    setAnnouncementPhase("enter");
  }, [activeAnnouncement, announcementQueue]);

  React.useEffect(() => {
    if (!activeAnnouncement) return;

    const exitTimeout = window.setTimeout(() => {
      setAnnouncementPhase("exit");
    }, LOG_ANNOUNCEMENT_HOLD_MS);

    const completeTimeout = window.setTimeout(() => {
      setActiveAnnouncement(null);
      setAnnouncementPhase("enter");
    }, LOG_ANNOUNCEMENT_HOLD_MS + LOG_ANNOUNCEMENT_EXIT_MS);

    return () => {
      window.clearTimeout(exitTimeout);
      window.clearTimeout(completeTimeout);
    };
  }, [activeAnnouncement]);

  const handleConfirmPlay = async () => {
    const didPlay = await onPlayCard();
    if (didPlay) {
      setPlayFlow({ step: "idle" });
    }
  };

  const handleBackToHand = () => {
    onSelectCard(null);
    onTargetPlayerIdsChange([]);
    onGuessedValueChange("");
    setPlayFlow({ step: "idle" });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(state.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openCardInfo = React.useCallback((cardId: CardID) => {
    setInfoCardId(cardId);
  }, []);

  const handleCardDiscardIntent = async (instanceId: string) => {
    const handCard = self?.hand.find((card) => card.instanceId === instanceId);
    if (!handCard || !isMyTurn || isCardinalDecisionPending) {
      return;
    }

    onSelectCard(instanceId);
    onTargetPlayerIdsChange([]);

    if (handCard.cardId === "guard") {
      onGuessedValueChange("2");
    } else if (handCard.cardId === "bishop") {
      onGuessedValueChange("0");
    } else {
      onGuessedValueChange("");
    }

    if (cardNeedsSetup(handCard.cardId)) {
      const nextGuessNeeded = cardNeedsGuessSelection(handCard.cardId);
      const nextSingleTargetNeeded = cardNeedsSingleTargetSelection(handCard.cardId);
      const nextMultiTargetNeeded = cardNeedsMultiTargetSelection(handCard.cardId);
      const nextTargetNeeded = nextSingleTargetNeeded || nextMultiTargetNeeded;
      const nextLegalTargetSets = buildLegalTargetSets(handCard.cardId);
      const nextSelectableTargetIds = [...new Set(nextLegalTargetSets.flat())];

      if (nextTargetNeeded) {
        setPlayFlow({
          step: "choosing_target",
          cardInstanceId: instanceId,
          legalTargets: nextSelectableTargetIds,
        });
      } else if (nextGuessNeeded) {
        setPlayFlow({
          step: "choosing_guess",
          cardInstanceId: instanceId,
          targetId: "",
        });
      } else {
        setPlayFlow({
          step: "staging_card",
          cardInstanceId: instanceId,
        });
      }
      return;
    }

    const didPlay = await onPlayCard(instanceId);
    if (didPlay) {
      setPlayFlow({ step: "idle" });
    }
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
  const hasSelectableTarget = legalTargetSets.length > 0;
  const activeOpponentsCount = state.players?.filter((player) => player.id !== self?.id && player.status === "active").length ?? 0;
  const canPlayWithoutTarget = Boolean(
    selectedCardDef &&
    targetNeeded &&
    !hasSelectableTarget,
  );
  const visibleLogEvents = state.log;
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
  const inflightDrawCount = React.useMemo(
    () => flyingCards.filter((animation) => animation.id.startsWith(`draw-${state.roomId}-`)).length,
    [flyingCards, state.roomId],
  );
  const visibleDeckCount = Math.max(0, (state.round?.deckCount ?? 0) - inflightDrawCount);

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

    const selectedTargetStillValid = legalTargetSets.some((targetSet) => sameTargetSet(targetSet, [targetPlayerId]));
    if (targetPlayerId && !selectedTargetStillValid) {
      onTargetPlayerIdsChange([]);
    }
  }, [isTargetSelectionValid, legalTargetSets, multiTargetNeeded, onTargetPlayerIdsChange, sameTargetSet, selectedTargetPlayerIds, targetNeeded, targetPlayerId]);

  const handleTargetToggle = (playerId: string) => {
    const stagedInstanceId = selectedInstanceId ?? "";

    if (!multiTargetNeeded) {
      onTargetPlayerIdsChange([playerId]);
      if (guessNeeded) {
        setPlayFlow({
          step: "choosing_guess",
          cardInstanceId: stagedInstanceId,
          targetId: playerId,
        });
      } else {
        setPlayFlow({
          step: "confirming",
          cardInstanceId: stagedInstanceId,
          targetIds: [playerId],
          guessedValue,
        });
      }
      return;
    }

    if (selectedTargetPlayerIds.includes(playerId)) {
      onTargetPlayerIdsChange(selectedTargetPlayerIds.filter((id) => id !== playerId));
      return;
    }

    const nextIds = [...selectedTargetPlayerIds, playerId];
    const trimmedNextIds = cardId === "cardinal" && nextIds.length > 2 ? nextIds.slice(nextIds.length - 2) : nextIds;
    onTargetPlayerIdsChange(trimmedNextIds);
    if (legalTargetSets.some((targetSet) => sameTargetSet(targetSet, trimmedNextIds))) {
      setPlayFlow({
        step: "confirming",
        cardInstanceId: stagedInstanceId,
        targetIds: trimmedNextIds,
        guessedValue,
      });
    }
  };

  const handleGuessValueChange = React.useCallback((value: string) => {
    onGuessedValueChange(value);
    if (playFlow.step === "choosing_guess" && selectedInstanceId) {
      setPlayFlow({
        step: "confirming",
        cardInstanceId: selectedInstanceId,
        targetIds: selectedTargetPlayerIds,
        guessedValue: value,
      });
    }
  }, [onGuessedValueChange, playFlow.step, selectedInstanceId, selectedTargetPlayerIds]);

  const isSpotlightActive = isMyTurn && targetNeeded;

  return (
    <main className={`table-layout love-letter-room ${isSpotlightActive ? "is-spotlight-active" : ""}`}>
      {activeAnnouncement ? (
        <div className={`table-log-announcement is-${announcementPhase}`} aria-live="polite" aria-atomic="true">
          <HistoryEventRow event={activeAnnouncement.event} state={state} className="log-item-announcement" />
        </div>
      ) : null}
      <Particles active={showBetweenRounds || showMatchOver} type="confetti" count={80} />
      
      <RoomTopBar
        gameTitle={gameTitle}
        state={state}
        isMyTurn={isMyTurn}
        currentTurnName={currentTurnName}
        selfSpectator={selfSpectator}
        copied={copied}
        onCopyCode={handleCopyCode}
        onBecomeSpectator={onBecomeSpectator}
        onBecomePlayer={onBecomePlayer}
        onLeaveRoom={onLeaveRoom}
      />

      <div className="table-workspace">
        <aside className="table-sidebar table-left-sidebar">
          <section className="game-panel activity-panel">
            <h3>Activity Log</h3>
            <HistoryTape events={visibleLogEvents} state={state} />
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

          {showLobby && (
            <section className="game-panel slim-panel">
              <h3>Your Status</h3>
              {selfSpectator ? (
                <p className="muted-text" style={{ marginTop: 0 }}>
                  You are currently watching only. Rejoin as a player if you want to ready up and take turns again.
                </p>
              ) : (
                <button
                  type="button"
                  className={`primary-button full-width ${self?.isReady ? "is-ready-btn" : ""}`}
                  onClick={() => onToggleReady(!self?.isReady)}
                >
                  {self?.isReady ? "Ready to Start!" : "Click when Ready"}
                </button>
              )}
              
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
                    ? "You are watching only. Spectators stay out of ready checks and turn order."
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

        <section className="table-center love-letter-table">
          {showLobby ? (
            <div className="game-panel center-lobby">
              <h2>Waiting for players...</h2>
              <p>
                Need at least 2 players. Every player must be ready to start.
                {state.mode === "premium" ? " Premium is intended for 5 to 8 people." : ""}
                {state.spectators.length > 0 ? " Spectators can watch without being counted as players." : ""}
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
                    <p className="muted-text">You are watching this match and do not need to confirm ready.</p>
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
                          Next Round
                        </span>
                      ) : (
                        `Waiting for players... (${readyCount}/${playerCount})`
                      )}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="game-panel board-area">
                <div className="board-header">
                  <h3>Previous Round Table</h3>
                  <div className="deck-info">Deck: {visibleDeckCount} cards remaining</div>
                </div>

                <div className="table-grid">
                  {state.players?.map((player) => (
                    <div
                      key={player.id}
                      className={`table-zone ${player.status !== "active" ? "is-eliminated-zone" : ""} ${selectableTargetIds.includes(player.id) ? "is-targetable" : ""}`}
                      onClick={() => selectableTargetIds.includes(player.id) && handleTargetToggle(player.id)}
                    >
                      {selectedTargetPlayerIds.includes(player.id) && (
                        <div className="targeting-crosshair">
                          <div className="crosshair-circle"></div>
                          <div className="crosshair-dot"></div>
                        </div>
                      )}
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
                              <CardView card={card} mini selectable onClick={() => openCardInfo(card.cardId)} />
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
                Return to the lobby to reset tokens and keep current spectators in watch-only mode.
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
              
              <div className="opponent-rail">
                {state.players?.filter(p => p.id !== state.selfPlayerId).map(player => (
                  <div key={player.id} className="opponent-seat-wrapper" ref={registerZone(`player:${player.id}:area`)}>
                    <PlayerSeat
                      player={player}
                      state={state}
                      isCurrentTurn={state.round?.currentPlayerId === player.id}
                      isTargetable={selectableTargetIds.includes(player.id)}
                      isProtected={player.id !== self?.id && player.protectedUntilNextTurn}
                      isMarkedBySycophant={forcedTargetPlayerId === player.id}
                      isSelectedTarget={selectedTargetPlayerIds.includes(player.id)}
                      isEliminated={player.status !== "active"}
                      isSelf={false}
                      showReadyPill={showReadyPills}
                      onTarget={() => handleTargetToggle(player.id)}
                    />
                  </div>
                ))}
              </div>

              <ActionStage
                playFlow={playFlow}
                stagedCard={selectedCard}
                selectedTargetPlayerIds={selectedTargetPlayerIds}
                guessedValue={guessedValue}
                guessValues={guessValues}
                mode={state.mode}
                state={state}
                isMyTurn={isMyTurn}
                isCardinalDecisionPending={isCardinalDecisionPending}
                targetHintText={targetHintText}
                mustPlayCountess={mustPlayCountess}
                canPlayWithoutTarget={canPlayWithoutTarget}
                isTargetSelectionValid={isTargetSelectionValid}
                hasSelectableTarget={hasSelectableTarget}
                activeEffectPresentation={activeEffectPresentation}
                playedSlotRef={registerZone("stage:played")}
                revealZoneRef={registerZone("stage:reveal")}
                clashLeftRef={registerZone("stage:clash-left")}
                clashRightRef={registerZone("stage:clash-right")}
                onGuessedValueChange={handleGuessValueChange}
                onConfirmPlay={handleConfirmPlay}
                onCancelPlay={handleBackToHand}
                onDismissEffect={onDismissEffect}
                onCardinalPeek={onCardinalPeek}
              />

              <div className="self-player-rail">
                <div className="rail-deck-zone">
                  <div className="board-header">
                    <h3>Deck</h3>
                    <div className="deck-info">{visibleDeckCount} cards</div>
                  </div>
                  {visibleDeckCount ? (
                    <div className="dynamic-deck-container" ref={registerZone("deck")}>
                      {Array.from({ length: Math.min(visibleDeckCount, 5) }).map((_, i) => (
                        <div key={i} className="deck-card" style={{ transform: `translate(${i * -2}px, ${i * -2}px)` }} />
                      ))}
                    </div>
                  ) : null}
                  <div className="board-meta-card board-meta-card-burned">
                    <span className="board-meta-eyebrow">Burned Cards</span>
                    {(state.round?.visibleRemovedCards?.length ?? 0) > 0 ? (
                      <div className="discard-spread discard-spread-tight">
                        {state.round?.visibleRemovedCards?.map((card) => (
                          <CardView key={card.instanceId} card={card} mini selectable onClick={() => openCardInfo(card.cardId)} />
                        ))}
                      </div>
                    ) : (
                      <p className="muted-text" style={{ fontSize: "0.85rem", marginTop: 4 }}>No face-up setup cards.</p>
                    )}
                  </div>
                </div>

                <div className="rail-hand-zone" ref={registerZone(`player:${state.selfPlayerId}:hand`)}>
                  <div className="player-area-header">
                    <h3>{selfSpectator ? "Spectator View" : isMyTurn ? "Your Turn - Select a Card" : "Your Hand"}</h3>
                  </div>
                  {selfSpectator ? (
                    <p className="muted-text">You can follow the public table, discards, turns, and log. Private hands stay hidden.</p>
                  ) : (
                    <div className="hand-cards-large">
                      <AnimatePresence>
                        {self?.hand?.map((card, index) => (
                          <motion.div
                            className="hand-card-wrapper"
                            key={card.instanceId}
                            layoutId={card.instanceId + "_wrapper"}
                            initial={{ opacity: 0, x: 300, y: -300, scale: 0.2 }}
                            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -50, scale: 0.8 }}
                            transition={{ type: "spring", stiffness: 260, damping: 20, delay: index * 0.1 }}
                          >
                            <CardView
                              card={card}
                              selectable
                              selected={card.instanceId === selectedInstanceId}
                              onClick={() => {
                                if (isMyTurn && !isCardinalDecisionPending) {
                                  void handleCardDiscardIntent(card.instanceId);
                                  return;
                                }

                                openCardInfo(card.cardId);
                              }}
                              spotlight={card.instanceId === selectedInstanceId}
                            />
                            <button
                              type="button"
                              className="hand-card-info-btn"
                              onClick={() => openCardInfo(card.cardId)}
                              aria-label={`Open ${getCardDef(card.cardId)?.name ?? "card"} details`}
                            >
                              <Info size={16} strokeWidth={2.2} aria-hidden="true" />
                            </button>
                            {isMyTurn ? (
                              <button type="button" className="primary-button hand-card-discard-btn" onClick={() => void handleCardDiscardIntent(card.instanceId)}>Play Card</button>
                            ) : null}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                <div className="rail-discard-zone" ref={registerZone(`player:${state.selfPlayerId}:discard`)}>
                   <div className="player-area-header">
                     <h3>Your Discards</h3>
                   </div>
                   {(!self?.discardPile || self.discardPile.length === 0) ? (
                     <span className="muted-text" style={{ fontSize: "0.85rem" }}>No discards yet</span>
                   ) : (
                     <div className="discard-fan">
                       <AnimatePresence>
                         {self?.discardPile?.map((card, index) => (
                           <motion.div className="fan-card" key={card.instanceId} style={{ zIndex: index }}>
                             <CardView card={card} mini selectable onClick={() => openCardInfo(card.cardId)} />
                           </motion.div>
                         ))}
                       </AnimatePresence>
                     </div>
                   )}
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="table-sidebar table-right-sidebar">
          {showLobby && isCreator ? (
            <section className="game-panel slim-panel">
              <h3>Bots</h3>
              <p className="muted-text" style={{ marginTop: 0 }}>
                Add a server-controlled player. Random bots move legally, smart bots use heuristics, and hard bots push those heuristics further.
              </p>
              <button type="button" className="secondary-button full-width" onClick={() => void onAddBot()}>
                Add Random Bot
              </button>
              <button type="button" className="secondary-button full-width mt-2" onClick={() => void onAddSmartBot()}>
                Add Smart Bot
              </button>
              <button type="button" className="secondary-button full-width mt-2" onClick={() => void onAddHardBot()}>
                Add Hard Bot
              </button>
            </section>
          ) : null}
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
      {infoCardId ? <CardInfoPopup cardId={infoCardId} mode={state.mode} onClose={() => setInfoCardId(null)} /> : null}
      
      <FloatingCardLayer animations={flyingCards} />
    </main>
  );
}
