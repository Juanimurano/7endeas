import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientEvents,
  Reply,
  RoomView,
  ServerEvents,
  Session,
} from '../../../packages/protocol/src/index';

const STORAGE_KEY = 'flip-siete-session';
function readSession(): Session | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    return saved &&
      typeof saved.code === 'string' &&
      typeof saved.playerId === 'string' &&
      typeof saved.token === 'string'
      ? saved
      : null;
  } catch {
    return null;
  }
}

export function useGame() {
  const [socket] = useState<Socket<ServerEvents, ClientEvents>>(() => io({ autoConnect: false }));
  const [session, setSession] = useState<Session | null>(readSession);
  const sessionRef = useRef(session);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [restoring, setRestoring] = useState(!!session);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function save(value: Session | null) {
    sessionRef.current = value;
    setSession(value);
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  }

  useEffect(() => {
    const onView = (view: RoomView) => setRoom(view);
    const onConnect = () => {
      setConnected(true);
      const saved = sessionRef.current;
      if (saved) {
        setRestoring(true);
        socket.timeout(8000).emit('room:resume', saved, (timeout: Error | null, reply: Reply) => {
          setRestoring(false);
          if (timeout) {
            setError('No pudimos recuperar la conexión. Volvé a intentar.');
            return;
          }
          if (!reply.ok) {
            save(null);
            setRoom(null);
            setError(reply.error);
          } else if (reply.session) save(reply.session);
        });
      } else setRestoring(false);
    };
    const onDisconnect = () => {
      setConnected(false);
      setBusy(false);
    };
    const onReplaced = () => {
      save(null);
      setRoom(null);
      setError('Esta sesión se abrió en otra ventana. Recargá para volver a jugar.');
      socket.disconnect();
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:view', onView);
    socket.on('session:replaced', onReplaced);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:view', onView);
      socket.off('session:replaced', onReplaced);
      socket.disconnect();
    };
  }, [socket]);

  async function send(operation: (ack: Ack) => void): Promise<boolean> {
    if (!socket.connected || restoring) {
      setError('Esperá a que se restablezca la conexión.');
      return false;
    }
    if (busy) return false;
    setBusy(true);
    setError('');
    return new Promise((resolve) => {
      let done = false;
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        setBusy(false);
        setError('El servidor tardó en responder. Reconectando…');
        socket.disconnect().connect();
        resolve(false);
      }, 8000);
      operation((reply) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        setBusy(false);
        if (!reply.ok) {
          setError(reply.error);
          resolve(false);
        } else {
          if (reply.session) save(reply.session);
          resolve(true);
        }
      });
    });
  }

  async function leave() {
    const ok = await send((ack) => socket.emit('room:leave', ack));
    if (ok) {
      save(null);
      setRoom(null);
      history.replaceState(null, '', location.pathname);
    }
  }
  return { socket, session, room, connected, restoring, busy, error, setError, send, leave };
}
