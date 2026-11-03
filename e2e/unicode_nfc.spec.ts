import { test, expect } from '@playwright/test';
import { createClass, goToGroups, addRecipeRule } from './helpers';

// Det samme bogstav kan gemmes på to måder: "å" som ÉT tegn (NFC) eller som
// "a" + en kombinerende ring (NFD). De ser ens ud på skærmen, men er to
// forskellige tekster for computeren. NFD kommer typisk med tekst, der er
// kopieret ud af en PDF på en Mac. Før blev "Århus" og "Århus" to værdier:
// to ens linjer i Adskil-listen, og motoren holdt dem ude fra hinanden.

const RING = '̊';                   // kombinerende ring over
const NFC_AARHUS = 'Århus';         // Å som ét tegn
const NFD_AARHUS = 'A' + RING + 'rhus';  // A + ring

const CSV =
    'Navn\tBy\n' +
    `Anna\t${NFC_AARHUS}\nBob\t${NFD_AARHUS}\nClara\t${NFC_AARHUS}\n` +
    `David\t${NFD_AARHUS}\nEmma\tOdense\nFrank\tOdense\n` +
    `Gitte\tOdense\nHans\t${NFD_AARHUS}`;

test('importen gemmer "Århus" på én måde, uanset hvordan det kom ind', async ({ page }) => {
    await createClass(page, 'NFC import', CSV);
    const byValues = await page.evaluate(() =>
        (window as any).appDebug.state.currentClass.data.map((r: any) => r.By));
    expect(new Set(byValues)).toEqual(new Set([NFC_AARHUS, 'Odense']));
});

test('Adskil viser "Århus" én gang, også i en klasse gemt før rettelsen', async ({ page }) => {
    await createClass(page, 'NFC regel', CSV);
    // Efterlign en klasse, der blev importeret FØR rettelsen: halvdelen står
    // stadig med a + ring i browserens lager.
    await page.evaluate((nfd) => {
        const s = (window as any).appDebug.state;
        s.currentClass.data.forEach((r: any, i: number) => { if (i % 2 === 1 && r.By !== 'Odense') r.By = nfd; });
    }, NFD_AARHUS);
    await goToGroups(page);
    const line = await addRecipeRule(page, { type: 'Adskil', column: 'By' });
    await line.locator('.rtok__btn[aria-label^="Værdi:"]').click();
    const options = await line.locator('.rtok__pop .recipe-opt').allTextContents();
    const aarhus = options.filter(o => o.normalize('NFC') === NFC_AARHUS);
    expect(aarhus).toHaveLength(1);
});

test('en celle, der får indsat a + ring, gemmes som ét tegn', async ({ page }) => {
    await createClass(page, 'NFC celle', CSV);
    const cell = page.locator('td[contenteditable]').filter({ hasText: 'Odense' }).first();
    await cell.click();
    await cell.evaluate((el, nfd) => { el.textContent = nfd; }, NFD_AARHUS);
    await page.locator('th').filter({ hasText: 'Navn' }).click();
    const byValues = await page.evaluate(() =>
        (window as any).appDebug.state.currentClass.data.map((r: any) => r.By));
    expect(byValues.filter((v: string) => v.normalize('NFC') === NFC_AARHUS)
        .every((v: string) => v === NFC_AARHUS)).toBe(true);
    expect(byValues.filter((v: string) => v === NFC_AARHUS)).toHaveLength(6);
});

test('en gammel klasse med a + ring bliver rettet og gemt, når den åbnes', async ({ page }) => {
    await createClass(page, 'NFC migrering', CSV);
    // Skriv a + ring direkte i lageret — sådan lå en klasse importeret før
    // rettelsen — og indlæs siden igen.
    await page.evaluate((nfd) => {
        const all = JSON.parse(localStorage.getItem('grupdk_classes')!);
        all[0].content.data[0].By = nfd;
        localStorage.setItem('grupdk_classes', JSON.stringify(all));
    }, NFD_AARHUS);
    await page.reload();
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 30000 });
    await expect.poll(() => page.evaluate(() => {
        const all = JSON.parse(localStorage.getItem('grupdk_classes')!);
        return all[0].content.data[0].By;
    })).toBe(NFC_AARHUS);
    const inState = await page.evaluate(() => (window as any).appDebug.state.currentClass.data[0].By);
    expect(inState).toBe(NFC_AARHUS);
});
