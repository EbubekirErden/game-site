import React from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import type { GameEvent, PlayerID, PlayerViewState, CardID } from "@game-site/shared";

import { playerNameById } from "../lib/gamePresentation.js";
import { CardView } from "./CardView.js";

type HistoryTapeProps = {
  events: GameEvent[];
  state: PlayerViewState;
  emptyText?: string;
};

export function shouldShowActivityEvent(event: GameEvent): boolean {
  return event.type !== "card_drawn";
}

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
  if (playerIndex >= 0) return PLAYER_SWATCHES[playerIndex % PLAYER_SWATCHES.length]!;

  const spectatorIndex = state.spectators.findIndex((spectator) => spectator.id === playerId);
  if (spectatorIndex >= 0) return PLAYER_SWATCHES[(state.players.length + spectatorIndex) % PLAYER_SWATCHES.length]!;

  const hashed = [...playerId].reduce((total, char) => total + char.charCodeAt(0), 0);
  return PLAYER_SWATCHES[hashed % PLAYER_SWATCHES.length]!;
}

function PlayerChip({ playerId, state, isTarget = false }: { playerId: PlayerID; state: PlayerViewState, isTarget?: boolean }) {
  const swatch = getPlayerSwatch(state, playerId);
  const label = playerId === state.selfPlayerId ? "You" : playerNameById(state, playerId);

  return (
    <span
      className={`history-player-chip ${isTarget ? "is-target" : ""}`}
      style={
        {
          "--chip-bg": swatch.background,
          "--chip-border": swatch.border,
          "--chip-text": swatch.text,
        } as React.CSSProperties
      }
    >
      {label}
    </span>
  );
}

function renderEventContent(event: GameEvent, state: PlayerViewState): {
  icon: React.ReactNode;
  content: React.ReactNode;
  tone: "info" | "danger" | "success" | "neutral" | "gold" | "protected";
  miniCard?: CardID;
} {
  switch (event.type) {
    case "player_joined":
      return {
        tone: "info",
        icon: <UserPlus size={16} strokeWidth={2.2} />,
        content: <><PlayerChip playerId={event.playerId} state={state} /> joined.</>,
      };
    case "player_left":
      return {
        tone: "danger",
        icon: <UserMinus size={16} strokeWidth={2.2} />,
        content: <><PlayerChip playerId={event.playerId} state={state} /> left.</>,
      };
    case "spectator_joined":
      return {
        tone: "info",
        icon: <Eye size={16} strokeWidth={2.2} />,
        content: <><PlayerChip playerId={event.spectatorId} state={state} /> watching.</>,
      };
    case "spectator_left":
      return {
        tone: "neutral",
        icon: <UserMinus size={16} strokeWidth={2.2} />,
        content: <><PlayerChip playerId={event.spectatorId} state={state} /> left.</>,
      };
    case "player_ready_changed":
      return {
        tone: event.isReady ? "success" : "neutral",
        icon: <Sparkles size={16} strokeWidth={2.2} />,
        content: <><PlayerChip playerId={event.playerId} state={state} /> {event.isReady ? "is ready." : "is waiting."}</>,
      };
    case "round_started":
      return {
        tone: "success",
        icon: <Sparkles size={16} strokeWidth={2.2} />,
        content: "Round started! Hands dealt.",
      };
    case "card_drawn":
      return {
        tone: "info",
        icon: <Eye size={16} strokeWidth={2.2} />,
        content: <><PlayerChip playerId={event.playerId} state={state} /> drew.</>,
      };
    case "card_played":
      return {
        tone: "neutral",
        icon: <ArrowRightLeft size={16} strokeWidth={2.2} />,
        content: <><PlayerChip playerId={event.playerId} state={state} /> played</>,
        miniCard: event.cardId,
      };
    case "card_guessed":
      return {
        tone: "danger",
        icon: <Swords size={16} strokeWidth={2.2} />,
        content: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> guessed <strong>{event.guessedValue}</strong> on <PlayerChip playerId={event.targetPlayerId} state={state} isTarget />
          </>
        ),
      };
    case "card_compared":
      return {
        tone: "info",
        icon: <Swords size={16} strokeWidth={2.2} />,
        content: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> compared with <PlayerChip playerId={event.targetPlayerId} state={state} isTarget />
          </>
        ),
      };
    case "card_swapped":
      return {
        tone: "info",
        icon: <ArrowRightLeft size={16} strokeWidth={2.2} />,
        content: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> swapped with <PlayerChip playerId={event.targetPlayerId} state={state} isTarget />
          </>
        ),
      };
    case "card_seen":
      return {
        tone: "info",
        icon: <Eye size={16} strokeWidth={2.2} />,
        content: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> looked at <PlayerChip playerId={event.targetPlayerId} state={state} isTarget />
          </>
        ),
      };
    case "player_protected":
      return {
        tone: "protected",
        icon: <Shield size={16} strokeWidth={2.2} />,
        content: <><PlayerChip playerId={event.playerId} state={state} /> protected!</>,
      };
    case "player_eliminated":
      return {
        tone: "danger",
        icon: <UserMinus size={16} strokeWidth={2.2} />,
        content: <><PlayerChip playerId={event.playerId} state={state} /> eliminated!</>,
      };
    case "round_ended":
      return {
        tone: "success",
        icon: <Trophy size={16} strokeWidth={2.2} />,
        content: (
          <>
            Round won by:{" "}
            {event.winnerIds.map((winnerId) => (
              <PlayerChip key={winnerId} playerId={winnerId} state={state} />
            ))}
          </>
        ),
      };
    case "token_awarded":
      return {
        tone: "gold",
        icon: <Heart size={16} strokeWidth={2.2} />,
        content: (
          <>
            <PlayerChip playerId={event.playerId} state={state} /> gained <strong>{event.tokens}</strong> token{event.tokens === 1 ? "" : "s"}.
          </>
        ),
      };
    case "match_ended":
      return {
        tone: "success",
        icon: <Trophy size={16} strokeWidth={2.2} />,
        content: (
          <>
            Match won by:{" "}
            {event.winnerIds.map((winnerId) => (
              <PlayerChip key={winnerId} playerId={winnerId} state={state} />
            ))}
          </>
        ),
      };
    default:
      return {
        tone: "neutral",
        icon: <Hourglass size={16} strokeWidth={2.2} />,
        content: <span>Unknown event</span>,
      };
  }
}

