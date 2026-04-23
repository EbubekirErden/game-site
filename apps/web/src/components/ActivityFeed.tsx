import React from "react";
import {
  ArrowRightLeft,
  Eye,
  Heart,
  Hourglass,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  UserMinus,
  UserPlus,
} from "lucide-react";

import { getCardDef } from "@game-site/shared";
import type { GameEvent, PlayerID, PlayerViewState } from "@game-site/shared";

import { formatEvent, playerNameById } from "../lib/gamePresentation.js";

type ActivityFeedProps = {
  events: GameEvent[];
  state: PlayerViewState;
  emptyText?: string;
};

const PLAYER_SWATCHES = [
  { background: "rgba(88, 166, 255, 0.16)", border: "rgba(88, 166, 255, 0.4)", text: "#8dc6ff" },
  { background: "rgba(255, 179, 71, 0.16)", border: "rgba(255, 179, 71, 0.4)", text: "#ffd08d" },
  { background: "rgba(78, 205, 196, 0.16)", border: "rgba(78, 205, 196, 0.4)", text: "#8ef0e8" },
  { background: "rgba(255, 122, 122, 0.16)", border: "rgba(255, 122, 122, 0.4)", text: "#ffb0b0" },
  { background: "rgba(177, 156, 217, 0.16)", border: "rgba(177, 156, 217, 0.4)", text: "#d7c2ff" },
  { background: "rgba(119, 221, 119, 0.16)", border: "rgba(119, 221, 119, 0.4)", text: "#bdf5bd" },
];

function getPlayerSwatch(state: PlayerViewState, playerId: PlayerID) {
  const playerIndex = state.players.findIndex((player) => player.id === playerId);
  if (playerIndex >= 0) return PLAYER_SWATCHES[playerIndex % PLAYER_SWATCHES.length];

  const spectatorIndex = state.spectators.findIndex((spectator) => spectator.id === playerId);
  if (spectatorIndex >= 0) return PLAYER_SWATCHES[(state.players.length + spectatorIndex) % PLAYER_SWATCHES.length];

  const hashed = [...playerId].reduce((total, char) => total + char.charCodeAt(0), 0);
  return PLAYER_SWATCHES[hashed % PLAYER_SWATCHES.length];
}

function PlayerChip({ playerId, state }: { playerId: PlayerID; state: PlayerViewState }) {
  const swatch = getPlayerSwatch(state, playerId);
  const label = playerId === state.selfPlayerId ? "You" : playerNameById(state, playerId);

  return (
    <span
      className="feed-player-chip"
      style={
        {
          "--player-chip-background": swatch.background,
          "--player-chip-border": swatch.border,
          "--player-chip-text": swatch.text,
        } as React.CSSProperties
      }
    >
      {label}
    </span>
  );
}

