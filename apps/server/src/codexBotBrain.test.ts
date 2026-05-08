import test from "node:test";
import assert from "node:assert/strict";

import { selectCandidateFromCodexResponse, selectCardinalTargetFromCodexResponse } from "./codexBotBrain.js";
import type { BotPlayDecision } from "./botBrain.js";

const candidates: BotPlayDecision[] = [
  { instanceId: "guard-1", targetPlayerId: "p2", guessedValue: 5 },
  { instanceId: "priest-1", targetPlayerId: "p3" },
];

test("selectCandidateFromCodexResponse accepts an in-range integer candidateIndex", () => {
  assert.deepEqual(selectCandidateFromCodexResponse({ candidateIndex: 1, reason: "Peek unknown hand." }, candidates), candidates[1]);
});

test("selectCandidateFromCodexResponse rejects invalid candidateIndex values", () => {
  assert.equal(selectCandidateFromCodexResponse({ candidateIndex: -1 }, candidates), null);
  assert.equal(selectCandidateFromCodexResponse({ candidateIndex: 2 }, candidates), null);
  assert.equal(selectCandidateFromCodexResponse({ candidateIndex: 0.5 }, candidates), null);
  assert.equal(selectCandidateFromCodexResponse({ candidateIndex: "0" }, candidates), null);
  assert.equal(selectCandidateFromCodexResponse({}, candidates), null);
});

test("selectCardinalTargetFromCodexResponse accepts only allowed target IDs", () => {
  assert.equal(selectCardinalTargetFromCodexResponse({ targetPlayerId: "p2", reason: "Known high hand." }, ["p1", "p2"]), "p2");
  assert.equal(selectCardinalTargetFromCodexResponse({ targetPlayerId: "p3" }, ["p1", "p2"]), null);
  assert.equal(selectCardinalTargetFromCodexResponse({ targetPlayerId: 2 }, ["p1", "p2"]), null);
});
