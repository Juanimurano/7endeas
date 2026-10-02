import { createContext, useContext, useState } from 'react';
import { Heart, LockKeyhole, Layers, Sparkles } from 'lucide-react';
import { cardLabel, type Card as GameCard } from '../../../packages/engine/src/index';

export const ArtContext = createContext<Record<string, string>>({});
export function artKey(card: GameCard): string {
  return card.kind === 'number' || card.kind === 'bonus' ? `${card.kind}-${card.value}` : card.kind;
}
const names = [
  'CERO',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
];
const hues = [330, 180, 35, 345, 255, 155, 325, 25, 165, 260, 15, 210, 275];

export default function Card({
  card,
  small = false,
  back = false,
}: {
  card?: GameCard;
  small?: boolean;
  back?: boolean;
}) {
  const art = useContext(ArtContext);
  const [failed, setFailed] = useState('');
  const key = back ? 'back' : card ? artKey(card) : '';
  const image = art[key];
  const label = back ? 'Mazo de cartas' : card ? cardLabel(card) : '';
  const kind = back ? 'back' : (card?.kind ?? 'number');
  const Icon =
    kind === 'life'
      ? Heart
      : kind === 'freeze'
        ? LockKeyhole
        : kind === 'draw3'
          ? Layers
          : Sparkles;
  const title =
    card?.kind === 'number'
      ? names[card.value]
      : {
          bonus: 'PUNTOS EXTRA',
          double: 'DOBLE PUNTUACIÓN',
          life: 'VIDA EXTRA',
          freeze: 'BLOQUEO',
          draw3: 'SACA TRES',
          back: 'TENTÁ A LA SUERTE',
        }[kind as 'bonus'];
  return (
    <div
      className={`playing-card card-${kind} ${small ? 'card-small' : ''} ${image && failed !== image ? 'has-art' : ''}`}
      style={
        { '--card-hue': card?.kind === 'number' ? hues[card.value] : 40 } as React.CSSProperties
      }
      role="img"
      aria-label={label}
    >
      {image && failed !== image && (
        <img className="card-art" src={image} alt="" onError={() => setFailed(image)} />
      )}
      <div className="card-frame" aria-hidden="true">
        <span className="card-corner">
          {back ? (
            '✦'
          ) : card?.kind === 'number' || card?.kind === 'bonus' || card?.kind === 'double' ? (
            label
          ) : (
            <Icon size={15} />
          )}
        </span>
        <span className="card-topline">FLIP SIETE</span>
        <div className="card-value">
          {back ? (
            <>
              <span>FLIP</span>
              <b>7</b>
            </>
          ) : card?.kind === 'number' || card?.kind === 'bonus' || card?.kind === 'double' ? (
            label
          ) : (
            <Icon strokeWidth={1.5} />
          )}
        </div>
        <span className="card-title">{title}</span>
        <span className="card-corner bottom">
          {back ? (
            '✦'
          ) : card?.kind === 'number' || card?.kind === 'bonus' || card?.kind === 'double' ? (
            label
          ) : (
            <Icon size={15} />
          )}
        </span>
      </div>
    </div>
  );
}
