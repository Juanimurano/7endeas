import { test, expect } from '@playwright/test';
import { dismissReveals, awaitRoundRecap } from './helpers';

test('inicio, reglas, demo, una ronda y reconexión', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Crear mi sala' })).toBeEnabled();
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.locator('body').evaluate((el) => el.clientWidth),
  );
  await page.screenshot({ path: `test-results/home-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Cómo jugar' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('¿Cómo te llamás?').fill('Juani');
  await page.getByRole('button', { name: 'Jugar con 2 bots' }).click();
  await expect(page.locator('.game-page')).toBeVisible();
  await expect
    .poll(
      async () => {
        await dismissReveals(page);
        return (
          (await page.getByRole('button', { name: '¡Una endea más!' }).isEnabled()) ||
          (await page.locator('.target-buttons button').first().isVisible()) ||
          (await page.locator('.round-recap-dialog').isVisible())
        );
      },
      { timeout: 20000 },
    )
    .toBe(true);
  if (await page.getByRole('button', { name: '¡Una endea más!' }).isEnabled()) {
    await page.getByRole('button', { name: '¡Una endea más!' }).click();
  }
  // El primer robo puede ser una acción: elegimos un objetivo si corresponde.
  for (let i = 0; i < 30; i++) {
    await dismissReveals(page);
    const target = page.locator('.target-buttons button').first();
    if (await target.isVisible()) await target.click();
    if (await page.locator('.round-recap-dialog').isVisible()) break;
    const stand = page.getByRole('button', { name: 'Me planto' });
    if (await stand.isEnabled()) await stand.click();
    await page.waitForTimeout(500);
  }
  await awaitRoundRecap(page);
  await page.screenshot({ path: `test-results/game-${testInfo.project.name}.png`, fullPage: true });
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.locator('body').evaluate((el) => el.clientWidth),
  );
  await expect(page.getByRole('button', { name: 'Siguiente ronda' })).toHaveCount(0);
  await expect(page.locator('.game-top h1')).toContainText('02', { timeout: 10000 });
  await page.reload();
  await expect(page.locator('.game-top h1')).toContainText('02');
  await expect(page.locator('.connection-banner')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('dos navegadores comparten sala y ronda', async ({ browser, page }) => {
  await page.goto('/');
  await page.getByLabel('¿Cómo te llamás?').fill('Anfitrión');
  await page.getByRole('button', { name: 'Crear mi sala' }).click();
  await expect(page.locator('.lobby-panel')).toBeVisible();
  const code = await page.locator('.invite b').innerText();
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(`${new URL(page.url()).origin}/?sala=${code}`);
  await guest.getByLabel('¿Cómo te llamás?').fill('Invitada');
  await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
  await expect(page.locator('.seat-list .seat')).toHaveCount(2);
  await expect(guest.locator('.seat-list .seat')).toHaveCount(2);
  await page.getByRole('button', { name: '¡Empezar partida!' }).click();
  await expect(guest.locator('.game-page')).toBeVisible();
  // Ambos se plantan; el resumen y el avance se sincronizan sin intervención del anfitrión.
  const first = (await page.getByRole('button', { name: 'Me planto' }).isEnabled()) ? page : guest;
  const second = first === page ? guest : page;
  await first.getByRole('button', { name: 'Me planto' }).click();
  await expect(second.getByRole('button', { name: 'Me planto' })).toBeEnabled();
  await second.getByRole('button', { name: 'Me planto' }).click();
  await awaitRoundRecap(page);
  await awaitRoundRecap(guest);
  await expect(page.locator('.game-top h1')).toContainText('02', { timeout: 10000 });
  await expect(guest.locator('.game-top h1')).toContainText('02', { timeout: 10000 });
  await context.close();
});

test('sin desborde en pantallas pequeñas, paisaje y movimiento reducido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 375, height: 812 },
    { width: 812, height: 375 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  }
  await page.getByRole('button', { name: 'Cómo jugar' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Cómo jugar' })).toBeFocused();
});
