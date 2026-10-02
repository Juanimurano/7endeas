import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { createServer } from '../apps/server/src/server';
import type {
  Ack,
  ClientEvents,
  Reply,
  RoomView,
  ServerEvents,
  Session,
} from '../packages/protocol/src/index';

type Client = Socket<ServerEvents, ClientEvents>;
let server: Awaited<ReturnType<typeof createServer>>;
let url: string;
let clients: Client[];
async function connect(): Promise<Client> {
  const socket: Client = io(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}
function ack(operation: (reply: Ack) => void): Promise<Reply> {
  return new Promise((resolve) => operation(resolve));
}
async function create(socket: Client, demo = false): Promise<Session> {
  const result = await ack((reply) => socket.emit('room:create', { name: 'Juani', demo }, reply));
  if (!result.ok || !result.session) throw new Error('No session');
  return result.session;
}
function view(socket: Client): Promise<RoomView> {
  return new Promise((resolve) => socket.once('room:view', resolve));
}

beforeEach(async () => {
  clients = [];
  server = await createServer({ botDelay: 10, reconnectGrace: 20 });
  url = await server.app.listen({ port: 0, host: '127.0.0.1' });
});
afterEach(async () => {
  for (const client of clients) client.disconnect();
  await server.app.close();
});

describe('Salas Socket.IO', () => {
  it('crea una sala, incorpora invitados y transmite vistas sin secretos', async () => {
    const host = await connect();
    const session = await create(host);
    const guest = await connect();
    const received = view(host);
    const joined = await ack((reply) =>
      guest.emit('room:join', { code: session.code, name: 'Invitado' }, reply),
    );
    expect(joined.ok).toBe(true);
    const room = await received;
    expect(room.seats).toHaveLength(2);
    expect(JSON.stringify(room)).not.toContain(session.token);
    expect(room.seats[0]).not.toHaveProperty('token');
    const rejected = await ack((reply) => guest.emit('game:start', reply));
    expect(rejected.ok).toBe(false);
    const gameView = view(guest);
    expect((await ack((reply) => host.emit('game:start', reply))).ok).toBe(true);
    const started = await gameView;
    expect(started.game).not.toHaveProperty('drawPile');
    expect(JSON.stringify(started)).not.toContain(session.token);
    expect(started.game?.players[0]).not.toHaveProperty('token');
  });
  it('rechaza salas inexistentes, nombres vacíos y acciones sin sesión', async () => {
    const client = await connect();
    expect(
      (await ack((reply) => client.emit('room:join', { name: 'A', code: 'XXXXX' }, reply))).ok,
    ).toBe(false);
    expect((await ack((reply) => client.emit('room:create', { name: '' }, reply))).ok).toBe(false);
    expect((await ack((reply) => client.emit('game:action', { type: 'hit' }, reply))).ok).toBe(
      false,
    );
  });
  it('reconecta con el token, conserva la partida y rechaza un token falso', async () => {
    const host = await connect();
    const session = await create(host);
    await ack((reply) => host.emit('game:start', reply));
    host.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const client = await connect();
    const received = view(client);
    expect(
      (await ack((reply) => client.emit('room:resume', { ...session, token: 'bad' }, reply))).ok,
    ).toBe(false);
    expect((await ack((reply) => client.emit('room:resume', session, reply))).ok).toBe(true);
    const room = await received;
    expect(room.game?.players[0].id).toBe(session.playerId);
    expect(room.seats[0].connected).toBe(true);
  });
  it('reemplaza una conexión previa de la misma sesión', async () => {
    const old = await connect();
    const session = await create(old);
    const replaced = new Promise<void>((resolve) => old.once('session:replaced', resolve));
    const other = await connect();
    expect((await ack((reply) => other.emit('room:resume', session, reply))).ok).toBe(true);
    await replaced;
    expect((await ack((reply) => old.emit('game:start', reply))).ok).toBe(false);
  });
  it('transferencia de anfitrión y salida de lobby', async () => {
    const host = await connect();
    const session = await create(host);
    const guest = await connect();
    const joined = await ack((reply) =>
      guest.emit('room:join', { code: session.code, name: 'Amiga' }, reply),
    );
    if (!joined.ok || !joined.session) throw new Error('No session');
    const received = view(guest);
    await ack((reply) => host.emit('room:leave', reply));
    const room = await received;
    expect(room.hostId).toBe(joined.session.playerId);
    expect(room.seats).toHaveLength(1);
    expect((await ack((reply) => guest.emit('game:start', reply))).ok).toBe(true);
  });
  it('permite demo con bots y sus turnos avanzan automáticamente', async () => {
    const client = await connect();
    const initial = view(client);
    const session = await create(client, true);
    const room = await initial;
    expect(room.seats.filter((s) => s.bot)).toHaveLength(2);
    expect(room.game?.phase).toBe('playing');
    const internal = server.rooms.get(session.code)!;
    // Si el repartidor aleatorio deja al humano primero, dejamos pasar su turno.
    if (internal.game?.turnId === session.playerId && !internal.game.pending) {
      await ack((reply) => client.emit('game:action', { type: 'stand' }, reply));
    }
    await expect
      .poll(() => internal.game?.log.some((entry) => entry.text.includes('Bot saca')), {
        timeout: 3000,
      })
      .toBe(true);
  });
});
