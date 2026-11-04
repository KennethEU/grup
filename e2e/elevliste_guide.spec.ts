import { test, expect, Page } from '@playwright/test';
import { createClass, DEFAULT_CSV } from './helpers';

// Guiden til elevlisten (StudentGuide.vue): den kommer af sig
// selv første gang, kan hentes igen med "Vis guide", og den ændrer intet.

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        try {
            localStorage.setItem('grupper-opskrift-guide-set', '1');
        } catch { /* uden lager vises guiden */ }
    });
});

const card = (page: Page) => page.locator('.rguide__card');

test('Kommer af sig selv første gang — og ikke igen efter genindlæsning', async ({ page }) => {
    await createClass(page, 'Guide Foerste', DEFAULT_CSV, { guides: true });
    await expect(card(page)).toBeVisible({ timeout: 5000 });
    await expect(card(page)).toContainText('Elevlisten');
    await card(page).getByRole('button', { name: 'Spring over' }).click();
    await expect(card(page)).toHaveCount(0);

    await page.reload();
    await expect(page.locator('#add-col-btn')).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(1200);
    await expect(card(page)).toHaveCount(0);
});

test('"Vis guide" viser alle trin, og hvert trin peger på noget', async ({ page }) => {
    await page.addInitScript(() => {
        try { localStorage.setItem('grupper-elevliste-guide-set', '1'); } catch { /* */ }
    });
    await createClass(page, 'Guide Knap');
    await page.waitForTimeout(1000);
    await expect(card(page)).toHaveCount(0);

    const before = await page.locator('#tab-students').innerText();
    await page.locator('#topbar-guide-btn').click();
    const titles = ['Elevlisten', 'Overskrifterne', 'Mødt', 'Elever og kolonner', 'Kategoriser og Ranger', 'Lav aftale', 'Vis'];
    await expect(card(page)).toContainText(`1 af ${titles.length}`);
    for (const title of titles) {
        await expect(page.locator('#rguide-title')).toHaveText(title);
        // Hullet og kortet placeres et øjeblik efter titlen skifter
        await expect.poll(async () => (await page.locator('.rguide__hole').boundingBox())?.width ?? 0).toBeGreaterThan(0);
        await expect(card(page)).toBeVisible();
        await page.waitForTimeout(250);
        // Kortet står helt på skærmen
        const box = await card(page).boundingBox();
        const vp = page.viewportSize()!;
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
        await card(page).getByRole('button', { name: /Næste|Færdig/ }).click();
    }
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#topbar-guide-btn')).toBeFocused();
    // Guiden har ikke ændret noget på listen
    expect(await page.locator('#tab-students').innerText()).toBe(before);
});

test('"Vis guide" står samme sted på Elevliste og Grupper — og åbner den rigtige guide', async ({ page }) => {
    await page.addInitScript(() => {
        try { localStorage.setItem('grupper-elevliste-guide-set', '1'); } catch { /* */ }
    });
    await createClass(page, 'Guide Sted');
    const btn = page.locator('#topbar-guide-btn');
    const onStudents = await btn.boundingBox();

    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    // Uden grupper åbner opskriften selv og dækker bjælken — luk den
    await expect(page.locator('dialog.recipe-dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(await btn.boundingBox()).toEqual(onStudents);
    await btn.click();
    await expect(page.locator('#rguide-title')).toHaveText('Gruppeopskriften');
    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);

    // Historik har ingen guide: knappen er væk, men pladsen er der stadig
    await page.locator('.nav-tab').filter({ hasText: 'Historik' }).click();
    await expect(btn).toBeHidden();
    expect(await btn.boundingBox()).toEqual(onStudents);
});

// Guiden venter 0,7 sek., før den kommer. Skiftede læreren fane i ventetiden,
// løb ventetiden alligevel ud, gemte "set" og fandt intet at pege på — så kom
// guiden aldrig. Nu kommer den næste gang, elevlisten vises. (Fundet 3/11 2026.)
test('Skifter læreren fane, før guiden kommer, kommer den næste gang', async ({ page }) => {
    await createClass(page, 'Guide Fane', DEFAULT_CSV, { guides: true });
    // Straks videre til Historik (intet vindue dér, som ellers ville få
    // guiden til at vente af sig selv)
    await page.locator('.nav-tab').filter({ hasText: 'Historik' }).click();
    await page.waitForTimeout(1500);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('grupper-elevliste-guide-set'))).toBeNull();
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    await expect(card(page)).toBeVisible({ timeout: 5000 });
    await expect(card(page)).toContainText('Elevlisten');
});
