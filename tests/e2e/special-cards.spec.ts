import { test, expect, type Page } from '@playwright/test';
import { createServer } from '../../apps/server/src/server';
import type { GameState } from '../../packages/engine/src/index';
import { awaitRoundRecap } from './helpers';

let server: Awaited<ReturnType<typeof createServer>>;
let url: string;
test.beforeEach(async () => {
  server = await createServer();
  url = await server.app.listen({ port: 0, host: '127.0.0.1' });
});
test.afterEach(async () => {
  await server.app.close();
});

function putOnTop(game: GameState, ...kinds: ('draw3' | 'life' | 'freeze' | 'number')[]) {
  const cards = kinds.map((kind) => {
    const heldValues = game.players.flatMap((player) =>
      player.cards.filter((card) => card.kind === 'number').map((card) => card.value),
    );
    const index = game.drawPile.findIndex(
      (card) => card.kind === kind && (card.kind !== 'number' || !heldValues.includes(card.value)),
    );
    if (index < 0) throw new Error(`No queda ${kind}`);
    return game.drawPile.splice(index, 1)[0];
  });
  game.drawPile.push(...cards.reverse());
}
async function startSolo(page: Page) {
  await page.goto(url);
  await page.getByLabel('¿Cómo te llamás?').fill('Juani');
  await page.getByRole('button', { name: 'Crear mi sala' }).click();
  await expect(page.locator('.lobby-panel')).toBeVisible();
  const code = await page.locator('.invite b').innerText();
  await page.getByRole('button', { name: '¡Empezar partida!' }).click();
  await expect(page.locator('.game-page')).toBeVisible();
  return server.rooms.get(code)!;
}
async function reveal(page: Page, name: string, image: string) {
  const dialog = page.getByRole('dialog', { name, exact: true });
  await expect(dialog).toBeVisible();
  const art = dialog.locator('.reveal-front img');
  await expect(art).toHaveAttribute('src', `/cards/${image}.webp`);
  await expect(art).toHaveJSProperty('naturalWidth', 768);
  await expect(dialog.locator('.reveal-front .card-frame')).toBeHidden();
  return dialog;
}

test('arte completo, giro animado, cola de especiales y recarga sin repetir avisos', async ({
  page,
}, testInfo) => {
  const room = await startSolo(page);
  putOnTop(room.game!, 'draw3', 'life', 'life', 'freeze');
  await page.getByRole('button', { name: '¡Una endea más!' }).click();
  let dialog = await reveal(page, 'Endeá tres', 'draw3');
  expect(
    await dialog.locator('.reveal-card-inner').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('reveal-flip');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/reveal-draw3-${testInfo.project.name}.png` });
  await dialog.getByRole('button', { name: 'Entendido' }).click();
  await page.locator('.target-buttons').getByRole('button', { name: 'Juani (vos)' }).click();
  dialog = await reveal(page, 'Otra endea', 'life');
  await expect(dialog).toContainText('La conservás en tu mano');
  await expect(dialog).toContainText('2 avisos más');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/reveal-life-${testInfo.project.name}.png` });
  await dialog.getByRole('button', { name: 'Entendido' }).click();
  dialog = await reveal(page, 'Otra endea', 'life');
  await expect(dialog).toContainText('Se descartó');
  await dialog.getByRole('button', { name: 'Entendido' }).click();
  dialog = await reveal(page, 'No endeas', 'freeze');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/reveal-freeze-${testInfo.project.name}.png` });
  await dialog.getByRole('button', { name: 'Entendido' }).click();
  await expect(page.locator('.held-action .full-art')).toHaveCount(1);
  await page.locator('.target-buttons').getByRole('button', { name: 'Juani (vos)' }).click();
  await awaitRoundRecap(page);
  await page.reload();
  await expect(page.locator('.game-page')).toBeVisible();
  await expect(page.locator('.card-reveal-dialog')).toHaveCount(0);
});

test('el afectado recibe el aviso, el regalo se revela y se respeta movimiento reducido', async ({
  page,
  browser,
}) => {
  await page.goto(url);
  await page.getByLabel('¿Cómo te llamás?').fill('Juani');
  await page.getByRole('button', { name: 'Crear mi sala' }).click();
  await expect(page.locator('.lobby-panel')).toBeVisible();
  const code = await page.locator('.invite b').innerText();
  const context = await browser.newContext({
    viewport: page.viewportSize()!,
    reducedMotion: 'reduce',
  });
  const guest = await context.newPage();
  await guest.goto(`${url}/?sala=${code}`);
  await guest.getByLabel('¿Cómo te llamás?').fill('Amiga');
  await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
  await expect(page.locator('.seat-list .seat')).toHaveCount(2);
  await page.getByRole('button', { name: '¡Empezar partida!' }).click();
  await expect(guest.locator('.game-page')).toBeVisible();
  const room = server.rooms.get(code)!;
  const hostId = room.hostId;
  async function hostTurn() {
    if (room.game!.turnId !== hostId) {
      putOnTop(room.game!, 'number');
      await guest.getByRole('button', { name: '¡Una endea más!' }).click();
    }
    await expect(page.getByRole('button', { name: '¡Una endea más!' })).toBeEnabled();
  }
  await hostTurn();
  putOnTop(room.game!, 'freeze');
  await page.getByRole('button', { name: '¡Una endea más!' }).click();
  await (
    await reveal(page, 'No endeas', 'freeze')
  )
    .getByRole('button', { name: 'Entendido' })
    .click();
  await expect(guest.locator('.card-reveal-dialog')).toHaveCount(0);
  await page.locator('.target-buttons').getByRole('button', { name: 'Amiga', exact: true }).click();
  let dialog = await reveal(guest, 'No endeas', 'freeze');
  await expect(dialog).toContainText('Tu ronda terminó');
  expect(
    await dialog.locator('.reveal-card-inner').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await dialog.getByRole('button', { name: 'Entendido' }).click();
  await page.getByRole('button', { name: 'Me planto' }).click();
  await expect(page.locator('.game-top h1')).toContainText('02', { timeout: 10000 });
  await hostTurn();
  putOnTop(room.game!, 'life', 'number', 'life');
  await page.getByRole('button', { name: '¡Una endea más!' }).click();
  await (
    await reveal(page, 'Otra endea', 'life')
  )
    .getByRole('button', { name: 'Entendido' })
    .click();
  await guest.getByRole('button', { name: '¡Una endea más!' }).click();
  await page.getByRole('button', { name: '¡Una endea más!' }).click();
  dialog = await reveal(page, 'Otra endea', 'life');
  await expect(dialog).toContainText('elegí a quién regalar');
  await dialog.getByRole('button', { name: 'Entendido' }).click();
  await page.locator('.target-buttons').getByRole('button', { name: 'Amiga', exact: true }).click();
  dialog = await reveal(guest, 'Otra endea', 'life');
  await expect(dialog).toContainText('Te regalaron una vida extra');
  await dialog.getByRole('button', { name: 'Entendido' }).click();
  await guest.reload();
  await expect(guest.locator('.held-action .full-art')).toHaveCount(2);
  await expect(guest.locator('.card-reveal-dialog')).toHaveCount(0);
  await context.close();
});
