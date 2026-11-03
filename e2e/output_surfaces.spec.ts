import { test, expect, Page } from '@playwright/test';
import { createClass, goToGroups, generateGroups, goToMatrix, DEFAULT_CSV } from './helpers';
import * as XLSX from '../src/vendor/xlsx.mjs';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UDGANGENE: udskrift, kopiér-til-udklipsholder og Excel-eksport.
//
// De tre flader er de eneste steder hvor data forlader programmet, og de er
// derfor de sidste der opdager en ændring inde i motoren. Da elev-identitet
// blev skilt fra det viste navn, bar gruppemedlemmer ikke længere navnet med
// sig — og udskriften og matrix-kopieringen skrev interne id'er ("r7") i
// stedet for "Anna", uden at én eneste test brokkede sig.
//
// Testene her går HELE vejen gennem den rigtige motor, så de fanger det
// igen: grupperne dannes af motoren, ikke af håndlavede id'er.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Navnene fra DEFAULT_CSV — dem der SKAL stå på udgangene. */
const STUDENT_NAMES = ['Anna', 'Bob', 'Clara', 'David', 'Emma', 'Frank',
    'Gitte', 'Hans', 'Ida', 'Jens', 'Karen', 'Lars'];

/** Ligner strengen et gammelt eller nyt internt række-id? */
const INTERNAL_ID = /\br(?:\d+|-[a-f0-9]{16,32})\b/;

/**
 * Kald openOverview() og returnér den HTML den ville skrive i printvinduet.
 * window.open erstattes midlertidigt, så der ikke popper et vindue op.
 */
async function getPrintHtml(page: Page): Promise<string> {
    return await page.evaluate(async () => {
        const mod = await import('/src/js/modules/overview.js');
        let html = '';
        const originalOpen = window.open;
        (window as any).open = () => ({
            document: { write: (h: string) => { html += h; }, close() {} },
        });
        try { mod.openOverview(); } finally { window.open = originalOpen; }
        return html;
    });
}

/** Byg den tekst der ville lande i udklipsholderen. */
async function getClipboardText(page: Page, isMatrix: boolean, includeSource = false): Promise<string> {
    return await page.evaluate(async ([m, k]) => {
        const ga = await import('/src/js/modules/groupActions.js');
        return ga.buildGroupsClipboardText(m as boolean, k as boolean) ?? '';
    }, [isMatrix, includeSource]);
}

test('Udskriften viser elevnavne — ikke interne id\'er', async ({ page }) => {
    await createClass(page, 'Udskrift Test');
    await goToGroups(page);
    await generateGroups(page);

    const html = await getPrintHtml(page);

    // Hver elev skal stå på papiret, præcis én gang.
    for (const name of STUDENT_NAMES) {
        expect(html, `${name} mangler i udskriften`).toContain(name);
    }

    // Og der må ikke stå et råt id nogen steder i selve grupperne.
    const studentLines = html.match(/<li>[\s\S]*?<\/li>/g) ?? [];
    expect(studentLines.length).toBeGreaterThan(0);
    for (const line of studentLines) {
        expect(line, `internt id lækket til udskriften: ${line}`).not.toMatch(INTERNAL_ID);
    }
});

test('Udskriften følger lærerens valgte visningskolonne', async ({ page }) => {
    // Alias adskiller sig fra Navn, så vi kan se HVILKEN kolonne der bruges.
    // Kolonnen må ikke selv hedde noget med "navn" — createClass venter på en
    // th der indeholder "Navn", og to træffere er en strict-mode-fejl.
    const csv = 'Navn\tAlias\tKøn\n'
        + 'Anna\tAnnasofie\tK\nBob\tBobby\tM\n'
        + 'Clara\tClarissa\tK\nDavid\tDave\tM\n';
    await createClass(page, 'Visningskolonne Test', csv);
    await goToGroups(page);

    await page.evaluate(() => { (window as any).appDebug.state.displayColumn = 'Alias'; });
    await generateGroups(page);

    const html = await getPrintHtml(page);
    expect(html).toContain('Annasofie');
    expect(html).toContain('Dave');
});

test('Kopiering leverer navne i både stam- og matrixvisning', async ({ page }) => {
    await createClass(page, 'Kopier Test');
    await goToGroups(page);
    await generateGroups(page);

    const standard = await getClipboardText(page, false);
    for (const name of STUDENT_NAMES) {
        expect(standard, `${name} mangler i stamgruppe-kopien`).toContain(name);
    }
    expect(standard).not.toMatch(INTERNAL_ID);

    // Matrix-runden: vinduet åbner, og "Dan matrixgrupper" danner dem.
    await goToMatrix(page);
    await generateGroups(page);

    const matrix = await getClipboardText(page, true);
    for (const name of STUDENT_NAMES) {
        expect(matrix, `${name} mangler i matrix-kopien`).toContain(name);
    }
    expect(matrix).not.toMatch(INTERNAL_ID);

    // "Kilde i parentes" må heller ikke lække id'er.
    const includeSource = await getClipboardText(page, true, true);
    expect(includeSource).toContain('(');
    expect(includeSource).not.toMatch(INTERNAL_ID);
});

