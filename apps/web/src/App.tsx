import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  Heart,
  HelpCircle,
  Layers,
  LogOut,
  LockKeyhole,
  Plus,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  X,
  Bot,
  WifiOff,
} from 'lucide-react';
import {
  cardLabel,
  numberCount,
  scoreHand,
  type Player,
  type GameView,
} from '../../../packages/engine/src/index';
import type { RoomView } from '../../../packages/protocol/src/index';
import Card, { ArtContext, PrintedArtContext } from './Card';
import CardRevealDialog from './CardRevealDialog';
import { useSpecialCardReveals } from './useSpecialCardReveals';
import WinnerCelebration from './WinnerCelebration';
import { useWinnerCelebration } from './useWinnerCelebration';
import RoundRecapDialog from './RoundRecapDialog';
import { useRoundRecapReady } from './useRoundRecapReady';
import Modal from './Modal';
import { useGame } from './useGame';

type Connection = ReturnType<typeof useGame>;
const statusLabel = {
  active: 'En juego',
  stood: 'Se plantó',
  busted: 'Número repetido',
  frozen: 'No endeas · bloqueado',
};

function Brand() {
  return (
    <div className="brand" role="img" aria-label="7 endeas">
      <span className="brand-mark">7</span>
      <span>
        endeas
        <span className="brand-dot">.</span>
      </span>
    </div>
  );
}

function Rules({
  close,
  returnFocusTo,
}: {
  close: () => void;
  returnFocusTo?: HTMLElement | null;
}) {
  return (
    <Modal
      className="rules-dialog"
      labelledBy="rules-title"
      onDismiss={close}
      dismissOnBackdrop
      returnFocusTo={returnFocusTo}
    >
      <button className="icon-button close-dialog" onClick={close} aria-label="Cerrar reglas">
        <X />
      </button>
      <p className="eyebrow">UN MINUTO Y A JUGAR</p>
      <h2 id="rules-title">¿Endeás una más o te plantás?</h2>
      <p>
        En tu turno, pedí una carta o plantate para asegurar lo que llevás. La meta es llegar a{' '}
        <strong>200 puntos</strong>.
      </p>
      <div className="rule-list">
        <div>
          <Layers />
          <p>
            <strong>Los números suman.</strong> Hay un 0, un 1, dos 2… y doce 12. Los números altos
            se repiten más.
          </p>
        </div>
        <div>
          <X />
          <p>
            <strong>Si repetís, perdés la ronda.</strong> Tus puntos de rondas anteriores siguen a
            salvo.
          </p>
        </div>
        <div>
          <Sparkles />
          <p>
            <strong>Siete números distintos = ¡7 endeas!</strong> Ganás 15 extra y la ronda termina
            para todos. El 0 también cuenta.
          </p>
        </div>
        <div>
          <Heart />
          <p>
            <strong>Otra endea (vida extra).</strong> Descartá un número repetido y la vida; seguís
            jugando. Solo una vida por persona. La segunda se regala a alguien activo sin vida.
          </p>
        </div>
        <div>
          <LockKeyhole />
          <p>
            <strong>No endeas (bloqueo).</strong> Sacá de la ronda a un jugador activo, incluso a
            vos: conserva sus puntos.
          </p>
        </div>
        <div>
          <Layers />
          <p>
            <strong>Endeá tres (robá 3 cartas).</strong> Elegí a alguien activo para robar 3 cartas.
            Las vidas se usan enseguida; No endeas y Endeá tres esperan hasta terminar ese robo, si
            no pierde antes.
          </p>
        </div>
      </div>
      <div className="score-example">
        <strong>¿Cómo se puntúa?</strong>
        <p>
          Suma de números ×2 (Doble endea) + mejoras (Endeas extra) + 15 si conseguiste 7 endeas. El
          ×2 no duplica las mejoras ni el bonus.
        </p>
      </div>
      <p className="muted">
        Al agotarse el mazo se mezclan solo los descartes de rondas anteriores. Gana el total más
        alto al terminar una ronda con 200 o más; si empatan, todos juegan otra ronda.
      </p>
      <button className="button primary wide" onClick={close}>
        Listo, vamos a jugar <ArrowRight size={18} />
      </button>
    </Modal>
  );
}

