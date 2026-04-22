import React from "react";

import { BASE_CARDS } from "@game-site/shared";

import {
  LOVE_LETTER_CARD_TEXT,
  LOVE_LETTER_DECK_TOTAL,
  LOVE_LETTER_FLOW,
  LOVE_LETTER_SETUP_NOTES,
  LOVE_LETTER_TOKEN_GOALS,
} from "../lib/loveLetterInfo.js";
import { CardView } from "./CardView.js";

type LoveLetterInfoDrawerProps = {
  buttonClassName?: string;
  buttonLabel?: React.ReactNode;
  buttonTitle?: string;
};

export function LoveLetterInfoDrawer({
  buttonClassName = "",
  buttonLabel = "i",
  buttonTitle = "Open Love Letter reference",
}: LoveLetterInfoDrawerProps) {
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
                <h2>Love Letter Guide</h2>
                <p>Quick reference for rules, cards, deck counts, and match goals.</p>
              </div>
              <button
                type="button"
                className="info-close-button"
                aria-label="Close Love Letter reference"
                onClick={() => setIsOpen(false)}
              >
                x
              </button>
            </div>

            <section className="info-section">
              <h3>Gameplay Flow</h3>
              <ul className="info-list">
                {LOVE_LETTER_FLOW.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="info-section">
              <h3>Win Goals</h3>
              <div className="info-chip-row">
                {LOVE_LETTER_TOKEN_GOALS.map((goal) => (
                  <div key={goal.playerCount} className="info-chip">
                    <strong>{goal.playerCount} Players</strong>
                    <span>{goal.tokens} Tokens</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="info-section">
              <h3>Setup Notes</h3>
              <ul className="info-list">
                {LOVE_LETTER_SETUP_NOTES.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="info-section">
              <h3>Deck Summary</h3>
              <p className="info-muted">Standard 2 to 4 player deck: {LOVE_LETTER_DECK_TOTAL} cards.</p>
            </section>

            <section className="info-section">
              <h3>Cards</h3>
              <div className="info-card-grid">
                {BASE_CARDS.map((card) => (
                  <article key={card.id} className="info-card-entry">
                    <div className="info-card-visual">
                      <CardView card={{ instanceId: `info-${card.id}`, cardId: card.id }} compact />
                    </div>
                    <div className="info-card-copy">
                      <div className="info-card-meta">
                        <strong>{card.name}</strong>
                        <span>
                          Value {card.value} · {card.copies} in deck
                        </span>
                      </div>
                      <p>{LOVE_LETTER_CARD_TEXT[card.id]}</p>
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
