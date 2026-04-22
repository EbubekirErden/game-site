import { getCardDef } from "@game-site/shared";
import type { GameEvent, PlayerViewState } from "@game-site/shared";

import { formatEvent } from "../lib/gamePresentation.js";

type ActivityFeedProps = {
  events: GameEvent[];
  state: PlayerViewState;
  emptyText?: string;
};

export function ActivityFeed({ events, state, emptyText = "No actions yet." }: ActivityFeedProps) {
  const recentEvents = events.slice(-12).reverse();

  function getEventTone(event: GameEvent): { itemClass: string; badgeClass?: string; badgeText?: string } {
    switch (event.type) {
      case "player_eliminated":
        return {
          itemClass: "is-danger",
          badgeClass: "is-danger",
          badgeText: event.sourceCardId ? getCardDef(event.sourceCardId).name : "Out",
        };
      case "round_ended":
        return { itemClass: "is-success", badgeClass: "is-success", badgeText: "Winner" };
      case "match_ended":
        return { itemClass: "is-success", badgeClass: "is-success", badgeText: "Match" };
      case "token_awarded":
        return { itemClass: "is-gold", badgeClass: "is-gold", badgeText: "Token" };
      case "card_drawn":
        return { itemClass: "is-info", badgeClass: "is-info", badgeText: "Draw" };
      case "player_protected":
        return { itemClass: "is-protected", badgeClass: "is-protected", badgeText: "Safe" };
      default:
        return { itemClass: "" };
    }
  }

  return (
    <div className="activity-feed">
      {recentEvents.length === 0 ? <span className="empty-label">{emptyText}</span> : null}
      {recentEvents.map((event, index) => {
        const tone = getEventTone(event);

        return (
        <div key={`${event.type}-${index}`} className={`log-item ${tone.itemClass}`}>
          {tone.badgeText ? (
            <span className={`log-badge ${tone.badgeClass ?? ""}`}>
              {tone.badgeText}
            </span>
          ) : null}
          {formatEvent(event, state)}
        </div>
      )})}
    </div>
  );
}
