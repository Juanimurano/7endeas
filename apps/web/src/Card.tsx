import { createContext, useContext, useState } from 'react';
import { Heart, LockKeyhole, Layers, Sparkles } from 'lucide-react';
import { cardLabel, type Card as GameCard } from '../../../packages/engine/src/index';

export const ArtContext = createContext<Record<string, string>>({});
export const PrintedArtContext = createContext<string[]>([]);
export function artKey(card: GameCard): string {
  return card.kind === 'number' || card.kind === 'bonus' ? `${card.kind}-${card.value}` : card.kind;
}
const hues = [330, 180, 35, 345, 255, 155, 325, 25, 165, 260, 15, 210, 275];
const titles = {
  bonus: 'ENDEAS EXTRA',
  double: 'DOBLE ENDEA',
  life: 'OTRA ENDEA',
  freeze: 'NO ENDEAS',
  draw3: 'ENDEÁ TRES',
  back: '¿ENDEÁS UNA MÁS?',
};
const effects = {
  bonus: 'SUMÁ PUNTOS EXTRA',
  double: 'DUPLICÁ TUS NÚMEROS',
  life: 'SALVATE DE UN REPETIDO',
  freeze: 'TERMINÁ SU RONDA',
  draw3: 'OBLIGÁ A ROBAR 3 CARTAS',
};

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
  const printedFaces = useContext(PrintedArtContext);
  const [failed, setFailed] = useState('');
  const key = back ? 'back' : card ? artKey(card) : '';
  const image = art[key];
  const fullFace = !!image && failed !== image && printedFaces.includes(key);
  const label = back
    ? 'Mazo de 7 endeas'
    : card?.kind === 'number'
      ? `${card.value} ${card.value === 1 ? 'endea' : 'endeas'}`
      : card
        ? cardLabel(card)
        : '';
  const value = card ? cardLabel(card) : '';
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
      ? card.value === 1
        ? 'ENDEA'
        : 'ENDEAS'
      : titles[kind as keyof typeof titles];
  const effect = effects[kind as keyof typeof effects];
  return (
    <div
      className={`playing-card card-${kind} ${small ? 'card-small' : ''} ${image && failed !== image ? 'has-art' : ''} ${fullFace ? 'full-art' : ''}`}
      style={
        { '--card-hue': card?.kind === 'number' ? hues[card.value] : 40 } as React.CSSProperties
      }
      role="img"
      aria-label={effect ? `${label}: ${effect.toLowerCase()}` : label}
    >
      {image && failed !== image && (
        <img className="card-art" src={image} alt="" onError={() => setFailed(image)} />
      )}
      <div className="card-frame" aria-hidden="true">
        <span className="card-corner">
          {back ? (
            '✦'
          ) : card?.kind === 'number' || card?.kind === 'bonus' || card?.kind === 'double' ? (
            value
          ) : (
            <Icon size={15} />
          )}
        </span>
        <span className="card-topline">7 ENDEAS</span>
        <div className="card-value">
          {back ? (
            <>
              <b>7</b>
              <span>ENDEAS</span>
            </>
          ) : card?.kind === 'number' || card?.kind === 'bonus' || card?.kind === 'double' ? (
            value
          ) : (
            <Icon strokeWidth={1.5} />
          )}
        </div>
        <span className="card-title">{title}</span>
        {effect && <span className="card-effect">{effect}</span>}
        <span className="card-corner bottom">
          {back ? (
            '✦'
          ) : card?.kind === 'number' || card?.kind === 'bonus' || card?.kind === 'double' ? (
            value
          ) : (
            <Icon size={15} />
          )}
        </span>
      </div>
    </div>
  );
}
