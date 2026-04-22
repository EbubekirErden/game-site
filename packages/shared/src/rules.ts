// packages/shared/src/rules.ts

export type ClientAction =
  | { type: "play_card"; playerId: string; instanceId: string; targetPlayerId?: string; guessCardId?: string }
  | { type: "start_round"; playerId: string };

export interface ActionResult {
  ok: boolean;
  reason?: string;
}