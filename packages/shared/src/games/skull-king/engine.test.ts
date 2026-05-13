import test from "node:test";
import assert from "node:assert/strict";

import { applyBidTimeout, createGame, playCard, resolveCurrentTrick, setPlayerReady, startRound, submitBid } from "./engine.js";
import { chooseRandomSkullKingBotAction, chooseSkullKingBotAction } from "./bot.js";
import { canPlayCard, getNextTrickLeadPlayerId, getWinningPlayIndex, materializePlayedCard } from "./rules.js";
import { toPlayerViewState } from "./engine.js";
import type { SkullKingCardInstance, SkullKingGameState } from "./types.js";

function addPlayers(state: SkullKingGameState, names: string[]): SkullKingGameState {
  return names.reduce((current, name, index) => {
    const next = {
      ...current,
      players: [
        ...current.players,
        {
          id: `p${index + 1}`,
          name,
          hand: [],
          bid: null,
          tricksWon: 0,
          roundScore: 0,
          bonusScore: 0,
          totalScore: 0,
          isReady: false,
        },
      ],
      log: current.log,
    };
    return next;
  }, state);
}

function setupRound(playerNames: string[]): SkullKingGameState {
  let state = addPlayers(createGame("room-1", "p1"), playerNames);
  for (let index = 0; index < playerNames.length; index += 1) {
    state = setPlayerReady(state, `p${index + 1}`, true);
  }
  return startRound(state);
}

function makeCard(instanceId: string, card: SkullKingCardInstance["card"]): SkullKingCardInstance {
  return { instanceId, card };
}

function withHands(state: SkullKingGameState, hands: Record<string, SkullKingCardInstance[]>): SkullKingGameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: hands[player.id] ? [...hands[player.id]!] : player.hand,
    })),
  };
}

test("bid timeout defaults to 1", () => {
  const state = setupRound(["Ada", "Ben"]);
  const result = applyBidTimeout(state, "p1");

  assert.equal(result.ok, true);
  assert.equal(result.state?.players.find((player) => player.id === "p1")?.bid, 1);
});

test("bidding is simultaneous and players can bid in any order once", () => {
  let state = setupRound(["Ada", "Ben", "Cal"]);
  assert.equal(state.round?.currentPlayerId, null);

  state = submitBid(state, "p3", 0).state!;
  const duplicate = submitBid(state, "p3", 1);
  state = submitBid(state, "p1", 1).state!;

  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, "invalid_action");
  assert.equal(state.phase, "bidding");
  assert.equal(state.round?.currentPlayerId, null);

  state = submitBid(state, "p2", 1).state!;
  assert.equal(state.phase, "playing");
  assert.equal(state.round?.currentPlayerId, "p1");
});

test("pending bids are hidden from other player views until everyone has bid", () => {
  let state = setupRound(["Ada", "Ben", "Cal"]);
  state = submitBid(state, "p1", 1).state!;
  state = submitBid(state, "p2", 0).state!;

  const p1View = toPlayerViewState(state, "p1");
  const p3View = toPlayerViewState(state, "p3");

  assert.equal(p1View.players.find((player) => player.id === "p1")?.bid, 1);
  assert.equal(p1View.players.find((player) => player.id === "p2")?.bid, null);
  assert.equal(p3View.players.find((player) => player.id === "p1")?.bid, null);
  const hiddenBidEvent = p3View.log.find((event) => event.type === "bid_submitted" && event.playerId === "p1");
  assert.equal(hiddenBidEvent?.type === "bid_submitted" ? hiddenBidEvent.bid : undefined, null);

  state = submitBid(state, "p3", 1).state!;
  const revealedView = toPlayerViewState(state, "p3");
  assert.equal(revealedView.players.find((player) => player.id === "p1")?.bid, 1);
  assert.equal(revealedView.players.find((player) => player.id === "p2")?.bid, 0);
});

