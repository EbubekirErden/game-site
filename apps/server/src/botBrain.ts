import type { BotObservation, CardID, LoveLetterMode, PlayerID, PlayerViewState, PublicPlayerState } from "@game-site/shared";

export type BotPlayDecision = {
  instanceId: string;
  targetPlayerId?: string;
  targetPlayerIds?: string[];
  guessedValue?: number;
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

export function chooseRandomBotPlay(view: BotObservation): BotPlayDecision | null {
  const candidates = listBotActionCandidates(view);
  return sample(candidates);
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
