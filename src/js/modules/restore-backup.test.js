// Gendannelse af backup er lærerens sidste udvej — der er ingen server med en
// kopi. Derfor to værn: en fejlet skrivning må ikke tælles som gendannet, og
// en klasse der skrives OVEN I en eksisterende må ikke arve den gamle klasses
// gemte grupper (elev-id'erne peger på helt andre elever i den nye klasse).
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { initApiAdapter } from './api_adapter.js';
import { pyBridge } from './py_bridge.js';
import * as api from './api.js';

beforeAll(() => initApiAdapter());

const BACKUP = (filename, className) => ([{
    __inspected: true,
    filename,
    name: className,
    data: [{ Navn: className, _rowId: 'r1' }],
    columns: ['Navn'],
    rules: [],
    id_column: 'Navn',
}]);

describe('restoreBackup', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        window.notifyError = () => {};
    });
    afterEach(() => vi.restoreAllMocks());

    it('en klasse der ikke kunne skrives tælles ikke som gendannet', async () => {
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            const e = new Error('QuotaExceededError');
            e.name = 'QuotaExceededError';
            throw e;
        });

        const res = await api.restoreBackup(BACKUP('3a.csv', 'Anna'), { collisionMode: 'overwrite' });

        expect(res.written).toBe(0);
        expect(res.success).toBe(false);
        expect(res.failed).toHaveLength(1);
        expect(res.failed[0].filename).toBe('3a.csv');
    });

    it('melder filnavnene den skrev — også når en klasse overskrives på sin gamle plads', async () => {
        // "3a" står FØRST i listen. Overskrives den, bliver den stående dér,
        // så den der kalder, kan ikke gætte klassen ud fra listens rækkefølge.
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        pyBridge.createClass('3b', 'Navn\nBo\n', true);
        const [first] = pyBridge.getClasses().map(c => c.filename);

        const res = await api.restoreBackup(BACKUP(first, 'Cecilie'), { collisionMode: 'overwrite' });

        expect(res.writtenFilenames).toEqual([first]);
        expect(pyBridge.getClasses()[0].filename).toBe(first);

        // Ved "Importér som kopi" er det det NYE filnavn, der meldes.
        const renamed = await api.restoreBackup(BACKUP(first, 'Dorte'), { collisionMode: 'rename' });
        expect(renamed.writtenFilenames).toHaveLength(1);
        expect(renamed.writtenFilenames[0]).not.toBe(first);
        expect(pyBridge.getClass(renamed.writtenFilenames[0])).toBeTruthy();
    });

    it('"Overskriv mine" rammer kun de klasser, læreren så på listen (shownCollisions)', async () => {
        // 3a stod på listen i "Disse klasser findes allerede". 3b blev oprettet
        // i en anden fane, MENS vinduet stod åbent — den må ikke overskrives.
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        pyBridge.createClass('3b', 'Navn\nBo\n', true);
        const backup = [...BACKUP('3a.csv', 'Cecilie'), ...BACKUP('3b.csv', 'Dorte')];

        const res = await api.restoreBackup(backup,
            { collisionMode: 'overwrite', shownCollisions: ['3a.csv'] });

        expect(res.written).toBe(2);
        expect(res.keptBoth).toEqual(['3b.csv']);
        expect(pyBridge.getClass('3a.csv').content.data[0].Navn).toBe('Cecilie');
        // Lærerens egen 3b er urørt; backuppens står ved siden af som kopi.
        expect(pyBridge.getClass('3b.csv').content.data[0].Navn).toBe('Bo');
        const copy = res.writtenFilenames.find(f => f !== '3a.csv');
        expect(copy).not.toBe('3b.csv');
        expect(pyBridge.getClass(copy).content.data[0].Navn).toBe('Dorte');
        expect(pyBridge.getClass(copy).name).toBe('Dorte (gendannet)');

        // "Spring over" springer heller ikke en klasse over, læreren ikke så.
        const skip = await api.restoreBackup([...BACKUP('3a.csv', 'Frida'), ...BACKUP('3b.csv', 'Gorm')],
            { collisionMode: 'skip', shownCollisions: ['3a.csv'] });
        expect(skip.skipped).toBe(1);
        expect(skip.keptBoth).toEqual(['3b.csv']);
        expect(pyBridge.getClass('3a.csv').content.data[0].Navn).toBe('Cecilie');
        expect(pyBridge.getClass('3b.csv').content.data[0].Navn).toBe('Bo');
        expect(skip.writtenFilenames.map(f => pyBridge.getClass(f).content.data[0].Navn)).toEqual(['Gorm']);

        // Uden feltet overskrives alle sammenstød, som før.
        const all = await api.restoreBackup(BACKUP('3b.csv', 'Erik'), { collisionMode: 'overwrite' });
        expect(all.keptBoth).toEqual([]);
        expect(pyBridge.getClass('3b.csv').content.data[0].Navn).toBe('Erik');
    });

    it('gendannelse oven i en klasse rydder den gamle klasses gemte grupper', async () => {
        // Klassen findes allerede og har gemte grupper + historik.
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;
        localStorage.setItem(`grupdk_groups_${file}`, JSON.stringify({
            standard: [{ name: 'Gruppe 1', members: ['r1'] }], matrix: null,
        }));
        localStorage.setItem(`grupdk_topics_${file}`, JSON.stringify({ 'S_Gruppe 1': 'Gammelt emne' }));

        const res = await api.restoreBackup(BACKUP(file, 'Bo'), { collisionMode: 'overwrite' });

        expect(res.written).toBe(1);
        expect(res.success).toBe(true);
        // Grupperne pegede på den FORRIGE klasses r1 — de skal være væk, ikke
        // hænge ved og vise et forkert navn på gruppekortet.
        expect(localStorage.getItem(`grupdk_groups_${file}`)).toBeNull();
        expect(localStorage.getItem(`grupdk_topics_${file}`)).toBeNull();
        expect(pyBridge.getClass(file).content.data[0].Navn).toBe('Bo');
    });

    it('en gammel backup uden grupper oven i en klasse med grupper siges i svaret (emptied)', async () => {
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;
        localStorage.setItem(`grupdk_groups_${file}`, JSON.stringify({
            standard: [{ name: 'Gruppe 1', members: ['r1'] }], matrix: null,
        }));

        // BACKUP har slet ikke felterne groups/history/sessions (gammelt format)
        const res = await api.restoreBackup(BACKUP(file, 'Bo'), { collisionMode: 'overwrite' });

        expect(res.emptied).toEqual([{ filename: file, hadGroups: true, hadSessions: false }]);
    });

    it('en backup MED grupper-felterne, eller en klasse uden grupper, giver ingen emptied', async () => {
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;
        // Klassen har intet: intet at sige
        let res = await api.restoreBackup(BACKUP(file, 'Bo'), { collisionMode: 'overwrite' });
        expect(res.emptied).toEqual([]);

        // Nyt format: felterne findes (også tomme) — så er tomheden backuppens egen
        localStorage.setItem(`grupdk_groups_${file}`, JSON.stringify({
            standard: [{ name: 'Gruppe 1', members: ['r1'] }], matrix: null,
        }));
        const [entry] = BACKUP(file, 'Cecilie');
        res = await api.restoreBackup([{ ...entry, groups: null, groupTopics: {}, history: [], sessions: {} }],
            { collisionMode: 'overwrite' });
        expect(res.emptied).toEqual([]);
    });

    it('omdøbning ved sammenstød rører ikke den eksisterende klasses grupper', async () => {
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;
        localStorage.setItem(`grupdk_groups_${file}`, JSON.stringify({ standard: [], matrix: null }));

        const res = await api.restoreBackup(BACKUP(file, 'Bo'), { collisionMode: 'rename' });

        expect(res.written).toBe(1);
        // Den gamle klasse er urørt — backuppen landede under et nyt navn.
        expect(localStorage.getItem(`grupdk_groups_${file}`)).not.toBeNull();
        expect(pyBridge.getClass(file).content.data[0].Navn).toBe('Anna');
    });
});

