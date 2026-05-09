import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Shield, TriangleAlert } from "lucide-react";
import type { PlayerViewState } from "@game-site/shared";
import { CardView } from "./CardView.js";

type PlayerData = PlayerViewState["players"][number];

type PlayerSeatProps = {
  player: PlayerData;
  state: PlayerViewState;
  isCurrentTurn: boolean;
  isTargetable: boolean;
  isProtected: boolean;
  isMarkedBySycophant?: boolean;
  isSelectedTarget: boolean;
  isEliminated: boolean;
  isSelf?: boolean;
  showReadyPill?: boolean;
  onTarget?: () => void;
  onCardClick?: (cardId: string) => void;
};

export function PlayerSeat({
  player,
  state,
  isCurrentTurn,
  isTargetable,
  isProtected,
  isMarkedBySycophant = false,
  isSelectedTarget,
  isEliminated,
  isSelf = false,
  showReadyPill = false,
  onTarget,
  onCardClick,
}: PlayerSeatProps) {
  const classes = [
    "player-seat",
    isCurrentTurn ? "is-current-turn" : "",
    isTargetable ? "is-targetable" : "",
    isProtected ? "is-protected" : "",
    isMarkedBySycophant ? "is-marked-by-sycophant" : "",
    isSelectedTarget ? "is-selected-target" : "",
    isEliminated ? "is-eliminated" : "",
    isSelf ? "is-self-seat" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = () => {
    if (isTargetable && onTarget) {
      onTarget();
    }
  };

  return (
    <motion.div
      className={classes}
      onClick={handleClick}
      style={{ cursor: isTargetable ? "pointer" : "default" }}
      animate={
        isTargetable && !isSelectedTarget
          ? {
              boxShadow: [
                "0 0 0 0px rgba(200, 155, 60, 0)",
                "0 0 0 3px rgba(200, 155, 60, 0.6)",
                "0 0 0 0px rgba(200, 155, 60, 0)",
              ],
            }
          : { boxShadow: "0 0 0 0px rgba(200, 155, 60, 0)" }
      }
      transition={
        isTargetable && !isSelectedTarget
          ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.3 }
      }
    >
      {/* Turn indicator stripe */}
      {isCurrentTurn && <div className="seat-turn-stripe" />}
      {(isProtected || isMarkedBySycophant) && (
        <div className="seat-status-lights" aria-hidden="true">
          {isProtected ? <span className="seat-status-glow is-protected" /> : null}
          {isMarkedBySycophant ? <span className="seat-status-glow is-threatened" /> : null}
        </div>
      )}

      {/* Nameplate */}
      <div className="seat-nameplate">
        <span className="seat-player-name">
          {player.name}
          {isSelf && <span className="seat-self-tag"> (You)</span>}
        </span>
        <div className="seat-stats">
          <span className="seat-token-count">
            <Coins size={13} strokeWidth={2.1} aria-hidden="true" />
            {player.tokens}
          </span>
          {isProtected && (
            <span className="seat-protected-badge">
              <Shield size={12} strokeWidth={2.2} aria-hidden="true" />
            </span>
          )}
          {isMarkedBySycophant && (
            <span className="seat-sycophant-badge" title="Sycophant target">
              <TriangleAlert size={12} strokeWidth={2.2} aria-hidden="true" />
            </span>
          )}
        </div>
      </div>

      {/* Hand zone — hidden card slot for opponents, actual cards for self */}
      <div className="seat-zone-block seat-hand-block">
        <span className="seat-zone-label">{isSelf ? "Hand" : "Hidden Hand"}</span>
        <div className="seat-zone-panel seat-hand-panel">
          <div className="seat-hand-zone">
          {isSelf ? (
            // Self: show actual cards if any
            player.hand && player.hand.length > 0 ? (
              player.hand.map((card) => (
                <div key={card.instanceId} className="seat-hand-card-slot">
                  <CardView
                    card={card}
                    mini
                    selectable={Boolean(onCardClick)}
                    onClick={onCardClick ? () => onCardClick(card.instanceId) : undefined}
                  />
                </div>
              ))
            ) : (
              <div className="seat-empty-hand" />
            )
          ) : (
            // Opponent: keep one stable hidden cardback visible in the seat.
            <div className="seat-hidden-card">
              <div className="card-view-back-pattern" />
              <div className="seat-hidden-crest">⚜️</div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Discard mini-stack */}
      <div className="seat-zone-block seat-discard-block">
        <span className="seat-zone-label">Discard</span>
        <div className="seat-zone-panel seat-discard-panel">
          <div className="seat-discard-zone">
            <AnimatePresence initial={false}>
              {(player.discardPile ?? []).slice(-3).map((card, index) => (
                <motion.div
                  key={card.instanceId}
                  className="seat-discard-card"
                  style={{ zIndex: index }}
                  initial={{ opacity: 0, scale: 0.7, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  <CardView card={card} mini selectable={false} />
                </motion.div>
              ))}
            </AnimatePresence>
            {(player.discardPile ?? []).length === 0 && (
              <span className="seat-no-discard">No discards</span>
            )}
          </div>
        </div>
      </div>

      {/* Ready pill for lobby */}
      {showReadyPill && (
        <span
          className={`mini-ready-pill ${player.isReady ? "ready" : ""}`}
          title={player.isReady ? "Ready" : "Not ready"}
        />
      )}

      {/* Eliminated overlay */}
      {isEliminated && (
        <div className="seat-eliminated-overlay">
          <span className="seat-out-stamp">OUT</span>
        </div>
      )}

    </motion.div>
  );
}
