import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, generateGroups, openRecipe } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lav skærm og browser-zoom (gennemsynet 24/9 2026). En 1280×720-projektor
// har ca. 600 px tilbage under browserens værktøjslinje, og en bærbar på
// 1366×768 med 150 % zoom har 911×433 CSS-pixel. Regler-skuffen gik dér ned
// bag bundbjælken (eller under vindueskanten), så "Tilføj ny regel" ikke
// kunne nås, og "Gendan grupper"-knappen blev klemt til 20 px. Skufferne er
// væk (2/11 2026); opskriftens vindue skal holde det samme løfte.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CSV = 'Navn\tKøn\tKarakter\tSprog\tNiveau\n' + Array.from({ length: 24 }, (_, i) =>
    `Elev ${i + 1}\t${i % 2 ? 'M' : 'K'}\t${[2, 4, 7, 10, 12][i % 5]}\t${i % 3 ? 'Tysk' : 'Fransk'}\t${['Lav', 'Middel', 'Høj'][i % 3]}`).join('\n');

/** Ligger elementets midtpunkt synligt øverst — altså klikbart? */
async function isTopmost(page: Page, selector: string) {
    return page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (y < 0 || y >= innerHeight) return false;
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit));
    }, selector);
}

async function setup(page: Page) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await createClass(page, 'Lav skærm', CSV);
    await page.evaluate(() => {
        (window as any).appDebug.state.currentClass.rules = [
            { type: 'distribute', column: 'Køn', value: '' },
            { type: 'balance', column: 'Karakter', value: '' },
            { type: 'distribute', column: 'Sprog', value: '' },
            { type: 'distribute', column: 'Niveau', value: '' },
            { type: 'cluster', column: 'Sprog', value: '' },
        ];
    });
    await goToGroups(page);
    await generateGroups(page);
    // Beskederne efter kørslen står oven på skufferne i et par sekunder.
    await page.locator('.toast').evaluateAll(ts => ts.forEach(t => t.remove()));
}

for (const [w, h] of [[1280, 600], [911, 433]]) {
    test(`opskriften holder "+ Tilføj regel" synlig ved ${w}x${h}`, async ({ page }) => {
        await setup(page);
        await page.setViewportSize({ width: w, height: h });
        await openRecipe(page);
        await expect(page.locator('.recipe__add button')).toBeVisible();
        expect(await isTopmost(page, '.recipe__add button')).toBe(true);
        // Reglerne ruller inde i vinduet i stedet — den sidste kan stadig nås.
        const body = page.locator('dialog.recipe-dialog[open] .recipe-dialog__body');
        expect(await body.evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
    });
}

test('emnernes felt kan nås med mange emner på en lav skærm', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
        (window as any).appDebug.state.currentClass.topics = Array.from({ length: 30 }, (_, i) => 'Emne nummer ' + (i + 1));
    });
    await page.setViewportSize({ width: 911, height: 433 });
    const dialog = await openRecipe(page);
    // Rul ordet frem FØR klikket, som en lærer gør. Playwrights eget klik
    // ruller i samme øjeblik, og rulningen lukker menuen (RecipeToken lukker
    // ved rulning bagved), så testen målte ellers sit eget greb.
    const token = dialog.locator('.rtok__btn[aria-label^="Emner:"]');
    await token.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await token.click();
    await expect(dialog.locator('.recipe-topics__input')).toBeVisible();
    await page.waitForTimeout(300);
    expect(await isTopmost(page, '.recipe-topics__input')).toBe(true);
});

test('Gendan-knappen beholder sin fulde højde på en lav skærm', async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width: 911, height: 433 });
    await page.getByRole('button', { name: 'Gendan', exact: true }).click();
    const btn = page.locator('.modal-content .btn.primary.full-width');
    await expect(btn).toBeVisible();
    await page.waitForTimeout(300);
    expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(33);
});

test('"Alle til stede" virker med tastaturet', async ({ page }) => {
    await createClass(page);
    const box = page.getByRole('checkbox', { name: 'Alle til stede' });
    await box.focus();
    await page.keyboard.press('Space');
    const excluded = await page.evaluate(() =>
        (window as any).appDebug.state.currentClass.data.every(r => r._excluded));
    expect(excluded).toBe(true);
    await expect(box).not.toBeChecked();
    // Og et klik på selve feltet skifter kun én gang.
    await box.click();
    const present = await page.evaluate(() =>
        (window as any).appDebug.state.currentClass.data.every(r => !r._excluded));
    expect(present).toBe(true);
    await expect(box).toBeChecked();
});
