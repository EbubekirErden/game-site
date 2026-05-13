import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getCardCopies, getCardDef } from "@game-site/shared/games/love-letter/cards";
import { toBotObservation } from "@game-site/shared/games/love-letter/engine";
import type {
  BotMemorySnapshot,
  BotObservedCardFact,
  CardID,
  CardInstance,
  GameState,
  LoveLetterMode,
  PlayerID,
} from "@game-site/shared/games/love-letter/types";

import { listBotActionCandidates, type BotPlayDecision } from "./botBrain.js";

const CARD_TYPES: CardID[] = [
  "assassin",
  "jester",
  "guard",
  "cardinal",
  "priest",
  "baron",
  "baroness",
  "handmaid",
  "sycophant",
  "prince",
  "count",
  "constable",
  "king",
  "countess",
  "dowager_queen",
  "princess",
  "bishop",
];

type TargetSlot = "self" | "opp0" | "opp1" | "opp2";
type RLActionTemplate =
  | {
      kind: "play";
      cardId: CardID;
      targetSlots?: TargetSlot[];
      guessedValue?: number;
    }
  | {
      kind: "cardinal_peek";
      targetSlot: TargetSlot;
    };

const TARGET_SLOTS: TargetSlot[] = ["self", "opp0", "opp1", "opp2"];
const OPPONENT_SLOTS: TargetSlot[] = ["opp0", "opp1", "opp2"];
const GUESS_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const OBSERVATION_SIZE = 228;
const ACTION_TIMEOUT_MS = 10_000;

function getWinningTokenCount(mode: LoveLetterMode, playerCount: number): number {
  if (mode === "premium") return 4;
  if (playerCount <= 2) return 7;
  if (playerCount === 3) return 5;
  return 4;
}

function getCardValue(cardId: CardID): number {
  return getCardDef(cardId).value;
}

function buildActionTemplates(): RLActionTemplate[] {
  const templates: RLActionTemplate[] = [];

  for (const cardId of CARD_TYPES) {
    templates.push({ kind: "play", cardId });
  }

  for (const cardId of ["guard", "bishop"] as CardID[]) {
    for (const targetSlot of OPPONENT_SLOTS) {
      for (const guessedValue of GUESS_VALUES) {
        templates.push({ kind: "play", cardId, targetSlots: [targetSlot], guessedValue });
      }
    }
  }

  for (const cardId of ["jester", "priest", "baron", "king", "dowager_queen"] as CardID[]) {
    for (const targetSlot of OPPONENT_SLOTS) {
      templates.push({ kind: "play", cardId, targetSlots: [targetSlot] });
    }
  }

  templates.push({ kind: "play", cardId: "handmaid", targetSlots: ["self"] });

  for (const cardId of ["sycophant", "prince"] as CardID[]) {
    for (const targetSlot of TARGET_SLOTS) {
      templates.push({ kind: "play", cardId, targetSlots: [targetSlot] });
    }
  }

  for (const targetSlot of OPPONENT_SLOTS) {
    templates.push({ kind: "play", cardId: "baroness", targetSlots: [targetSlot] });
  }
  for (let first = 0; first < OPPONENT_SLOTS.length; first += 1) {
    for (let second = first + 1; second < OPPONENT_SLOTS.length; second += 1) {
      templates.push({ kind: "play", cardId: "baroness", targetSlots: [OPPONENT_SLOTS[first]!, OPPONENT_SLOTS[second]!] });
    }
  }

  for (let first = 0; first < TARGET_SLOTS.length; first += 1) {
    for (let second = first + 1; second < TARGET_SLOTS.length; second += 1) {
      templates.push({ kind: "play", cardId: "cardinal", targetSlots: [TARGET_SLOTS[first]!, TARGET_SLOTS[second]!] });
    }
  }
  for (const targetSlot of TARGET_SLOTS) {
    templates.push({ kind: "cardinal_peek", targetSlot });
  }

  return templates;
}

const ACTION_TEMPLATES = buildActionTemplates();

type PredictorRequest = {
  obs: number[];
  actionMask: boolean[];
  resolve: (action: number | null) => void;
  timeout: NodeJS.Timeout;
};

class RlPredictorProcess {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending: PredictorRequest[] = [];
  private stdoutBuffer = "";

  public predict(obs: number[], actionMask: boolean[]): Promise<number | null> {
    if (!actionMask.some(Boolean)) return Promise.resolve(null);

    const child = this.getChild();
    if (!child || !child.stdin.writable) return Promise.resolve(null);

    return new Promise((resolvePrediction) => {
      const request: PredictorRequest = {
        obs,
        actionMask,
        resolve: resolvePrediction,
        timeout: setTimeout(() => {
          this.pending = this.pending.filter((candidate) => candidate !== request);
          resolvePrediction(null);
        }, ACTION_TIMEOUT_MS),
      };

      this.pending.push(request);
      child.stdin.write(`${JSON.stringify({ obs, actionMask })}\n`);
    });
  }

