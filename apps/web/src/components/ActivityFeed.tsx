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

  return (
    <div className="activity-feed">
      {recentEvents.length === 0 ? <span className="empty-label">{emptyText}</span> : null}
      {recentEvents.map((event, index) => (
        <div key={`${event.type}-${index}`} className={`log-item ${event.type === "player_eliminated" ? "is-danger" : ""}`}>
          {event.type === "player_eliminated" ? (
            <span className="log-badge is-danger">
              {event.sourceCardId ? getCardDef(event.sourceCardId).name : "Out"}
            </span>
          ) : null}
          {formatEvent(event, state)}
        </div>
      ))}
    </div>
  );
}
