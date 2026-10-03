import { useEffect, useRef, useState } from 'react';
import type { GameView, SpecialCardEvent } from '../../../packages/engine/src/index';
import type { RoomView } from '../../../packages/protocol/src/index';

export interface CardReveal {
  event: SpecialCardEvent;
  heading: string;
  message: string;
  hint: string;
}

export function describeReveal(event: SpecialCardEvent, game: GameView): CardReveal {
  const { card, reason, outcome } = event;
  const player = game.players.find((p) => p.id === event.playerId);
  const available = game.phase === 'playing' && player?.status === 'active';
  const heading =
    reason === 'gift'
      ? 'Te regalaron una vida extra'
      : reason === 'effect'
        ? 'Te jugaron una carta'
        : '¡Te salió una especial!';
  let message: string;
  let hint: string;
  if (card.kind === 'life') {
    message =
      'Otra endea te protege de un número repetido. Se descartan el repetido y esta vida, y seguís jugando.';
    hint =
      outcome === 'used'
        ? 'Ya se usó para salvarte durante este robo.'
        : outcome === 'gifted'
          ? 'Esta vida ya fue regalada a otro jugador.'
          : outcome === 'discarded'
            ? 'Se descartó: ya tenías una vida y nadie activo podía recibirla.'
            : outcome === 'pending'
              ? 'Ya tenés una vida. Al continuar, elegí a quién regalar esta.'
              : available
                ? 'La conservás en tu mano y se usa automáticamente. Solo vale en esta ronda.'
                : 'Ya no seguís jugando esta ronda. Las vidas extra no se guardan para la siguiente.';
  } else if (card.kind === 'freeze') {
    message =
      reason === 'effect'
        ? 'Tu ronda terminó por No endeas. Conservás los puntos de tu mano: se suman al cerrar la ronda.'
        : 'Elegí a un jugador activo, incluso a vos, para terminar su ronda. Ese jugador conserva sus puntos.';
    hint =
      reason === 'effect'
        ? 'Por esta ronda ya no tenés que pedir más cartas.'
        : outcome === 'cancelled'
          ? 'Esta acción no se activa: el robo falló o terminó la ronda.'
          : outcome === 'played'
            ? 'La acción ya fue aplicada.'
            : 'Al continuar, resolvé la elección de objetivo. En un robo de tres, las acciones esperan al final.';
  } else {
    message =
      reason === 'effect'
        ? 'Te obligaron a sacar tres cartas. El robo se resuelve automáticamente: revisá las cartas que recibís y el resultado en tu mano.'
        : 'Elegí a un jugador activo, incluso a vos, para que saque tres cartas. El robo se detiene si repite un número o junta 7 endeas.';
    hint =
      reason === 'effect'
        ? player?.status === 'busted'
          ? 'Repetiste un número y quedaste fuera de esta ronda.'
          : game.flipSevenId === player?.id
            ? '¡Conseguiste 7 endeas y terminó la ronda!'
            : 'Las vidas se usan al instante; las otras acciones se resuelven después.'
        : outcome === 'cancelled'
          ? 'Esta acción no se activa: el robo falló o terminó la ronda.'
          : outcome === 'played'
            ? 'La acción ya fue aplicada.'
            : 'Al continuar, elegí el objetivo cuando te corresponda resolver esta acción.';
  }
  return { event, heading, message, hint };
}

export function useSpecialCardReveals(room: RoomView | null, playerId?: string) {
  const [queue, setQueue] = useState<CardReveal[]>([]);
  const [processedView, setProcessedView] = useState<string | null>(null);
  const cursor = useRef<{ code: string; sequence: number; round: number } | null>(null);
  useEffect(() => {
    if (!room || !playerId || !room.game) {
      cursor.current = room ? { code: room.code, sequence: 0, round: 0 } : null;
      setQueue((current) => (current.length ? [] : current));
      setProcessedView(null);
      return;
    }
    const game = room.game;
    setProcessedView(`${room.code}:${game.round}:${game.sequence}`);
    const previous = cursor.current;
    const initial = !previous || previous.code !== room.code || game.sequence < previous.sequence;
    cursor.current = { code: room.code, sequence: game.sequence, round: game.round };
    // Cuando empieza la cuenta del resumen, los avisos finales ya tuvieron su margen de lectura.
    if (game.phase !== 'playing' && room.roundRecap?.nextRoundAt != null) {
      setQueue((current) => (current.length ? [] : current));
      return;
    }
    // En una reconexión no reproducimos la historia. Sí recordamos una acción aún pendiente.
    const incoming = game.cardEvents.filter(
      (event) =>
        event.playerId === playerId &&
        (initial
          ? game.pending?.actorId === playerId && game.pending.card.id === event.card.id
          : event.id > previous.sequence),
    );
    if (initial || previous.round !== game.round)
      setQueue(incoming.map((event) => describeReveal(event, game)));
    else if (incoming.length)
      setQueue((current) => [...current, ...incoming.map((event) => describeReveal(event, game))]);
  }, [room, playerId]);

  function dismiss() {
    setQueue((current) => current.slice(1));
  }
  const settled =
    !!room?.game && processedView === `${room.code}:${room.game.round}:${room.game.sequence}`;
  return { reveal: queue[0] ?? null, count: queue.length, dismiss, settled };
}
