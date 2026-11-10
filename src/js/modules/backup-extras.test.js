// Backup-filen ER kopien — appen har ingen server. Testene her holder fast i,
// at filen indeholder det den lover: grupperne, emnerne pr. gruppe og de gemte
// sessioner, og at en gendannelse lægger dem tilbage igen.
//
// Fundet der ligger bag: backuppen indeholdt KUN klasse-objektet (elever,
// regler, indstillinger). Grupper, emnekort og historik ligger i deres egne
// localStorage-nøgler og fulgte ikke med. Værre endnu ryddede en gendannelse
// oven i en eksisterende klasse netop de nøgler — så en "gendannelse" kunne
// gøre klassen fattigere end før.
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { initApiAdapter } from './api_adapter.js';
import { pyBridge } from './py_bridge.js';
import * as api from './api.js';

// En session fra i går. Historikken luger sessioner over 90 dage ud
// (storage.js, MAX_HISTORY_AGE_DAYS), så en fast dato i testen holder kun en
// tid: "2026-08-01" faldt for lugningen fra 30/10 og blev først opdaget 2/11, da
// suitens fastlåste ur blev fjernet sammen med den gamle skærm.
const YESTERDAY = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
import { readClassExtras, writeClassExtras } from './storage.js';

beforeAll(() => initApiAdapter());

/** Nøglerne på de gemte session-payloads. Storage lover kun key(i). */
function sessionKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('grupdk_session_')) keys.push(k);
    }
    return keys;
}

/** Læg en klasse med grupper, emner og én gemt session i lageret. */
function classWithEverything(className = '3a') {
    pyBridge.createClass(className, 'Navn\nAnna\nBo\n', true);
    const file = pyBridge.getClasses()[0].filename;
    localStorage.setItem(`grupdk_groups_${file}`, JSON.stringify({
        standard: [{ name: 'Group 1', members: ['r1', 'r2'], locked: false }],
        matrix: null,
    }));
    localStorage.setItem(`grupdk_topics_${file}`, JSON.stringify({ 'S_Group 1': 'Liberalisme' }));
    localStorage.setItem(`grupdk_history_${file}`, JSON.stringify([
        { id: 'sess-1', date: YESTERDAY, name: 'Modul 1', type: 'STANDARD_ONLY' },
    ]));
    localStorage.setItem('grupdk_session_sess-1', JSON.stringify({
        id: 'sess-1', name: 'Modul 1', groups: [{ name: 'Group 1', members: [{ id: 'r1', name: 'Anna' }] }],
    }));
    return file;
}

describe('readClassExtras — hvad der ligger uden for klasse-objektet', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        window.notifyError = () => {};
    });

    it('samler grupper, emnekort, historik og sessionernes indhold', () => {
        const file = classWithEverything();
        const e = readClassExtras(file);

        expect(e.groups.standard[0].name).toBe('Group 1');
        expect(e.groupTopics['S_Group 1']).toBe('Liberalisme');
        expect(e.history).toHaveLength(1);
        expect(e.sessions['sess-1'].name).toBe('Modul 1');
    });

    it('en klasse uden noget af det giver tomme værdier, ikke en fejl', () => {
        pyBridge.createClass('tom', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;
        const e = readClassExtras(file);

        expect(e.groups).toBeNull();
        expect(e.groupTopics).toEqual({});
        expect(e.history).toEqual([]);
    });

    it('en session uden payload tages ikke med — den kan ikke gendannes', () => {
        const file = classWithEverything();
        localStorage.removeItem('grupdk_session_sess-1');

        expect(readClassExtras(file).sessions).toEqual({});
    });
});

describe('exportClasses — backup-filens indhold', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        window.notifyError = () => {};
    });

    it('grupper, emner og gemte sessioner ligger i filen', async () => {
        const file = classWithEverything();
        const res = await api.exportClasses([file]);

        expect(res.error).toBeUndefined();
        const cls = res.data[0];
        expect(cls.data).toHaveLength(2);
        expect(cls.groups.standard[0].members).toEqual(['r1', 'r2']);
        expect(cls.groupTopics['S_Group 1']).toBe('Liberalisme');
        expect(cls.history[0].name).toBe('Modul 1');
        expect(Object.keys(cls.sessions)).toEqual(['sess-1']);
    });
});

