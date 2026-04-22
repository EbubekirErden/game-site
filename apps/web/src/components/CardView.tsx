import React from "react";
import { getCardDef } from "@game-site/shared";
import type { CardInstance } from "@game-site/shared";

type CardViewProps = {
  card: CardInstance;
  hidden?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
  spotlight?: boolean;
};

// We use Record<string, ...> here so it won't crash if an unknown premium card is dealt
const CARD_ART: Record<string, { symbol: string; accent: string }> = {
  guard: { symbol: "shield", accent: "#3d5a80" },
  priest: { symbol: "star", accent: "#5b7c4d" },
  baron: { symbol: "diamond", accent: "#9c6644" },
  handmaid: { symbol: "flower", accent: "#b56576" },
  prince: { symbol: "sun", accent: "#d4a373" },
  king: { symbol: "crown", accent: "#8d6a9f" },
  countess: { symbol: "moon", accent: "#7f5539" },
  princess: { symbol: "heart", accent: "#c1121f" },
};

function Icon({ kind, accent }: { kind: string; accent: string }) {
  switch (kind) {
    case "shield":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M32 6 50 12v16c0 13-7.5 21.5-18 30C21.5 49.5 14 41 14 28V12Z" fill={accent} opacity="0.18" />
          <path d="M32 10 46 15v13c0 10.5-5.7 17.6-14 24.2C23.7 45.6 18 38.5 18 28V15Z" fill="none" stroke={accent} strokeWidth="3" />
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="18" fill={accent} opacity="0.14" />
          <path d="m32 13 4.8 12.7L50 27l-10 8 3.4 13L32 40.4 20.6 48 24 35l-10-8 13.2-1.3Z" fill={accent} />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M32 10 50 32 32 54 14 32Z" fill={accent} opacity="0.18" />
          <path d="M32 14 46 32 32 50 18 32Z" fill="none" stroke={accent} strokeWidth="3" />
        </svg>
      );
    case "flower":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="22" r="9" fill={accent} opacity="0.22" />
          <circle cx="22" cy="34" r="9" fill={accent} opacity="0.22" />
          <circle cx="42" cy="34" r="9" fill={accent} opacity="0.22" />
          <circle cx="32" cy="44" r="9" fill={accent} opacity="0.22" />
          <circle cx="32" cy="33" r="6" fill={accent} />
        </svg>
      );
    case "sun":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="11" fill={accent} />
          <g stroke={accent} strokeWidth="3" strokeLinecap="round">
            <path d="M32 8v10" />
            <path d="M32 46v10" />
            <path d="M8 32h10" />
            <path d="M46 32h10" />
            <path d="m15 15 7 7" />
            <path d="m42 42 7 7" />
            <path d="m49 15-7 7" />
            <path d="m22 42-7 7" />
          </g>
        </svg>
      );
    case "crown":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="m12 46 5-22 15 13 15-13 5 22Z" fill={accent} opacity="0.18" />
          <path d="m12 46 5-22 15 13 15-13 5 22H12Zm4 6h32" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="17" cy="22" r="3" fill={accent} />
          <circle cx="32" cy="16" r="3" fill={accent} />
          <circle cx="47" cy="22" r="3" fill={accent} />
        </svg>
      );
    case "moon":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M40 12c-9 3-15 11.4-15 21.2 0 8.5 4.8 16 12 19.8-2-.1-4.1-.4-6-.9C20.3 49.1 13 39.8 13 29c0-12.2 9.8-22 22-22 1.7 0 3.4.2 5 .7Z" fill={accent} opacity="0.2" />
          <path d="M42 12.5A22 22 0 1 0 36.7 56c-8.2-2.2-14.2-9.7-14.2-18.6 0-10.3 8-18.9 18.2-19Z" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M32 54 13 24c6-7 12-11 19-14 7 3 13 7 19 14Z" fill={accent} opacity="0.18" />
          <path d="m32 54-19-30c6-7 12-11 19-14 7 3 13 7 19 14Z" fill="none" stroke={accent} strokeWidth="3" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function CardView({ card, hidden = false, selectable = false, selected = false, onClick, compact = false, spotlight = false }: CardViewProps) {
  const cardDef = getCardDef(card.cardId);
  
  // Safe fallback if the backend sends a card not in our dictionary
  const art = CARD_ART[card.cardId] || { symbol: "unknown", accent: "#7f8c8d" };

  if (hidden) {
    return (
      <button
        type="button"
        className={`card-view card-view-hidden ${compact ? "card-view-compact" : ""}`}
        onClick={onClick}
        disabled={!selectable}
      >
        <div className="card-view-back-pattern" />
        <div className="card-view-hidden-crest">⚜️</div>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`card-view ${selected ? "is-selected" : ""} ${selectable ? "is-clickable" : ""} ${compact ? "card-view-compact" : ""} ${spotlight ? "card-view-spotlight" : ""}`}
      onClick={onClick}
      disabled={!onClick}
      style={{ "--card-accent": art.accent } as React.CSSProperties}
    >
      <div className="card-view-header">
        <span className="card-view-rank">{cardDef?.value ?? "?"}</span>
        <span className="card-view-mini-icon"><Icon kind={art.symbol} accent={art.accent} /></span>
      </div>
      
      <div className="card-view-center-art">
        <Icon kind={art.symbol} accent={art.accent} />
      </div>
      
      <div className="card-view-footer">
        <strong>{cardDef?.name ?? "Unknown"}</strong>
      </div>
    </button>
  );
}