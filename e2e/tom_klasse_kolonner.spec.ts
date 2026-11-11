import { test, expect, Page } from '@playwright/test';
import { createClass } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// En klasse UDEN elever skal også kunne gemme sine kolonner.
//
// Kolonnerne gemmes ud fra elevrækkernes nøgler. Har læreren slettet alle
// elever, er der ingen rækker — og før 11/11 2026 blev "+ Kolonne" og
// "Slet kolonne" så aldrig gemt: efter en genindlæsning var den nye kolonne
// væk, og den slettede stod der igen. (92. gennemsyn.)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CSV = 'Navn\tKøn\nAnna\tK\nBo\tM';

async function deleteStudent(page: Page, name: string) {
    await page.locator('tr').filter({ hasText: name }).locator('.delete-row-btn').click();
    await page.locator('.modal-content .actions button', { hasText: /^Slet$/ }).click();
}

const columns = (page: Page) =>
    page.evaluate(() => [...((window as any).appDebug.state.currentClass?.columns || [])]);

test('ny og slettet kolonne i en klasse uden elever står der stadig efter genindlæsning', async ({ page }) => {
    await createClass(page, 'Tom klasse', CSV);
    await deleteStudent(page, 'Anna');
    await deleteStudent(page, 'Bo');
    await expect(page.locator('.delete-row-btn')).toHaveCount(0);

    // + Kolonne
    await page.locator('#add-col-btn').click();
    await page.getByPlaceholder('Navn på kolonne').fill('Niveau');
    await page.keyboard.press('Enter');
    await expect.poll(() => columns(page)).toEqual(['Navn', 'Køn', 'Niveau']);

    // Slet kolonne: Køn. (Omdøb sker ved et dobbeltklik på overskriften,
    // og uden elever står der ingen tabel — det er dækket i
    // emptyClassColumns.test.js.)
    await page.locator('#del-col-btn').click();
    await page.locator('#slet-kol').selectOption('Køn');
    await page.getByRole('dialog', { name: 'Slet kolonne' })
        .getByRole('button', { name: 'Slet kolonne' }).click();
    await expect.poll(() => columns(page)).toEqual(['Navn', 'Niveau']);

    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 120000 });
    await expect.poll(() => columns(page)).toEqual(['Navn', 'Niveau']);
    // Og læreren kan se det: Vis-vælgeren tilbyder præcis de to.
    await expect(page.locator('#id-column-select option')).toHaveText(['Navn', 'Niveau']);
});
