import { BASE_CARDS } from "@game-site/shared";
import type { CardID } from "@game-site/shared";

export const LOVE_LETTER_CARD_TEXT: Record<CardID, string> = {
  guard: "Choose another player and guess a card value from 2 to 8. If you guess correctly, that player is out.",
  priest: "Look at another player's hand.",
  baron: "Compare hands with another player. The lower value is out of the round.",
  handmaid: "You are protected from any action until your next turn.",
  prince: "Choose any player, including yourself. That player discards their hand and draws a replacement. Discarding Princess eliminates them.",
  king: "Trade hands with another player.",
  countess: "No effect. If you also hold Prince or King, you must discard Countess.",
  princess: "If you discard Princess for any reason, you are out of the round.",
};

export const LOVE_LETTER_FLOW = [
  "On your turn, draw 1 card, then choose 1 of your 2 cards to discard and resolve its effect.",
  "If a card needs a target and no legal player can be chosen because of Handmaid, the card is discarded without effect.",
  "If the deck ends, all remaining players reveal hands. Highest value wins, with discard totals breaking ties.",
  "If all but one player are eliminated, the remaining player wins the round immediately.",
];

export const LOVE_LETTER_SETUP_NOTES = [
  "Use the standard 16-card deck for 2 to 4 players.",
  "In 2-player games, 1 card is set aside face down and 3 cards are removed face up.",
  "The winner of the previous round starts the next round.",
];

export const LOVE_LETTER_TOKEN_GOALS = [
  { playerCount: 2, tokens: 7 },
  { playerCount: 3, tokens: 5 },
  { playerCount: 4, tokens: 4 },
];

export const LOVE_LETTER_DECK_TOTAL = BASE_CARDS.reduce((total, card) => total + card.copies, 0);
