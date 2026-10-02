import { describe, expect, it } from 'vitest';
import {
  createDeck,
  createGame,
  dispatch,
  projectView,
  type Card,
} from '../packages/engine/src/index';

function setup(count = 1) {
  const game = createGame(
    Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `Jugador ${i}`,
      bot: false,
      connected: true,
    })),
    () => 0.1,
  );
  game.turnId = 'p0';
  return game;
}
const special = (kind: 'draw3' | 'freeze' | 'life', id: string = kind): Card => ({ id, kind });
const number = (value: number, id: string): Card => ({ id, kind: 'number', value });

describe('Eventos de cartas especiales', () => {
  it('conserva todas las cartas de un robo múltiple, incluso una vida descartada', () => {
    let game = setup();
    game.drawPile = [
      special('freeze'),
      special('life', 'life2'),
      special('life', 'life1'),
      special('draw3'),
    ];
    game = dispatch(game, 'p0', { type: 'hit' });
    game = dispatch(game, 'p0', { type: 'target', targetId: 'p0' });
    expect(game.cardEvents.map((e) => [e.card.kind, e.outcome])).toEqual([
      ['draw3', 'played'],
      ['life', 'held'],
      ['life', 'discarded'],
      ['freeze', 'pending'],
    ]);
    expect(new Set(game.cardEvents.map((e) => e.id)).size).toBe(4);
    expect(projectView(game).cardEvents).toEqual(game.cardEvents);
  });
  it('registra una vida que se usa inmediatamente dentro de Saca tres', () => {
    let game = setup();
    game.players[0].cards = [number(12, 'held-12')];
    game.drawPile = [
      number(5, 'five'),
      number(12, 'duplicate-12'),
      special('life'),
      special('draw3'),
    ];
    game = dispatch(game, 'p0', { type: 'hit' });
    game = dispatch(game, 'p0', { type: 'target', targetId: 'p0' });
    expect(game.cardEvents.find((e) => e.card.kind === 'life')?.outcome).toBe('used');
    expect(game.players[0].status).toBe('active');
  });
  it('distingue el jugador que roba una acción del jugador afectado', () => {
    let game = setup(2);
    game.drawPile = [special('freeze')];
    game = dispatch(game, 'p0', { type: 'hit' });
    game = dispatch(game, 'p0', { type: 'target', targetId: 'p1' });
    expect(game.cardEvents.map((e) => [e.playerId, e.reason, e.outcome])).toEqual([
      ['p0', 'draw', 'played'],
      ['p1', 'effect', 'played'],
    ]);
  });
  it('avisa al receptor de una vida regalada y marca la acción del donante', () => {
    let game = setup(2);
    game.players[0].cards = [special('life', 'first')];
    game.drawPile = [special('life', 'second')];
    game = dispatch(game, 'p0', { type: 'hit' });
    game = dispatch(game, 'p0', { type: 'target', targetId: 'p1' });
    expect(game.cardEvents.map((e) => [e.playerId, e.reason, e.outcome])).toEqual([
      ['p0', 'draw', 'gifted'],
      ['p1', 'gift', 'held'],
    ]);
  });
  it('marca como canceladas las acciones demoradas si el jugador pierde antes', () => {
    let game = setup();
    game.players[0].cards = [number(12, 'held')];
    game.drawPile = [
      number(2, 'unused'),
      number(12, 'duplicate'),
      special('freeze'),
      special('draw3'),
    ];
    game = dispatch(game, 'p0', { type: 'hit' });
    game = dispatch(game, 'p0', { type: 'target', targetId: 'p0' });
    expect(game.cardEvents.find((e) => e.card.kind === 'freeze')?.outcome).toBe('cancelled');
    expect(game.pending).toBeNull();
  });
  it('las cartas numéricas no generan avisos y los eventos se limpian al cambiar de ronda', () => {
    let game = setup();
    game.drawPile = [number(5, 'five'), ...createDeck().filter((c) => c.kind === 'number')];
    game = dispatch(game, 'p0', { type: 'hit' });
    expect(game.cardEvents).toEqual([]);
    game = dispatch(game, 'p0', { type: 'stand' });
    game = dispatch(game, 'p0', { type: 'nextRound' });
    expect(game.cardEvents).toEqual([]);
  });
});
