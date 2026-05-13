import {
  addPlayer,
  cardinalPeekAction,
  createGame,
  playCardAction,
  setPlayerReady,
  startRound,
  toBotObservation,
} from "@game-site/shared/games/love-letter/engine";
import { getCardCopies, getCardDef } from "@game-site/shared/games/love-letter/cards";
import { chooseRandomBotPlay, chooseRandomCardinalPeekTarget, listBotActionCandidates } from "./botBrain.js";
import { chooseHardBotPlay, chooseHardCardinalPeekTarget, chooseSmartBotPlay, chooseSmartCardinalPeekTarget } from "./smartBotBrain.js";
import type { BotPlayDecision } from "./botBrain.js";
import type {
  BotMemorySnapshot,
  BotObservedCardFact,
  CardID,
  CardInstance,
  GameState,
  LoveLetterMode,
  PlayerID,
  PrivateEffectPresentation,
} from "@game-site/shared/games/love-letter/types";

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

type BotStrategy = "random" | "smart" | "hard";
type RLBotInfo = {
  id: string;
  name: string;
  strategy: BotStrategy;
};
type RLPayload = {
  obs: number[];
  actionMask: boolean[];
  legalActions: string[];
  info: {
    mode: LoveLetterMode;
    botCount: number;
    playerCount: number;
    bots: RLBotInfo[];
    botStrategies: BotStrategy[];
  };
};
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

type ResetOptions = {
  mode?: LoveLetterMode;
  botCount?: number;
  botStrategies?: BotStrategy[] | string;
  botStrategyPool?: BotStrategy[] | string;
};

const TARGET_SLOTS: TargetSlot[] = ["self", "opp0", "opp1", "opp2"];
const OPPONENT_SLOTS: TargetSlot[] = ["opp0", "opp1", "opp2"];
const GUESS_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const OBSERVATION_SIZE = 228;

const ACTION_TEMPLATES: RLActionTemplate[] = buildActionTemplates();

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

function emptyMemory(): BotMemorySnapshot {
  return {
    observedPrivateEffects: [],
    observedCardFacts: [],
  };
}

function makeObservedCardFact(
  effect: PrivateEffectPresentation,
  playerId: string,
  playerName: string,
  card: CardInstance | null,
  location: BotObservedCardFact["location"],
  source: BotObservedCardFact["source"],
): BotObservedCardFact {
  return {
    factId: `${effect.effectId}:${source}:${playerId}:${location}:${card?.instanceId ?? "none"}`,
    effectId: effect.effectId,
    viewerPlayerId: effect.viewerPlayerId,
    actorPlayerId: effect.actorPlayerId,
    playerId,
    playerName,
    card,
    location,
    source,
    turnNumber: effect.turnNumber,
    note: `${source} observation`,
  };
}

function extractObservedCardFacts(effect: PrivateEffectPresentation): BotObservedCardFact[] {
  switch (effect.kind) {
    case "peek":
      return [makeObservedCardFact(effect, effect.targetPlayerId, effect.targetPlayerName, effect.revealedCard, "hand", "peek")];
    case "multi_peek":
      return effect.seen.map((entry) =>
        makeObservedCardFact(effect, entry.targetPlayerId, entry.targetPlayerName, entry.revealedCard, "hand", "multi_peek"),
      );
    case "compare":
      return [
        makeObservedCardFact(effect, effect.selfPlayerId, effect.selfPlayerName, effect.selfCard, "hand", "compare"),
        makeObservedCardFact(effect, effect.opposingPlayerId, effect.opposingPlayerName, effect.opposingCard, "hand", "compare"),
      ];
    case "cardinal_reveal":
      return [makeObservedCardFact(effect, effect.chosenPlayerId, effect.chosenPlayerName, effect.revealedCard, "hand", "cardinal_reveal")];
    case "discard_reveal":
      return [makeObservedCardFact(effect, effect.targetPlayerId, effect.targetPlayerName, effect.discardedCard, "discard", "discard_reveal")];
    case "guess":
      return effect.revealedCards.map((card) =>
        makeObservedCardFact(
          effect,
          effect.targetPlayerId,
          effect.targetPlayerName,
          card,
          effect.outcome === "wrong" ? "hand" : "discard",
          "guess",
        ),
      );
    default:
      return [];
  }
}

