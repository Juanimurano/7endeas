import { useEffect, useRef, type CSSProperties } from 'react';
import { ArrowRight, Sparkles, Trophy } from 'lucide-react';
import type { Victory } from './useWinnerCelebration';

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
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  function dismiss() {
    ref.current?.close();
    onDismiss();
  }
  return (
    <dialog
      ref={ref}
      className="victory-dialog"
      aria-labelledby="victory-title"
      aria-describedby="victory-description"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
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
        <button className="button primary wide" onClick={dismiss} autoFocus>
          Ver resultados <ArrowRight size={18} />
        </button>
      </div>
    </dialog>
  );
}