test("cannot play off-suit when lead suit is available", () => {
  let state = setupRound(["Ada", "Ben"]);
  state = submitBid(state, "p1", 1).state!;
  state = submitBid(state, "p2", 1).state!;
  state = withHands(state, {
    p1: [makeCard("g5", { type: "number", suit: "green", rank: 5 })],
    p2: [
      makeCard("g9", { type: "number", suit: "green", rank: 9 }),
      makeCard("b13", { type: "number", suit: "black", rank: 13 }),
    ],
  });

  state = playCard(state, "p1", "g5").state!;
  const illegal = playCard(state, "p2", "b13");

  assert.equal(illegal.ok, false);
  assert.equal(illegal.reason, "must_follow_suit");
});

test("mermaid beats skull king", () => {
  const plays = [
    { playerId: "p1", card: materializePlayedCard(makeCard("sk", { type: "skull_king" })) },
    { playerId: "p2", card: materializePlayedCard(makeCard("mm", { type: "mermaid" })) },
  ];

  assert.equal(getWinningPlayIndex(plays), 1);
});

test("white whale forces number-card resolution", () => {
  const plays = [
    { playerId: "p1", card: materializePlayedCard(makeCard("ww", { type: "white_whale" })) },
    { playerId: "p2", card: materializePlayedCard(makeCard("g8", { type: "number", suit: "green", rank: 8 })) },
    { playerId: "p3", card: materializePlayedCard(makeCard("b3", { type: "number", suit: "black", rank: 3 })) },
  ];

  assert.equal(getWinningPlayIndex(plays), 1);
});

test("pirate led trick does not create a suit requirement from later number cards", () => {
  const plays = [
    { playerId: "p1", card: materializePlayedCard(makeCard("pirate", { type: "pirate" })) },
    { playerId: "p2", card: materializePlayedCard(makeCard("g8", { type: "number", suit: "green", rank: 8 })) },
  ];
  const hand = [
    makeCard("g9", { type: "number", suit: "green", rank: 9 }),
    makeCard("y2", { type: "number", suit: "yellow", rank: 2 }),
  ];

  assert.equal(canPlayCard(hand, plays, hand[1]!), true);
  assert.equal(getWinningPlayIndex(plays), 0);
});

test("white whale makes highest number win regardless of suit and ignores specials", () => {
  const plays = [
    { playerId: "p1", card: materializePlayedCard(makeCard("black2", { type: "number", suit: "black", rank: 2 })) },
    { playerId: "p2", card: materializePlayedCard(makeCard("pirate", { type: "pirate" })) },
    { playerId: "p3", card: materializePlayedCard(makeCard("yellow14", { type: "number", suit: "yellow", rank: 14 })) },
    { playerId: "p4", card: materializePlayedCard(makeCard("skull", { type: "skull_king" })) },
    { playerId: "p5", card: materializePlayedCard(makeCard("whale", { type: "white_whale" })) },
  ];

  assert.equal(getWinningPlayIndex(plays), 2);
});

test("kraken destroys the trick but next lead is the would-be winner", () => {
  const plays = [
    { playerId: "p1", card: materializePlayedCard(makeCard("g7", { type: "number", suit: "green", rank: 7 })) },
    { playerId: "p2", card: materializePlayedCard(makeCard("pirate", { type: "pirate" })) },
    { playerId: "p3", card: materializePlayedCard(makeCard("kraken", { type: "kraken" })) },
    { playerId: "p4", card: materializePlayedCard(makeCard("g14", { type: "number", suit: "green", rank: 14 })) },
  ];

  assert.equal(getWinningPlayIndex(plays), null);
  assert.equal(getNextTrickLeadPlayerId(plays), "p2");
});