function describeEvent(event: GameEvent, state: PlayerViewState): {
  itemClass: string;
  icon: React.ReactNode;
  detail: React.ReactNode;
} {
  switch (event.type) {
    case "player_joined":
      return {
        itemClass: "is-info",
        icon: <UserPlus size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> sat down at the table and can now ready up.
          </>
        ),
      };
    case "player_left":
      return {
        itemClass: "is-danger",
        icon: <UserMinus size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> left the room.
          </>
        ),
      };
    case "spectator_joined":
      return {
        itemClass: "is-info",
        icon: <Eye size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.spectatorId} state={state} /> joined as a spectator and can enter the next lobby.
          </>
        ),
      };
    case "spectator_left":
      return {
        itemClass: "",
        icon: <UserMinus size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.spectatorId} state={state} /> stopped watching the room.
          </>
        ),
      };
    case "player_ready_changed":
      return {
        itemClass: event.isReady ? "is-success" : "",
        icon: <Sparkles size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> is now {event.isReady ? "ready for the next round" : "waiting to ready up"}.
          </>
        ),
      };
    case "round_started":
      return {
        itemClass: "is-success",
        icon: <Sparkles size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: "A fresh round is underway. Everyone has drawn in, and the active player is deciding what to play.",
      };
    case "card_drawn":
      return {
        itemClass: "is-info",
        icon: <Eye size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> drew from the deck and now has two cards to choose from.
          </>
        ),
      };
    case "card_played":
      return {
        itemClass: "",
        icon: <ArrowRightLeft size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> discarded <strong>{getCardDef(event.cardId).name}</strong> and resolved its public effect.
          </>
        ),
      };
    case "card_guessed":
      return {
        itemClass: "is-danger",
        icon: <Swords size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> named <strong>{event.guessedValue}</strong> against <PlayerChip playerId={event.targetPlayerId} state={state} />.
          </>
        ),
      };
    case "card_compared":
      return {
        itemClass: "is-info",
        icon: <Swords size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> and <PlayerChip playerId={event.targetPlayerId} state={state} /> secretly compared hands. Only those two players saw the cards.
          </>
        ),
      };
    case "card_swapped":
      return {
        itemClass: "is-info",
        icon: <ArrowRightLeft size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> traded hands with <PlayerChip playerId={event.targetPlayerId} state={state} />. The new hands remain hidden from everyone else.
          </>
        ),
      };
    case "card_seen":
      return {
        itemClass: "is-info",
        icon: <Eye size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> privately inspected <PlayerChip playerId={event.targetPlayerId} state={state} />&apos;s hand.
          </>
        ),
      };
    case "player_protected":
      return {
        itemClass: "is-protected",
        icon: <Shield size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> cannot be targeted by other players until their next turn begins.
          </>
        ),
      };
    case "player_eliminated":
      return {
        itemClass: "is-danger",
        icon: <UserMinus size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> is out of the round{event.reason ? ` because ${event.reason}.` : "."}
          </>
        ),
      };
    case "round_ended":
      return {
        itemClass: "is-success",
        icon: <Trophy size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            Remaining hands were revealed. Winner{event.winnerIds.length === 1 ? "" : "s"}:{" "}
            {event.winnerIds.map((winnerId) => (
              <React.Fragment key={winnerId}>
                <PlayerChip playerId={winnerId} state={state} />
                {" "}
              </React.Fragment>
            ))}
          </>
        ),
      };
    case "token_awarded":
      return {
        itemClass: "is-gold",
        icon: <Heart size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> now has <strong>{event.tokens}</strong> token{event.tokens === 1 ? "" : "s"} of affection.
          </>
        ),
      };
    case "match_ended":
      return {
        itemClass: "is-success",
        icon: <Trophy size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: (
          <>
            Final winner{event.winnerIds.length === 1 ? "" : "s"}:{" "}
            {event.winnerIds.map((winnerId) => (
              <React.Fragment key={winnerId}>
                <PlayerChip playerId={winnerId} state={state} />
                {" "}
              </React.Fragment>
            ))}
          </>
        ),
      };
    default:
      return {
        itemClass: "",
        icon: <Hourglass size={16} strokeWidth={2.2} aria-hidden="true" />,
        detail: formatEvent(event as GameEvent, state),
      };
  }
}

type ActivityEventRowProps = {
  event: GameEvent;
  state: PlayerViewState;
  className?: string;
};

export function ActivityEventRow({ event, state, className = "" }: ActivityEventRowProps) {
  const meta = describeEvent(event, state);

  return (
    <article className={`log-item ${meta.itemClass} ${className}`.trim()}>
      <div className="log-icon">{meta.icon}</div>
      <div className="log-copy">
        <p className="log-detail">{meta.detail}</p>
      </div>
    </article>
  );
}

export function ActivityFeed({ events, state, emptyText = "No actions yet." }: ActivityFeedProps) {
  const recentEvents = events.slice(-14).reverse();

  return (
    <div className="activity-feed">
      {recentEvents.length === 0 ? <span className="empty-label">{emptyText}</span> : null}
      {recentEvents.map((event, index) => (
        <ActivityEventRow key={`${event.type}-${index}`} event={event} state={state} />
      ))}
    </div>
  );
}
