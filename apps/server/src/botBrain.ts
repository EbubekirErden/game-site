import type { BotObservation, CardID, LoveLetterMode, PlayerID, PlayerViewState, PublicPlayerState } from "@game-site/shared";

export type BotPlayDecision = {
  instanceId: string;
  targetPlayerId?: string;
  targetPlayerIds?: string[];
  guessedValue?: number;
};

export type BotDecisionCategory =
  | "guess"
  | "information"
  | "compare"
  | "protection"
  | "force_discard"
  | "swap"
  | "manipulation"
  | "bet"
  | "forced_play"
  | "self_target"
  | "leader_pressure"
  | "no_target";

export type BotDecisionSummary = {
  actionKey: string;
  cardId: CardID | null;
  targetPlayerIds: string[];
  guessedValue: number | null;
  categories: BotDecisionCategory[];
  summary: string;
};

export type RandomBotAnalysis = {
  decision: BotPlayDecision | null;
  summary: BotDecisionSummary | null;
  legalCandidateCount: number;
  note: string;
};

type VisiblePlayer = PlayerViewState["players"][number];

function sample<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function isTargetable(sourcePlayerId: PlayerID, target: Pick<PublicPlayerState, "id" | "status" | "protectedUntilNextTurn">): boolean {
  return target.status === "active" && (target.id === sourcePlayerId || !target.protectedUntilNextTurn);
}

function getTargetableOthers(players: VisiblePlayer[], playerId: PlayerID): VisiblePlayer[] {
  return players.filter((player) => player.id !== playerId && isTargetable(playerId, player));
}

function getSelfAndTargetableOthers(players: VisiblePlayer[], playerId: PlayerID): VisiblePlayer[] {
  return players.filter((player) => player.status === "active" && (player.id === playerId || isTargetable(playerId, player)));
}

function choosePairs(ids: string[]): string[][] {
  const pairs: string[][] = [];
  for (let index = 0; index < ids.length; index += 1) {
    for (let secondIndex = index + 1; secondIndex < ids.length; secondIndex += 1) {
      pairs.push([ids[index]!, ids[secondIndex]!]);
    }
  }

  return pairs;
}

function cardChoosesPlayers(cardId: CardID): boolean {
  return [
    "guard",
    "bishop",
    "priest",
    "baron",
    "baroness",
    "handmaid",
    "sycophant",
    "prince",
    "king",
    "dowager_queen",
    "cardinal",
    "jester",
  ].includes(cardId);
}

function getSelfPlayer(view: BotObservation): VisiblePlayer | null {
  const self = view.players.find((player) => player.id === view.selfPlayerId);
  return self ?? null;
}

function getDecisionCardId(view: BotObservation, decision: BotPlayDecision): CardID | null {
  const self = getSelfPlayer(view);
  const card = self?.hand.find((candidate) => candidate.instanceId === decision.instanceId);
  return card?.cardId ?? null;
}

