import React from "react";

import type { CardID, PrivateEffectPresentation } from "@game-site/shared";

import { CardView } from "./CardView.js";

type DiscardResolutionOverlayProps = {
  effect: PrivateEffectPresentation;
  onDismiss: () => void;
  onCardinalPeek: (targetPlayerId: string) => Promise<boolean>;
};

function HiddenStack({ label, cardCount = 1, className = "" }: { label: string; cardCount?: number; className?: string }) {
  return (
    <div className={`effect-card-lane ${className}`.trim()}>
      <span className="effect-card-label">{label}</span>
      <div className="effect-stack" aria-hidden="true">
        {Array.from({ length: Math.max(cardCount, 1) }).map((_, index) => (
          <img
            key={`${label}-${index}`}
            className="effect-stack-card"
            src="/cards/cardback.png"
            alt=""
            style={{ "--stack-index": index } as React.CSSProperties}
            draggable={false}
          />
        ))}
      </div>
    </div>
  );
}

function FakeCard({ cardId, instanceId }: { cardId: CardID; instanceId: string }) {
  return <CardView card={{ instanceId, cardId }} compact />;
}

function RevealCard({
  card,
  instanceId,
  compact = false,
}: {
  card: { cardId: CardID } | null;
  instanceId: string;
  compact?: boolean;
}) {
  if (!card) {
    return <div className="comparison-empty-card">No card revealed</div>;
  }

  return <CardView card={{ instanceId, cardId: card.cardId }} compact={compact} />;
}

