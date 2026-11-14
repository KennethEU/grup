import { test, expect, Page } from '@playwright/test';
import { createClass, addRecipeRule, openRecipe, closeRecipe, goToGroups } from './helpers';

/**
 * Et klasseskift må ikke æde lærerens sidste ændring.
 *
 * Opskriften gemmer klassen med en lille forsinkelse: en ny regel efter 1 sek.
 * (BetaGroupsTab.debouncedAutoSave), gruppestørrelsen efter 0,3 sek.
 * (RecipePanel.saveSettingsSoon). Indtil da findes ændringen KUN i hukommelsen,
 * på den klasse, der står på skærmen. Skiftede læreren klasse i menuen inden
 * da, hentede `selectClass()` den nye klasse ind i stedet — og den ventende
 * gemning ramte den nye klasse (uden noget nyt at gemme) eller blev droppet,
 * fordi panelet var væk. Reglen var væk uden en lyd. (117. gennemsyn.)
 *
 * Testen skifter med vilje hurtigere, end forsinkelsen er lang.
 */

/** Opret endnu en klasse fra klassemenuen i topbaren. */
async function createSecondClass(page: Page, name: string) {
    await page.locator('.class-trigger').click();
    await page.locator('.glass-dropdown .add-btn').click();
    const input = page.locator('.modal-overlay input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(name);
    await page.getByRole('button', { name: /^Opret$/ }).click();
    await expect(page.locator('.class-trigger')).toContainText(name, { timeout: 30000 });
}

async function switchToClass(page: Page, name: string) {
    await page.locator('.class-trigger').click();
    await page.locator('.class-list .class-item button.name')
        .filter({ hasText: name }).first().click();
    await expect(page.locator('.class-trigger')).toContainText(name, { timeout: 30000 });
}

/** Klassens gemte udgave i lageret — det, der er tilbage efter en genindlæsning. */
function storedClass(page: Page, name: string) {
    return page.evaluate((n) => {
        const list = JSON.parse(localStorage.getItem('grupdk_classes') || '[]');
        return list.find((c: any) => c.name === n)?.content ?? null;
    }, name);
}

test('en ny regel overlever et hurtigt klasseskift', async ({ page }) => {
    await createClass(page, '2a Regel');
    await createSecondClass(page, '3b Regel');
    await switchToClass(page, '2a Regel');
    await goToGroups(page);

    await addRecipeRule(page);
    await closeRecipe(page);
    // Straks — før den ene sekunds forsinkelse er gået
    await switchToClass(page, '3b Regel');

    // Reglen skal stå i lageret under 2a, ikke kun have levet i hukommelsen
    await expect.poll(async () => (await storedClass(page, '2a Regel'))?.rules?.length ?? 0,
        { timeout: 3000 }).toBe(1);
    // …og ikke være havnet i 3b
    expect((await storedClass(page, '3b Regel'))?.rules?.length ?? 0).toBe(0);
});

test('en ændret gruppestørrelse overlever et hurtigt klasseskift', async ({ page }) => {
    await createClass(page, '2a Str');
    await createSecondClass(page, '3b Str');
    await switchToClass(page, '2a Str');
    await goToGroups(page);

    const before = Number((await storedClass(page, '2a Str'))?.settings?.groupTarget ?? 4);
    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]').click();
    await dialog.locator('.rtok__pop').getByRole('button', { name: 'Flere' }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await switchToClass(page, '3b Str');

    await expect.poll(async () => Number((await storedClass(page, '2a Str'))?.settings?.groupTarget),
        { timeout: 3000 }).toBe(before + 1);
    // 3b har sin egen størrelse, ikke 2a's nye
    expect(Number((await storedClass(page, '3b Str'))?.settings?.groupTarget ?? before)).toBe(before);
});

test('en backup oven i den åbne klasse skrives ikke væk, når fanen lukkes midt i importen', async ({ page }) => {
    await createClass(page, '2a Backup');
    const filename = await page.evaluate(() => (window as any).appDebug.state.currentClass.filename);
    const entry = (navn: string) => ({
        filename, name: '2a Backup', columns: ['Navn'], rules: [], id_column: 'Navn',
        data: [{ Navn: navn, _rowId: 'r1' }],
    });

    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Importér', exact: true }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    // To backup-filer med den samme klasse. Den første skrives oven i den åbne
    // klasse; den andens spørgsmål står så åbent, mens fanen genindlæses.
    await page.setInputFiles('input[type=file]', [
        { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([entry('Cecilie')])) },
        { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([entry('Dorthe')])) },
    ]);
    await page.getByRole('button', { name: /Importér Filer/i }).click();
    await page.getByRole('button', { name: 'Overskriv mine' }).click();
    await expect(page.getByRole('button', { name: 'Overskriv mine' })).toBeVisible();

    // Genindlæsning: pagehide → flushPendingWrites → autoSave() af det, der
    // stod i hukommelsen.
    await page.reload();
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true);
    const names = await page.evaluate((f) => {
        const list = JSON.parse(localStorage.getItem('grupdk_classes') || '[]');
        return list.find((c: any) => c.filename === f)?.content?.data?.map((r: any) => r.Navn);
    }, filename);
    expect(names).toEqual(['Cecilie']);
});

