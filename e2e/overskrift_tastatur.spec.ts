// Kolonneoverskrifterne kunne før kun betjenes med mus. Nu kan de få fokus:
// Enter sorterer, F2 omdøber, og aria-sort fortæller skærmlæseren hvordan.
import { test, expect } from '@playwright/test';
import { createClass, createClassAndGoToGroups, generateGroups } from './helpers';

test('Overskrift: Enter sorterer, aria-sort følger med, F2 åbner omdøb', async ({ page }) => {
    await createClass(page, 'Overskrift tastatur');
    const header = page.locator('th.col-header').first();

    await expect(header).toHaveAttribute('tabindex', '0');
    await expect(header).toHaveAttribute('aria-sort', 'none');

    await header.focus();
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await page.keyboard.press(' ');
    await expect(header).toHaveAttribute('aria-sort', 'descending');

    await page.keyboard.press('F2');
    await expect(page.getByRole('heading', { name: 'Omdøb kolonne' })).toBeVisible();
});

test('Slet-knappen nævner eleven', async ({ page }) => {
    await createClass(page, 'Slet navn');
    const label = await page.locator('tbody tr').first().locator('.delete-row-btn').getAttribute('aria-label');
    expect(label).toMatch(/^Slet .+/);
    expect(label).not.toBe('Slet elev');
});

test('Vis-vælgeren i værktøjslinjen har synlig fokusramme', async ({ page }) => {
    await createClass(page, 'Vis fokus');
    await page.locator('#id-column-select').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const outline = await page.locator('.id-drawer-btn').evaluate(el => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');
});

test('Gruppekortets lås nævner gruppen', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Lås navn');
    await generateGroups(page);
    const lock = page.locator('.group-card .lock-btn').first();
    await expect(lock).toHaveAttribute('aria-label', /^Lås gruppe — .+/);
    await lock.click();
    await expect(lock).toHaveAttribute('aria-label', /^Lås op — .+/);
});
