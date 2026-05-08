import React from "react";
import { AnimatePresence } from "framer-motion";
import type { CardInstance } from "@game-site/shared";
import { FlyingCard } from "./FlyingCard.js";

export type FlyingCardAnimation = {
  id: string;
  card: CardInstance | null;
  fromRect: DOMRect;
  toRect: DOMRect;
  faceDown?: boolean;
  duration?: number;
  delay?: number;
  onComplete?: () => void;
};

type FloatingCardLayerProps = {
  animations: FlyingCardAnimation[];
};

export function FloatingCardLayer({ animations }: FloatingCardLayerProps) {
  return (
    <AnimatePresence>
      {animations.map((anim) => (
        <FlyingCard
          key={anim.id}
          card={anim.card}
          fromRect={anim.fromRect}
          toRect={anim.toRect}
          faceDown={anim.faceDown}
          duration={anim.duration}
          delay={anim.delay}
          onComplete={anim.onComplete}
        />
      ))}
    </AnimatePresence>
  );
}
