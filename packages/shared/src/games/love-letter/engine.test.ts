import test from "node:test";
import assert from "node:assert/strict";

import { addPlayer, addSpectator, createGame, playCardAction, removePlayer, resetMatchToLobby, setPlayerReady, startRound, toPlayerViewState } from "./engine.js";
import type { CardInstance, GameState, LoveLetterMode, PlayerID } from "./types.js";

function makeCard(cardId: CardInstance["cardId"], instanceId: string): CardInstance {
  return { cardId, instanceId };
}

function setupStartedGame(playerNames: string[], mode: LoveLetterMode = "classic"): GameState {
  let state = createGame("room-1", "p1", mode);

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

test("late arrivals can spectate without seeing private hands or affecting readiness", () => {
  let state = setupStartedGame(["Ava", "Ben"]);

  state = addSpectator(state, "p3", "Cara");
  const spectatorView = toPlayerViewState(state, "p3");

  assert.equal(spectatorView.selfRole, "spectator");
  assert.equal(spectatorView.spectators.length, 1);
  assert.equal(spectatorView.players.every((player) => player.hand.length === 0), true);
  assert.equal(setPlayerReady(state, "p3", true), state);
});

test("returning a finished match to lobby promotes spectators for the next game", () => {
  let state = setupStartedGame(["Ava", "Ben"]);
  state = addSpectator(state, "p3", "Cara");
  state = {
    ...state,
    phase: "match_over",
    matchWinnerIds: ["p1"],
    players: state.players.map((player) => ({
      ...player,
      tokens: player.id === "p1" ? 7 : 2,
    })),
  };

  const lobby = resetMatchToLobby(state);

  assert.equal(lobby.phase, "lobby");
  assert.deepEqual(lobby.players.map((player) => player.id), ["p1", "p2", "p3"]);
  assert.equal(lobby.spectators.length, 0);
  assert.equal(lobby.players.every((player) => player.tokens === 0 && !player.isReady && player.hand.length === 0), true);
  assert.equal(toPlayerViewState(lobby, "p3").selfRole, "player");
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

test("premium bishop awards a token and redraws the guessed target", () => {
  let state = setupStartedGame(["Ava", "Ben", "Cara", "Drew", "Elle"], "premium");
  state = setPlayerHand(state, "p1", [makeCard("bishop", "bishop-1"), makeCard("guard", "guard-1")]);
  state = setPlayerHand(state, "p2", [makeCard("prince", "prince-1")]);
  state = setRoundDeck(state, [makeCard("countess", "deck-countess-1"), makeCard("guard", "deck-guard-1")]);

  const result = playCardAction(state, "p1", "bishop-1", {
    targetPlayerId: "p2",
    guessedValue: 5,
  });

  assert.equal(result.ok, true);
  assert.equal(result.state?.players.find((player) => player.id === "p1")?.tokens, 1);
  assert.equal(result.state?.players.find((player) => player.id === "p2")?.hand[0]?.cardId, "countess");
});

test("premium assassin reflects a guard and survives", () => {
  let state = setupStartedGame(["Ava", "Ben", "Cara", "Drew", "Elle"], "premium");
  state = setPlayerHand(state, "p1", [makeCard("guard", "guard-1"), makeCard("priest", "priest-1")]);
  state = setPlayerHand(state, "p2", [makeCard("assassin", "assassin-1")]);
  state = setRoundDeck(state, [makeCard("countess", "deck-countess-1"), makeCard("guard", "deck-guard-1")]);

  const result = playCardAction(state, "p1", "guard-1", {
    targetPlayerId: "p2",
    guessedValue: 0,
  });

  assert.equal(result.ok, true);
  assert.equal(result.state?.players.find((player) => player.id === "p1")?.status, "eliminated");
  assert.equal(result.state?.players.find((player) => player.id === "p2")?.status, "active");
  assert.equal(result.state?.players.find((player) => player.id === "p2")?.discardPile.some((card) => card.cardId === "assassin"), true);
});

test("premium constable awards a token when its owner is eliminated", () => {
  let state = setupStartedGame(["Ava", "Ben", "Cara", "Drew", "Elle"], "premium");
  state = setPlayerHand(state, "p1", [makeCard("baron", "baron-1"), makeCard("prince", "prince-1")]);
  state = setPlayerHand(state, "p2", [makeCard("priest", "priest-1")]);
  state = {
    ...state,
    players: state.players.map((player) =>
      player.id === "p2"
        ? {
            ...player,
            discardPile: [makeCard("constable", "constable-1")],
          }
        : player,
    ),
  };
  state = setRoundDeck(state, [makeCard("guard", "deck-guard-1"), makeCard("guard", "deck-guard-2")]);

  const result = playCardAction(state, "p1", "baron-1", { targetPlayerId: "p2" });

  assert.equal(result.ok, true);
  assert.equal(result.state?.players.find((player) => player.id === "p2")?.status, "eliminated");
  assert.equal(result.state?.players.find((player) => player.id === "p2")?.tokens, 1);
});

test("premium count boosts round-end strength", () => {
  let state = setupStartedGame(["Ava", "Ben", "Cara", "Drew", "Elle"], "premium");
  state = setPlayerHand(state, "p1", [makeCard("guard", "guard-1"), makeCard("dowager_queen", "dowager-1")]);
  state = setPlayerHand(state, "p2", [makeCard("princess", "princess-1")]);
  state = {
    ...state,
    players: state.players.map((player) => {
      if (player.id === "p1") {
        return {
          ...player,
          discardPile: [makeCard("count", "count-discard-1"), makeCard("count", "count-discard-2")],
        };
      }

      if (player.id === "p2") {
        return {
          ...player,
          protectedUntilNextTurn: true,
        };
      }

      if (player.id === "p3" || player.id === "p4" || player.id === "p5") {
        return {
          ...player,
          status: "eliminated",
          hand: [],
        };
      }

      return player;
    }),
  };
  state = setRoundDeck(state, []);

  const result = playCardAction(state, "p1", "guard-1");

  assert.equal(result.ok, true);
  assert.equal(result.state?.phase, "round_over");
  assert.deepEqual(result.state?.roundWinnerIds, ["p1"]);
});
