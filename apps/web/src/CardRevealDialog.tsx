import { ArrowRight, Sparkles } from 'lucide-react';
import { cardLabel } from '../../../packages/engine/src/index';
import Card from './Card';
import type { CardReveal } from './useSpecialCardReveals';
import Modal from './Modal';

export default function CardRevealDialog({
  reveal,
  count,
  onDismiss,
}: {
  reveal: CardReveal;
  count: number;
  onDismiss: () => void;
}) {
  return (
    <Modal
      className={`card-reveal-dialog reveal-${reveal.event.card.kind}`}
      labelledBy="reveal-title"
      describedBy="reveal-description"
      onDismiss={onDismiss}
    >
      <div className="reveal-art" aria-hidden="true">
        <div className="reveal-card">
          <div className="reveal-card-inner">
            <div className="reveal-front">
              <Card card={reveal.event.card} />
            </div>
            <div className="reveal-back">
              <Card back />
            </div>
          </div>
        </div>
      </div>
      <div className="reveal-copy">
        <span className="eyebrow">
          <Sparkles size={15} /> {reveal.heading}
        </span>
        <h2 id="reveal-title">{cardLabel(reveal.event.card)}</h2>
        <p id="reveal-description">{reveal.message}</p>
        <div className="reveal-hint">{reveal.hint}</div>
        {count > 1 && (
          <p className="reveal-remaining">
            Después de esta hay {count - 1} {count === 2 ? 'aviso más' : 'avisos más'}.
          </p>
        )}
        <button className="button primary wide" onClick={onDismiss} data-autofocus>
          Entendido <ArrowRight size={18} />
        </button>
      </div>
    </Modal>
  );
}