export function HistoryEventRow({ event, state, className = "" }: { event: GameEvent; state: PlayerViewState; className?: string }) {
  const { tone, icon, content, miniCard } = renderEventContent(event, state);
  return (
    <article className={`history-block is-${tone} ${className}`.trim()}>
      <div className="history-icon-wrapper">{icon}</div>
      <div className="history-content-wrapper">
        <div className="history-text">{content}</div>
        {miniCard && (
          <div className="history-minicard">
            <CardView card={{ instanceId: "tape", cardId: miniCard }} mini selectable={false} />
          </div>
        )}
      </div>
    </article>
  );
}

export function HistoryTape({ events, state, emptyText = "No actions yet." }: HistoryTapeProps) {
  const recentEvents = events.filter(shouldShowActivityEvent).slice(-20).reverse();

  return (
    <div className="history-tape">
      <div className="history-tape-header">
        <h3>Action Tape</h3>
      </div>
      <div className="history-tape-scroll">
        <AnimatePresence initial={false}>
          {recentEvents.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="empty-label"
            >
              {emptyText}
            </motion.div>
          )}
          {recentEvents.map((event, index) => {
            const { tone, icon, content, miniCard } = renderEventContent(event, state);
            return (
              <motion.article
                key={`${event.type}-${index}`}
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -20, scale: 0.9 }}
                transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 25 }}
                className={`history-block is-${tone}`}
              >
                <div className="history-icon-wrapper">{icon}</div>
                <div className="history-content-wrapper">
                  <div className="history-text">{content}</div>
                  {miniCard && (
                    <div className="history-minicard">
                      <CardView
                        card={{ instanceId: "tape", cardId: miniCard }}
                        mini
                        selectable={false}
                      />
                    </div>
                  )}
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
