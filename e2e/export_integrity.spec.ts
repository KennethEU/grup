import { test, expect, Page, Download } from '@playwright/test';
import JSZip from 'jszip';
import * as XLSX from '../src/vendor/xlsx.mjs';
import { createClass } from './helpers';

// Filerne læses fra browserens rigtige downloads. Ingen importer fra /src/
// i browseren: samme kontrol skal kunne køres mod den byggede app.
type ExportFixture = {
    filename: string;
    name: string;
    data: Record<string, unknown>[];
    groups: Record<string, unknown>;
    groupTopics: Record<string, unknown>;
};

async function prepareExport(page: Page, fixture: ExportFixture) {
    await createClass(page, 'Anden klasse', 'Navn\nAktiv elev\n');
    await page.locator('.nav-tab').filter({ hasText: 'Import & backup' }).click();

    // Den eksporterede klasse åbnes ALDRIG. Klasseskift ville migrere gamle
    // navne og indlæse emner, så fejlen forsvandt før selve eksporten.
    await page.evaluate((fixture) => {
        const debug = (window as any).appDebug;
        const classes = JSON.parse(localStorage.getItem('grupdk_classes') || '[]');
        classes.push({
            filename: fixture.filename,
            name: fixture.name,
            content: {
                columns: ['Navn', 'Nummer'],
                data: fixture.data,
                id_column: 'Navn',
                rules: [],
            },
        });
        localStorage.setItem('grupdk_classes', JSON.stringify(classes));
        localStorage.setItem(`grupdk_groups_${fixture.filename}`, JSON.stringify(fixture.groups));
        localStorage.setItem(`grupdk_topics_${fixture.filename}`, JSON.stringify(fixture.groupTopics));
        debug.pyBridge._invalidateClassesCache();

        // Aktuel skærmtilstand tilhører en helt anden klasse. Et globalt
        // emneopslag eller matrixflag må ikke lække ind i eksporten.
        const activeId = debug.state.currentClass.data[0]._rowId;
        debug.state.storedStandardGroups = [
            { name: 'Group 9', members: [activeId], topic: 'Aktivt emne' },
        ];
        debug.state.storedMatrixGroups = [{ name: 'Group 8', members: [activeId] }];
        debug.state.matrixGroupsStale = true;
        localStorage.setItem(`grupdk_topics_${debug.state.currentClass.filename}`,
            JSON.stringify({ 'S_Group 1': 'Forkert klasses emne' }));
    }, fixture);

    await page.getByRole('button', { name: 'Eksportér', exact: true }).click();
    await page.getByRole('checkbox', { name: fixture.name, exact: true }).check();
    await expect(page.getByRole('button', { name: /Download Excel-filer/i })).toBeEnabled();
}

async function captureSource(page: Page) {
    return page.evaluate(() => {
        const state = (window as any).appDebug.state;
        const storage = Object.fromEntries(Object.keys(localStorage).sort()
            .map(key => [key, localStorage.getItem(key)]));
        return {
            storage,
            currentClass: JSON.stringify(state.currentClass),
            standard: JSON.stringify(state.storedStandardGroups),
            matrix: JSON.stringify(state.storedMatrixGroups),
            matrixStale: state.matrixGroupsStale,
        };
    });
}

async function readDownload(download: Download): Promise<Buffer> {
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}

async function downloadBackup(page: Page) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download backup/i }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/^grupdk_backup_.*\.json$/);
    return JSON.parse((await readDownload(download)).toString('utf8'));
}