test("later kraken or white whale decides the leviathan effect", () => {
  const whaleThenKraken = [
    { playerId: "p1", card: materializePlayedCard(makeCard("whale", { type: "white_whale" })) },
    { playerId: "p2", card: materializePlayedCard(makeCard("yellow14", { type: "number", suit: "yellow", rank: 14 })) },
    { playerId: "p3", card: materializePlayedCard(makeCard("kraken", { type: "kraken" })) },
  ];
  const krakenThenWhale = [
    { playerId: "p1", card: materializePlayedCard(makeCard("kraken", { type: "kraken" })) },
    { playerId: "p2", card: materializePlayedCard(makeCard("yellow14", { type: "number", suit: "yellow", rank: 14 })) },
    { playerId: "p3", card: materializePlayedCard(makeCard("whale", { type: "white_whale" })) },
  ];

  assert.equal(getWinningPlayIndex(whaleThenKraken), null);
  assert.equal(getNextTrickLeadPlayerId(whaleThenKraken), "p2");
  assert.equal(getWinningPlayIndex(krakenThenWhale), 1);
});

test("completed round scores bids and ends match at round ten", () => {
  let state = setupRound(["Ada", "Ben"]);
  state = {
    ...state,
    completedRoundCount: 9,
    round: state.round
      ? {
          ...state.round,
          roundNumber: 10,
          playerOrder: ["p1", "p2"],
          leadPlayerId: "p1",
          currentPlayerId: "p1",
          currentTrick: {
            trickNumber: 1,
            leadPlayerId: "p1",
            plays: [],
            winningPlayIndex: null,
          },
          completedTricks: [],
        }
      : null,
  };

  state = submitBid(state, "p1", 1).state!;
  state = submitBid(state, "p2", 0).state!;
  state = withHands(state, {
    p1: [makeCard("g7", { type: "number", suit: "green", rank: 7 })],
    p2: [makeCard("e1", { type: "escape" })],
  });

  state = playCard(state, "p1", "g7").state!;
  state = playCard(state, "p2", "e1").state!;
  assert.equal(state.round?.currentPlayerId, null);
  assert.equal(state.round?.currentTrick.plays.length, 2);
  state = resolveCurrentTrick(state);

  assert.equal(state.phase, "match_over");
  assert.deepEqual(state.matchWinnerIds, ["p2"]);
  assert.equal(state.players.find((player) => player.id === "p1")?.totalScore, 20);
  assert.equal(state.players.find((player) => player.id === "p2")?.totalScore, 100);
});

test("random bot action is chosen from player view only and follows suit", () => {
  let state = setupRound(["Ada", "Bot"]);
  state = submitBid(state, "p1", 1).state!;
  state = submitBid(state, "p2", 1).state!;
  state = withHands(state, {
    p1: [makeCard("g5", { type: "number", suit: "green", rank: 5 })],
    p2: [
      makeCard("g9", { type: "number", suit: "green", rank: 9 }),
      makeCard("b13", { type: "number", suit: "black", rank: 13 }),
    ],
  });
  state = playCard(state, "p1", "g5").state!;

  const action = chooseRandomSkullKingBotAction(toPlayerViewState(state, "p2"), () => 0.99);

  assert.deepEqual(action, { type: "play_card", instanceId: "g9", tigressMode: undefined });
});

test("safe skull king bot makes a conservative nonzero bid", () => {
  let state = setupRound(["Ada", "Bot"]);
  state = {
    ...state,
    round: state.round ? { ...state.round, roundNumber: 5 } : null,
  };
  state = withHands(state, {
    p2: [
      makeCard("e1", { type: "escape" }),
      makeCard("g2", { type: "number", suit: "green", rank: 2 }),
      makeCard("y4", { type: "number", suit: "yellow", rank: 4 }),
      makeCard("p8", { type: "number", suit: "purple", rank: 8 }),
      makeCard("b10", { type: "number", suit: "black", rank: 10 }),
    ],
  });

  const action = chooseSkullKingBotAction(toPlayerViewState(state, "p2"), "safe");

  assert.equal(action?.type, "bid");
  assert.equal(action?.type === "bid" ? action.bid >= 1 : false, true);
  assert.equal(action?.type === "bid" ? action.bid <= 2 : false, true);
});

