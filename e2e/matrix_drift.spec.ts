import { test, expect } from '@playwright/test';
import { createClassAndGoToGroups, generateGroups, goToMatrix, goToStandard } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Matrixen er dannet på et andet billede, end det der står nu.
//
// Matrixgrupper dannes PÅ TVÆRS af stamgrupperne. Flytter læreren bagefter en
// elev i hånden, rører det kun stamgrupperne: matrixen bliver stående og er nu
// skæv — to elever fra samme stamgruppe i én matrixgruppe, og en anden
// stamgruppe uden repræsentant. Vi danner ikke om af os selv (læreren kan have
// rettet i matrixen), men hun skal have det at vide, og en knap at gøre det med.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Skift mellem stamgrupperne og matrix-runden (knapperne i opskriftens bjælke). */
async function viewName(page, viewLabel: 'Grupper' | 'Matrix') {
    if (viewLabel === 'Matrix') await goToMatrix(page);
    else await goToStandard(page);
}

/** Dan stamgrupper, gå til matrix-runden, og dan matrixen. */
async function homeAndMatrix(page) {
    await generateGroups(page);
    await viewName(page, 'Matrix');
    // Uden matrix åbner opskriftens vindue af sig selv; "Dan matrixgrupper".
    await generateGroups(page);
    // Vent på at aftrykket er skrevet ned — DET er signalet om at matrixen
    // hører til de stamgrupper der står nu.
    await expect.poll(
        () => page.evaluate(() => !!(window as any).appDebug.state.matrixSourceFingerprint),
        { timeout: 90000 }
    ).toBe(true);
}

const hint = (page) => page.locator('.gh-hint', { hasText: 'Stamgrupperne er ændret' });

test('en flyttet elev i stamgrupperne udløser hintet i Matrix-visningen', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix drift');
    await homeAndMatrix(page);

    // Intet er rørt endnu.
    await expect(hint(page)).toHaveCount(0);

    // Flyt en elev i stamgrupperne med markér-og-flyt.
    await viewName(page, 'Grupper');
    await page.locator('.group-card').first().locator('li').first().click();
    await page.locator('.group-card').nth(1).locator('.receive-picked-btn').click();

    await viewName(page, 'Matrix');
    await expect(hint(page)).toBeVisible();
    // Teksten skal advare om BEGGE dele — at antallet af matrixgrupper kan
    // ændre sig er præcis det, en lærer bliver overrasket over.
    await expect(hint(page)).toContainText(/antallet af matrixgrupper/);
});

test('en LÅST stamgruppe er ikke en ændring — og må ikke advare', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix laas');
    await homeAndMatrix(page);

    // At låse en stamgruppe ændrer ikke hvem der står i den, så matrixen er
    // lige så gyldig bagefter. Et hint her ville være et falsk alarm — og et
    // hint man lærer at klikke væk, er værre end intet hint.
    await viewName(page, 'Grupper');
    await page.locator('.group-card').first().locator('.lock-btn').click();

    await viewName(page, 'Matrix');
    await expect(hint(page)).toHaveCount(0);
});

test('knappen danner matrixen igen, og hintet forsvinder', async ({ page }) => {
    await createClassAndGoToGroups(page, 'Matrix dan igen');
    await homeAndMatrix(page);

    await viewName(page, 'Grupper');
    await page.locator('.group-card').first().locator('li').first().click();
    await page.locator('.group-card').nth(1).locator('.receive-picked-btn').click();

    await viewName(page, 'Matrix');
    await expect(hint(page)).toBeVisible();

    await page.locator('.gh-hint-action', { hasText: 'Dan matrixen igen' }).click();

    // Den nye matrix er dannet ud fra de stamgrupper der står nu — så er der
    // ikke længere noget at advare om.
    await expect(hint(page)).toHaveCount(0, { timeout: 90000 });
});
