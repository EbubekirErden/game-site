import { getCardsForMode, getCardDef } from "@game-site/shared";
import type { CardID, GameEvent, LoveLetterMode, PlayerID, PlayerViewState } from "@game-site/shared";

export function playerNameById(state: PlayerViewState, playerId: PlayerID): string {
  const activeName = state.players.find((player) => player.id === playerId)?.name;
  if (activeName) return activeName;

  const spectatorName = state.spectators.find((spectator) => spectator.id === playerId)?.name;
  if (spectatorName) return spectatorName;

  const historicalName = [...state.log].reverse().find((event) =>
    ((("playerId" in event) && event.playerId === playerId) ||
      (("spectatorId" in event) && event.spectatorId === playerId)) &&
    ("name" in event),
  );

  return historicalName && "name" in historicalName ? historicalName.name : "Unknown player";
}

export function cardNamesByValue(value: number, mode: LoveLetterMode): string[] {
  return getCardsForMode(mode)
    .filter((card) => card.value === value)
    .map((card) => card.name);
}

export function formatErrorReason(reason: string): string {
  switch (reason) {
    case "invalid_action":
      return "That action could not be completed.";
    case "room_not_found":
      return "That room code was not found.";
    case "only_creator_can_start":
      return "Only the room creator can start the game.";
    case "players_not_ready":
      return "You need at least 2 players, and everyone in the room must be ready.";
    case "only_creator_can_change_mode":
      return "Only the room creator can change the mode.";
    case "cannot_change_mode_now":
      return "The mode can only be changed while the room is still in the lobby.";
    case "room_full":
      return "This Skull King room is full.";
    case "game_already_started":
      return "That room already started, so new players cannot join right now.";
    case "game_not_available":
      return "That game is not available yet.";
    case "player_not_found":
      return "Your saved spot in that room could not be restored.";
    case "not_your_turn":
      return "It is not your turn.";
    case "player_not_active":
      return "You are not active in the current round.";
    case "card_not_in_hand":
      return "That card is no longer in your hand.";
    case "round_not_active":
      return "The round is no longer active.";
    case "target_required":
      return "Choose a valid target before playing that card.";
    case "cannot_target_self":
      return "That card cannot target yourself.";
    case "countess_must_be_played":
      return "You must play the Countess when you are also holding the Prince or King.";
    case "invalid_target":
      return "That target is not available for this card.";
    case "invalid_guard_guess":
      return "Guard guesses must match a legal card value for the selected mode.";
    case "invalid_bishop_guess":
      return "Bishop guesses must be a value between 0 and 9.";
    case "cardinal_peek_required":
      return "Finish Cardinal by choosing which swapped hand to inspect.";
    case "cardinal_peek_not_pending":
      return "There is no pending Cardinal hand to inspect.";
    default:
      return reason.replaceAll("_", " ");
  }
}

export function formatEvent(event: GameEvent, state: PlayerViewState): string {
  switch (event.type) {
    case "player_joined":
      return `${event.name} joined the room.`;
    case "player_left":
      return `${event.name} left the room.`;
    case "spectator_joined":
      return `${event.name} joined as a spectator.`;
    case "spectator_left":
      return `${event.name} stopped spectating.`;
    case "player_ready_changed":
      return `${playerNameById(state, event.playerId)} is now ${event.isReady ? "ready" : "not ready"}.`;
    case "round_started":
      return "The round started.";
    case "card_drawn":
      return `${playerNameById(state, event.playerId)} drew a card.`;
    case "card_played":
      return `${playerNameById(state, event.playerId)} played ${getCardDef(event.cardId).name}.`;
    case "card_guessed":
      return `${playerNameById(state, event.playerId)} guessed ${event.guessedValue} with ${getCardDef(event.sourceCardId ?? "guard").name} against ${playerNameById(state, event.targetPlayerId)}.`;
    case "card_compared":
      return `${playerNameById(state, event.playerId)} compared hands with ${playerNameById(state, event.targetPlayerId)} using ${getCardDef(event.sourceCardId ?? "baron").name}.`;
    case "card_swapped":
      return `${playerNameById(state, event.playerId)} swapped hands with ${playerNameById(state, event.targetPlayerId)} using ${getCardDef(event.sourceCardId ?? "king").name}.`;
    case "card_seen":
      return `${playerNameById(state, event.playerId)} privately inspected ${playerNameById(state, event.targetPlayerId)}'s hand.`;
    case "player_protected":
      return `${playerNameById(state, event.playerId)} is protected until their next turn.`;
    case "player_eliminated":
      return `${playerNameById(state, event.playerId)} is out of the round${event.reason ? `: ${event.reason}` : "."}`;
    case "round_ended":
      return `Round ended. Winner: ${event.winnerIds.map((playerId) => playerNameById(state, playerId)).join(", ")}.`;
    case "token_awarded":
      return `${playerNameById(state, event.playerId)} now has ${event.tokens} token${event.tokens === 1 ? "" : "s"}.`;
    case "match_ended":
      return `Match ended. Winner: ${event.winnerIds.map((playerId) => playerNameById(state, playerId)).join(", ")}.`;
    default:
      return "";
  }
}