describe('restoreBackup — hele vejen rundt', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        window.notifyError = () => {};
    });

    it('eksportér, ryd alt, gendan — grupperne og emnerne er der igen', async () => {
        const file = classWithEverything();
        const backup = (await api.exportClasses([file])).data;

        localStorage.clear();
        pyBridge._invalidateClassesCache();

        const res = await api.restoreBackup(
            backup.map(c => ({ ...c, __inspected: true })), { collisionMode: 'overwrite' });

        expect(res.written).toBe(1);
        expect(res.success).toBe(true);
        expect(res.partial).toEqual([]);

        const again = readClassExtras(file);
        expect(again.groups.standard[0].members).toEqual(['r1', 'r2']);
        expect(again.groupTopics['S_Group 1']).toBe('Liberalisme');
        expect(again.history).toHaveLength(1);
        expect(again.history[0].name).toBe('Modul 1');
    });

    it('gendannelse oven i en klasse erstatter grupperne — den arver ikke de gamle', async () => {
        const file = classWithEverything();
        const backup = (await api.exportClasses([file])).data;

        // Klassen arbejdes videre på: nye grupper, nyt emne.
        localStorage.setItem(`grupdk_groups_${file}`, JSON.stringify({
            standard: [{ name: 'Group 9', members: ['r2'] }], matrix: null,
        }));
        localStorage.setItem(`grupdk_topics_${file}`, JSON.stringify({ 'S_Group 9': 'Nyt emne' }));

        await api.restoreBackup(
            backup.map(c => ({ ...c, __inspected: true })), { collisionMode: 'overwrite' });

        const again = readClassExtras(file);
        expect(again.groups.standard[0].name).toBe('Group 1');
        expect(again.groupTopics['S_Group 9']).toBeUndefined();
        expect(again.groupTopics['S_Group 1']).toBe('Liberalisme');
    });

    it('en gammel backup uden de nye felter gendannes stadig', async () => {
        const res = await api.restoreBackup([{
            __inspected: true,
            filename: '2b.csv',
            name: '2.b',
            data: [{ Navn: 'Cecilie', _rowId: 'r1' }],
            rules: [],
        }], { collisionMode: 'overwrite' });

        expect(res.written).toBe(1);
        expect(res.partial).toEqual([]);
    });
});

describe('columnOrders — rangeringen skal overleve hele vejen rundt', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        window.notifyError = () => {};
    });

    /** Klasse med en rangeret tekstkolonne. */
    async function classWithRanking() {
        pyBridge.createClass('3a', 'Navn,Niveau\nAnna,Lav\nBo,Høj\n', true);
        const file = pyBridge.getClasses()[0].filename;
        const cls = await api.fetchClass(file);
        await api.saveClassData(
            file, cls.data, [], 'Navn', [], {}, {}, [], [],
            { Niveau: ['Lav', 'Middel', 'Høj'] });
        return file;
    }

    it('gemmes på klassen og kan læses igen', async () => {
        const file = await classWithRanking();
        const again = await api.fetchClass(file);
        expect(again.columnOrders).toEqual({ Niveau: ['Lav', 'Middel', 'Høj'] });
    });

    it('følger med i backup-filen', async () => {
        const file = await classWithRanking();
        const res = await api.exportClasses([file]);
        expect(res.data[0].columnOrders).toEqual({ Niveau: ['Lav', 'Middel', 'Høj'] });
    });

    it('eksportér, ryd alt, gendan — rangeringen er der stadig', async () => {
        const file = await classWithRanking();
        const backup = (await api.exportClasses([file])).data;

        localStorage.clear();
        pyBridge._invalidateClassesCache();

        const res = await api.restoreBackup(
            backup.map(c => ({ ...c, __inspected: true })), { collisionMode: 'overwrite' });
        expect(res.written).toBe(1);

        const again = await api.fetchClass(file);
        expect(again.columnOrders).toEqual({ Niveau: ['Lav', 'Middel', 'Høj'] });
    });

    it('en gammel klasse uden feltet får et tomt opslag, ikke undefined', async () => {
        pyBridge.createClass('2b', 'Navn\nCecilie\n', true);
        const file = pyBridge.getClasses()[0].filename;
        const cls = await api.fetchClass(file);
        await api.saveClassData(file, cls.data, [], 'Navn', [], {}, {}, [], []);
        expect((await api.fetchClass(file)).columnOrders).toEqual({});
    });

    it('en backup med skrald i feltet afvises frem for at blive gemt', async () => {
        const res = await api.inspectBackup([{
            filename: '2b.csv', name: '2.b',
            data: [{ Navn: 'Cecilie' }], rules: [],
            columnOrders: ['Lav', 'Høj'],   // liste, ikke opslag
        }]);
        expect(res.valid).toHaveLength(0);
        expect(res.invalid[0].reason).toContain('columnOrders');
    });

    it('en gammel backup HELT uden feltet gendannes stadig', async () => {
        const res = await api.restoreBackup([{
            __inspected: true, filename: '2b.csv', name: '2.b',
            data: [{ Navn: 'Cecilie', _rowId: 'r1' }], rules: [],
        }], { collisionMode: 'overwrite' });
        expect(res.written).toBe(1);
        expect((await api.fetchClass('2b.csv')).columnOrders).toEqual({});
    });
});

