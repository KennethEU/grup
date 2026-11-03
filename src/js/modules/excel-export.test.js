import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import JSZip from 'jszip';
import * as XLSX from '../../vendor/xlsx.mjs';
import ExportSection from '../../components/views/ExportSection.vue';
import * as api from './api.js';
import { saveAs } from 'file-saver';

vi.mock('./api.js', () => ({ fetchClasses: vi.fn(), exportClasses: vi.fn() }));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

let app;
let host;

function makeClass() {
    return {
        filename: 'export-review.csv',
        name: 'Eksportreview',
        data: [
            { Name: 'Anna', _rowId: 'r1', _excluded: false, _importIndex: 0 },
            { Name: 'Anna', _rowId: 'r2', _excluded: true, _importIndex: 1 },
        ],
        groups: {
            standard: [
                { name: 'Group 1', members: ['r1'], topic: 'Gammelt stamemne' },
                { name: 'Group 2', members: [{ id: 'r2', name: 'Anna' }] },
            ],
            matrix: [
                { name: 'Group 1', members: [{ id: 'r2', name: 'Anna' }], topic: 'Gammelt matrixemne' },
                { name: 'Group 2', members: ['r1'] },
            ],
            matrixStale: false,
        },
        groupTopics: { 'S_Group 1': 'Klima', 'M_Group 1': 'Energi' },
    };
}

async function mountSelectedClass(cls) {
    api.fetchClasses.mockResolvedValue([{ filename: cls.filename, name: cls.name }]);
    api.exportClasses.mockResolvedValue({ data: [cls] });
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(ExportSection);
    app.mount(host);
    await vi.waitFor(() => expect(host.querySelector('input[type="checkbox"]')).not.toBeNull());
    host.querySelector('input[type="checkbox"]').click();
    await nextTick();
}

async function downloadWorkbook() {
    host.querySelector('button.primary').click();
    await vi.waitFor(() => expect(saveAs).toHaveBeenCalledOnce());
    await nextTick();
    expect(window.notifyError).not.toHaveBeenCalled();
    const [blob, filename] = saveAs.mock.calls[0];
    expect(filename).toMatch(/^Klasser_Backup_\d{4}-\d{2}-\d{2}\.zip$/);
    // Læs den faktiske download: en korrekt mellemrepræsentation er ikke nok.
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const entries = Object.values(zip.files).filter(entry => !entry.dir);
    expect(entries.map(entry => entry.name)).toEqual(['Eksportreview.xlsx']);
    const bytes = await entries[0].async('uint8array');
    const workbook = XLSX.read(bytes, { type: 'array' });
    expect(workbook.SheetNames).toEqual(['Elever']);
    return XLSX.utils.sheet_to_json(workbook.Sheets.Elever, { defval: '' });
}

beforeEach(() => {
    vi.clearAllMocks();
    window.notifyError = vi.fn();
    window.notifySuccess = vi.fn();
    window.notifyInfo = vi.fn();
});

afterEach(() => {
    app?.unmount();
    host?.remove();
    app = null;
    host = null;
    vi.restoreAllMocks();
});