function getLegalTargetSets(view: BotObservation, player: VisiblePlayer, playedCardId: CardID): string[][] {
  const forcedTargetPlayerId = view.round?.forcedTargetPlayerId ?? null;
  const targetableOthers = getTargetableOthers(view.players, player.id).map((candidate) => candidate.id);
  const selfAndTargetableOthers = getSelfAndTargetableOthers(view.players, player.id).map((candidate) => candidate.id);

  let targetSets: string[][] = [];

  switch (playedCardId) {
    case "guard":
    case "bishop":
    case "priest":
    case "baron":
    case "king":
    case "dowager_queen":
    case "jester":
      targetSets = targetableOthers.map((id) => [id]);
      break;
    case "handmaid":
      targetSets = [[player.id]];
      break;
    case "sycophant":
    case "prince":
      targetSets = selfAndTargetableOthers.map((id) => [id]);
      break;
    case "baroness":
      targetSets = [...targetableOthers.map((id) => [id]), ...choosePairs(targetableOthers)];
      break;
    case "cardinal":
      targetSets = choosePairs(selfAndTargetableOthers);
      break;
    default:
      targetSets = [[]];
      break;
  }

  if (forcedTargetPlayerId && playedCardId !== "sycophant" && cardChoosesPlayers(playedCardId)) {
    targetSets = targetSets.filter((targetSet) => targetSet.includes(forcedTargetPlayerId));
  }

  return targetSets;
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

function buildCandidateActions(view: BotObservation, player: VisiblePlayer): BotPlayDecision[] {
  const decisions: BotPlayDecision[] = [];
  const handCardIds = player.hand.map((card) => card.cardId);

  for (const card of player.hand) {
    const cardId = card.cardId;
    if (mustPlayCountess(handCardIds) && cardId !== "countess") {
      continue;
    }

    const targetSets = getLegalTargetSets(view, player, cardId);
    const guessValues = getGuessValues(view.mode, cardId);

    if (cardId === "guard" || cardId === "bishop") {
      if (targetSets.length === 0) {
        decisions.push({ instanceId: card.instanceId });
        continue;
      }

      for (const targetSet of targetSets) {
        for (const guessedValue of guessValues) {
          decisions.push({
            instanceId: card.instanceId,
            targetPlayerId: targetSet[0],
            guessedValue,
          });
        }
      }
      continue;
    }

    if (cardId === "baroness" || cardId === "cardinal") {
      if (targetSets.length === 0) {
        decisions.push({ instanceId: card.instanceId });
        continue;
      }

      for (const targetSet of targetSets) {
        decisions.push({
          instanceId: card.instanceId,
          targetPlayerIds: targetSet,
        });
      }
      continue;
    }

    if (targetSets.length === 0 || (targetSets.length === 1 && targetSets[0]?.length === 0)) {
      decisions.push({ instanceId: card.instanceId });
      continue;
    }

    for (const targetSet of targetSets) {
      decisions.push({
        instanceId: card.instanceId,
        targetPlayerId: targetSet[0],
      });
    }
  }

  return decisions;
}

export function listBotActionCandidates(view: BotObservation): BotPlayDecision[] {
  if (view.phase !== "in_round" || !view.round || view.selfRole !== "player") {
    return [];
  }

  const player = getSelfPlayer(view);
  if (!player || player.status !== "active" || view.round.currentPlayerId !== view.selfPlayerId) {
    return [];
  }

  return buildCandidateActions(view, player);
}

export function encodeBotDecision(decision: BotPlayDecision): string {
  const targetPlayerIds = decision.targetPlayerIds?.length
    ? [...decision.targetPlayerIds].sort().join(",")
    : decision.targetPlayerId ?? "";
  const guess = decision.guessedValue == null ? "" : String(decision.guessedValue);
  return [decision.instanceId, targetPlayerIds, guess].join("|");
}

export function summarizeBotDecision(view: BotObservation, decision: BotPlayDecision): BotDecisionSummary {
  const cardId = getDecisionCardId(view, decision);
  const targetPlayerIds = decision.targetPlayerIds?.length
    ? [...decision.targetPlayerIds]
    : decision.targetPlayerId
      ? [decision.targetPlayerId]
      : [];
  const categories = categorizeDecision(view, decision, cardId);
  const cardLabel = cardId ?? "unknown-card";
  const targetLabel = targetPlayerIds.length > 0 ? ` -> ${targetPlayerIds.join(",")}` : "";
  const guessLabel = decision.guessedValue == null ? "" : ` guess=${decision.guessedValue}`;

  return {
    actionKey: encodeBotDecision(decision),
    cardId,
    targetPlayerIds,
    guessedValue: decision.guessedValue ?? null,
    categories,
    summary: `${cardLabel}${targetLabel}${guessLabel}`.trim(),
  };
}

function categorizeDecision(view: BotObservation, decision: BotPlayDecision, cardId: CardID | null): BotDecisionCategory[] {
  const categories = new Set<BotDecisionCategory>();
  const self = getSelfPlayer(view);
  const targetPlayerIds = decision.targetPlayerIds?.length
    ? decision.targetPlayerIds
    : decision.targetPlayerId
      ? [decision.targetPlayerId]
      : [];
  const targetPlayers = targetPlayerIds
    .map((playerId) => view.players.find((player) => player.id === playerId) ?? null)
    .filter((player): player is VisiblePlayer => Boolean(player));
  const highestTokenCount = Math.max(0, ...view.players.filter((player) => player.id !== view.selfPlayerId).map((player) => player.tokens));

  if (targetPlayerIds.length === 0) categories.add("no_target");
  if (targetPlayerIds.some((playerId) => playerId === view.selfPlayerId)) categories.add("self_target");
  if (targetPlayers.some((player) => player.tokens === highestTokenCount && highestTokenCount > 0)) categories.add("leader_pressure");

  switch (cardId) {
    case "guard":
    case "bishop":
      categories.add("guess");
      break;
    case "priest":
    case "baroness":
    case "cardinal":
      categories.add("information");
      break;
    case "baron":
    case "dowager_queen":
      categories.add("compare");
      break;
    case "handmaid":
      categories.add("protection");
      break;
    case "prince":
      categories.add("force_discard");
      break;
    case "king":
      categories.add("swap");
      break;
    case "sycophant":
      categories.add("manipulation");
      break;
    case "jester":
      categories.add("bet");
      break;
    case "countess":
      if (self && self.hand.some((card) => card.cardId === "prince" || card.cardId === "king")) {
        categories.add("forced_play");
      }
      break;
    default:
      break;
  }

  return [...categories];
}

export function chooseRandomBotPlay(view: BotObservation): BotPlayDecision | null {
  const candidates = listBotActionCandidates(view);
  return sample(candidates);
}

export function analyzeRandomBotPlay(view: BotObservation): RandomBotAnalysis {
  const candidates = listBotActionCandidates(view);
  const decision = sample(candidates);
  return {
    decision,
    summary: decision ? summarizeBotDecision(view, decision) : null,
    legalCandidateCount: candidates.length,
    note: decision ? "Random bot sampled uniformly from the legal candidate list." : "No legal bot action was available.",
  };
}

export function chooseRandomCardinalPeekTarget(view: BotObservation): PlayerID | null {
  if (view.selfRole !== "player") {
    return null;
  }

  const pending = view.round?.pendingCardinalPeek;
  if (!pending || pending.actorPlayerId !== view.selfPlayerId) {
    return null;
  }

  return sample([...pending.targetPlayerIds]);
}

export function getBotDisplayName(existingNames: string[]): string {
  let botNumber = 1;
  const usedNames = new Set(existingNames);

  while (usedNames.has(`Random Bot ${botNumber}`)) {
    botNumber += 1;
  }

  return `Random Bot ${botNumber}`;
}
