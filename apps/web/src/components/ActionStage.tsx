import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";
import type { CardInstance, LoveLetterMode, PlayerViewState, PrivateEffectPresentation } from "@game-site/shared";
import { getCardDef } from "@game-site/shared";
import { CardView } from "./CardView.js";
import { GuessWheel } from "./GuessWheel.js";
import { playerNameById } from "../lib/gamePresentation.js";

export type PlayFlowState =
  | { step: "idle" }
  | { step: "choosing_card" }
  | { step: "staging_card"; cardInstanceId: string }
  | { step: "choosing_target"; cardInstanceId: string; legalTargets: string[] }
  | { step: "choosing_guess"; cardInstanceId: string; targetId: string }
  | {
      step: "confirming";
      cardInstanceId: string;
      targetIds: string[];
      guessedValue?: string;
    }
  | { step: "resolving" };

type ActionStageProps = {
  playFlow: PlayFlowState;
  stagedCard: CardInstance | null;
  selectedTargetPlayerIds: string[];
  guessedValue: string;
  guessValues: number[];
  mode: LoveLetterMode;
  state: PlayerViewState;
  isMyTurn: boolean;
  isCardinalDecisionPending: boolean;
  targetHintText: string | null;
  mustPlayCountess: boolean;
  canPlayWithoutTarget: boolean;
  isTargetSelectionValid: boolean;
  hasSelectableTarget: boolean;
  activeEffectPresentation: PrivateEffectPresentation | null;
  stageRef?: React.RefCallback<HTMLElement>;
  playedSlotRef?: React.RefCallback<HTMLElement>;
  revealZoneRef?: React.RefCallback<HTMLElement>;
  clashLeftRef?: React.RefCallback<HTMLElement>;
  clashRightRef?: React.RefCallback<HTMLElement>;
  onGuessedValueChange: (val: string) => void;
  onConfirmPlay: () => void;
  onCancelPlay: () => void;
  onDismissEffect: () => void;
  onCardinalPeek: (targetPlayerId: string) => Promise<boolean>;
};

