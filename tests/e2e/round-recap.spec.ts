import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createServer } from '../../apps/server/src/server';
import type { GameState, Card } from '../../packages/engine/src/index';

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
      card.kind === kind && (value === undefined || ('value' in card && card.value === value)),
  );
  if (index < 0) throw new Error('No queda la carta del escenario.');
  return game.drawPile.splice(index, 1)[0];
}
async function pair(page: Page, context: BrowserContext) {
  await page.goto(url);
  await page.getByLabel('¿Cómo te llamás?').fill('Anfitrión');
  await page.getByRole('button', { name: 'Crear mi sala' }).click();
  await expect(page.locator('.lobby-panel')).toBeVisible();
  const code = await page.locator('.invite b').innerText();
  const guest = await context.newPage();
  await guest.goto(`${url}/?sala=${code}`);
  await guest.getByLabel('¿Cómo te llamás?').fill('Invitada');
  await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
  await expect(page.locator('.seat-list .seat')).toHaveCount(2);
  await page.getByRole('button', { name: '¡Empezar partida!' }).click();
  await expect(guest.locator('.game-page')).toBeVisible();
  return { room: server.rooms.get(code)!, guest };
}

test('resume puntos de todos, cuenta 4 segundos y reconecta sin reiniciar ni duplicar totales', async ({
  page,
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: page.viewportSize()!,
    reducedMotion: 'reduce',
  });
  contexts.push(context);
  const { room, guest } = await pair(page, context);
  const game = room.game!;
  game.players[0].score = 40;
  game.players[0].cards = [take(game, 'number', 3), take(game, 'double'), take(game, 'bonus', 4)];
  game.players[1].score = 60;
  game.players[1].cards = [take(game, 'number', 8)];
  game.drawPile.push(take(game, 'number', 8));
  if (game.turnId === game.players[0].id) {
    await page.getByRole('button', { name: 'Me planto' }).click();
    await guest.getByRole('button', { name: '¡Una endea más!' }).click();
  } else {
    await guest.getByRole('button', { name: '¡Una endea más!' }).click();
    await page.getByRole('button', { name: 'Me planto' }).click();
  }
  const recap = page.getByRole('dialog', { name: 'Resumen de la ronda 01' });
  await expect(recap).toBeVisible();
  await expect(guest.getByRole('dialog', { name: 'Resumen de la ronda 01' })).toBeVisible();
  const hostRow = recap.getByRole('row').filter({ hasText: 'Anfitrión' });
  const guestRow = recap.getByRole('row').filter({ hasText: 'Invitada' });
  await expect(hostRow.locator('td').nth(0)).toHaveText('+10');
  await expect(hostRow.locator('td').nth(1)).toHaveText('50');
  await expect(guestRow.locator('td').nth(0)).toHaveText('0');
  await expect(guestRow.locator('td').nth(1)).toHaveText('60');
  await expect(guestRow).toContainText('Número repetido');
  await expect(recap.locator('.recap-countdown')).toContainText('4 s');
  const deadline = room.roundRecap!.nextRoundAt!;
  expect(room.roundRecap!.durationMs).toBe(4000);
  expect(deadline - Date.now()).toBeGreaterThan(3000);
  expect(await recap.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `test-results/round-recap-${testInfo.project.name}.png` });
  await page.waitForTimeout(1100);
  await guest.reload();
  await expect(guest.getByRole('dialog', { name: 'Resumen de la ronda 01' })).toBeVisible();
  expect(room.roundRecap!.nextRoundAt).toBe(deadline);
  await expect(guest.locator('.recap-countdown')).not.toContainText('4 s');
  await expect(page.getByRole('button', { name: 'Siguiente ronda' })).toHaveCount(0);
  await expect(page.locator('.game-top h1')).toContainText('02', { timeout: 7000 });
  await expect(guest.locator('.game-top h1')).toContainText('02');
  expect(room.game!.players.map((player) => player.score)).toEqual([50, 60]);
  expect(room.game!.players.every((player) => player.cards.length === 0)).toBe(true);
  await expect(page.locator('.round-recap-dialog')).toHaveCount(0);
});

test('un aviso especial pendiente tiene margen, pero no bloquea el resumen ni el avance', async ({
  page,
  browser,
}) => {
  const context = await browser.newContext({ viewport: page.viewportSize()! });
  contexts.push(context);
  const { room, guest } = await pair(page, context);
  if (room.game!.turnId === room.game!.players[1].id) {
    room.game!.drawPile.push(take(room.game!, 'number', 7));
    await guest.getByRole('button', { name: '¡Una endea más!' }).click();
  }
  room.game!.drawPile.push(take(room.game!, 'freeze'));
  await page.getByRole('button', { name: '¡Una endea más!' }).click();
  await page
    .getByRole('dialog', { name: 'No endeas', exact: true })
    .getByRole('button', { name: 'Entendido' })
    .click();
  await page
    .locator('.target-buttons')
    .getByRole('button', { name: 'Invitada', exact: true })
    .click();
  const special = guest.getByRole('dialog', { name: 'No endeas', exact: true });
  await expect(special).toBeVisible();
  await page.getByRole('button', { name: 'Me planto' }).click();
  await expect(page.locator('.turn-banner')).toContainText('Ronda terminada');
  await expect(page.locator('.round-recap-dialog')).toHaveCount(0);
  expect(room.roundRecap!.nextRoundAt).toBeNull();
  // La invitada no aprieta Entendido: el resumen igualmente aparece tras el margen de lectura.
  await expect(guest.locator('.round-recap-dialog')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.round-recap-dialog')).toBeVisible();
  await expect(special).toHaveCount(0);
  await expect(guest.locator('.recap-countdown')).toContainText('4 s');
  await expect(page.locator('.game-top h1')).toContainText('02', { timeout: 7000 });
  await expect(guest.locator('.game-top h1')).toContainText('02');
});
