import React from "react";

import { getCardCopies } from "@game-site/shared";
import type { LoveLetterMode } from "@game-site/shared";

import {
  LOVE_LETTER_ALL_CARDS,
  LOVE_LETTER_CARD_TEXT,
  LOVE_LETTER_MODE_INFO,
} from "../lib/loveLetterInfo.js";
import { CardView } from "./CardView.js";

type LoveLetterInfoDrawerProps = {
  buttonClassName?: string;
  buttonLabel?: React.ReactNode;
  buttonTitle?: string;
  mode?: LoveLetterMode | null;
};

export function LoveLetterInfoDrawer({
  buttonClassName = "",
  buttonLabel = "i",
  buttonTitle = "Open Love Letter reference",
  mode = null,
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
                <p>
                  Quick reference for rules, cards, deck counts, and match goals.
                  {mode ? ` Current room: ${LOVE_LETTER_MODE_INFO[mode].label}.` : ""}
                </p>
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
              {(["classic", "premium"] as const).map((variant) => (
                <div key={variant} style={{ marginBottom: "1rem" }}>
                  <p className="info-muted">
                    <strong>{LOVE_LETTER_MODE_INFO[variant].label}</strong> · {LOVE_LETTER_MODE_INFO[variant].deckTotal} cards
                  </p>
                  <ul className="info-list">
                    {LOVE_LETTER_MODE_INFO[variant].flow.map((item) => (
                      <li key={`${variant}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <section className="info-section">
              <h3>Win Goals</h3>
              {/* 1. Using Grid instead of Flex for the columns to force the 50/50 split */}
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "1fr 1fr", 
                gap: "24px", 
                alignItems: "flex-start" 
              }}>
                {(["classic", "premium"] as const).map((variant) => (
                  <div key={variant}>
                    <p className="info-muted"><strong>{LOVE_LETTER_MODE_INFO[variant].label}</strong></p>
                    
                    {/* 2. Inner Flexbox for the horizontal chips */}
                    <div 
                      className="info-chip-row" 
                      style={{ 
                        display: "flex", 
                        flexDirection: "row", 
                        gap: "8px", 
                        flexWrap: "nowrap", // Forces chips to stay in one line
                        overflowX: "auto",   // Adds a scrollbar if chips are too wide for the column
                        paddingBottom: "8px" 
                      }}
                    >
                      {LOVE_LETTER_MODE_INFO[variant].tokenGoals.map((goal) => (
                        <div 
                          key={`${variant}-${goal.label}`} 
                          className="info-chip"
                          style={{ 
                            flexShrink: 0, 
                            minWidth: "max-content",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center"
                          }}
                        >
                          <strong>{goal.label}</strong>
                          <span style={{ fontSize: "0.85em", opacity: 0.8 }}>{goal.tokens} Tokens</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="info-section">
              <h3>Setup Notes</h3>
              {(["classic", "premium"] as const).map((variant) => (
                <div key={variant} style={{ marginBottom: "1rem" }}>
                  <p className="info-muted"><strong>{LOVE_LETTER_MODE_INFO[variant].label}</strong></p>
                  <ul className="info-list">
                    {LOVE_LETTER_MODE_INFO[variant].setupNotes.map((item) => (
                      <li key={`${variant}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <section className="info-section">
              <h3>Cards</h3>
              <div className="info-card-grid">
                {LOVE_LETTER_ALL_CARDS.map((card) => (
                  <article key={card.id} className="info-card-entry">
                    <div className="info-card-visual">
                      <CardView card={{ instanceId: `info-${card.id}`, cardId: card.id }} compact />
                    </div>
                    <div className="info-card-copy">
                      <div className="info-card-meta">
                        <strong>{card.name}</strong>
                        <span>
                          Value {card.value} · Classic {getCardCopies(card.id, "classic")} · Premium {getCardCopies(card.id, "premium")}
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
