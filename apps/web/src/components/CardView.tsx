import type { CardDef } from "@game-site/shared";

type CardViewProps = {
  card: CardDef;
  hidden?: boolean;
};

export function CardView({ card, hidden }: CardViewProps) {
  if (hidden) {
    return <div className="card-back">?</div>;
  }

  return (
    <div className="card">
      {card.imageUrl && <img src={card.imageUrl} alt={card.name} />}
      <div>{card.name}</div>
      <div>{card.value}</div>
    </div>
  );
}
