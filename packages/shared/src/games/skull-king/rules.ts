import { TRUMP_SUIT, resolveTigressCard } from "./cards.js";
import type {
  PlayerID,
  SkullKingBonusEvent,
  SkullKingCard,
  SkullKingCardInstance,
  SkullKingCompletedTrick,
  SkullKingTrickPlay,
  TigressPlayMode,
} from "./types.js";

function playableCard(card: SkullKingCard, mode?: TigressPlayMode): SkullKingCard {
  return card.type === "tigress" ? resolveTigressCard(card, mode ?? "pirate") : card;
}

export function getLeadSuit(plays: SkullKingTrickPlay[]): string | null {
  const firstNumber = plays.find((play) => play.card.card.type === "number");
  return firstNumber?.card.card.type === "number" ? firstNumber.card.card.suit : null;
}

export function canPlayCard(hand: SkullKingCardInstance[], currentTrickPlays: SkullKingTrickPlay[], candidate: SkullKingCardInstance): boolean {
  const leadSuit = getLeadSuit(currentTrickPlays);
  if (!leadSuit || candidate.card.type !== "number") return true;

  const hasLeadSuit = hand.some((card) => card.card.type === "number" && card.card.suit === leadSuit);
  return !hasLeadSuit || candidate.card.suit === leadSuit;
}

function indexOfFirst(plays: SkullKingTrickPlay[], predicate: (card: SkullKingCard) => boolean): number {
  return plays.findIndex((play) => predicate(play.card.card));
}

function highestNumberIndex(plays: SkullKingTrickPlay[], suit: string): number | null {
  let bestIndex: number | null = null;
  let bestRank = Number.NEGATIVE_INFINITY;

  plays.forEach((play, index) => {
    const card = play.card.card;
    if (card.type !== "number" || card.suit !== suit) return;
    if (card.rank > bestRank) {
      bestRank = card.rank;
      bestIndex = index;
    }
  });

  return bestIndex;
}

export function getWinningPlayIndex(plays: SkullKingTrickPlay[]): number | null {
  if (plays.length === 0) return null;
  if (plays.some((play) => play.card.card.type === "kraken")) return null;

  const whiteWhaleIndex = indexOfFirst(plays, (card) => card.type === "white_whale");
  if (whiteWhaleIndex !== -1) {
    const leadSuit = getLeadSuit(plays);
    if (!leadSuit) return whiteWhaleIndex;
    return highestNumberIndex(plays, leadSuit) ?? whiteWhaleIndex;
  }

  const skullKingIndex = indexOfFirst(plays, (card) => card.type === "skull_king");
  const mermaidIndex = indexOfFirst(plays, (card) => card.type === "mermaid");
  if (skullKingIndex !== -1 && mermaidIndex !== -1) return mermaidIndex;
  if (skullKingIndex !== -1) return skullKingIndex;

  const pirateIndex = indexOfFirst(plays, (card) => card.type === "pirate" || (card.type === "tigress" && card.mode === "pirate"));
  if (pirateIndex !== -1) return pirateIndex;
  if (mermaidIndex !== -1) return mermaidIndex;

  const trumpIndex = highestNumberIndex(plays, TRUMP_SUIT);
  if (trumpIndex !== null) return trumpIndex;

  const leadSuit = getLeadSuit(plays);
  if (leadSuit) return highestNumberIndex(plays, leadSuit);

  return 0;
}

export function materializePlayedCard(card: SkullKingCardInstance, mode?: TigressPlayMode): SkullKingCardInstance {
  return {
    ...card,
    card: playableCard(card.card, mode),
  };
}

export function getTrickBonusEvents(trick: SkullKingCompletedTrick): SkullKingBonusEvent[] {
  if (trick.winnerPlayerId === null || trick.winningPlayIndex === null) return [];

  const winningPlay = trick.plays[trick.winningPlayIndex];
  if (!winningPlay) return [];

  const events: SkullKingBonusEvent[] = [];
  const winningCard = winningPlay.card.card;
  const pirateCaptureCount = trick.plays.filter((play) => play.card.card.type === "pirate" || (play.card.card.type === "tigress" && play.card.card.mode === "pirate")).length;
  const mermaidCount = trick.plays.filter((play) => play.card.card.type === "mermaid").length;
  const hasSkullKing = trick.plays.some((play) => play.card.card.type === "skull_king");

  if (winningCard.type === "skull_king" && pirateCaptureCount > 0) {
    events.push({
      playerId: winningPlay.playerId,
      points: pirateCaptureCount * 30,
      reason: "skull_king_pirate_capture",
    });
  }

  if (winningCard.type === "mermaid" && hasSkullKing) {
    events.push({
      playerId: winningPlay.playerId,
      points: 50,
      reason: "mermaid_skull_king_capture",
    });
  }

  if ((winningCard.type === "pirate" || (winningCard.type === "tigress" && winningCard.mode === "pirate")) && mermaidCount > 0) {
    events.push({
      playerId: winningPlay.playerId,
      points: mermaidCount * 20,
      reason: "pirate_mermaid_capture",
    });
  }

  return events;
}

export function getNextPlayerId(order: PlayerID[], currentPlayerId: PlayerID): PlayerID | null {
  const index = order.indexOf(currentPlayerId);
  if (index === -1 || order.length === 0) return null;
  return order[(index + 1) % order.length] ?? null;
}