// Import fra Excel/CSV har altid afvist ulæselige rækker og for store hold.
// Gendannelse fra backup gik uden om begge dele og skrev direkte i lageret.
describe('inspectBackup — en ødelagt backup skal afvises, ikke gemmes', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        window.notifyError = () => {};
    });

    it('afviser en klasse hvis elevrækker ikke er objekter', async () => {
        const res = await api.inspectBackup([{
            filename: '3a.csv', name: '3.a', data: ['Anna', 'Bo'],
        }]);

        expect(res.valid).toHaveLength(0);
        expect(res.invalid[0].reason).toContain('objekter');
    });

    it('afviser en klasse med flere elever end importgrænsen', async () => {
        const data = Array.from({ length: 501 }, (_, i) => ({ Navn: `Elev ${i}` }));
        const res = await api.inspectBackup([{ filename: '3a.csv', name: '3.a', data }]);

        expect(res.valid).toHaveLength(0);
        expect(res.invalid[0].reason).toContain('501');
    });

    it('lader en almindelig klasse passere', async () => {
        const res = await api.inspectBackup([{
            filename: '3a.csv', name: '3.a', data: [{ Navn: 'Anna', _rowId: 'r1' }],
        }]);

        expect(res.valid).toHaveLength(1);
        expect(res.invalid).toHaveLength(0);
    });
});

