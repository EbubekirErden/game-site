import type { CardID, GameState, LoveLetterMode, PlayerID, PlayerState } from "@game-site/shared";
import { validatePlayAction } from "@game-site/shared/rules";

export type BotPlayDecision = {
  instanceId: string;
  targetPlayerId?: string;
  targetPlayerIds?: string[];
  guessedValue?: number;
};

function sample<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function isTargetable(sourcePlayerId: PlayerID, target: PlayerState): boolean {
  return target.status === "active" && (target.id === sourcePlayerId || !target.protectedUntilNextTurn);
}

function getTargetableOthers(players: PlayerState[], playerId: PlayerID): PlayerState[] {
  return players.filter((player) => player.id !== playerId && isTargetable(playerId, player));
}

function getSelfAndTargetableOthers(players: PlayerState[], playerId: PlayerID): PlayerState[] {
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

function getLegalTargetSets(state: GameState, player: PlayerState, playedCardId: CardID): string[][] {
  const forcedTargetPlayerId = state.round?.forcedTargetPlayerId ?? null;
  const targetableOthers = getTargetableOthers(state.players, player.id).map((candidate) => candidate.id);
  const selfAndTargetableOthers = getSelfAndTargetableOthers(state.players, player.id).map((candidate) => candidate.id);

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

function buildCandidateActions(state: GameState, player: PlayerState): BotPlayDecision[] {
  const decisions: BotPlayDecision[] = [];

  for (const card of player.hand) {
    const cardId = card.cardId;
    const targetSets = getLegalTargetSets(state, player, cardId);
    const guessValues = getGuessValues(state.mode, cardId);

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

export function chooseRandomBotPlay(state: GameState, playerId: PlayerID): BotPlayDecision | null {
  if (state.phase !== "in_round" || !state.round) return null;

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.status !== "active" || state.round.currentPlayerId !== playerId) {
    return null;
  }

  const candidates = buildCandidateActions(state, player).filter((decision) =>
    validatePlayAction(state, {
      type: "play_card",
      playerId,
      instanceId: decision.instanceId,
      targetPlayerId: decision.targetPlayerId,
      targetPlayerIds: decision.targetPlayerIds,
      guessedValue: decision.guessedValue,
    }).ok,
  );

  return sample(candidates);
}

export function chooseRandomCardinalPeekTarget(state: GameState, playerId: PlayerID): PlayerID | null {
  const pending = state.round?.pendingCardinalPeek;
  if (!pending || pending.actorPlayerId !== playerId) {
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
