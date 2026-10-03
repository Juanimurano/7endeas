import type { GameAction, GameView } from '../../engine/src/index';

export interface Seat {
  id: string;
  name: string;
  bot: boolean;
  connected: boolean;
}
export interface RoomView {
  code: string;
  hostId: string;
  seats: Seat[];
  game: GameView | null;
  serverTime: number;
  roundRecap: RoundRecap | null;
}
export interface RoundRecap {
  id: string;
  round: number;
  durationMs: number;
  nextRoundAt: number | null;
}
export interface Session {
  code: string;
  playerId: string;
  token: string;
}
export type Reply = { ok: true; session?: Session } | { ok: false; error: string };
export type Ack = (reply: Reply) => void;
export interface ClientEvents {
  'room:create': (data: { name: string; demo?: boolean }, ack: Ack) => void;
  'room:join': (data: { name: string; code: string }, ack: Ack) => void;
  'room:resume': (data: Session, ack: Ack) => void;
  'room:leave': (ack: Ack) => void;
  'room:bot': (data: { removeId?: string }, ack: Ack) => void;
  'game:start': (ack: Ack) => void;
  'game:action': (data: GameAction, ack: Ack) => void;
  'game:restart': (ack: Ack) => void;
  'round:ready': (data: { recapId: string }, ack: Ack) => void;
}
export interface ServerEvents {
  'room:view': (view: RoomView) => void;
  'session:replaced': () => void;
}
