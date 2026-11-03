// Enter og pil op/ned i elevlisten markerer hele den næste celle — som i
// Excel. Før lå markøren forrest, og det man skrev, kom foran den gamle
// tekst ("Bob" blev til "XBob").
import { test, expect } from '@playwright/test';
import { createClass } from './helpers';

function cell(page, row: number, col: number) {
    return page.locator('tbody tr').nth(row).locator('td.cell-data').nth(col);
}

test('Enter til næste celle: det man skriver, erstatter indholdet', async ({ page }) => {
    await createClass(page, 'Celle-navigation');
    await cell(page, 0, 0).click();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Bobby');
    await page.keyboard.press('Enter');
    await expect(cell(page, 1, 0)).toHaveText('Bobby');
});

test('Pil op markerer også hele cellen', async ({ page }) => {
    await createClass(page, 'Celle-navigation');
    await cell(page, 1, 2).click();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.type('11');
    await page.keyboard.press('ArrowDown');
    await expect(cell(page, 0, 2)).toHaveText('11');
});

test('Ctrl+Z tager den overskrevne værdi tilbage', async ({ page }) => {
    await createClass(page, 'Celle-navigation');
    await cell(page, 0, 0).click();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Bobby');
    await page.keyboard.press('Enter');
    await expect(cell(page, 1, 0)).toHaveText('Bobby');
    await page.locator('.settings-panel, body').first().click({ position: { x: 5, y: 5 } });
    await cell(page, 2, 1).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(cell(page, 1, 0)).toHaveText('Bob');
});
