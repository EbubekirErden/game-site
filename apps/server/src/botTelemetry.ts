import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { BotObservation, PlayerID } from "@game-site/shared";
import type { BotDecisionSummary, RandomBotAnalysis } from "./botBrain.js";
import type { HeuristicBotAnalysis } from "./smartBotBrain.js";

type BotTurnLogEntry = {
  ts: string;
  roomId: string;
  playerId: PlayerID;
  playerName: string;
  strategy: "random" | "smart" | "hard";
  mode: BotObservation["mode"];
  phase: BotObservation["phase"];
  turnNumber: number | null;
  kind: "play_card" | "cardinal_peek";
  legalCandidateCount?: number;
  chosenAction?: BotDecisionSummary | null;
  topCandidates?: Array<{
    actionKey: string;
    summary: string;
    categories: string[];
    score: number;
    reasoning: string[];
  }>;
  reasoning?: string[];
  targetPlayerId?: string | null;
  outcome: "selected" | "no_action";
};

const BOT_LOG_DIR = path.join(process.cwd(), "bot-logs");
const BOT_LOG_PATH = path.join(BOT_LOG_DIR, "love-letter-bot-decisions.jsonl");

async function appendLog(entry: BotTurnLogEntry): Promise<void> {
  await mkdir(BOT_LOG_DIR, { recursive: true });
  await appendFile(BOT_LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

function getBotName(view: BotObservation, playerId: PlayerID): string {
  return view.players.find((player) => player.id === playerId)?.name ?? playerId;
}

export function logRandomBotDecision(roomId: string, view: BotObservation, analysis: RandomBotAnalysis): void {
  void appendLog({
    ts: new Date().toISOString(),
    roomId,
    playerId: view.selfPlayerId,
    playerName: getBotName(view, view.selfPlayerId),
    strategy: "random",
    mode: view.mode,
    phase: view.phase,
    turnNumber: view.round?.turnNumber ?? null,
    kind: "play_card",
    legalCandidateCount: analysis.legalCandidateCount,
    chosenAction: analysis.summary,
    reasoning: [analysis.note],
    outcome: analysis.decision ? "selected" : "no_action",
  }).catch((error) => {
    console.error("Failed to write random bot telemetry:", error);
  });
}

export function logHeuristicBotDecision(roomId: string, view: BotObservation, analysis: HeuristicBotAnalysis): void {
  void appendLog({
    ts: new Date().toISOString(),
    roomId,
    playerId: view.selfPlayerId,
    playerName: getBotName(view, view.selfPlayerId),
    strategy: analysis.strategy,
    mode: view.mode,
    phase: view.phase,
    turnNumber: view.round?.turnNumber ?? null,
    kind: "play_card",
    legalCandidateCount: analysis.legalCandidateCount,
    chosenAction: analysis.summary,
    topCandidates: analysis.topCandidates.map((candidate) => ({
      actionKey: candidate.summary.actionKey,
      summary: candidate.summary.summary,
      categories: candidate.summary.categories,
      score: Number(candidate.score.toFixed(4)),
      reasoning: candidate.reasoning,
    })),
    reasoning: analysis.topCandidates[0]?.reasoning ?? [],
    outcome: analysis.decision ? "selected" : "no_action",
  }).catch((error) => {
    console.error("Failed to write heuristic bot telemetry:", error);
  });
}

export function logBotCardinalPeek(
  roomId: string,
  view: BotObservation,
  strategy: "random" | "smart" | "hard",
  targetPlayerId: string | null,
  reasoning: string[],
): void {
  void appendLog({
    ts: new Date().toISOString(),
    roomId,
    playerId: view.selfPlayerId,
    playerName: getBotName(view, view.selfPlayerId),
    strategy,
    mode: view.mode,
    phase: view.phase,
    turnNumber: view.round?.turnNumber ?? null,
    kind: "cardinal_peek",
    targetPlayerId,
    reasoning,
    outcome: targetPlayerId ? "selected" : "no_action",
  }).catch((error) => {
    console.error("Failed to write cardinal peek telemetry:", error);
  });
}
