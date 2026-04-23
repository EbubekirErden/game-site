import type { SkullKingCard, SkullKingCardInstance, SkullKingSuit, TigressPlayMode } from "./types.js";

export const NUMBER_SUITS: SkullKingSuit[] = ["green", "yellow", "purple", "black"];
export const TRUMP_SUIT: SkullKingSuit = "black";

const SPECIAL_COUNTS: Array<{ card: SkullKingCard; count: number }> = [
  { card: { type: "escape" }, count: 5 },
  { card: { type: "pirate" }, count: 5 },
  { card: { type: "mermaid" }, count: 2 },
  { card: { type: "loot" }, count: 2 },
  { card: { type: "kraken" }, count: 1 },
  { card: { type: "white_whale" }, count: 1 },
  { card: { type: "tigress" }, count: 1 },
  { card: { type: "skull_king" }, count: 1 },
];

export function buildSkullKingDeck(makeId: () => string): SkullKingCardInstance[] {
  const deck: SkullKingCardInstance[] = [];

  for (const suit of NUMBER_SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({
        instanceId: makeId(),
        card: { type: "number", suit, rank },
      });
    }
  }

  for (const { card, count } of SPECIAL_COUNTS) {
    for (let index = 0; index < count; index += 1) {
      deck.push({
        instanceId: makeId(),
        card: { ...card },
      });
    }
  }

  return deck;
}

export function describeSkullKingCard(card: SkullKingCard): string {
  if (card.type === "number") return `${card.suit} ${card.rank}`;
  if (card.type === "white_whale") return "White Whale";
  if (card.type === "skull_king") return "Skull King";
  if (card.type === "tigress" && card.mode) return `Tigress (${card.mode})`;
  return card.type.replaceAll("_", " ");
}

export function resolveTigressCard(card: SkullKingCard, mode: TigressPlayMode = "pirate"): SkullKingCard {
  if (card.type !== "tigress") return card;
  return { type: "tigress", mode };
}
