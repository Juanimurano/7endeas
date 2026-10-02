import { describe, expect, it } from 'vitest';
import {
  botAction,
  createDeck,
  createGame,
  dispatch,
  numberCount,
  projectView,
  scoreHand,
  type Card,
  type GameState,
} from '../packages/engine/src/index';

let cardId = 0;
const num = (value: number): Card => ({ id: `test-${cardId++}`, kind: 'number', value });
const special = (kind: 'life' | 'draw3' | 'freeze' | 'double'): Card => ({
  id: `test-${cardId++}`,
  kind,
});
const bonus = (value: number): Card => ({ id: `test-${cardId++}`, kind: 'bonus', value });
function setup(count = 2): GameState {
  const state = createGame(
    Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `Jugador ${i}`,
      bot: false,
      connected: true,
    })),
    () => 0.1,
  );
  state.turnId = 'p0';
  return state;
}
function stack(state: GameState, ...cards: Card[]) {
  state.drawPile = [...cards].reverse();
}

describe('Reglas de Flip 7 del PDF', () => {
  it('construye las 94 cartas con las frecuencias correctas', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(94);
    expect(new Set(deck.map((c) => c.id)).size).toBe(94);
    for (let i = 0; i <= 12; i++)
      expect(deck.filter((c) => c.kind === 'number' && c.value === i)).toHaveLength(Math.max(1, i));
    for (const kind of ['freeze', 'draw3', 'life'])
      expect(deck.filter((c) => c.kind === kind)).toHaveLength(3);
    expect(deck.filter((c) => c.kind === 'bonus')).toHaveLength(5);
  });
  it('multiplica solo los números, después agrega mejoras y Flip 7', () => {
    const state = setup();
    const p = state.players[0];
    p.cards = [num(3), num(11), num(5), num(7), num(10), special('double'), bonus(10)];
    expect(scoreHand(p)).toBe(82);
    expect(scoreHand(p, true)).toBe(97);
    p.status = 'busted';
    expect(scoreHand(p, true)).toBe(0);
  });
  it('no modifica el estado anterior y rechaza turnos ajenos', () => {
    const state = setup();
    stack(state, num(8));
    expect(() => dispatch(state, 'p1', { type: 'hit' })).toThrow('No es tu turno');
    const after = dispatch(state, 'p0', { type: 'hit' });
    expect(state.players[0].cards).toHaveLength(0);
    expect(after.players[0].cards).toHaveLength(1);
    expect(after.turnId).toBe('p1');
  });
  it('repetir un número pierde solo los puntos de esa ronda', () => {
    const state = setup();
    state.players[0].score = 40;
    state.players[0].cards = [num(12)];
    stack(state, num(12));
    const after = dispatch(state, 'p0', { type: 'hit' });
    expect(after.players[0].status).toBe('busted');
    expect(after.players[0].score).toBe(40);
    expect(scoreHand(after.players[0])).toBe(0);
  });
  it('usa y descarta Vida extra automáticamente', () => {
    const state = setup();
    state.players[0].cards = [num(8), special('life')];
    stack(state, num(8));
    const after = dispatch(state, 'p0', { type: 'hit' });
    expect(after.players[0].status).toBe('active');
    expect(after.players[0].cards).toHaveLength(1);
    expect(after.roundDiscard).toHaveLength(2);
  });
  it('regala la segunda vida solamente a alguien activo sin vida', () => {
    let state = setup(3);
    state.players[0].cards = [special('life')];
    state.players[2].status = 'stood';
    stack(state, special('life'));
    state = dispatch(state, 'p0', { type: 'hit' });
    expect(state.pending?.eligibleIds).toEqual(['p1']);
    expect(() => dispatch(state, 'p0', { type: 'target', targetId: 'p2' })).toThrow();
    state = dispatch(state, 'p0', { type: 'target', targetId: 'p1' });
    expect(state.players[1].cards[0].kind).toBe('life');
    expect(state.pending).toBeNull();
    expect(state.turnId).toBe('p1');
  });
  it('descarta una segunda vida si todos los activos ya tienen una', () => {
    const state = setup();
    for (const p of state.players) p.cards = [special('life')];
    stack(state, special('life'));
    const after = dispatch(state, 'p0', { type: 'hit' });
    expect(after.pending).toBeNull();
    expect(after.roundDiscard).toHaveLength(1);
  });
  it('el Bloqueo guarda los puntos y admite jugarlo contra uno mismo', () => {
    let state = setup(1);
    state.players[0].cards = [num(12), bonus(4)];
    stack(state, special('freeze'));
    state = dispatch(state, 'p0', { type: 'hit' });
    expect(state.pending?.eligibleIds).toEqual(['p0']);
    state = dispatch(state, 'p0', { type: 'target', targetId: 'p0' });
    expect(state.players[0].status).toBe('frozen');
    expect(state.players[0].score).toBe(16);
    expect(state.phase).toBe('roundEnd');
  });
  it('Saca tres cuenta acciones entre las tres y demora su efecto', () => {
    let state = setup();
    stack(state, special('draw3'), num(2), special('freeze'), num(5));
    state = dispatch(state, 'p0', { type: 'hit' });
    state = dispatch(state, 'p0', { type: 'target', targetId: 'p1' });
    expect(state.players[1].cards.map((c) => (c.kind === 'number' ? c.value : c.kind))).toEqual([
      2, 5,
    ]);
    expect(state.pending?.kind).toBe('freeze');
    expect(state.pending?.actorId).toBe('p1');
    expect(state.drawPile).toHaveLength(0);
    state = dispatch(state, 'p1', { type: 'target', targetId: 'p0' });
    expect(state.players[0].status).toBe('frozen');
    expect(state.turnId).toBe('p1');
  });
  it('si falla en Saca tres no activa las acciones demoradas ni roba más', () => {
    let state = setup();
    state.players[1].cards = [num(12)];
    stack(state, special('draw3'), special('freeze'), num(12), num(4));
    state = dispatch(state, 'p0', { type: 'hit' });
    state = dispatch(state, 'p0', { type: 'target', targetId: 'p1' });
    expect(state.players[1].status).toBe('busted');
    expect(state.pending).toBeNull();
    expect(state.drawPile).toHaveLength(1);
    expect(state.roundDiscard.filter((c) => c.kind === 'freeze')).toHaveLength(1);
  });
  it('Vida extra dentro de Saca tres protege un robo posterior', () => {
    let state = setup();
    state.players[1].cards = [num(12)];
    stack(state, special('draw3'), special('life'), num(12), num(5));
    state = dispatch(state, 'p0', { type: 'hit' });
    state = dispatch(state, 'p0', { type: 'target', targetId: 'p1' });
    expect(state.players[1].status).toBe('active');
    expect(scoreHand(state.players[1])).toBe(17);
    expect(state.roundDiscard).toHaveLength(3);
  });
  it('resuelve cadenas de Saca tres sin adelantar el turno normal', () => {
    let state = setup(3);
    stack(state, special('draw3'), special('draw3'), num(1), num(2), num(3), num(4), num(5));
    state = dispatch(state, 'p0', { type: 'hit' });
    state = dispatch(state, 'p0', { type: 'target', targetId: 'p1' });
    expect(state.pending?.kind).toBe('draw3');
    expect(state.pending?.actorId).toBe('p1');
    state = dispatch(state, 'p1', { type: 'target', targetId: 'p2' });
    expect(numberCount(state.players[2])).toBe(3);
    expect(state.turnId).toBe('p1');
  });
  it('Flip 7 termina de inmediato, cuenta el cero y puntúa a los demás', () => {
    let state = setup(3);
    state.players[0].cards = [0, 1, 2, 3, 4, 5].map(num);
    state.players[1].cards = [num(12)];
    state.players[2].cards = [num(10)];
    state.players[2].status = 'busted';
    stack(state, num(6));
    state = dispatch(state, 'p0', { type: 'hit' });
    expect(state.phase).toBe('roundEnd');
    expect(state.flipSevenId).toBe('p0');
    expect(state.players.map((p) => p.score)).toEqual([36, 12, 0]);
  });
  it('Flip 7 interrumpe Saca tres y conserva acciones demoradas en el descarte', () => {
    let state = setup();
    state.players[1].cards = [0, 1, 2, 3, 4, 5].map(num);
    stack(state, special('draw3'), special('freeze'), num(6), num(12));
    state = dispatch(state, 'p0', { type: 'hit' });
    state = dispatch(state, 'p0', { type: 'target', targetId: 'p1' });
    expect(state.phase).toBe('roundEnd');
    expect(state.pending).toBeNull();
    expect(state.drawPile).toHaveLength(1);
    expect(state.roundDiscard.filter((c) => c.kind === 'freeze')).toHaveLength(1);
  });
  it('mezcla solo los descartes de rondas anteriores', () => {
    const state = setup();
    state.drawPile = [];
    state.discard = [num(3)];
    state.roundDiscard = [special('life')];
    state.players[1].cards = [num(10)];
    const after = dispatch(state, 'p0', { type: 'hit' }, () => 0.1);
    expect(after.players[0].cards[0]).toMatchObject({ kind: 'number', value: 3 });
    expect(after.roundDiscard).toHaveLength(1);
    expect(after.players[1].cards).toHaveLength(1);
  });
  it('la siguiente ronda rota al repartidor y no remezcla el mazo restante', () => {
    let state = setup();
    const unused = state.drawPile.map((c) => c.id);
    state.players[0].cards = [num(8)];
    state.players[1].cards = [num(10)];
    state = dispatch(state, 'p0', { type: 'stand' });
    state = dispatch(state, 'p1', { type: 'stand' });
    const dealer = state.dealerIndex;
    state = dispatch(state, 'p0', { type: 'nextRound' });
    expect(state.round).toBe(2);
    expect(state.dealerIndex).toBe((dealer + 1) % 2);
    expect(state.drawPile.map((c) => c.id)).toEqual(unused);
    expect(state.discard).toHaveLength(2);
    expect(state.players[0].cards).toHaveLength(0);
  });
  it('comprueba victoria al final de la ronda y desempata con todos', () => {
    let state = setup();
    state.players[0].score = 198;
    state.players[0].cards = [num(2)];
    state.players[1].score = 190;
    state.players[1].cards = [num(10)];
    state = dispatch(state, 'p0', { type: 'stand' });
    expect(state.phase).toBe('playing');
    state = dispatch(state, 'p1', { type: 'stand' });
    expect(state.phase).toBe('roundEnd');
    expect(state.winnerId).toBeNull();
    state = dispatch(state, 'p0', { type: 'nextRound' });
    expect(state.players.every((p) => p.status === 'active')).toBe(true);
    state.players[0].cards = [num(1)];
    state = dispatch(state, state.turnId!, { type: 'stand' });
    state = dispatch(state, state.turnId!, { type: 'stand' });
    expect(state.phase).toBe('finished');
    expect(state.winnerId).toBe('p0');
  });
  it('la vista pública no filtra el orden del mazo ni los tokens', () => {
    const view = projectView(setup());
    expect(view).not.toHaveProperty('drawPile');
    expect(view).not.toHaveProperty('tasks');
    expect(view.deckCount).toBe(94);
  });
  it('simula partidas completas y conserva las 94 cartas sin duplicarlas', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let n = seed;
      const rng = () => {
        n = (n * 1664525 + 1013904223) >>> 0;
        return n / 4294967296;
      };
      let state = createGame(
        Array.from({ length: 6 }, (_, i) => ({
          id: `p${i}`,
          name: `Bot ${i}`,
          bot: true,
          connected: true,
        })),
        rng,
      );
      let moves = 0;
      while (state.phase !== 'finished' && moves++ < 10000) {
        const id = state.pending?.actorId ?? state.turnId ?? 'p0';
        state = dispatch(
          state,
          id,
          state.phase === 'roundEnd' ? { type: 'nextRound' } : botAction(state, id),
          rng,
        );
        const cards = [
          ...state.drawPile,
          ...state.discard,
          ...state.roundDiscard,
          ...state.players.flatMap((p) => p.cards),
          ...state.tasks.flatMap((t) => (t.type === 'effect' ? [t.card] : t.deferred)),
          ...(state.pending ? [state.pending.card] : []),
        ];
        expect(cards).toHaveLength(94);
        expect(new Set(cards.map((c) => c.id)).size).toBe(94);
      }
      expect(state.phase).toBe('finished');
    }
  });
});