describe('Excel-eksporten følger gruppernes aktuelle tilstand', () => {
    it('udelader en forældet beregnet matrix og beholder stamgrupperne', async () => {
        const cls = makeClass();
        cls.groups.matrixStale = true;
        await mountSelectedClass(cls);
        const rows = await downloadWorkbook();
        expect(rows.map(row => row.Stamgruppe)).toEqual(['Gruppe 1 (Klima)', 'Gruppe 2']);
        expect(rows.every(row => !Object.hasOwn(row, 'Matrixgruppe'))).toBe(true);
        expect(api.exportClasses).toHaveBeenCalledWith([cls.filename]);
    });

    it('bevarer lærerens egen matrix-kolonne, når den beregnede matrix er forældet', async () => {
        const cls = makeClass();
        cls.groups.matrixStale = true;
        cls.data[0].Matrixgruppe = 'Lærerens A';
        cls.data[1].Matrixgruppe = 'Lærerens B';
        await mountSelectedClass(cls);
        const rows = await downloadWorkbook();
        expect(rows.map(row => row.Matrixgruppe)).toEqual(['Lærerens A', 'Lærerens B']);
        expect(rows.every(row => !Object.hasOwn(row, 'Matrixgruppe (2)'))).toBe(true);
        expect(rows.map(row => row.Stamgruppe)).toEqual(['Gruppe 1 (Klima)', 'Gruppe 2']);
    });

    it.each([false, undefined])('eksporterer en gyldig matrix med matrixStale=%s', async matrixStale => {
        const cls = makeClass();
        if (matrixStale === undefined) delete cls.groups.matrixStale;
        else cls.groups.matrixStale = matrixStale;
        await mountSelectedClass(cls);
        const rows = await downloadWorkbook();
        // Samme navn må ikke få de to forskellige elev-id'er slået sammen.
        expect(rows.map(row => row.Stamgruppe)).toEqual(['Gruppe 1 (Klima)', 'Gruppe 2']);
        expect(rows.map(row => row.Matrixgruppe)).toEqual(['Gruppe 2', 'Gruppe 1 (Energi)']);
    });

    it.each(['Name', undefined])('eksporterer uåbnede gamle klasser med id_column=%s uden at ændre backup-data', async idColumn => {
        const cls = makeClass();
        cls.data = [{ Name: 'Anna' }, { Name: 'Anna' }, { Name: 'Bo' }];
        if (idColumn !== undefined) cls.id_column = idColumn;
        cls.groups = {
            standard: [
                { name: 'Group 1', members: ['Anna', 'Bo'] },
                { name: 'Group 2', members: [{ id: 'Anna', name: 'Anna' }] },
            ],
            matrix: [
                { name: 'Group 1', members: ['Anna'] },
                { name: 'Group 2', members: ['Anna', 'Bo'] },
            ],
        };
        cls.groupTopics = {};
        const original = JSON.stringify(cls);
        await mountSelectedClass(cls);
        const rows = await downloadWorkbook();
        expect(rows.map(row => row.Stamgruppe)).toEqual(['Gruppe 1', 'Gruppe 2', 'Gruppe 1']);
        expect(rows.map(row => row.Matrixgruppe)).toEqual(['Gruppe 1', 'Gruppe 2', 'Gruppe 2']);
        expect(JSON.stringify(cls)).toBe(original);
        expect(rows.every(row => !Object.hasOwn(row, '_rowId'))).toBe(true);
    });

    it.each([
        ['missing keys', {}],
        ['null values', { 'S_Group 1': null, 'M_Group 1': null }],
        ['empty text', { 'S_Group 1': '', 'M_Group 1': '' }],
        ['whitespace only', { 'S_Group 1': ' \t ', 'M_Group 1': '\n ' }],
    ])('does not resurrect old group topics when the topic map has %s', async (_name, groupTopics) => {
        const cls = makeClass();
        cls.groupTopics = groupTopics;
        await mountSelectedClass(cls);
        const rows = await downloadWorkbook();
        expect(rows.map(row => row.Stamgruppe)).toEqual(['Gruppe 1', 'Gruppe 2']);
        expect(rows.map(row => row.Matrixgruppe)).toEqual(['Gruppe 2', 'Gruppe 1']);
    });

    it('fjerner mellemrum omkring de aktuelle emner i begge gruppesæt', async () => {
        const cls = makeClass();
        cls.groupTopics = { 'S_Group 1': '  Nyt stamemne\n', 'M_Group 1': '\tNyt matrixemne  ' };
        await mountSelectedClass(cls);
        const rows = await downloadWorkbook();
        expect(rows.map(row => row.Stamgruppe)).toEqual(['Gruppe 1 (Nyt stamemne)', 'Gruppe 2']);
        expect(rows.map(row => row.Matrixgruppe)).toEqual(['Gruppe 2', 'Gruppe 1 (Nyt matrixemne)']);
    });

    it('bevarer lærerens kolonner ved navnesammenfald, viser fravær og fjerner interne felter', async () => {
        const cls = makeClass();
        // Kolonnen findes først på anden række; også den skal reserveres.
        Object.assign(cls.data[1], { 'Til stede': 'Egen status', Stamgruppe: 'Egen stamgruppe', Matrixgruppe: 'Egen matrixgruppe' });
        await mountSelectedClass(cls);
        const rows = await downloadWorkbook();
        expect(rows).toEqual([
            {
                Name: 'Anna', 'Til stede': '', Stamgruppe: '', Matrixgruppe: '',
                'Til stede (2)': 'Ja', 'Stamgruppe (2)': 'Gruppe 1 (Klima)', 'Matrixgruppe (2)': 'Gruppe 2',
            },
            {
                Name: 'Anna', 'Til stede': 'Egen status', Stamgruppe: 'Egen stamgruppe', Matrixgruppe: 'Egen matrixgruppe',
                'Til stede (2)': 'Nej', 'Stamgruppe (2)': 'Gruppe 2', 'Matrixgruppe (2)': 'Gruppe 1 (Energi)',
            },
        ]);
    });

    it('lader forældede grupper og de oprindelige emner være til den efterfølgende JSON-backup', async () => {
        const cls = makeClass();
        cls.groups.matrixStale = true;
        cls.groupTopics = {};
        const original = JSON.stringify(cls);
        await mountSelectedClass(cls);
        await downloadWorkbook();
        expect(JSON.stringify(cls)).toBe(original);

        const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export-review');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        vi.spyOn(globalThis.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        host.querySelector('button.secondary').click();
        await vi.waitFor(() => expect(createUrl).toHaveBeenCalledOnce());
        const backup = JSON.parse(await createUrl.mock.calls[0][0].text());
        expect(backup).toEqual([JSON.parse(original)]);
        expect(backup[0].groups.matrixStale).toBe(true);
        expect(backup[0].groups.matrix).toEqual(cls.groups.matrix);
        expect(JSON.stringify(cls)).toBe(original);
    });
});
