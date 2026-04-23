import { getCardDef, getCardsForMode } from "./cards.js";
import type {
  CardID,
  CardInstance,
  GameEvent,
  GameState,
  PlayerID,
  PlayerState,
  PrivateEffectDecision,
  PrivateEffectPresentation,
  PrivateEffectVisibility,
} from "./types.js";

export type ClientAction =
  | {
      type: "play_card";
      playerId: string;
      instanceId: string;
      targetPlayerId?: string;
      targetPlayerIds?: string[];
      guessedValue?: number;
    }
  | {
      type: "cardinal_peek";
      playerId: string;
      targetPlayerId: string;
    }
  | { type: "start_round"; playerId: string };

export interface ActionResult {
  ok: boolean;
  reason?: string;
  state?: GameState;
  privateEffects?: PrivateEffectPresentation[];
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

function cloneRound(round: NonNullable<GameState["round"]>): NonNullable<GameState["round"]> {
  return {
    ...round,
    deck: [...round.deck],
    visibleRemovedCards: [...round.visibleRemovedCards],
    roundWinners: [...round.roundWinners],
    jesterAssignments: [...round.jesterAssignments],
    pendingCardinalPeek: round.pendingCardinalPeek
      ? {
          actorPlayerId: round.pendingCardinalPeek.actorPlayerId,
          targetPlayerIds: [...round.pendingCardinalPeek.targetPlayerIds] as [PlayerID, PlayerID],
        }
      : null,
  };
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

function resolvePrinceDraw(round: NonNullable<GameState["round"]>, target: PlayerState): boolean {
  const nextCard = round.deck.shift() ?? round.setAsideCard;
  if (!nextCard) return false;
  target.hand = [nextCard];
  return true;
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

function getGuessedCardIds(mode: GameState["mode"], guessedValue: number): CardID[] {
  return getCardsForMode(mode)
    .filter((card) => getCardDef(card.id).value === guessedValue)
    .map((card) => card.id);
}

function createEffectId(
  turnNumber: number,
  cardId: CardID,
  actorPlayerId: PlayerID,
  viewerPlayerId: PlayerID,
  suffix: string,
): string {
  return `${turnNumber}:${cardId}:${actorPlayerId}:${viewerPlayerId}:${suffix}`;
}

function makeBaseEffect(
  round: NonNullable<GameState["round"]>,
  viewerPlayerId: PlayerID,
  actorPlayerId: PlayerID,
  cardId: CardID,
  visibleTo: PrivateEffectVisibility,
  requiresDecision: PrivateEffectDecision,
  title: string,
  message: string,
) {
  return {
    effectId: createEffectId(round.turnNumber, cardId, actorPlayerId, viewerPlayerId, title.toLowerCase().replace(/\s+/g, "_")),
    turnNumber: round.turnNumber,
    viewerPlayerId,
    actorPlayerId,
    cardId,
    visibleTo,
    requiresDecision,
    title,
    message,
  } as const;
}

function pushMessageEffect(
  effects: PrivateEffectPresentation[],
  round: NonNullable<GameState["round"]>,
  params: {
    viewerPlayerId: PlayerID;
    actorPlayerId: PlayerID;
    cardId: CardID;
    visibleTo: PrivateEffectVisibility;
    title: string;
    message: string;
    reminderKey?: "count" | "constable" | "jester";
    highlightPlayerId?: PlayerID | null;
    isFizzle?: boolean;
  },
): void {
  effects.push({
    ...makeBaseEffect(
      round,
      params.viewerPlayerId,
      params.actorPlayerId,
      params.cardId,
      params.visibleTo,
      "none",
      params.title,
      params.message,
    ),
    kind: "message",
    reminderKey: params.reminderKey,
    highlightPlayerId: params.highlightPlayerId,
    isFizzle: params.isFizzle ?? false,
  });
}

export function validatePlayAction(state: GameState, action: Extract<ClientAction, { type: "play_card" }>): ActionResult {
  if (state.phase !== "in_round" || !state.round) {
    return { ok: false, reason: "round_not_active" };
  }

  if (state.round.pendingCardinalPeek) {
    return { ok: false, reason: "cardinal_peek_required" };
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

  if (
    playedCard.id !== "guard" &&
    playedCard.id !== "bishop" &&
    legalTargetSets.length > 0 &&
    submittedTargets.length === 0 &&
    cardChoosesPlayers(playedCard.id)
  ) {
    return { ok: false, reason: "target_required" };
  }

  if (submittedTargets.length > 0 && !legalTargetSets.some((targetSet) => sameTargets(targetSet, submittedTargets))) {
    return { ok: false, reason: "invalid_target" };
  }

  return { ok: true };
}

export function validateCardinalPeekAction(
  state: GameState,
  action: Extract<ClientAction, { type: "cardinal_peek" }>,
): ActionResult {
  if (state.phase !== "in_round" || !state.round) {
    return { ok: false, reason: "round_not_active" };
  }

  const pending = state.round.pendingCardinalPeek;
  if (!pending) {
    return { ok: false, reason: "cardinal_peek_not_pending" };
  }

  if (pending.actorPlayerId !== action.playerId || state.round.currentPlayerId !== action.playerId) {
    return { ok: false, reason: "not_your_turn" };
  }

  if (!pending.targetPlayerIds.includes(action.targetPlayerId)) {
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
  const round = cloneRound(state.round);
  const log: GameEvent[] = [...state.log];
  const privateEffects: PrivateEffectPresentation[] = [];

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
    pushMessageEffect(privateEffects, round, {
      viewerPlayerId: player.id,
      actorPlayerId: player.id,
      cardId: playedCardDef.id,
      visibleTo: "actor_only",
      title: `${playedCardDef.name} Discarded`,
      message: `You discarded ${playedCardDef.name}, but it had no legal target so its effect fizzled.`,
      isFizzle: true,
    });

    return {
      ok: true,
      state: {
        ...state,
        players,
        round,
        log,
      },
      privateEffects,
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

      const targetCard = target.hand[0] ?? null;
      const guessedCardIds = getGuessedCardIds(state.mode, action.guessedValue!);
      let outcome: "correct" | "wrong" | "assassin_rebound" = "wrong";
      let outcomeMessage = `You guessed ${action.guessedValue}, but ${target.name} stayed in the round.`;
      let eliminatedPlayerId: PlayerID | undefined;
      let revealedCards: CardInstance[] = [];

      if (targetCard?.cardId === "assassin") {
        outcome = "assassin_rebound";
        revealedCards = [targetCard];
        const discardedAssassin = discardHandCard(target);
        if (discardedAssassin) {
          resolvePrinceDraw(round, target);
        }
        eliminatePlayer(player, log, {
          sourceCardId: "assassin",
          reason: `was caught by ${target.name}'s Assassin after playing Guard`,
        });
        eliminatedPlayerId = player.id;
        outcomeMessage = `${target.name} revealed Assassin. Your Guard turned back on you and eliminated you.`;
      } else if (targetCard && getCardDef(targetCard.cardId).value === action.guessedValue) {
        outcome = "correct";
        revealedCards = [targetCard];
        resolveKnockout(round, target, log, {
          sourceCardId: "guard",
          reason: `was correctly guessed by ${player.name}'s Guard`,
        });
        eliminatedPlayerId = target.id;
        outcomeMessage = `You guessed correctly. ${target.name} was eliminated.`;
      }

      privateEffects.push({
        ...makeBaseEffect(round, player.id, player.id, "guard", "actor_only", "none", "Guard Guess", `You discarded Guard and guessed ${target.name}.`),
        kind: "guess",
        guessMode: "guard",
        targetPlayerId: target.id,
        targetPlayerName: target.name,
        guessedValue: action.guessedValue!,
        guessedCardIds,
        revealedCards,
        outcome,
        eliminatedPlayerId,
        outcomeMessage,
      });
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

      const targetCard = target.hand[0] ?? null;
      const guessedCardIds = getGuessedCardIds(state.mode, action.guessedValue!);
      let outcome: "correct" | "wrong" | "assassin_rebound" = "wrong";
      let outcomeMessage = `You guessed ${action.guessedValue}, but ${target.name} kept their hand.`;
      let revealedCards: CardInstance[] = [];
      let eliminatedPlayerId: PlayerID | undefined;
      let tokenAwarded = false;

      if (targetCard && getCardDef(targetCard.cardId).value === action.guessedValue) {
        outcome = "correct";
        revealedCards = [targetCard];
        awardToken(player, log);
        tokenAwarded = true;
        const discarded = discardHandCard(target);
        if (discarded && getCardDef(discarded.cardId).id === "princess") {
          eliminatePlayer(target, log, {
            sourceCardId: "bishop",
            reason: `discarded the Princess after ${player.name} revealed them with Bishop`,
          });
          eliminatedPlayerId = target.id;
          outcomeMessage = `You guessed correctly, gained a token, and ${target.name} was eliminated after discarding Princess.`;
        } else {
          resolvePrinceDraw(round, target);
          outcomeMessage = `You guessed correctly and gained a token of affection. ${target.name} discarded that hand and drew a replacement.`;
        }
      }

      privateEffects.push({
        ...makeBaseEffect(round, player.id, player.id, "bishop", "actor_only", "none", "Bishop Guess", `You discarded Bishop and guessed ${target.name}.`),
        kind: "guess",
        guessMode: "bishop",
        targetPlayerId: target.id,
        targetPlayerName: target.name,
        guessedValue: action.guessedValue!,
        guessedCardIds,
        revealedCards,
        outcome,
        eliminatedPlayerId,
        tokenAwarded,
        outcomeMessage,
      });
      break;
    }
    case "priest": {
      const target = findPlayer(players, submittedTargets[0]!);
      if (!target) break;

      privateEffects.push({
        ...makeBaseEffect(round, player.id, player.id, "priest", "actor_only", "none", "Priest Revealed", `You discarded Priest and saw ${target.name}'s hand.`),
        kind: "peek",
        targetPlayerId: target.id,
        targetPlayerName: target.name,
        revealedCard: target.hand[0] ?? null,
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
    case "baron":
    case "dowager_queen": {
      const target = findPlayer(players, submittedTargets[0]!);
      if (!target) break;

      const compareMode = playedCardDef.id === "baron" ? "lower_loses" : "higher_loses";
      log.push({ type: "card_compared", playerId: player.id, targetPlayerId: target.id, sourceCardId: playedCardDef.id });
      const playerCard = player.hand[0] ?? null;
      const targetCard = target.hand[0] ?? null;
      const playerValue = playerCard ? getCardDef(playerCard.cardId).value : null;
      const targetValue = targetCard ? getCardDef(targetCard.cardId).value : null;
      let winningPlayerId: PlayerID | null = null;
      let losingPlayerId: PlayerID | null = null;

      if (playerValue !== null && targetValue !== null) {
        if (compareMode === "lower_loses") {
          if (playerValue < targetValue) {
            winningPlayerId = target.id;
            losingPlayerId = player.id;
          } else if (targetValue < playerValue) {
            winningPlayerId = player.id;
            losingPlayerId = target.id;
          }
        } else if (playerValue > targetValue) {
          winningPlayerId = target.id;
          losingPlayerId = player.id;
        } else if (targetValue > playerValue) {
          winningPlayerId = player.id;
          losingPlayerId = target.id;
        }
      }

      for (const viewer of [player, target]) {
        const selfCard = viewer.id === player.id ? playerCard : targetCard;
        const opposingCard = viewer.id === player.id ? targetCard : playerCard;
        const opposingPlayer = viewer.id === player.id ? target : player;
        privateEffects.push({
          ...makeBaseEffect(
            round,
            viewer.id,
            player.id,
            playedCardDef.id,
            "actor_and_target",
            "none",
            `${playedCardDef.name} Comparison`,
            viewer.id === player.id
              ? `You discarded ${playedCardDef.name} and compared hands.`
              : `${player.name} discarded ${playedCardDef.name} and compared hands with you.`,
          ),
          kind: "compare",
          compareMode,
          selfPlayerId: viewer.id,
          selfPlayerName: viewer.name,
          selfCard,
          opposingPlayerId: opposingPlayer.id,
          opposingPlayerName: opposingPlayer.name,
          opposingCard,
          winningPlayerId,
          losingPlayerId,
        });
      }

      if (losingPlayerId === player.id) {
        resolveKnockout(round, player, log, {
          sourceCardId: playedCardDef.id,
          reason: `lost a ${playedCardDef.name} comparison against ${target.name}`,
        });
      } else if (losingPlayerId === target.id) {
        resolveKnockout(round, target, log, {
          sourceCardId: playedCardDef.id,
          reason: `lost a ${playedCardDef.name} comparison against ${player.name}`,
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
          targetPlayerName: target.name,
          revealedCard: target.hand[0] ?? null,
        }));

      privateEffects.push({
        ...makeBaseEffect(
          round,
          player.id,
          player.id,
          "baroness",
          "actor_only",
          "none",
          "Baroness Reveal",
          `You discarded Baroness and saw the hand${seen.length === 1 ? "" : "s"} of ${seen.map((entry) => entry.targetPlayerName).join(" and ")}.`,
        ),
        kind: "multi_peek",
        seen,
      });
      break;
    }
    case "handmaid": {
      player.protectedUntilNextTurn = true;
      log.push({ type: "player_protected", playerId: player.id, sourceCardId: "handmaid" });
      pushMessageEffect(privateEffects, round, {
        viewerPlayerId: player.id,
        actorPlayerId: player.id,
        cardId: "handmaid",
        visibleTo: "actor_only",
        title: "Handmaid Protection",
        message: "You discarded Handmaid and are protected until your next turn.",
      });
      break;
    }
    case "sycophant": {
      const forcedTargetId = submittedTargets[0] ?? null;
      round.forcedTargetPlayerId = forcedTargetId;
      const forcedTarget = forcedTargetId ? findPlayer(players, forcedTargetId) : null;
      pushMessageEffect(privateEffects, round, {
        viewerPlayerId: player.id,
        actorPlayerId: player.id,
        cardId: "sycophant",
        visibleTo: "actor_only",
        title: "Sycophant Chosen",
        message: forcedTarget
          ? `You discarded Sycophant. The next targeting effect must include ${forcedTarget.name}.`
          : "You discarded Sycophant.",
        highlightPlayerId: forcedTarget?.id ?? null,
      });
      break;
    }
    case "prince": {
      const target = findPlayer(players, submittedTargets[0] ?? player.id);
      if (!target) break;

      const discarded = discardHandCard(target);
      let causedElimination = false;
      let drewReplacement = false;
      let eliminationReason: string | undefined;

      if (discarded && getCardDef(discarded.cardId).id === "princess") {
        causedElimination = true;
        eliminationReason = `discarded the Princess after ${player.name} played Prince`;
        eliminatePlayer(target, log, {
          sourceCardId: "prince",
          reason: eliminationReason,
        });
      } else {
        drewReplacement = resolvePrinceDraw(round, target);
      }

      privateEffects.push({
        ...makeBaseEffect(
          round,
          player.id,
          player.id,
          "prince",
          "actor_only",
          "none",
          "Prince Discard",
          `You discarded Prince and ${target.name} discarded their hand.`,
        ),
        kind: "discard_reveal",
        targetPlayerId: target.id,
        targetPlayerName: target.name,
        discardedCard: discarded,
        drewReplacement,
        causedElimination,
        eliminationReason,
      });
      break;
    }
    case "count": {
      pushMessageEffect(privateEffects, round, {
        viewerPlayerId: player.id,
        actorPlayerId: player.id,
        cardId: "count",
        visibleTo: "actor_only",
        title: "Count Discarded",
        message: "You discarded Count. If you reach round end, each Count in your discard pile adds to your final strength.",
        reminderKey: "count",
      });
      break;
    }
    case "constable": {
      pushMessageEffect(privateEffects, round, {
        viewerPlayerId: player.id,
        actorPlayerId: player.id,
        cardId: "constable",
        visibleTo: "actor_only",
        title: "Constable Discarded",
        message: "You discarded Constable. If you are eliminated while it stays in your discard pile, you gain a token.",
        reminderKey: "constable",
      });
      break;
    }
    case "king": {
      const target = findPlayer(players, submittedTargets[0]!);
      if (!target) break;

      const playerHand = [...player.hand];
      player.hand = [...target.hand];
      target.hand = playerHand;
      log.push({ type: "card_swapped", playerId: player.id, targetPlayerId: target.id, sourceCardId: "king" });

      for (const viewer of [player, target]) {
        privateEffects.push({
          ...makeBaseEffect(
            round,
            viewer.id,
            player.id,
            "king",
            "actor_and_target",
            "none",
            "King Swap",
            viewer.id === player.id
              ? `You discarded King and swapped hands with ${target.name}.`
              : `${player.name} discarded King and swapped hands with you.`,
          ),
          kind: "swap",
          swapMode: "king",
          players: [
            { playerId: player.id, playerName: player.name, cardCount: player.hand.length },
            { playerId: target.id, playerName: target.name, cardCount: target.hand.length },
          ],
        });
      }
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
      round.pendingCardinalPeek = {
        actorPlayerId: player.id,
        targetPlayerIds: [firstTarget.id, secondTarget.id],
      };
      log.push({ type: "card_swapped", playerId: firstTarget.id, targetPlayerId: secondTarget.id, sourceCardId: "cardinal" });

      const viewers = uniq([player.id, firstTarget.id, secondTarget.id]);
      for (const viewerId of viewers) {
        const viewer = findPlayer(players, viewerId);
        if (!viewer) continue;

        privateEffects.push({
          ...makeBaseEffect(
            round,
            viewer.id,
            player.id,
            "cardinal",
            "actor_and_targets",
            viewer.id === player.id ? "cardinal_peek_choice" : "none",
            "Cardinal Swap",
            viewer.id === player.id
              ? `You discarded Cardinal. ${firstTarget.name} and ${secondTarget.name} swapped hands.`
              : `${player.name} discarded Cardinal. ${firstTarget.name} and ${secondTarget.name} swapped hands.`,
          ),
          kind: "swap",
          swapMode: "cardinal",
          players: [
            { playerId: firstTarget.id, playerName: firstTarget.name, cardCount: firstTarget.hand.length },
            { playerId: secondTarget.id, playerName: secondTarget.name, cardCount: secondTarget.hand.length },
          ],
          peekChoices:
            viewer.id === player.id
              ? [
                  { playerId: firstTarget.id, playerName: firstTarget.name },
                  { playerId: secondTarget.id, playerName: secondTarget.name },
                ]
              : undefined,
        });
      }
      break;
    }
    case "countess": {
      pushMessageEffect(privateEffects, round, {
        viewerPlayerId: player.id,
        actorPlayerId: player.id,
        cardId: "countess",
        visibleTo: "actor_only",
        title: "Countess Discarded",
        message: "You discarded Countess. She has no immediate effect.",
      });
      break;
    }
    case "jester": {
      const targetId = submittedTargets[0];
      if (!targetId) break;

      const target = findPlayer(players, targetId);
      round.jesterAssignments = round.jesterAssignments.filter((assignment) => assignment.playerId !== player.id);
      round.jesterAssignments.push({
        playerId: player.id,
        targetPlayerId: targetId,
      });

      pushMessageEffect(privateEffects, round, {
        viewerPlayerId: player.id,
        actorPlayerId: player.id,
        cardId: "jester",
        visibleTo: "actor_only",
        title: "Jester Prediction",
        message: target
          ? `You discarded Jester and chose ${target.name}. If they win the round, you gain a token too.`
          : "You discarded Jester.",
        reminderKey: "jester",
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
      pushMessageEffect(privateEffects, round, {
        viewerPlayerId: player.id,
        actorPlayerId: player.id,
        cardId: "princess",
        visibleTo: "actor_only",
        title: "Princess Discarded",
        message: "You discarded Princess and were eliminated from the round.",
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
    privateEffects,
  };
}

export function resolveCardinalPeekAction(
  state: GameState,
  action: Extract<ClientAction, { type: "cardinal_peek" }>,
): ActionResult {
  const validation = validateCardinalPeekAction(state, action);
  if (!validation.ok || !state.round) {
    return validation;
  }

  const players = clonePlayers(state.players);
  const round = cloneRound(state.round);
  const log: GameEvent[] = [...state.log];
  const actor = findPlayer(players, action.playerId)!;
  const target = findPlayer(players, action.targetPlayerId)!;

  round.pendingCardinalPeek = null;
  log.push({
    type: "card_seen",
    playerId: actor.id,
    targetPlayerId: target.id,
    seenCardId: target.hand[0]?.cardId ?? "guard",
    sourceCardId: "cardinal",
  });

  const privateEffects: PrivateEffectPresentation[] = [
    {
      ...makeBaseEffect(
        round,
        actor.id,
        actor.id,
        "cardinal",
        "actor_only",
        "none",
        "Cardinal Hand Revealed",
        `You chose to see ${target.name}'s hand after the swap.`,
      ),
      kind: "cardinal_reveal",
      chosenPlayerId: target.id,
      chosenPlayerName: target.name,
      revealedCard: target.hand[0] ?? null,
    },
  ];

  return {
    ok: true,
    state: {
      ...state,
      players,
      round,
      log,
    },
    privateEffects,
  };
}
