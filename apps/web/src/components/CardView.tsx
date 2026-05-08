import React from "react";
import { motion } from "framer-motion";
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

const cardImagePath = (fileName: string) => `${import.meta.env.BASE_URL}love-letter/cards/${fileName}`;

const CARD_ART: Record<string, { accent: string; imagePath: string }> = {
  assassin: { accent: "#4f5d75", imagePath: cardImagePath("assassin.jpeg") },
  jester: { accent: "#b08968", imagePath: cardImagePath("jester.jpeg") },
  guard: { accent: "#3d5a80", imagePath: cardImagePath("guard.jpeg") },
  cardinal: { accent: "#6a994e", imagePath: cardImagePath("cardinal.jpeg") },
  priest: { accent: "#5b7c4d", imagePath: cardImagePath("priest.jpeg") },
  baron: { accent: "#9c6644", imagePath: cardImagePath("baron.jpeg") },
  baroness: { accent: "#9d4edd", imagePath: cardImagePath("baroness.png") },
  handmaid: { accent: "#b56576", imagePath: cardImagePath("handmaid.jpeg") },
  sycophant: { accent: "#577590", imagePath: cardImagePath("sycophant.jpeg") },
  prince: { accent: "#d4a373", imagePath: cardImagePath("prince.jpeg") },
  count: { accent: "#bc6c25", imagePath: cardImagePath("count.jpeg") },
  constable: { accent: "#355070", imagePath: cardImagePath("constable.jpeg") },
  king: { accent: "#8d6a9f", imagePath: cardImagePath("king.jpeg") },
  countess: { accent: "#7f5539", imagePath: cardImagePath("countess.jpeg") },
  dowager_queen: { accent: "#8f5a9f", imagePath: cardImagePath("dowager_queen.jpeg") },
  princess: { accent: "#c1121f", imagePath: cardImagePath("princess.jpeg") },
  bishop: { accent: "#386641", imagePath: cardImagePath("bishop.jpeg") },
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
      <motion.button
        layoutId={card.instanceId}
        type="button"
        className={`card-view card-view-hidden ${sizeClassName}`}
        onClick={onClick}
        disabled={!selectable}
      >
        <div className="card-view-back-pattern" />
        <div className="card-view-hidden-crest">⚜️</div>
      </motion.button>
    );
  }

  return (
    <motion.button
      layoutId={card.instanceId}
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
    </motion.button>
  );
}
