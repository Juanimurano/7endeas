import type { CSSProperties } from 'react';
import { ArrowRight, Sparkles, Trophy } from 'lucide-react';
import type { Victory } from './useWinnerCelebration';
import Modal from './Modal';

const CONFETTI = Array.from(
  { length: 32 },
  (_, index) =>
    ({
      left: `${(index * 37 + 9) % 100}%`,
      '--confetti-delay': `${(index % 8) * 0.16}s`,
      '--confetti-duration': `${3.2 + (index % 5) * 0.25}s`,
      '--confetti-drift': `${((index * 17) % 120) - 60}px`,
      '--confetti-color': ['var(--yellow)', 'var(--purple)', 'var(--orange)', 'var(--green)'][
        index % 4
      ],
    }) as CSSProperties,
);

export default function WinnerCelebration({
  victory,
  mine,
  onDismiss,
}: {
  victory: Victory;
  mine: boolean;
  onDismiss: () => void;
}) {
  return (
    <Modal
      className="victory-dialog"
      labelledBy="victory-title"
      describedBy="victory-description"
      onDismiss={onDismiss}
    >
      <div className="victory-confetti" aria-hidden="true">
        {CONFETTI.map((style, index) => (
          <span key={index} style={style} />
        ))}
      </div>
      <div className="victory-content">
        <div className="victory-trophy" aria-hidden="true">
          <Sparkles className="victory-spark left" />
          <Trophy className="victory-cup" strokeWidth={1.5} />
          <Sparkles className="victory-spark right" />
        </div>
        <p className="eyebrow">
          {mine ? '¡GANASTE! ESTA ENDEA ES TUYA.' : '¡TENEMOS GANADOR EN LA MESA!'}
        </p>
        <h2 id="victory-title">
          <span className="victory-name">{victory.name}</span>
          <span className="victory-subtitle">ganó la partida</span>
        </h2>
        <p id="victory-description">
          {mine
            ? 'Supiste cuándo arriesgar y cuándo plantarte. ¡Bien jugado!'
            : 'La suerte y las buenas decisiones tienen su recompensa. ¡Bien jugado!'}{' '}
        </p>
        <div className="victory-score">
          <strong>{victory.score}</strong>
          <span>PUNTOS TOTALES</span>
        </div>
        <p className="victory-rounds">
          {victory.rounds} {victory.rounds === 1 ? 'ronda' : 'rondas'} de buenas endeas.
        </p>
        <button className="button primary wide" onClick={onDismiss} data-autofocus>
          Ver resultados <ArrowRight size={18} />
        </button>
      </div>
    </Modal>
  );
}
