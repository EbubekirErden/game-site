import React from "react";

import {
  SKULL_KING_BONUSES,
  SKULL_KING_DECK_TOTAL,
  SKULL_KING_FLOW,
  SKULL_KING_IMPLEMENTATION_NOTES,
  SKULL_KING_REFERENCE_CARDS,
  SKULL_KING_ROUND_TOTAL,
  SKULL_KING_RULE_TWISTS,
  SKULL_KING_SCORING,
} from "../lib/skullKingInfo.js";
import { SkullKingCardView } from "./SkullKingCardView.js";

type SkullKingInfoDrawerProps = {
  buttonClassName?: string;
  buttonLabel?: React.ReactNode;
  buttonTitle?: string;
};

export function SkullKingInfoDrawer({
  buttonClassName = "",
  buttonLabel = "i",
  buttonTitle = "Open Skull King reference",
}: SkullKingInfoDrawerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        title={buttonTitle}
        aria-label={buttonTitle}
        onClick={() => setIsOpen(true)}
      >
        {buttonLabel}
      </button>

      {isOpen ? (
        <div className="info-overlay" onClick={() => setIsOpen(false)}>
          <aside className="info-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="info-drawer-header">
              <div>
                <h2>Skull King Guide</h2>
                <p>
                  Quick reference for the round flow, scoring, special interactions, and the full deck.
                  {` ${SKULL_KING_DECK_TOTAL} cards across ${SKULL_KING_ROUND_TOTAL} rounds.`}
                </p>
              </div>
              <button
                type="button"
                className="info-close-button"
                aria-label="Close Skull King reference"
                onClick={() => setIsOpen(false)}
              >
                x
              </button>
            </div>

            <section className="info-section">
              <h3>Round Flow</h3>
              <ul className="info-list">
                {SKULL_KING_FLOW.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="info-section">
              <h3>Scoring</h3>
              <ul className="info-list">
                {SKULL_KING_SCORING.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="info-section">
              <h3>Bonus Captures</h3>
              <ul className="info-list">
                {SKULL_KING_BONUSES.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="info-section">
              <h3>Special Rules</h3>
              <ul className="info-list">
                {SKULL_KING_RULE_TWISTS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="info-section">
              <h3>Implementation Notes</h3>
              <ul className="info-list">
                {SKULL_KING_IMPLEMENTATION_NOTES.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="info-section">
              <h3>Cards</h3>
              <div className="info-card-grid">
                {SKULL_KING_REFERENCE_CARDS.map((entry) => (
                  <article key={entry.key} className="info-card-entry">
                    <div className="info-card-visual">
                      <SkullKingCardView card={entry.card} compact />
                    </div>
                    <div className="info-card-copy">
                      <div className="info-card-meta">
                        <strong>{entry.name}</strong>
                        <span>{entry.copies} copies</span>
                      </div>
                      <p>{entry.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </>
  );
}
