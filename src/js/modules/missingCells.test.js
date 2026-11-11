import { describe, it, expect } from 'vitest';
import { buildEngineInput } from './nextEngine.js';
import { canonicalSpellings, fillMissingCells, columnsOfRows } from './utils.js';

// En række UDEN en celle (et "hul") kan stå i en klasse gemt af en ældre
// udgave eller i en håndredigeret backup. Hedder kolonnen som noget, ethvert
// JavaScript-objekt arver ("constructor", "toString", "valueOf"), svarer
// `row[kolonne]` på hullet med en arvet funktion — og teksten
// "function Object() { [native code] }" blev til en elevværdi.
function holeClass() {
    return {
        columns: ['Navn', 'constructor', 'toString'],
        data: [
            { _rowId: 'r1', Navn: 'Ida', constructor: 'A', toString: 'x' },
            { _rowId: 'r2', Navn: 'Bo' },                        // hul i begge
            { _rowId: 'r3', Navn: 'Ali', constructor: 'B', toString: 'y' },
            { _rowId: 'r4', Navn: 'Eva', constructor: 'A' },     // hul i toString
        ],
        rules: [
            { type: 'distribute', column: 'constructor' },
            { type: 'separate', column: 'toString', values: ['x'] },
        ],
    };
}

describe('huller i elevrækker — kolonnenavne som "constructor"', () => {
    it('motoren får en tom celle, ikke en arvet funktion', () => {
        const input = buildEngineInput({ cls: holeClass(), isMatrix: false, groupMode: 'size' });
        const bo = input.students.find(s => s._rowId === 'r2');
        expect(bo.constructor).toBe('');
        expect(bo.toString).toBe('');
        const eva = input.students.find(s => s._rowId === 'r4');
        expect(eva.toString).toBe('');
        for (const s of input.students) {
            for (const c of ['constructor', 'toString']) expect(String(s[c])).not.toMatch(/native code/);
        }
    });

    it('rullelisten tilbyder ikke "function … [native code]" som værdi', () => {
        const spellings = canonicalSpellings(holeClass().data, 'constructor');
        expect([...spellings.values()].sort()).toEqual(['A', 'B']);
        expect([...canonicalSpellings(holeClass().data, 'toString').values()].sort()).toEqual(['x', 'y']);
    });
});

describe('fillMissingCells — huller fyldes, når klassen åbnes', () => {
    it('giver hvert hul en tom celle som egen nøgle', () => {
        const cls = holeClass();
        const filled = fillMissingCells(cls.data, cls.columns);
        expect(filled).toBe(3);
        for (const row of cls.data) {
            for (const c of cls.columns) expect(Object.hasOwn(row, c)).toBe(true);
        }
        expect(cls.data[1]).toEqual({ _rowId: 'r2', Navn: 'Bo', constructor: '', toString: '' });
        // Andet røres ikke.
        expect(cls.data[0]).toEqual({ _rowId: 'r1', Navn: 'Ida', constructor: 'A', toString: 'x' });
    });

    it('er gratis på en klasse uden huller (så gemmes der ikke)', () => {
        const data = [{ _rowId: 'r1', Navn: 'Ida', Køn: '' }];
        const before = JSON.stringify(data);
        expect(fillMissingCells(data, ['Navn', 'Køn'])).toBe(0);
        expect(JSON.stringify(data)).toBe(before);
    });

    it('flytter ikke kolonnerne: første række med hul i midten', () => {
        // Kolonnerækkefølgen gemmes ved at læse rækkernes nøgler (columnsOfRows,
        // første række først). Et hul fyldt bagest i række 1 ville flytte
        // kolonnen ud til højre ved næste genindlæsning.
        const columns = ['Navn', 'Køn', 'Hold'];
        const data = [
            { Navn: 'Ida', Hold: '1', _rowId: 'r1' },
            { Navn: 'Bo', Køn: 'Dreng', Hold: '2', _rowId: 'r2' },
        ];
        fillMissingCells(data, columns);
        expect(columnsOfRows(data).filter(k => !k.startsWith('_'))).toEqual(columns);
        expect(Object.keys(data[0])).toEqual(['Navn', 'Køn', 'Hold', '_rowId']);
    });

    it('opfinder ikke programmets skjulte kolonner på rækker, der ikke har dem', () => {
        const columns = ['Navn', '__MatrixSource__'];
        const data = [{ Navn: 'Ida', __MatrixSource__: 'Grp 1' }, { Navn: 'Bo' }];
        expect(fillMissingCells(data, columns)).toBe(0);
        expect(Object.hasOwn(data[1], '__MatrixSource__')).toBe(false);
    });

    it('tåler en klasse uden kolonneliste eller rækker', () => {
        expect(fillMissingCells(null, ['A'])).toBe(0);
        expect(fillMissingCells([{ A: '1' }, null], null)).toBe(0);
    });
});
