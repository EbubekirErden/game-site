import React from "react";

import { getCardCopies, getCardDef } from "@game-site/shared";
import type { CardID, LoveLetterMode } from "@game-site/shared";

import { LOVE_LETTER_CARD_TEXT } from "../lib/loveLetterInfo.js";
import { CardView } from "./CardView.js";

type CardInfoPopupProps = {
  cardId: CardID;
  mode: LoveLetterMode;
  onClose: () => void;
};

export function CardInfoPopup({ cardId, mode, onClose }: CardInfoPopupProps) {
  const card = getCardDef(cardId);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="card-info-overlay" onClick={onClose}>
      <section className="card-info-popup" role="dialog" aria-modal="true" aria-labelledby="card-info-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="card-info-close-button" aria-label="Close card details" onClick={onClose}>
          x
        </button>
        <div className="card-info-layout">
          <div className="card-info-visual">
            <CardView card={{ instanceId: `card-info-${card.id}`, cardId: card.id }} />
          </div>
          <div className="card-info-copy">
            <p className="card-info-eyebrow">Love Letter Card</p>
            <h2 id="card-info-title">{card.name}</h2>
            <div className="card-info-meta">
              <span>Value {card.value}</span>
              <span>Classic {getCardCopies(card.id, "classic")}</span>
              <span>Premium {getCardCopies(card.id, "premium")}</span>
              <span>Current room: {mode === "premium" ? "Extended" : "Classic"}</span>
            </div>
            <p className="card-info-description">{LOVE_LETTER_CARD_TEXT[card.id]}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
