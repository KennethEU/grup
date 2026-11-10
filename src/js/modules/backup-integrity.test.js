// Fejlveje for backup: kontrollér indhold og lager, ikke kun kvitteringen.
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initApiAdapter } from './api_adapter.js';
import { pyBridge, safeStorageSet } from './py_bridge.js';
import * as api from './api.js';
import { writeClassExtras } from './storage.js';

vi.mock('./py_bridge.js', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, safeStorageSet: vi.fn(actual.safeStorageSet) };
});

beforeAll(() => initApiAdapter());
beforeEach(() => {
    safeStorageSet.mockReset();
    localStorage.clear();
    pyBridge._invalidateClassesCache();
    window.notifyError = () => {};
});
afterEach(() => {
    vi.restoreAllMocks();
    safeStorageSet.mockClear();
});

const entry = (filename, name = 'Bo') => ({
    filename, data: [{ Navn: name, _rowId: 'r1' }], id_column: 'Navn',
});

describe('backup-integritet', () => {
    it('Importér som kopi overskriver aldrig en tidligere gendannelse med samme tidsstempel', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1234);
        await api.restoreBackup([entry('3a.csv', 'Anna'), entry('3a_restored_1234.csv', 'Cecilie'),
            entry('3a_gendannet_1234.csv', 'David')]);
        const res = await api.restoreBackup([entry('3a.csv', 'Bo'), entry('3a.csv', 'Emma')],
            { collisionMode: 'rename' });
        expect(res.written).toBe(2);
        const names = pyBridge.getClasses().map(c => c.content.data[0].Navn);
        expect(names.sort()).toEqual(['Anna', 'Bo', 'Cecilie', 'David', 'Emma']);
    });

    it.each([
        ['grupdk_groups_3a.csv', '{'],
        ['grupdk_topics_3a.csv', '[1]'],
        ['grupdk_history_3a.csv', '{}'],
    ])('eksport varsler ulæselige data i %s og bevarer elevlisten', async (key, value) => {
        await api.restoreBackup([entry('3a.csv')]);
        localStorage.setItem(key, value);
        const res = await api.exportClasses(['3a.csv']);
        expect(res.data[0].data[0].Navn).toBe('Bo');
        expect(res.warnings).toHaveLength(1);
        expect(res.warnings[0].filename).toBe('3a.csv');
        expect(res.warnings[0].parts.length).toBeGreaterThan(0);
        expect(localStorage.getItem(key)).toBe(value);
    });

    it('eksport varsler en session som listen kender, men som ikke kan læses', async () => {
        await api.restoreBackup([entry('3a.csv')]);
        localStorage.setItem('grupdk_history_3a.csv', JSON.stringify([{ id: 'missing' }]));
        const res = await api.exportClasses(['3a.csv']);
        expect(res.warnings).toEqual([{ filename: '3a.csv', parts: ['historik'] }]);
    });

    it('gendannelse af manglende sessionsindhold kvitteres som delvis', async () => {
        const res = await api.restoreBackup([{ ...entry('3a.csv'), history: [{ id: 'missing' }], sessions: {} }]);
        expect(res.written).toBe(1);
        // Tallene følger med pr. klasse: 0 kom ind, 1 manglede (ikke i filen).
        expect(res.partial).toEqual([{
            filename: '3a.csv', parts: ['historik'], sessionsRestored: 0, sessionsMissing: 1,
        }]);
    });

    it('sessionsopslag arver ikke constructor fra Object', () => {
        const res = writeClassExtras('3a.csv', { history: [{ id: 'constructor' }], sessions: {} });
        expect(res.failed).toContain('historik');
        expect(localStorage.getItem('grupdk_history_3a.csv')).toBeNull();
    });

    it('opdager navnesammenstød inde i en backup før der findes klasser lokalt', async () => {
        const res = await api.inspectBackup([entry('3/a.csv', 'Anna'), entry('3:a.csv', 'Bo')]);
        expect(res.valid).toHaveLength(2);
        expect(res.collisions).toEqual(['3_a.csv']);
        expect(pyBridge.getClasses()).toEqual([]);
    });

    it('en normal tom klasse får ingen eksportadvarsel', async () => {
        await api.restoreBackup([entry('3a.csv')]);
        expect((await api.exportClasses(['3a.csv'])).warnings).toEqual([]);
    });

    it('eksport bevarer en ægte sessionsnøgle med navnet __proto__', async () => {
        await api.restoreBackup([entry('3a.csv')]);
        localStorage.setItem('grupdk_history_3a.csv', JSON.stringify([{ id: '__proto__' }]));
        localStorage.setItem('grupdk_session___proto__', '{"id":"__proto__","name":"Modul 1"}');
        const res = await api.exportClasses(['3a.csv']);
        const sessions = JSON.parse(JSON.stringify(res.data[0].sessions));
        expect(Object.hasOwn(sessions, '__proto__')).toBe(true);
        expect(sessions.__proto__.name).toBe('Modul 1');
        expect(res.warnings).toEqual([]);
    });

    it('reserverer også originalnavne senere i samme backup', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1234);
        await api.restoreBackup([entry('3a.csv', 'Anna')]);
        await api.restoreBackup([entry('3a.csv', 'Bo'), entry('3a_restored_1234.csv', 'Cecilie')],
            { collisionMode: 'rename' });
        expect(pyBridge.getClass('3a_restored_1234.csv').content.data[0].Navn).toBe('Cecilie');
        expect(pyBridge.getClass('3a_restored_1234_2.csv').content.data[0].Navn).toBe('Bo');
    });

    it('en afvist historikliste rydder kun de nye payloads og frigør plads straks', () => {
        localStorage.setItem('grupdk_session_foreign', '{"id":"foreign"}');
        safeStorageSet.mockImplementation((key, value) => {
            if (key === 'grupdk_history_3a.csv') return false;
            localStorage.setItem(key, value);
            return true;
        });
        const res = writeClassExtras('3a.csv', {
            history: [{ id: 'one' }, { id: 'two' }],
            sessions: { one: { id: 'one' }, two: { id: 'two' } },
        });
        expect(safeStorageSet).toHaveBeenCalledWith('grupdk_history_3a.csv', expect.any(String));
        expect(res.failed).toEqual(['historik']);
        expect(res.sessionsRestored).toBe(0);
        expect(res.sessionsMissing).toBe(2);
        expect(localStorage.length).toBe(1);
        expect(localStorage.getItem('grupdk_session_foreign')).toBe('{"id":"foreign"}');
    });
});

