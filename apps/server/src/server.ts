import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server, type Socket } from 'socket.io';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  botAction,
  createGame,
  dispatch,
  projectView,
  type GameState,
  type GameAction,
} from '../../../packages/engine/src/index';
import type {
  Ack,
  ClientEvents,
  ServerEvents,
  Seat,
  Session,
} from '../../../packages/protocol/src/index';

interface InternalSeat extends Seat {
  token: string;
  socketId?: string;
  offlineAt?: number;
}
interface Room {
  code: string;
  hostId: string;
  seats: InternalSeat[];
  game: GameState | null;
  touched: number;
  timer?: ReturnType<typeof setTimeout>;
}
type GameSocket = Socket<ClientEvents, ServerEvents>;
const BOT_NAMES = [
  'Lola Bot',
  'Nico Bot',
  'Vera Bot',
  'Teo Bot',
  'Mora Bot',
  'Rafa Bot',
  'Luz Bot',
  'Leo Bot',
  'Alma Bot',
  'Iván Bot',
  'Sol Bot',
];

export async function createServer(
  options: {
    staticRoot?: string;
    botDelay?: number;
    reconnectGrace?: number;
    logger?: boolean;
  } = {},
) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 16384 });
  const io = new Server<ClientEvents, ServerEvents>(app.server, { maxHttpBufferSize: 16384 });
  const rooms = new Map<string, Room>();
  const bindings = new Map<string, { room: Room; seat: InternalSeat }>();
  const grace = options.reconnectGrace ?? 45000;
  const delay = options.botDelay ?? 1100;
  const root = options.staticRoot ?? resolve(process.env.WEB_DIST_DIR ?? 'dist/web');
  if (existsSync(root)) await app.register(fastifyStatic, { root, prefix: '/' });
  app.get('/health', async () => ({ ok: true, rooms: rooms.size }));

  function broadcast(room: Room) {
    room.touched = Date.now();
    if (room.game)
      for (const p of room.game.players)
        p.connected = room.seats.find((s) => s.id === p.id)?.connected ?? false;
    io.to(room.code).emit('room:view', {
      code: room.code,
      hostId: room.hostId,
      seats: room.seats.map(({ id, name, bot, connected }) => ({ id, name, bot, connected })),
      game: room.game ? projectView(room.game) : null,
    });
    schedule(room);
  }
  function run(room: Room, id: string, action: GameAction) {
    if (!room.game) throw new Error('La partida no empezó.');
    room.game = dispatch(room.game, id, action);
    broadcast(room);
  }
  function schedule(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    const game = room.game;
    if (!game || game.phase !== 'playing') return;
    const id = game.pending?.actorId ?? game.turnId;
    const seat = room.seats.find((s) => s.id === id);
    if (!seat || (!seat.bot && seat.connected)) return;
    const wait = seat.bot
      ? delay
      : Math.max(100, grace - (Date.now() - (seat.offlineAt ?? Date.now())));
    room.timer = setTimeout(() => {
      try {
        if (!room.game) return;
        const action = room.game.pending
          ? botAction(room.game, seat.id)
          : seat.bot
            ? botAction(room.game, seat.id)
            : { type: 'stand' as const };
        run(room, seat.id, action);
      } catch (error) {
        app.log.error(error);
      }
    }, wait);
    room.timer.unref();
  }
  function current(socket: GameSocket) {
    const binding = bindings.get(socket.id);
    if (!binding) throw new Error('Primero entrá a una sala.');
    return binding;
  }
  function requireHost(socket: GameSocket) {
    const binding = current(socket);
    if (binding.room.hostId !== binding.seat.id)
      throw new Error('Solo el anfitrión puede hacer esto.');
    return binding;
  }
  function name(input: unknown) {
    if (typeof input !== 'string' || !input.trim() || input.trim().length > 20)
      throw new Error('Usá un nombre de entre 1 y 20 caracteres.');
    return input.trim();
  }
  function addBot(room: Room) {
    if (room.seats.length >= 12) throw new Error('La sala está llena (12 jugadores).');
    const botName = BOT_NAMES.find((n) => !room.seats.some((s) => s.name === n)) ?? 'Bot';
    room.seats.push({ id: randomUUID(), token: '', name: botName, bot: true, connected: true });
  }
  function bind(socket: GameSocket, room: Room, seat: InternalSeat): Session {
    if (bindings.has(socket.id)) throw new Error('Ya estás en una sala.');
    if (seat.socketId && seat.socketId !== socket.id) {
      const old = io.sockets.sockets.get(seat.socketId);
      bindings.delete(seat.socketId);
      old?.emit('session:replaced');
      old?.leave(room.code);
    }
    seat.connected = true;
    seat.socketId = socket.id;
    seat.offlineAt = undefined;
    bindings.set(socket.id, { room, seat });
    socket.join(room.code);
    return { code: room.code, playerId: seat.id, token: seat.token };
  }
  function detach(socket: GameSocket, leave = false) {
    const binding = bindings.get(socket.id);
    if (!binding) return;
    const { room, seat } = binding;
    bindings.delete(socket.id);
    socket.leave(room.code);
    seat.connected = false;
    seat.socketId = undefined;
    seat.offlineAt = leave ? Date.now() - grace : Date.now();
    if (leave && !room.game) room.seats = room.seats.filter((s) => s.id !== seat.id);
    if (room.hostId === seat.id)
      room.hostId = room.seats.find((s) => !s.bot && s.connected)?.id ?? seat.id;
    broadcast(room);
  }

  io.on('connection', (socket) => {
    let windowStart = Date.now();
    let count = 0;
    function attempt(ack: Ack, work: () => Session | void) {
      if (typeof ack !== 'function') return;
      try {
        if (Date.now() - windowStart > 10000) {
          windowStart = Date.now();
          count = 0;
        }
        if (++count > 50) throw new Error('Demasiadas acciones. Esperá unos segundos.');
        const session = work();
        ack({ ok: true, ...(session ? { session } : {}) });
      } catch (error) {
        ack({
          ok: false,
          error: error instanceof Error ? error.message : 'No se pudo realizar la acción.',
        });
      }
    }
    socket.on('room:create', (data, ack) =>
      attempt(ack, () => {
        if (bindings.has(socket.id)) throw new Error('Ya estás en una sala.');
        if (rooms.size >= 500) throw new Error('El servidor está lleno. Probá más tarde.');
        const playerName = name(data?.name);
        let code: string;
        do {
          code = Array.from(randomBytes(5), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 31]).join(
            '',
          );
        } while (rooms.has(code));
        const seat: InternalSeat = {
          id: randomUUID(),
          token: randomBytes(24).toString('hex'),
          name: playerName,
          bot: false,
          connected: true,
        };
        const room: Room = {
          code,
          hostId: seat.id,
          seats: [seat],
          game: null,
          touched: Date.now(),
        };
        rooms.set(code, room);
        const session = bind(socket, room, seat);
        if (data.demo) {
          addBot(room);
          addBot(room);
          room.game = createGame(room.seats);
        }
        broadcast(room);
        return session;
      }),
    );
    socket.on('room:join', (data, ack) =>
      attempt(ack, () => {
        if (bindings.has(socket.id)) throw new Error('Ya estás en una sala.');
        const room = rooms.get(
          typeof data?.code === 'string' ? data.code.trim().toUpperCase() : '',
        );
        if (!room) throw new Error('No encontramos esa sala. Revisá el código.');
        if (room.game) throw new Error('La partida ya empezó. Podés entrar en una sala nueva.');
        if (room.seats.length >= 12) throw new Error('La sala está llena.');
        const seat: InternalSeat = {
          id: randomUUID(),
          token: randomBytes(24).toString('hex'),
          name: name(data.name),
          bot: false,
          connected: true,
        };
        room.seats.push(seat);
        const session = bind(socket, room, seat);
        if (!room.seats.some((s) => s.id === room.hostId && s.connected && !s.bot))
          room.hostId = seat.id;
        broadcast(room);
        return session;
      }),
    );
    socket.on('room:resume', (data, ack) =>
      attempt(ack, () => {
        const room = rooms.get(data?.code);
        const seat = room?.seats.find(
          (s) => s.id === data?.playerId && s.token === data?.token && !s.bot,
        );
        if (!room || !seat) throw new Error('La sesión expiró. Creá una sala o volvé a entrar.');
        const session = bind(socket, room, seat);
        if (!room.seats.some((s) => s.id === room.hostId && s.connected && !s.bot))
          room.hostId = seat.id;
        broadcast(room);
        return session;
      }),
    );
    socket.on('room:leave', (ack) => attempt(ack, () => detach(socket, true)));
    socket.on('room:bot', (data, ack) =>
      attempt(ack, () => {
        const { room } = requireHost(socket);
        if (room.game) throw new Error('Los bots se agregan antes de empezar.');
        if (data?.removeId) room.seats = room.seats.filter((s) => !s.bot || s.id !== data.removeId);
        else addBot(room);
        broadcast(room);
      }),
    );
    socket.on('game:start', (ack) =>
      attempt(ack, () => {
        const { room } = requireHost(socket);
        if (room.game) throw new Error('La partida ya empezó.');
        room.game = createGame(room.seats);
        broadcast(room);
      }),
    );
    socket.on('game:action', (data, ack) =>
      attempt(ack, () => {
        const { room, seat } = current(socket);
        if (!data || !['hit', 'stand', 'target', 'nextRound'].includes(data.type))
          throw new Error('Acción inválida.');
        if (data.type === 'nextRound') requireHost(socket);
        run(room, seat.id, data);
      }),
    );
    socket.on('game:restart', (ack) =>
      attempt(ack, () => {
        const { room } = requireHost(socket);
        if (room.game?.phase !== 'finished') throw new Error('La partida no terminó.');
        room.seats = room.seats.filter((s) => s.connected || s.bot);
        room.game = null;
        broadcast(room);
      }),
    );
    socket.on('disconnect', () => detach(socket));
  });

  const cleanup = setInterval(() => {
    for (const [code, room] of rooms) {
      if (
        !room.seats.some((s) => !s.bot && s.connected) &&
        Date.now() - room.touched > 30 * 60 * 1000
      ) {
        if (room.timer) clearTimeout(room.timer);
        rooms.delete(code);
      }
    }
  }, 60000);
  cleanup.unref();
  app.addHook('onClose', async () => {
    clearInterval(cleanup);
    for (const room of rooms.values()) if (room.timer) clearTimeout(room.timer);
    io.close();
  });
  return { app, io, rooms };
}
