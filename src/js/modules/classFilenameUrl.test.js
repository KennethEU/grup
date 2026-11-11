// classFilenameUrl.test.js
// Klassens filnavn står i adressen til /api/classes/<filnavn>. Nye klasser
// får kun a-z, 0-9, æøå og _ i filnavnet, men en klasse fra før 7/5 2026
// kan have hvad som helst: backup-gendannelsen tog dengang filnavnet fra
// filen uden at rense det. Står der #, ? eller / i navnet, skærer adressen
// det over ("gammel #2.csv" bliver til "gammel "), og står der %, kan
// adapteren slet ikke afkode det. Så kunne klassen hentes, men hverken
// gemmes, omdøbes eller slettes. Alle fire kald skal kode filnavnet.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initApiAdapter } from './api_adapter.js';
import { pyBridge } from './py_bridge.js';
import { CLASSES_KEY } from './storageKeys.js';
import * as api from './api.js';

beforeAll(() => initApiAdapter());

const OLD_FILENAMES = ['gammel #2.csv', 'hold?b.csv', '50% samf.csv', '2.b/samf.csv'];

function storeOldClasses() {
    localStorage.setItem(CLASSES_KEY, JSON.stringify(OLD_FILENAMES.map((filename) => ({
        filename,
        name: filename.replace(/\.csv$/, ''),
        last_modified: '2026-04-01T08:00:00.000Z',
        content: {
            columns: ['Navn'],
            data: [{ Navn: 'Anna', _rowId: 'r1' }],
            rules: [],
            id_column: 'Navn',
        },
    }))));
    pyBridge._invalidateClassesCache();
}

const stored = () => JSON.parse(localStorage.getItem(CLASSES_KEY));

describe('et gammelt filnavn med tegn, der betyder noget i en adresse', () => {
    beforeEach(() => {
        localStorage.clear();
        storeOldClasses();
    });

    it.each(OLD_FILENAMES)('"%s" kan hentes', async (filename) => {
        const cls = await api.fetchClass(filename);
        expect(cls.error).toBeUndefined();
        expect(cls.filename).toBe(filename);
    });

    it.each(OLD_FILENAMES)('"%s" kan gemmes', async (filename) => {
        const res = await api.saveClassData(
            filename, [{ Navn: 'Bo', _rowId: 'r1' }], [], 'Navn', [], {}, {}, [], [], {},
        );
        expect(res.error).toBeUndefined();
        expect(stored().find(c => c.filename === filename).content.data[0].Navn).toBe('Bo');
        // Ingen ny klasse ved siden af, og de andre er urørte.
        expect(stored()).toHaveLength(OLD_FILENAMES.length);
        expect(stored().filter(c => c.content.data[0].Navn === 'Bo')).toHaveLength(1);
    });

    it.each(OLD_FILENAMES)('"%s" kan omdøbes', async (filename) => {
        const res = await api.renameClass(filename, 'Nyt navn');
        expect(res.error).toBeUndefined();
        expect(stored().find(c => c.filename === filename).name).toBe('Nyt navn');
    });

    it.each(OLD_FILENAMES)('"%s" kan slettes — og kun den', async (filename) => {
        const res = await api.deleteClass(filename);
        expect(res.error).toBeUndefined();
        const left = stored().map(c => c.filename);
        expect(left).not.toContain(filename);
        expect(left).toHaveLength(OLD_FILENAMES.length - 1);
    });
});