function Home({ connection }: { connection: Connection }) {
  const [name, setName] = useState(() => localStorage.getItem('flip-siete-name') ?? '');
  const [code, setCode] = useState(
    () => new URLSearchParams(location.search).get('sala')?.toUpperCase() ?? '',
  );
  const [mode, setMode] = useState<'create' | 'join'>(() =>
    new URLSearchParams(location.search).has('sala') ? 'join' : 'create',
  );
  const [invalid, setInvalid] = useState('');
  const { socket, send, connected, busy, restoring } = connection;
  function validate() {
    if (!name.trim()) {
      setInvalid('Poné tu nombre para sentarte a la mesa.');
      return false;
    }
    setInvalid('');
    localStorage.setItem('flip-siete-name', name.trim());
    return true;
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (mode === 'create') void send((ack) => socket.emit('room:create', { name }, ack));
    else void send((ack) => socket.emit('room:join', { name, code }, ack));
  }
  function demo() {
    if (validate()) void send((ack) => socket.emit('room:create', { name, demo: true }, ack));
  }
  return (
    <main className="home">
      <section className="entry-panel" aria-labelledby="entry-title">
        <div className="entry-heading">
          <span className="section-number">01 /</span>
          <span>TU PRÓXIMA PARTIDA</span>
        </div>
        <h2 id="entry-title">Hay lugar en la mesa.</h2>
        <p className="muted">Elegí tu nombre. Invitá a tu gente. A jugar.</p>
        <div className="segmented" role="group" aria-label="Tipo de sala">
          <button
            onClick={() => setMode('create')}
            aria-pressed={mode === 'create'}
            className={mode === 'create' ? 'selected' : ''}
          >
            <Plus size={17} /> Crear sala
          </button>
          <button
            onClick={() => setMode('join')}
            aria-pressed={mode === 'join'}
            className={mode === 'join' ? 'selected' : ''}
          >
            <Users size={17} /> Unirme
          </button>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="player-name">¿Cómo te llamás?</label>
          <input
            id="player-name"
            autoComplete="nickname"
            maxLength={20}
            placeholder="Tu nombre o apodo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!invalid}
            aria-describedby={invalid ? 'name-error' : undefined}
          />
          {invalid && (
            <p id="name-error" className="field-error">
              {invalid}
            </p>
          )}
          {mode === 'join' && (
            <>
              <label htmlFor="room-code">Código de la sala</label>
              <input
                id="room-code"
                className="code-input"
                maxLength={5}
                autoComplete="off"
                placeholder="ABCDE"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                required
                minLength={5}
              />
            </>
          )}
          <button className="button primary wide" disabled={!connected || busy || restoring}>
            {busy
              ? 'Preparando la mesa…'
              : restoring
                ? 'Recuperando tu partida…'
                : mode === 'create'
                  ? 'Crear mi sala'
                  : 'Entrar a la sala'}
            <ArrowRight size={19} />
          </button>
        </form>
        <div className="entry-note">
          <LockKeyhole size={15} />{' '}
          {mode === 'create'
            ? 'Sala privada. Compartís el código y listo.'
            : 'Pedile el código de 5 caracteres al anfitrión.'}
        </div>
        <div className="demo-divider">
          <span>¿QUERÉS PROBAR PRIMERO?</span>
        </div>
        <button
          className="button secondary wide"
          onClick={demo}
          disabled={!connected || busy || restoring}
        >
          <Bot size={19} /> Jugar con 2 bots <ArrowUpRight size={18} />
        </button>
      </section>
      <section className="hero">
        <span className="pill">
          <span className="live-dot" /> EL PLAN EMPIEZA CON UNA ENDEA
        </span>
        <h1>
          La suerte está
          <br /> echada.
          <br />
          <span>¿Endeás?</span>
        </h1>
        <p className="hero-description">
          Un número más puede cambiarlo todo.
          <br />
          Endeá una más, sumá puntos y jugá con tus amigos.
        </p>
        <div className="hero-tags">
          <span>
            <Users size={16} aria-hidden="true" /> Hasta 12 jugadores
          </span>
          <span>
            <Radio size={16} aria-hidden="true" /> En tiempo real
          </span>
          <span>
            <ShieldCheck size={16} aria-hidden="true" /> Sin registro
          </span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="art-spark spark-one">✳</span>
          <span className="art-spark spark-two">✦</span>
          <div className="fan-card fan-one">
            <Card card={{ id: 'hero-4', kind: 'number', value: 4 }} />
          </div>
          <div className="fan-card fan-two">
            <Card card={{ id: 'hero-12', kind: 'number', value: 12 }} />
          </div>
          <div className="fan-card fan-three">
            <Card card={{ id: 'hero-7', kind: 'number', value: 7 }} />
          </div>
          <div className="art-caption">
            <Sparkles size={18} /> 7 endeas. Un gran momento.
          </div>
        </div>
      </section>
      <section className="how-it-works">
        <div className="how-title">
          <span className="eyebrow">POCAS REGLAS. MUCHAS GANAS.</span>
          <h2>
            Fácil de jugar.
            <br />
            Difícil de plantarse.
          </h2>
        </div>
        <div className="how-step">
          <span>01</span>
          <h3>Endeá una más</h3>
          <p>
            Cada número nuevo suma.
            <br /> Vos decidís cuánto arriesgar.
          </p>
        </div>
        <div className="how-step">
          <span>02</span>
          <h3>Ojo con repetir</h3>
          <p>
            Dos iguales y perdés los
            <br /> puntos de esta ronda.
          </p>
        </div>
        <div className="how-step">
          <span>07</span>
          <h3>Juntá 7 endeas</h3>
          <p>
            Siete números distintos.
            <br /> 15 extra. Aplausos merecidos.
          </p>
        </div>
      </section>
    </main>
  );
}

