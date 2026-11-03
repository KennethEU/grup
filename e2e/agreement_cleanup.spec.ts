import { test, expect, Page } from '@playwright/test';
import { createClass } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hvad peger på en elev — og hvad sker der, når eleven er væk?
//
// En aftale (undgåelse eller "Skal sammen") peger på elevernes _rowId, og
// id'et overlever eleven. To ting skulle følge med sletningen, og gjorde det
// ikke: MARKERINGEN i elevlisten, og aftalen selv.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CSV =
    'Navn\tKøn\n' +
    'Anna\tK\nBo\tM\nCarl\tM\nDorte\tK\n' +
    'Emil\tM\nFrida\tK';

async function select(page: Page, names: string[]) {
    for (const n of names) {
        await page.locator('tr').filter({ hasText: n })
            .locator('.cell-checkbox input').first().check();
    }
}

async function makeAvoidance(page: Page, names: string[]) {
    await select(page, names);
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Undgå hinanden/ }).click();
    await page.locator('.avoid-modal-close').click();
}

async function deleteStudent(page: Page, name: string) {
    await page.locator('tr').filter({ hasText: name }).locator('.delete-row-btn').click();
    await page.locator('.modal-content .actions button', { hasText: /^Slet$/ }).click();
}

async function openAvoidTab(page: Page) {
    await page.locator('#together-list-btn').click();
    await page.getByRole('tab', { name: /Undgå hinanden/ }).click();
}

test('Sletning tager markeringen med — "Lav aftale" tæller ikke slettede elever', async ({ page }) => {
    await createClass(page, 'Markering og sletning', CSV);
    await select(page, ['Anna', 'Bo', 'Carl']);
    await expect(page.locator('#create-agreement-btn')).toBeVisible();

    // To af de tre markerede forsvinder. Før blev id'erne liggende, så knappen
    // (der kræver to markerede) stod tilbage med én elev tilbage i klassen.
    await deleteStudent(page, 'Bo');
    await expect(page.locator('#create-agreement-btn')).not.toHaveAttribute('aria-disabled', 'true');   // Anna + Carl
    await deleteStudent(page, 'Carl');
    await expect(page.locator('#create-agreement-btn')).toHaveAttribute('aria-disabled', 'true');

    const selected = await page.evaluate(() => [...(window as any).appDebug.state.selectedForAction].length);
    expect(selected).toBe(1);
});

test('En aftale, der ikke gælder længere, kan ryddes op — men kun når den er helt død', async ({ page }) => {
    await createClass(page, 'Doede aftaler', CSV);
    // To undgåelser: en der overlever sletningen, og en der ikke gør.
    await makeAvoidance(page, ['Anna', 'Bo', 'Carl']);
    await makeAvoidance(page, ['Dorte', 'Emil']);

    await deleteStudent(page, 'Bo');        // Anna × Carl står stadig
    await deleteStudent(page, 'Emil');      // Dorte alene tilbage → død

    await openAvoidTab(page);
    const dialog = page.getByRole('dialog', { name: 'Aftaler', exact: true });
    await expect(dialog.locator('.avoid-row')).toHaveCount(2);

    // Kun ÉN er død. Den delvist ramte bliver stående med det slettede navn
    // synligt, så læreren kan læse hvad aftalen faktisk gør.
    const cleanup = dialog.locator('.avoid-cleanup-btn');
    await expect(cleanup).toHaveText(/Fjern undgåelsen, der ikke gælder længere/);

    await cleanup.click();
    await expect(dialog.locator('.avoid-row')).toHaveCount(1);
    await expect(dialog.locator('.avoid-row')).toContainText('Anna');
    await expect(cleanup).toHaveCount(0);

    // Oprydningen skal være gemt, ikke kun tegnet.
    await page.locator('.avoid-modal-close').click();
    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 120000 });
    await openAvoidTab(page);
    await expect(dialog.locator('.avoid-row')).toHaveCount(1);
});

async function makeTogether(page: Page, names: string[]) {
    await select(page, names);
    await page.locator('#create-agreement-btn').click();
    await page.locator('.agreement-menu').getByRole('menuitem', { name: /Skal sammen/ }).click();
    await page.locator('.avoid-modal-close').click();
}

test('"Skal sammen" gennem en slettet elev gælder stadig — og tilbydes ikke fjernet', async ({ page }) => {
    await createClass(page, 'Aftaler gennem en slettet', CSV);
    // Anna+Bo og Bo+Carl er ÉN enhed. Uden Bo holder de stadig Anna og Carl
    // sammen i motoren (togetherComponents), så ingen af dem er døde.
    await makeTogether(page, ['Anna', 'Bo']);
    await makeTogether(page, ['Bo', 'Carl']);
    // Og en, der faktisk er død: Emil står ikke i nogen anden aftale.
    await makeTogether(page, ['Dorte', 'Emil']);

    await deleteStudent(page, 'Bo');
    await deleteStudent(page, 'Emil');

    await page.locator('#together-list-btn').click();
    await page.getByRole('tab', { name: /Skal sammen/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Aftaler', exact: true });
    const rows = dialog.locator('.avoid-row');
    await expect(rows).toHaveCount(3);

    // Før sagde de to første rækker BÅDE "Gælder stadig" og "Gælder ikke længere".
    for (const i of [0, 1]) {
        await expect(rows.nth(i)).toContainText('Gælder stadig gennem andre');
        await expect(rows.nth(i)).not.toContainText('Gælder ikke længere');
    }
    await expect(rows.nth(2)).toContainText('Gælder ikke længere');

    const cleanup = dialog.locator('.avoid-cleanup-btn');
    await expect(cleanup).toHaveText(/Fjern aftalen, der ikke gælder længere/);
    await cleanup.click();
    await expect(rows).toHaveCount(2);
    await expect(cleanup).toHaveCount(0);

    // Bindingen står stadig: Anna og Carl er én enhed.
    const units = await page.evaluate(async () => {
        const { togetherComponents } = await import('/src/js/modules/together.js');
        const cls = (window as any).appDebug.state.currentClass;
        return togetherComponents(cls.togetherGroups, cls.data).length;
    });
    expect(units).toBe(1);
});
