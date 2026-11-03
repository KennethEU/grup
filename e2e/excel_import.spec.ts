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
