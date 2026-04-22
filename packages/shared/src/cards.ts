// packages/shared/src/cards.ts

import type { CardDef } from "./types.js";

export const BASE_CARDS: CardDef[] = [
  {
    id: "guard",
    name: "Guard",
    value: 1,
    copies: 5,
    effect: "guess_knockout",
    targetRule: "single_other_non_protected",
  },
  {
    id: "priest",
    name: "Priest",
    value: 2,
    copies: 2,
    effect: "peek_hand",
    targetRule: "single_other_non_protected",
  },
  {
    id: "baron",
    name: "Baron",
    value: 3,
    copies: 2,
    effect: "compare_hands",
    targetRule: "single_other_non_protected",
  },
  {
    id: "handmaid",
    name: "Handmaid",
    value: 4,
    copies: 2,
    effect: "protection",
    targetRule: "self",
  },
  {
    id: "prince",
    name: "Prince",
    value: 5,
    copies: 2,
    effect: "force_discard",
    targetRule: "optional_other",
  },
  {
    id: "king",
    name: "King",
    value: 6,
    copies: 1,
    effect: "swap_hands",
    targetRule: "single_other_non_protected",
  },
  {
    id: "countess",
    name: "Countess",
    value: 7,
    copies: 1,
    effect: "forced_discard",
    targetRule: "none",
  },
  {
    id: "princess",
    name: "Princess",
    value: 8,
    copies: 1,
    effect: "princess_discard",
    targetRule: "none",
  },
];

export const CARD_BY_ID = Object.fromEntries(BASE_CARDS.map((card) => [card.id, card])) as Record<CardDef["id"], CardDef>;

export function getCardDef(cardId: CardDef["id"]): CardDef {
  return CARD_BY_ID[cardId];
}