function Invite({ room, onError }: { room: RoomView; onError: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      const url = new URL(location.href);
      url.search = '';
      url.searchParams.set('sala', room.code);
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      onError(`No se pudo copiar. Compartí el código ${room.code}.`);
    }
  }
  return (
    <div className="invite">
      <span>
        SALA <b>{room.code}</b>
      </span>
      <button onClick={() => void copy()} className="button small secondary">
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? 'Copiado' : 'Invitar'}
      </button>
    </div>
  );
}

function Lobby({ connection }: { connection: Connection }) {
  const { room, session, socket, send, busy, connected } = connection;
  if (!room) return null;
  const host = room.hostId === session?.playerId;
  return (
    <main className="lobby">
      <section className="lobby-panel">
        <Invite room={room} onError={connection.setError} />
        <div className="section-header">
          <h2>En la mesa</h2>
          <span className="pill">{room.seats.length} / 12</span>
        </div>
        <div className="seat-list">
          {room.seats.map((seat, i) => (
            <div className="seat" key={seat.id}>
              <Avatar name={seat.name} index={i} bot={seat.bot} />
              <div>
                <strong>
                  {seat.name}
                  {seat.id === session?.playerId && <small> (vos)</small>}
                </strong>
                <span className="muted">
                  {seat.bot
                    ? 'Listo para tentar a la suerte'
                    : seat.id === room.hostId
                      ? 'Anfitrión'
                      : seat.connected
                        ? 'Listo para jugar'
                        : 'Reconectando…'}
                </span>
              </div>
              {host && seat.bot ? (
                <button
                  className="icon-button"
                  aria-label={`Quitar a ${seat.name}`}
                  onClick={() =>
                    void send((ack) => socket.emit('room:bot', { removeId: seat.id }, ack))
                  }
                  disabled={busy || !connected}
                >
                  <X size={18} />
                </button>
              ) : (
                <span
                  className={`presence ${seat.connected ? 'online' : ''}`}
                  aria-label={seat.connected ? 'Conectado' : 'Desconectado'}
                />
              )}
            </div>
          ))}
        </div>
        {host && (
          <button
            className="button secondary wide add-bot"
            onClick={() => void send((ack) => socket.emit('room:bot', {}, ack))}
            disabled={busy || !connected || room.seats.length >= 12}
          >
            <Plus size={18} /> Agregar un bot
          </button>
        )}
        <div className="lobby-bottom">
          <p className="muted">
            <Users size={16} />{' '}
            {host
              ? 'Todos juegan. Incluso quien reparte.'
              : 'El anfitrión empieza cuando estén listos.'}
          </p>
          {host && (
            <button
              className="button primary wide"
              disabled={busy || !connected}
              onClick={() => void send((ack) => socket.emit('game:start', ack))}
            >
              ¡Empezar partida! <ArrowRight size={19} />
            </button>
          )}
        </div>
      </section>
      <div className="lobby-intro">
        <p className="eyebrow">LA MESA ESTÁ CASI LISTA</p>
        <h1>
          Mejor con
          <br />
          <span>buena compañía.</span>
        </h1>
        <p className="muted">
          Compartí el código o el enlace.
          <br />
          Tus amigos entran desde cualquier navegador.
        </p>
        <div className="lobby-deck" aria-hidden="true">
          <Card back />
          <Card card={{ id: 'lobby', kind: 'life' }} />
        </div>
        <div className="lobby-tip">
          <Sparkles size={20} aria-hidden="true" />
          <p>
            ¿No llegó nadie todavía? Agregá un bot y practicá. También podés jugar en solitario.
          </p>
        </div>
      </div>
    </main>
  );
}

