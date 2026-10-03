import { test, expect, type Locator, type Page } from '@playwright/test';

async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function noOverflow(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
}

const phones = [
  { width: 320, height: 640 },
  { width: 326, height: 720 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
];

test('crear y unirse son accesibles en la primera pantalla mobile', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Crear mi sala' })).toBeEnabled();
  for (const viewport of phones) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Crear sala', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    const panel = await bounds(page.locator('.entry-panel'));
    const header = await bounds(page.locator('.site-header'));
    expect(panel.y - (header.y + header.height)).toBeLessThanOrEqual(24);
    const create = await bounds(page.getByRole('button', { name: 'Crear mi sala' }));
    expect(create.y + create.height).toBeLessThan(viewport.height);
    const demo = await bounds(page.getByRole('button', { name: 'Jugar con 2 bots' }));
    expect(demo.y + demo.height).toBeLessThan(viewport.height);
    await noOverflow(page, viewport.width);
    if (viewport.width === 326) {
      await page.screenshot({ path: `test-results/priority-home-${testInfo.project.name}.png` });
    }
    await page.getByRole('button', { name: 'Unirme', exact: true }).click();
    const join = await bounds(page.getByRole('button', { name: 'Entrar a la sala' }));
    expect(join.y + join.height).toBeLessThan(viewport.height);
    await noOverflow(page, viewport.width);
  }
});

test('jugadores, mazo y acciones quedan al alcance desde el ingreso', async ({
  page,
  browser,
}, testInfo) => {
  await page.setViewportSize(phones[1]);
  await page.goto('/');
  await page.getByLabel('¿Cómo te llamás?').fill('Juani');
  await page.getByRole('button', { name: 'Crear mi sala' }).click();
  await expect(page.locator('.lobby-panel')).toBeVisible();
  const code = await page.locator('.invite b').innerText();
  const lobby = await bounds(page.locator('.lobby-panel'));
  expect(lobby.y).toBeLessThan(100);
  const start = await bounds(page.getByRole('button', { name: '¡Empezar partida!' }));
  expect(start.y + start.height).toBeLessThan(phones[1].height);
  await page.screenshot({ path: `test-results/priority-lobby-${testInfo.project.name}.png` });

  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    await guest.goto(`${new URL(page.url()).origin}/?sala=${code}`);
    await guest.getByLabel('¿Cómo te llamás?').fill('Amiga');
    await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
    await expect(page.locator('.seat-list .seat')).toHaveCount(2);
    await page.getByRole('button', { name: '¡Empezar partida!' }).click();
    await expect(page.locator('.game-page')).toBeVisible();
    await expect(page.locator('.deck-count')).toHaveAttribute(
      'aria-label',
      /\d+ cartas en el mazo/,
    );
    for (const viewport of phones) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      const hand = await bounds(page.locator('.my-hand'));
      expect(hand.y).toBeLessThan(230);
      const dock = await bounds(page.locator('.action-bar'));
      expect(dock.y + dock.height).toBeCloseTo(viewport.height, 0);
      const opponent = await bounds(page.locator('.player-hand:not(.my-hand)').first());
      expect(opponent.y + opponent.height).toBeLessThan(dock.y);
      for (const button of await page.locator('.action-buttons button').all()) {
        const box = await bounds(button);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
      await noOverflow(page, viewport.width);
      if (viewport.width === 326) {
        await page.screenshot({ path: `test-results/priority-game-${testInfo.project.name}.png` });
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const log = await bounds(page.locator('.game-log'));
      expect(log.y + log.height).toBeLessThanOrEqual((await bounds(page.locator('.action-bar'))).y);
    }
    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 812, height: 375 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      await noOverflow(page, viewport.width);
      const hand = await bounds(page.locator('.my-hand'));
      expect(hand.y).toBeLessThan(viewport.height);
    }
  } finally {
    await guestContext.close();
  }
});
