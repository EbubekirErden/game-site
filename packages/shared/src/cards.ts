// packages/shared/src/cards.ts

import type { CardDef } from "./types.js";

export const BASE_CARDS: CardDef[] = [
  {
    id: "c1",
    name: "Watcher",
    value: 1,
    copies: 5,
    effect: "guess_knockout",
    targetRule: "single_other_non_protected",
  },
  {
    id: "c2",
    name: "Seer",
    value: 2,
    copies: 2,
    effect: "peek_hand",
    targetRule: "single_other_non_protected",
  },
  {
    id: "c3",
    name: "Duelist",
    value: 3,
    copies: 2,
    effect: "compare_hands",
    targetRule: "single_other_non_protected",
  },
  {
    id: "c4",
    name: "Ward",
    value: 4,
    copies: 2,
    effect: "protection",
    targetRule: "self",
  },
  {
    id: "c5",
    name: "Exile",
    value: 5,
    copies: 2,
    effect: "force_discard",
    targetRule: "single_other_non_protected",
  },
  {
    id: "c7",
    name: "Oathbound",
    value: 7,
    copies: 1,
    effect: "self_discard",
    targetRule: "none",
  },
  {
    id: "c8",
    name: "Crown",
    value: 8,
    copies: 1,
    effect: "score_high",
    targetRule: "none",
  },
];