// Målt 3/11 i Chromium: en gendannelse i en browser med næsten fuldt lager
// fik 3 af 12 sessioner ind — og det var de tre ÆLDSTE, fordi listen blev
// skrevet i sin egen rækkefølge (ældst først). Kvitteringen sagde samtidig
// "historik kunne ikke gendannes", hvad der heller ikke var sandt.
describe('gendannelse i et næsten fuldt lager', () => {
    /** Lagerets størrelse i tegn (nøgle + værdi), som browserne tæller. */
    function used() {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            total += k.length + localStorage.getItem(k).length;
        }
        return total;
    }

    /** En kvote: skrivningen lykkes kun, hvis lageret bagefter er under `limit`. */
    function quota(limit) {
        safeStorageSet.mockImplementation((key, value) => {
            const before = localStorage.getItem(key);
            const after = used() - (before == null ? 0 : key.length + before.length)
                + key.length + value.length;
            if (after > limit) return false;
            localStorage.setItem(key, value);
            return true;
        });
    }

    const PAYLOAD = 'x'.repeat(1000);
    const DAY = 24 * 3600 * 1000;

    /** 12 sessioner, ældst først som i lageret: Modul 1 er 12 dage gammel. */
    function twelveSessions() {
        const history = [];
        const sessions = {};
        for (let i = 1; i <= 12; i++) {
            const id = `s${i}`;
            history.push({ id, name: `Modul ${i}`, date: new Date(Date.now() - (13 - i) * DAY).toISOString() });
            sessions[id] = { id, name: `Modul ${i}`, groups: [], pad: PAYLOAD };
        }
        return { history, sessions };
    }

    /** Hvor mange tegn én gendannet payload fylder (nøgle + værdi). Det nye
     *  id er en uuid på 36 tegn. Modul 1–9 er ét tegn kortere. */
    const ONE = 'grupdk_session_'.length + 36
        + JSON.stringify({ id: 'x'.repeat(36), name: 'Modul 10', groups: [], pad: PAYLOAD }).length;

    it('beholder de NYESTE sessioner, når der kun er plads til nogle', () => {
        // Plads til tre payloads og listen (ca. 330 tegn), ikke til en fjerde.
        quota(3 * ONE + 500);
        const res = writeClassExtras('3a.csv', twelveSessions());

        const list = JSON.parse(localStorage.getItem('grupdk_history_3a.csv'));
        expect(list.map(e => e.name)).toEqual(['Modul 10', 'Modul 11', 'Modul 12']);
        // Hver indgang peger på en payload, der findes.
        list.forEach(e => expect(localStorage.getItem(`grupdk_session_${e.id}`)).not.toBeNull());
        expect(res.sessionsRestored).toBe(3);
        expect(res.sessionsMissing).toBe(9);
        expect(res.failed).toEqual(['historik']);
        expect(res.written).not.toContain('historik');
    });

    it('giver de ældste payloads tilbage, når listen selv mangler plads', () => {
        // Præcis plads til tre payloads, men ikke til listen ved siden af.
        quota(3 * ONE + 100);
        const res = writeClassExtras('3a.csv', twelveSessions());

        // Den ældste af de tre (Modul 10) gav plads til listen; de to
        // nyeste er tilbage.
        const list = JSON.parse(localStorage.getItem('grupdk_history_3a.csv'));
        expect(list.map(e => e.name)).toEqual(['Modul 11', 'Modul 12']);
        expect(res.sessionsRestored).toBe(2);
        expect(res.sessionsMissing).toBe(10);
        expect(res.written).not.toContain('historik');
        // Ingen payload ligger tilbage uden en plads i listen.
        const payloadKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k.startsWith('grupdk_session_')) payloadKeys.push(k);
        }
        expect(payloadKeys.sort()).toEqual(list.map(e => `grupdk_session_${e.id}`).sort());
    });

    it('ved samme tidspunkt vinder den, der står bagerst i listen', () => {
        quota(ONE + 600);
        const same = new Date(Date.now() - DAY).toISOString();
        const res = writeClassExtras('3a.csv', {
            history: [{ id: 'a', name: 'Først', date: same }, { id: 'b', name: 'Sidst', date: same }],
            sessions: { a: { id: 'a', pad: PAYLOAD }, b: { id: 'b', pad: PAYLOAD } },
        });
        const list = JSON.parse(localStorage.getItem('grupdk_history_3a.csv'));
        expect(list.map(e => e.name)).toEqual(['Sidst']);
        expect(res.sessionsRestored).toBe(1);
        expect(res.sessionsMissing).toBe(1);
    });

    it('listen gemmes i sin egen rækkefølge, når alt er plads til', () => {
        const res = writeClassExtras('3a.csv', twelveSessions());
        const list = JSON.parse(localStorage.getItem('grupdk_history_3a.csv'));
        expect(list.map(e => e.name)).toEqual(Array.from({ length: 12 }, (_, i) => `Modul ${i + 1}`));
        expect(res.sessionsRestored).toBe(12);
        expect(res.sessionsMissing).toBe(0);
        expect(res.written).toContain('historik');
        expect(res.failed).toEqual([]);
    });

    it('kvitteringen fra restoreBackup bærer tallene pr. klasse', async () => {
        // Hvad klassen selv fylder (den skrives af py_bridge, uden om kvoten
        // her), måles først — så er budgettet det samme som ovenfor.
        quota(Infinity);
        await api.restoreBackup([entry('3a.csv')]);
        const classSize = used();
        localStorage.clear();
        pyBridge._invalidateClassesCache();

        quota(classSize + 3 * ONE + 500);
        const res = await api.restoreBackup([{ ...entry('3a.csv'), ...twelveSessions() }]);
        expect(res.written).toBe(1);
        expect(res.partial).toEqual([{
            filename: '3a.csv', parts: ['historik'], sessionsRestored: 3, sessionsMissing: 9,
        }]);
        const list = JSON.parse(localStorage.getItem('grupdk_history_3a.csv'));
        expect(list.map(e => e.name)).toEqual(['Modul 10', 'Modul 11', 'Modul 12']);
    });
});
