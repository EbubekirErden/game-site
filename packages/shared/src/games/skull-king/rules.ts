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

function isEscapeLike(card: SkullKingCard): boolean {
  return card.type === "escape" || card.type === "loot" || (card.type === "tigress" && card.mode === "escape");
}

function isPirateLike(card: SkullKingCard): boolean {
  return card.type === "pirate" || (card.type === "tigress" && card.mode === "pirate");
}

function isCharacterLead(card: SkullKingCard): boolean {
  return card.type === "mermaid" || card.type === "skull_king" || card.type === "kraken" || card.type === "white_whale" || isPirateLike(card);
}

export function getLeadSuit(plays: SkullKingTrickPlay[]): string | null {
  const firstCard = plays[0]?.card.card;
  if (!firstCard) return null;
  if (firstCard.type === "number") return firstCard.suit;
  if (isCharacterLead(firstCard)) return null;
  if (!isEscapeLike(firstCard)) return null;

  const firstNumber = plays.slice(1).find((play) => play.card.card.type === "number");
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

function highestNumberAnySuitIndex(plays: SkullKingTrickPlay[]): number | null {
  let bestIndex: number | null = null;
  let bestRank = Number.NEGATIVE_INFINITY;

  plays.forEach((play, index) => {
    const card = play.card.card;
    if (card.type !== "number") return;
    if (card.rank > bestRank) {
      bestRank = card.rank;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function getActiveLeviathanIndex(plays: SkullKingTrickPlay[], type: "kraken" | "white_whale"): number {
  for (let index = plays.length - 1; index >= 0; index -= 1) {
    if (plays[index]?.card.card.type === type) return index;
  }
  return -1;
}

function getActiveLeviathan(plays: SkullKingTrickPlay[]): { type: "kraken" | "white_whale"; index: number } | null {
  const krakenIndex = getActiveLeviathanIndex(plays, "kraken");
  const whiteWhaleIndex = getActiveLeviathanIndex(plays, "white_whale");
  if (krakenIndex === -1 && whiteWhaleIndex === -1) return null;
  return krakenIndex > whiteWhaleIndex ? { type: "kraken", index: krakenIndex } : { type: "white_whale", index: whiteWhaleIndex };
}

function getWinningPlayIndexWithoutLeviathanEffect(plays: SkullKingTrickPlay[]): number | null {
  if (plays.length === 0) return null;

  const skullKingIndex = indexOfFirst(plays, (card) => card.type === "skull_king");
  const mermaidIndex = indexOfFirst(plays, (card) => card.type === "mermaid");
  if (skullKingIndex !== -1 && mermaidIndex !== -1) return mermaidIndex;
  if (skullKingIndex !== -1) return skullKingIndex;

  const pirateIndex = indexOfFirst(plays, isPirateLike);
  if (pirateIndex !== -1) return pirateIndex;
  if (mermaidIndex !== -1) return mermaidIndex;

  const trumpIndex = highestNumberIndex(plays, TRUMP_SUIT);
  if (trumpIndex !== null) return trumpIndex;

  const leadSuit = getLeadSuit(plays);
  if (leadSuit) return highestNumberIndex(plays, leadSuit);

  return 0;
}

export function getWinningPlayIndex(plays: SkullKingTrickPlay[]): number | null {
  if (plays.length === 0) return null;

  const activeLeviathan = getActiveLeviathan(plays);
  if (activeLeviathan?.type === "kraken") return null;
  if (activeLeviathan?.type === "white_whale") {
    return highestNumberAnySuitIndex(plays);
  }

  return getWinningPlayIndexWithoutLeviathanEffect(plays);
}

export function getNextTrickLeadPlayerId(plays: SkullKingTrickPlay[]): PlayerID | null {
  const activeLeviathan = getActiveLeviathan(plays);
  if (activeLeviathan?.type === "white_whale" && highestNumberAnySuitIndex(plays) === null) {
    return plays[activeLeviathan.index]?.playerId ?? null;
  }

  if (activeLeviathan?.type === "kraken") {
    const normalizedPlays = plays.map((play) => {
      if (play.card.card.type !== "kraken" && play.card.card.type !== "white_whale") return play;
      return {
        ...play,
        card: {
          ...play.card,
          card: { type: "escape" as const },
        },
      };
    });
    const wouldHaveWonIndex = getWinningPlayIndexWithoutLeviathanEffect(normalizedPlays);
    return wouldHaveWonIndex === null ? null : plays[wouldHaveWonIndex]?.playerId ?? null;
  }

  const winningPlayIndex = getWinningPlayIndex(plays);
  return winningPlayIndex === null ? null : plays[winningPlayIndex]?.playerId ?? null;
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
  const activeLeviathan = getActiveLeviathan(trick.plays);
  const pirateCaptureCount = trick.plays.filter((play) => isPirateLike(play.card.card)).length;
  const mermaidCount = trick.plays.filter((play) => play.card.card.type === "mermaid").length;
  const hasSkullKing = trick.plays.some((play) => play.card.card.type === "skull_king");

  for (const play of trick.plays) {
    const card = play.card.card;
    if (card.type !== "number" || card.rank !== 14) continue;
    events.push({
      playerId: winningPlay.playerId,
      points: card.suit === TRUMP_SUIT ? 20 : 10,
      reason: card.suit === TRUMP_SUIT ? "black_fourteen_capture" : "standard_fourteen_capture",
    });
  }

  if (activeLeviathan?.type === "white_whale") {
    return events;
  }

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
      points: 40,
      reason: "mermaid_skull_king_capture",
    });
  }

  if (isPirateLike(winningCard) && mermaidCount > 0) {
    events.push({
      playerId: winningPlay.playerId,
      points: mermaidCount * 20,
      reason: "pirate_mermaid_capture",
    });
  }

  for (const play of trick.plays) {
    if (play.card.card.type !== "loot" || play.playerId === winningPlay.playerId) continue;
    const requiredExactPlayerIds = [play.playerId, winningPlay.playerId];
    events.push(
      {
        playerId: play.playerId,
        points: 20,
        reason: "loot_success",
        requiredExactPlayerIds,
      },
      {
        playerId: winningPlay.playerId,
        points: 20,
        reason: "loot_success",
        requiredExactPlayerIds,
      },
    );
  }

  return events;
}

export function getNextPlayerId(order: PlayerID[], currentPlayerId: PlayerID): PlayerID | null {
  const index = order.indexOf(currentPlayerId);
  if (index === -1 || order.length === 0) return null;
  return order[(index + 1) % order.length] ?? null;
}
