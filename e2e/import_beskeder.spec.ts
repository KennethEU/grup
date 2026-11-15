import { test, expect, type Page } from '@playwright/test';
import * as XLSX from '../src/vendor/xlsx.mjs';
import { createClass, goToGroups, closeRecipe } from './helpers';

/**
 * Importens beskeder skal stå på skærmen, når den nye klasse er åbnet.
 *
 * NotificationManager rydder info- og succesbeskeder, når fanen i klassen
 * skifter ("en besked hører til det sted, den blev givet"). En import åbner
 * den nye klasse på Elevliste — og stod læreren på Grupper eller Historik, før
 * hun gik til Import & backup, var det ET fanskifte. Så forsvandt både
 * "1 klasse oprettet!" og importens advarsler i samme øjeblik, de kom: at en
 * skjult kolonne (fx CPR) kom med, at skjulte rækker kom med, at flettede
 * celler blev fyldt ud. Ved en fil er der intet udsnit, så beskeden er det
 * eneste, læreren får at vide (156. gennemsyn, (179)).
 */

/** Et ark, der udløser alle importens beskeder på én gang. Opdigtede navne. */
function buildNoisyWorkbook(): Buffer {
    const rows: (string | number)[][] = [['Navn', 'Klasse', 'CPR', 'Karakter']];
    ['Anna Holm', 'Bo Lund', 'Cecilie Dam', 'Dennis Ravn', 'Eva Krog', 'Frej Moos']
        .forEach((name, i) => rows.push([name, i === 0 ? '2a' : '', `0101${i}`, 7]));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = [{ s: { r: 1, c: 1 }, e: { r: 6, c: 1 } }];   // "2a" flettet ned
    ws['!rows'] = [];
    ws['!rows'][3] = { hidden: true };                            // en skjult elev
    ws['!cols'] = [{}, {}, { hidden: true }, {}];                 // CPR skjult
    const notes = XLSX.utils.aoa_to_sheet([['Noter'], ['intet her']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Elever');
    XLSX.utils.book_append_sheet(wb, notes, 'Noter');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellStyles: true });
}

/** Stå på Grupper i en eksisterende klasse, og gå derfra til Import & backup. */
async function fromGroupsToImport(page: Page) {
    await createClass(page, 'Første klasse');
    await goToGroups(page);
    await closeRecipe(page);
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
}

const info = (page: Page) => page.locator('.toast.info:not(.toast-leave-active)');
const success = (page: Page) => page.locator('.toast.success:not(.toast-leave-active)');

test('Excel-import fra Grupper: advarslerne og "oprettet" står stadig, når klassen er åbnet', async ({ page }) => {
    await fromGroupsToImport(page);
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.locator('input[type="file"]').setInputFiles({
        name: 'larm.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: buildNoisyWorkbook(),
    });
    await page.getByRole('button', { name: /Importér Filer/i }).click();
    await page.getByRole('radio', { name: 'Elever' }).check();
    await page.getByRole('button', { name: 'Importér dette ark' }).click();

    // Den nye klasse er åbnet på Elevliste.
    await expect(page.locator('tbody').getByText('Frej Moos')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.nav-tab.active')).toHaveText(/Elevliste/);

    // Beskederne står der stadig — også et øjeblik efter (de forsvandt før
    // i samme tegning, som klassen kom).
    await page.waitForTimeout(600);
    await expect(success(page)).toHaveText(/1 klasse oprettet/);
    await expect(info(page)).toHaveCount(1);
    const text = await info(page).locator('.toast-message').textContent();
    expect(text).toContain('Kolonne C var skjult');
    expect(text).toContain('1 række var skjult');
    expect(text).toContain('flettet sammen');
    // Ental: "Det andet ark", ikke "De øvrige 1 ark".
    expect(text).toContain('Det andet ark i filen blev ikke rørt');
    expect(text).not.toContain('øvrige 1 ark');
    // Det, læreren skal gøre noget ved, kommer først; arket, hun lige selv
    // har valgt, sidst — beskeden ruller efter 9em, og det nederste ses ikke
    // uden at rulle.
    expect(text!.indexOf('Kolonne C var skjult')).toBeLessThan(text!.indexOf('flettet sammen'));
    expect(text!.indexOf('flettet sammen')).toBeLessThan(text!.indexOf('Det andet ark'));
});

test('Indsæt fra Grupper: "Klasse oprettet!" står stadig, når klassen er åbnet', async ({ page }) => {
    await fromGroupsToImport(page);
    await page.getByRole('button', { name: 'Indsæt tekst / Excel' }).click();
    await page.getByPlaceholder('F.eks. 1.g Dansk').fill('Anden klasse');
    await page.locator('textarea:visible').first().fill('Navn\nGry Sand\nHans Vig\nIda Bæk');
    await page.getByRole('button', { name: /Opret klasse/i }).click();

    await expect(page.locator('tbody').getByText('Hans Vig')).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(600);
    await expect(success(page)).toHaveText(/Klasse oprettet/);
});

test('Et almindeligt fanskifte i klassen rydder stadig info-beskeder', async ({ page }) => {
    // Den gamle regel skal stå: en besked givet på Elevliste følger ikke med
    // over på Grupper.
    await createClass(page, 'Tredje klasse');
    await page.evaluate(() => (window as any).notifyInfo('En besked om elevlisten'));
    await expect(info(page)).toHaveCount(1);
    await goToGroups(page);
    await expect(info(page)).toHaveCount(0);
});
