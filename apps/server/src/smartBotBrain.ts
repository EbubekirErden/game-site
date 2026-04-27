import { getCardCopies, getCardDef } from "@game-site/shared";
import type { BotObservation, CardID, LoveLetterMode, PlayerID, PlayerViewState } from "@game-site/shared";
import type { BotPlayDecision } from "./botBrain.js";
import { listBotActionCandidates } from "./botBrain.js";

type VisiblePlayer = PlayerViewState["players"][number];

function getSelfPlayer(view: BotObservation): VisiblePlayer | null {
  return view.players.find((player) => player.id === view.selfPlayerId) ?? null;
}

function getCardValue(cardId: CardID): number {
  return getCardDef(cardId).value;
}

function getGuessValues(mode: LoveLetterMode, cardId: CardID): number[] {
  if (cardId === "guard") {
    return mode === "premium" ? [0, 2, 3, 4, 5, 6, 7, 8, 9] : [2, 3, 4, 5, 6, 7, 8];
  }

  if (cardId === "bishop") {
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  }

  return [];
}

function mustPlayCountess(handCardIds: CardID[]): boolean {
  return handCardIds.includes("countess") && (handCardIds.includes("prince") || handCardIds.includes("king"));
}

export function chooseSmartBotPlay(view: BotObservation): BotPlayDecision | null {
  const candidates = listBotActionCandidates(view);
  if (candidates.length === 0) return null;

  const scored = candidates.map((decision) => ({
    decision,
    score: scoreDecision(view, decision) + Math.random() * 0.001,
  }));
  scored.sort((left, right) => right.score - left.score);

  return scored[0]?.decision ?? null;
}

export function chooseSmartCardinalPeekTarget(view: BotObservation): PlayerID | null {
  if (view.selfRole !== "player") return null;

  const pending = view.round?.pendingCardinalPeek;
  if (!pending || pending.actorPlayerId !== view.selfPlayerId) return null;

  const rankedTargets = [...pending.targetPlayerIds]
    .map((playerId) => ({
      playerId,
      score: getKnownHandValue(view, playerId) ?? getVisibleDiscardStrength(view, playerId),
    }))
    .sort((left, right) => right.score - left.score);

  return rankedTargets[0]?.playerId ?? null;
}

export function getSmartBotDisplayName(existingNames: string[]): string {
  let botNumber = 1;
  const usedNames = new Set(existingNames);

  while (usedNames.has(`Smart Bot ${botNumber}`)) {
    botNumber += 1;
  }

  return `Smart Bot ${botNumber}`;
}

function scoreDecision(view: BotObservation, decision: BotPlayDecision): number {
  const self = getSelfPlayer(view);
  const playedCard = self?.hand.find((card) => card.instanceId === decision.instanceId);
  if (!self || !playedCard) return Number.NEGATIVE_INFINITY;

  const cardId = playedCard.cardId;
  const handCardIds = self.hand.map((card) => card.cardId);
  const remainingCardIds = self.hand
    .filter((card) => card.instanceId !== decision.instanceId)
    .map((card) => card.cardId);
  const remainingValue = remainingCardIds.length > 0 ? Math.max(...remainingCardIds.map(getCardValue)) : 0;
  const targetId = decision.targetPlayerId ?? decision.targetPlayerIds?.[0] ?? null;

  let score = getBaseCardScore(cardId);

  if (cardId === "princess") {
    score -= 10_000;
  }

  if (mustPlayCountess(handCardIds)) {
    score += cardId === "countess" ? 5_000 : -5_000;
  } else if (cardId === "countess") {
    score -= 25;
  }

  switch (cardId) {
    case "guard":
    case "bishop":
      score += scoreGuess(view, decision, cardId);
      break;
    case "prince":
      score += scorePrinceTarget(view, self.id, targetId, remainingCardIds);
      break;
    case "baron":
      score += scoreCompareTarget(view, targetId, remainingValue, "higher_is_better");
      break;
    case "dowager_queen":
      score += scoreCompareTarget(view, targetId, remainingValue, "lower_is_better");
      break;
    case "king":
      score += scoreKingTarget(view, targetId, remainingValue);
      break;
    case "cardinal":
      score += scoreCardinalTargets(view, self.id, decision.targetPlayerIds ?? [], remainingValue);
      break;
    case "baroness":
    case "priest":
      score += scoreInformationTarget(view, decision.targetPlayerId ? [decision.targetPlayerId] : decision.targetPlayerIds ?? []);
      break;
    case "handmaid":
      score += isHoldingHighCard(remainingCardIds) ? 10 : 2;
      break;
    case "sycophant":
      score += targetId === self.id ? -4 : 1;
      break;
    case "jester":
      score += targetId ? getVisibleDiscardStrength(view, targetId) * 0.5 : 0;
      break;
    default:
      break;
  }

  score += scoreHandSafetyAfterPlay(remainingCardIds);
  return score;
}

function getBaseCardScore(cardId: CardID): number {
  switch (cardId) {
    case "guard":
      return 16;
    case "priest":
    case "baroness":
      return 13;
    case "handmaid":
      return 11;
    case "prince":
      return 9;
    case "count":
    case "constable":
    case "assassin":
      return 8;
    case "bishop":
      return 7;
    case "baron":
    case "dowager_queen":
      return 5;
    case "cardinal":
    case "jester":
      return 4;
    case "sycophant":
      return 2;
    case "king":
      return 1;
    case "countess":
      return -8;
    case "princess":
      return -100;
    default:
      return 0;
  }
}

function scoreHandSafetyAfterPlay(remainingCardIds: CardID[]): number {
  if (remainingCardIds.includes("princess")) return 12;
  if (remainingCardIds.includes("countess")) return 5;
  return remainingCardIds.reduce((total, cardId) => total + getCardValue(cardId) * 0.2, 0);
}