describe('writeClassExtras — sessionerne må ikke skrive oven i hinanden', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        window.notifyError = () => {};
    });

    it('sessionen får et NYT id, så en anden klasses session ikke overskrives', () => {
        // En session med samme id findes allerede — den hører til en anden klasse.
        localStorage.setItem('grupdk_session_sess-1', JSON.stringify({ id: 'sess-1', name: 'Andens' }));

        writeClassExtras('3a.csv', {
            groups: null,
            groupTopics: {},
            history: [{ id: 'sess-1', date: YESTERDAY, name: 'Min' }],
            sessions: { 'sess-1': { id: 'sess-1', name: 'Min' } },
        });

        // Den fremmede session står urørt …
        expect(JSON.parse(localStorage.getItem('grupdk_session_sess-1')).name).toBe('Andens');
        // … og den gendannede har fået sit eget id, som listen peger på.
        const list = JSON.parse(localStorage.getItem('grupdk_history_3a.csv'));
        expect(list[0].id).not.toBe('sess-1');
        expect(JSON.parse(localStorage.getItem(`grupdk_session_${list[0].id}`)).name).toBe('Min');
    });

    it('en session uden payload udelades — en blindgyde i listen hjælper ingen', () => {
        writeClassExtras('3a.csv', {
            history: [{ id: 'mangler', name: 'Spøgelse' }],
            sessions: {},
        });

        expect(localStorage.getItem('grupdk_history_3a.csv')).toBeNull();
    });

    // Appen gemmer selv højst 50 sessioner pr. klasse og smider dem over 90
    // dage væk — saveHistory() håndhæver begge dele. Gendannelsen skrev
    // udenom, direkte i lageret, så en backup kunne lægge lige så mange ind
    // som filen indeholdt. Pladsen deles med ALLE dida.dk-værktøjer.
    it('holder sig til de 50 sessioner, også når backuppen har flere', () => {
        const history = [];
        const sessions = {};
        for (let i = 0; i < 200; i++) {
            const id = `s${i}`;
            // Nyeste først i tid, så det er de 50 nyeste vi forventer beholdt.
            history.push({ id, name: `Modul ${i}`, date: new Date(Date.now() - i * 60000).toISOString() });
            sessions[id] = { id, name: `Modul ${i}` };
        }
        writeClassExtras('3a.csv', { history, sessions });

        const list = JSON.parse(localStorage.getItem('grupdk_history_3a.csv'));
        expect(list).toHaveLength(50);
        expect(list.map(e => e.name)).toContain('Modul 0');
        expect(list.map(e => e.name)).not.toContain('Modul 60');

        // Og der ligger ikke 200 payloads tilbage i lageret.
        expect(sessionKeys()).toHaveLength(50);
    });

    it('skriver ikke sessioner der er ældre end 90 dage', () => {
        const old = new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString();
        const recentDate = new Date().toISOString();
        writeClassExtras('3a.csv', {
            history: [
                { id: 'g1', name: 'Sidste skoleår', date: old },
                { id: 'n1', name: 'I går', date: recentDate },
            ],
            sessions: { g1: { id: 'g1' }, n1: { id: 'n1' } },
        });

        const list = JSON.parse(localStorage.getItem('grupdk_history_3a.csv'));
        expect(list).toHaveLength(1);
        expect(list[0].name).toBe('I går');
        expect(sessionKeys()).toHaveLength(1);
    });

    // Udrensningen skete tavst: en backup med et års historik kunne bære 200
    // sessioner ind, hvoraf 150 blev luget væk, og kvitteringen sagde bare
    // "gendannet". Læreren tæller sessionerne efter og ser et tab, ingen har
    // nævnt. Nu følger tallet med tilbage, så kvitteringen kan sige det.
    it('fortæller hvor mange sessioner udrensningen tog', () => {
        const oldDate = new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString();
        const recentDate = new Date().toISOString();
        const res = writeClassExtras('3a.csv', {
            history: [
                { id: 'g1', name: 'Sidste skoleår', date: oldDate },
                { id: 'g2', name: 'Forrige skoleår', date: oldDate },
                { id: 'n1', name: 'I går', date: recentDate },
            ],
            sessions: { g1: { id: 'g1' }, g2: { id: 'g2' }, n1: { id: 'n1' } },
        });

        expect(res.prunedSessions).toBe(2);
    });

    it('melder ikke historikken skrevet, når lofterne tog alle sessioner', () => {
        const oldDate = new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString();
        const res = writeClassExtras('3a.csv', {
            history: [{ id: 'g1', name: 'Sidste skoleår', date: oldDate }],
            sessions: { g1: { id: 'g1' } },
        });

        expect(localStorage.getItem('grupdk_history_3a.csv')).toBeNull();
        expect(res.written).not.toContain('historik');
        expect(res.sessionsRestored).toBe(0);
        expect(res.sessionsMissing).toBe(0);
    });

    it('siger 0 udrensede, når alt i filen kom med', () => {
        const recentDate = new Date().toISOString();
        const res = writeClassExtras('3a.csv', {
            history: [{ id: 'n1', name: 'I går', date: recentDate }],
            sessions: { n1: { id: 'n1' } },
        });

        expect(res.prunedSessions).toBe(0);
    });
});

