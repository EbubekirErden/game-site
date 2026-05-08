import { getCardCopies, getCardDef } from "@game-site/shared";
import type { BotObservation, CardID, LoveLetterMode, PlayerID, PlayerViewState } from "@game-site/shared";
import type { BotPlayDecision } from "./botBrain.js";
import { listBotActionCandidates } from "./botBrain.js";

// Heuristic tactic map:
// - `getThreatScore`: "always pressure the current leader first"
// - `getKnownHandCard`: "Priest and compare reads stay live until contradicted"
// - `scoreGuess`: "use known facts first, then remaining distribution, then right-side pressure"
// - `scorePairTactics`: direct pair-combo advice translated from tactics.md
type VisiblePlayer = PlayerViewState["players"][number];
type BotDifficulty = "smart" | "hard";

function getPlayer(view: BotObservation, playerId: PlayerID): VisiblePlayer | null {
  return view.players.find((player) => player.id === playerId) ?? null;
}

function getSelfPlayer(view: BotObservation): VisiblePlayer | null {
  return getPlayer(view, view.selfPlayerId);
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

function getRightSidePlayerId(view: BotObservation): PlayerID | null {
  const selfIndex = view.players.findIndex((player) => player.id === view.selfPlayerId);
  if (selfIndex < 0 || view.players.length < 2) return null;

  for (let offset = 1; offset < view.players.length; offset += 1) {
    const candidate = view.players[(selfIndex - offset + view.players.length) % view.players.length];
    if (candidate?.id !== view.selfPlayerId && candidate?.status === "active") {
      return candidate.id;
    }
  }

  return null;
}

function getThreatScore(view: BotObservation, playerId: PlayerID): number {
  // Tactic: when several plays are close, lean toward the player most likely to win the match first.
  const player = getPlayer(view, playerId);
  if (!player) return Number.NEGATIVE_INFINITY;

  const tokensWeight = player.tokens * 100;
  const discardWeight = getVisibleDiscardStrength(view, playerId) * 2;
  const protectionPenalty = player.protectedUntilNextTurn ? -20 : 0;
  const knownHandBonus = getKnownHandValue(view, playerId) ?? 0;
  return tokensWeight + discardWeight + protectionPenalty + knownHandBonus;
}

function getMostThreateningPlayerId(view: BotObservation, excludePlayerId: PlayerID | null = null): PlayerID | null {
  const ranked = view.players
    .filter((player) => player.status === "active" && player.id !== view.selfPlayerId && player.id !== excludePlayerId)
    .map((player) => ({ playerId: player.id, score: getThreatScore(view, player.id) }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.playerId ?? null;
}

export function chooseSmartBotPlay(view: BotObservation): BotPlayDecision | null {
  return chooseHeuristicBotPlay(view, "smart");
}

export function chooseHardBotPlay(view: BotObservation): BotPlayDecision | null {
  return chooseHeuristicBotPlay(view, "hard");
}

function chooseHeuristicBotPlay(view: BotObservation, difficulty: BotDifficulty): BotPlayDecision | null {
  const candidates = listBotActionCandidates(view);
  if (candidates.length === 0) return null;

  // Add a small random tie-break so equally good plays do not look mechanical.
  const scored = candidates.map((decision) => ({
    decision,
    score: scoreDecision(view, decision, difficulty) + Math.random() * (difficulty === "hard" ? 0.0005 : 0.001),
  }));
  scored.sort((left, right) => right.score - left.score);

  return scored[0]?.decision ?? null;
}

export function chooseSmartCardinalPeekTarget(view: BotObservation): PlayerID | null {
  return chooseHeuristicCardinalPeekTarget(view, "smart");
}

export function chooseHardCardinalPeekTarget(view: BotObservation): PlayerID | null {
  return chooseHeuristicCardinalPeekTarget(view, "hard");
}

function chooseHeuristicCardinalPeekTarget(view: BotObservation, difficulty: BotDifficulty): PlayerID | null {
  if (view.selfRole !== "player") return null;

  const pending = view.round?.pendingCardinalPeek;
  if (!pending || pending.actorPlayerId !== view.selfPlayerId) return null;

  // Peek at the player whose visible hand or discard history looks strongest.
  const rankedTargets = [...pending.targetPlayerIds]
    .map((playerId) => ({
      playerId,
      score:
        getKnownHandValue(view, playerId) ??
        (difficulty === "hard" ? getVisibleDiscardStrength(view, playerId) * 1.5 : getVisibleDiscardStrength(view, playerId)),
    }))
    .sort((left, right) => right.score - left.score);

  return rankedTargets[0]?.playerId ?? null;
}

export function getSmartBotDisplayName(existingNames: string[]): string {
  return getBotDisplayNameWithPrefix(existingNames, "Smart Bot");
}

export function getHardBotDisplayName(existingNames: string[]): string {
  return getBotDisplayNameWithPrefix(existingNames, "Hard Bot");
}

function getBotDisplayNameWithPrefix(existingNames: string[], prefix: string): string {
  let botNumber = 1;
  const usedNames = new Set(existingNames);

  while (usedNames.has(`${prefix} ${botNumber}`)) {
    botNumber += 1;
  }

  return `${prefix} ${botNumber}`;
}

function scoreDecision(view: BotObservation, decision: BotPlayDecision, difficulty: BotDifficulty): number {
  const self = getSelfPlayer(view);
  const playedCard = self?.hand.find((card) => card.instanceId === decision.instanceId);
  if (!self || !playedCard) return Number.NEGATIVE_INFINITY;

  const cardId = playedCard.cardId;
  const handCardIds = self.hand.map((card) => card.cardId);
  const remainingCardIds = self.hand
    .filter((card) => card.instanceId !== decision.instanceId)
    .map((card) => card.cardId);
  const keptCardId = remainingCardIds[0] ?? null;
  const remainingValue = remainingCardIds.length > 0 ? Math.max(...remainingCardIds.map(getCardValue)) : 0;
  const targetId = decision.targetPlayerId ?? decision.targetPlayerIds?.[0] ?? null;

  let score = getBaseCardScore(cardId, difficulty);
  const infoWeight = difficulty === "hard" ? 1.3 : 1;
  const safetyWeight = difficulty === "hard" ? 1.2 : 1;

  if (cardId === "princess") {
    // Never voluntarily discard Princess unless the rules force it.
    score -= difficulty === "hard" ? 12_000 : 10_000;
  }

  if (mustPlayCountess(handCardIds)) {
    // Countess should be played immediately when paired with Prince or King.
    score += cardId === "countess" ? (difficulty === "hard" ? 6_000 : 5_000) : difficulty === "hard" ? -6_000 : -5_000;
  } else if (cardId === "countess") {
    // Countess is usually a tempo loss when it is not mandatory.
    score -= difficulty === "hard" ? 35 : 25;
  }

  switch (cardId) {
    case "guard":
    case "bishop":
      // Prefer guesses that fit the hidden-card distribution.
      score += scoreGuess(view, decision, cardId, difficulty);
      break;
    case "prince":
      // Use Prince on a Princess if one is known, otherwise target low-value hands.
      score += scorePrinceTarget(view, self.id, targetId, remainingCardIds, difficulty);
      break;
    case "baron":
      // Baron wants a comparison that our remaining hand is likely to win.
      score += scoreCompareTarget(view, targetId, remainingValue, "higher_is_better", difficulty);
      break;
    case "dowager_queen":
      // Dowager Queen wants a comparison that our remaining hand is likely to lose.
      score += scoreCompareTarget(view, targetId, remainingValue, "lower_is_better", difficulty);
      break;
    case "king":
      // Trade hands when the target looks weaker than the card we keep.
      score += scoreKingTarget(view, targetId, remainingValue, difficulty);
      break;
    case "cardinal":
      // Cardinal should usually include self plus one other player to keep tempo.
      score += scoreCardinalTargets(view, self.id, decision.targetPlayerIds ?? [], remainingValue, difficulty);
      break;
    case "baroness":
    case "priest":
      // Information cards should target the most informative player available.
      score += scoreInformationTarget(view, decision.targetPlayerId ? [decision.targetPlayerId] : decision.targetPlayerIds ?? [], difficulty) * infoWeight;
      break;
    case "handmaid":
      // Handmaid is better when we are protecting a threatening follow-up card.
      score += (isHoldingHighCard(remainingCardIds) ? 10 : 2) * safetyWeight;
      break;
    case "sycophant":
      // Sycophant is weak on self and slightly better when aimed elsewhere.
      score += targetId === self.id ? -4 : 1;
      break;
    case "jester":
      // Jester is best when the target is already showing a strong discard pile.
      score += targetId ? getVisibleDiscardStrength(view, targetId) * 0.5 : 0;
      break;
    default:
      break;
  }

  // Pair-specific tactics sit on top of the generic card heuristics.
  score += scorePairTactics(view, decision, cardId, keptCardId, difficulty);

  // After the play, reward hands that still contain safe, high-value follow-up cards.
  score += scoreHandSafetyAfterPlay(remainingCardIds, difficulty) * safetyWeight;
  return score;
}

function getBaseCardScore(cardId: CardID, difficulty: BotDifficulty = "smart"): number {
  switch (cardId) {
    case "guard":
      // Guard is the strongest pure tempo card when a good guess is available.
      return difficulty === "hard" ? 17 : 16;
    case "priest":
    case "baroness":
      // Information cards are strong because they improve future decision quality.
      return difficulty === "hard" ? 14 : 13;
    case "handmaid":
      // Handmaid is valuable when it protects a strong hand from disruption.
      return difficulty === "hard" ? 12 : 11;
    case "prince":
      // Prince is usually good because it can force a discard or clear danger.
      return difficulty === "hard" ? 10 : 9;
    case "count":
    case "constable":
    case "assassin":
      // Mid-value utility cards get a neutral-positive baseline.
      return 8;
    case "bishop":
      // Bishop is strong when the guess is well informed.
      return difficulty === "hard" ? 8 : 7;
    case "baron":
    case "dowager_queen":
      // Comparison cards are high leverage but rely on target quality.
      return difficulty === "hard" ? 6 : 5;
    case "cardinal":
    case "jester":
      // These are situational value cards that depend on table state.
      return difficulty === "hard" ? 5 : 4;
    case "sycophant":
      // Sycophant is niche and usually weaker than direct information or tempo.
      return 2;
    case "king":
      // King is modest because the trade can help or hurt depending on context.
      return difficulty === "hard" ? 2 : 1;
    case "countess":
      // Countess is mainly a forced-play tax, not a card we want to hold.
      return difficulty === "hard" ? -10 : -8;
    case "princess":
      // Princess is a trap card that should almost never be played directly.
      return difficulty === "hard" ? -120 : -100;
    default:
      return 0;
  }
}

function scoreHandSafetyAfterPlay(remainingCardIds: CardID[], difficulty: BotDifficulty): number {
  // Keep the bot biased toward endings that still preserve strong or forced-value cards.
  if (remainingCardIds.includes("princess")) return difficulty === "hard" ? 16 : 12;
  if (remainingCardIds.includes("countess")) return difficulty === "hard" ? 7 : 5;
  return remainingCardIds.reduce((total, cardId) => total + getCardValue(cardId) * (difficulty === "hard" ? 0.25 : 0.2), 0);
}

function isHoldingHighCard(cardIds: CardID[]): boolean {
  // Treat any card at or above mid-strength as a reason to shelter behind Handmaid.
  return cardIds.some((cardId) => getCardValue(cardId) >= 6);
}

function isLateRound(view: BotObservation): boolean {
  return (view.round?.deckCount ?? Number.POSITIVE_INFINITY) <= 2;
}

function getRemainingCopies(view: BotObservation, cardId: CardID): number {
  let remaining = getCardCopies(cardId, view.mode);

  for (const player of view.players) {
    for (const card of [...player.hand, ...player.discardPile]) {
      if (card.cardId === cardId) {
        remaining -= 1;
      }
    }
  }

  for (const card of view.round?.visibleRemovedCards ?? []) {
    if (card.cardId === cardId) {
      remaining -= 1;
    }
  }

  return Math.max(0, remaining);
}

function hasStrongGuessOpportunity(view: BotObservation, decision: BotPlayDecision, cardId: "guard" | "bishop"): boolean {
  if (!decision.targetPlayerId || decision.guessedValue == null) return false;

  const knownCardId = getKnownHandCard(view, decision.targetPlayerId);
  if (knownCardId) {
    return getCardValue(knownCardId) === decision.guessedValue;
  }

  // Late in the round, a distribution-backed guess is often strong enough to cash in immediately.
  return isLateRound(view) && getMostLikelyUnknownValue(view, cardId) === decision.guessedValue;
}

function isKingSwapClearlyGood(view: BotObservation, targetId: PlayerID | null, remainingValue: number): boolean {
  if (!targetId) return false;

  const targetValue = getKnownHandValue(view, targetId);
  if (targetValue == null) return false;

  return targetValue - remainingValue >= 2;
}

function scorePairTactics(
  view: BotObservation,
  decision: BotPlayDecision,
  playedCardId: CardID,
  keptCardId: CardID | null,
  difficulty: BotDifficulty,
): number {
  if (!keptCardId) return 0;

  const lateRound = isLateRound(view);
  const targetId = decision.targetPlayerId ?? decision.targetPlayerIds?.[0] ?? null;
  const guardPressure = getRemainingCopies(view, "guard");
  const compareTargetValue = targetId ? getKnownHandValue(view, targetId) : null;
  const keptValue = getCardValue(keptCardId);

  // These adjustments are the "pair of cards in hand" rules from tactics.md.
  switch (`${playedCardId}:${keptCardId}`) {
    case "priest:guard":
      // Tactic: Guard/Priest usually keeps Guard and improves it with information first.
      return lateRound ? 6 : difficulty === "hard" ? 18 : 14;
    case "guard:priest":
      // Tactic: cash Guard now only when the read is already strong or the round is almost over.
      return hasStrongGuessOpportunity(view, decision, "guard") ? 4 : lateRound ? -4 : difficulty === "hard" ? -18 : -14;
    case "priest:baron":
      // Tactic: Priest/Baron prefers info first unless Baron already has a clean compare.
      return compareTargetValue != null && keptValue > compareTargetValue ? 0 : difficulty === "hard" ? 12 : 8;
    case "baron:priest":
      return compareTargetValue != null && keptValue > compareTargetValue ? difficulty === "hard" ? 10 : 7 : -4;
    case "priest:king":
      // Tactic: Priest/King usually waits for a more reliable swap window.
      return isKingSwapClearlyGood(view, targetId, keptValue) && lateRound ? 2 : difficulty === "hard" ? 10 : 7;
    case "king:priest":
      return isKingSwapClearlyGood(view, targetId, keptValue) || lateRound ? 2 : difficulty === "hard" ? -12 : -9;
    case "handmaid:guard":
      // Tactic: Guard/Handmaid buys time when the guess is soft and live Guards still exist.
      return !hasStrongGuessOpportunity(view, decision, "guard") && guardPressure > 0 ? (lateRound ? 3 : difficulty === "hard" ? 9 : 7) : 0;
    case "guard:handmaid":
      return !hasStrongGuessOpportunity(view, decision, "guard") && guardPressure > 0 ? (lateRound ? -1 : difficulty === "hard" ? -8 : -6) : 3;
    case "handmaid:princess":
      // Tactic: Handmaid/Princess should almost always preserve the Princess safely.
      return difficulty === "hard" ? 32 : 24;
    default:
      return 0;
  }
}

function scoreGuess(view: BotObservation, decision: BotPlayDecision, cardId: "guard" | "bishop", difficulty: BotDifficulty): number {
  if (!decision.targetPlayerId || decision.guessedValue == null) return -8;

  const targetThreat = getThreatScore(view, decision.targetPlayerId);
  const rightSidePlayerId = getRightSidePlayerId(view);
  const knownCardId = getKnownHandCard(view, decision.targetPlayerId);
  if (knownCardId) {
    // When we know the hand, correctness matters far more than distribution priors.
    return getCardValue(knownCardId) === decision.guessedValue
      ? (difficulty === "hard" ? 100 : 80) + targetThreat * 0.05
      : difficulty === "hard"
        ? -45
        : -30;
  }

  // Otherwise, guess the most likely unseen value and penalize distance from it.
  const likelyValue = getMostLikelyUnknownValue(view, cardId);
  const rightSideBonus = decision.targetPlayerId === rightSidePlayerId ? (difficulty === "hard" ? 1.5 : 1) : 0;
  return decision.guessedValue === likelyValue
    ? (difficulty === "hard" ? 12 : 8) + targetThreat * 0.03 + rightSideBonus
    : -Math.abs(decision.guessedValue - likelyValue) * (difficulty === "hard" ? 0.45 : 0.35) - targetThreat * 0.02 - rightSideBonus * 0.5;
}

function scorePrinceTarget(view: BotObservation, selfPlayerId: PlayerID, targetId: PlayerID | null, remainingCardIds: CardID[], difficulty: BotDifficulty): number {
  if (!targetId) return -4;

  const knownCardId = getKnownHandCard(view, targetId);
  const targetThreat = getThreatScore(view, targetId);
  if (targetId === selfPlayerId) {
    // Self-target Prince is mainly a way to cycle away dead weight.
    if (remainingCardIds.includes("princess")) return -2_000;
    return remainingCardIds.some((cardId) => getCardValue(cardId) <= 2) ? (difficulty === "hard" ? 4 : 2) : difficulty === "hard" ? -12 : -20;
  }

  // Prefer known Princess targets, then other known high-value hands, then uncertain but strong-looking players.
  if (knownCardId === "princess") return (difficulty === "hard" ? 140 : 120) + targetThreat * 0.1;
  if (knownCardId) return getCardValue(knownCardId) * (difficulty === "hard" ? 3.5 : 3) + targetThreat * 0.04;
  return (difficulty === "hard" ? 10 : 8) + getVisibleDiscardStrength(view, targetId) * (difficulty === "hard" ? 0.5 : 0.4) + targetThreat * 0.03;
}

function scoreCompareTarget(
  view: BotObservation,
  targetId: PlayerID | null,
  remainingValue: number,
  mode: "higher_is_better" | "lower_is_better",
  difficulty: BotDifficulty,
): number {
  if (!targetId) return -10;

  const targetValue = getKnownHandValue(view, targetId);
  const targetThreat = getThreatScore(view, targetId);
  if (targetValue == null) {
    // When the target is unknown, compare against our leftover hand strength as a rough heuristic.
    if (mode === "higher_is_better") {
      return remainingValue - (difficulty === "hard" ? 3 : 4) + targetThreat * 0.04;
    }

    return (difficulty === "hard" ? 7 : 6) - remainingValue - targetThreat * 0.03;
  }

  // Baron-style cards want asymmetry; Queen-style cards want the opposite asymmetry.
  if (mode === "higher_is_better") {
    const safetyMargin = remainingValue - targetValue;
    return remainingValue > targetValue
      ? (difficulty === "hard" ? 70 : 55) + safetyMargin * (difficulty === "hard" ? 5 : 4) + targetThreat * 0.05
      : difficulty === "hard"
        ? -55
        : -45;
  }

  const safetyMargin = targetValue - remainingValue;
  return remainingValue < targetValue
    ? (difficulty === "hard" ? 70 : 55) + safetyMargin * (difficulty === "hard" ? 5 : 4) - targetThreat * 0.02
    : difficulty === "hard"
      ? -55
      : -45;
}

function scoreKingTarget(view: BotObservation, targetId: PlayerID | null, remainingValue: number, difficulty: BotDifficulty): number {
  if (!targetId) return -12;

  const targetValue = getKnownHandValue(view, targetId);
  const targetThreat = getThreatScore(view, targetId);
  const roundTempo = isLateRound(view) ? (difficulty === "hard" ? 8 : 6) : difficulty === "hard" ? -8 : -6;
  // King is good when our kept card is worse than the target's known or inferred hand.
  if (targetValue == null) return (difficulty === "hard" ? 7 : 5) - remainingValue + targetThreat * 0.02 + roundTempo;
  return (targetValue - remainingValue) * (difficulty === "hard" ? 1.1 : 1) + targetThreat * 0.03 + roundTempo;
}

function scoreCardinalTargets(view: BotObservation, selfPlayerId: PlayerID, targetIds: PlayerID[], remainingValue: number, difficulty: BotDifficulty): number {
  if (targetIds.length !== 2) return -8;
  if (!targetIds.includes(selfPlayerId)) return 8;

  const otherTargetId = targetIds.find((playerId) => playerId !== selfPlayerId) ?? null;
  const otherValue = otherTargetId ? getKnownHandValue(view, otherTargetId) : null;
  const otherThreat = otherTargetId ? getThreatScore(view, otherTargetId) : 0;
  // Cardinal is most useful when it lets us combine self-knowledge with a weak opposing target.
  if (otherValue == null) return (difficulty === "hard" ? 4 : 3) - remainingValue + otherThreat * 0.03;
  return (otherValue - remainingValue) * (difficulty === "hard" ? 1.15 : 1) + otherThreat * 0.04;
}

function scoreInformationTarget(view: BotObservation, targetIds: PlayerID[], difficulty: BotDifficulty): number {
  // Tactic: information cards usually point at the strongest threat unless a compare line already has a solved target.
  const mostThreateningPlayerId = getMostThreateningPlayerId(view);
  return targetIds.reduce((total, playerId) => {
    const alreadyKnown = getKnownHandCard(view, playerId);
    const threatScore = getThreatScore(view, playerId);
    const strongestThreatBonus = playerId === mostThreateningPlayerId ? (difficulty === "hard" ? 18 : 12) : 0;
    if (difficulty === "hard") {
      return total + (alreadyKnown ? -2 : 12) + threatScore * 0.08 + strongestThreatBonus + getVisibleDiscardStrength(view, playerId) * 0.4;
    }

    return total + (alreadyKnown ? 1 : 10) + threatScore * 0.05 + strongestThreatBonus + getVisibleDiscardStrength(view, playerId) * 0.25;
  }, 0);
}

function getKnownHandCard(view: BotObservation, playerId: PlayerID): CardID | null {
  // Use the newest hand fact because later observations supersede earlier guesses.
  const facts = view.memory.observedCardFacts
    .filter((fact) => fact.playerId === playerId && fact.location === "hand" && fact.card)
    .sort((left, right) => right.turnNumber - left.turnNumber);

  const newestFact = facts[0];
  if (!newestFact?.card) return null;

  const cardId = newestFact.card.cardId;
  const discardedLater = view.memory.observedCardFacts.some(
    (fact) =>
      fact.playerId === playerId &&
      fact.location === "discard" &&
      fact.card?.cardId === cardId &&
      fact.turnNumber > newestFact.turnNumber,
  );

  return discardedLater ? null : cardId;
}

function getKnownHandValue(view: BotObservation, playerId: PlayerID): number | null {
  const cardId = getKnownHandCard(view, playerId);
  return cardId ? getCardValue(cardId) : null;
}

function getVisibleDiscardStrength(view: BotObservation, playerId: PlayerID): number {
  const player = view.players.find((candidate) => candidate.id === playerId);
  if (!player) return 0;

  // Strong discard piles make a player look more dangerous or more informative.
  return player.discardPile.reduce((total, card) => total + getCardValue(card.cardId), 0);
}

function getMostLikelyUnknownValue(view: BotObservation, cardId: "guard" | "bishop"): number {
  const legalValues = getGuessValues(view.mode, cardId);
  const remainingByValue = new Map<number, number>();

  for (const value of legalValues) {
    remainingByValue.set(value, 0);
  }

  // Start from the card distribution, then subtract everything already seen in hands and discards.
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
  // Enumerate every card that can contribute to a guess so the distribution stays mode-aware.
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
