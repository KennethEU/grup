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

// 114. gennemsyn (13/11 2026): appen kunne selv gemme "Århus" to gange i
// emnelisten før 1fa350fb (tastet + kopieret ud af en PDF). Motoren tæller
// listen, som den står, og fik ét emne for meget. Når klassen åbnes, ryddes
// listen op, og gruppens emne får listens stavemåde.
test('en emneliste med "Århus" to gange bliver til én, når klassen åbnes', async ({ page }) => {
    await createClass(page, 'NFC emner', CSV);
    const filename = await page.evaluate(({ nfc, nfd }) => {
        const all = JSON.parse(localStorage.getItem('grupdk_classes')!);
        const cls = all[0];
        cls.content.topics = [nfd, 'Odense', nfc];
        localStorage.setItem('grupdk_classes', JSON.stringify(all));
        const ids = cls.content.data.map((r: any) => r._rowId);
        const groups = [
            { name: 'Group 1', members: ids.slice(0, 4), topic: nfd },
            { name: 'Group 2', members: ids.slice(4), topic: 'Odense' },
        ];
        localStorage.setItem('grupdk_groups_' + cls.filename, JSON.stringify({ standard: groups, matrix: null }));
        localStorage.setItem('grupdk_topics_' + cls.filename, JSON.stringify({ 'S_Group 1': nfd, 'S_Group 2': 'Odense' }));
        return cls.filename;
    }, { nfc: NFC_AARHUS, nfd: NFD_AARHUS });
    await page.reload();
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 30000 });
    await expect.poll(() => page.evaluate(() =>
        JSON.parse(localStorage.getItem('grupdk_classes')!)[0].content.topics)).toEqual([NFC_AARHUS, 'Odense']);
    const topicMap = await page.evaluate((f) => JSON.parse(localStorage.getItem('grupdk_topics_' + f)!), filename);
    expect(topicMap['S_Group 1']).toBe(NFC_AARHUS);
    await goToGroups(page);
    // Emnevælgeren matcher præcist: med den gamle stavemåde stod den tom.
    const select = page.locator('.group-card select.topic-select').first();
    await expect(select).toHaveValue(NFC_AARHUS);
    await expect(select.locator('option')).toHaveCount(3);   // Intet emne, Århus, Odense
});
