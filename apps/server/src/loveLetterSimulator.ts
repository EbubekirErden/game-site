import { playCardActionWithoutAdvance, toBotObservation } from "@game-site/shared/games/love-letter/engine";
import type { BotMemorySnapshot, GameState, PlayerID } from "@game-site/shared/games/love-letter/types";

import { encodeBotDecision, listBotActionCandidates, summarizeBotDecision, type BotPlayDecision } from "./botBrain.js";

export type SimulationAction = {
  actionKey: string;
  decision: BotPlayDecision;
  summary: ReturnType<typeof summarizeBotDecision>;
};

export type SimulationStepResult =
  | {
      ok: true;
      state: GameState;
      privateEffectCount: number;
    }
  | {
      ok: false;
      reason: string;
    };

export function listSimulationActions(
  state: GameState,
  playerId: PlayerID,
  memory: BotMemorySnapshot = { observedPrivateEffects: [], observedCardFacts: [] },
): SimulationAction[] {
  const observation = toBotObservation(state, playerId, memory);
  return listBotActionCandidates(observation).map((decision) => ({
    actionKey: encodeBotDecision(decision),
    decision,
    summary: summarizeBotDecision(observation, decision),
  }));
}

export function stepSimulation(state: GameState, playerId: PlayerID, decision: BotPlayDecision): SimulationStepResult {
  const result = playCardActionWithoutAdvance(state, playerId, decision.instanceId, {
    targetPlayerId: decision.targetPlayerId,
    targetPlayerIds: decision.targetPlayerIds,
    guessedValue: decision.guessedValue,
  });

  if (!result.ok || !result.state) {
    return {
      ok: false,
      reason: result.reason ?? "invalid_action",
    };
  }

  return {
    ok: true,
    state: result.state,
    privateEffectCount: result.privateEffects?.length ?? 0,
  };
}
