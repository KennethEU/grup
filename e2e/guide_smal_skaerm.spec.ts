import { test, expect } from '@playwright/test';
import { DEFAULT_CSV } from './helpers';

// Telefonbeskeden ("grup.dk er lavet til computer") er også et <dialog> med
// klassen .recipe-dialog, og den står FØR opskriftens vindue på siden. Den
// bliver liggende (lukket) resten af sidevisningen, når læreren har trykket OK.
// Guiden fandt "opskriftens vindue" med $('.recipe-dialog') og fik så
// telefonbeskeden: trin 2-5 blev flyttet ind i et lukket vindue og var usynlige.
// Det sker første gang, en lærer åbner Grupper i et vindue under 700 px — fx
// en halv skærm på en bærbar. (Fundet 3/11 2026.)

test('Guiden til opskriften står synligt, efter at telefonbeskeden er lukket', async ({ page }) => {
    await page.setViewportSize({ width: 690, height: 900 });
    // Kun guiderne slås fra — telefonbeskeden skal komme
    await page.addInitScript(() => {
        try {
            localStorage.setItem('grupper-opskrift-guide-set', '1');
            localStorage.setItem('grupper-elevliste-guide-set', '1');
        } catch { /* */ }
    });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).appDebug?.pyBridge?.isReady === true, null, { timeout: 120000 });

    const notice = page.locator('dialog.small-screen');
    await expect(notice).toHaveAttribute('open', '');
    await notice.getByRole('button', { name: 'OK' }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    // Opret en klasse UDEN at genindlæse (så beskeden bliver på siden)
    await page.getByRole('button', { name: 'Indsæt klasseliste fra Excel / Sheets' }).click();
    await page.getByRole('button', { name: 'Indsæt tekst / Excel' }).click();
    await page.getByPlaceholder('F.eks. 1.g Dansk').fill('Smal skærm');
    await page.locator('textarea:visible').first().fill(DEFAULT_CSV);
    await page.getByRole('button', { name: /Opret klasse/i }).click();
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 30000 });

    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    // Uden grupper åbner opskriften selv — luk den, og hent guiden
    const recipe = page.locator('.recipe-layout > dialog.recipe-dialog');
    await expect(recipe).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.locator('#topbar-guide-btn').click();
    await expect(page.locator('#rguide-title')).toHaveText('Gruppeopskriften');

    // Alle trin (uden grupper: 5). Trin 2-5 åbner opskriften, og guiden skal
    // stå i DEN — synligt, med hullet om noget og kortet på skærmen. Trin 5's
    // "Dan grupper"-knap har samme klasser som telefonbeskedens OK-knap.
    const card = page.locator('.rguide__card');
    const titles = ['Gruppeopskriften', 'Ordene er knapper', 'Regler', 'Emner', 'Dan grupper'];
    await expect(card).toContainText(`1 af ${titles.length}`);
    for (const [i, title] of titles.entries()) {
        await expect(page.locator('#rguide-title')).toHaveText(title);
        if (i > 0) {
            await expect(recipe).toHaveAttribute('open', '');
            await expect(recipe.locator('.rguide__card')).toBeVisible();
        }
        await expect(notice.locator('.rguide')).toHaveCount(0);
        await expect.poll(async () => (await page.locator('.rguide__hole').boundingBox())?.width ?? 0).toBeGreaterThan(0);
        await page.waitForTimeout(250);
        const box = await card.boundingBox();
        const vp = page.viewportSize()!;
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
        await card.getByRole('button', { name: /Næste|Færdig/ }).click();
    }

    // Færdig: opskriften lukker igen (den var lukket, da guiden begyndte), og
    // fokus står på "Vis guide"
    await expect(card).toHaveCount(0);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('#topbar-guide-btn')).toBeFocused();
});