// Navnet i menuen ligger UDEN FOR klassens `content`, så det følger ikke med
// de felter et almindeligt gem skriver. Gendannelsen opretter klassen forfra,
// og indtil 6/9 fandt updateClass() derfor selv på et navn ud fra filnavnet:
// "3.b Samfundsfag A" kom tilbage som "3_b_samfundsfag_a" — netop i den
// browser hvor backuppen var det eneste, læreren havde tilbage.
describe('restoreBackup — klassens navn følger med tilbage', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        window.notifyError = () => {};
    });

    it('en gendannet klasse hedder det den hed, ikke sit filnavn', async () => {
        const res = await api.restoreBackup([{
            __inspected: true,
            filename: '3_b_samfundsfag_a.csv',
            name: '3.b Samfundsfag A',
            data: [{ Navn: 'Anna', _rowId: 'r1' }],
            rules: [],
            id_column: 'Navn',
        }], { collisionMode: 'overwrite' });

        expect(res.written).toBe(1);
        expect(pyBridge.getClasses()[0].name).toBe('3.b Samfundsfag A');
    });

    it('"Erstat" lader også backuppens navn træde i stedet', async () => {
        pyBridge.createClass('3b', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;

        await api.restoreBackup([{
            __inspected: true, filename: file, name: '3.b Samfundsfag A',
            data: [{ Navn: 'Bo', _rowId: 'r1' }], rules: [], id_column: 'Navn',
        }], { collisionMode: 'overwrite' });

        expect(pyBridge.getClasses()[0].name).toBe('3.b Samfundsfag A');
    });

    it('"Behold begge" mærker den gendannede kopi, så de to kan skelnes', async () => {
        pyBridge.createClass('3b', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;

        await api.restoreBackup([{
            __inspected: true, filename: file, name: '3.b Samfundsfag A',
            data: [{ Navn: 'Bo', _rowId: 'r1' }], rules: [], id_column: 'Navn',
        }], { collisionMode: 'rename' });

        const names = pyBridge.getClasses().map(c => c.name);
        expect(names).toHaveLength(2);
        expect(names).toContain('3.b Samfundsfag A (gendannet)');
    });

    it('et almindeligt gem rører ikke navnet — heller ikke efter et omdøb', async () => {
        pyBridge.createClass('3b', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;
        pyBridge.renameClass(file, 'Mit eget navn');

        await api.saveClassData(file, [{ Navn: 'Anna', _rowId: 'r1' }], [], 'Navn', [], {}, {}, [], [], {});

        expect(pyBridge.getClasses()[0].name).toBe('Mit eget navn');
    });
});

// En backup er tekst, som alle kan rette i. Før blev regler, aftaler, grupper
// og emner skrevet, bare den yderste form passede ("rules er en liste"), og
// en sonde med 23 forkerte former fandt fire, der gav en grøn kvittering og
// en klasse, der ikke virkede (121. gennemsyn, tematik 112). Nu gendannes
// eleverne altid, og det, der ikke har formen, lades ude og nævnes.
describe('restoreBackup — forkerte former inde i en klasse', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        window.notifyError = () => {};
    });

    const ENTRY = (extra) => ({ ...BACKUP('form.csv', 'Form')[0], ...extra });

    it('regler og "Undgå hinanden"-aftaler uden formen lades ude og nævnes', async () => {
        const good = { type: 'distribute', column: 'Navn' };
        const res = await api.restoreBackup([ENTRY({
            rules: [null, good, 'abc', { type: 42 }],
            matrixRules: [{ column: { x: 1 } }],
            separations: [null, { ids: 'r1' }, { ids: ['r1', 'r2'] }, { ids: ['Anna', 7, null] }],
        })], { collisionMode: 'overwrite' });

        expect(res.written).toBe(1);
        const stored = pyBridge.getClass('form.csv').content;
        expect(stored.data[0].Navn).toBe('Form');
        expect(stored.rules).toEqual([good]);
        expect(stored.matrixRules).toEqual([]);
        // En aftale med et tal eller et hul i listen beholdes — kun formen
        // { ids: [...] } kræves (gamle klasser kan have elevnavne dér).
        expect(stored.separations).toEqual([{ ids: ['r1', 'r2'] }, { ids: ['Anna', 7, null] }]);
        expect(res.partial).toEqual([expect.objectContaining({
            filename: 'form.csv', parts: ['nogle regler', 'nogle "Undgå hinanden"-aftaler'],
        })]);
    });

    it('grupper uden formen skrives ikke, og kvitteringen siger det', async () => {
        for (const groups of [{ standard: 'abc' }, { standard: [null] },
            { standard: [{ name: 'Gruppe 1', members: 'r1' }] }, { matrix: [{ name: 'M', members: [null] }] }]) {
            localStorage.clear();
            pyBridge._invalidateClassesCache();
            const res = await api.restoreBackup([ENTRY({ groups })], { collisionMode: 'overwrite' });
            expect(res.written).toBe(1);
            expect(localStorage.getItem('grupdk_groups_form.csv')).toBeNull();
            expect(res.partial[0].parts).toEqual(['grupper']);
        }
    });

    it('rigtige grupper og emner kommer stadig med', async () => {
        const groups = { standard: [{ name: 'Group 1', members: ['r1', { id: 'r2', name: 'Bo' }] }], matrix: null };
        const res = await api.restoreBackup([ENTRY({ groups, groupTopics: { 'S_Group 1': 'Klima', 'S_Group 2': null } })],
            { collisionMode: 'overwrite' });
        expect(res.partial).toEqual([]);
        expect(JSON.parse(localStorage.getItem('grupdk_groups_form.csv'))).toEqual(groups);
        expect(JSON.parse(localStorage.getItem('grupdk_topics_form.csv'))).toEqual({ 'S_Group 1': 'Klima', 'S_Group 2': null });
    });

    it('emner, der ikke er tekst, skrives ikke', async () => {
        const res = await api.restoreBackup([ENTRY({ groupTopics: { 'S_Group 1': { a: 1 } } })],
            { collisionMode: 'overwrite' });
        expect(localStorage.getItem('grupdk_topics_form.csv')).toBeNull();
        expect(res.partial[0].parts).toEqual(['emner']);
    });

    it('"Overskriv mine" med ødelagte grupper melder, at klassens egne er væk', async () => {
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;
        localStorage.setItem(`grupdk_groups_${file}`, JSON.stringify({
            standard: [{ name: 'Gruppe 1', members: ['r1'] }], matrix: null,
        }));
        const [entry] = BACKUP(file, 'Bo');
        const res = await api.restoreBackup([{ ...entry, groups: { standard: [null] } }],
            { collisionMode: 'overwrite' });
        expect(res.partial).toEqual([expect.objectContaining({ filename: file, parts: ['grupper'], replacedGroups: true })]);

        // Havde klassen INGEN grupper, er der intet fjernet at melde om.
        localStorage.removeItem(`grupdk_groups_${file}`);
        const none = await api.restoreBackup([{ ...entry, groups: { standard: [null] } }],
            { collisionMode: 'overwrite' });
        expect(none.partial[0].parts).toEqual(['grupper']);
        expect(none.partial[0].replacedGroups).toBeUndefined();

        // Som kopi rører den ikke klassens egne grupper — intet at melde.
        localStorage.setItem(`grupdk_groups_${file}`, JSON.stringify({
            standard: [{ name: 'Gruppe 1', members: ['r1'] }], matrix: null,
        }));
        const copy = await api.restoreBackup([{ ...entry, groups: { standard: [null] } }],
            { collisionMode: 'rename' });
        expect(copy.partial[0].replacedGroups).toBeUndefined();
    });
});
