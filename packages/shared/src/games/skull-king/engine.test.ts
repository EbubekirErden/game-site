import test from "node:test";
import assert from "node:assert/strict";

import { applyBidTimeout, createGame, playCard, setPlayerReady, startRound, submitBid } from "./engine.js";
import { getWinningPlayIndex, materializePlayedCard } from "./rules.js";
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

  assert.equal(state.phase, "match_over");
  assert.deepEqual(state.matchWinnerIds, ["p2"]);
  assert.equal(state.players.find((player) => player.id === "p1")?.totalScore, 20);
  assert.equal(state.players.find((player) => player.id === "p2")?.totalScore, 100);
});
