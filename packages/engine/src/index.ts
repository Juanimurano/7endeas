export type Card =
  | { id: string; kind: 'number'; value: number }
  | { id: string; kind: 'bonus'; value: number }
  | { id: string; kind: 'double' | 'freeze' | 'draw3' | 'life' };
export type PlayerStatus = 'active' | 'stood' | 'busted' | 'frozen';
export interface Player {
  id: string;
  name: string;
  bot: boolean;
  connected: boolean;
  score: number;
  roundScore: number;
  status: PlayerStatus;
  cards: Card[];
}
type ActionCard = Extract<Card, { kind: 'double' | 'freeze' | 'draw3' | 'life' }>;
type Task =
  | { type: 'draw'; playerId: string; remaining: number; deferred: ActionCard[] }
  | { type: 'effect'; playerId: string; card: ActionCard };
export interface Pending {
  actorId: string;
  kind: 'freeze' | 'draw3' | 'life';
  card: Card;
  eligibleIds: string[];
}
export interface GameState {
  phase: 'playing' | 'roundEnd' | 'finished';
  players: Player[];
  round: number;
  dealerIndex: number;
  turnId: string | null;
  drawPile: Card[];
  discard: Card[];
  roundDiscard: Card[];
  tasks: Task[];
  pending: Pending | null;
  flipSevenId: string | null;
  winnerId: string | null;
  targetScore: number;
  log: { id: number; text: string }[];
  sequence: number;
}
export type GameAction =
  { type: 'hit' | 'stand' | 'nextRound' } | { type: 'target'; targetId: string };
export type GameView = Omit<GameState, 'drawPile' | 'discard' | 'roundDiscard' | 'tasks'> & {
  deckCount: number;
  discardCount: number;
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  const add = (card: Omit<Card, 'id'>) => deck.push({ ...card, id: `card-${deck.length}` } as Card);
  for (let value = 0; value <= 12; value++) {
    for (let count = 0; count < Math.max(1, value); count++) add({ kind: 'number', value } as Card);
  }
  for (const value of [2, 4, 6, 8, 10]) add({ kind: 'bonus', value } as Card);
  add({ kind: 'double' });
  for (const kind of ['freeze', 'draw3', 'life'] as const)
    for (let i = 0; i < 3; i++) add({ kind });
  return deck;
}