async function downloadWorkbook(page: Page) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download Excel-filer/i }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(await readDownload(download));
    const files = Object.values(zip.files).filter(file => !file.dir);
    expect(files).toHaveLength(1);
    expect(files[0].name).toMatch(/\.xlsx$/);
    const workbook = XLSX.read(await files[0].async('nodebuffer'), { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Elever']);
    return XLSX.utils.sheet_to_json(workbook.Sheets.Elever, { defval: '' }) as Record<string, unknown>[];
}

test('Excel udelader en forældet matrix, mens JSON beholder den med flaget', async ({ page }) => {
    const fixture: ExportFixture = {
        filename: 'stale_export.csv', name: 'Forældet matrix',
        data: [{ Navn: 'Anna', Nummer: '1', _rowId: 'r1' }, { Navn: 'Bo', Nummer: '2', _rowId: 'r2' }],
        groups: {
            standard: [{ name: 'Group 1', members: ['r1'] }, { name: 'Group 2', members: ['r2'] }],
            matrix: [{ name: 'Group 1', members: ['r1', 'r2'] }],
            matrixStale: true,
        },
        groupTopics: {},
    };
    await prepareExport(page, fixture);
    const before = await captureSource(page);

    const backup = await downloadBackup(page);
    expect(backup).toHaveLength(1);
    expect(backup[0].filename).toBe(fixture.filename);
    expect(backup[0].groups).toEqual(fixture.groups);
    expect(backup[0].data).toEqual(fixture.data);

    const rows = await downloadWorkbook(page);
    expect(rows.map(row => row.Stamgruppe)).toEqual(['Gruppe 1', 'Gruppe 2']);
    expect(Object.keys(rows[0])).not.toContain('Matrixgruppe');
    const warning = page.locator('.toast').filter({ hasText: /matrix/i });
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(/forældet|forrige stamgrupper|ikke med|udeladt/i);
    await expect(warning).toContainText(fixture.name);
    await warning.screenshot({ animations: 'disabled',
        path: test.info().outputPath('matrix-warning.png') });
    expect(await captureSource(page)).toEqual(before);
});

test('Excel følger emnekortets sletninger og ændringer uden at ændre kilden', async ({ page }) => {
    const fixture: ExportFixture = {
        filename: 'topic_export.csv', name: 'Gemte emner',
        data: [
            { Navn: 'Anna', Nummer: '1', _rowId: 'r1' },
            { Navn: 'Bo', Nummer: '2', _rowId: 'r2' },
            { Navn: 'Cecilie', Nummer: '3', _rowId: 'r3' },
        ],
        groups: {
            standard: [
                { name: 'Group 1', members: ['r1'], topic: 'Gammelt null-emne' },
                { name: 'Group 2', members: ['r2'], topic: 'Gammelt slettet emne' },
                { name: 'Group 3', members: ['r3'], topic: 'Gammelt ændret emne' },
            ],
            matrix: [{ name: 'Group 1', members: ['r1', 'r2', 'r3'], topic: 'Gammelt matrixemne' }],
            matrixStale: false,
        },
        groupTopics: { 'S_Group 1': null, 'S_Group 3': 'Nyt emne', 'M_Group 1': 'Nyt matrixemne' },
    };
    await prepareExport(page, fixture);
    const before = await captureSource(page);

    const rows = await downloadWorkbook(page);
    expect(rows.map(row => row.Stamgruppe)).toEqual(['Gruppe 1', 'Gruppe 2', 'Gruppe 3 (Nyt emne)']);
    expect(rows.map(row => row.Matrixgruppe)).toEqual(Array(3).fill('Gruppe 1 (Nyt matrixemne)'));
    expect(JSON.stringify(rows)).not.toMatch(/Gammelt|Forkert klasses emne|Aktivt emne/);

    const backup = await downloadBackup(page);
    expect(backup[0].groups).toEqual(fixture.groups);
    expect(backup[0].groupTopics).toEqual(fixture.groupTopics);
    expect(await captureSource(page)).toEqual(before);
});

test('En uåbnet ældre klasse beholder to navnefællers forskellige grupper i Excel', async ({ page }) => {
    const fixture: ExportFixture = {
        filename: 'legacy_export.csv', name: 'Ældre klasse',
        data: [{ Navn: 'Anna', Nummer: '1' }, { Navn: 'Anna', Nummer: '2' }, { Navn: 'Bo', Nummer: '3' }],
        groups: {
            standard: [
                { name: 'Group 1', members: ['Anna', 'Bo'] },
                { name: 'Group 2', members: [{ name: 'Anna' }] },
            ],
            matrix: [
                { name: 'Group 1', members: ['Anna'] },
                { name: 'Group 2', members: ['Anna', 'Bo'] },
            ],
            matrixStale: false,
        },
        groupTopics: {},
    };
    await prepareExport(page, fixture);
    const before = await captureSource(page);

    const rows = await downloadWorkbook(page);
    expect(rows.map(row => row.Navn)).toEqual(['Anna', 'Anna', 'Bo']);
    expect(rows.map(row => row.Stamgruppe)).toEqual(['Gruppe 1', 'Gruppe 2', 'Gruppe 1']);
    expect(rows.map(row => row.Matrixgruppe)).toEqual(['Gruppe 1', 'Gruppe 2', 'Gruppe 2']);
    expect(rows.map(row => row['Til stede'])).toEqual(['Ja', 'Ja', 'Ja']);
    expect(Object.keys(rows[0])).not.toContain('_rowId');

    const backup = await downloadBackup(page);
    expect(backup[0].data).toEqual(fixture.data);
    expect(backup[0].groups).toEqual(fixture.groups);
    expect(await captureSource(page)).toEqual(before);
});
