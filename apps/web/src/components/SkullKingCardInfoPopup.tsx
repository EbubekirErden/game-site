import React from "react";

import type { SkullKingCard } from "@game-site/shared/games/skull-king/types";

import { getSkullKingCardPresentation, getSkullKingCardSummary } from "../lib/skullKingInfo.js";
import { SkullKingCardView } from "./SkullKingCardView.js";

type SkullKingCardInfoPopupProps = {
  card: SkullKingCard;
  onClose: () => void;
};

export function SkullKingCardInfoPopup({ card, onClose }: SkullKingCardInfoPopupProps) {
  const presentation = getSkullKingCardPresentation(card);

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
      <section className="card-info-popup" role="dialog" aria-modal="true" aria-labelledby="skull-card-info-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="card-info-close-button" aria-label="Close card details" onClick={onClose}>
          x
        </button>
        <div className="card-info-layout">
          <div className="card-info-visual">
            <SkullKingCardView card={card} />
          </div>
          <div className="card-info-copy">
            <p className="card-info-eyebrow">Skull King Card</p>
            <h2 id="skull-card-info-title">{presentation.title}</h2>
            <div className="card-info-meta">
              <span>{presentation.subtitle}</span>
              {card.type === "number" ? <span>Rank {card.rank}</span> : null}
            </div>
            <p className="card-info-description">{getSkullKingCardSummary(card)}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