function isHoldingHighCard(cardIds: CardID[]): boolean {
  return cardIds.some((cardId) => getCardValue(cardId) >= 6);
}

function scoreGuess(view: BotObservation, decision: BotPlayDecision, cardId: "guard" | "bishop"): number {
  if (!decision.targetPlayerId || decision.guessedValue == null) return -8;

  const knownCardId = getKnownHandCard(view, decision.targetPlayerId);
  if (knownCardId) {
    return getCardValue(knownCardId) === decision.guessedValue ? 80 : -30;
  }

  const likelyValue = getMostLikelyUnknownValue(view, cardId);
  return decision.guessedValue === likelyValue ? 8 : -Math.abs(decision.guessedValue - likelyValue) * 0.35;
}

function scorePrinceTarget(view: BotObservation, selfPlayerId: PlayerID, targetId: PlayerID | null, remainingCardIds: CardID[]): number {
  if (!targetId) return -4;

  const knownCardId = getKnownHandCard(view, targetId);
  if (targetId === selfPlayerId) {
    if (remainingCardIds.includes("princess")) return -2_000;
    return remainingCardIds.some((cardId) => getCardValue(cardId) <= 2) ? 2 : -20;
  }

  if (knownCardId === "princess") return 120;
  if (knownCardId) return getCardValue(knownCardId) * 3;
  return 8 + getVisibleDiscardStrength(view, targetId) * 0.4;
}

function scoreCompareTarget(
  view: BotObservation,
  targetId: PlayerID | null,
  remainingValue: number,
  mode: "higher_is_better" | "lower_is_better",
): number {
  if (!targetId) return -10;

  const targetValue = getKnownHandValue(view, targetId);
  if (targetValue == null) {
    return mode === "higher_is_better" ? remainingValue - 4 : 6 - remainingValue;
  }

  if (mode === "higher_is_better") {
    return remainingValue > targetValue ? 55 : -45;
  }

  return remainingValue < targetValue ? 55 : -45;
}

function scoreKingTarget(view: BotObservation, targetId: PlayerID | null, remainingValue: number): number {
  if (!targetId) return -12;

  const targetValue = getKnownHandValue(view, targetId);
  if (targetValue == null) return 5 - remainingValue;
  return targetValue - remainingValue;
}

function scoreCardinalTargets(view: BotObservation, selfPlayerId: PlayerID, targetIds: PlayerID[], remainingValue: number): number {
  if (targetIds.length !== 2) return -8;
  if (!targetIds.includes(selfPlayerId)) return 8;

  const otherTargetId = targetIds.find((playerId) => playerId !== selfPlayerId) ?? null;
  const otherValue = otherTargetId ? getKnownHandValue(view, otherTargetId) : null;
  if (otherValue == null) return 3 - remainingValue;
  return otherValue - remainingValue;
}

function scoreInformationTarget(view: BotObservation, targetIds: PlayerID[]): number {
  return targetIds.reduce((total, playerId) => {
    const alreadyKnown = getKnownHandCard(view, playerId);
    return total + (alreadyKnown ? 1 : 10) + getVisibleDiscardStrength(view, playerId) * 0.25;
  }, 0);
}

function getKnownHandCard(view: BotObservation, playerId: PlayerID): CardID | null {
  const facts = view.memory.observedCardFacts
    .filter((fact) => fact.playerId === playerId && fact.location === "hand" && fact.card)
    .sort((left, right) => right.turnNumber - left.turnNumber);

  return facts[0]?.card?.cardId ?? null;
}

function getKnownHandValue(view: BotObservation, playerId: PlayerID): number | null {
  const cardId = getKnownHandCard(view, playerId);
  return cardId ? getCardValue(cardId) : null;
}

function getVisibleDiscardStrength(view: BotObservation, playerId: PlayerID): number {
  const player = view.players.find((candidate) => candidate.id === playerId);
  if (!player) return 0;

  return player.discardPile.reduce((total, card) => total + getCardValue(card.cardId), 0);
}

function getMostLikelyUnknownValue(view: BotObservation, cardId: "guard" | "bishop"): number {
  const legalValues = getGuessValues(view.mode, cardId);
  const remainingByValue = new Map<number, number>();

  for (const value of legalValues) {
    remainingByValue.set(value, 0);
  }

  for (const candidateCard of getAllGuessableCards(view.mode, legalValues)) {
    remainingByValue.set(candidateCard.value, (remainingByValue.get(candidateCard.value) ?? 0) + candidateCard.copies);
  }

  for (const player of view.players) {
    for (const card of [...player.hand, ...player.discardPile]) {
      const value = getCardValue(card.cardId);
      if (remainingByValue.has(value)) {
        remainingByValue.set(value, Math.max(0, (remainingByValue.get(value) ?? 0) - 1));
      }
    }
  }

  return [...remainingByValue.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0])[0]?.[0] ?? legalValues[0] ?? 2;
}

function getAllGuessableCards(mode: LoveLetterMode, values: number[]): Array<{ value: number; copies: number }> {
  const valueSet = new Set(values);
  const cardIds: CardID[] = [
    "assassin",
    "jester",
    "guard",
    "cardinal",
    "priest",
    "baron",
    "baroness",
    "handmaid",
    "sycophant",
    "prince",
    "count",
    "constable",
    "king",
    "countess",
    "dowager_queen",
    "princess",
    "bishop",
  ];

  return cardIds
    .map((candidateCardId) => ({
      value: getCardValue(candidateCardId),
      copies: getCardCopies(candidateCardId, mode),
    }))
    .filter((candidate) => candidate.copies > 0 && valueSet.has(candidate.value));
}
