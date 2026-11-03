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
        expect(res.partial).toEqual([{ filename: '3a.csv', parts: ['historik'] }]);
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
        expect(localStorage.length).toBe(1);
        expect(localStorage.getItem('grupdk_session_foreign')).toBe('{"id":"foreign"}');
    });
});
