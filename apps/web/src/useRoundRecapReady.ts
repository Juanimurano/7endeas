import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import type { ClientEvents, RoomView, ServerEvents } from '../../../packages/protocol/src/index';

export function useRoundRecapReady(
  room: RoomView | null,
  socket: Socket<ServerEvents, ClientEvents>,
  connected: boolean,
  ready: boolean,
) {
  const sent = useRef<string | null>(null);
  const recap = room?.roundRecap;
  useEffect(() => {
    if (!recap || !connected || !ready || recap.nextRoundAt !== null) return;
    const key = `${socket.id}:${recap.id}`;
    if (sent.current === key) return;
    sent.current = key;
    socket.emit('round:ready', { recapId: recap.id }, () => {});
  }, [recap, socket, connected, ready]);
}
