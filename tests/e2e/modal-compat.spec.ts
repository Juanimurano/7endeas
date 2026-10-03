import { test, expect, type Page, type Locator } from '@playwright/test';
import { createServer } from '../../apps/server/src/server';
import {
  createGame,
  dispatch,
  projectView,
  type GameState,
  type Card,
} from '../../packages/engine/src/index';

let server: Awaited<ReturnType<typeof createServer>>;
let url: string;
test.beforeEach(async () => {
  server = await createServer({ recapDuration: 60000 });
  url = await server.app.listen({ port: 0, host: '127.0.0.1' });
});
test.afterEach(async () => {
  await server.app.close();
});

function take(game: GameState, kind: Card['kind'], value?: number) {
  const index = game.drawPile.findIndex(
    (card) =>
      card.kind === kind && (value === undefined || ('value' in card && card.value === value)),
  );
  if (index < 0) throw new Error('Falta la carta del escenario.');
  return game.drawPile.splice(index, 1)[0];
}
async function fitsScreen(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => {
      const box = await dialog.boundingBox();
      const viewport = await page.evaluate(() => ({
        left: window.visualViewport?.offsetLeft ?? 0,
        top: window.visualViewport?.offsetTop ?? 0,
        width: window.visualViewport?.width ?? innerWidth,
        height: window.visualViewport?.height ?? innerHeight,
      }));
      return (
        !!box &&
        box.x >= viewport.left - 1 &&
        box.y >= viewport.top - 1 &&
        box.x + box.width <= viewport.left + viewport.width + 1 &&
        box.y + box.height <= viewport.top + viewport.height + 1
      );
    })
    .toBe(true);
}

async function exerciseModals(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(url);
  await page.getByLabel('¿Cómo te llamás?').fill('Jugador mobile');
  await page.getByRole('button', { name: 'Crear mi sala' }).click();
  await expect(page.locator('.lobby-panel')).toBeVisible();
  const code = await page.locator('.invite b').innerText();
  await page.getByRole('button', { name: '¡Empezar partida!' }).click();
  await expect(page.locator('.game-page')).toBeVisible();
  await page.getByRole('button', { name: 'Cómo jugar' }).click();
  await expect(page.getByRole('dialog', { name: '¿Endeás una más o te plantás?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Cómo jugar' })).toBeFocused();
  const room = server.rooms.get(code)!;
  room.seats.push(
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `viewport-bot-${i}`,
      name: `Jugador ${i + 1}`,
      token: '',
      bot: true,
      connected: true,
    })),
  );
  room.game = createGame(room.seats, () => 0.99);
  for (const player of room.game.players.slice(1)) {
    player.status = 'stood';
    player.cards = [take(room.game, 'number')];
  }
  const actor = room.game.players[0].id;
  function publish() {
    server.io.to(code).emit('room:view', {
      code,
      hostId: room.hostId,
      seats: room.seats.map(({ id, name, bot, connected }) => ({ id, name, bot, connected })),
      game: projectView(room.game!),
      roundRecap: room.roundRecap,
      serverTime: Date.now(),
    });
  }
  publish();
  await expect(page.locator('.player-hand')).toHaveCount(9);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1000);
  // La carta llega por Socket.IO cuando el jugador está lejos del inicio de la página.
  room.game.drawPile.push(take(room.game, 'life'));
  room.game = dispatch(room.game, actor, { type: 'hit' });
  publish();
  const special = page.getByRole('dialog', { name: 'Otra endea', exact: true });
  await fitsScreen(page, special);
  await expect(special.getByRole('button', { name: 'Entendido' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(special.getByRole('button', { name: 'Entendido' })).toBeFocused();
  await page.setViewportSize({ width: 375, height: 480 });
  await fitsScreen(page, special);
  await special.getByRole('button', { name: 'Entendido' }).click();
  await expect(special).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1000);
  room.game = dispatch(room.game, actor, { type: 'stand' });
  room.roundRecap = {
    id: 'viewport-recap',
    round: room.game.round,
    durationMs: 60000,
    nextRoundAt: Date.now() + 60000,
  };
  publish();
  const recap = page.getByRole('dialog', { name: 'Resumen de la ronda 01' });
  await fitsScreen(page, recap);
  await expect(recap.getByRole('table')).toBeVisible();
  await page.setViewportSize({ width: 812, height: 375 });
  await fitsScreen(page, recap);
  room.roundRecap = null;
  room.game = dispatch(room.game, actor, { type: 'nextRound' });
  for (const player of room.game.players.slice(1)) player.status = 'stood';
  room.game.turnId = actor;
  room.game.players[0].score = 199;
  room.game.drawPile.push(take(room.game, 'number', 6));
  room.game = dispatch(room.game, actor, { type: 'hit' });
  room.game = dispatch(room.game, actor, { type: 'stand' });
  publish();
  const victory = page.getByRole('dialog', { name: 'Jugador mobile ganó la partida' });
  await fitsScreen(page, victory);
  await expect(victory).toContainText('205');
  await page.setViewportSize({ width: 320, height: 568 });
  await fitsScreen(page, victory);
  await victory.getByRole('button', { name: 'Ver resultados' }).click();
  await expect(victory).toHaveCount(0);
  expect(errors).toEqual([]);
}

test('los tres modales se ven con scroll, pantalla corta y cambios de orientación', async ({
  page,
}) => {
  await exerciseModals(page);
});

test('los tres modales funcionan sin API nativa de dialog', async ({ page }) => {
  await page.addInitScript(() => {
    if ('HTMLDialogElement' in window)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
        configurable: true,
        value: undefined,
      });
  });
  await exerciseModals(page);
});
