import { test, expect, Page } from '@playwright/test';
import * as XLSX from '../src/vendor/xlsx.mjs';

// Importen kræver hverken server-API eller database. Alle elevdata her er
// syntetiske.
async function openImport(page: Page, existing = false) {
    await page.goto('/');
    await expect(page.locator('#vue-modals')).toBeAttached();
    await page.waitForFunction(() => Boolean((window as any).appDebug?.pyBridge));
    if (existing) {
        await page.evaluate(() => (window as any).appDebug.pyBridge.createClass('Existing', 'Name\nOriginal'));
    }
    await page.getByRole('button', { name: 'Indsæt klasseliste fra Excel / Sheets' }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
}

function backup(name: string, filename: string, student: string) {
    return { name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([
        { filename, name: filename, columns: ['Name'], data: [{ Name: student }], rules: [], id_column: 'Name' },
    ])) };
}

const csv = { name: 'third.csv', mimeType: 'text/csv', buffer: Buffer.from('Name\nCSV Student') };
async function storedStudents(page: Page) {
    return page.evaluate(() => JSON.parse(localStorage.getItem('grupdk_classes') || '[]')
        .flatMap((entry: any) => entry.content.data.map((row: any) => row.Name)).sort());
}

for (const mode of ['copy', 'skip', 'overwrite', 'escape']) {
    test(`backup-sammenstød (${mode}) fortsætter med både næste backup og CSV`, async ({ page }) => {
        await openImport(page, true);
        await page.locator('input[type=file]').setInputFiles([
            backup('first.json', 'existing.csv', 'Replacement'),
            backup('second.json', 'second.csv', 'Second'), csv,
        ]);
        await page.getByRole('button', { name: 'Importér filer', exact: true }).click();
        const dialog = page.locator('dialog[open]');
        await expect(dialog).toContainText('Disse klasser findes allerede');
        if (mode === 'escape') await page.keyboard.press('Escape');
        else await dialog.getByRole('button', { name: mode === 'copy' ? 'Importér som kopi' : mode === 'skip' ? 'Spring over (behold mine)' : 'Overskriv mine' }).click();
        const expected = mode === 'copy' ? ['CSV Student', 'Original', 'Replacement', 'Second']
            : mode === 'overwrite' ? ['CSV Student', 'Replacement', 'Second'] : ['CSV Student', 'Original', 'Second'];
        await expect.poll(() => storedStudents(page)).toEqual(expected);
        await expect(page.locator('.import-container')).toBeHidden();
    });
}

test('en backup uden sammenstød lukker ikke importen før næste fil er valgt', async ({ page }) => {
    await openImport(page);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Instructions'], ['Choose another sheet']]), 'Cover');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name'], ['Sheet Student']]), 'Students');
    await page.locator('input[type=file]').setInputFiles([
        backup('first.json', 'first.csv', 'First'),
        { name: 'workbook.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) },
    ]);
    await page.getByRole('button', { name: 'Importér filer', exact: true }).click();
    await page.getByRole('radio', { name: 'Students' }).check();
    await page.getByRole('button', { name: 'Importér dette ark' }).click();
    await expect.poll(() => storedStudents(page)).toEqual(['First', 'Sheet Student']);
});

function sparseWorkbook(multiple = false) {
    const wb = XLSX.utils.book_new();
    const sheet = { B600: { t: 's', v: 'Name' }, B900: { t: 's', v: 'Anna' },
        Z600: { t: 's', v: 'Score' }, Z900: { t: 'n', v: 0 }, '!ref': 'A1:Z1500' };
    XLSX.utils.book_append_sheet(wb, sheet, 'Students');
    if (multiple) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cover']]), 'Cover');
    return { name: 'sparse.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) };
}

test('regnearkets tomme forreste rækker og kolonner koster ingen elever', async ({ page }) => {
    await openImport(page);
    await page.locator('input[type=file]').setInputFiles(sparseWorkbook());
    await page.getByRole('button', { name: 'Importér filer', exact: true }).click();
    await expect(page.locator('tbody')).toContainText('Anna');
    await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('Escape i arkvælgeren afslutter ventetiden og tillader et nyt forsøg', async ({ page }) => {
    await openImport(page);
    await page.locator('input[type=file]').setInputFiles(sparseWorkbook(true));
    await page.getByRole('button', { name: 'Importér filer', exact: true }).click();
    await expect(page.locator('dialog[open]')).toContainText('Hvilket ark');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Importér filer', exact: true })).toBeEnabled();
    expect(await storedStudents(page)).toEqual([]);
    await page.getByRole('button', { name: 'Importér filer', exact: true }).click();
    await page.getByRole('radio', { name: 'Students' }).check();
    await page.getByRole('button', { name: 'Importér dette ark' }).click();
    await expect(page.locator('tbody')).toContainText('Anna');
});

test('delvis importfejl er synlig efter at den oprettede klasse åbnes', async ({ page }) => {
    await openImport(page);
    await page.locator('input[type=file]').setInputFiles([
        csv, { name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('') },
    ]);
    await page.getByRole('button', { name: 'Importér filer', exact: true }).click();
    await expect.poll(() => storedStudents(page)).toEqual(['CSV Student']);
    // Vent på den nye klasse: under visningsskiftet findes samme fejltekst
    // både i importformularen og i den toast, som skal overleve skiftet.
    await expect(page.locator('tbody')).toContainText('CSV Student');
    await expect(page.locator('.toast.error').filter({ hasText: '1 oprettet, men 1 fejlede' })).toBeVisible();
});

test('to backup-dialoger i samme import får hver deres valg', async ({ page }) => {
    await openImport(page, true);
    await page.locator('input[type=file]').setInputFiles([
        backup('first.json', 'existing.csv', 'First'),
        backup('second.json', 'existing.csv', 'Second'), csv,
    ]);
    await page.getByRole('button', { name: 'Importér filer', exact: true }).click();
    await page.getByRole('button', { name: 'Spring over (behold mine)' }).click();
    await page.getByRole('button', { name: 'Importér som kopi' }).click();
    await expect.poll(() => storedStudents(page)).toEqual(['CSV Student', 'Original', 'Second']);
});

test('at forlade importen under fillæsning opretter ingen klasse bagefter', async ({ page }) => {
    await openImport(page);
    await page.evaluate(() => {
        const read = File.prototype.arrayBuffer;
        File.prototype.arrayBuffer = async function () {
            await new Promise<void>(resolve => { (window as any).releaseFileRead = resolve; });
            return read.call(this);
        };
    });
    await page.locator('input[type=file]').setInputFiles(csv);
    await page.getByRole('button', { name: 'Importér filer', exact: true }).click();
    await page.waitForFunction(() => Boolean((window as any).releaseFileRead));
    await page.getByRole('button', { name: 'Eksportér', exact: true }).click();
    await page.evaluate(() => (window as any).releaseFileRead());
    // En tur gennem UI'et sikrer, at fillæsningens fortsættelse har haft tid til at køre.
    await page.getByRole('button', { name: 'Importér', exact: true }).click();
    await page.getByRole('button', { name: 'Upload fil eller gendan backup' }).click();
    await expect(page.getByRole('button', { name: 'Importér filer', exact: true })).toBeDisabled();
    expect(await storedStudents(page)).toEqual([]);
});
