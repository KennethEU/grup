import { test, expect, Page } from '@playwright/test';
import { createClass } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fokus i Aftaler-vinduet efter en sletning med tastaturet.
//
// Rækkerne har nøgle efter deres plads. Fjernes den SIDSTE række, forsvinder
// knappen med fokus, og markøren faldt ud af vinduet til siden bagved. Samme
// med "Fjern … der ikke gælder længere", der selv forsvinder bagefter.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CSV =
    'Navn\tKøn\n' +
    'Anna\tK\nBo\tM\nCarl\tM\nDorte\tK\n' +
    'Emil\tM\nFrida\tK';

async function makeAvoidance(page: Page, names: string[]) {
    for (const n of names) {
        await page.locator('tr').filter({ hasText: n })
            .locator('.cell-checkbox input').first().check();
    }
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Undgå hinanden/ }).click();
    await page.locator('.avoid-modal-close').click();
}

async function openAvoidTab(page: Page) {
    await page.locator('#together-list-btn').click();
    await page.getByRole('tab', { name: /Undgå hinanden/ }).click();
    return page.getByRole('dialog', { name: 'Aftaler', exact: true });
}

test('Fjern den sidste undgåelse: fokus går til den forrige, og til fanen når der ingen er', async ({ page }) => {
    await createClass(page, 'Aftaler tastatur', CSV);
    await makeAvoidance(page, ['Anna', 'Bo']);
    await makeAvoidance(page, ['Carl', 'Dorte']);

    const dialog = await openAvoidTab(page);
    const remove = dialog.getByRole('button', { name: 'Fjern undgåelse' });
    await expect(remove).toHaveCount(2);

    await remove.nth(1).focus();
    await page.keyboard.press('Enter');
    await expect(remove).toHaveCount(1);
    await expect(remove.first()).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(remove).toHaveCount(0);
    await expect(dialog.getByRole('tab', { name: /Undgå hinanden/ })).toBeFocused();
});

test('Oprydningen forsvinder, men fokus bliver i vinduet', async ({ page }) => {
    await createClass(page, 'Aftaler oprydning', CSV);
    await makeAvoidance(page, ['Anna', 'Bo']);
    await makeAvoidance(page, ['Emil', 'Frida']);

    // Frida slettes: Emil × Frida gælder ikke længere
    await page.locator('tr').filter({ hasText: 'Frida' }).locator('.delete-row-btn').click();
    await page.locator('.modal-content .actions button', { hasText: /^Slet$/ }).click();

    const dialog = await openAvoidTab(page);
    const cleanup = dialog.locator('.avoid-cleanup-btn');
    await cleanup.focus();
    await page.keyboard.press('Enter');
    await expect(cleanup).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Fjern undgåelse' })).toBeFocused();
});
