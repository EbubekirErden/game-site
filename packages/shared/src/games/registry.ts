import type { GameDefinition, GameID } from "../commonTypes.js";

export const GAME_DEFINITIONS: Record<GameID, GameDefinition> = {
  "love-letter": {
    id: "love-letter",
    title: "Love Letter",
    description: "Classic deduction card game",
    minPlayers: 2,
    maxPlayers: 8,
  },
  "skull-king": {
    id: "skull-king",
    title: "Skull King",
    description: "Bid, trick, and outscore the table across ten rounds",
    minPlayers: 2,
    maxPlayers: 6,
  },
};

export function isGameId(value: unknown): value is GameID {
  return typeof value === "string" && value in GAME_DEFINITIONS;
}

export function getGameDefinition(gameId: GameID): GameDefinition {
  return GAME_DEFINITIONS[gameId];
}
