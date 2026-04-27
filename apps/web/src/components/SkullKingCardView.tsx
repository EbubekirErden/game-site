import React from "react";

import type { SkullKingCard } from "@game-site/shared/games/skull-king/types";

import { getSkullKingCardPresentation } from "../lib/skullKingInfo.js";

type SkullKingCardViewProps = {
  card: SkullKingCard;
  className?: string;
  compact?: boolean;
};

export function SkullKingCardView({
  card,
  className = "",
  compact = false,
}: SkullKingCardViewProps) {
  const presentation = getSkullKingCardPresentation(card);
  const [imageSrc, setImageSrc] = React.useState(presentation.artPath);

  React.useEffect(() => {
    setImageSrc(presentation.artPath);
  }, [presentation.artPath]);

  return (
    <div
      className={`skull-card-view ${compact ? "skull-card-view-compact" : ""} ${className}`.trim()}
      style={{ "--skull-card-accent": presentation.accent } as React.CSSProperties}
    >
      <img
        className="skull-card-view-art"
        src={imageSrc}
        alt={presentation.title}
        draggable={false}
        onError={() => {
          if (imageSrc !== "/skull-king/cards/card_bg.png") {
            setImageSrc("/skull-king/cards/card_bg.png");
          }
        }}
      />
      {presentation.rank !== null ? (
        <div className="skull-card-view-rank">{presentation.rank}</div>
      ) : null}
    </div>
  );
}
