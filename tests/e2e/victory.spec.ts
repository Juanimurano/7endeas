import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createServer } from '../../apps/server/src/server';
import type { GameState, Card } from '../../packages/engine/src/index';
import { awaitRoundRecap } from './helpers';

let server: Awaited<ReturnType<typeof createServer>>;
let url: string;
let contexts: BrowserContext[];
test.beforeEach(async () => {
  contexts = [];
  server = await createServer();
  url = await server.app.listen({ port: 0, host: '127.0.0.1' });
});
test.afterEach(async () => {
  for (const context of contexts) await context.close();
  await server.app.close();
});

function take(game: GameState, kind: Card['kind'], value?: number): Card {
  const index = game.drawPile.findIndex(
    (card) =>
      card.kind === kind &&
      (value === undefined || (card.kind === 'number' && card.value === value)),
  );
  if (index < 0) throw new Error(`No queda la carta ${kind} ${value ?? ''}`);
  return game.drawPile.splice(index, 1)[0];
}
async function startPair(page: Page, context: BrowserContext) {
  await page.goto(url);
  await page.getByLabel('¿Cómo te llamás?').fill('Campeona de Endeas');
  await page.getByRole('button', { name: 'Crear mi sala' }).click();
  await expect(page.locator('.lobby-panel')).toBeVisible();
  const code = await page.locator('.invite b').innerText();
  const guest = await context.newPage();
  await guest.goto(`${url}/?sala=${code}`);
  await guest.getByLabel('¿Cómo te llamás?').fill('Amiga');
  await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
  await expect(page.locator('.seat-list .seat')).toHaveCount(2);
  await page.getByRole('button', { name: '¡Empezar partida!' }).click();
  await expect(guest.locator('.game-page')).toBeVisible();
  return { room: server.rooms.get(code)!, guest };
}
async function standBoth(game: GameState, page: Page, guest: Page) {
  const first = game.turnId === game.players[0].id ? page : guest;
  const second = first === page ? guest : page;
  await first.getByRole('button', { name: 'Me planto' }).click();
  await expect(second.getByRole('button', { name: 'Me planto' })).toBeEnabled();
  await second.getByRole('button', { name: 'Me planto' }).click();
}

test('todos ven al ganador, la celebración no se repite al recargar y vuelve en otra partida', async ({
  page,
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: page.viewportSize()!,
    reducedMotion: 'reduce',
  });
  contexts.push(context);
  const { room, guest } = await startPair(page, context);
  const game = room.game!;
  game.players[0].score = 199;
  game.players[0].cards = [take(game, 'number', 2)];
  game.players[1].score = 195;
  game.players[1].cards = [take(game, 'number', 5)];
  const first = game.turnId === game.players[0].id ? page : guest;
  const second = first === page ? guest : page;
  await first.getByRole('button', { name: 'Me planto' }).click();
  expect(room.game!.phase).toBe('playing');
  await expect(page.locator('.victory-dialog')).toHaveCount(0);
  await expect(guest.locator('.victory-dialog')).toHaveCount(0);
  await second.getByRole('button', { name: 'Me planto' }).click();
  const winnerDialog = page.getByRole('dialog', { name: 'Campeona de Endeas ganó la partida' });
  const guestDialog = guest.getByRole('dialog', { name: 'Campeona de Endeas ganó la partida' });
  await expect(winnerDialog).toBeVisible({ timeout: 2000 });
  await expect(page.locator('.round-recap-dialog')).toHaveCount(0);
  await expect(guest.locator('.round-recap-dialog')).toHaveCount(0);
  expect(room.roundRecap).toBeNull();
  await expect(guestDialog).toBeVisible();
  await expect(winnerDialog.locator('.victory-score strong')).toHaveText('201');
  await expect(winnerDialog).toContainText('¡GANASTE!');
  await expect(winnerDialog.locator('.victory-cup')).toHaveCSS('animation-name', 'victory-trophy');
  await expect(guestDialog.locator('.victory-cup')).toHaveCSS('animation-name', 'none');
  await expect(guestDialog.locator('.victory-confetti')).toBeHidden();
  expect(await winnerDialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `test-results/victory-${testInfo.project.name}.png` });
  await winnerDialog.getByRole('button', { name: 'Ver resultados' }).click();
  await page.reload();
  await expect(page.locator('.game-page')).toBeVisible();
  await expect(page.locator('.victory-dialog')).toHaveCount(0);
  // Un jugador que aún no confirmó puede volver a ver el resultado al reconectar.
  await guest.reload();
  await expect(guestDialog).toBeVisible();
  await guestDialog.getByRole('button', { name: 'Ver resultados' }).click();
  await guest.reload();
  await expect(guest.locator('.game-page')).toBeVisible();
  await expect(guest.locator('.victory-dialog')).toHaveCount(0);
  const host = room.hostId === room.seats[0].id ? page : guest;
  await host.getByRole('button', { name: 'Volver al lobby' }).click();
  await expect(host.locator('.lobby-panel')).toBeVisible();
  await host.getByRole('button', { name: '¡Empezar partida!' }).click();
  await expect(page.locator('.game-page')).toBeVisible();
  const rematch = room.game!;
  rematch.players[1].score = 199;
  rematch.players[1].cards = [take(rematch, 'number', 3)];
  await standBoth(rematch, page, guest);
  await expect(page.getByRole('dialog', { name: 'Amiga ganó la partida' })).toBeVisible({
    timeout: 10000,
  });
  await expect(guest.getByRole('dialog', { name: 'Amiga ganó la partida' })).toBeVisible();
});

