import React from "react";
import { getCardDef } from "@game-site/shared";
import type { CardInstance } from "@game-site/shared";

type CardViewProps = {
  card: CardInstance;
  hidden?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
  mini?: boolean;
  spotlight?: boolean;
};

const CARD_ART: Record<string, { accent: string; imagePath: string }> = {
  assassin: { accent: "#4f5d75", imagePath: "/cards/assassin.jpeg" },
  jester: { accent: "#b08968", imagePath: "/cards/jester.jpeg" },
  guard: { accent: "#3d5a80", imagePath: "/cards/guard.jpeg" },
  cardinal: { accent: "#6a994e", imagePath: "/cards/cardinal.jpeg" },
  priest: { accent: "#5b7c4d", imagePath: "/cards/priest.jpeg" },
  baron: { accent: "#9c6644", imagePath: "/cards/baron.jpeg" },
  baroness: { accent: "#9d4edd", imagePath: "/cards/baroness.png" },
  handmaid: { accent: "#b56576", imagePath: "/cards/handmaid.jpeg" },
  sycophant: { accent: "#577590", imagePath: "/cards/sycophant.jpeg" },
  prince: { accent: "#d4a373", imagePath: "/cards/prince.jpeg" },
  count: { accent: "#bc6c25", imagePath: "/cards/count.jpeg" },
  constable: { accent: "#355070", imagePath: "/cards/constable.jpeg" },
  king: { accent: "#8d6a9f", imagePath: "/cards/king.jpeg" },
  countess: { accent: "#7f5539", imagePath: "/cards/countess.jpeg" },
  dowager_queen: { accent: "#8f5a9f", imagePath: "/cards/dowager_queen.jpeg" },
  princess: { accent: "#c1121f", imagePath: "/cards/princess.jpeg" },
  bishop: { accent: "#386641", imagePath: "/cards/bishop.jpeg" },
};

export function CardView({
  card,
  hidden = false,
  selectable = false,
  selected = false,
  onClick,
  compact = false,
  mini = false,
  spotlight = false,
}: CardViewProps) {
  const cardDef = getCardDef(card.cardId);
  const art = CARD_ART[card.cardId] || { accent: "#7f8c8d", imagePath: "" };
  const sizeClassName = mini ? "card-view-mini" : compact ? "card-view-compact" : "";

  if (hidden) {
    return (
      <button
        type="button"
        className={`card-view card-view-hidden ${sizeClassName}`}
        onClick={onClick}
        disabled={!selectable}
      >
        <div className="card-view-back-pattern" />
        <div className="card-view-hidden-crest">⚜️</div>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`card-view ${selected ? "is-selected" : ""} ${selectable ? "is-clickable" : ""} ${sizeClassName} ${spotlight ? "card-view-spotlight" : ""}`}
      onClick={onClick}
      disabled={!onClick}
      style={{ "--card-accent": art.accent } as React.CSSProperties}
    >
      <div className="card-view-value-badge">{cardDef?.value ?? "?"}</div>
      <div className="card-view-art-shell">
        {art.imagePath ? (
          <img
            className="card-view-art-image"
            src={art.imagePath}
            alt={cardDef?.name ?? "Unknown card"}
            draggable={false}
          />
        ) : (
          <div className="card-view-art-fallback">{cardDef?.name ?? "Unknown"}</div>
        )}
      </div>
      <div className="card-view-footer">
        <strong>{cardDef?.name ?? "Unknown"}</strong>
      </div>
    </button>
  );
}
