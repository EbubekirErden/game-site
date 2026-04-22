// packages/shared/src/rules.ts

import { getCardDef } from "./cards.js";
import type { CardID, CardInstance, GameEvent, GameState, PlayerID, PlayerState } from "./types.js";

export type ClientAction =
  | { type: "play_card"; playerId: string; instanceId: string; targetPlayerId?: string; guessedValue?: number }
  | { type: "start_round"; playerId: string };

export interface ActionResult {
  ok: boolean;
  reason?: string;
  state?: GameState;
  privateNotes?: Array<
    | { type: "peek"; playerId: PlayerID; targetPlayerId: PlayerID; seenCard: CardInstance | null }
    | { type: "compare"; playerId: PlayerID; targetPlayerId: PlayerID; playerCard: CardInstance | null; targetCard: CardInstance | null }
  >;
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

function activeOtherTargets(players: PlayerState[], playerId: PlayerID): PlayerState[] {
  return players.filter((player) => player.id !== playerId && isTargetable(playerId, player));
}

function activeOtherPlayers(players: PlayerState[], playerId: PlayerID): PlayerState[] {
  return players.filter((player) => player.id !== playerId && player.status === "active");
}

function eliminatePlayer(
  player: PlayerState,
  log: GameEvent[],
  details?: { reason?: string; sourceCardId?: CardID },
): void {
  if (player.status === "eliminated") return;
  player.status = "eliminated";
  player.protectedUntilNextTurn = false;
  log.push({ type: "player_eliminated", playerId: player.id, reason: details?.reason, sourceCardId: details?.sourceCardId });
}

function discardHandCard(player: PlayerState): CardInstance | null {
  const [card] = player.hand.splice(0, 1);
  if (!card) return null;
  player.discardPile.push(card);
  return card;
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

  const handDefs = player.hand.map((card) => getCardDef(card.cardId));
  const hasCountess = handDefs.some((card) => card.id === "countess");
  const hasPrinceOrKing = handDefs.some((card) => card.id === "prince" || card.id === "king");
  const playedCard = getCardDef(player.hand.find((card) => card.instanceId === action.instanceId)!.cardId);
  const target = action.targetPlayerId ? state.players.find((candidate) => candidate.id === action.targetPlayerId) : undefined;
  const otherPlayers = activeOtherPlayers(state.players, player.id);
  const legalOtherTargets = activeOtherTargets(state.players, player.id);
  const requiresOtherTarget = playedCard.id === "guard" || playedCard.id === "priest" || playedCard.id === "baron" || playedCard.id === "king";

  if (hasCountess && hasPrinceOrKing && playedCard.id !== "countess") {
    return { ok: false, reason: "countess_must_be_played" };
  }

  if (playedCard.id === "guard") {
    if (!action.targetPlayerId && legalOtherTargets.length > 0) {
      return { ok: false, reason: "target_required" };
    }

    if (action.targetPlayerId && (!action.guessedValue || action.guessedValue === 1 || action.guessedValue < 2 || action.guessedValue > 8)) {
      return { ok: false, reason: "invalid_guard_guess" };
    }
  }

  if (requiresOtherTarget && !action.targetPlayerId && legalOtherTargets.length > 0) {
    return { ok: false, reason: "target_required" };
  }

  if (playedCard.id === "prince" && !action.targetPlayerId && otherPlayers.length > 0) {
    return { ok: false, reason: "target_required" };
  }

  if (requiresOtherTarget && target) {
    if (target.id === player.id) {
      return { ok: false, reason: "cannot_target_self" };
    }
    if (!isTargetable(player.id, target)) {
      return { ok: false, reason: "invalid_target" };
    }
  }

  if (playedCard.id === "prince" && target) {
    if (!isTargetable(player.id, target)) {
      return { ok: false, reason: "invalid_target" };
    }
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
  };
  const log: GameEvent[] = [...state.log];
  const privateNotes: NonNullable<ActionResult["privateNotes"]> = [];

  const player = findPlayer(players, action.playerId)!;
  const cardIndex = player.hand.findIndex((card) => card.instanceId === action.instanceId);
  const [playedCard] = player.hand.splice(cardIndex, 1);
  player.discardPile.push(playedCard);

  const playedCardDef = getCardDef(playedCard.cardId);
  log.push({ type: "card_played", playerId: player.id, cardId: playedCard.cardId });

  const resolvePrinceDraw = (target: PlayerState): void => {
    const nextCard = round.deck.shift() ?? round.setAsideCard;
    if (!nextCard) return;
    target.hand = [nextCard];
  };

  const resolveKnockout = (target: PlayerState, details?: { reason?: string; sourceCardId?: CardID }): void => {
    if (target.status === "eliminated") return;
    const discarded = discardHandCard(target);
    if (discarded && getCardDef(discarded.cardId).id === "princess") {
      eliminatePlayer(target, log, details);
      return;
    }
    eliminatePlayer(target, log, details);
  };

  switch (playedCardDef.id) {
    case "guard": {
      const target = findPlayer(players, action.targetPlayerId!);
      if (target && target.id !== player.id && isTargetable(player.id, target)) {
        log.push({
          type: "card_guessed",
          playerId: player.id,
          targetPlayerId: target.id,
          guessedValue: action.guessedValue!,
        });
        const targetCard = target.hand[0];
        if (targetCard && getCardDef(targetCard.cardId).value === action.guessedValue) {
          resolveKnockout(target, {
            sourceCardId: "guard",
            reason: `was correctly guessed by ${player.name}'s Guard`,
          });
        }
      }
      break;
    }
    case "priest": {
      const target = findPlayer(players, action.targetPlayerId!);
      if (target && target.id !== player.id && isTargetable(player.id, target)) {
        privateNotes.push({
          type: "peek",
          playerId: player.id,
          targetPlayerId: target.id,
          seenCard: target.hand[0] ?? null,
        });
      }
      break;
    }
    case "baron": {
      const target = findPlayer(players, action.targetPlayerId!);
      if (target && target.id !== player.id && isTargetable(player.id, target)) {
        log.push({ type: "card_compared", playerId: player.id, targetPlayerId: target.id });
        const playerCard = player.hand[0] ?? null;
        const targetCard = target.hand[0] ?? null;
        privateNotes.push({
          type: "compare",
          playerId: player.id,
          targetPlayerId: target.id,
          playerCard,
          targetCard,
        });
        if (playerCard && targetCard) {
          const playerValue = getCardDef(playerCard.cardId).value;
          const targetValue = getCardDef(targetCard.cardId).value;
          if (playerValue < targetValue) {
            resolveKnockout(player, {
              sourceCardId: "baron",
              reason: `lost a Baron comparison against ${target.name}`,
            });
          } else if (targetValue < playerValue) {
            resolveKnockout(target, {
              sourceCardId: "baron",
              reason: `lost a Baron comparison against ${player.name}`,
            });
          }
        }
      }
      break;
    }
    case "handmaid": {
      player.protectedUntilNextTurn = true;
      log.push({ type: "player_protected", playerId: player.id });
      break;
    }
    case "prince": {
      const otherTargets = activeOtherTargets(players, player.id);
      const targetId = otherTargets.length === 0 ? player.id : action.targetPlayerId!;
      const target = findPlayer(players, targetId);
      if (target && isTargetable(player.id, target)) {
        const discarded = discardHandCard(target);
        if (discarded && getCardDef(discarded.cardId).id === "princess") {
          eliminatePlayer(target, log, {
            sourceCardId: "prince",
            reason: `discarded the Princess after ${player.name} played Prince`,
          });
          break;
        }
        resolvePrinceDraw(target);
      }
      break;
    }
    case "king": {
      const target = findPlayer(players, action.targetPlayerId!);
      if (target && target.id !== player.id && isTargetable(player.id, target)) {
        const playerHand = [...player.hand];
        player.hand = [...target.hand];
        target.hand = playerHand;
        log.push({ type: "card_swapped", playerId: player.id, targetPlayerId: target.id });
      }
      break;
    }
    case "countess": {
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

  const nextState: GameState = {
    ...state,
    players,
    round,
    log,
  };

  return {
    ok: true,
    state: nextState,
    privateNotes,
  };
}
