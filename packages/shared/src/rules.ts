import { getCardDef } from "./cards.js";
import type { CardID, CardInstance, GameEvent, GameState, PlayerID, PlayerState } from "./types.js";

export type ClientAction =
  | {
      type: "play_card";
      playerId: string;
      instanceId: string;
      targetPlayerId?: string;
      targetPlayerIds?: string[];
      guessedValue?: number;
      peekPlayerId?: string;
    }
  | { type: "start_round"; playerId: string };

type PrivateNote =
  | { type: "peek"; playerId: PlayerID; targetPlayerId: PlayerID; seenCard: CardInstance | null }
  | { type: "compare"; playerId: PlayerID; targetPlayerId: PlayerID; playerCard: CardInstance | null; targetCard: CardInstance | null }
  | { type: "multi_peek"; playerId: PlayerID; seen: Array<{ targetPlayerId: PlayerID; seenCard: CardInstance | null }> };

export interface ActionResult {
  ok: boolean;
  reason?: string;
  state?: GameState;
  privateNotes?: PrivateNote[];
}

function clonePlayers(players: PlayerState[]): PlayerState[] {
  return players.map((player) => ({
    ...player,
    hand: [...player.hand],
    discardPile: [...player.discardPile],
  }));
}

function findPlayer(players: PlayerState[], playerId: PlayerID): PlayerState | undefined {
  return players.find((player) => player.id === playerId);
}

function isTargetable(sourcePlayerId: PlayerID, target: PlayerState): boolean {
  return target.status === "active" && (target.id === sourcePlayerId || !target.protectedUntilNextTurn);
}

function getActivePlayers(players: PlayerState[]): PlayerState[] {
  return players.filter((player) => player.status === "active");
}

function getTargetableOthers(players: PlayerState[], playerId: PlayerID): PlayerState[] {
  return players.filter((player) => player.id !== playerId && isTargetable(playerId, player));
}

function getSelfAndTargetableOthers(players: PlayerState[], playerId: PlayerID): PlayerState[] {
  return players.filter((player) => player.status === "active" && (player.id === playerId || isTargetable(playerId, player)));
}

function uniq(ids: string[]): string[] {
  return [...new Set(ids)];
}

