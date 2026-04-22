import { ALL_CARDS, getCardsForMode } from "@game-site/shared";
import type { CardID, LoveLetterMode } from "@game-site/shared";

export const LOVE_LETTER_CARD_TEXT: Record<CardID, string> = {
  assassin: "While Assassin is in your hand, any Guard that targets you is turned back on its player. Reveal Assassin, discard it, then draw a replacement.",
  jester: "Choose another player. If that player wins the round, you gain a token of affection too.",
  guard: "Choose another player and guess a card value. In classic, guess 2 to 8. In premium, guess 0 or 2 to 9. If you guess correctly, that player is out.",
  cardinal: "Choose exactly 2 players, switch their hands, then you may look at 1 of those hands.",
  priest: "Look at another player's hand.",
  baron: "Compare hands with another player. The lower value is out of the round.",
  baroness: "Look at the hands of 1 or 2 other players.",
  handmaid: "You are protected from other players' card effects until your next turn.",
  sycophant: "Choose a player, including yourself. The next card played that chooses players must include that player.",
  prince: "Choose any player, including yourself. That player discards their hand and draws a replacement. Discarding Princess eliminates them.",
  count: "No immediate effect. At round end, each Count in your discard pile adds 1 to the value of the card still in your hand.",
  constable: "No immediate effect. If you are eliminated while Constable is in your discard pile, gain a token of affection.",
  king: "Trade hands with another player.",
  countess: "No effect. If you also hold Prince or King, you must discard Countess.",
  dowager_queen: "Compare hands with another player. The higher value is out of the round.",
  princess: "If you discard Princess for any reason, you are out of the round.",
  bishop: "Guess another player's card value. If correct, gain a token, and that player may discard their hand and draw a replacement. Princess still beats Bishop at round end.",
};

export const LOVE_LETTER_COMMON_FLOW = [
  "On your turn, draw 1 card, then choose 1 of your 2 cards to discard and resolve its effect.",
  "If a card must choose a player and none can legally be chosen because of Handmaid or Sycophant, it is discarded without effect.",
  "If all but one player are eliminated, the remaining player wins the round immediately.",
];

export const LOVE_LETTER_MODE_INFO: Record<
  LoveLetterMode,
  {
    label: string;
    deckTotal: number;
    flow: string[];
    setupNotes: string[];
    tokenGoals: Array<{ label: string; tokens: number }>;
  }
> = {
  classic: {
    label: "Classic",
    deckTotal: getCardsForMode("classic").reduce((total, card) => total + card.classicCopies, 0),
    flow: [
      ...LOVE_LETTER_COMMON_FLOW,
      "If the deck ends, all remaining players reveal hands. Highest value wins, with discard totals breaking ties.",
    ],
    setupNotes: [
      "Use the 16-card classic deck for 2 to 4 players.",
      "In 2-player games, set 1 card aside face down and remove 3 more face up.",
      "The previous round winner starts the next round.",
    ],
    tokenGoals: [
      { label: "2 Players", tokens: 7 },
      { label: "3 Players", tokens: 5 },
      { label: "4 Players", tokens: 4 },
    ],
  },
  premium: {
    label: "Premium",
    deckTotal: getCardsForMode("premium").reduce((total, card) => total + card.premiumCopies, 0),
    flow: [
      ...LOVE_LETTER_COMMON_FLOW,
      "In premium, any effect that says to name a number applies to every card with that value.",
      "If the deck ends, reveal hands, apply Count bonuses, and remember Princess still beats an unboosted Bishop.",
      "Premium games end when a player reaches 4 tokens, including tokens earned from Bishop, Jester, or Constable effects.",
    ],
    setupNotes: [
      "Premium uses the full 32-card deck and is intended for 5 to 8 players, though this room does not enforce that limit.",
      "Remove only 1 card face down at the start of the round. No extra face-up removals are used.",
      "The previous round winner starts the next round.",
    ],
    tokenGoals: [{ label: "Any Player Count", tokens: 4 }],
  },
};

export const LOVE_LETTER_ALL_CARDS = ALL_CARDS;
