import { test, expect } from '@playwright/test';
import * as XLSX from '../src/vendor/xlsx.mjs';
import { gotoAppReady } from './helpers';

/**
 * Excel-import er den vej de fleste klasser kommer ind i programmet, og den
 * eneste kode i appen der læser en fil læreren har fået udefra. Resten af
 * e2e-suiten går gennem indsæt-tekst-vejen, så XLSX.read() var utestet —
 * netop den funktion der skiftede bibliotek (se src/vendor/README.md).
 *
 * Filen bygges her i testen i stedet for at ligge som en binær fixture i
 * repo'et: så kan man se præcis hvad der importeres, og der er ikke en
 * .xlsx man skal huske at genskabe.
 */
function buildWorkbook(): Buffer {
    const rows = [
        ['Navn', 'Køn', 'Karakter', 'Emne'],
        ['Anna Ø. Åberg', 'K', '10', 'Liberalisme'],
        ['Bo Sørensen', 'M', '7', 'Socialisme'],
        ['Cæcilie Æbeltoft', 'K', '12', 'Konservatisme'],
        ['David Ångström', 'M', '4', 'Liberalisme'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Excel gemmer næsten altid et "brugt område" der er større end dataene.
    // Det er dét der før slæbte en stribe navnløse tomme kolonner med ind, så
    // testen efterligner det bevidst i stedet for at importere en ren fil.
    ws['!ref'] = 'A1:J20';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Elever');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

test('Excel-import: elever, æøå og kolonner lander rigtigt — uden Excels tomme kolonner', async ({ page }) => {
    await gotoAppReady(page);

    await page.getByRole('button', { name: 'Indsæt klasseliste fra Excel / Sheets' }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();

    await page.locator('input[type="file"]').setInputFiles({
        name: 'probe_klasse.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: buildWorkbook(),
    });

    await page.getByRole('button', { name: /Importér Filer/i }).click();

    // Overskrifterne fra filen — og INGEN "Uden navn"-kolonner fra det
    // oppustede brugte område.
    await expect(page.locator('th').filter({ hasText: 'Navn' })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('th').filter({ hasText: 'Emne' })).toBeVisible();
    await expect(page.locator('th').filter({ hasText: 'Uden navn' })).toHaveCount(0);

    // Danske tegn skal overleve hele vejen fra zip-filen til tabellen.
    await expect(page.getByText('Anna Ø. Åberg')).toBeVisible();
    await expect(page.getByText('Cæcilie Æbeltoft')).toBeVisible();
    await expect(page.getByText('David Ångström')).toBeVisible();

    // Fire elever — ikke 19 tomme rækker oveni.
    await expect(page.locator('tbody tr')).toHaveCount(4);
});

/**
 * Et regneark med et forsideark FØRST og klassen på ark nummer to. Det er
 * mønstret i de fleste skabeloner skoler deler ud — og importen tog altid
 * SheetNames[0], så læreren fik forsiden ind som sin klasse.
 */
function buildMultiSheetWorkbook(): Buffer {
    const wb = XLSX.utils.book_new();

    const cover = XLSX.utils.aoa_to_sheet([['Vejledning'], ['Udfyld arket "Elever" herunder.']]);
    XLSX.utils.book_append_sheet(wb, cover, 'Forside');

    const studentSheet = XLSX.utils.aoa_to_sheet([
        ['Navn', 'Køn'],
        ['Søren Kjærgård', 'M'],
        ['Åse Bøgh', 'K'],
    ]);
    XLSX.utils.book_append_sheet(wb, studentSheet, 'Elever');

    return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

/** Excel på Windows gemmer "CSV (kommasepareret)" i ANSI — én byte pr. æøå. */
function buildAnsiCsv(): Buffer {
    const text = 'Navn;Køn\nSøren Kjærgård;M\nÅse Bøgh;K\nCæcilie Ø. Åberg;K\n';
    const bytes: number[] = [];
    for (const ch of text) {
        const code = ch.codePointAt(0)!;
        // windows-1252 er identisk med Unicode for alt vi bruger her
        // (æøåÆØÅ ligger på 0xE6/0xF8/0xE5/0xC6/0xD8/0xC5).
        bytes.push(code);
    }
    return Buffer.from(Uint8Array.from(bytes));
}

async function importFile(page, name: string, buffer: Buffer, mimeType: string) {
    await gotoAppReady(page);
    await page.getByRole('button', { name: 'Indsæt klasseliste fra Excel / Sheets' }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
    await page.getByRole('button', { name: /Importér Filer/i }).click();
}

test('Regneark med forside først: læreren vælger arket — og får klassen, ikke forsiden', async ({ page }) => {
    await importFile(page, 'skabelon.xlsx', buildMultiSheetWorkbook(),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Før tog importen tavst ark nummer ét. Nu bliver der spurgt.
    const dialog = page.getByText('Hvilket ark indeholder klassen?');
    await expect(dialog).toBeVisible({ timeout: 30000 });

    await page.getByRole('radio', { name: 'Elever' }).check();
    await page.getByRole('button', { name: 'Importér dette ark' }).click();

    // Eleverne fra ark 2 — ikke forsidens "Vejledning".
    // Søg i ELEVTABELLEN, ikke på hele siden: Nyheder-dialogen citerer de
    // samme navne i sin tekst, og et sidebredt opslag rammer så to elementer
    // og fælder testen på noget, der intet har med importen at gøre.
    const table = page.locator('tbody');
    await expect(table.getByText('Søren Kjærgård')).toBeVisible({ timeout: 30000 });
    await expect(table.getByText('Åse Bøgh')).toBeVisible();
    await expect(page.locator('th').filter({ hasText: 'Køn' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(2);
});

test('Ark-vælgeren kan fortrydes — så bliver der ikke oprettet nogen klasse', async ({ page }) => {
    await importFile(page, 'skabelon.xlsx', buildMultiSheetWorkbook(),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    await expect(page.getByText('Hvilket ark indeholder klassen?')).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Spring filen over' }).click();

    await expect(page.getByText('Hvilket ark indeholder klassen?')).toBeHidden();
    // Ingen elevtabel — vi står stadig på import-siden.
    await expect(page.locator('tbody tr')).toHaveCount(0);
});

test('CSV gemt i ANSI fra Excel: æ, ø og å overlever importen', async ({ page }) => {
    await importFile(page, 'klasse_ansi.csv', buildAnsiCsv(), 'text/csv');

    // Elevtabellen, ikke hele siden — se forklaringen i testen ovenfor.
    const table = page.locator('tbody');
    await expect(table.getByText('Søren Kjærgård')).toBeVisible({ timeout: 30000 });
    await expect(table.getByText('Åse Bøgh')).toBeVisible();
    await expect(table.getByText('Cæcilie Ø. Åberg')).toBeVisible();
    // Ingen erstatningstegn nogen steder i tabellen.
    await expect(page.locator('tbody')).not.toContainText('\uFFFD');
});

// 152. gennemsyn: en fil uden kolonnenavne, hvor første elev har den eneste
// "Spansk". Før blev hun til kolonnenavnene og forsvandt — og en fil har
// intet udsnit, så det skete i stilhed. "Pige" går igen nedenunder, så linjen
// er en elev. Og kan intet afgøre det ("Fritaget" over karakterer), siger en
// besked, hvilken linje der er læst som kolonnenavne.
test('CSV uden kolonnenavne: første elev kommer med, også med en værdi ingen andre har', async ({ page }) => {
    const text = 'Anna Holm;Pige;Spansk\nBo Ek;Dreng;Tysk\nCe Lund;Pige;Fransk\nDan Bo;Dreng;Tysk\n'
        + 'Eva Ny;Pige;Fransk\nFie Ma;Pige;Tysk\nGo Ra;Dreng;Fransk\n';
    await importFile(page, 'uden_kolonnenavne.csv', Buffer.from(text, 'utf8'), 'text/csv');
    const table = page.locator('tbody');
    await expect(table.getByText('Anna Holm')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('tbody tr')).toHaveCount(7);
    const columns = await page.evaluate(() => [...(window as any).appDebug.state.currentClass.columns]);
    expect(columns).toEqual(['Navn', 'Info 1', 'Info 2']);
});

test('CSV hvor første linje kun kan gættes: beskeden siger, at den er læst som kolonnenavne', async ({ page }) => {
    const text = 'Anna Holm;Fritaget\nBo Ek;7\nCe Lund;10\nDan Bo;4\n';
    await importFile(page, 'gaet.csv', Buffer.from(text, 'utf8'), 'text/csv');
    await expect(page.getByText('Første linje ("Anna Holm", "Fritaget") er læst som kolonnenavne')).toBeVisible({ timeout: 30000 });
});

// 154. gennemsyn, (174): et ark med hele årgangen, filtreret til én klasse,
// og en skjult CPR-kolonne. Alt kommer stadig med (at springe over kunne æde
// elever), men en fil har intet udsnit, så beskeden siger det. Et skjult
// opslagsark ved siden af giver ikke længere et spørgsmål om ark.
test('Excel med skjulte rækker, en skjult kolonne og et skjult ark: alt kommer med, og beskeden siger det', async ({ page }) => {
    const ws = XLSX.utils.aoa_to_sheet([
        ['Navn', 'CPR', 'Klasse'],
        ['Anna Holm', '010101-0000', '2a'],
        ['Bo Ek', '020202-0000', '2b'],
        ['Ce Lund', '030303-0000', '2a'],
        ['Dan Bo', '040404-0000', '2c'],
    ]);
    ws['!rows'] = [];
    ws['!rows'][2] = { hidden: true };
    ws['!rows'][4] = { hidden: true };
    ws['!cols'] = [{}, { hidden: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Elever');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Klasser'], ['2a'], ['2b']]), 'Lister');
    wb.Workbook = { Sheets: [{}, { Hidden: 1 }] } as any;
    await importFile(page, 'aargang.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    await expect(page.getByText('2 rækker var skjult eller filtreret fra i Excel')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Kolonne B var skjult i Excel')).toBeVisible();
    await expect(page.getByText('Hvilket ark indeholder klassen?')).toHaveCount(0);
    await expect(page.locator('tbody tr')).toHaveCount(4);
});

// 155. gennemsyn, (177): "2a" flettet ned over tre elever står kun i den
// øverste celle i filen. Før fik de to andre en tom Klasse-celle uden et ord;
// nu skrives værdien ned, og beskeden siger det.
test('Excel med en flettet celle: værdien står hos hver elev, fletningen dækker', async ({ page }) => {
    const ws = XLSX.utils.aoa_to_sheet([
        ['Navn', 'Klasse', 'Køn'],
        ['Anna Holm', '2a', 'Pige'],
        ['Bo Ek', null, 'Dreng'],
        ['Ce Lund', null, 'Pige'],
        ['Dan Bo', '2b', 'Dreng'],
    ]);
    ws['!merges'] = [XLSX.utils.decode_range('B2:B4')];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Elever');
    await importFile(page, 'flettet.xlsx', XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    await expect(page.getByText('2 celler var flettet sammen med cellen ovenover i Excel')).toBeVisible({ timeout: 30000 });
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(4);
    for (const index of [0, 1, 2]) await expect(rows.nth(index)).toContainText('2a');
    await expect(rows.nth(3)).toContainText('2b');
});
