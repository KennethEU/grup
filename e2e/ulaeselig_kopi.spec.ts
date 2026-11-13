import { test, expect } from '@playwright/test';
import { gotoAppReady } from './helpers';

// Boksen under Import & backup for en klasseliste, der ikke kunne læses, og
// som Grupper har lagt til side (UnreadableCopyNotice.vue). Kenneth sagde ja
// 13/11 2026: kopien indeholder elevnavne og blev aldrig slettet af appen.

const KEY = 'grupdk_unreadable_classes';
const RAW = '{ødelagt [ "Anna Testesen", "Bo"';

async function openImportBackup(page) {
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
}

test('ingen boks, når der ikke ligger en kopi', async ({ page }) => {
    await gotoAppReady(page);
    await openImportBackup(page);
    await expect(page.getByRole('heading', { name: /ligger gemt til side/ })).toHaveCount(0);
});

test('kopien kan gemmes som fil og slettes efter en bekræftelse', async ({ page }) => {
    await page.addInitScript(([k, v]) => {
        // Kun første indlæsning: ellers lægger reload kopien tilbage.
        if (!sessionStorage.getItem('kopi-lagt')) {
            localStorage.setItem(k, v);
            sessionStorage.setItem('kopi-lagt', '1');
        }
    }, [KEY, RAW]);
    await gotoAppReady(page);
    await openImportBackup(page);

    const box = page.locator('section.unreadable-copy');
    await expect(box.getByRole('heading', { name: /ligger gemt til side/ })).toBeVisible();

    // "Gem som fil" giver den rå tekst, præcis som den lå.
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        box.getByRole('button', { name: 'Gem som fil' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^grupdk_ulaeselig_klasseliste_.*\.txt$/);
    const path = await download.path();
    const fs = await import('node:fs');
    expect(fs.readFileSync(path, 'utf8')).toBe(RAW);

    // "Annuller" lader kopien ligge.
    await box.getByRole('button', { name: 'Slet den' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Annuller' }).click();
    expect(await page.evaluate(k => localStorage.getItem(k), KEY)).toBe(RAW);
    await expect(box).toBeVisible();

    // "Slet" fjerner den, og boksen går.
    await box.getByRole('button', { name: 'Slet den' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Slet', exact: true }).click();
    await expect(box).toHaveCount(0);
    expect(await page.evaluate(k => localStorage.getItem(k), KEY)).toBeNull();

    // Og den kommer ikke igen efter en genindlæsning.
    await page.reload();
    await openImportBackup(page);
    await expect(page.locator('section.unreadable-copy')).toHaveCount(0);
});