// En backup LÆSER klasserne. Den må ikke flytte, hvilken udgave fanen tror,
// den har på skærmen (getClass med track i py_bridge.js) — ellers skriver en
// gammel fane, der har taget en backup, sin gamle udgave over den nye fanes
// rettelser, når den lukkes. Målt i e2e/to_faner.spec.ts 10/11 2026.
describe('backuppen og fanens udgave af klassen', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
        pyBridge._seenModified.clear();
        pyBridge._seenContent.clear();
        window.notifyError = () => {};
    });

    it('en backup i den gamle fane lader den anden fanes rettelse stå ved næste gem', async () => {
        pyBridge.createClass('3a', 'Navn\nAnna\nBo\n', true);
        const file = pyBridge.getClasses()[0].filename;
        // Denne fane åbner klassen og gemmer én gang (som appen gør).
        const mine = await api.fetchClass(file, { track: true });
        await api.saveClassData(file, mine.data, [], 'Navn', [], {}, {}, [], [], {});
        const onScreen = structuredClone(mine.data);

        // Den anden fane retter Anna til Annika — udenom denne fanes cache.
        const list = JSON.parse(localStorage.getItem('grupdk_classes'));
        list[0].content.data[0].Navn = 'Annika';
        list[0].last_modified = new Date(Date.now() + 1000).toISOString();
        localStorage.setItem('grupdk_classes', JSON.stringify(list));
        pyBridge._invalidateClassesCache();

        // Denne fane tager en backup (den får den nye udgave med) …
        const seenBefore = pyBridge._seenContent.get(file);
        const res = await api.exportClasses([file]);
        expect(res.data[0].data[0].Navn).toBe('Annika');
        expect(pyBridge._seenContent.get(file)).toBe(seenBefore);

        // … og gemmer så sin skærm uden egne rettelser (fx når fanen lukkes).
        await api.saveClassData(file, onScreen, [], 'Navn', [], {}, {}, [], [], {});
        const stored = JSON.parse(localStorage.getItem('grupdk_classes'))[0];
        expect(stored.content.data[0].Navn).toBe('Annika');
    });

    it('kun indlæsningen (track) flytter fanens udgave', async () => {
        pyBridge.createClass('3a', 'Navn\nAnna\n', true);
        const file = pyBridge.getClasses()[0].filename;
        await api.fetchClass(file);
        expect(pyBridge._seenContent.has(file)).toBe(false);
        await api.fetchClass(file, { track: true });
        expect(pyBridge._seenContent.has(file)).toBe(true);
    });
});
