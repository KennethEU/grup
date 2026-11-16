import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from '../../vendor/xlsx.mjs';
import { state } from './state.js';
import { saveAs } from 'file-saver';

const topics = {};
vi.mock('./storage.js', () => ({
    getTopic: (name, prefix) => topics[`${prefix}${name}`] || null,
}));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

import { buildGroupTable, toColumnsSheet, downloadGroupsWorkbook, matrixAvailability } from './groupExport.js';

/**
 * Hent en fil og læs den, som Excel ville læse den.
 * En korrekt mellemrepræsentation er ikke nok — det er filen, læreren får.
 */
async function download(opts) {
    saveAs.mockClear();
    const ok = await downloadGroupsWorkbook(opts);
    if (!ok) return { ok };
    expect(saveAs).toHaveBeenCalledOnce();
    const [blob, filename] = saveAs.mock.calls[0];
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
    const sheets = Object.fromEntries(wb.SheetNames.map(n =>
        [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' })]));
    return { ok, filename, names: wb.SheetNames, sheets, wb };
}

beforeEach(() => {
    for (const k of Object.keys(topics)) delete topics[k];
    window.notifyInfo = vi.fn();
    window.notifyError = vi.fn();
    window.notifySuccess = vi.fn();
    state.currentClass = {
        name: '3.a',
        data: [
            { _rowId: 'r1', Navn: 'Anna' },
            { _rowId: 'r2', Navn: 'Bo' },
            { _rowId: 'r3', Navn: 'Cecilie' },
            { _rowId: 'r4', Navn: 'Anna' }, // to elever med SAMME navn
        ],
    };
    state.displayColumn = 'Navn';
    topics['S_Group 1'] = 'Klima';
    state.storedStandardGroups = [
        { name: 'Group 1', members: ['r1', 'r2'] },
        { name: 'Group 2', members: ['r3', 'r4'] },
    ];
    state.storedMatrixGroups = null;
    state.matrixGroupsStale = false;
});

describe('Del-menuens Excel-fil', () => {
    it('lægger grupperne i kolonner med emnet i overskriften', async () => {
        const file = await download({ sets: ['standard'], layout: 'columns' });
        expect(file.names).toEqual(['Stamgrupper']);
        expect(file.sheets.Stamgrupper).toEqual([
            ['Gruppe 1 - Klima', 'Gruppe 2'],
            ['Anna', 'Cecilie'],
            ['Bo', 'Anna'],
        ]);
        // Klassenavnet "3.a" er gjort lovligt som filnavn, og datoen er med.
        expect(file.filename).toMatch(/^3_a - stamgrupper - \d{4}-\d{2}-\d{2}\.xlsx$/);
        expect(window.notifySuccess).toHaveBeenCalled();
    });

    it('lægger grupperne i rækker med eleverne ud til højre', async () => {
        state.storedStandardGroups[1].members = ['r3'];
        const file = await download({ sets: ['standard'], layout: 'rows' });
        expect(file.sheets.Stamgrupper).toEqual([
            ['Gruppe 1 - Klima', 'Anna', 'Bo'],
            ['Gruppe 2', 'Cecilie', ''],
        ]);
    });

    it('giver begge gruppesæt hver sin fane', async () => {
        topics['M_Group 1'] = 'Energi';
        state.storedMatrixGroups = [
            { name: 'Group 1', members: ['r1', 'r3'] },
            { name: 'Group 2', members: ['r2', 'r4'] },
        ];
        const file = await download({ sets: ['standard', 'matrix'], layout: 'columns' });
        expect(file.names).toEqual(['Stamgrupper', 'Matrixgrupper']);
        expect(file.sheets.Matrixgrupper[0]).toEqual(['Gruppe 1 - Energi', 'Gruppe 2']);
        expect(file.filename).toMatch(/^3_a - grupper - /);
    });

    it('tager aldrig en forældet matrix med', async () => {
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1', 'r2', 'r3', 'r4'] }];
        state.matrixGroupsStale = true;
        expect(matrixAvailability()).toBe('stale');

        const both = await download({ sets: ['standard', 'matrix'], layout: 'columns' });
        expect(both.names).toEqual(['Stamgrupper']);

        const onlyMatrix = await download({ sets: ['matrix'], layout: 'columns' });
        expect(onlyMatrix.ok).toBe(false);
        expect(saveAs).not.toHaveBeenCalled();
        expect(window.notifyInfo).toHaveBeenCalled();
    });

    it('melder en fraværende elev som fraværende', async () => {
        state.currentClass.data[1]._excluded = true; // Bo
        const file = await download({ sets: ['standard'], layout: 'rows' });
        expect(file.sheets.Stamgrupper[0]).toEqual(['Gruppe 1 - Klima', 'Anna', 'Bo (fraværende)']);
    });

    it('beholder en tom gruppe som en tom kolonne', async () => {
        state.storedStandardGroups.push({ name: 'Group 3', members: [] });
        const file = await download({ sets: ['standard'], layout: 'columns' });
        expect(file.sheets.Stamgrupper[0]).toEqual(['Gruppe 1 - Klima', 'Gruppe 2', 'Gruppe 3']);
        expect(file.sheets.Stamgrupper.slice(1).map(r => r[2])).toEqual(['', '']);
    });

    it('skriver et navn der ligner en formel, som tekst', async () => {
        state.currentClass.data[0].Navn = '=HYPERLINK("x")';
        const file = await download({ sets: ['standard'], layout: 'columns' });
        const cell = file.wb.Sheets.Stamgrupper.A2;
        expect(cell.t).toBe('s');
        expect(cell.v).toBe('=HYPERLINK("x")');
        expect(cell.f).toBeUndefined();
    });

    it('viser ikke matrixkortets pladsholder som et emne', async () => {
        topics['M_Group 1'] = 'MATRIX';
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1'] }];
        const file = await download({ sets: ['matrix'], layout: 'columns' });
        expect(file.sheets.Matrixgrupper[0]).toEqual(['Gruppe 1']);
    });

    it('siger fra i stedet for at lave en tom fil', async () => {
        state.storedStandardGroups = null;
        const file = await download({ sets: ['standard'], layout: 'columns' });
        expect(file.ok).toBe(false);
        expect(saveAs).not.toHaveBeenCalled();
        expect(window.notifyInfo).toHaveBeenCalled();
    });

    it('bygger arket af den samme tabel som "Kopiér"', () => {
        const table = buildGroupTable(false);
        expect(toColumnsSheet(table)[0]).toEqual(table.map(g => g.heading));
    });
});

// Samme kvadrat som udskriften (overview.test.js): hvert navn og hvert
// fraværs-tjek gennemløb hele den reaktive elevliste. Kopiér og Excel tog
// 427 ms ved 1200 elever (4× neddrosling, 180. gennemsyn).
describe('buildGroupTable — elevlisten læses kun én gang', () => {
    it('læser hver elevrække et fast antal gange, ikke én gang pr. elev', () => {
        const N = 200;
        const rows = Array.from({ length: N }, (_, i) => ({ _rowId: `r${i + 1}`, Navn: `Elev ${i}` }));
        let reads = 0;
        state.currentClass.data = new Proxy(rows, {
            get(target, key, receiver) {
                if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
                return Reflect.get(target, key, receiver);
            },
        });
        state.storedStandardGroups = Array.from({ length: N / 4 }, (_, g) =>
            ({ name: `Group ${g + 1}`, members: rows.slice(g * 4, g * 4 + 4).map(r => r._rowId) }));
        state.storedMatrixGroups = Array.from({ length: N / 4 }, (_, g) =>
            ({ name: `Group ${g + 1}`, members: rows.filter((_, i) => i % (N / 4) === g).map(r => r._rowId) }));

        const table = buildGroupTable(true, true);

        expect(table.flatMap(g => g.members)).toContain('Elev 199 (Grp 50)');
        expect(reads).toBeLessThanOrEqual(3 * N);
    });
});