test('un empate no celebra y la victoria espera el último aviso de carta especial', async ({
  page,
  browser,
}) => {
  const context = await browser.newContext({ viewport: page.viewportSize()! });
  contexts.push(context);
  const { room, guest } = await startPair(page, context);
  const tied = room.game!;
  for (const player of tied.players) {
    player.score = 195;
    player.cards = [take(tied, 'number', 5)];
  }
  await standBoth(tied, page, guest);
  await awaitRoundRecap(page);
  expect(room.game!.phase).toBe('roundEnd');
  await expect(page.locator('.victory-dialog')).toHaveCount(0);
  await expect(guest.locator('.victory-dialog')).toHaveCount(0);
  await expect(page.locator('.game-top h1')).toContainText('02', { timeout: 10000 });
  if (room.game!.turnId === room.game!.players[1].id)
    await guest.getByRole('button', { name: 'Me planto' }).click();
  await expect(page.getByRole('button', { name: '¡Una endea más!' })).toBeEnabled();
  const final = room.game!;
  final.players[0].cards = [0, 1, 2, 3, 4, 5].map((value) => take(final, 'number', value));
  const sequence = [
    take(final, 'draw3'),
    take(final, 'freeze'),
    take(final, 'number', 6),
    take(final, 'number', 7),
  ];
  final.drawPile.push(...sequence.reverse());
  await page.getByRole('button', { name: '¡Una endea más!' }).click();
  await page
    .getByRole('dialog', { name: 'Endeá tres', exact: true })
    .getByRole('button', { name: 'Entendido' })
    .click();
  await page
    .locator('.target-buttons')
    .getByRole('button', { name: 'Campeona de Endeas (vos)' })
    .click();
  const lastCard = page.getByRole('dialog', { name: 'No endeas', exact: true });
  await expect(lastCard).toBeVisible();
  await expect(lastCard).toContainText('Esta acción no se activa');
  await expect(page.locator('.victory-dialog')).toHaveCount(0);
  await lastCard.getByRole('button', { name: 'Entendido' }).click();
  const victory = page.getByRole('dialog', { name: 'Campeona de Endeas ganó la partida' });
  await expect(victory).toBeVisible({ timeout: 2000 });
  await expect(page.locator('.round-recap-dialog')).toHaveCount(0);
  await expect(victory.locator('.victory-score strong')).toHaveText('236');
  await expect(
    guest.getByRole('dialog', { name: 'Campeona de Endeas ganó la partida' }),
  ).toBeVisible();
});
