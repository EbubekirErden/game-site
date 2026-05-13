import { canPlayCard } from "./rules.js";
import type { SkullKingCardInstance, SkullKingPlayerViewState, TigressPlayMode } from "./types.js";

export type SkullKingBotAction =
  | { type: "bid"; bid: number }
  | { type: "play_card"; instanceId: string; tigressMode?: TigressPlayMode };

function randomIndex(length: number, rng: () => number): number {
  return Math.max(0, Math.min(length - 1, Math.floor(rng() * length)));
}

function chooseRandom<T>(items: T[], rng: () => number): T | null {
  if (items.length === 0) return null;
  return items[randomIndex(items.length, rng)] ?? null;
}

export function chooseRandomSkullKingBotAction(view: SkullKingPlayerViewState, rng: () => number = Math.random): SkullKingBotAction | null {
  const self = view.players.find((player) => player.id === view.selfPlayerId);
  const round = view.round;
  if (!self || !round) return null;

  if (view.phase === "bidding") {
    if (self.bid !== null) return null;
    return { type: "bid", bid: randomIndex(round.roundNumber + 1, rng) };
  }

  if (round.currentPlayerId !== view.selfPlayerId) return null;
  if (view.phase !== "playing") return null;

  const playableCards = self.hand.filter((card: SkullKingCardInstance) => canPlayCard(self.hand, round.currentTrick.plays, card));
  const card = chooseRandom(playableCards, rng);
  if (!card) return null;

  return {
    type: "play_card",
    instanceId: card.instanceId,
    tigressMode: card.card.type === "tigress" ? (rng() < 0.5 ? "escape" : "pirate") : undefined,
  };
}
