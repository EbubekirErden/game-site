import test from "node:test";
import assert from "node:assert/strict";

import { addPlayer, createGame, playCardAction, removePlayer, setPlayerReady, startRound } from "./engine.js";
import type { CardInstance, GameState, PlayerID } from "./types.js";

function makeCard(cardId: CardInstance["cardId"], instanceId: string): CardInstance {
  return { cardId, instanceId };
}

function setupStartedGame(playerNames: string[]): GameState {
  let state = createGame("room-1", "p1");

  for (const [index, name] of playerNames.entries()) {
    state = addPlayer(state, `p${index + 1}`, name);
    state = setPlayerReady(state, `p${index + 1}`, true);
  }

  return startRound(state);
}

function setPlayerHand(state: GameState, playerId: PlayerID, cards: CardInstance[]): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            hand: [...cards],
          }
        : player,
    ),
  };
}

function setRoundDeck(state: GameState, deck: CardInstance[]): GameState {
  if (!state.round) {
    throw new Error("Round is not active");
  }

  return {
    ...state,
    round: {
      ...state.round,
      deck: [...deck],
    },
  };
}

test("countess must be played when held with prince", () => {
  let state = setupStartedGame(["Ava", "Ben"]);
  state = setPlayerHand(state, "p1", [makeCard("countess", "countess-1"), makeCard("prince", "prince-1")]);

  const result = playCardAction(state, "p1", "prince-1", { targetPlayerId: "p1" });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "countess_must_be_played");
});

test("prince eliminates a player who discards the princess", () => {
  let state = setupStartedGame(["Ava", "Ben"]);
  state = setPlayerHand(state, "p1", [makeCard("prince", "prince-1"), makeCard("guard", "guard-1")]);
  state = setPlayerHand(state, "p2", [makeCard("princess", "princess-1")]);
  state = setRoundDeck(state, [makeCard("guard", "deck-guard-1")]);

  const result = playCardAction(state, "p1", "prince-1", { targetPlayerId: "p2" });

  assert.equal(result.ok, true);
  assert.equal(result.state?.phase, "round_over");
  assert.equal(result.state?.players.find((player) => player.id === "p2")?.status, "eliminated");
  assert.equal(result.state?.players.find((player) => player.id === "p1")?.tokens, 1);
});

test("handmaid protection blocks guard targeting", () => {
  let state = setupStartedGame(["Ava", "Ben", "Cara"]);
  state = setPlayerHand(state, "p1", [makeCard("guard", "guard-1"), makeCard("priest", "priest-1")]);
  state = {
    ...state,
    players: state.players.map((player) =>
      player.id === "p2"
        ? {
            ...player,
            protectedUntilNextTurn: true,
          }
        : player,
    ),
  };

  const result = playCardAction(state, "p1", "guard-1", {
    targetPlayerId: "p2",
    guessedValue: 2,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_target");
});

test("guard can be played without a target when all opponents are protected", () => {
  let state = setupStartedGame(["Ava", "Ben"]);
  state = setPlayerHand(state, "p1", [makeCard("guard", "guard-1"), makeCard("priest", "priest-1")]);
  state = {
    ...state,
    players: state.players.map((player) =>
      player.id === "p2"
        ? {
            ...player,
            protectedUntilNextTurn: true,
          }
        : player,
    ),
  };

  const result = playCardAction(state, "p1", "guard-1");

  assert.equal(result.ok, true);
  assert.equal(result.state?.phase, "in_round");
  assert.equal(result.state?.players.find((player) => player.id === "p2")?.status, "active");
});

test("baron eliminates the lower hand", () => {
  let state = setupStartedGame(["Ava", "Ben", "Cara"]);
  state = setPlayerHand(state, "p1", [makeCard("baron", "baron-1"), makeCard("prince", "prince-1")]);
  state = setPlayerHand(state, "p2", [makeCard("priest", "priest-1")]);
  state = setRoundDeck(state, [makeCard("guard", "deck-guard-1"), makeCard("guard", "deck-guard-2")]);

  const result = playCardAction(state, "p1", "baron-1", { targetPlayerId: "p2" });

  assert.equal(result.ok, true);
  assert.equal(result.state?.players.find((player) => player.id === "p2")?.status, "eliminated");
});

test("round end breaks ties with discard pile totals", () => {
  let state = setupStartedGame(["Ava", "Ben"]);
  state = setPlayerHand(state, "p1", [makeCard("guard", "guard-1"), makeCard("priest", "priest-1")]);
  state = setPlayerHand(state, "p2", [makeCard("priest", "priest-2")]);
  state = {
    ...state,
    players: state.players.map((player) => {
      if (player.id === "p1") {
        return {
          ...player,
          discardPile: [makeCard("king", "king-1")],
        };
      }

      if (player.id === "p2") {
        return {
          ...player,
          discardPile: [makeCard("guard", "guard-2")],
        };
      }

      return player;
    }),
  };
  state = setRoundDeck(state, []);

  const result = playCardAction(state, "p1", "guard-1", {
    targetPlayerId: "p2",
    guessedValue: 5,
  });

  assert.equal(result.ok, true);
  assert.equal(result.state?.phase, "round_over");
  assert.deepEqual(result.state?.roundWinnerIds, ["p1"]);
});

test("next round waits for everyone to confirm ready again", () => {
  let state = setupStartedGame(["Ava", "Ben"]);
  state = {
    ...state,
    phase: "round_over",
    roundWinnerIds: ["p1"],
  };

  const blockedStart = startRound(state);
  assert.equal(blockedStart, state);

  state = setPlayerReady(state, "p1", true);
  state = setPlayerReady(state, "p2", true);

  const restarted = startRound(state);
  assert.equal(restarted.phase, "in_round");
  assert.ok(restarted.round);
  assert.equal(restarted.players.every((player) => player.isReady === false), true);
});

test("disconnecting the last opponent awards the round and returns the room to lobby", () => {
  let state = setupStartedGame(["Ava", "Ben"]);

  state = removePlayer(state, "p2");

  assert.equal(state.phase, "lobby");
  assert.equal(state.players.length, 1);
  assert.equal(state.players[0]?.id, "p1");
  assert.equal(state.players[0]?.tokens, 1);
  assert.equal(state.round, null);
});
