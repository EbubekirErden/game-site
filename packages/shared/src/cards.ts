import type { CardDef, CardID, LoveLetterMode } from "./types.js";

export const ALL_CARDS: CardDef[] = [
  {
    id: "assassin",
    name: "Assassin",
    value: 0,
    classicCopies: 0,
    premiumCopies: 1,
    effect: "assassin_reaction",
    targetRule: "none",
  },
  {
    id: "jester",
    name: "Jester",
    value: 0,
    classicCopies: 0,
    premiumCopies: 1,
    effect: "jester_prediction",
    targetRule: "single_other_non_protected",
  },
  {
    id: "guard",
    name: "Guard",
    value: 1,
    classicCopies: 5,
    premiumCopies: 8,
    effect: "guess_knockout",
    targetRule: "single_other_non_protected",
  },
  {
    id: "cardinal",
    name: "Cardinal",
    value: 2,
    classicCopies: 0,
    premiumCopies: 2,
    effect: "swap_two_hands",
    targetRule: "two_distinct_players",
  },
  {
    id: "priest",
    name: "Priest",
    value: 2,
    classicCopies: 2,
    premiumCopies: 2,
    effect: "peek_hand",
    targetRule: "single_other_non_protected",
  },
  {
    id: "baron",
    name: "Baron",
    value: 3,
    classicCopies: 2,
    premiumCopies: 2,
    effect: "compare_hands",
    targetRule: "single_other_non_protected",
  },
  {
    id: "baroness",
    name: "Baroness",
    value: 3,
    classicCopies: 0,
    premiumCopies: 2,
    effect: "peek_up_to_two_hands",
    targetRule: "up_to_two_other_non_protected",
  },
  {
    id: "handmaid",
    name: "Handmaid",
    value: 4,
    classicCopies: 2,
    premiumCopies: 2,
    effect: "protection",
    targetRule: "self",
  },
  {
    id: "sycophant",
    name: "Sycophant",
    value: 4,
    classicCopies: 0,
    premiumCopies: 2,
    effect: "mandate_target",
    targetRule: "single_any",
  },
  {
    id: "prince",
    name: "Prince",
    value: 5,
    classicCopies: 2,
    premiumCopies: 2,
    effect: "force_discard",
    targetRule: "optional_other",
  },
  {
    id: "count",
    name: "Count",
    value: 5,
    classicCopies: 0,
    premiumCopies: 2,
    effect: "count_bonus",
    targetRule: "none",
  },
  {
    id: "constable",
    name: "Constable",
    value: 6,
    classicCopies: 0,
    premiumCopies: 1,
    effect: "bonus_on_eliminated",
    targetRule: "none",
  },
  {
    id: "king",
    name: "King",
    value: 6,
    classicCopies: 1,
    premiumCopies: 1,
    effect: "swap_hands",
    targetRule: "single_other_non_protected",
  },
  {
    id: "countess",
    name: "Countess",
    value: 7,
    classicCopies: 1,
    premiumCopies: 1,
    effect: "forced_discard",
    targetRule: "none",
  },
  {
    id: "dowager_queen",
    name: "Dowager Queen",
    value: 7,
    classicCopies: 0,
    premiumCopies: 1,
    effect: "reverse_compare_hands",
    targetRule: "single_other_non_protected",
  },
  {
    id: "princess",
    name: "Princess",
    value: 8,
    classicCopies: 1,
    premiumCopies: 1,
    effect: "princess_discard",
    targetRule: "none",
  },
  {
    id: "bishop",
    name: "Bishop",
    value: 9,
    classicCopies: 0,
    premiumCopies: 1,
    effect: "token_guess",
    targetRule: "single_other_non_protected",
  },
];

export const BASE_CARDS = ALL_CARDS.filter((card) => card.classicCopies > 0);
export const PREMIUM_CARDS = ALL_CARDS.filter((card) => card.premiumCopies > 0);
export const PREMIUM_ONLY_CARDS = ALL_CARDS.filter((card) => card.classicCopies === 0 && card.premiumCopies > 0);

export const CARD_BY_ID = Object.fromEntries(ALL_CARDS.map((card) => [card.id, card])) as Record<CardID, CardDef>;

export function getCardDef(cardId: CardID): CardDef {
  return CARD_BY_ID[cardId];
}

export function getCardCopies(cardId: CardID, mode: LoveLetterMode): number {
  const card = getCardDef(cardId);
  return mode === "premium" ? card.premiumCopies : card.classicCopies;
}

export function getCardsForMode(mode: LoveLetterMode): CardDef[] {
  return ALL_CARDS.filter((card) => getCardCopies(card.id, mode) > 0);
}
