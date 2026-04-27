import React from "react";
import { Send } from "lucide-react";

import type { PlayerID, PlayerViewState } from "@game-site/shared";
import type { SkullKingPlayerViewState } from "@game-site/shared/games/skull-king/types";
import type { RoomChatMessage } from "../app/App.js";

type ChatState = Pick<PlayerViewState, "players" | "spectators" | "selfPlayerId"> | Pick<SkullKingPlayerViewState, "players" | "spectators" | "selfPlayerId">;

type RoomChatProps = {
  messages: RoomChatMessage[];
  state: ChatState;
  onSendMessage: (text: string) => Promise<boolean>;
};

const PLAYER_SWATCHES = [
  { background: "rgba(88, 166, 255, 0.16)", border: "rgba(88, 166, 255, 0.4)", text: "#8dc6ff" },
  { background: "rgba(255, 179, 71, 0.16)", border: "rgba(255, 179, 71, 0.4)", text: "#ffd08d" },
  { background: "rgba(78, 205, 196, 0.16)", border: "rgba(78, 205, 196, 0.4)", text: "#8ef0e8" },
  { background: "rgba(255, 122, 122, 0.16)", border: "rgba(255, 122, 122, 0.4)", text: "#ffb0b0" },
  { background: "rgba(177, 156, 217, 0.16)", border: "rgba(177, 156, 217, 0.4)", text: "#d7c2ff" },
  { background: "rgba(119, 221, 119, 0.16)", border: "rgba(119, 221, 119, 0.4)", text: "#bdf5bd" },
];

function getPlayerSwatch(state: ChatState, playerId: PlayerID) {
  const playerIndex = state.players.findIndex((player) => player.id === playerId);
  if (playerIndex >= 0) return PLAYER_SWATCHES[playerIndex % PLAYER_SWATCHES.length];

  const spectatorIndex = state.spectators.findIndex((spectator) => spectator.id === playerId);
  if (spectatorIndex >= 0) return PLAYER_SWATCHES[(state.players.length + spectatorIndex) % PLAYER_SWATCHES.length];

  const hashed = [...playerId].reduce((total, char) => total + char.charCodeAt(0), 0);
  return PLAYER_SWATCHES[hashed % PLAYER_SWATCHES.length];
}

export function RoomChat({ messages, state, onSendMessage }: RoomChatProps) {
  const [draft, setDraft] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;

    setIsSending(true);
    const ok = await onSendMessage(text);
    if (ok) {
      setDraft("");
    }
    setIsSending(false);
  };

  return (
    <section className="game-panel chat-panel">
      <h3>Room Chat</h3>
      <div className="chat-message-list" ref={listRef}>
        {messages.length === 0 ? (
          <p className="chat-empty">No messages yet. Say hi to the table.</p>
        ) : (
          messages.map((message) => {
            const swatch = getPlayerSwatch(state, message.playerId);
            const isSelf = message.playerId === state.selfPlayerId;

            return (
              <article key={message.id} className={`chat-message ${isSelf ? "is-self" : ""}`}>
                <div className="chat-message-meta">
                  <span
                    className="chat-player-name"
                    style={
                      {
                        "--chat-player-background": swatch.background,
                        "--chat-player-border": swatch.border,
                        "--chat-player-text": swatch.text,
                      } as React.CSSProperties
                    }
                  >
                    {isSelf ? "You" : message.playerName}
                  </span>
                  <time dateTime={new Date(message.createdAt).toISOString()}>
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </div>
                <p>{message.text}</p>
              </article>
            );
          })
        )}
      </div>
      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 240))}
          placeholder="Message the room..."
          maxLength={240}
        />
        <button type="submit" className="primary-button chat-send-button" disabled={!draft.trim() || isSending} aria-label="Send chat message">
          <Send size={16} strokeWidth={2.3} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
