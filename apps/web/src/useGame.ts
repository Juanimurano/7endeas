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
// sessionStorage keeps tabs independent; localStorage is a backup so a tab the
// phone discarded can get its seat back. A new tab only adopts the backup when
// no open tab answers on the channel that it is already using that session.
const CLAIM_WAIT = 250;
function parse(raw: string | null): Session | null {
  try {
    const saved = JSON.parse(raw ?? 'null');
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
function readStored(storage: () => Storage): Session | null {
  try {
    return parse(storage().getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}
function writeStored(storage: () => Storage, value: Session | null) {
  try {
    if (value) storage().setItem(STORAGE_KEY, JSON.stringify(value));
    else storage().removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the session just won't survive a reload.
  }
}
function openChannel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(STORAGE_KEY);
  } catch {
    return null;
  }
}
const tabSession = () => readStored(() => sessionStorage);
const backupSession = () => readStored(() => localStorage);

export function useGame() {
  const [socket] = useState<Socket<ServerEvents, ClientEvents>>(() => io({ autoConnect: false }));
  const [session, setSession] = useState<Session | null>(tabSession);
  const sessionRef = useRef(session);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [restoring, setRestoring] = useState(() => !!session || !!backupSession());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function save(value: Session | null, keepBackup = false) {
    const previous = sessionRef.current;
    sessionRef.current = value;
    setSession(value);
    writeStored(() => sessionStorage, value);
    if (value) writeStored(() => localStorage, value);
    else if (!keepBackup && previous && backupSession()?.token === previous.token)
      writeStored(() => localStorage, null);
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
      save(null, true);
      setRoom(null);
      setError('Esta sesión se abrió en otra ventana. Recargá para volver a jugar.');
      socket.disconnect();
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:view', onView);
    socket.on('session:replaced', onReplaced);

    const channel = openChannel();
    if (channel)
      channel.onmessage = (event: MessageEvent<{ type: string; token: string }>) => {
        if (event.data?.type === 'claim' && event.data.token === sessionRef.current?.token)
          channel.postMessage({ type: 'taken', token: event.data.token });
      };
    let claim: number | undefined;
    const backup = sessionRef.current ? null : backupSession();
    if (backup && channel) {
      let taken = false;
      const listen = (event: MessageEvent<{ type: string; token: string }>) => {
        if (event.data?.type === 'taken' && event.data.token === backup.token) taken = true;
      };
      channel.addEventListener('message', listen);
      channel.postMessage({ type: 'claim', token: backup.token });
      claim = window.setTimeout(() => {
        channel.removeEventListener('message', listen);
        if (!taken) save(backup);
        socket.connect();
      }, CLAIM_WAIT);
    } else {
      if (backup) save(backup);
      socket.connect();
    }
    return () => {
      clearTimeout(claim);
      channel?.close();
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