function sameTargets(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

function choosePairs(ids: string[]): string[][] {
  const pairs: string[][] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      pairs.push([ids[i]!, ids[j]!]);
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
      targetSets = selfAndTargetableOthers.map((id) => [id]);
      break;
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

function getSubmittedTargetIds(action: Extract<ClientAction, { type: "play_card" }>, playedCardId: CardID): string[] {
  if (playedCardId === "baroness" || playedCardId === "cardinal") {
    return uniq((action.targetPlayerIds ?? []).filter(Boolean));
  }

  return action.targetPlayerId ? [action.targetPlayerId] : [];
}

function discardHandCard(player: PlayerState): CardInstance | null {
  const [card] = player.hand.splice(0, 1);
  if (!card) return null;
  player.discardPile.push(card);
  return card;
}

function awardToken(player: PlayerState, log: GameEvent[]): void {
  player.tokens += 1;
  log.push({ type: "token_awarded", playerId: player.id, tokens: player.tokens });
}

function discardRemainingHand(player: PlayerState): void {
  while (player.hand.length > 0) {
    const card = player.hand.shift()!;
    player.discardPile.push(card);
  }
}

function eliminatePlayer(
  player: PlayerState,
  log: GameEvent[],
  details?: { reason?: string; sourceCardId?: CardID },
): void {
  if (player.status === "eliminated") return;

  discardRemainingHand(player);
  player.status = "eliminated";
  player.protectedUntilNextTurn = false;
  log.push({ type: "player_eliminated", playerId: player.id, reason: details?.reason, sourceCardId: details?.sourceCardId });

  if (player.discardPile.some((card) => card.cardId === "constable")) {
    awardToken(player, log);
  }
}

function resolvePrinceDraw(round: NonNullable<GameState["round"]>, target: PlayerState): void {
  const nextCard = round.deck.shift() ?? round.setAsideCard;
  if (!nextCard) return;
  target.hand = [nextCard];
}

function resolveKnockout(
  round: NonNullable<GameState["round"]>,
  target: PlayerState,
  log: GameEvent[],
  details?: { reason?: string; sourceCardId?: CardID },
): void {
  if (target.status === "eliminated") return;

  const discarded = discardHandCard(target);
  if (discarded && getCardDef(discarded.cardId).id === "princess") {
    eliminatePlayer(target, log, details);
    return;
  }

  eliminatePlayer(target, log, details);
}

export function validatePlayAction(state: GameState, action: Extract<ClientAction, { type: "play_card" }>): ActionResult {
  if (state.phase !== "in_round" || !state.round) {
    return { ok: false, reason: "round_not_active" };
  }

  if (state.round.currentPlayerId !== action.playerId) {
    return { ok: false, reason: "not_your_turn" };
  }

  const player = state.players.find((candidate) => candidate.id === action.playerId);
  if (!player || player.status !== "active") {
    return { ok: false, reason: "player_not_active" };
  }

  if (!player.hand.some((card) => card.instanceId === action.instanceId)) {
    return { ok: false, reason: "card_not_in_hand" };
  }

  const playedCard = getCardDef(player.hand.find((card) => card.instanceId === action.instanceId)!.cardId);
  const handDefs = player.hand.map((card) => getCardDef(card.cardId));
  const hasCountess = handDefs.some((card) => card.id === "countess");
  const hasPrinceOrKing = handDefs.some((card) => card.id === "prince" || card.id === "king");

  if (hasCountess && hasPrinceOrKing && playedCard.id !== "countess") {
    return { ok: false, reason: "countess_must_be_played" };
  }

  if (playedCard.id === "guard") {
    const validGuess =
      typeof action.guessedValue === "number" &&
      Number.isInteger(action.guessedValue) &&
      action.guessedValue >= 0 &&
      action.guessedValue <= 9 &&
      action.guessedValue !== 1 &&
      (state.mode === "premium" || (action.guessedValue >= 2 && action.guessedValue <= 8));

    if (getLegalTargetSets(state, player, playedCard.id).length > 0 && !action.targetPlayerId) {
      return { ok: false, reason: "target_required" };
    }

    if (action.targetPlayerId && !validGuess) {
      return { ok: false, reason: "invalid_guard_guess" };
    }
  }

  if (playedCard.id === "bishop") {
    const validGuess =
      typeof action.guessedValue === "number" &&
      Number.isInteger(action.guessedValue) &&
      action.guessedValue >= 0 &&
      action.guessedValue <= 9;

    if (getLegalTargetSets(state, player, playedCard.id).length > 0 && !action.targetPlayerId) {
      return { ok: false, reason: "target_required" };
    }

    if (action.targetPlayerId && !validGuess) {
      return { ok: false, reason: "invalid_bishop_guess" };
    }
  }

  const legalTargetSets = getLegalTargetSets(state, player, playedCard.id);
  const submittedTargets = getSubmittedTargetIds(action, playedCard.id);

  if (playedCard.id === "cardinal" && action.peekPlayerId && !submittedTargets.includes(action.peekPlayerId)) {
    return { ok: false, reason: "invalid_target" };
  }

  if (playedCard.id !== "guard" && playedCard.id !== "bishop" && legalTargetSets.length > 0 && submittedTargets.length === 0 && cardChoosesPlayers(playedCard.id)) {
    return { ok: false, reason: "target_required" };
  }

  if (submittedTargets.length > 0 && !legalTargetSets.some((targetSet) => sameTargets(targetSet, submittedTargets))) {
    return { ok: false, reason: "invalid_target" };
  }

  return { ok: true };
}

export function resolvePlayAction(state: GameState, action: Extract<ClientAction, { type: "play_card" }>): ActionResult {
  const validation = validatePlayAction(state, action);
  if (!validation.ok || !state.round) {
    return validation;
  }

  const players = clonePlayers(state.players);
  const round = {
    ...state.round,
    deck: [...state.round.deck],
    visibleRemovedCards: [...state.round.visibleRemovedCards],
    roundWinners: [...state.round.roundWinners],
    jesterAssignments: [...state.round.jesterAssignments],
  };
  const log: GameEvent[] = [...state.log];
  const privateNotes: PrivateNote[] = [];

  const player = findPlayer(players, action.playerId)!;
  const cardIndex = player.hand.findIndex((card) => card.instanceId === action.instanceId);
  const [playedCard] = player.hand.splice(cardIndex, 1);
  player.discardPile.push(playedCard);

  const playedCardDef = getCardDef(playedCard.cardId);
  const legalTargetSets = getLegalTargetSets({ ...state, players, round }, player, playedCardDef.id);
  const submittedTargets = getSubmittedTargetIds(action, playedCardDef.id);
  const shouldClearForcedTarget = cardChoosesPlayers(playedCardDef.id) && playedCardDef.id !== "sycophant";
  const hasUsableTargets = submittedTargets.length > 0 && legalTargetSets.some((targetSet) => sameTargets(targetSet, submittedTargets));

  log.push({ type: "card_played", playerId: player.id, cardId: playedCard.cardId });

  if (shouldClearForcedTarget) {
    round.forcedTargetPlayerId = null;
  }

  if (cardChoosesPlayers(playedCardDef.id) && !hasUsableTargets && legalTargetSets.length === 0) {
    return {
      ok: true,
      state: {
        ...state,
        players,
        round,
        log,
      },
      privateNotes,
    };
  }

  switch (playedCardDef.id) {
    case "guard": {
      const target = findPlayer(players, submittedTargets[0]!);
      if (!target) break;

      log.push({
        type: "card_guessed",
        playerId: player.id,
        targetPlayerId: target.id,
        guessedValue: action.guessedValue!,
        sourceCardId: "guard",
      });

      const targetCard = target.hand[0];
      if (targetCard?.cardId === "assassin") {
        const discardedAssassin = discardHandCard(target);
        if (discardedAssassin) {
          resolvePrinceDraw(round, target);
        }
        eliminatePlayer(player, log, {
          sourceCardId: "assassin",
          reason: `was caught by ${target.name}'s Assassin after playing Guard`,
        });
        break;
      }

      if (targetCard && getCardDef(targetCard.cardId).value === action.guessedValue) {
        resolveKnockout(round, target, log, {
          sourceCardId: "guard",
          reason: `was correctly guessed by ${player.name}'s Guard`,
        });
      }
      break;
    }
    case "bishop": {
      const target = findPlayer(players, submittedTargets[0]!);
      if (!target) break;

      log.push({
        type: "card_guessed",
        playerId: player.id,
        targetPlayerId: target.id,
        guessedValue: action.guessedValue!,
        sourceCardId: "bishop",
      });

      const targetCard = target.hand[0];
      if (targetCard && getCardDef(targetCard.cardId).value === action.guessedValue) {
        awardToken(player, log);
        const discarded = discardHandCard(target);
        if (discarded && getCardDef(discarded.cardId).id === "princess") {
          eliminatePlayer(target, log, {
            sourceCardId: "bishop",
            reason: `discarded the Princess after ${player.name} revealed them with Bishop`,
          });
          break;
        }
        resolvePrinceDraw(round, target);
      }
      break;
    }
    case "priest": {
      const target = findPlayer(players, submittedTargets[0]!);
      if (!target) break;

      privateNotes.push({
        type: "peek",
        playerId: player.id,
        targetPlayerId: target.id,
        seenCard: target.hand[0] ?? null,
      });
      log.push({
        type: "card_seen",
        playerId: player.id,
        targetPlayerId: target.id,
        seenCardId: target.hand[0]?.cardId ?? "guard",
        sourceCardId: "priest",
      });
      break;
    }
    case "baron": {
      const target = findPlayer(players, submittedTargets[0]!);
      if (!target) break;

      log.push({ type: "card_compared", playerId: player.id, targetPlayerId: target.id, sourceCardId: "baron" });
      const playerCard = player.hand[0] ?? null;
      const targetCard = target.hand[0] ?? null;
      privateNotes.push({
        type: "compare",
        playerId: player.id,
        targetPlayerId: target.id,
        playerCard,
        targetCard,
      });
      privateNotes.push({
        type: "compare",
        playerId: target.id,
        targetPlayerId: player.id,
        playerCard: targetCard,
        targetCard: playerCard,
      });
      if (!playerCard || !targetCard) break;

      const playerValue = getCardDef(playerCard.cardId).value;
      const targetValue = getCardDef(targetCard.cardId).value;
      if (playerValue < targetValue) {
        resolveKnockout(round, player, log, {
          sourceCardId: "baron",
          reason: `lost a Baron comparison against ${target.name}`,
        });
      } else if (targetValue < playerValue) {
        resolveKnockout(round, target, log, {
          sourceCardId: "baron",
          reason: `lost a Baron comparison against ${player.name}`,
        });
      }
      break;
    }
    case "baroness": {
      const seen = submittedTargets
        .map((targetId) => findPlayer(players, targetId))
        .filter((target): target is PlayerState => Boolean(target))
        .map((target) => ({
          targetPlayerId: target.id,
          seenCard: target.hand[0] ?? null,
        }));

      privateNotes.push({
        type: "multi_peek",
        playerId: player.id,
        seen,
      });
      break;
    }
    case "handmaid": {
      player.protectedUntilNextTurn = true;
      log.push({ type: "player_protected", playerId: player.id, sourceCardId: "handmaid" });
      break;
    }
    case "sycophant": {
      const forcedTargetId = submittedTargets[0] ?? null;
      round.forcedTargetPlayerId = forcedTargetId;
      break;
    }
    case "prince": {
      const target = findPlayer(players, submittedTargets[0] ?? player.id);
      if (!target) break;

      const discarded = discardHandCard(target);
      if (discarded && getCardDef(discarded.cardId).id === "princess") {
        eliminatePlayer(target, log, {
          sourceCardId: "prince",
          reason: `discarded the Princess after ${player.name} played Prince`,
        });
        break;
      }
      resolvePrinceDraw(round, target);
      break;
    }
    case "count": {
      break;
    }
    case "constable": {
      break;
    }
    case "king": {
      const target = findPlayer(players, submittedTargets[0]!);
      if (!target) break;

      const playerHand = [...player.hand];
      player.hand = [...target.hand];
      target.hand = playerHand;
      log.push({ type: "card_swapped", playerId: player.id, targetPlayerId: target.id, sourceCardId: "king" });
      break;
    }
    case "cardinal": {
      const [firstId, secondId] = submittedTargets;
      const firstTarget = firstId ? findPlayer(players, firstId) : undefined;
      const secondTarget = secondId ? findPlayer(players, secondId) : undefined;
      if (!firstTarget || !secondTarget) break;

      const firstHand = [...firstTarget.hand];
      firstTarget.hand = [...secondTarget.hand];
      secondTarget.hand = firstHand;
      log.push({ type: "card_swapped", playerId: firstTarget.id, targetPlayerId: secondTarget.id, sourceCardId: "cardinal" });

      if (action.peekPlayerId) {
        const peekTarget = action.peekPlayerId === firstTarget.id ? firstTarget : action.peekPlayerId === secondTarget.id ? secondTarget : null;
        if (peekTarget) {
          privateNotes.push({
            type: "peek",
            playerId: player.id,
            targetPlayerId: peekTarget.id,
            seenCard: peekTarget.hand[0] ?? null,
          });
        }
      }
      break;
    }
    case "countess": {
      break;
    }
    case "dowager_queen": {
      const target = findPlayer(players, submittedTargets[0]!);
      if (!target) break;

      log.push({ type: "card_compared", playerId: player.id, targetPlayerId: target.id, sourceCardId: "dowager_queen" });
      const playerCard = player.hand[0] ?? null;
      const targetCard = target.hand[0] ?? null;
      privateNotes.push({
        type: "compare",
        playerId: player.id,
        targetPlayerId: target.id,
        playerCard,
        targetCard,
      });
      privateNotes.push({
        type: "compare",
        playerId: target.id,
        targetPlayerId: player.id,
        playerCard: targetCard,
        targetCard: playerCard,
      });
      if (!playerCard || !targetCard) break;

      const playerValue = getCardDef(playerCard.cardId).value;
      const targetValue = getCardDef(targetCard.cardId).value;
      if (playerValue > targetValue) {
        resolveKnockout(round, player, log, {
          sourceCardId: "dowager_queen",
          reason: `lost a Dowager Queen comparison against ${target.name}`,
        });
      } else if (targetValue > playerValue) {
        resolveKnockout(round, target, log, {
          sourceCardId: "dowager_queen",
          reason: `lost a Dowager Queen comparison against ${player.name}`,
        });
      }
      break;
    }
    case "jester": {
      const targetId = submittedTargets[0];
      if (!targetId) break;

      round.jesterAssignments = round.jesterAssignments.filter((assignment) => assignment.playerId !== player.id);
      round.jesterAssignments.push({
        playerId: player.id,
        targetPlayerId: targetId,
      });
      break;
    }
    case "assassin": {
      break;
    }
    case "princess": {
      eliminatePlayer(player, log, {
        sourceCardId: "princess",
        reason: "played the Princess",
      });
      break;
    }
  }

  return {
    ok: true,
    state: {
      ...state,
      players,
      round,
      log,
    },
    privateNotes,
  };
}
