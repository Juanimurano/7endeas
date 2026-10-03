import { useEffect, useRef, useState } from 'react';
import { BarChart3, Check, Clock3 } from 'lucide-react';
import type { GameView } from '../../../packages/engine/src/index';
import type { RoundRecap } from '../../../packages/protocol/src/index';

export default function RoundRecapDialog({
  game,
  recap,
  serverTime,
  playerId,
  connected,
}: {
  game: GameView;
  recap: RoundRecap;
  serverTime: number;
  playerId?: string;
  connected: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [remaining, setRemaining] = useState(() =>
    recap.nextRoundAt === null ? recap.durationMs : Math.max(0, recap.nextRoundAt - serverTime),
  );
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  useEffect(() => {
    if (recap.nextRoundAt === null) {
      setRemaining(recap.durationMs);
      return;
    }
    const arrivedAt = performance.now();
    const initial = Math.max(0, recap.nextRoundAt - serverTime);
    const tick = () => setRemaining(Math.max(0, initial - (performance.now() - arrivedAt)));
    tick();
    const timer = window.setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [recap.nextRoundAt, recap.durationMs, serverTime]);
  const players = [...game.players].sort((a, b) => b.score - a.score);
  const tied = game.phase === 'roundEnd' && players[0].score >= game.targetScore;
  const counting = recap.nextRoundAt !== null;
  const seconds = Math.ceil(remaining / 1000);
  const status = !connected
    ? 'Reconectando con la mesa…'
    : !counting
      ? 'Dando lugar a los últimos avisos…'
      : !seconds
        ? game.phase === 'finished'
          ? 'Preparando la celebración…'
          : 'Preparando la siguiente ronda…'
        : game.phase === 'finished'
          ? `Celebramos al ganador en ${seconds} s`
          : `La próxima ronda empieza en ${seconds} s`;
  return (
    <dialog
      ref={ref}
      className="round-recap-dialog"
      aria-labelledby="recap-title"
      aria-describedby="recap-caption"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="recap-heading">
        <span className="recap-icon" aria-hidden="true">
          <BarChart3 size={25} />
        </span>
        <div>
          <p className="eyebrow">PUNTOS GUARDADOS</p>
          <h2 id="recap-title">Resumen de la ronda {recap.round.toString().padStart(2, '0')}</h2>
        </div>
      </div>
      <p id="recap-caption">
        {game.phase === 'finished'
          ? 'Resultados finales. Enseguida festejamos al ganador.'
          : tied
            ? '¡Empate en la cabeza! Todos juegan otra ronda para desempatar.'
            : 'Esto sumó cada uno. La mesa sigue automáticamente.'}
      </p>
      <div className="recap-table-scroll">
        <table className="recap-table">
          <thead>
            <tr>
              <th scope="col">Jugador</th>
              <th scope="col">Esta ronda</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id} className={player.id === playerId ? 'recap-mine' : ''}>
                <th scope="row">
                  <span className="recap-player-name">
                    {player.name}
                    {player.id === playerId && <small> (vos)</small>}
                  </span>
                  <span className="recap-player-status">
                    {game.flipSevenId === player.id
                      ? '¡7 endeas! Bonus incluido'
                      : player.status === 'busted'
                        ? 'Número repetido'
                        : player.status === 'frozen'
                          ? 'No endeas · puntos asegurados'
                          : 'Puntos asegurados'}
                  </span>
                </th>
                <td className={`recap-earned ${player.status === 'busted' ? 'recap-zero' : ''}`}>
                  {player.status === 'busted' ? '0' : `+${player.roundScore}`}
                </td>
                <td className="recap-total">{player.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="recap-footer">
        <div className="recap-countdown" role="status" aria-live="polite">
          <span aria-hidden="true">{counting ? <Clock3 size={17} /> : <Check size={17} />}</span>
          {status}
        </div>
        <progress
          className="recap-progress"
          max={recap.durationMs}
          value={counting ? recap.durationMs - remaining : 0}
          aria-label="Tiempo del resumen de puntos"
        />
      </div>
    </dialog>
  );
}
