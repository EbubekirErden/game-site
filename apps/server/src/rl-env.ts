import { createGame, addPlayer, setPlayerReady, startRound, playCardAction, toBotObservation } from "@game-site/shared/games/love-letter/engine";
import { chooseSmartBotPlay, chooseHardBotPlay } from "./smartBotBrain.js";
import { listBotActionCandidates, chooseRandomBotPlay } from "./botBrain.js";
import type { BotPlayDecision } from "./botBrain.js";
import type { GameState, BotObservation, CardID } from "@game-site/shared/games/love-letter/types";

const CARD_TYPES: CardID[] = [
  "assassin", "jester", "guard", "cardinal", "priest", "baron", "baroness",
  "handmaid", "sycophant", "prince", "count", "constable", "king",
  "countess", "dowager_queen", "princess", "bishop"
];

type BotStrategy = "random" | "smart" | "hard";

export class LoveLetterRLEnv {
  private state!: GameState;
  private agentId = "rl-agent";
  private roomId = "rl-room";
  private botStrategies = new Map<string, BotStrategy>();
  private currentBotCount = 3;

  public reset(): { obs: number[]; legalActions: BotPlayDecision[] } {
    this.state = createGame(this.roomId, this.agentId, "classic");
    this.state = addPlayer(this.state, this.agentId, "RL Agent");
    
    this.botStrategies.clear();
    
    // RASTGELE OYUNCU SAYISI (Toplam 2, 3 veya 4 kişi olacak şekilde 1 ila 3 bot ekle)
    this.currentBotCount = Math.floor(Math.random() * 3) + 1;
    const availableStrategies: BotStrategy[] = ["random", "smart", "hard"];

    for (let i = 1; i <= this.currentBotCount; i++) {
      const botId = `bot-${i}`;
      // RASTGELE RAKİP ZEKASI
      const strategy = availableStrategies[Math.floor(Math.random() * availableStrategies.length)];
      this.botStrategies.set(botId, strategy);

      this.state = addPlayer(this.state, botId, `[${strategy}] Bot-${i}`);
      this.state = setPlayerReady(this.state, botId, true);
    }

    this.state = setPlayerReady(this.state, this.agentId, true);
    this.state = startRound(this.state);
    
    this.fastForwardToAgentTurn();

    return {
      obs: this.getObservationVector(),
      legalActions: this.getLegalActions()
    };
  }

  public step(actionIndex: number): { obs: number[]; reward: number; done: boolean; info: any } {
    const legalActions = this.getLegalActions();
    const action = legalActions[actionIndex];

    if (!action) {
      // İllegal hamleye ceza
      return { obs: this.getObservationVector(), reward: -1.0, done: true, info: { error: "Illegal Action" } };
    }

    const result = playCardAction(this.state, this.agentId, action.instanceId, {
      targetPlayerId: action.targetPlayerId,
      guessedValue: action.guessedValue
    });

    if (result.state) {
      this.state = result.state;
    }

    this.fastForwardToAgentTurn();

    const done = this.state.phase === "round_over" || this.state.phase === "match_over";
    let reward = 0.0;

    if (done) {
      const isWinner = this.state.roundWinnerIds?.includes(this.agentId);
      if (isWinner) {
        // Masa ne kadar kalabalıksa kazanmak o kadar zordur, ödülü ona göre ver.
        reward = 1.0 + (this.currentBotCount * 0.5); 
      } else {
        reward = -1.0; 
      }
    }

    return {
      obs: this.getObservationVector(),
      reward,
      done,
      info: { legalActions: this.getLegalActions() }
    };
  }

  private fastForwardToAgentTurn() {
    while (this.state.phase === "in_round" && this.state.round?.currentPlayerId !== this.agentId) {
      const currentPlayerId = this.state.round!.currentPlayerId!;
      const obs = toBotObservation(this.state, currentPlayerId);
      const strategy = this.botStrategies.get(currentPlayerId) || "random";
      
      let decision;
      if (strategy === "smart") decision = chooseSmartBotPlay(obs);
      else if (strategy === "hard") decision = chooseHardBotPlay(obs);
      else decision = chooseRandomBotPlay(obs);
      
      if (decision) {
        const result = playCardAction(this.state, currentPlayerId, decision.instanceId, {
          targetPlayerId: decision.targetPlayerId,
          guessedValue: decision.guessedValue
        });
        if (result.state) this.state = result.state;
      } else {
        break; 
      }
    }
  }

  private getLegalActions(): BotPlayDecision[] {
    if (this.state.phase !== "in_round" || this.state.round?.currentPlayerId !== this.agentId) return [];
    return listBotActionCandidates(toBotObservation(this.state, this.agentId));
  }

  private getObservationVector(): number[] {
    if (this.state.phase !== "in_round" || !this.state.round) {
      return Array(76).fill(0);
    }
    
    const obs = toBotObservation(this.state, this.agentId);
    const vector: number[] = [];

    vector.push(obs.round.deckCount / 16.0);

    const self = obs.players.find(p => p.id === this.agentId);
    vector.push(self?.protectedUntilNextTurn ? 1.0 : 0.0);

    const myHand = Array(17).fill(0);
    if (self) {
      for (const card of self.hand) {
        const idx = CARD_TYPES.indexOf(card.cardId);
        if (idx !== -1) myHand[idx] += 1;
      }
    }
    vector.push(...myHand);

    const opponents = obs.players.filter(p => p.id !== this.agentId);
    for (let i = 0; i < 3; i++) {
      const opp = opponents[i];
      if (opp) {
        vector.push(opp.status === "active" ? 1.0 : 0.0);
        vector.push(opp.protectedUntilNextTurn ? 1.0 : 0.0);

        const oppDiscard = Array(17).fill(0);
        for (const card of opp.discardPile) {
          const idx = CARD_TYPES.indexOf(card.cardId);
          if (idx !== -1) oppDiscard[idx] += 1;
        }
        vector.push(...oppDiscard);
      } else {
        vector.push(0.0); 
        vector.push(0.0); 
        vector.push(...Array(17).fill(0)); 
      }
    }

    while (vector.length < 76) vector.push(0); 
    return vector;
  }
}