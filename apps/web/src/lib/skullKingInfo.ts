import type { SkullKingCard, SkullKingSuit } from "@game-site/shared/games/skull-king/types";

export const SKULL_KING_DECK_TOTAL = 74;
export const SKULL_KING_ROUND_TOTAL = 10;

const SUIT_PRESENTATION: Record<
  SkullKingSuit,
  { label: string; artPath: string; accent: string; summary: string }
> = {
  green: {
    label: "Parrot",
    artPath: "/skull-king/cards/parrot.png",
    accent: "#4fa941",
    summary: "Green suited cards follow normal trick-taking rules. If green is led and you have a green numbered card, you must follow suit.",
  },
  yellow: {
    label: "Treasure Chest",
    artPath: "/skull-king/cards/treasure_chest.png",
    accent: "#d6a62d",
    summary: "Yellow suited cards are regular numbered cards. They do not beat black trump unless black was also led as the numbered suit to follow.",
  },
  purple: {
    label: "Pirate Map",
    artPath: "/skull-king/cards/piratemap.png",
    accent: "#7f58c9",
    summary: "Purple suited cards are regular numbered cards. They can win only by being the highest card in the lead suit when no higher-priority special wins.",
  },
  black: {
    label: "Jolly Roger",
    artPath: "/skull-king/cards/jollyroger.png",
    accent: "#444a54",
    summary: "Black is the trump suit in this room. Among numbered cards, the highest black card beats other suited cards.",
  },
};

const SPECIAL_PRESENTATION: Record<
  Exclude<SkullKingCard["type"], "number" | "tigress">,
  { label: string; artPath: string; accent: string; summary: string; copies: number }
> = {
  escape: {
    label: "Escape",
    artPath: "/skull-king/cards/escape.png",
    accent: "#5e748a",
    copies: 5,
    summary: "A safe throwaway card. It usually cannot win the trick and is useful when you want to avoid taking one.",
  },
  pirate: {
    label: "Pirate",
    artPath: "/skull-king/cards/pirate.png",
    accent: "#b35c43",
    copies: 5,
    summary: "Pirates beat Mermaids and every numbered card, but lose to Skull King.",
  },
  mermaid: {
    label: "Mermaid",
    artPath: "/skull-king/cards/mermaid.png",
    accent: "#2d8aa8",
    copies: 2,
    summary: "Mermaids beat numbered cards and win against Skull King when both appear in the same trick, but Pirates beat them.",
  },
  loot: {
    label: "Loot",
    artPath: "/skull-king/cards/loot.png",
    accent: "#b7902d",
    copies: 2,
    summary: "Special loot cards are part of the deck art set. This room includes them as specials, but its bonus-scoring logic currently focuses on Skull King, Pirate, and Mermaid captures.",
  },
  kraken: {
    label: "Kraken",
    artPath: "/skull-king/cards/kraken.png",
    accent: "#5a6e7c",
    copies: 1,
    summary: "Kraken voids the trick. No player wins it, and nobody gets credit for taking that trick.",
  },
  white_whale: {
    label: "White Whale",
    artPath: "/skull-king/cards/white_whale.png",
    accent: "#9fb7c9",
    copies: 1,
    summary: "White Whale strips away the usual special-card pecking order. If a numbered lead suit exists, the highest card in that suit wins instead.",
  },
  skull_king: {
    label: "Skull King",
    artPath: "/skull-king/cards/skullking.png",
    accent: "#d36d39",
    copies: 1,
    summary: "Skull King beats Pirates and all numbered cards, but loses to Mermaid. Capturing Pirates with Skull King awards bonus points.",
  },
};

export function getSkullKingCardSummary(card: SkullKingCard): string {
  if (card.type === "number") {
    return SUIT_PRESENTATION[card.suit].summary;
  }

  if (card.type === "tigress") {
    return TIGRESS_PRESENTATION.summary;
  }

  return SPECIAL_PRESENTATION[card.type].summary;
}

export const TIGRESS_PRESENTATION = {
  label: "Tigress",
  artPath: "/skull-king/cards/tigress.png",
  accent: "#c05b86",
  copies: 1,
  summary: "Tigress is flexible. When you play it, choose whether it acts as an Escape or as a Pirate.",
};

export function getSkullKingSuitPresentation(suit: SkullKingSuit) {
  return SUIT_PRESENTATION[suit];
}

export function getSkullKingCardPresentation(card: SkullKingCard) {
  if (card.type === "number") {
    const suit = SUIT_PRESENTATION[card.suit];
    return {
      title: `${suit.label} ${card.rank}`,
      subtitle: `${card.suit} suit`,
      artPath: suit.artPath,
      accent: suit.accent,
      rank: card.rank,
    };
  }

  if (card.type === "tigress") {
    return {
      title: card.mode ? `Tigress (${card.mode})` : TIGRESS_PRESENTATION.label,
      subtitle: card.mode ? `Acts as ${card.mode}` : "Choose escape or pirate when played",
      artPath: TIGRESS_PRESENTATION.artPath,
      accent: TIGRESS_PRESENTATION.accent,
      rank: null,
    };
  }

  const special = SPECIAL_PRESENTATION[card.type];
  return {
    title: special.label,
    subtitle: "Special card",
    artPath: special.artPath,
    accent: special.accent,
    rank: null,
  };
}