export function DiscardResolutionOverlay({
  effect,
  onDismiss,
  onCardinalPeek,
}: DiscardResolutionOverlayProps) {
  const [dimActive, setDimActive] = React.useState(false);
  const [pendingPeekTargetId, setPendingPeekTargetId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDimActive(false);
    setPendingPeekTargetId(null);

    if (effect.kind === "compare" || effect.kind === "discard_reveal" || effect.kind === "guess") {
      const timeout = window.setTimeout(() => setDimActive(true), 900);
      return () => window.clearTimeout(timeout);
    }

    return undefined;
  }, [effect]);

  const showContinue = !(effect.kind === "swap" && effect.requiresDecision === "cardinal_peek_choice");

  const renderBody = () => {
    switch (effect.kind) {
      case "message":
        return (
          <div className="effect-message-panel">
            <p>{effect.message}</p>
          </div>
        );
      case "peek":
        return (
          <div className="effect-card-grid single">
            <div className="effect-card-lane">
              <span className="effect-card-label">{effect.targetPlayerName}</span>
              <RevealCard card={effect.revealedCard} instanceId={`${effect.effectId}-peek`} />
            </div>
          </div>
        );
      case "multi_peek":
        return (
          <div className={`effect-card-grid ${effect.seen.length > 1 ? "dual" : "single"}`}>
            {effect.seen.map((entry) => (
              <div key={entry.targetPlayerId} className="effect-card-lane">
                <span className="effect-card-label">{entry.targetPlayerName}</span>
                <RevealCard
                  card={entry.revealedCard}
                  instanceId={`${effect.effectId}-${entry.targetPlayerId}`}
                  compact={effect.seen.length > 1}
                />
              </div>
            ))}
          </div>
        );
      case "compare":
        return (
          <>
            <div className="effect-card-grid dual">
              <div className={`effect-card-lane ${dimActive && effect.losingPlayerId === effect.selfPlayerId ? "is-dimmed" : ""}`}>
                <span className="effect-card-label">{effect.selfPlayerName}</span>
                <RevealCard card={effect.selfCard} instanceId={`${effect.effectId}-self`} />
              </div>
              <div className={`effect-card-lane ${dimActive && effect.losingPlayerId === effect.opposingPlayerId ? "is-dimmed" : ""}`}>
                <span className="effect-card-label">{effect.opposingPlayerName}</span>
                <RevealCard card={effect.opposingCard} instanceId={`${effect.effectId}-other`} />
              </div>
            </div>
            <div className="effect-outcome-row">
              {effect.winningPlayerId === null
                ? "This comparison tied, so no one was eliminated."
                : effect.losingPlayerId === effect.selfPlayerId
                  ? "You lost the comparison."
                  : effect.winningPlayerId === effect.selfPlayerId
                    ? "You won the comparison."
                    : `${effect.opposingPlayerName} won the comparison.`}
            </div>
          </>
        );
      case "swap":
        return (
          <>
            <div className="effect-card-grid dual effect-card-grid-swap">
              <HiddenStack label={effect.players[0].playerName} cardCount={effect.players[0].cardCount} className="effect-swap-left" />
              <HiddenStack label={effect.players[1].playerName} cardCount={effect.players[1].cardCount} className="effect-swap-right" />
            </div>
            {effect.requiresDecision === "cardinal_peek_choice" && effect.peekChoices ? (
              <div className="effect-choice-panel">
                <span className="effect-choice-label">See hand</span>
                <div className="effect-choice-row">
                  {effect.peekChoices.map((choice) => (
                    <button
                      key={choice.playerId}
                      type="button"
                      className="grid-btn"
                      disabled={pendingPeekTargetId !== null}
                      onClick={async () => {
                        setPendingPeekTargetId(choice.playerId);
                        const ok = await onCardinalPeek(choice.playerId);
                        if (!ok) {
                          setPendingPeekTargetId(null);
                        }
                      }}
                    >
                      <span>{pendingPeekTargetId === choice.playerId ? "Loading..." : choice.playerName}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        );
      case "discard_reveal":
        return (
            <div className="effect-card-grid single">
              <div className={`effect-card-lane ${dimActive ? "is-dimmed" : ""}`}>
                <span className="effect-card-label">{effect.targetPlayerName}'s discarded card</span>
                <RevealCard card={effect.discardedCard} instanceId={`${effect.effectId}-discard`} />
              </div>
            <div className="effect-outcome-row">
              {effect.causedElimination
                ? `${effect.targetPlayerName} was eliminated.`
                : effect.drewReplacement
                  ? `${effect.targetPlayerName} drew a replacement card.`
                  : `${effect.targetPlayerName} had no replacement card to draw.`}
            </div>
          </div>
        );
      case "guess":
        return (
          <>
            <div className="effect-card-grid dual">
              <div className={`effect-card-lane ${dimActive && effect.outcome === "assassin_rebound" ? "is-dimmed" : ""}`}>
                <span className="effect-card-label">{effect.guessMode === "guard" ? "Guard" : "Bishop"}</span>
                <FakeCard cardId={effect.guessMode} instanceId={`${effect.effectId}-played`} />
              </div>
              <div className="effect-card-lane">
                <span className="effect-card-label">Guessed value: {effect.guessedValue}</span>
                <div className="effect-inline-card-row">
                  {effect.guessedCardIds.map((cardId, index) => (
                    <div
                      key={`${effect.effectId}-${cardId}-${index}`}
                      className={`effect-inline-card ${dimActive && effect.outcome === "correct" ? "is-dimmed" : ""}`}
                    >
                      <FakeCard cardId={cardId} instanceId={`${effect.effectId}-${cardId}-${index}`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {effect.revealedCards.length > 0 ? (
              <div className="effect-card-grid single">
                <div className={`effect-card-lane ${dimActive && effect.outcome !== "wrong" ? "is-dimmed" : ""}`}>
                  <span className="effect-card-label">{effect.targetPlayerName}</span>
                  <RevealCard card={effect.revealedCards[0]!} instanceId={`${effect.effectId}-revealed`} />
                </div>
              </div>
            ) : null}
            <div className="effect-outcome-row">{effect.outcomeMessage}</div>
          </>
        );
      case "cardinal_reveal":
        return (
          <div className="effect-card-grid single">
            <div className="effect-card-lane">
              <span className="effect-card-label">{effect.chosenPlayerName}</span>
              <RevealCard card={effect.revealedCard} instanceId={`${effect.effectId}-cardinal`} />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="effect-overlay">
      <div className="effect-overlay-backdrop" />
      <section className="effect-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="effect-overlay-title">
        <header className="effect-overlay-header">
          <h2 id="effect-overlay-title">{effect.title}</h2>
          {effect.kind !== "message" ? <p>{effect.message}</p> : null}
        </header>
        <div className="effect-overlay-body">{renderBody()}</div>
        {showContinue ? (
          <footer className="effect-overlay-footer">
            <button type="button" className="primary-button" onClick={onDismiss}>
              Continue
            </button>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