test('en ændret gruppestørrelse overlever et hurtigt skift til Elevliste', async ({ page }) => {
    await createClass(page, '2a Fane');
    await goToGroups(page);

    const before = Number((await storedClass(page, '2a Fane'))?.settings?.groupTarget ?? 4);
    const dialog = await openRecipe(page);
    await dialog.locator('.rtok__btn[aria-label^="Gruppernes størrelse:"]').click();
    await dialog.locator('.rtok__pop').getByRole('button', { name: 'Flere' }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    // Opskriften forsvinder med Grupper-fanen. Dens ventende gem skal med.
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();

    await expect.poll(async () => Number((await storedClass(page, '2a Fane'))?.settings?.groupTarget),
        { timeout: 3000 }).toBe(before + 1);
});

test('en ny regel overlever Elevliste og så et hurtigt klasseskift', async ({ page }) => {
    await createClass(page, '2a Begge');
    await createSecondClass(page, '3b Begge');
    await switchToClass(page, '2a Begge');
    await goToGroups(page);

    await addRecipeRule(page);
    await closeRecipe(page);
    // Grupper-fanen forsvinder først; dens ventende gem må ikke blive hængende
    // til efter klasseskiftet.
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await switchToClass(page, '3b Begge');

    await expect.poll(async () => (await storedClass(page, '2a Begge'))?.rules?.length ?? 0,
        { timeout: 3000 }).toBe(1);
    expect((await storedClass(page, '3b Begge'))?.rules?.length ?? 0).toBe(0);
});

test('en rettet celle i elevlisten overlever et hurtigt klasseskift', async ({ page }) => {
    await createClass(page, '2a Celle');
    await createSecondClass(page, '3b Celle');
    await switchToClass(page, '2a Celle');
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();

    // Elevtabellen skriver cellen ind i klassen ved blur og gemmer 1 sek. senere
    // (StudentTable.debouncedAutoSave). Klik på klassemenuen giver blur.
    const cell = page.locator('tbody tr').first().locator('td.cell-data').first();
    await cell.click();
    await cell.fill('Zenia Ændret');
    await switchToClass(page, '3b Celle');

    await expect.poll(async () => (await storedClass(page, '2a Celle'))?.data
        ?.some((r: any) => r.Navn === 'Zenia Ændret') ?? false, { timeout: 3000 }).toBe(true);
    expect((await storedClass(page, '3b Celle'))?.data
        ?.some((r: any) => r.Navn === 'Zenia Ændret') ?? false).toBe(false);
});
