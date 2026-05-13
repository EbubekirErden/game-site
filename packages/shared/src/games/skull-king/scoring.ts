import type { SkullKingBonusEvent, SkullKingPlayerState } from "./types.js";

export function scoreBid(roundNumber: number, bid: number, tricksWon: number): number {
  if (bid === 0) {
    return tricksWon === 0 ? roundNumber * 10 : roundNumber * -10;
  }

  if (bid === tricksWon) {
    return bid * 20;
  }

  return Math.abs(bid - tricksWon) * -10;
}

export function applyRoundScores(
  players: SkullKingPlayerState[],
  roundNumber: number,
  bonusEvents: SkullKingBonusEvent[],
): SkullKingPlayerState[] {
  const exactBidByPlayerId = new Map(players.map((player) => [player.id, (player.bid ?? 0) === player.tricksWon]));

  return players.map((player) => {
    const bid = player.bid ?? 0;
    const baseScore = scoreBid(roundNumber, bid, player.tricksWon);
    const bonusScore = bonusEvents
      .filter((event) => {
        if (event.playerId !== player.id) return false;
        const requiredExactPlayerIds = event.requiredExactPlayerIds ?? [player.id];
        return requiredExactPlayerIds.every((playerId) => exactBidByPlayerId.get(playerId));
      })
      .reduce((total, event) => total + event.points, 0);

    return {
      ...player,
      roundScore: baseScore,
      bonusScore,
      totalScore: player.totalScore + baseScore + bonusScore,
    };
  });
}
