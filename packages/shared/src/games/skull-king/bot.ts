import { NUMBER_SUITS, TRUMP_SUIT, buildSkullKingDeck } from "./cards.js";
import { scoreBid } from "./scoring.js";
import { canPlayCard, getLeadSuit, getWinningPlayIndex, materializePlayedCard } from "./rules.js";
import type {
  PlayerID,
  SkullKingBotStrategy,
  SkullKingCard,
  SkullKingCardInstance,
  SkullKingPlayerViewState,
  SkullKingSuit,
  SkullKingTrickPlay,
  TigressPlayMode,
} from "./types.js";

export type SkullKingBotAction =
  | { type: "bid"; bid: number }
  | { type: "play_card"; instanceId: string; tigressMode?: TigressPlayMode };

type BotContext = {
  view: SkullKingPlayerViewState;
  self: SkullKingPlayerViewState["players"][number];
  round: NonNullable<SkullKingPlayerViewState["round"]>;
  observedCards: SkullKingCard[];
  unseenCards: SkullKingCard[];
  voidTracker: Map<PlayerID, Set<SkullKingSuit>>;
};

type CandidateAction = {
  instanceId: string;
  tigressMode?: TigressPlayMode;
  card: SkullKingCard;
  originalCard: SkullKingCardInstance;
  playsAfter: SkullKingTrickPlay[];
  selfWinningNow: boolean;
  winnerIdNow: PlayerID | null;
  remainingPlayerCount: number;
  winChance: number;
  power: number;
  escapeValue: number;
  bonusPotential: number;
  opponentPressure: number;
  voidDanger: number;
};

function randomIndex(length: number, rng: () => number): number {
  return Math.max(0, Math.min(length - 1, Math.floor(rng() * length)));
}