test("aggressive skull king bot chooses nil with a very evasive hand", () => {
  let state = setupRound(["Ada", "Bot"]);
  state = {
    ...state,
    round: state.round ? { ...state.round, roundNumber: 4 } : null,
  };
  state = withHands(state, {
    p2: [
      makeCard("e1", { type: "escape" }),
      makeCard("e2", { type: "escape" }),
      makeCard("loot", { type: "loot" }),
      makeCard("g1", { type: "number", suit: "green", rank: 1 }),
    ],
  });

  const action = chooseSkullKingBotAction(toPlayerViewState(state, "p2"), "aggressive");

  assert.deepEqual(action, { type: "bid", bid: 0 });
});

test("genius skull king bot protects an already satisfied bid", () => {
  let state = setupRound(["Ada", "Bot", "Cal"]);
  state = submitBid(state, "p1", 1).state!;
  state = submitBid(state, "p2", 0).state!;
  state = submitBid(state, "p3", 0).state!;
  state = {
    ...state,
    round: state.round
      ? {
          ...state.round,
          playerOrder: ["p1", "p2", "p3"],
          leadPlayerId: "p1",
          currentPlayerId: "p2",
          currentTrick: {
            trickNumber: 1,
            leadPlayerId: "p1",
            plays: [{ playerId: "p1", card: makeCard("g13", { type: "number", suit: "green", rank: 13 }) }],
            winningPlayIndex: 0,
          },
        }
      : null,
  };
  state = withHands(state, {
    p2: [
      makeCard("e1", { type: "escape" }),
      makeCard("skull", { type: "skull_king" }),
    ],
  });

  const action = chooseSkullKingBotAction(toPlayerViewState(state, "p2"), "genius");

  assert.deepEqual(action, { type: "play_card", instanceId: "e1", tigressMode: undefined });
});

test("genius skull king bot adjusts threat reads from opponent bids", () => {
  let nilOpponentState = setupRound(["Bot", "Opp"]);
  nilOpponentState = submitBid(nilOpponentState, "p1", 1).state!;
  nilOpponentState = submitBid(nilOpponentState, "p2", 0).state!;
  nilOpponentState = withHands(nilOpponentState, {
    p1: [
      makeCard("g14", { type: "number", suit: "green", rank: 14 }),
      makeCard("pirate", { type: "pirate" }),
    ],
  });

  let highBidOpponentState = setupRound(["Bot", "Opp"]);
  highBidOpponentState = submitBid(highBidOpponentState, "p1", 1).state!;
  highBidOpponentState = submitBid(highBidOpponentState, "p2", 1).state!;
  highBidOpponentState = withHands(highBidOpponentState, {
    p1: [
      makeCard("g14", { type: "number", suit: "green", rank: 14 }),
      makeCard("pirate", { type: "pirate" }),
    ],
  });

  const nilRead = chooseSkullKingBotAction(toPlayerViewState(nilOpponentState, "p1"), "genius");
  const highBidRead = chooseSkullKingBotAction(toPlayerViewState(highBidOpponentState, "p1"), "genius");

  assert.deepEqual(nilRead, { type: "play_card", instanceId: "pirate", tigressMode: undefined });
  assert.deepEqual(highBidRead, { type: "play_card", instanceId: "g14", tigressMode: undefined });
});

