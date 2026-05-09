import React from "react";
import type { CardInstance } from "@game-site/shared";
import { motion, useReducedMotion } from "framer-motion";
import { MOTION, EASE } from "../lib/animationConstants.js";
import { getCardDef } from "@game-site/shared";

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

type FlyingCardProps = {
  card: CardInstance | null;
  fromRect: DOMRect;
  toRect: DOMRect;
  faceDown?: boolean;
  duration?: number;
  delay?: number;
  onComplete?: () => void;
};

export function FlyingCard({
  card,
  fromRect,
  toRect,
  faceDown = false,
  duration = MOTION.cardMoveLong,
  delay = 0,
  onComplete,
}: FlyingCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const art = card ? (CARD_ART[card.cardId] ?? { accent: "#7f8c8d", imagePath: "" }) : null;
  const cardDef = card ? getCardDef(card.cardId) : null;

  const durationSec = prefersReducedMotion ? 0.001 : duration / 1000;
  const easeCss = prefersReducedMotion ? "linear" : `cubic-bezier(${EASE.join(",")})`;

  // Calculate position from top-left of viewport
  const fromX = fromRect.left + fromRect.width / 2;
  const fromY = fromRect.top + fromRect.height / 2;
  const toX = toRect.left + toRect.width / 2;
  const toY = toRect.top + toRect.height / 2;

  // Clamp animated cards so a full hand zone still receives a single-card animation.
  const targetWidth = Math.min(toRect.width, 90);
  const cardW = Math.max(targetWidth, 72);
  const cardH = Math.max((cardW * 7) / 5, 100);

  return (
    <motion.div
      className="flying-card-wrapper"
      style={{
        position: "fixed",
        left: fromX - cardW / 2,
        top: fromY - cardH / 2,
        width: cardW,
        height: cardH,
        zIndex: 9999,
        pointerEvents: "none",
      }}
      initial={{ x: 0, y: 0, scale: 0.9, opacity: 0 }}
      animate={{
        x: toX - fromX,
        y: toY - fromY,
        scale: 1,
        opacity: 1,
      }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{
        duration: durationSec,
        delay: delay / 1000,
        ease: EASE,
      }}
      onAnimationComplete={onComplete}
    >
      {faceDown || !card ? (
        <div className="flying-card flying-card-hidden">
          <div className="card-view-back-pattern" />
          <div className="card-view-hidden-crest">⚜️</div>
        </div>
      ) : (
        <div
          className="flying-card flying-card-face"
          style={{ "--card-accent": art?.accent } as React.CSSProperties}
        >
          <div className="card-view-value-badge">{cardDef?.value ?? "?"}</div>
          <div className="card-view-art-shell">
            {art?.imagePath ? (
              <img
                className="card-view-art-image"
                src={art.imagePath}
                alt={cardDef?.name ?? "Card"}
                draggable={false}
                style={{ transition: `transform ${easeCss}` }}
              />
            ) : (
              <div className="card-view-art-fallback">{cardDef?.name ?? "?"}</div>
            )}
          </div>
          <div className="card-view-footer">
            <strong>{cardDef?.name ?? "?"}</strong>
          </div>
        </div>
      )}
    </motion.div>
  );
}