function chooseRandom<T>(items: T[], rng: () => number): T | null {
  if (items.length === 0) return null;
  return items[randomIndex(items.length, rng)] ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cardSignature(card: SkullKingCard): string {
  if (card.type === "number") return `${card.type}:${card.suit}:${card.rank}`;
  return card.type;
}

function normalizeCard(card: SkullKingCard): SkullKingCard {
  if (card.type === "tigress") return { type: "tigress" };
  return card;
}

function isEscapeLike(card: SkullKingCard): boolean {
  return card.type === "escape" || card.type === "loot" || (card.type === "tigress" && card.mode === "escape");
}

function isPirateLike(card: SkullKingCard): boolean {
  return card.type === "pirate" || (card.type === "tigress" && card.mode === "pirate");
}

function makeSyntheticInstance(card: SkullKingCard, id = `synthetic-${cardSignature(card)}`): SkullKingCardInstance {
  return { instanceId: id, card };
}

function getVisibleCards(view: SkullKingPlayerViewState, self: SkullKingPlayerViewState["players"][number]): SkullKingCard[] {
  const completed = view.round?.completedTricks.flatMap((trick) => trick.plays.map((play) => normalizeCard(play.card.card))) ?? [];
  const current = view.round?.currentTrick.plays.map((play) => normalizeCard(play.card.card)) ?? [];
  const hand = self.hand.map((card) => normalizeCard(card.card));
  return [...completed, ...current, ...hand];
}

function getUnseenCards(observedCards: SkullKingCard[]): SkullKingCard[] {
  const remainingCounts = new Map<string, { card: SkullKingCard; count: number }>();
  for (const instance of buildSkullKingDeck(() => "deck")) {
    const card = normalizeCard(instance.card);
    const key = cardSignature(card);
    const current = remainingCounts.get(key);
    remainingCounts.set(key, { card, count: (current?.count ?? 0) + 1 });
  }

  for (const observed of observedCards) {
    const key = cardSignature(normalizeCard(observed));
    const entry = remainingCounts.get(key);
    if (!entry) continue;
    entry.count = Math.max(0, entry.count - 1);
  }

  return [...remainingCounts.values()].flatMap((entry) => Array.from({ length: entry.count }, () => entry.card));
}

function getSuitEstablishingPlayIndex(plays: SkullKingTrickPlay[], leadSuit: string): number {
  return plays.findIndex((play) => play.card.card.type === "number" && play.card.card.suit === leadSuit);
}

function addVoid(voidTracker: Map<PlayerID, Set<SkullKingSuit>>, playerId: PlayerID, suit: SkullKingSuit): void {
  const existing = voidTracker.get(playerId);
  if (existing) {
    existing.add(suit);
    return;
  }
  voidTracker.set(playerId, new Set([suit]));
}

function updateVoidTrackerFromPlays(voidTracker: Map<PlayerID, Set<SkullKingSuit>>, plays: SkullKingTrickPlay[]): void {
  const leadSuit = getLeadSuit(plays) as SkullKingSuit | null;
  if (!leadSuit) return;

  const suitEstablishedAt = getSuitEstablishingPlayIndex(plays, leadSuit);
  if (suitEstablishedAt === -1) return;

  const obligationStartIndex = plays[0]?.card.card.type === "number" ? 1 : suitEstablishedAt + 1;
  for (let index = obligationStartIndex; index < plays.length; index += 1) {
    const play = plays[index];
    if (!play) continue;

    const card = play.card.card;
    if (card.type === "number" && card.suit === leadSuit) continue;
    addVoid(voidTracker, play.playerId, leadSuit);
  }
}

function createVoidTracker(view: SkullKingPlayerViewState): Map<PlayerID, Set<SkullKingSuit>> {
  const voidTracker = new Map<PlayerID, Set<SkullKingSuit>>();
  for (const player of view.players) {
    voidTracker.set(player.id, new Set());
  }

  for (const trick of view.round?.completedTricks ?? []) {
    updateVoidTrackerFromPlays(voidTracker, trick.plays);
  }
  updateVoidTrackerFromPlays(voidTracker, view.round?.currentTrick.plays ?? []);

  return voidTracker;
}

function createBotContext(view: SkullKingPlayerViewState): BotContext | null {
  const self = view.players.find((player) => player.id === view.selfPlayerId);
  const round = view.round;
  if (!self || !round) return null;

  const observedCards = getVisibleCards(view, self);
  return {
    view,
    self,
    round,
    observedCards,
    unseenCards: getUnseenCards(observedCards),
    voidTracker: createVoidTracker(view),
  };
}

function intrinsicCardPower(card: SkullKingCard, unseenCards: SkullKingCard[] = []): number {
  if (card.type === "skull_king") {
    const unseenMermaids = unseenCards.filter((candidate) => candidate.type === "mermaid").length;
    return clamp(0.96 - unseenMermaids * 0.08, 0.72, 0.96);
  }
  if (card.type === "tigress") return 0.76;
  if (card.type === "pirate") return 0.74;
  if (card.type === "mermaid") return unseenCards.some((candidate) => candidate.type === "skull_king") ? 0.64 : 0.5;
  if (card.type === "kraken") return 0.18;
  if (card.type === "white_whale") return 0.28;
  if (card.type === "loot") return 0.05;
  if (card.type === "escape") return 0.02;
  if (card.type === "number") {
    const suitBoost = card.suit === TRUMP_SUIT ? 0.2 : 0;
    return clamp(0.04 + card.rank / 14 * 0.48 + suitBoost, 0.04, 0.86);
  }
  return 0.1;
}

function estimateHandTricks(hand: SkullKingCardInstance[], unseenCards: SkullKingCard[]): number {
  const raw = hand.reduce((total, instance) => total + intrinsicCardPower(instance.card, unseenCards), 0);
  const suitSupport = NUMBER_SUITS.reduce((total, suit) => {
    const suitedCards = hand.filter((instance) => instance.card.type === "number" && instance.card.suit === suit);
    if (suitedCards.length < 2) return total;
    const highCards = suitedCards.filter((instance) => instance.card.type === "number" && instance.card.rank >= 11).length;
    return total + Math.min(0.25, highCards * 0.08 + suitedCards.length * 0.02);
  }, 0);
  return clamp(raw + suitSupport, 0, hand.length);
}

function estimateNilSafety(hand: SkullKingCardInstance[], unseenCards: SkullKingCard[]): number {
  if (hand.length === 0) return 1;
  const danger = hand.reduce((total, instance) => {
    const card = instance.card;
    if (card.type === "escape" || card.type === "loot") return total + 0.02;
    if (card.type === "kraken" || card.type === "white_whale") return total + 0.1;
    if (card.type === "number" && card.rank <= 5 && card.suit !== TRUMP_SUIT) return total + 0.08;
    return total + intrinsicCardPower(card, unseenCards);
  }, 0);
  return clamp(1 - danger / Math.max(1, hand.length), 0, 1);
}

function chooseBid(ctx: BotContext, strategy: SkullKingBotStrategy): number {
  const roundNumber = ctx.round.roundNumber;
  const expected = estimateHandTricks(ctx.self.hand, ctx.unseenCards);
  const nilSafety = estimateNilSafety(ctx.self.hand, ctx.unseenCards);

  if (strategy === "safe") {
    if (roundNumber === 1) return 1;
    const conservative = Math.floor(expected * 0.65);
    return clamp(Math.max(1, conservative), 1, roundNumber);
  }

  if (strategy === "aggressive") {
    if (nilSafety > 0.72 || (roundNumber <= 3 && expected < 0.75)) return 0;
    return clamp(Math.max(Math.ceil(roundNumber * 0.75), Math.ceil(expected * 1.35), 1), 0, roundNumber);
  }

  if (strategy === "genius") {
    const currentLeaderScore = Math.max(...ctx.view.players.map((player) => player.totalScore));
    const scoreDeficit = currentLeaderScore - ctx.self.totalScore;
    let bestBid = 0;
    let bestValue = Number.NEGATIVE_INFINITY;
    const probabilities = ctx.self.hand.map((instance) => clamp(intrinsicCardPower(instance.card, ctx.unseenCards), 0.03, 0.94));
    const distribution = exactTrickDistribution(probabilities);

    for (let bid = 0; bid <= roundNumber; bid += 1) {
      let value = 0;
      for (let tricks = 0; tricks < distribution.length; tricks += 1) {
        value += (distribution[tricks] ?? 0) * scoreBid(roundNumber, bid, tricks);
      }

      const exactProbability = distribution[bid] ?? 0;
      const riskAppetite = scoreDeficit > 60 ? 8 : scoreDeficit > 25 ? 4 : 0;
      value += exactProbability * 6 + (bid > expected ? riskAppetite : 0);
      if (value > bestValue) {
        bestValue = value;
        bestBid = bid;
      }
    }
    return clamp(bestBid, 0, roundNumber);
  }

  return randomIndex(roundNumber + 1, Math.random);
}

function exactTrickDistribution(probabilities: number[]): number[] {
  let distribution = [1];
  for (const probability of probabilities) {
    const next = Array.from({ length: distribution.length + 1 }, () => 0);
    for (let tricks = 0; tricks < distribution.length; tricks += 1) {
      next[tricks] = (next[tricks] ?? 0) + (distribution[tricks] ?? 0) * (1 - probability);
      next[tricks + 1] = (next[tricks + 1] ?? 0) + (distribution[tricks] ?? 0) * probability;
    }
    distribution = next;
  }
  return distribution;
}

function playerIdsAfterCurrent(round: BotContext["round"], selfPlayerId: PlayerID): PlayerID[] {
  const missingCount = Math.max(0, round.playerOrder.length - round.currentTrick.plays.length - 1);
  const ids: PlayerID[] = [];
  let currentIndex = round.playerOrder.indexOf(selfPlayerId);
  if (currentIndex === -1) return ids;

  for (let index = 0; index < missingCount; index += 1) {
    currentIndex = (currentIndex + 1) % round.playerOrder.length;
    const next = round.playerOrder[currentIndex];
    if (next) ids.push(next);
  }
  return ids;
}

function getBidBasedCardWeight(ctx: BotContext, playerId: PlayerID, card: SkullKingCard): number {
  const player = ctx.view.players.find((candidate) => candidate.id === playerId);
  if (!player || player.bid === null) return 1;

  const power = intrinsicCardPower(card, ctx.unseenCards);
  const remainingNeed = player.bid - player.tricksWon;
  const remainingCards = Math.max(1, player.handCount);

  if (player.bid === 0) {
    if (card.type === "escape" || card.type === "loot" || card.type === "kraken" || card.type === "white_whale") return 1.35;
    return clamp(1.2 - power * 1.35, 0.04, 1.15);
  }

  if (remainingNeed <= 0) {
    if (card.type === "escape" || card.type === "loot" || card.type === "kraken" || card.type === "white_whale") return 1.2;
    return clamp(1.05 - power * 0.85, 0.12, 1);
  }

  if (ctx.round.roundNumber <= 2 && player.bid >= 1) {
    return clamp(0.18 + power * 2.25, 0.12, 2.25);
  }

  const pressure = clamp(remainingNeed / remainingCards, 0, 1.4);
  return clamp(0.48 + power * (0.75 + pressure), 0.18, 2.1);
}

function getVoidAdjustedCardWeight(ctx: BotContext, playerId: PlayerID, card: SkullKingCard, playsAfter: SkullKingTrickPlay[]): number {
  const leadSuit = getLeadSuit(playsAfter) as SkullKingSuit | null;
  const bidWeight = getBidBasedCardWeight(ctx, playerId, card);
  if (!leadSuit) return bidWeight;

  const knownVoid = ctx.voidTracker.get(playerId)?.has(leadSuit) ?? false;
  if (knownVoid) {
    if (card.type === "number" && card.suit === leadSuit) return bidWeight * 0.005;
    if (card.type === "number" && card.suit === TRUMP_SUIT) return bidWeight * 3;
    if (card.type !== "number") return bidWeight * 2.2;
    return bidWeight;
  }

  if (card.type === "number" && card.suit === leadSuit) return bidWeight * 1.45;
  if (card.type === "number" && card.suit === TRUMP_SUIT) return bidWeight * 0.42;
  if (card.type !== "number") return bidWeight * 0.8;
  return bidWeight * 0.22;
}

function wouldThreatenCandidate(playsAfter: SkullKingTrickPlay[], selfPlayerId: PlayerID, card: SkullKingCard): boolean {
  const futurePlay: SkullKingTrickPlay = {
    playerId: "future-player",
    card: materializePlayedCard(makeSyntheticInstance(card), card.type === "tigress" ? "pirate" : undefined),
  };
  const winningIndex = getWinningPlayIndex([...playsAfter, futurePlay]);
  if (winningIndex === null) return true;
  return [...playsAfter, futurePlay][winningIndex]?.playerId !== selfPlayerId;
}

function estimateThreatProbability(ctx: BotContext, playsAfter: SkullKingTrickPlay[], remainingPlayerIds: PlayerID[]): number {
  if (remainingPlayerIds.length === 0 || ctx.unseenCards.length === 0) return 0;

  let noThreatProbability = 1;
  for (const playerId of remainingPlayerIds) {
    let threatWeight = 0;
    let totalWeight = 0;

    for (const card of ctx.unseenCards) {
      const weight = getVoidAdjustedCardWeight(ctx, playerId, card, playsAfter);
      totalWeight += weight;
      if (wouldThreatenCandidate(playsAfter, ctx.self.id, card)) threatWeight += weight;
    }

    const playerThreatProbability = totalWeight <= 0 ? 0 : clamp(threatWeight / totalWeight, 0, 1);
    noThreatProbability *= 1 - playerThreatProbability;
  }

  return clamp(1 - noThreatProbability, 0, 1);
}

function estimateWinChance(ctx: BotContext, playsAfter: SkullKingTrickPlay[], remainingPlayerIds: PlayerID[]): number {
  const winningIndex = getWinningPlayIndex(playsAfter);
  if (winningIndex === null || playsAfter[winningIndex]?.playerId !== ctx.self.id) {
    return remainingPlayerIds.length === 0 ? 0 : 0.03;
  }
  if (remainingPlayerIds.length === 0) return 1;
  return clamp(1 - estimateThreatProbability(ctx, playsAfter, remainingPlayerIds), 0.02, 0.98);
}

function visibleBonusPotential(playsAfter: SkullKingTrickPlay[], selfPlayerId: PlayerID, remainingPlayerCount: number): number {
  const winningIndex = getWinningPlayIndex(playsAfter);
  if (winningIndex === null || playsAfter[winningIndex]?.playerId !== selfPlayerId) return 0;

  const winningCard = playsAfter[winningIndex]?.card.card;
  if (!winningCard) return 0;

  let bonus = 0;
  for (const play of playsAfter) {
    const card = play.card.card;
    if (card.type === "number" && card.rank === 14) bonus += card.suit === TRUMP_SUIT ? 20 : 10;
  }

  const pirateCount = playsAfter.filter((play) => isPirateLike(play.card.card)).length;
  const mermaidCount = playsAfter.filter((play) => play.card.card.type === "mermaid").length;
  const hasSkullKing = playsAfter.some((play) => play.card.card.type === "skull_king");
  if (winningCard.type === "skull_king") bonus += pirateCount * 30;
  if (winningCard.type === "mermaid" && hasSkullKing) bonus += 40;
  if (isPirateLike(winningCard)) bonus += mermaidCount * 20;

  return remainingPlayerCount === 0 ? bonus : bonus * 0.35;
}

function opponentPressure(view: SkullKingPlayerViewState, winnerId: PlayerID | null): number {
  if (!winnerId || winnerId === view.selfPlayerId) return 0;
  const winner = view.players.find((player) => player.id === winnerId);
  if (!winner || winner.bid === null) return 0;

  const needed = winner.bid - winner.tricksWon;
  if (needed <= 0) return 14;
  if (needed === 1) return -10;
  return -4;
}

function getVoidDanger(ctx: BotContext, card: SkullKingCard, remainingPlayerIds: PlayerID[]): number {
  if (card.type !== "number" || card.suit === TRUMP_SUIT || remainingPlayerIds.length === 0) return 0;
  const voidPlayerCount = remainingPlayerIds.filter((playerId) => ctx.voidTracker.get(playerId)?.has(card.suit) ?? false).length;
  return voidPlayerCount / remainingPlayerIds.length;
}

function getCandidateActions(ctx: BotContext): CandidateAction[] {
  const playableCards = ctx.self.hand.filter((card: SkullKingCardInstance) => canPlayCard(ctx.self.hand, ctx.round.currentTrick.plays, card));
  const remainingPlayerIds = playerIdsAfterCurrent(ctx.round, ctx.self.id);
  const remainingPlayerCount = remainingPlayerIds.length;
  const actions: CandidateAction[] = [];

  for (const card of playableCards) {
    const modes: Array<TigressPlayMode | undefined> = card.card.type === "tigress" ? ["escape", "pirate"] : [undefined];
    for (const mode of modes) {
      const materialized = materializePlayedCard(card, mode);
      const playsAfter = [...ctx.round.currentTrick.plays, { playerId: ctx.self.id, card: materialized }];
      const winningIndex = getWinningPlayIndex(playsAfter);
      const winnerIdNow = winningIndex === null ? null : playsAfter[winningIndex]?.playerId ?? null;
      const winChance = estimateWinChance(ctx, playsAfter, remainingPlayerIds);
      const playedCard = materialized.card;
      actions.push({
        instanceId: card.instanceId,
        tigressMode: mode,
        card: playedCard,
        originalCard: card,
        playsAfter,
        selfWinningNow: winnerIdNow === ctx.self.id,
        winnerIdNow,
        remainingPlayerCount,
        winChance,
        power: intrinsicCardPower(playedCard, ctx.unseenCards),
        escapeValue: isEscapeLike(playedCard) || playedCard.type === "kraken" ? 1 : playedCard.type === "white_whale" ? 0.65 : 0,
        bonusPotential: visibleBonusPotential(playsAfter, ctx.self.id, remainingPlayerCount),
        opponentPressure: opponentPressure(ctx.view, winnerIdNow),
        voidDanger: getVoidDanger(ctx, playedCard, remainingPlayerIds),
      });
    }
  }

  return actions;
}

function getSelfNeed(self: BotContext["self"]): number {
  if (self.bid === null) return 0;
  return self.bid - self.tricksWon;
}

function chooseLowestRisk(actions: CandidateAction[]): CandidateAction | null {
  return [...actions].sort((left, right) => {
    const riskDiff = (left.winChance - left.voidDanger * 0.08) - (right.winChance - right.voidDanger * 0.08);
    if (Math.abs(riskDiff) > 0.03) return riskDiff;
    return left.power - right.power;
  })[0] ?? null;
}

function chooseHighestChance(actions: CandidateAction[]): CandidateAction | null {
  return [...actions].sort((left, right) => {
    const chanceDiff = right.winChance - left.winChance;
    if (Math.abs(chanceDiff) > 0.03) return chanceDiff;
    return left.power - right.power;
  })[0] ?? null;
}

function chooseSafeAction(ctx: BotContext, actions: CandidateAction[]): CandidateAction | null {
  const needed = getSelfNeed(ctx.self);
  const remainingTricks = ctx.self.hand.length;
  if (needed <= 0) return chooseLowestRisk(actions);
  if (needed >= remainingTricks) return chooseHighestChance(actions);

  const targetChance = clamp(needed / remainingTricks + 0.08, 0.2, 0.85);
  return [...actions].sort((left, right) => {
    const leftScore = Math.abs(left.winChance - targetChance) * 80 + left.power * 8 + left.voidDanger * 16 - left.opponentPressure;
    const rightScore = Math.abs(right.winChance - targetChance) * 80 + right.power * 8 + right.voidDanger * 16 - right.opponentPressure;
    return leftScore - rightScore;
  })[0] ?? null;
}

function chooseAggressiveAction(ctx: BotContext, actions: CandidateAction[]): CandidateAction | null {
  const needed = getSelfNeed(ctx.self);
  if (ctx.self.bid === 0 || needed <= 0) {
    return [...actions].sort((left, right) => {
      const leftScore = left.winChance * 100 - left.escapeValue * 18 + left.power * 5;
      const rightScore = right.winChance * 100 - right.escapeValue * 18 + right.power * 5;
      return leftScore - rightScore;
    })[0] ?? null;
  }

  return [...actions].sort((left, right) => {
    const leftScore = left.winChance * 100 + left.bonusPotential * 0.35 + left.power * 10 + left.opponentPressure - left.voidDanger * 12;
    const rightScore = right.winChance * 100 + right.bonusPotential * 0.35 + right.power * 10 + right.opponentPressure - right.voidDanger * 12;
    return rightScore - leftScore;
  })[0] ?? null;
}

function expectedRoundScoreAfterAction(ctx: BotContext, action: CandidateAction): number {
  const bid = ctx.self.bid ?? 0;
  const futureCards = ctx.self.hand.filter((card) => card.instanceId !== action.instanceId);
  const futureProbabilities = futureCards.map((card) => clamp(intrinsicCardPower(card.card, ctx.unseenCards), 0.02, 0.92));
  const distribution = exactTrickDistribution(futureProbabilities);

  let expected = 0;
  for (let futureTricks = 0; futureTricks < distribution.length; futureTricks += 1) {
    const probability = distribution[futureTricks] ?? 0;
    const scoreIfWin = scoreBid(ctx.round.roundNumber, bid, ctx.self.tricksWon + 1 + futureTricks);
    const scoreIfLose = scoreBid(ctx.round.roundNumber, bid, ctx.self.tricksWon + futureTricks);
    expected += probability * (action.winChance * scoreIfWin + (1 - action.winChance) * scoreIfLose);
  }

  const exactChanceAfterWin = distribution[Math.max(0, bid - ctx.self.tricksWon - 1)] ?? 0;
  const exactChanceAfterLose = distribution[Math.max(0, bid - ctx.self.tricksWon)] ?? 0;
  const bonusExactChance = action.winChance * exactChanceAfterWin + (1 - action.winChance) * exactChanceAfterLose;
  return expected + action.bonusPotential * bonusExactChance;
}

function chooseGeniusAction(ctx: BotContext, actions: CandidateAction[]): CandidateAction | null {
  const needed = getSelfNeed(ctx.self);
  const remainingTricks = ctx.self.hand.length;
  const scoreDeficit = Math.max(...ctx.view.players.map((player) => player.totalScore)) - ctx.self.totalScore;

  return [...actions].sort((left, right) => {
    const leftNeedUrgency = needed > 0 ? left.winChance * clamp(needed / remainingTricks, 0, 1) * 8 : -left.winChance * 12;
    const rightNeedUrgency = needed > 0 ? right.winChance * clamp(needed / remainingTricks, 0, 1) * 8 : -right.winChance * 12;
    const leftValue =
      expectedRoundScoreAfterAction(ctx, left) +
      left.opponentPressure +
      leftNeedUrgency +
      (scoreDeficit > 50 ? left.bonusPotential * 0.12 : 0) -
      (needed <= 0 ? left.power * 4 - left.voidDanger * 8 : left.power * 1.5 + left.voidDanger * 22);
    const rightValue =
      expectedRoundScoreAfterAction(ctx, right) +
      right.opponentPressure +
      rightNeedUrgency +
      (scoreDeficit > 50 ? right.bonusPotential * 0.12 : 0) -
      (needed <= 0 ? right.power * 4 - right.voidDanger * 8 : right.power * 1.5 + right.voidDanger * 22);
    return rightValue - leftValue;
  })[0] ?? null;
}

function actionFromCandidate(candidate: CandidateAction): SkullKingBotAction {
  return {
    type: "play_card",
    instanceId: candidate.instanceId,
    tigressMode: candidate.tigressMode,
  };
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

export function chooseSkullKingBotAction(
  view: SkullKingPlayerViewState,
  strategy: SkullKingBotStrategy = "random",
  rng: () => number = Math.random,
): SkullKingBotAction | null {
  if (strategy === "random") return chooseRandomSkullKingBotAction(view, rng);

  const ctx = createBotContext(view);
  if (!ctx) return null;

  if (view.phase === "bidding") {
    if (ctx.self.bid !== null) return null;
    return { type: "bid", bid: chooseBid(ctx, strategy) };
  }

  if (view.phase !== "playing" || ctx.round.currentPlayerId !== view.selfPlayerId) return null;

  const actions = getCandidateActions(ctx);
  if (actions.length === 0) return null;

  const chosen =
    strategy === "safe"
      ? chooseSafeAction(ctx, actions)
      : strategy === "aggressive"
        ? chooseAggressiveAction(ctx, actions)
        : chooseGeniusAction(ctx, actions);

  return chosen ? actionFromCandidate(chosen) : null;
}
