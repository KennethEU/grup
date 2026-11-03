import { test, expect } from '@playwright/test';
import { gotoAppReady } from './helpers';

/**
 * Nyheder: "Alt" / "Kun nye funktioner".
 *
 * Rettelser fylder langt det meste af listen, så de nye funktioner drukner i
 * dem. Filteret er lærerens vej til at se hvad programmet er blevet i stand
 * til, uden at scrolle forbi tyve fejlrettelser for hver funktion.
 *
 * ALLE opslag sker INDE i <dialog>, aldrig med page.getByText() på hele
 * siden: nyheds-teksterne citerer selve brugerfladen ("Tryk 'Ranger' i
 * Elevliste…"), så en global tekst-søgning rammer nyheden i stedet for
 * knappen — eller flere ting på én gang.
 */

/** Nyheds-visningen, åbnet fra stjerneknappen i topbaren. */
async function openNews(page) {
    await gotoAppReady(page);
    await page.getByRole('button', { name: 'Nyheder & opdateringer' }).click();
    const dialog = page.locator('dialog.news-dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    return dialog;
}

test('"Kun nye funktioner" skjuler rettelserne — og siger hvor mange', async ({ page }) => {
    const dialog = await openNews(page);

    // Udgangspunktet er ALT: en lærer der aldrig rører filteret, skal se hele
    // historikken. Der er langt flere rettelser end funktioner, så begge slags
    // er med fra start.
    const allEntries = await dialog.locator('.news-entry').count();
    expect(await dialog.locator('.news-entry.is-fix').count()).toBeGreaterThan(0);
    expect(await dialog.locator('.news-entry.is-feature').count()).toBeGreaterThan(0);

    await dialog.getByRole('button', { name: 'Kun nye funktioner' }).click();

    // Ikke ÉN rettelse tilbage — og listen er blevet kortere, så vi ved at
    // filteret faktisk gjorde noget og ikke bare lod alt stå.
    await expect(dialog.locator('.news-entry.is-fix')).toHaveCount(0);
    const onlyNew = await dialog.locator('.news-entry').count();
    expect(onlyNew).toBeGreaterThan(0);
    expect(onlyNew).toBeLessThan(allEntries);

    // Tallet skal siges højt. Uden det ser det ud som om der bare ikke er
    // sket mere, og læreren opdager aldrig at hun har skjult noget.
    await expect(dialog.locator('.filter-note'))
        .toHaveText(`${allEntries - onlyNew} rettelser er skjult`);
});

test('"Alt" henter rettelserne frem igen', async ({ page }) => {
    const dialog = await openNews(page);
    const allEntries = await dialog.locator('.news-entry').count();

    await dialog.getByRole('button', { name: 'Kun nye funktioner' }).click();
    await expect(dialog.locator('.news-entry.is-fix')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Alt', exact: true }).click();
    await expect(dialog.locator('.news-entry')).toHaveCount(allEntries);
    await expect(dialog.locator('.filter-note')).toHaveCount(0);
});

test('Valget huskes til næste gang', async ({ page }) => {
    let dialog = await openNews(page);
    await dialog.getByRole('button', { name: 'Kun nye funktioner' }).click();
    await expect(dialog.locator('.news-entry.is-fix')).toHaveCount(0);

    // Hele siden hentes forfra — det er dét en lærer gør mellem to timer.
    dialog = await openNews(page);
    await expect(dialog.locator('.news-entry.is-fix')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Kun nye funktioner' }))
        .toHaveAttribute('aria-pressed', 'true');
});

test('Filteret kan betjenes uden mus', async ({ page }) => {
    const dialog = await openNews(page);
    const onlyNew = dialog.getByRole('button', { name: 'Kun nye funktioner' });

    await onlyNew.focus();
    await expect(onlyNew).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(dialog.locator('.news-entry.is-fix')).toHaveCount(0);
    await expect(onlyNew).toHaveAttribute('aria-pressed', 'true');
});

// Omdøbning af interne værdier må ikke nulstille et gemt filtervalg.
test('det tidligere filtervalg bevares og gemmes med engelsk værdi', async ({ page }) => {
    await gotoAppReady(page);
    await page.evaluate(() => localStorage.setItem('grupdk_news_filter', 'nye'));
    const dialog = await openNews(page);
    await expect(dialog.locator('.news-entry.is-fix')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Alt', exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('grupdk_news_filter'))).toBe('all');
    await dialog.getByRole('button', { name: 'Kun nye funktioner' }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('grupdk_news_filter'))).toBe('features');
});

test('et tryk der starter i teksten og slippes på baggrunden lukker ikke nyhedsvinduet', async ({ page }) => {
    const dialog = await openNews(page);
    const box = await dialog.locator('.news-content').boundingBox();
    // Tryk NED på en nyhed, træk ud på baggrunden og slip: markering af tekst
    // der overskyder vinduet er ikke et "klik udenfor".
    await page.mouse.move(box.x + 40, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x - 12, box.y + 60);
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    // Et rigtigt klik på baggrunden lukker stadig.
    await page.mouse.click(box.x - 12, box.y + 60);
    await expect(dialog).toBeHidden();
});