function sameTargets(left: string[] = [], right: string[] = []): boolean {
  if (left.length !== right.length) return false;

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function getDecisionTargets(decision: BotPlayDecision): string[] {
  return decision.targetPlayerIds ?? (decision.targetPlayerId ? [decision.targetPlayerId] : []);
}

function describeAction(template: RLActionTemplate): string {
  if (template.kind === "cardinal_peek") {
    return `cardinal_peek:${template.targetSlot}`;
  }

  const targets = template.targetSlots?.join("+") ?? "none";
  const guess = template.guessedValue == null ? "" : `:guess_${template.guessedValue}`;
  return `play:${template.cardId}:${targets}${guess}`;
}

function getWinningTokenCount(mode: LoveLetterMode, playerCount: number): number {
  if (mode === "premium") return 4;
  if (playerCount <= 2) return 7;
  if (playerCount === 3) return 5;
  return 4;
}

function getCardValue(cardId: CardID): number {
  return getCardDef(cardId).value;
}

function normalizeBotStrategy(value: unknown): BotStrategy | null {
  return value === "random" || value === "smart" || value === "hard" ? value : null;
}

function parseBotStrategies(value: ResetOptions["botStrategies"]): BotStrategy[] {
  const raw =
    typeof value === "string"
      ? value.split(/[;,]/)
      : Array.isArray(value)
        ? value
        : [];
  return raw
    .map((entry) => normalizeBotStrategy(String(entry).trim().toLowerCase()))
    .filter((entry): entry is BotStrategy => Boolean(entry));
}

export class LoveLetterRLEnv {
  public readonly observationSize = OBSERVATION_SIZE;
  public readonly actionSpaceSize = ACTION_TEMPLATES.length;

  private state!: GameState;
  private agentId = "rl-agent";
  private roomId = "rl-room";
  private botStrategies = new Map<string, BotStrategy>();
  private memoryByPlayerId = new Map<string, BotMemorySnapshot>();
  private currentBotCount = 3;

  public getSpec(): { observationSize: number; actionSpaceSize: number; actions: string[] } {
    return {
      observationSize: this.observationSize,
      actionSpaceSize: this.actionSpaceSize,
      actions: ACTION_TEMPLATES.map(describeAction),
    };
  }

  public reset(options: ResetOptions = {}): RLPayload {
    const mode: LoveLetterMode = options.mode === "premium" ? "premium" : "classic";
    this.state = createGame(this.roomId, this.agentId, mode);
    this.state = addPlayer(this.state, this.agentId, "RL Agent");

    this.botStrategies.clear();
    this.memoryByPlayerId.clear();
    this.memoryByPlayerId.set(this.agentId, emptyMemory());

    const requestedStrategies = parseBotStrategies(options.botStrategies);
    const strategyPool = parseBotStrategies(options.botStrategyPool);
    const availableStrategies: BotStrategy[] = strategyPool.length > 0 ? strategyPool : ["random", "smart", "hard"];
    this.currentBotCount =
      typeof options.botCount === "number" && Number.isInteger(options.botCount)
        ? Math.min(3, Math.max(1, options.botCount))
        : requestedStrategies.length > 0
          ? Math.min(3, Math.max(1, requestedStrategies.length))
        : Math.floor(Math.random() * 3) + 1;

    for (let index = 1; index <= this.currentBotCount; index += 1) {
      const botId = `bot-${index}`;
      const strategy =
        requestedStrategies.length > 0
          ? requestedStrategies[(index - 1) % requestedStrategies.length]!
          : availableStrategies[Math.floor(Math.random() * availableStrategies.length)]!;
      this.botStrategies.set(botId, strategy);
      this.memoryByPlayerId.set(botId, emptyMemory());

      this.state = addPlayer(this.state, botId, `[${strategy}] Bot-${index}`);
      this.state = setPlayerReady(this.state, botId, true);
    }

    this.state = setPlayerReady(this.state, this.agentId, true);
    this.state = startRound(this.state);
    this.fastForwardToAgentTurn();
    this.advanceToPlayableAgentState();

    return this.getPayload();
  }

  public step(actionId: number): RLPayload & { reward: number; done: boolean; info: any } {
    const action = ACTION_TEMPLATES[actionId];
    const beforeAgent = this.state.players.find((player) => player.id === this.agentId);
    const beforeAgentActive = beforeAgent?.status === "active";
    const beforeAgentTokens = beforeAgent?.tokens ?? 0;
    const beforeOpponentsActive = this.state.players.filter((player) => player.id !== this.agentId && player.status === "active").length;
    const tokenTarget = getWinningTokenCount(this.state.mode, this.state.players.length);
    const beforeOpponentPressure = new Map(
      this.state.players
        .filter((player) => player.id !== this.agentId)
        .map((player) => [player.id, player.tokens / tokenTarget]),
    );

    if (!action) {
      return this.invalidActionResponse(actionId, "unknown_action");
    }

    const result =
      action.kind === "cardinal_peek"
        ? this.resolveCardinalPeek(action)
        : this.resolvePlay(action);

    if (!result.ok) {
      return this.invalidActionResponse(actionId, result.reason ?? "illegal_action");
    }

    this.fastForwardToAgentTurn();
    const roundEnded = this.state.phase === "round_over";
    const agentWonRound = this.state.roundWinnerIds.includes(this.agentId);
    const afterAgentBeforeAdvance = this.state.players.find((player) => player.id === this.agentId);
    const afterAgentActive = afterAgentBeforeAdvance?.status === "active";
    const afterAgentTokens = afterAgentBeforeAdvance?.tokens ?? 0;
    const afterOpponentsActive = this.state.players.filter((player) => player.id !== this.agentId && player.status === "active").length;
    const eliminatedOpponentPressure = this.state.players
      .filter((player) => player.id !== this.agentId && player.status !== "active")
      .reduce((total, player) => total + (beforeOpponentPressure.get(player.id) ?? 0), 0);
    this.advanceToPlayableAgentState();

    const done = this.state.phase === "match_over";
    let reward = 0.0;

    if (!done) {
      reward += Math.max(0, beforeOpponentsActive - afterOpponentsActive) * 0.15;
      reward += eliminatedOpponentPressure * 0.08;
      reward += Math.max(0, afterAgentTokens - beforeAgentTokens) * 0.35;
      if (roundEnded) reward += agentWonRound ? 0.75 : -0.3;
      if (beforeAgentActive && !afterAgentActive) reward -= 0.25;
    } else {
      reward += this.state.matchWinnerIds.includes(this.agentId) ? 5.0 : -5.0;
    }

    const payload = this.getPayload();
    return {
      ...payload,
      reward,
      done,
      info: {
        ...payload.info,
        action: describeAction(action),
        phase: this.state.phase,
      },
    };
  }

  private invalidActionResponse(actionId: number, reason: string) {
    const payload = this.getPayload();
    return {
      ...payload,
      reward: -1.0,
      done: true,
      info: {
        ...payload.info,
        error: reason,
        actionId,
      },
    };
  }

  private resolvePlay(action: Extract<RLActionTemplate, { kind: "play" }>) {
    const view = this.getAgentObservation();
    const candidates = listBotActionCandidates(view);
    const decision = this.resolveDecisionForTemplate(action, view, candidates);

    if (!decision) {
      return { ok: false, reason: "masked_illegal_play" };
    }

    const result = playCardAction(this.state, this.agentId, decision.instanceId, {
      targetPlayerId: decision.targetPlayerId,
      targetPlayerIds: decision.targetPlayerIds,
      guessedValue: decision.guessedValue,
    });

    if (result.state) this.state = result.state;
    this.recordPrivateEffects(result.privateEffects);
    return result;
  }

  private resolveCardinalPeek(action: Extract<RLActionTemplate, { kind: "cardinal_peek" }>) {
    const pending = this.state.round?.pendingCardinalPeek ?? null;
    if (!pending || pending.actorPlayerId !== this.agentId) {
      return { ok: false, reason: "cardinal_peek_not_pending" };
    }

    const targetPlayerId = this.resolveTargetSlot(action.targetSlot, this.getAgentObservation());
    if (!targetPlayerId || !pending.targetPlayerIds.includes(targetPlayerId)) {
      return { ok: false, reason: "invalid_cardinal_peek_target" };
    }

    const result = cardinalPeekAction(this.state, this.agentId, targetPlayerId);
    if (result.state) this.state = result.state;
    this.recordPrivateEffects(result.privateEffects);
    return result;
  }

  private fastForwardToAgentTurn(): void {
    while (this.state.phase === "in_round" && this.state.round) {
      const pending = this.state.round.pendingCardinalPeek;
      if (pending) {
        if (pending.actorPlayerId === this.agentId) return;

        const strategy = this.botStrategies.get(pending.actorPlayerId) ?? "random";
        const obs = this.getObservationForPlayer(pending.actorPlayerId);
        const targetPlayerId =
          strategy === "smart"
            ? chooseSmartCardinalPeekTarget(obs)
            : strategy === "hard"
              ? chooseHardCardinalPeekTarget(obs)
              : chooseRandomCardinalPeekTarget(obs);

        if (!targetPlayerId) return;

        const result = cardinalPeekAction(this.state, pending.actorPlayerId, targetPlayerId);
        if (!result.ok || !result.state) return;
        this.state = result.state;
        this.recordPrivateEffects(result.privateEffects);
        continue;
      }

      const currentPlayerId = this.state.round.currentPlayerId;
      if (!currentPlayerId || currentPlayerId === this.agentId) return;

      const obs = this.getObservationForPlayer(currentPlayerId);
      const strategy = this.botStrategies.get(currentPlayerId) ?? "random";
      const decision =
        strategy === "smart"
          ? chooseSmartBotPlay(obs)
          : strategy === "hard"
            ? chooseHardBotPlay(obs)
            : chooseRandomBotPlay(obs);

      if (!decision) return;

      const result = playCardAction(this.state, currentPlayerId, decision.instanceId, {
        targetPlayerId: decision.targetPlayerId,
        targetPlayerIds: decision.targetPlayerIds,
        guessedValue: decision.guessedValue,
      });
      if (!result.ok || !result.state) return;
      this.state = result.state;
      this.recordPrivateEffects(result.privateEffects);
    }
  }

  private advanceToPlayableAgentState(): void {
    while (this.state.phase === "round_over") {
      for (const player of this.state.players) {
        this.state = setPlayerReady(this.state, player.id, true);
      }
      this.state = startRound(this.state);
      this.fastForwardToAgentTurn();
    }
  }

  private getPayload(): RLPayload {
    const actionMask = this.getActionMask();
    const bots = this.state.players
      .filter((player) => player.id !== this.agentId)
      .map((player) => ({
        id: player.id,
        name: player.name,
        strategy: this.botStrategies.get(player.id) ?? "random",
      }));

    return {
      obs: this.getObservationVector(),
      actionMask,
      legalActions: ACTION_TEMPLATES.map((template, index) => (actionMask[index] ? describeAction(template) : "")),
      info: {
        mode: this.state.mode,
        botCount: bots.length,
        playerCount: this.state.players.length,
        bots,
        botStrategies: bots.map((bot) => bot.strategy),
      },
    };
  }

  private getActionMask(): boolean[] {
    const view = this.getAgentObservation();
    const pending = this.state.round?.pendingCardinalPeek ?? null;

    if (pending?.actorPlayerId === this.agentId) {
      return ACTION_TEMPLATES.map((template) => {
        if (template.kind !== "cardinal_peek") return false;
        const targetPlayerId = this.resolveTargetSlot(template.targetSlot, view);
        return Boolean(targetPlayerId && pending.targetPlayerIds.includes(targetPlayerId));
      });
    }

    if (this.state.phase !== "in_round" || this.state.round?.currentPlayerId !== this.agentId) {
      return ACTION_TEMPLATES.map(() => false);
    }

    const candidates = listBotActionCandidates(view);
    return ACTION_TEMPLATES.map((template) => {
      if (template.kind !== "play") return false;
      return Boolean(this.resolveDecisionForTemplate(template, view, candidates));
    });
  }

  private resolveDecisionForTemplate(action: Extract<RLActionTemplate, { kind: "play" }>, view: ReturnType<typeof toBotObservation>, candidates: BotPlayDecision[]): BotPlayDecision | null {
    const self = view.players.find((player) => player.id === this.agentId);
    const card = self?.hand.find((candidate) => candidate.cardId === action.cardId);
    if (!card) return null;

    const targetPlayerIds = action.targetSlots?.map((slot) => this.resolveTargetSlot(slot, view)) ?? [];
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

  private resolveTargetSlot(slot: TargetSlot, view: ReturnType<typeof toBotObservation>): PlayerID | null {
    if (slot === "self") return this.agentId;

    const index = Number(slot.replace("opp", ""));
    const opponents = view.players.filter((player) => player.id !== this.agentId);
    return opponents[index]?.id ?? null;
  }

  private getAgentObservation() {
    return this.getObservationForPlayer(this.agentId);
  }

  private getObservationForPlayer(playerId: PlayerID) {
    return toBotObservation(this.state, playerId, this.memoryByPlayerId.get(playerId) ?? emptyMemory());
  }

  private recordPrivateEffects(effects: PrivateEffectPresentation[] = []): void {
    for (const effect of effects) {
      const current = this.memoryByPlayerId.get(effect.viewerPlayerId) ?? emptyMemory();
      this.memoryByPlayerId.set(effect.viewerPlayerId, {
        observedPrivateEffects: [...current.observedPrivateEffects, effect],
        observedCardFacts: [...current.observedCardFacts, ...extractObservedCardFacts(effect)],
      });
    }
  }

  private getLiveKnownHandFact(memory: BotMemorySnapshot, playerId: PlayerID): BotObservedCardFact | null {
    const newestHandFact = memory.observedCardFacts
      .filter((fact) => fact.playerId === playerId && fact.location === "hand" && fact.card)
      .sort((left, right) => right.turnNumber - left.turnNumber)[0];
    if (!newestHandFact?.card) return null;

    const discardedLater = memory.observedCardFacts.some((fact) => {
      if (fact.playerId !== playerId || fact.location !== "discard" || !fact.card) return false;
      if (fact.turnNumber <= newestHandFact.turnNumber) return false;
      return fact.card.instanceId === newestHandFact.card?.instanceId || fact.card.cardId === newestHandFact.card?.cardId;
    });

    return discardedLater ? null : newestHandFact;
  }

  private getTurnDistance(view: ReturnType<typeof toBotObservation>, targetPlayerId: PlayerID): number {
    const currentPlayerId = view.round?.currentPlayerId ?? null;
    if (!currentPlayerId) return 0;

    const players = view.players;
    const currentIndex = players.findIndex((player) => player.id === currentPlayerId);
    if (currentIndex < 0) return 0;

    for (let offset = 0; offset < players.length; offset += 1) {
      const candidate = players[(currentIndex + offset) % players.length];
      if (candidate?.id === targetPlayerId) return offset / Math.max(1, players.length - 1);
    }

    return 0;
  }

  private pushVisibleBeliefState(vector: number[], view: ReturnType<typeof toBotObservation>): void {
    const visibleCards: CardInstance[] = [];
    const seenInstanceIds = new Set<string>();
    const pushVisibleCards = (cards: CardInstance[] = []) => {
      for (const card of cards) {
        if (seenInstanceIds.has(card.instanceId)) continue;
        seenInstanceIds.add(card.instanceId);
        visibleCards.push(card);
      }
    };

    const self = view.players.find((player) => player.id === this.agentId);
    pushVisibleCards(self?.hand ?? []);
    for (const player of view.players) {
      pushVisibleCards(player.discardPile);
    }
    pushVisibleCards(view.round?.visibleRemovedCards ?? []);

    for (const opponent of view.players.filter((player) => player.id !== this.agentId)) {
      const knownFact = this.getLiveKnownHandFact(view.memory, opponent.id);
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

  private getObservationVector(): number[] {
    if (this.state.phase !== "in_round" || !this.state.round) {
      return Array(OBSERVATION_SIZE).fill(0);
    }

    const obs = this.getAgentObservation();
    const vector: number[] = [];
    const self = obs.players.find((player) => player.id === this.agentId);
    const opponents = obs.players.filter((player) => player.id !== this.agentId);
    const forcedTargetPlayerId = obs.round?.forcedTargetPlayerId ?? null;
    const pendingCardinalTargets: PlayerID[] = [...(obs.round?.pendingCardinalPeek?.targetPlayerIds ?? [])];

    vector.push(obs.mode === "premium" ? 1.0 : 0.0);
    vector.push((obs.round?.deckCount ?? 0) / 24.0);
    vector.push(Math.min(1.0, (obs.round?.turnNumber ?? 0) / 32.0));
    vector.push(obs.players.filter((player) => player.status === "active").length / 4.0);
    vector.push(getWinningTokenCount(obs.mode, obs.players.length) / 7.0);

    for (const slot of TARGET_SLOTS) {
      vector.push(this.resolveTargetSlot(slot, obs) === forcedTargetPlayerId ? 1.0 : 0.0);
    }

    for (const slot of TARGET_SLOTS) {
      const playerId = this.resolveTargetSlot(slot, obs);
      vector.push(playerId && pendingCardinalTargets.includes(playerId) ? 1.0 : 0.0);
    }

    vector.push(self?.status === "active" ? 1.0 : 0.0);
    vector.push(self?.protectedUntilNextTurn ? 1.0 : 0.0);
    vector.push((self?.tokens ?? 0) / 7.0);
    vector.push((self?.handCount ?? 0) / 2.0);
    this.pushCardCounts(vector, self?.hand ?? [], obs.mode, 2);
    this.pushCardCounts(vector, self?.discardPile ?? [], obs.mode, 1);

    this.pushCardCounts(vector, obs.round?.visibleRemovedCards ?? [], obs.mode, 1);
    this.pushVisibleBeliefState(vector, obs);

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
      vector.push(this.getTurnDistance(obs, opponent.id));
      vector.push(Math.max(0, opponent.tokens - (self?.tokens ?? 0)) / 7.0);
      const knownHandFact = this.getLiveKnownHandFact(obs.memory, opponent.id);
      vector.push(knownHandFact ? Math.min(1.0, ((obs.round?.turnNumber ?? 0) - knownHandFact.turnNumber) / 32.0) : 0.0);
      this.pushCardCounts(vector, opponent.discardPile, obs.mode, 1);
      this.pushKnownHand(vector, obs.memory, opponent.id);
    }

    if (vector.length !== OBSERVATION_SIZE) {
      throw new Error(`RL observation size mismatch: expected ${OBSERVATION_SIZE}, got ${vector.length}`);
    }

    return vector;
  }

  private pushCardCounts(vector: number[], cards: CardInstance[], mode: LoveLetterMode, denominatorFallback: number): void {
    for (const cardId of CARD_TYPES) {
      const count = cards.filter((card) => card.cardId === cardId).length;
      const denominator = Math.max(denominatorFallback, getCardCopies(cardId, mode), 1);
      vector.push(count / denominator);
    }
  }

  private pushKnownHand(vector: number[], memory: BotMemorySnapshot, playerId: PlayerID): void {
    const knownCardId = this.getLiveKnownHandFact(memory, playerId)?.card?.cardId ?? null;

    for (const candidateCardId of CARD_TYPES) {
      vector.push(candidateCardId === knownCardId ? 1.0 : 0.0);
    }
  }
}
