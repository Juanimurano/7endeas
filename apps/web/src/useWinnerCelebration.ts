import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '../../../packages/protocol/src/index';

const STORAGE_KEY = '7-endeas-last-victory';
export interface Victory {
  key: string;
  playerId: string;
  name: string;
  score: number;
  rounds: number;
}

function victoryKey(room: RoomView): string | null {
  const game = room.game;
  return game?.phase === 'finished' && game.winnerId
    ? `${room.code}:${game.round}:${game.sequence}:${game.winnerId}`
    : null;
}

function lastVictory(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function rememberVictory(key: string | null) {
  try {
    if (key) sessionStorage.setItem(STORAGE_KEY, key);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* El aviso sigue funcionando si el navegador bloquea el almacenamiento. */
  }
}

export function useWinnerCelebration(room: RoomView | null) {
  const [victory, setVictory] = useState<Victory | null>(null);
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const key = room ? victoryKey(room) : null;
    if (!key || !room?.game) {
      handled.current = null;
      setVictory((current) => (current ? null : current));
      // No borrar al montar: la primera vista llega después de reconectar.
      if (room) rememberVictory(null);
      return;
    }
    if (handled.current === key) return;
    handled.current = key;
    if (lastVictory() === key) return;
    const winner = room.game.players.find((player) => player.id === room.game?.winnerId);
    if (winner)
      setVictory({
        key,
        playerId: winner.id,
        name: winner.name,
        score: winner.score,
        rounds: room.game.round,
      });
  }, [room]);

  function dismiss() {
    if (victory) rememberVictory(victory.key);
    setVictory(null);
  }
  return { victory: room && victory?.key === victoryKey(room) ? victory : null, dismiss };
}