function Avatar({ name, index, bot }: { name: string; index: number; bot?: boolean }) {
  return (
    <span className={`avatar avatar-${index % 5}`}>
      {bot ? <Bot size={22} aria-hidden="true" /> : name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function PlayerHand({
  player,
  game,
  index,
  mine,
  current,
}: {
  player: Player;
  game: GameView;
  index: number;
  mine: boolean;
  current: boolean;
}) {
  const mods = player.cards.filter((c) => c.kind !== 'number');
  const numbers = player.cards.filter((c) => c.kind === 'number');
  const points = game.phase === 'playing' ? scoreHand(player) : player.roundScore;
  return (
    <article
      className={`player-hand ${current ? 'current-player' : ''} ${player.status === 'busted' ? 'busted-hand' : ''} ${mine ? 'my-hand' : ''}`}
    >
      <div className="player-header">
        <Avatar name={player.name} index={index} bot={player.bot} />
        <div className="player-ident">
          <h3>
            {player.name} {mine && <span className="you-tag">VOS</span>}
          </h3>
          <span className={`player-status status-${player.status}`}>
            {!player.connected && !player.bot
              ? 'Desconectado · turno automático en 45 s'
              : current
                ? mine
                  ? 'Tu turno'
                  : 'Su turno'
                : statusLabel[player.status]}
          </span>
        </div>
        <div className="hand-points">
          <strong>{points}</strong>
          <span>esta ronda</span>
        </div>
      </div>
      <div className="modifier-row">
        {mods.map((card) =>
          card.kind === 'life' ? (
            <div key={card.id} className="held-action">
              <Card card={card} small />
              <span className="modifier modifier-life">
                <Heart size={13} /> {cardLabel(card)}
              </span>
            </div>
          ) : (
            <span key={card.id} className={`modifier modifier-${card.kind}`}>
              {cardLabel(card)}
            </span>
          ),
        )}
      </div>
      <div className={`number-row ${numbers.length ? '' : 'empty-number-row'}`}>
        {numbers.length ? (
          numbers.map((card) => <Card key={card.id} card={card} small />)
        ) : (
          <div className="empty-hand">
            <Layers size={18} aria-hidden="true" />
            <span>Todavía sin cartas</span>
          </div>
        )}
      </div>
      <div className="hand-footer">
        <span>
          {numberCount(player)} / 7 números distintos
          {game.flipSevenId === player.id && <b className="flip-badge"> ¡7 ENDEAS!</b>}
        </span>
        <span>{player.score} pts totales</span>
      </div>
    </article>
  );
}

function Game({ connection }: { connection: Connection }) {
  const { room, session, socket, send, busy, connected } = connection;
  const actionBar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = actionBar.current;
    const page = bar?.closest<HTMLElement>('.game-page');
    if (!bar || !page) return;
    const resize = new ResizeObserver(() => {
      page.style.setProperty('--action-bar-height', `${bar.getBoundingClientRect().height}px`);
    });
    resize.observe(bar);
    return () => resize.disconnect();
  }, []);
  if (!room?.game) return null;
  const game = room.game;
  const me = game.players.find((p) => p.id === session?.playerId);
  const host = room.hostId === session?.playerId;
  const pending = game.pending;
  const choose = pending?.actorId === me?.id;
  const myTurn = !pending && game.turnId === me?.id && game.phase === 'playing';
  const actor = game.players.find((p) => p.id === (pending?.actorId ?? game.turnId));
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  const latest = game.log.slice(-7).reverse();
  const gameOver = game.phase !== 'playing';
  const winner = game.players.find((p) => p.id === game.winnerId);
  const disabled = busy || !connected;
  return (
    <main className="game-page">
      <div className="game-top">
        <div>
          <p className="eyebrow">META: 200 PUNTOS</p>
          <h1>
            Ronda <span>{game.round.toString().padStart(2, '0')}</span>
          </h1>
        </div>
        <Invite room={room} onError={connection.setError} />
      </div>
      <div className="game-layout">
        <section className="table-area">
          <div className="table-toolbar">
            <div className={`turn-banner ${myTurn || choose ? 'your-turn' : ''}`} role="status">
              <span className="live-dot" />
              <strong>
                {game.phase === 'finished'
                  ? `¡${winner?.name} ganó la partida!`
                  : game.phase === 'roundEnd'
                    ? game.flipSevenId
                      ? '¡7 endeas! La ronda terminó.'
                      : 'Ronda terminada. Puntos asegurados.'
                    : pending
                      ? choose
                        ? `Elegí a quién darle ${cardLabel(pending.card)}`
                        : `${actor?.name} está eligiendo un objetivo`
                      : myTurn
                        ? 'Tu turno'
                        : `Turno de ${actor?.name}`}
              </strong>
            </div>
            <span
              className={`deck-count ${game.deckCount <= 15 ? 'deck-low' : ''}`}
              aria-label={`${game.deckCount} cartas en el mazo`}
            >
              <Layers size={18} aria-hidden="true" />
              <span>
                <span className="deck-label">Mazo</span>
                <strong>{game.deckCount}</strong> cartas
              </span>
            </span>
          </div>
          {gameOver && (
            <div className="round-summary">
              <h2>{winner ? 'La suerte te sonríe.' : 'Una ronda más cerca.'}</h2>
              <p>
                {me
                  ? `Sumaste ${me.roundScore} puntos esta ronda. Llevás ${me.score} en total.`
                  : 'Los puntos ya están guardados.'}
              </p>
              {winner && host && (
                <button
                  className="button primary"
                  disabled={disabled}
                  onClick={() => void send((ack) => socket.emit('game:restart', ack))}
                >
                  Volver al lobby <RotateCcw size={18} />
                </button>
              )}
              {game.phase === 'roundEnd' && (
                <span className="pill">La siguiente ronda empieza automáticamente</span>
              )}
              {winner && !host && <span className="pill">Esperando al anfitrión</span>}
            </div>
          )}
          {pending && (
            <section className="target-panel">
              <div>
                <Card card={pending.card} small />
                <div>
                  <h3>{cardLabel(pending.card)}</h3>
                  <p>
                    {pending.kind === 'freeze'
                      ? 'Termina su ronda y asegura sus puntos.'
                      : pending.kind === 'life'
                        ? 'Una segunda oportunidad para alguien sin vida.'
                        : 'Debe sacar 3 cartas. Puede repetir… o juntar 7 endeas.'}
                  </p>
                </div>
              </div>
              {choose ? (
                <div className="target-buttons">
                  {pending.eligibleIds.map((id) => {
                    const p = game.players.find((p) => p.id === id)!;
                    return (
                      <button
                        className="button secondary"
                        key={id}
                        disabled={disabled}
                        onClick={() =>
                          void send((ack) =>
                            socket.emit('game:action', { type: 'target', targetId: id }, ack),
                          )
                        }
                      >
                        {p.name}
                        {id === me?.id ? ' (vos)' : ''}
                        <ChevronRight size={16} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="muted">Esperando la elección de {actor?.name}…</p>
              )}
            </section>
          )}
          <div className="hands-grid">
            {[...game.players]
              .sort((a, b) => Number(b.id === me?.id) - Number(a.id === me?.id))
              .map((player) => (
                <PlayerHand
                  key={player.id}
                  player={player}
                  game={game}
                  index={game.players.indexOf(player)}
                  mine={player.id === me?.id}
                  current={!gameOver && (pending?.actorId ?? game.turnId) === player.id}
                />
              ))}
          </div>
          <div ref={actionBar} className={`action-bar ${myTurn ? 'action-active' : ''}`}>
            <div>
              <span className="eyebrow">
                {myTurn
                  ? 'TU TURNO'
                  : choose
                    ? 'CARTA ESPECIAL'
                    : gameOver
                      ? 'PUNTOS GUARDADOS'
                      : me?.status === 'active'
                        ? 'EN JUEGO'
                        : 'RONDA CERRADA'}
              </span>
              <strong>
                {myTurn
                  ? `${me ? scoreHand(me) : 0} puntos en juego`
                  : choose
                    ? 'Elegí un jugador arriba'
                    : gameOver
                      ? `${me?.score ?? 0} puntos totales`
                      : me && me.status !== 'active'
                        ? statusLabel[me.status]
                        : `Esperando a ${actor?.name}`}
              </strong>
            </div>
            <div className="action-buttons">
              <button
                className="button secondary"
                disabled={!myTurn || disabled}
                onClick={() =>
                  void send((ack) => socket.emit('game:action', { type: 'stand' }, ack))
                }
              >
                <ShieldCheck size={18} /> Me planto
              </button>
              <button
                className="button primary"
                aria-label="¡Una endea más!"
                disabled={!myTurn || disabled}
                onClick={() => void send((ack) => socket.emit('game:action', { type: 'hit' }, ack))}
              >
                <span className="action-hit-label">¡Una endea más!</span>
                <span className="action-hit-short" aria-hidden="true">
                  Una más
                </span>
                <Plus size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
        <aside className="game-sidebar">
          <section className="ranking">
            <div className="section-header">
              <h2>
                <Trophy size={19} /> La carrera
              </h2>
              <span>200 PTS</span>
            </div>
            {sorted.map((player, i) => (
              <div className="rank-player" key={player.id}>
                <div>
                  <span className="rank-number">{String(i + 1).padStart(2, '0')}</span>
                  <strong>{player.name}</strong>
                  <b>{player.score}</b>
                </div>
                <div className="progress-track">
                  <div style={{ width: `${Math.min(100, player.score / 2)}%` }} />
                </div>
              </div>
            ))}
          </section>
          <section className="game-log">
            <h2>
              <Radio size={18} /> Lo que va pasando
            </h2>
            <ol aria-live="polite" aria-relevant="additions">
              {latest.map((entry) => (
                <li key={entry.id}>{entry.text}</li>
              ))}
            </ol>
          </section>
          <div className="sidebar-note">
            <Heart size={17} />
            <p>Otra endea te salva automáticamente al repetir un número.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default function App() {
  const connection = useGame();
  const [rules, setRules] = useState(false);
  const rulesTrigger = useRef<HTMLButtonElement>(null);
  const [art, setArt] = useState<Record<string, string>>({});
  const [printedFaces, setPrintedFaces] = useState<string[]>([]);
  const { reveal, count, dismiss, settled } = useSpecialCardReveals(
    connection.room,
    connection.session?.playerId,
  );
  const { room, connected, error, busy } = connection;
  const { victory, dismiss: dismissVictory } = useWinnerCelebration(room);
  useRoundRecapReady(room, connection.socket, connected, settled && !reveal && !rules);
  const showRecap = room?.game?.phase === 'roundEnd' && !!room.roundRecap?.nextRoundAt;
  useEffect(() => {
    if (room?.roundRecap?.nextRoundAt != null || reveal || victory) setRules(false);
  }, [room?.roundRecap?.nextRoundAt, reveal?.event.id, victory?.key]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/cards/manifest.json', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const assets: Record<string, string> = {};
        for (const [key, value] of Object.entries(data.assets ?? {})) {
          if (typeof value === 'string' && value.startsWith('/cards/')) assets[key] = value;
        }
        setArt(assets);
        setPrintedFaces(
          Array.isArray(data.printedFaces)
            ? data.printedFaces.filter((key: unknown) => typeof key === 'string' && !!assets[key])
            : [],
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <ArtContext.Provider value={art}>
      <PrintedArtContext.Provider value={printedFaces}>
        <div className="site-shell">
          <header className="site-header">
            <Brand />
            <div className="header-actions">
              <span className={`connection-status ${connected ? 'connected' : ''}`}>
                {connected ? (
                  <>
                    <span className="live-dot" /> Listo para jugar
                  </>
                ) : (
                  <>
                    <WifiOff size={14} /> Conectando…
                  </>
                )}
              </span>
              <button
                ref={rulesTrigger}
                className="button text-button"
                onClick={() => setRules(true)}
              >
                <HelpCircle size={18} /> Cómo jugar
              </button>
              {room && (
                <button
                  className="icon-button"
                  aria-label="Salir de la sala"
                  title="Salir de la sala"
                  disabled={busy || !connected}
                  onClick={() => void connection.leave()}
                >
                  <LogOut size={19} />
                </button>
              )}
            </div>
          </header>
          {!connected && room && (
            <div className="connection-banner" role="status">
              <WifiOff size={18} /> Se perdió la conexión. Intentando recuperar tu partida…
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => connection.setError('')}
                aria-label="Cerrar mensaje"
              >
                <X size={18} />
              </button>
            </div>
          )}
          {room ? (
            room.game ? (
              <Game connection={connection} />
            ) : (
              <Lobby connection={connection} />
            )
          ) : (
            <Home connection={connection} />
          )}
          <footer className="site-footer">
            <span>HECHO PARA COMPARTIR UNA BUENA ENDEA.</span>
            <span>
              {Object.keys(art).length
                ? 'Arte generado con endeas'
                : 'Arte provisional · endeas pendiente'}
              <span className="footer-separator">/</span>Versión 0.1
            </span>
          </footer>
        </div>
        {rules && !showRecap && (
          <Rules close={() => setRules(false)} returnFocusTo={rulesTrigger.current} />
        )}
        {reveal && !showRecap && (
          <CardRevealDialog
            key={`${room?.code}-${reveal.event.id}`}
            reveal={reveal}
            count={count}
            onDismiss={dismiss}
          />
        )}
        {showRecap && room?.game && room.roundRecap && (
          <RoundRecapDialog
            key={room.roundRecap.id}
            game={room.game}
            recap={room.roundRecap}
            serverTime={room.serverTime}
            playerId={connection.session?.playerId}
            connected={connected}
          />
        )}
        {victory && !reveal && !rules && !showRecap && (
          <WinnerCelebration
            key={victory.key}
            victory={victory}
            mine={victory.playerId === connection.session?.playerId}
            onDismiss={dismissVictory}
          />
        )}
      </PrintedArtContext.Provider>
    </ArtContext.Provider>
  );
}