export function shuffle<T>(items: T[], rng = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function numberCount(player: Player): number {
  return new Set(player.cards.filter((c) => c.kind === 'number').map((c) => c.value)).size;
}
export function scoreHand(player: Player, flipSeven = false): number {
  if (player.status === 'busted') return 0;
  const sum = player.cards.reduce((n, c) => n + (c.kind === 'number' ? c.value : 0), 0);
  const bonuses = player.cards.reduce((n, c) => n + (c.kind === 'bonus' ? c.value : 0), 0);
  return (
    sum * (player.cards.some((c) => c.kind === 'double') ? 2 : 1) + bonuses + (flipSeven ? 15 : 0)
  );
}

function note(state: GameState, text: string) {
  state.log.push({ id: ++state.sequence, text });
  state.log = state.log.slice(-60);
}
function playerById(state: GameState, id: string) {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new Error('Jugador inexistente.');
  return player;
}

export function createGame(
  seats: Pick<Player, 'id' | 'name' | 'bot' | 'connected'>[],
  rng = Math.random,
): GameState {
  if (seats.length < 1 || seats.length > 12) throw new Error('La sala admite de 1 a 12 jugadores.');
  const dealerIndex = Math.floor(rng() * seats.length);
  const state: GameState = {
    phase: 'playing',
    players: seats.map(({ id, name, bot, connected }) => ({
      id,
      name,
      bot,
      connected,
      score: 0,
      roundScore: 0,
      status: connected || bot ? 'active' : 'stood',
      cards: [],
    })),
    round: 1,
    dealerIndex,
    turnId: null,
    drawPile: shuffle(createDeck(), rng),
    discard: [],
    roundDiscard: [],
    tasks: [],
    pending: null,
    flipSevenId: null,
    winnerId: null,
    targetScore: 200,
    log: [],
    sequence: 0,
  };
  note(state, '¡Empieza la partida! La meta son 200 puntos.');
  advanceTurn(state, dealerIndex);
  return state;
}

function finishRound(state: GameState) {
  if (state.phase !== 'playing') return;
  state.turnId = null;
  // Las acciones pendientes también son cartas usadas, incluso si un Flip 7 interrumpe la cadena.
  for (const task of state.tasks)
    state.roundDiscard.push(...(task.type === 'effect' ? [task.card] : task.deferred));
  if (state.pending) state.roundDiscard.push(state.pending.card);
  state.tasks = [];
  state.pending = null;
  for (const player of state.players) {
    player.roundScore = scoreHand(player, player.id === state.flipSevenId);
    player.score += player.roundScore;
  }
  const ranking = [...state.players].sort((a, b) => b.score - a.score);
  const high = ranking[0].score;
  if (high >= state.targetScore && (ranking.length === 1 || high > ranking[1].score)) {
    state.phase = 'finished';
    state.winnerId = ranking[0].id;
    note(state, `${ranking[0].name} gana la partida con ${high} puntos.`);
  } else {
    state.phase = 'roundEnd';
    note(
      state,
      high >= state.targetScore
        ? '¡Empate en la cabeza! Todos juegan otra ronda para desempatar.'
        : `Fin de la ronda ${state.round}. Puntos guardados.`,
    );
  }
}

function advanceTurn(state: GameState, afterIndex: number) {
  if (!state.players.some((p) => p.status === 'active')) {
    finishRound(state);
    return;
  }
  for (let step = 1; step <= state.players.length; step++) {
    const p = state.players[(afterIndex + step) % state.players.length];
    if (p.status === 'active') {
      state.turnId = p.id;
      return;
    }
  }
}

function draw(state: GameState, rng: () => number): Card {
  if (!state.drawPile.length) {
    state.drawPile = shuffle(state.discard, rng);
    state.discard = [];
    note(state, 'Se mezcla el descarte de rondas anteriores.');
  }
  const card = state.drawPile.pop();
  if (!card) throw new Error('No quedan cartas disponibles para robar.');
  return card;
}

export function cardLabel(card: Card): string {
  if (card.kind === 'number') return String(card.value);
  if (card.kind === 'bonus') return `+${card.value}`;
  return { double: '×2', freeze: 'Bloqueo', draw3: 'Saca tres', life: 'Vida extra' }[card.kind];
}

function setEffect(state: GameState, actor: Player, card: ActionCard) {
  const eligible = state.players.filter(
    (p) =>
      p.status === 'active' && (card.kind !== 'life' || !p.cards.some((c) => c.kind === 'life')),
  );
  if (!eligible.length) {
    state.roundDiscard.push(card);
    return;
  }
  state.pending = {
    actorId: actor.id,
    kind: card.kind as Pending['kind'],
    card,
    eligibleIds: eligible.map((p) => p.id),
  };
}

function receive(
  state: GameState,
  player: Player,
  card: Card,
  batch: Extract<Task, { type: 'draw' }>,
) {
  note(state, `${player.name} saca ${cardLabel(card)}.`);
  if (card.kind === 'number') {
    if (player.cards.some((c) => c.kind === 'number' && c.value === card.value)) {
      const life = player.cards.findIndex((c) => c.kind === 'life');
      if (life >= 0) {
        state.roundDiscard.push(...player.cards.splice(life, 1), card);
        note(state, `${player.name} usa Vida extra y sigue en la ronda.`);
      } else {
        player.cards.push(card);
        player.status = 'busted';
        note(state, `${player.name} repite el ${card.value}: pierde los puntos de esta ronda.`);
      }
    } else {
      player.cards.push(card);
      if (numberCount(player) === 7) {
        state.flipSevenId = player.id;
        note(state, `¡FLIP 7 de ${player.name}! +15 puntos y termina la ronda.`);
        finishRound(state);
      }
    }
  } else if (card.kind === 'life') {
    if (player.cards.some((c) => c.kind === 'life')) setEffect(state, player, card);
    else player.cards.push(card);
  } else if (card.kind === 'freeze' || card.kind === 'draw3') {
    // La carta de acción también cuenta como una de las tres cartas robadas.
    batch.deferred.push(card);
  } else player.cards.push(card);
}

function processTasks(state: GameState, rng: () => number) {
  while (state.phase === 'playing' && !state.pending && state.tasks.length) {
    const task = state.tasks[0];
    const player = playerById(state, task.playerId);
    if (task.type === 'effect') {
      state.tasks.shift();
      setEffect(state, player, task.card);
      continue;
    }
    if (player.status !== 'active' || task.remaining === 0) {
      state.tasks.shift();
      if (player.status !== 'busted')
        state.tasks.unshift(
          ...task.deferred.map((card) => ({ type: 'effect' as const, playerId: player.id, card })),
        );
      else state.roundDiscard.push(...task.deferred);
      continue;
    }
    task.remaining--;
    receive(state, player, draw(state, rng), task);
  }
  if (state.phase === 'playing' && !state.pending && !state.tasks.length) {
    advanceTurn(
      state,
      state.players.findIndex((p) => p.id === state.turnId),
    );
  }
}

export function dispatch(
  previous: GameState,
  actorId: string,
  action: GameAction,
  rng = Math.random,
): GameState {
  const state = structuredClone(previous);
  const actor = playerById(state, actorId);
  if (action.type === 'nextRound') {
    if (state.phase !== 'roundEnd') throw new Error('La ronda todavía no terminó.');
    state.discard.push(...state.roundDiscard, ...state.players.flatMap((p) => p.cards));
    state.roundDiscard = [];
    state.round++;
    state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
    state.flipSevenId = null;
    state.phase = 'playing';
    for (const p of state.players) {
      p.cards = [];
      p.roundScore = 0;
      p.status = p.connected || p.bot ? 'active' : 'stood';
    }
    note(state, `Ronda ${state.round}. Reparte ${state.players[state.dealerIndex].name}.`);
    advanceTurn(state, state.dealerIndex);
    return state;
  }
  if (state.phase !== 'playing') throw new Error('No hay una ronda en curso.');
  if (action.type === 'target') {
    const pending = state.pending;
    if (!pending || pending.actorId !== actorId)
      throw new Error('No te corresponde elegir el objetivo.');
    if (!pending.eligibleIds.includes(action.targetId))
      throw new Error('Elegí un jugador activo válido.');
    const target = playerById(state, action.targetId);
    state.pending = null;
    if (pending.kind === 'life') {
      target.cards.push(pending.card);
      note(state, `${actor.name} da una Vida extra a ${target.name}.`);
    } else {
      state.roundDiscard.push(pending.card);
      if (pending.kind === 'freeze') {
        target.status = 'frozen';
        note(state, `${actor.name} bloquea a ${target.name}, que asegura sus puntos.`);
      } else {
        note(state, `${actor.name} obliga a ${target.name} a sacar tres cartas.`);
        state.tasks.unshift({ type: 'draw', playerId: target.id, remaining: 3, deferred: [] });
      }
    }
    processTasks(state, rng);
    return state;
  }
  if (state.pending) throw new Error('Primero hay que resolver la carta de acción.');
  if (state.turnId !== actorId || actor.status !== 'active') throw new Error('No es tu turno.');
  if (action.type === 'stand') {
    actor.status = 'stood';
    note(state, `${actor.name} se planta con ${scoreHand(actor)} puntos.`);
    advanceTurn(state, state.players.indexOf(actor));
  } else if (action.type === 'hit') {
    state.tasks.push({ type: 'draw', playerId: actorId, remaining: 1, deferred: [] });
    processTasks(state, rng);
  } else throw new Error('Acción desconocida.');
  return state;
}

export function projectView(state: GameState): GameView {
  const { drawPile, discard, roundDiscard, tasks: _tasks, ...view } = state;
  return structuredClone({ ...view, deckCount: drawPile.length, discardCount: discard.length });
}

export function botAction(state: GameState, id: string): GameAction {
  const player = playerById(state, id);
  if (state.pending?.actorId === id) {
    const eligible = state.pending.eligibleIds.map((target) => playerById(state, target));
    eligible.sort((a, b) =>
      state.pending?.kind === 'life'
        ? a.score - b.score
        : b.score + scoreHand(b) - a.score - scoreHand(a),
    );
    const others = eligible.filter((p) => p.id !== id);
    return {
      type: 'target',
      targetId: (state.pending.kind === 'life' ? eligible : others.length ? others : eligible)[0]
        .id,
    };
  }
  const hasLife = player.cards.some((c) => c.kind === 'life');
  return {
    type:
      scoreHand(player) >= (hasLife ? 48 : 30) || numberCount(player) >= (hasLife ? 6 : 5)
        ? 'stand'
        : 'hit',
  };
}
