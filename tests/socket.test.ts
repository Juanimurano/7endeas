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

async function pairedRoom() {
  const host = await connect();
  const session = await create(host);
  const guest = await connect();
  const joined = await ack((reply) =>
    guest.emit('room:join', { code: session.code, name: 'Invitada' }, reply),
  );
  if (!joined.ok || !joined.session) throw new Error('No session');
  await ack((reply) => host.emit('game:start', reply));
  const room = server.rooms.get(session.code)!;
  const seats = new Map([
    [session.playerId, host],
    [joined.session.playerId, guest],
  ]);
  async function finishRound() {
    while (room.game!.phase === 'playing') {
      const client = seats.get(room.game!.turnId!)!;
      expect((await ack((reply) => client.emit('game:action', { type: 'stand' }, reply))).ok).toBe(
        true,
      );
    }
  }
  return { host, guest, session, guestSession: joined.session, room, finishRound };
}

beforeEach(async () => {
  clients = [];
  server = await createServer({
    botDelay: 10,
    reconnectGrace: 20,
    recapDuration: 160,
    recapGrace: 500,
  });
  url = await server.app.listen({ port: 0, host: '127.0.0.1' });
});

describe('Resumen y avance automático', () => {
  it('sincroniza un único plazo y pasa de ronda sin un botón del anfitrión', async () => {
    const { host, guest, room, finishRound } = await pairedRoom();
    await finishRound();
    const recap = room.roundRecap!;
    expect(recap.nextRoundAt).toBeNull();
    expect((await ack((reply) => host.emit('game:action', { type: 'nextRound' }, reply))).ok).toBe(
      false,
    );
    await ack((reply) => host.emit('round:ready', { recapId: 'stale' }, reply));
    expect(room.roundRecap!.nextRoundAt).toBeNull();
    await ack((reply) => host.emit('round:ready', { recapId: recap.id }, reply));
    expect(room.roundRecap!.nextRoundAt).toBeNull();
    const started = view(host);
    await ack((reply) => guest.emit('round:ready', { recapId: recap.id }, reply));
    const visible = await started;
    expect(visible.roundRecap?.durationMs).toBe(160);
    expect(visible.roundRecap!.nextRoundAt! - visible.serverTime).toBeGreaterThan(140);
    expect(visible.game?.players.every((player) => player.roundScore === 0)).toBe(true);
    await expect.poll(() => room.game?.round).toBe(2);
    expect(room.game?.phase).toBe('playing');
    expect(room.roundRecap).toBeNull();
  });
  it('una reconexión y las confirmaciones repetidas no reinician la cuenta', async () => {
    const { host, guest, guestSession, room, finishRound } = await pairedRoom();
    await finishRound();
    const recapId = room.roundRecap!.id;
    await ack((reply) => host.emit('round:ready', { recapId }, reply));
    await ack((reply) => guest.emit('round:ready', { recapId }, reply));
    const deadline = room.roundRecap!.nextRoundAt;
    guest.disconnect();
    const resumed = await connect();
    const received = view(resumed);
    await ack((reply) => resumed.emit('room:resume', guestSession, reply));
    expect((await received).roundRecap?.nextRoundAt).toBe(deadline);
    await ack((reply) => resumed.emit('round:ready', { recapId }, reply));
    expect(room.roundRecap!.nextRoundAt).toBe(deadline);
    await expect.poll(() => room.game?.round).toBe(2);
  });
  it('los clientes que no confirman no bloquean el avance automático', async () => {
    const client = await connect();
    const session = await create(client);
    await ack((reply) => client.emit('game:start', reply));
    await ack((reply) => client.emit('game:action', { type: 'stand' }, reply));
    const room = server.rooms.get(session.code)!;
    expect(room.roundRecap!.nextRoundAt).toBeNull();
    await expect.poll(() => room.game?.round, { timeout: 2000 }).toBe(2);
  });
  it('pausa cuando no hay humanos conectados y continúa al recuperar la sesión', async () => {
    const client = await connect();
    const session = await create(client);
    await ack((reply) => client.emit('game:start', reply));
    await ack((reply) => client.emit('game:action', { type: 'stand' }, reply));
    const room = server.rooms.get(session.code)!;
    const recapId = room.roundRecap!.id;
    await ack((reply) => client.emit('round:ready', { recapId }, reply));
    client.disconnect();
    await expect.poll(() => room.roundRecap?.nextRoundAt).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(room.game?.round).toBe(1);
    const resumed = await connect();
    await ack((reply) => resumed.emit('room:resume', session, reply));
    await ack((reply) => resumed.emit('round:ready', { recapId }, reply));
    await expect.poll(() => room.game?.round).toBe(2);
  });
  it('un ganador se anuncia sin resumen ni temporizador de siguiente ronda', async () => {
    const client = await connect();
    const session = await create(client);
    await ack((reply) => client.emit('game:start', reply));
    const room = server.rooms.get(session.code)!;
    const index = room.game!.drawPile.findIndex(
      (card) => card.kind === 'number' && card.value === 2,
    );
    room.game!.players[0].cards = [room.game!.drawPile.splice(index, 1)[0]];
    room.game!.players[0].score = 199;
    const finalView = view(client);
    await ack((reply) => client.emit('game:action', { type: 'stand' }, reply));
    const summary = await finalView;
    expect(summary.game?.players[0].roundScore).toBe(2);
    expect(summary.game?.players[0].score).toBe(201);
    expect(summary.roundRecap).toBeNull();
    expect(room.roundRecap).toBeNull();
    expect(room.timer).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(room.game?.phase).toBe('finished');
    expect(room.game?.round).toBe(1);
    expect(room.game?.players[0].score).toBe(201);
    expect((await ack((reply) => client.emit('game:restart', reply))).ok).toBe(true);
  });
  it('un empate a 200 puntos avanza automáticamente a una ronda de desempate', async () => {
    const { host, guest, room, finishRound } = await pairedRoom();
    for (const player of room.game!.players) {
      const index = room.game!.drawPile.findIndex(
        (card) => card.kind === 'number' && card.value === 5,
      );
      player.cards = [room.game!.drawPile.splice(index, 1)[0]];
      player.score = 195;
    }
    await finishRound();
    expect(room.game?.winnerId).toBeNull();
    const recapId = room.roundRecap!.id;
    await ack((reply) => host.emit('round:ready', { recapId }, reply));
    await ack((reply) => guest.emit('round:ready', { recapId }, reply));
    await expect.poll(() => room.game?.round).toBe(2);
    expect(
      room.game?.players.every((player) => player.score === 200 && player.status === 'active'),
    ).toBe(true);
  });
});
afterEach(async () => {
  for (const client of clients) client.disconnect();
  await server.app.close();
});

describe('Salas Socket.IO', () => {
  it('cierra el servidor aunque haya clientes WebSocket conectados', async () => {
    const client = await connect();
    await create(client);
    await server.app.close();
    await expect.poll(() => client.connected).toBe(false);
  });
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
