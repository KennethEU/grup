import { describe, it, expect, beforeEach } from 'vitest';
import { pyBridge } from './py_bridge.js';
import { cellNumber, columnIsNumeric, ROW_ID } from './utils.js';
// Den fælles realistiske testklasse — se testdata/README.md. Samme fil læses
// af Python-testene og e2e, så de tre lag prøver det samme af.
import FIXTURE from '../../../testdata/realistisk_klasse.json';

const { columns, rows } = FIXTURE;

/**
 * Klassen som tekst, sådan som læreren får den ind i Grupper.
 *
 * Kopieret fra Excel er skilletegnet en tabulator; "Gem som CSV" i en dansk
 * Excel giver semikolon (kommaet er decimaltegn). Excel sætter kun
 * anførselstegn om en celle, der indeholder skilletegnet, et linjeskift
 * eller et anførselstegn — "Hansen, Bo" står altså UDEN anførselstegn.
 */
function asText(sep) {
    const cell = (v) => (/["\n\r]/.test(v) || v.includes(sep)) ? `"${v.replace(/"/g, '""')}"` : v;
    return [columns, ...rows.map(r => columns.map(c => r[c]))]
        .map(line => line.map(cell).join(sep))
        .join('\r\n');
}

function importAs(sep) {
    const res = pyBridge.createClass('Realistisk', asText(sep), true);
    expect(res.error).toBeUndefined();
    return pyBridge.getClass(res.filename).content;
}

beforeEach(() => {
    localStorage.clear();
    pyBridge._invalidateClassesCache();
    pyBridge._seenModified.clear();
    pyBridge._deletedElsewhereWarned.clear();
    window.notifyError = () => {};
});

describe('den realistiske klasse har det, README lover', () => {
    // Værn om selve testdataene: ændrer nogen klassen, skal de testene der
    // regner med tallene, ikke stille holde op med at måle noget.
    it('27 elever, skæv kønsfordeling og en sjælden værdi', () => {
        expect(rows).toHaveLength(27);
        const kon = {};
        rows.forEach(r => { const k = r.Køn.trim().toLowerCase(); kon[k] = (kon[k] || 0) + 1; });
        expect(kon).toEqual({ pige: 17, dreng: 9, andet: 1 });
        expect(rows.filter(r => r.Sprog === 'Spansk')).toHaveLength(1);
        expect(rows.filter(r => r.Navn === 'Emil Hansen')).toHaveLength(2);
    });
});

describe.each([
    ['kopieret fra Excel (tabulator)', '\t'],
    ['gemt som CSV i dansk Excel (semikolon)', ';'],
])('importen af den realistiske klasse — %s', (_label, sep) => {
    it('alle 27 elever og alle kolonner kommer med', () => {
        const cls = importAs(sep);
        expect(cls.data).toHaveLength(27);
        expect(cls.columns).toEqual(columns);
    });

    it('lærerens egne tegn står, som hun skrev dem', () => {
        const cls = importAs(sep);
        const names = cls.data.map(r => r.Navn);
        expect(names).toContain('Hansen, Bo');
        expect(names).toContain('Karoline Victoria Bøgh Brandstrup-Lindholm');
        const sara = cls.data.find(r => r.Navn === 'Sara El-Amin');
        expect(sara.Bemærkning).toBe('Ekstra tid\nved prøver');
        expect(cls.data.find(r => r.Navn === 'Hansen, Bo').Bemærkning).toBe('(syg, fritaget)');
        // Den danske karakterskala er tekst: "02" er ikke tallet 2 i cellen.
        expect(cls.data.map(r => r.Karakter)).toEqual(expect.arrayContaining(['02', '00', '-3']));
        expect(cls.data.find(r => r.Navn === 'Mads Ærø').Snit).toBe('7,5');
    });

    it('to elever med samme navn er to elever', () => {
        const cls = importAs(sep);
        const emils = cls.data.filter(r => r.Navn === 'Emil Hansen');
        expect(emils).toHaveLength(2);
        expect(emils[0][ROW_ID]).toBeTruthy();
        expect(emils[0][ROW_ID]).not.toBe(emils[1][ROW_ID]);
    });

    it('tomme celler forbliver tomme', () => {
        const cls = importAs(sep);
        expect(cls.data.filter(r => r.Karakter === '')).toHaveLength(1);
        expect(cls.data.filter(r => r.Niveau === '')).toHaveLength(1);
    });
});

describe('appen læser klassens tal, som læreren mener dem', () => {
    it('karakterskalaen, decimalkomma og "Fritaget"', () => {
        const karakter = Object.fromEntries(rows.map(r => [r.Karakter, cellNumber(r.Karakter)]));
        expect(karakter['02']).toBe(2);
        expect(karakter['00']).toBe(0);
        expect(karakter['-3']).toBe(-3);
        expect(karakter['Fritaget']).toBeNull();
        expect(karakter['']).toBeNull();
        expect(cellNumber('7,5')).toBe(7.5);
    });

    it('en talkolonne med én "Fritaget" er stadig en talkolonne', () => {
        expect(columnIsNumeric(rows, 'Karakter')).toBe(true);
        expect(columnIsNumeric(rows, 'Snit')).toBe(true);
        expect(columnIsNumeric(rows, 'Niveau')).toBe(false);
    });
});