  private getChild(): ChildProcessWithoutNullStreams | null {
    if (this.child && !this.child.killed) return this.child;

    const here = dirname(fileURLToPath(import.meta.url));
    const modelPath = process.env.RL_BOT_MODEL_PATH ?? resolve(here, "../../../models/masked_ppo_love_letter_self_play_agent.zip");
    const predictorPath = resolve(here, "rl_predictor.py");
    const defaultPythonPath = resolve(here, "../../../../RL_native/venv/Scripts/python.exe");
    const pythonPath = process.env.RL_BOT_PYTHON ?? (existsSync(defaultPythonPath) ? defaultPythonPath : "python");

    this.child = spawn(pythonPath, [predictorPath, modelPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.child.stdout.on("data", (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString("utf8");
      let newlineIndex = this.stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
        this.handleLine(line);
        newlineIndex = this.stdoutBuffer.indexOf("\n");
      }
    });

    this.child.stderr.on("data", (chunk: Buffer) => {
      console.warn(`[rl-bot] ${chunk.toString("utf8").trim()}`);
    });

    this.child.on("exit", () => {
      this.child = null;
      const pending = this.pending.splice(0);
      for (const request of pending) {
        clearTimeout(request.timeout);
        request.resolve(null);
      }
    });

    return this.child;
  }

  private handleLine(line: string): void {
    const request = this.pending.shift();
    if (!request) return;

    clearTimeout(request.timeout);
    try {
      const payload = JSON.parse(line) as { ok?: boolean; action?: number; error?: string };
      if (payload.ok === true && typeof payload.action === "number") {
        request.resolve(payload.action);
        return;
      }
      console.warn(`[rl-bot] predictor failed: ${payload.error ?? line}`);
      request.resolve(null);
    } catch {
      console.warn(`[rl-bot] predictor returned invalid JSON: ${line}`);
      request.resolve(null);
    }
  }
}

const predictor = new RlPredictorProcess();

function sameTargets(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function getDecisionTargets(decision: BotPlayDecision): string[] {
  return decision.targetPlayerIds ?? (decision.targetPlayerId ? [decision.targetPlayerId] : []);
}

function resolveTargetSlot(playerId: PlayerID, slot: TargetSlot, view: ReturnType<typeof toBotObservation>): PlayerID | null {
  if (slot === "self") return playerId;

  const index = Number(slot.replace("opp", ""));
  const opponents = view.players.filter((player) => player.id !== playerId);
  return opponents[index]?.id ?? null;
}

function getLiveKnownHandFact(memory: BotMemorySnapshot, targetPlayerId: PlayerID): BotObservedCardFact | null {
  const newestHandFact = memory.observedCardFacts
    .filter((fact) => fact.playerId === targetPlayerId && fact.location === "hand" && fact.card)
    .sort((left, right) => right.turnNumber - left.turnNumber)[0];
  if (!newestHandFact?.card) return null;

  const discardedLater = memory.observedCardFacts.some((fact) => {
    if (fact.playerId !== targetPlayerId || fact.location !== "discard" || !fact.card) return false;
    if (fact.turnNumber <= newestHandFact.turnNumber) return false;
    return fact.card.instanceId === newestHandFact.card?.instanceId || fact.card.cardId === newestHandFact.card?.cardId;
  });

  return discardedLater ? null : newestHandFact;
}

function getTurnDistance(view: ReturnType<typeof toBotObservation>, targetPlayerId: PlayerID): number {
  const currentPlayerId = view.round?.currentPlayerId ?? null;
  if (!currentPlayerId) return 0;

  const currentIndex = view.players.findIndex((player) => player.id === currentPlayerId);
  if (currentIndex < 0) return 0;

  for (let offset = 0; offset < view.players.length; offset += 1) {
    const candidate = view.players[(currentIndex + offset) % view.players.length];
    if (candidate?.id === targetPlayerId) return offset / Math.max(1, view.players.length - 1);
  }

  return 0;
}

function pushVisibleBeliefState(vector: number[], view: ReturnType<typeof toBotObservation>, playerId: PlayerID): void {
  const visibleCards: CardInstance[] = [];
  const seenInstanceIds = new Set<string>();
  const pushVisibleCards = (cards: CardInstance[] = []) => {
    for (const card of cards) {
      if (seenInstanceIds.has(card.instanceId)) continue;
      seenInstanceIds.add(card.instanceId);
      visibleCards.push(card);
    }
  };

  const self = view.players.find((player) => player.id === playerId);
  pushVisibleCards(self?.hand ?? []);
  for (const player of view.players) {
    pushVisibleCards(player.discardPile);
  }
  pushVisibleCards(view.round?.visibleRemovedCards ?? []);

  for (const opponent of view.players.filter((player) => player.id !== playerId)) {
    const knownFact = getLiveKnownHandFact(view.memory, opponent.id);
    if (knownFact?.card) pushVisibleCards([knownFact.card]);
  }

  const remainingByCard = new Map<CardID, number>();
  for (const cardId of CARD_TYPES) {
    remainingByCard.set(cardId, getCardCopies(cardId, view.mode));
  }
  for (const card of visibleCards) {
    remainingByCard.set(card.cardId, Math.max(0, (remainingByCard.get(card.cardId) ?? 0) - 1));
  }

  let remainingTotal = 0;
  for (const cardId of CARD_TYPES) {
    const remaining = remainingByCard.get(cardId) ?? 0;
    remainingTotal += remaining;
    vector.push(remaining / Math.max(1, getCardCopies(cardId, view.mode)));
  }

  for (const value of GUESS_VALUES) {
    const remainingForValue = CARD_TYPES
      .filter((cardId) => getCardValue(cardId) === value)
      .reduce((total, cardId) => total + (remainingByCard.get(cardId) ?? 0), 0);
    vector.push(remainingTotal > 0 ? remainingForValue / remainingTotal : 0);
  }

  vector.push(remainingTotal / 24.0);
}

function resolveDecisionForTemplate(
  playerId: PlayerID,
  action: Extract<RLActionTemplate, { kind: "play" }>,
  view: ReturnType<typeof toBotObservation>,
  candidates: BotPlayDecision[],
): BotPlayDecision | null {
  const self = view.players.find((player) => player.id === playerId);
  const card = self?.hand.find((candidate) => candidate.cardId === action.cardId);
  if (!card) return null;

  const targetPlayerIds = action.targetSlots?.map((slot) => resolveTargetSlot(playerId, slot, view)) ?? [];
  if (targetPlayerIds.some((targetPlayerId) => !targetPlayerId)) return null;
  const concreteTargetIds = targetPlayerIds as string[];

  return (
    candidates.find((candidate) => {
      const candidateCard = self?.hand.find((handCard) => handCard.instanceId === candidate.instanceId);
      if (candidateCard?.cardId !== action.cardId) return false;
      if (candidate.guessedValue !== action.guessedValue) return false;
      return sameTargets(getDecisionTargets(candidate), concreteTargetIds);
    }) ?? null
  );
}

function getActionMask(state: GameState, playerId: PlayerID, memory: BotMemorySnapshot): boolean[] {
  const view = toBotObservation(state, playerId, memory);
  const pending = state.round?.pendingCardinalPeek ?? null;

  if (pending?.actorPlayerId === playerId) {
    return ACTION_TEMPLATES.map((template) => {
      if (template.kind !== "cardinal_peek") return false;
      const targetPlayerId = resolveTargetSlot(playerId, template.targetSlot, view);
      return Boolean(targetPlayerId && pending.targetPlayerIds.includes(targetPlayerId));
    });
  }

  if (state.phase !== "in_round" || state.round?.currentPlayerId !== playerId) {
    return ACTION_TEMPLATES.map(() => false);
  }

  const candidates = listBotActionCandidates(view);
  return ACTION_TEMPLATES.map((template) => {
    if (template.kind !== "play") return false;
    return Boolean(resolveDecisionForTemplate(playerId, template, view, candidates));
  });
}

function getObservationVector(state: GameState, playerId: PlayerID, memory: BotMemorySnapshot): number[] {
  if (state.phase !== "in_round" || !state.round) {
    return Array(OBSERVATION_SIZE).fill(0);
  }

  const obs = toBotObservation(state, playerId, memory);
  const vector: number[] = [];
  const self = obs.players.find((player) => player.id === playerId);
  const opponents = obs.players.filter((player) => player.id !== playerId);
  const forcedTargetPlayerId = obs.round?.forcedTargetPlayerId ?? null;
  const pendingCardinalTargets: PlayerID[] = [...(obs.round?.pendingCardinalPeek?.targetPlayerIds ?? [])];

  vector.push(obs.mode === "premium" ? 1.0 : 0.0);
  vector.push((obs.round?.deckCount ?? 0) / 24.0);
  vector.push(Math.min(1.0, (obs.round?.turnNumber ?? 0) / 32.0));
  vector.push(obs.players.filter((player) => player.status === "active").length / 4.0);
  vector.push(getWinningTokenCount(obs.mode, obs.players.length) / 7.0);

  for (const slot of TARGET_SLOTS) {
    vector.push(resolveTargetSlot(playerId, slot, obs) === forcedTargetPlayerId ? 1.0 : 0.0);
  }

  for (const slot of TARGET_SLOTS) {
    const targetPlayerId = resolveTargetSlot(playerId, slot, obs);
    vector.push(targetPlayerId && pendingCardinalTargets.includes(targetPlayerId) ? 1.0 : 0.0);
  }

  vector.push(self?.status === "active" ? 1.0 : 0.0);
  vector.push(self?.protectedUntilNextTurn ? 1.0 : 0.0);
  vector.push((self?.tokens ?? 0) / 7.0);
  vector.push((self?.handCount ?? 0) / 2.0);
  pushCardCounts(vector, self?.hand ?? [], obs.mode, 2);
  pushCardCounts(vector, self?.discardPile ?? [], obs.mode, 1);
  pushCardCounts(vector, obs.round?.visibleRemovedCards ?? [], obs.mode, 1);
  pushVisibleBeliefState(vector, obs, playerId);

  for (let index = 0; index < 3; index += 1) {
    const opponent = opponents[index];
    if (!opponent) {
      vector.push(...Array(44).fill(0));
      continue;
    }

    vector.push(1.0);
    vector.push(opponent.status === "active" ? 1.0 : 0.0);
    vector.push(opponent.protectedUntilNextTurn ? 1.0 : 0.0);
    vector.push(opponent.tokens / 7.0);
    vector.push(opponent.handCount / 2.0);
    vector.push(opponent.id === forcedTargetPlayerId ? 1.0 : 0.0);
    vector.push(pendingCardinalTargets.includes(opponent.id) ? 1.0 : 0.0);
    vector.push(getTurnDistance(obs, opponent.id));
    vector.push(Math.max(0, opponent.tokens - (self?.tokens ?? 0)) / 7.0);
    const knownHandFact = getLiveKnownHandFact(obs.memory, opponent.id);
    vector.push(knownHandFact ? Math.min(1.0, ((obs.round?.turnNumber ?? 0) - knownHandFact.turnNumber) / 32.0) : 0.0);
    pushCardCounts(vector, opponent.discardPile, obs.mode, 1);
    pushKnownHand(vector, obs.memory, opponent.id);
  }

  if (vector.length !== OBSERVATION_SIZE) {
    throw new Error(`RL observation size mismatch: expected ${OBSERVATION_SIZE}, got ${vector.length}`);
  }

  return vector;
}

function pushCardCounts(vector: number[], cards: CardInstance[], mode: LoveLetterMode, denominatorFallback: number): void {
  for (const cardId of CARD_TYPES) {
    const count = cards.filter((card) => card.cardId === cardId).length;
    const denominator = Math.max(denominatorFallback, getCardCopies(cardId, mode), 1);
    vector.push(count / denominator);
  }
}

function pushKnownHand(vector: number[], memory: BotMemorySnapshot, playerId: PlayerID): void {
  const knownCardId = getLiveKnownHandFact(memory, playerId)?.card?.cardId ?? null;

  for (const candidateCardId of CARD_TYPES) {
    vector.push(candidateCardId === knownCardId ? 1.0 : 0.0);
  }
}

export async function chooseRlBotPlay(
  state: GameState,
  playerId: PlayerID,
  memory: BotMemorySnapshot,
): Promise<BotPlayDecision | null> {
  const actionMask = getActionMask(state, playerId, memory);
  const actionId = await predictor.predict(getObservationVector(state, playerId, memory), actionMask);
  if (actionId === null) return null;

  const template = ACTION_TEMPLATES[actionId];
  if (!template || template.kind !== "play") {
    console.warn(`[rl-bot] predicted non-play action for play turn: ${actionId}`);
    return null;
  }

  const view = toBotObservation(state, playerId, memory);
  const decision = resolveDecisionForTemplate(playerId, template, view, listBotActionCandidates(view));
  if (!decision) {
    console.warn(`[rl-bot] predicted illegal play action: ${actionId}`);
  }
  return decision;
}

export async function chooseRlCardinalPeekTarget(
  state: GameState,
  playerId: PlayerID,
  memory: BotMemorySnapshot,
): Promise<PlayerID | null> {
  const actionMask = getActionMask(state, playerId, memory);
  const actionId = await predictor.predict(getObservationVector(state, playerId, memory), actionMask);
  if (actionId === null) return null;

  const template = ACTION_TEMPLATES[actionId];
  if (!template || template.kind !== "cardinal_peek") {
    console.warn(`[rl-bot] predicted non-cardinal action for cardinal peek: ${actionId}`);
    return null;
  }

  return resolveTargetSlot(playerId, template.targetSlot, toBotObservation(state, playerId, memory));
}
