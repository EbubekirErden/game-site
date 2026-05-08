import React from "react";
import { Check, Copy, Info } from "lucide-react";
import type { PlayerViewState } from "@game-site/shared";

type RoomTopBarProps = {
  gameTitle: string;
  state: PlayerViewState;
  isMyTurn: boolean;
  currentTurnName: string | null;
  selfSpectator: boolean;
  copied: boolean;
  onCopyCode: () => void;
  onBecomeSpectator: () => void;
  onBecomePlayer: () => void;
  onLeaveRoom: () => void;
};

export function RoomTopBar({
  gameTitle,
  state,
  isMyTurn,
  currentTurnName,
  selfSpectator,
  copied,
  onCopyCode,
  onBecomeSpectator,
  onBecomePlayer,
  onLeaveRoom,
}: RoomTopBarProps) {
  const showLobby = state.phase === "lobby";

  return (
    <header className="table-topbar">
      <div className="topbar-info">
        <h1>{gameTitle}</h1>
        <span className="phase-badge">
          {showLobby ? "Waiting Room" : state.phase?.replaceAll("_", " ")}
        </span>
        <span className="phase-badge">
          {state.mode === "premium" ? "Premium (5-8)" : "Classic"}
        </span>
        {selfSpectator && <span className="phase-badge spectator-badge">Spectator</span>}
        <button
          type="button"
          className="room-code-badge room-code-button copyable"
          onClick={onCopyCode}
          title={copied ? "Room code copied" : "Copy room code"}
        >
          <span>Room: {state.roomId}</span>
          {copied ? (
            <Check size={15} strokeWidth={2.4} aria-hidden="true" />
          ) : (
            <Copy size={15} strokeWidth={2.1} aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="topbar-actions">
        {state.phase === "in_round" && (
          <span className={`turn-indicator ${isMyTurn ? "is-my-turn" : ""}`}>
            {isMyTurn
              ? "Your Turn"
              : currentTurnName
                ? `${currentTurnName}'s Turn`
                : "Turn in progress"}
          </span>
        )}

        {!selfSpectator ? (
          <button
            type="button"
            className="secondary-button topbar-leave-button"
            onClick={onBecomeSpectator}
          >
            Spectate
          </button>
        ) : showLobby ? (
          <button
            type="button"
            className="secondary-button topbar-leave-button"
            onClick={onBecomePlayer}
          >
            Join Game
          </button>
        ) : null}

        <button
          type="button"
          className="danger-button topbar-leave-button"
          onClick={onLeaveRoom}
        >
          Leave
        </button>
      </div>
    </header>
  );
}
