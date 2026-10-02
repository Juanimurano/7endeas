import type { Page } from '@playwright/test';

export async function dismissReveals(page: Page) {
  for (let i = 0; i < 15; i++) {
    const dialog = page.locator('.card-reveal-dialog');
    if (!(await dialog.isVisible())) return;
    await dialog.getByRole('button', { name: 'Entendido' }).click();
  }
}
