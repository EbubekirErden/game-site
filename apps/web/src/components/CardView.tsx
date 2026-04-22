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

const CARD_ART: Record<CardInstance["cardId"], { symbol: string; accent: string }> = {
  guard: { symbol: "shield", accent: "#3d5a80" },
  priest: { symbol: "star", accent: "#5b7c4d" },
  baron: { symbol: "diamond", accent: "#9c6644" },
  handmaid: { symbol: "flower", accent: "#b56576" },
  prince: { symbol: "sun", accent: "#d4a373" },
  king: { symbol: "crown", accent: "#8d6a9f" },
  countess: { symbol: "moon", accent: "#7f5539" },
  princess: { symbol: "heart", accent: "#c1121f" },
};

export function CardView({ card, hidden = false, selectable = false, selected = false, onClick, compact = false, spotlight = false }: CardViewProps) {
  const cardDef = getCardDef(card.cardId);
  const art = CARD_ART[card.cardId];

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
        <span className="card-view-rank">{cardDef.value}</span>
        <span className="card-view-mini-icon"><Icon kind={art.symbol} accent={art.accent} /></span>
      </div>
      
      <div className="card-view-center-art">
        <Icon kind={art.symbol} accent={art.accent} />
      </div>
      
      <div className="card-view-footer">
        <strong>{cardDef.name}</strong>
      </div>
    </button>
  );
}