export const SKULL_KING_FLOW = [
  "Play a 10-round match. Round 1 deals 1 card to each player, round 2 deals 2, and so on through round 10.",
  "After looking at your hand, bid how many tricks you expect to win that round.",
  "If a numbered suit is led and you hold that suit, you must follow it with a numbered card of that suit. Special cards can be played at any time.",
  "Black is the trump suit among numbered cards. Special cards still outrank numbered cards unless White Whale or Kraken changes the trick.",
];

export const SKULL_KING_SCORING = [
  "Bid 0 and take 0 tricks: gain 10 points per round number.",
  "Bid 0 and miss: lose 10 points per round number.",
  "Hit a non-zero bid exactly: gain 20 points per trick bid.",
  "Miss a non-zero bid: lose 10 points for each trick above or below your bid.",
];

export const SKULL_KING_BONUSES = [
  "Skull King wins a trick containing Pirates: +30 points for each Pirate captured.",
  "Mermaid wins a trick containing Skull King: +50 points.",
  "Pirate wins a trick containing Mermaids: +20 points for each Mermaid captured.",
];

export const SKULL_KING_RULE_TWISTS = [
  "Kraken cancels the trick, so nobody wins it.",
  "White Whale changes the trick so the highest card in the lead numbered suit wins; if no numbered suit was established, White Whale wins.",
  "Tigress can be played as either Escape or Pirate at the moment you play it.",
];

export const SKULL_KING_IMPLEMENTATION_NOTES = [
  "This room now supports suited ranks 1 through 14.",
  "Loot art is included in the deck reference, but extra loot-specific bonus scoring is not currently shown in the game log or round bonus summary.",
];

export const SKULL_KING_REFERENCE_CARDS = [
  {
    key: "green",
    card: { type: "number", suit: "green", rank: 14 } as const,
    name: "Parrot Suit",
    copies: 14,
    text: SUIT_PRESENTATION.green.summary,
  },
  {
    key: "yellow",
    card: { type: "number", suit: "yellow", rank: 14 } as const,
    name: "Treasure Chest Suit",
    copies: 14,
    text: SUIT_PRESENTATION.yellow.summary,
  },
  {
    key: "purple",
    card: { type: "number", suit: "purple", rank: 14 } as const,
    name: "Pirate Map Suit",
    copies: 14,
    text: SUIT_PRESENTATION.purple.summary,
  },
  {
    key: "black",
    card: { type: "number", suit: "black", rank: 14 } as const,
    name: "Jolly Roger Suit",
    copies: 14,
    text: SUIT_PRESENTATION.black.summary,
  },
  {
    key: "escape",
    card: { type: "escape" } as const,
    name: SPECIAL_PRESENTATION.escape.label,
    copies: SPECIAL_PRESENTATION.escape.copies,
    text: SPECIAL_PRESENTATION.escape.summary,
  },
  {
    key: "pirate",
    card: { type: "pirate" } as const,
    name: SPECIAL_PRESENTATION.pirate.label,
    copies: SPECIAL_PRESENTATION.pirate.copies,
    text: SPECIAL_PRESENTATION.pirate.summary,
  },
  {
    key: "mermaid",
    card: { type: "mermaid" } as const,
    name: SPECIAL_PRESENTATION.mermaid.label,
    copies: SPECIAL_PRESENTATION.mermaid.copies,
    text: SPECIAL_PRESENTATION.mermaid.summary,
  },
  {
    key: "loot",
    card: { type: "loot" } as const,
    name: SPECIAL_PRESENTATION.loot.label,
    copies: SPECIAL_PRESENTATION.loot.copies,
    text: SPECIAL_PRESENTATION.loot.summary,
  },
  {
    key: "kraken",
    card: { type: "kraken" } as const,
    name: SPECIAL_PRESENTATION.kraken.label,
    copies: SPECIAL_PRESENTATION.kraken.copies,
    text: SPECIAL_PRESENTATION.kraken.summary,
  },
  {
    key: "white_whale",
    card: { type: "white_whale" } as const,
    name: SPECIAL_PRESENTATION.white_whale.label,
    copies: SPECIAL_PRESENTATION.white_whale.copies,
    text: SPECIAL_PRESENTATION.white_whale.summary,
  },
  {
    key: "tigress",
    card: { type: "tigress" } as const,
    name: TIGRESS_PRESENTATION.label,
    copies: TIGRESS_PRESENTATION.copies,
    text: TIGRESS_PRESENTATION.summary,
  },
  {
    key: "skull_king",
    card: { type: "skull_king" } as const,
    name: SPECIAL_PRESENTATION.skull_king.label,
    copies: SPECIAL_PRESENTATION.skull_king.copies,
    text: SPECIAL_PRESENTATION.skull_king.summary,
  },
];