function EffectDisplay({
  effect,
  state,
  onDismiss,
  onCardinalPeek,
}: {
  effect: PrivateEffectPresentation;
  state: PlayerViewState;
  onDismiss: () => void;
  onCardinalPeek: (targetPlayerId: string) => Promise<boolean>;
}) {
  const [dimActive, setDimActive] = React.useState(false);
  const [pendingPeekTargetId, setPendingPeekTargetId] = React.useState<string | null>(null);
  const isSelf = effect.viewerPlayerId === state.selfPlayerId;

  React.useEffect(() => {
    setDimActive(false);
    if (effect.kind === "compare" || effect.kind === "discard_reveal" || effect.kind === "guess") {
      const t = window.setTimeout(() => setDimActive(true), 900);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [effect]);

  const requiresDecision =
    effect.kind === "swap" && effect.requiresDecision === "cardinal_peek_choice";

  return (
    <motion.div
      className="action-stage-effect"
      initial={{ opacity: 0, scale: 0.92, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.88, y: 8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="effect-stage-header">
        <span className="effect-stage-title">{effect.title}</span>
        {effect.kind !== "message" && <p className="effect-stage-desc">{effect.message}</p>}
      </div>

      <div className="effect-stage-body">
        {/* PEEK — private card reveal, only actor sees the actual card */}
        {effect.kind === "peek" && (
          <div className="effect-reveal-zone">
            <div className="effect-reveal-card-col">
              <span className="effect-reveal-label">{effect.targetPlayerName}</span>
              {isSelf && effect.revealedCard ? (
                <motion.div
                  initial={{ rotateY: 90 }}
                  animate={{ rotateY: 0 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                >
                  <CardView card={effect.revealedCard} compact />
                </motion.div>
              ) : (
                <div className="effect-hidden-card-face">
                  <div className="card-view-back-pattern" />
                  <div className="card-view-hidden-crest">⚜️</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MULTI PEEK (Cardinal reveal) */}
        {effect.kind === "multi_peek" && (
          <div className="effect-reveal-zone effect-reveal-zone-multi">
            {effect.seen.map((entry) => (
              <div key={entry.targetPlayerId} className="effect-reveal-card-col">
                <span className="effect-reveal-label">{entry.targetPlayerName}</span>
                {isSelf && entry.revealedCard ? (
                  <motion.div
                    initial={{ rotateY: 90 }}
                    animate={{ rotateY: 0 }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <CardView card={entry.revealedCard} compact />
                  </motion.div>
                ) : (
                  <div className="effect-hidden-card-face">
                    <div className="card-view-back-pattern" />
                    <div className="card-view-hidden-crest">⚜️</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CARDINAL REVEAL — after peek choice */}
        {effect.kind === "cardinal_reveal" && (
          <div className="effect-reveal-zone">
            <div className="effect-reveal-card-col">
              <span className="effect-reveal-label">{effect.chosenPlayerName}</span>
              {isSelf && effect.revealedCard ? (
                <motion.div
                  initial={{ rotateY: 90 }}
                  animate={{ rotateY: 0 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                >
                  <CardView card={effect.revealedCard} compact />
                </motion.div>
              ) : (
                <div className="effect-hidden-card-face">
                  <div className="card-view-back-pattern" />
                  <div className="card-view-hidden-crest">⚜️</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMPARE (Baron / Dowager) */}
        {effect.kind === "compare" && (
          <>
            <div className="effect-clash-zone">
              <div className={`effect-clash-side ${dimActive && effect.losingPlayerId === effect.selfPlayerId ? "is-loser" : ""}`}>
                <span className="effect-reveal-label">{effect.selfPlayerName}</span>
                {effect.selfCard ? <CardView card={effect.selfCard} compact /> : <div className="effect-hidden-card-face"><div className="card-view-back-pattern" /><div className="card-view-hidden-crest">⚜️</div></div>}
              </div>
              <div className="effect-clash-vs">⚔</div>
              <div className={`effect-clash-side ${dimActive && effect.losingPlayerId === effect.opposingPlayerId ? "is-loser" : ""}`}>
                <span className="effect-reveal-label">{effect.opposingPlayerName}</span>
                {effect.opposingCard ? <CardView card={effect.opposingCard} compact /> : <div className="effect-hidden-card-face"><div className="card-view-back-pattern" /><div className="card-view-hidden-crest">⚜️</div></div>}
              </div>
            </div>
            <div className="effect-outcome-text">
              {effect.winningPlayerId === null
                ? "Tie — no elimination."
                : effect.losingPlayerId === effect.selfPlayerId
                  ? "You lost the comparison."
                  : effect.winningPlayerId === effect.selfPlayerId
                    ? "You won the comparison!"
                    : `${effect.opposingPlayerName} won.`}
            </div>
          </>
        )}

        {/* SWAP (King / Cardinal) */}
        {effect.kind === "swap" && (
          <>
            <div className="effect-swap-zone">
              <div className="effect-swap-player">
                <span className="effect-reveal-label">{effect.players[0].playerName}</span>
                <div className="effect-swap-stack">
                  {Array.from({ length: effect.players[0].cardCount }).map((_, i) => (
                    <div key={i} className="effect-hidden-card-face effect-hidden-card-small">
                      <div className="card-view-back-pattern" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="effect-swap-arrows">⇄</div>
              <div className="effect-swap-player">
                <span className="effect-reveal-label">{effect.players[1].playerName}</span>
                <div className="effect-swap-stack">
                  {Array.from({ length: effect.players[1].cardCount }).map((_, i) => (
                    <div key={i} className="effect-hidden-card-face effect-hidden-card-small">
                      <div className="card-view-back-pattern" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {requiresDecision && effect.peekChoices && (
              <div className="effect-cardinal-choice">
                <span className="effect-reveal-label">Peek at a swapped hand:</span>
                <div className="effect-cardinal-buttons">
                  {effect.peekChoices.map((choice) => (
                    <button
                      key={choice.playerId}
                      type="button"
                      className="primary-button"
                      disabled={pendingPeekTargetId !== null}
                      onClick={async () => {
                        setPendingPeekTargetId(choice.playerId);
                        const ok = await onCardinalPeek(choice.playerId);
                        if (!ok) setPendingPeekTargetId(null);
                      }}
                    >
                      {pendingPeekTargetId === choice.playerId ? "Loading…" : choice.playerName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* DISCARD REVEAL (Prince) */}
        {effect.kind === "discard_reveal" && (
          <>
            <div className="effect-reveal-zone">
              <div className={`effect-reveal-card-col ${dimActive ? "is-loser" : ""}`}>
                <span className="effect-reveal-label">{effect.targetPlayerName}'s discarded card</span>
                {effect.discardedCard ? (
                  <motion.div
                    initial={{ rotateY: 90 }}
                    animate={{ rotateY: 0 }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <CardView card={effect.discardedCard} compact />
                  </motion.div>
                ) : (
                  <div className="effect-hidden-card-face"><div className="card-view-back-pattern" /></div>
                )}
              </div>
            </div>
            <div className="effect-outcome-text">
              {effect.causedElimination
                ? `${effect.targetPlayerName} was eliminated.`
                : effect.drewReplacement
                  ? `${effect.targetPlayerName} drew a replacement.`
                  : `${effect.targetPlayerName} had no replacement to draw.`}
            </div>
          </>
        )}

        {/* GUESS (Guard / Bishop) */}
        {effect.kind === "guess" && (
          <>
            <div className={`effect-guess-zone ${dimActive && effect.outcome === "correct" ? "is-hit" : ""} ${dimActive && effect.outcome === "wrong" ? "is-miss" : ""}`}>
              <div className="effect-guess-played">
                <span className="effect-reveal-label">{effect.guessMode === "guard" ? "Guard" : "Bishop"} → value {effect.guessedValue}</span>
              </div>
              {effect.revealedCards.length > 0 && (
                <div className="effect-reveal-card-col">
                  <span className="effect-reveal-label">{effect.targetPlayerName}</span>
                  <motion.div
                    initial={{ rotateY: 90 }}
                    animate={{ rotateY: 0 }}
                    transition={{ duration: 0.55, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <CardView card={effect.revealedCards[0]!} compact />
                  </motion.div>
                </div>
              )}
            </div>
            <div className={`effect-outcome-text ${effect.outcome === "correct" ? "is-success" : effect.outcome === "wrong" ? "is-miss" : ""}`}>
              {effect.outcomeMessage}
            </div>
          </>
        )}

        {/* MESSAGE */}
        {effect.kind === "message" && (
          <p className="effect-message-text">{effect.message}</p>
        )}
      </div>

      {!requiresDecision && (
        <div className="effect-stage-footer">
          <button type="button" className="primary-button" onClick={onDismiss}>
            Continue
          </button>
        </div>
      )}
    </motion.div>
  );
}

export function ActionStage({
  playFlow,
  stagedCard,
  selectedTargetPlayerIds,
  guessedValue,
  guessValues,
  mode,
  state,
  isMyTurn,
  isCardinalDecisionPending,
  targetHintText,
  mustPlayCountess,
  canPlayWithoutTarget,
  isTargetSelectionValid,
  hasSelectableTarget,
  activeEffectPresentation,
  stageRef,
  playedSlotRef,
  revealZoneRef,
  clashLeftRef,
  clashRightRef,
  onGuessedValueChange,
  onConfirmPlay,
  onCancelPlay,
  onDismissEffect,
  onCardinalPeek,
}: ActionStageProps) {
  const cardDef = stagedCard ? getCardDef(stagedCard.cardId) : null;
  const needsGuess = cardDef?.id === "guard" || cardDef?.id === "bishop";
  const targetName =
    selectedTargetPlayerIds.length === 1
      ? playerNameById(state, selectedTargetPlayerIds[0]!)
      : selectedTargetPlayerIds.length > 1
        ? selectedTargetPlayerIds.map((id) => playerNameById(state, id)).join(" & ")
        : null;

  const confirmSummary = cardDef
    ? `Play ${cardDef.name}${targetName ? ` on ${targetName}` : ""}${needsGuess && guessedValue ? ` guessing value ${guessedValue}` : ""}?`
    : null;
  const showGuessPanel =
    (playFlow.step === "choosing_guess" || playFlow.step === "confirming") &&
    guessValues.length > 0 &&
    hasSelectableTarget;
  const targetPrompt =
    playFlow.step === "choosing_target"
      ? needsGuess
        ? "Select a player by clicking their seat."
        : "Select a player by clicking their seat."
      : showGuessPanel
        ? "Now choose a number on the right."
        : null;

  const canConfirm =
    isMyTurn &&
    !isCardinalDecisionPending &&
    stagedCard &&
    !mustPlayCountess &&
    (isTargetSelectionValid || canPlayWithoutTarget) &&
    (guessValues.length === 0 || !hasSelectableTarget || !!guessedValue);

  return (
    <div className="action-stage" ref={stageRef as React.RefCallback<HTMLDivElement>}>
      <AnimatePresence mode="wait">
        {/* EFFECT DISPLAY — highest priority */}
        {activeEffectPresentation && (
          <EffectDisplay
            key={`effect-${activeEffectPresentation.effectId}`}
            effect={activeEffectPresentation}
            state={state}
            onDismiss={onDismissEffect}
            onCardinalPeek={onCardinalPeek}
          />
        )}

        {/* IDLE / WAITING */}
        {!activeEffectPresentation && playFlow.step === "idle" && (
          <motion.div
            key="idle"
            className="action-stage-idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="action-stage-empty-hint">
              {isMyTurn ? "Select a card from your hand to play" : "Waiting for turn…"}
            </div>
          </motion.div>
        )}

        {/* CARD STAGED + CHOOSING TARGET */}
        {!activeEffectPresentation &&
          (playFlow.step === "staging_card" ||
            playFlow.step === "choosing_target" ||
            playFlow.step === "choosing_guess" ||
            playFlow.step === "confirming") && (
            <motion.div
              key="staging"
              className="action-stage-active"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Back button */}
              <button
                type="button"
                className="action-stage-back-btn"
                onClick={onCancelPlay}
              >
                <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" />
                Back
              </button>

              <div className={`action-stage-flow-layout ${showGuessPanel ? "has-guess-panel" : ""}`}>
                <div className="action-stage-card-area">
                  <div
                    className={`action-stage-played-slot ${!stagedCard ? "is-empty" : ""}`}
                    ref={playedSlotRef as React.RefCallback<HTMLDivElement>}
                  >
                    {stagedCard && (
                      <CardView
                        card={stagedCard}
                        spotlight
                        selectable={false}
                      />
                    )}
                  </div>

                  {(mustPlayCountess || targetHintText) && (
                    <div className="action-stage-card-name">
                      {mustPlayCountess && (
                        <p className="action-stage-error">
                          You must play Countess — you're holding Prince or King.
                        </p>
                      )}
                      {targetHintText && (
                        <p className="action-stage-hint">{targetHintText}</p>
                      )}
                    </div>
                  )}

                  {targetPrompt && (
                    <motion.div
                      className="action-stage-prompt"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: 0.1 }}
                    >
                      {targetPrompt}
                    </motion.div>
                  )}
                </div>

                {showGuessPanel && (
                  <motion.div
                    className="action-stage-side-panel"
                    ref={revealZoneRef as React.RefCallback<HTMLDivElement>}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="action-stage-side-title">Choose a value</div>
                    <div className="action-stage-guess-area">
                      <GuessWheel
                        values={guessValues}
                        selectedValue={guessedValue}
                        onSelect={onGuessedValueChange}
                        mode={mode}
                      />
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Confirm prompt */}
              {playFlow.step === "confirming" && (
                <motion.div
                  className="action-stage-confirm"
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  {confirmSummary && (
                    <p className="action-stage-confirm-text">{confirmSummary}</p>
                  )}
                  <div className="action-stage-confirm-buttons">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={onCancelPlay}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={!canConfirm}
                      onClick={onConfirmPlay}
                    >
                      Play
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Direct play (no target needed) */}
              {playFlow.step === "staging_card" && canPlayWithoutTarget && (
                <motion.div
                  className="action-stage-confirm"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.15 }}
                >
                  {targetHintText && (
                    <p className="action-stage-hint">{targetHintText}</p>
                  )}
                  <div className="action-stage-confirm-buttons">
                    <button type="button" className="secondary-button" onClick={onCancelPlay}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={onConfirmPlay}
                      disabled={mustPlayCountess}
                    >
                      Play Without Effect
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Simple card (no target or guess needed) — confirm immediately */}
              {playFlow.step === "staging_card" &&
                guessValues.length === 0 &&
                !canPlayWithoutTarget &&
                selectedTargetPlayerIds.length === 0 && (
                  <motion.div
                    className="action-stage-confirm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.15 }}
                  >
                    <div className="action-stage-confirm-buttons">
                      <button type="button" className="secondary-button" onClick={onCancelPlay}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={onConfirmPlay}
                        disabled={mustPlayCountess || !isMyTurn || isCardinalDecisionPending}
                      >
                        Confirm Play
                      </button>
                    </div>
                  </motion.div>
                )}
            </motion.div>
          )}

        {/* RESOLVING */}
        {!activeEffectPresentation && playFlow.step === "resolving" && (
          <motion.div
            key="resolving"
            className="action-stage-resolving"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="action-stage-spinner" />
            <span>Resolving…</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