test('Excel-eksporten holder interne felter ude og sladrer om tomme klasser', async ({ page }) => {
    await createClass(page, 'Eksport Test');

    // Læg en klasse UDEN elever ved siden af, så vi kan se at den nævnes.
    await page.evaluate(() => {
        (window as any).appDebug.pyBridge.createClass('Tom klasse', 'Navn,Køn', true);
    });

    // Fang beskeden og zip-blobben i stedet for at downloade den.
    await page.evaluate(() => {
        (window as any).__toasts = [];
        for (const k of ['notifySuccess', 'notifyError', 'notifyInfo']) {
            const originalNotify = (window as any)[k];
            (window as any)[k] = (msg: string) => {
                (window as any).__toasts.push(msg);
                return originalNotify && originalNotify(msg);
            };
        }
        (window as any).__blobs = [];
        const originalCreateObjectURL = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (b: any) => { (window as any).__blobs.push(b); return originalCreateObjectURL(b); };
    });

    // NB: knappen HEDDER "Eksporter" — "Eksportér klasser som backup eller fil"
    // er kun dens title-attribut, og den indgår ikke i det tilgængelige navn
    // når knappen har sin egen tekst.
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Eksportér', exact: true }).click();
    await page.getByRole('button', { name: /Vælg alle/i }).click();
    await page.getByRole('button', { name: /Download Excel-filer/i }).click();

    // Den tomme klasse skal nævnes ved navn — ikke springes over i stilhed.
    await expect.poll(
        async () => await page.evaluate(() => (window as any).__toasts.join(' | ')),
        { timeout: 15000 },
    ).toContain('Tom klasse');

    // Arket må ikke bære interne felter med ud til læreren.
    const rows = await page.evaluate(async () => {
        // src/vendor/, ikke node_modules: xlsx blev vendored ind ved
        // sikkerhedsreviewet (0.20.3 — npm's sidste udgave, 0.18.5, har to
        // kendte huller i fil-parsningen), og pakken er ikke længere en
        // dependency. Testene læste den gamle kopi, så længe den lå
        // tilbage i node_modules — og faldt først på en frisk klon.
        const XLSX: any = await import('/src/vendor/xlsx.mjs');
        const JSZipMod: any = await import('/node_modules/jszip/dist/jszip.min.js');
        const JSZip = (window as any).JSZip || JSZipMod.default;
        const blobs = (window as any).__blobs;
        const zip = await JSZip.loadAsync(blobs[blobs.length - 1]);
        const filenames = Object.keys(zip.files);
        const buf = await zip.files[filenames[0]].async('arraybuffer');
        const wb = XLSX.read(buf, { type: 'array' });
        return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    });

    expect(rows.length).toBeGreaterThan(0);
    for (const column of Object.keys(rows[0] as object)) {
        expect(column, `internt felt lækket til Excel: ${column}`).not.toMatch(/^_[^_]/);
    }
    expect(Object.keys(rows[0] as object)).toContain('Til stede');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fravær har to indgange: papirkurven på gruppekortet, og "Til stede"-
// fluebenet i elevlisten. Kun papirkurven fjerner eleven fra gruppen — så
// den anden vej efterlod hende stående på kortet, på udskriften og i den
// kopierede liste, præcis som alle andre. Testen går hele vejen: flueben
// af i elevlisten, og så kigges der på alle tre udgange.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test('En elev der markeres fraværende i elevlisten kan ses på alle udgange', async ({ page }) => {
    await createClass(page, 'Fravær Test');
    await goToGroups(page);
    await generateGroups(page);

    // Tilbage til elevlisten og fjern fluebenet ved Anna.
    await page.locator('.nav-tab').filter({ hasText: 'Elevliste' }).click();
    const annaRow = page.locator('tbody tr').filter({ hasText: 'Anna' }).first();
    await annaRow.locator('input[type="checkbox"]').nth(1).uncheck();

    // 1) Gruppekortet: Anna står der stadig, men markeret.
    await page.locator('.nav-tab').filter({ hasText: 'Grupper' }).click();
    const annaCard = page.locator('.group-members-list li').filter({ hasText: 'Anna' }).first();
    await expect(annaCard).toHaveClass(/absent/);

    // De øvrige elever er urørte.
    await expect(page.locator('.group-members-list li.absent')).toHaveCount(1);

    // 2) Udskriften.
    const html = await getPrintHtml(page);
    expect(html).toContain('fraværende');

    // 3) Den kopierede liste.
    const text = await getClipboardText(page, false);
    expect(text).toContain('Anna (fraværende)');
    expect(text).not.toContain('Bob (fraværende)');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Excel-filen indeholdt elevlisten som den kom IND — ikke et ord om hvem der
// endte i hvilken gruppe. Grupperne lå kun i localStorage, så den fil læreren
// tog med over i Excel (til Lectio, til en holdliste, til en kollega) sagde
// intet om værktøjets eneste resultat.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test('Excel-eksporten viser hvem der endte i hvilken gruppe', async ({ page }) => {
    await createClass(page, 'Gruppekolonne Test');
    await goToGroups(page);
    await generateGroups(page);

    await page.evaluate(() => {
        (window as any).__blobs = [];
        const originalCreateObjectURL = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (b: any) => { (window as any).__blobs.push(b); return originalCreateObjectURL(b); };
        HTMLAnchorElement.prototype.click = function () {};
    });

    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();
    await page.getByRole('button', { name: 'Eksportér', exact: true }).click();
    await page.getByRole('button', { name: /Vælg alle/i }).click();
    await page.getByRole('button', { name: /Download Excel-filer/i }).click();

    await expect.poll(
        async () => await page.evaluate(() => (window as any).__blobs.length),
        { timeout: 15000 },
    ).toBeGreaterThan(0);

    const rows = await page.evaluate(async () => {
        const XLSX: any = await import('/src/vendor/xlsx.mjs');
        const JSZipMod: any = await import('/node_modules/jszip/dist/jszip.min.js');
        const JSZip = (window as any).JSZip || JSZipMod.default;
        const zip = await JSZip.loadAsync((window as any).__blobs.at(-1));
        const filename = Object.keys(zip.files)[0];
        const wb = XLSX.read(await zip.files[filename].async('arraybuffer'), { type: 'array' });
        return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
    });

    expect(Object.keys(rows[0])).toContain('Stamgruppe');
    // Hver elev skal have en gruppe — og det skal være et gruppeNAVN, ikke et id.
    for (const r of rows) {
        expect(r['Stamgruppe'], `${r['Navn']} står uden gruppe i Excel-filen`).toMatch(/Gruppe/);
        expect(r['Stamgruppe']).not.toMatch(INTERNAL_ID);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Del-menuen i bundbjælken: grupperne som Excel-fil, klar til Lectio.
// Filen læses fra browserens RIGTIGE download, efter at motoren har dannet
// grupperne — samme princip som resten af filen.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Klik på et punkt i Del-menuen og læs den Excel-fil, det giver. */
async function downloadFromShareMenu(page: Page, item: RegExp): Promise<string[][]> {
    const menu = page.getByRole('group', { name: 'Del grupperne' });
    if (await menu.count() === 0) {
        await page.getByRole('button', { name: 'Del', exact: true }).click();
    }
    await expect(menu).toBeVisible();
    const pending = page.waitForEvent('download');
    await menu.getByRole('button', { name: item }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/ - stamgrupper - \d{4}-\d{2}-\d{2}\.xlsx$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const workbook = XLSX.read(Buffer.concat(chunks), { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Stamgrupper']);
    // Filen er givet videre, så menuen lukker.
    await expect(menu).toHaveCount(0);
    return XLSX.utils.sheet_to_json(workbook.Sheets.Stamgrupper, { header: 1, defval: '' }) as string[][];
}

test('Del-menuen giver grupperne som Excel — i kolonner og i rækker', async ({ page }) => {
    await createClass(page, 'Del Test');
    await goToGroups(page);
    await generateGroups(page);
    const cardCount = await page.locator('.group-card').count();

    const columns = await downloadFromShareMenu(page, /Grupper i kolonner/);
    expect(columns[0]).toHaveLength(cardCount);
    for (const heading of columns[0]) expect(heading).toMatch(/^Gruppe \d+/);
    const inColumns = columns.slice(1).flat().filter(Boolean);

    const rows = await downloadFromShareMenu(page, /Grupper i rækker/);
    expect(rows).toHaveLength(cardCount);
    for (const row of rows) expect(row[0]).toMatch(/^Gruppe \d+/);
    const inRows = rows.flatMap(r => r.slice(1)).filter(Boolean);

    // Hver elev står der præcis én gang, med navn — ikke med et internt id.
    for (const names of [inColumns, inRows]) {
        expect([...names].sort()).toEqual([...STUDENT_NAMES].sort());
        for (const name of names) expect(name).not.toMatch(INTERNAL_ID);
    }
});

test('Del-menuen kan bruges med tastaturet og giver fokus tilbage', async ({ page }) => {
    await createClass(page, 'Del Tastatur');
    await goToGroups(page);
    await generateGroups(page);

    const share = page.getByRole('button', { name: 'Del', exact: true });
    const menu = page.getByRole('group', { name: 'Del grupperne' });

    // Åbnes den, står fokus på første punkt, og knappen siger at den er åben.
    await share.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await expect(share).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('button', { name: /Udskriv/ })).toBeFocused();

    // Escape lukker og giver fokus tilbage til knappen.
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(share).toBeFocused();
    await expect(share).toHaveAttribute('aria-expanded', 'false');

    // Et klik på knappen, mens menuen står åben, lukker den — og åbner den
    // ikke straks igen.
    await share.click();
    await expect(menu).toBeVisible();
    await share.click();
    await expect(menu).toHaveCount(0);

    // Tabber man ud af menuen, lukker den, og fokus bliver dér, hvor man gik hen.
    await share.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    for (let i = 0; i < 12 && await menu.count() > 0; i++) await page.keyboard.press('Tab');
    await expect(menu).toHaveCount(0);
    await expect(share).not.toBeFocused();
});
