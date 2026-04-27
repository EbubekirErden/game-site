export type GameID = "love-letter" | "skull-king";

export interface GameDefinition {
  id: GameID;
  title: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
}