test("genius skull king bot remembers void suits from previous tricks", () => {
  let withoutVoidState = setupRound(["Bot", "Opp"]);
  withoutVoidState = submitBid(withoutVoidState, "p1", 0).state!;
  withoutVoidState = submitBid(withoutVoidState, "p2", 1).state!;
  withoutVoidState = {
    ...withoutVoidState,
    round: withoutVoidState.round
      ? {
          ...withoutVoidState.round,
          roundNumber: 2,
          currentTrick: {
            trickNumber: 2,
            leadPlayerId: "p1",
            plays: [],
            winningPlayIndex: null,
          },
          completedTricks: [],
        }
      : null,
  };
  withoutVoidState = withHands(withoutVoidState, {
    p1: [
      makeCard("g14", { type: "number", suit: "green", rank: 14 }),
      makeCard("y2", { type: "number", suit: "yellow", rank: 2 }),
    ],
  });

  const withVoidState = {
    ...withoutVoidState,
    round: withoutVoidState.round
      ? {
          ...withoutVoidState.round,
          completedTricks: [
            {
              trickNumber: 1,
              leadPlayerId: "p1",
              plays: [
                { playerId: "p1", card: makeCard("oldg", { type: "number", suit: "green", rank: 5 }) },
                { playerId: "p2", card: makeCard("olde", { type: "escape" }) },
              ],
              winnerPlayerId: "p1",
              winningPlayIndex: 0,
              bonusEvents: [],
            },
          ],
        }
      : null,
  };

  const noVoidRead = chooseSkullKingBotAction(toPlayerViewState(withoutVoidState, "p1"), "genius");
  const voidRead = chooseSkullKingBotAction(toPlayerViewState(withVoidState, "p1"), "genius");

  assert.deepEqual(noVoidRead, { type: "play_card", instanceId: "y2", tigressMode: undefined });
  assert.deepEqual(voidRead, { type: "play_card", instanceId: "g14", tigressMode: undefined });
});

test("bots stay ready after round scoring so the next round can start", () => {
  let state = setupRound(["Ada", "Bot"]);
  state = {
    ...state,
    players: state.players.map((player) => (player.id === "p2" ? { ...player, isBot: true } : player)),
  };
  state = submitBid(state, "p1", 1).state!;
  state = submitBid(state, "p2", 0).state!;
  state = withHands(state, {
    p1: [makeCard("g7", { type: "number", suit: "green", rank: 7 })],
    p2: [makeCard("e1", { type: "escape" })],
  });

  state = playCard(state, "p1", "g7").state!;
  state = playCard(state, "p2", "e1").state!;
  state = resolveCurrentTrick(state);

  assert.equal(state.phase, "round_over");
  assert.equal(state.players.find((player) => player.id === "p1")?.isReady, false);
  assert.equal(state.players.find((player) => player.id === "p2")?.isReady, true);
});

test("bonus points only count for exact bidders and include fourteens", () => {
  let state = setupRound(["Ada", "Ben"]);
  state = {
    ...state,
    round: state.round
      ? {
          ...state.round,
          roundNumber: 1,
          playerOrder: ["p1", "p2"],
          leadPlayerId: "p1",
          currentPlayerId: "p1",
        }
      : null,
  };
  state = submitBid(state, "p1", 1).state!;
  state = submitBid(state, "p2", 0).state!;
  state = withHands(state, {
    p1: [makeCard("g14", { type: "number", suit: "green", rank: 14 })],
    p2: [makeCard("e1", { type: "escape" })],
  });

  state = playCard(state, "p1", "g14").state!;
  state = playCard(state, "p2", "e1").state!;
  state = resolveCurrentTrick(state);

  assert.equal(state.players.find((player) => player.id === "p1")?.roundScore, 20);
  assert.equal(state.players.find((player) => player.id === "p1")?.bonusScore, 10);
});

test("failed bids do not score capture bonuses", () => {
  let state = setupRound(["Ada", "Ben"]);
  state = submitBid(state, "p1", 0).state!;
  state = submitBid(state, "p2", 0).state!;
  state = withHands(state, {
    p1: [makeCard("skull", { type: "skull_king" })],
    p2: [makeCard("pirate", { type: "pirate" })],
  });

  state = playCard(state, "p1", "skull").state!;
  state = playCard(state, "p2", "pirate").state!;
  state = resolveCurrentTrick(state);

  assert.equal(state.players.find((player) => player.id === "p1")?.roundScore, -10);
  assert.equal(state.players.find((player) => player.id === "p1")?.bonusScore, 0);
});
