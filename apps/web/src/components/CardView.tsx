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
  mini?: boolean;
  spotlight?: boolean;
};

// We use Record<string, ...> here so it won't crash if an unknown premium card is dealt
const CARD_ART: Record<string, { symbol: string; accent: string }> = {
  assassin: { symbol: "dagger", accent: "#4f5d75" },
  jester: { symbol: "mask", accent: "#b08968" },
  guard: { symbol: "shield", accent: "#3d5a80" },
  cardinal: { symbol: "cross", accent: "#6a994e" },
  priest: { symbol: "star", accent: "#5b7c4d" },
  baron: { symbol: "diamond", accent: "#9c6644" },
  baroness: { symbol: "fan", accent: "#9d4edd" },
  handmaid: { symbol: "flower", accent: "#b56576" },
  sycophant: { symbol: "rings", accent: "#577590" },
  prince: { symbol: "sun", accent: "#d4a373" },
  count: { symbol: "column", accent: "#bc6c25" },
  constable: { symbol: "helm", accent: "#355070" },
  king: { symbol: "crown", accent: "#8d6a9f" },
  countess: { symbol: "moon", accent: "#7f5539" },
  dowager_queen: { symbol: "orb", accent: "#8f5a9f" },
  princess: { symbol: "heart", accent: "#c1121f" },
  bishop: { symbol: "spire", accent: "#386641" },
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
    case "dagger":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M29 10h6l3 9-6 6-6-6Z" fill={accent} opacity="0.22" />
          <path d="M32 21v26m0 0-6 7m6-7 6 7M26 29h12" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "mask":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M16 20c7-3 25-3 32 0 0 16-6 24-16 24S16 36 16 20Z" fill={accent} opacity="0.18" />
          <path d="M16 20c7-3 25-3 32 0 0 16-6 24-16 24S16 36 16 20Z" fill="none" stroke={accent} strokeWidth="3" />
          <path d="M24 26c2 0 3 1 4 3 1-2 2-3 4-3m4 0c2 0 3 1 4 3 1-2 2-3 4-3" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "cross":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M28 10h8v14h14v8H36v22h-8V32H14v-8h14Z" fill={accent} opacity="0.22" />
          <path d="M28 10h8v14h14v8H36v22h-8V32H14v-8h14Z" fill="none" stroke={accent} strokeWidth="3" strokeLinejoin="round" />
        </svg>
      );
    case "fan":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M22 48c0-12 6-22 18-30l6 20c-9 3-17 6-24 10Z" fill={accent} opacity="0.2" />
          <path d="M22 48c0-12 6-22 18-30l6 20c-9 3-17 6-24 10ZM22 48l5-20m5 17 3-18m7 15 1-14" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "rings":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="26" cy="34" r="11" fill="none" stroke={accent} strokeWidth="3" />
          <circle cx="38" cy="30" r="11" fill="none" stroke={accent} strokeWidth="3" opacity="0.8" />
        </svg>
      );
    case "column":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M18 18h28M22 22h20v24H22Zm-4 28h28" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M26 22v24m12-24v24" stroke={accent} strokeWidth="3" opacity="0.35" />
        </svg>
      );
    case "helm":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M18 46V24l14-10 14 10v22" fill={accent} opacity="0.18" />
          <path d="M18 46V24l14-10 14 10v22M24 46V30h16v16m-22 0h28" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "orb":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="28" r="12" fill={accent} opacity="0.2" />
          <circle cx="32" cy="28" r="12" fill="none" stroke={accent} strokeWidth="3" />
          <path d="M20 46h24m-12-6v12" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "spire":
      return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M24 50h16L36 24l3-8-7-6-7 6 3 8Z" fill={accent} opacity="0.18" />
          <path d="M24 50h16L36 24l3-8-7-6-7 6 3 8Zm8-40v8m-8 32h16" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
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

export function CardView({ card, hidden = false, selectable = false, selected = false, onClick, compact = false, mini = false, spotlight = false }: CardViewProps) {
  const cardDef = getCardDef(card.cardId);
  
  // Safe fallback if the backend sends a card not in our dictionary
  const art = CARD_ART[card.cardId] || { symbol: "unknown", accent: "#7f8c8d" };
  const sizeClassName = mini ? "card-view-mini" : compact ? "card-view-compact" : "";

  if (hidden) {
    return (
      <button
        type="button"
        className={`card-view card-view-hidden ${sizeClassName}`}
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
      className={`card-view ${selected ? "is-selected" : ""} ${selectable ? "is-clickable" : ""} ${sizeClassName} ${spotlight ? "card-view-spotlight" : ""}`}
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
