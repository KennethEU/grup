import { describe, it, expect, beforeEach } from 'vitest';
import { renameColumn, reorderColumns, movableColumns, validateColumnName, deleteColumn } from './columnActions.js';

/** En lille klasse med de felter et omdøb skal kunne ramme. */
function makeClass() {
    return {
        columns: ['Navn', 'Køn', 'Niveau'],
        data: [
            { Navn: 'Anna', Køn: 'P', _rowId: 'r1', Niveau: 'Høj' },
            { Navn: 'Bo', Køn: 'D', _rowId: 'r2', Niveau: 'Lav' },
        ],
        rules: [{ type: 'distribute', column: 'Køn' }, { type: 'cluster', column: 'Navn' }],
        matrixRules: [{ type: 'distribute', column: 'Køn' }],
        hiddenColumns: ['Niveau'],
        columnOrders: { Niveau: ['Lav', 'Middel', 'Høj'] },
    };
}

function makeUi() {
    return { displayColumn: 'Navn', idColumn: '_rowId', sortState: { col: 'Køn', dir: 'asc' } };
}

describe('validateColumnName', () => {
    it('afviser et tomt navn', () => {
        expect(validateColumnName('   ', ['Navn']).ok).toBe(false);
    });

    it('trimmer navnet', () => {
        expect(validateColumnName('  Niveau  ', []).name).toBe('Niveau');
    });

    it('afviser et navn der begynder med ét underscore', () => {
        // Ellers bliver kolonnen et INTERNT felt: væk fra elevlisten, væk fra
        // eksporten, væk fra CSV'en til motoren — og reglen på den vælter
        // gruppedannelsen med en rå Python-fejl.
        const res = validateColumnName('_Køn', ['Navn']);
        expect(res.ok).toBe(false);
        expect(res.error).toContain('_');
        expect(res.error).toContain('Køn'); // forslaget uden underscore
    });

    it('tillader et navn med to underscores (fx __MatrixSource__)', () => {
        expect(validateColumnName('__MatrixSource__', []).ok).toBe(true);
    });

    it('afviser et navn der allerede findes', () => {
        expect(validateColumnName('Navn', ['Navn', 'Køn']).ok).toBe(false);
    });

    it('tillader at en kolonne "kolliderer" med sig selv', () => {
        expect(validateColumnName('Navn', ['Navn', 'Køn'], 'Navn').ok).toBe(true);
    });
});

describe('renameColumn', () => {
    let cls, ui;
    beforeEach(() => { cls = makeClass(); ui = makeUi(); });

    it('omdøber kolonnen og alle elevrækker', () => {
        const res = renameColumn(cls, ui, 'Navn', 'Elevnavn');
        expect(res.ok).toBe(true);
        expect(cls.columns).toEqual(['Elevnavn', 'Køn', 'Niveau']);
        expect(cls.data[0].Elevnavn).toBe('Anna');
        expect('Navn' in cls.data[0]).toBe(false);
    });

    it('holder kolonnen på sin plads i rækkens nøglerækkefølge', () => {
        // Den gemte kolonnerækkefølge udledes af Object.keys(data[0]) i
        // updateClass(). Flytter omdøbningen nøglen bagerst, hopper kolonnen
        // ud til højre ved næste genindlæsning.
        renameColumn(cls, ui, 'Navn', 'Elevnavn');
        expect(Object.keys(cls.data[0])).toEqual(['Elevnavn', 'Køn', '_rowId', 'Niveau']);
    });

    it('genbruger selve rækkeobjektet (markeringer peger stadig på eleven)', () => {
        const row = cls.data[0];
        renameColumn(cls, ui, 'Navn', 'Elevnavn');
        expect(cls.data[0]).toBe(row);
    });

    it('flytter visningskolonnen med', () => {
        const res = renameColumn(cls, ui, 'Navn', 'Elevnavn');
        expect(ui.displayColumn).toBe('Elevnavn');
        expect(res.displayMoved).toBe(true);
    });

    it('rører ikke visningskolonnen, når en anden kolonne omdøbes', () => {
        const res = renameColumn(cls, ui, 'Køn', 'Kon');
        expect(ui.displayColumn).toBe('Navn');
        expect(res.displayMoved).toBe(false);
    });

    it('flytter rangeringen med', () => {
        const res = renameColumn(cls, ui, 'Niveau', 'Fagligt niveau');
        expect(cls.columnOrders).toEqual({ 'Fagligt niveau': ['Lav', 'Middel', 'Høj'] });
        expect(res.orderMoved).toBe(true);
    });

    it('efterlader ingen forældreløs rangering', () => {
        renameColumn(cls, ui, 'Niveau', 'Fagligt niveau');
        expect(Object.prototype.hasOwnProperty.call(cls.columnOrders, 'Niveau')).toBe(false);
    });

    it('flytter regler i begge visninger med', () => {
        const res = renameColumn(cls, ui, 'Køn', 'Kon');
        expect(cls.rules[0].column).toBe('Kon');
        expect(cls.matrixRules[0].column).toBe('Kon');
        expect(res.rulesMoved).toBe(2);
    });

    it('flytter skjulte kolonner og sortering med', () => {
        renameColumn(cls, ui, 'Niveau', 'Fagligt niveau');
        expect(cls.hiddenColumns).toEqual(['Fagligt niveau']);
        renameColumn(cls, ui, 'Køn', 'Kon');
        expect(ui.sortState.col).toBe('Kon');
    });

    it('afviser et internt navn uden at røre noget', () => {
        const res = renameColumn(cls, ui, 'Køn', '_Køn');
        expect(res.ok).toBe(false);
        expect(cls.columns).toEqual(['Navn', 'Køn', 'Niveau']);
        expect(cls.data[0].Køn).toBe('P');
    });

    it('afviser et navn der allerede findes', () => {
        const res = renameColumn(cls, ui, 'Køn', 'Niveau');
        expect(res.ok).toBe(false);
        expect(cls.columns).toEqual(['Navn', 'Køn', 'Niveau']);
    });

    it('er en no-op når navnet er uændret', () => {
        const res = renameColumn(cls, ui, 'Navn', '  Navn  ');
        expect(res.ok).toBe(true);
        expect(cls.columns).toEqual(['Navn', 'Køn', 'Niveau']);
    });

    it('siger fra når kolonnen ikke findes', () => {
        expect(renameColumn(cls, ui, 'Findes ikke', 'Nyt').ok).toBe(false);
    });

    it('klarer en klasse uden regler, rangering og skjulte kolonner', () => {
        const plainClass = { columns: ['A'], data: [{ A: '1' }] };
        const res = renameColumn(plainClass, {}, 'A', 'B');
        expect(res.ok).toBe(true);
        expect(plainClass.data[0]).toEqual({ B: '1' });
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Flyt kolonnerne om.
//
// Det hele hænger på ÉN ting: den rækkefølge der overlever en genindlæsning,
// er nøglerækkefølgen i elevrækkerne — ikke `cls.columns`. Falder testene her,
// er det fordi nogen har "forenklet" funktionen til bare at sortere arrayet,
// og så er fejlen først synlig efter et reload.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('movableColumns', () => {
    it('holder interne felter og __MatrixSource__ ude af listen', () => {
        const result = movableColumns(['Navn', '_rowId', 'Køn', '__MatrixSource__', '_excluded']);
        expect(result).toEqual(['Navn', 'Køn']);
    });

    it('tåler at der ikke er nogen kolonner', () => {
        expect(movableColumns(undefined)).toEqual([]);
    });
});

describe('reorderColumns', () => {
    it('skriver NØGLERNE om i hver række, ikke kun cls.columns', () => {
        const cls = makeClass();
        const res = reorderColumns(cls, ['Niveau', 'Navn', 'Køn']);

        expect(res.ok).toBe(true);
        expect(res.changed).toBe(true);
        expect(cls.columns).toEqual(['Niveau', 'Navn', 'Køn']);
        // Dét her er hele pointen: py_bridge gemmer Object.keys(data[0]).
        expect(Object.keys(cls.data[0]).filter(k => k !== '_rowId'))
            .toEqual(['Niveau', 'Navn', 'Køn']);
        expect(Object.keys(cls.data[1]).filter(k => k !== '_rowId'))
            .toEqual(['Niveau', 'Navn', 'Køn']);
    });

    it('beholder værdierne — der flyttes nøgler, ikke data', () => {
        const cls = makeClass();
        reorderColumns(cls, ['Niveau', 'Køn', 'Navn']);
        expect(cls.data[0]).toMatchObject({ Navn: 'Anna', Køn: 'P', Niveau: 'Høj' });
        expect(cls.data[1]).toMatchObject({ Navn: 'Bo', Køn: 'D', Niveau: 'Lav' });
    });

    it('genbruger rækkeobjektet, så markeringer og Vue-keys overlever', () => {
        const cls = makeClass();
        const before = cls.data[0];
        reorderColumns(cls, ['Køn', 'Navn', 'Niveau']);
        expect(cls.data[0]).toBe(before);
        expect(cls.data[0]._rowId).toBe('r1');
    });

    it('lader interne felter og __MatrixSource__ blive på rækken', () => {
        const cls = makeClass();
        cls.columns.push('__MatrixSource__');
        cls.data.forEach((r, i) => { r.__MatrixSource__ = `Group ${i + 1}`; r._excluded = false; });

        reorderColumns(cls, ['Niveau', 'Navn', 'Køn']);

        expect(cls.data[0]._rowId).toBe('r1');
        expect(cls.data[0]._excluded).toBe(false);
        expect(cls.data[0].__MatrixSource__).toBe('Group 1');
        // De flytbare står forrest; resten er bagest og i uændret orden.
        expect(cls.columns.slice(0, 3)).toEqual(['Niveau', 'Navn', 'Køn']);
        expect(cls.columns).toContain('__MatrixSource__');
    });

    it('tvinger ikke en manglende nøgle ned over en række med huller', () => {
        const cls = makeClass();
        delete cls.data[1].Niveau;   // cellen var tom i regnearket

        reorderColumns(cls, ['Niveau', 'Navn', 'Køn']);

        expect(Object.prototype.hasOwnProperty.call(cls.data[1], 'Niveau')).toBe(false);
        expect(Object.keys(cls.data[1]).filter(k => k !== '_rowId')).toEqual(['Navn', 'Køn']);
    });

    it('afviser en liste der ikke er en permutation', () => {
        expect(reorderColumns(makeClass(), ['Navn', 'Køn']).ok).toBe(false);          // for kort
        expect(reorderColumns(makeClass(), ['Navn', 'Køn', 'Niveau', 'X']).ok).toBe(false); // ukendt
        expect(reorderColumns(makeClass(), ['Navn', 'Navn', 'Køn']).ok).toBe(false);  // dublet
    });

    it('rører ikke rækkerne, når rækkefølgen er uændret', () => {
        const cls = makeClass();
        const before = Object.keys(cls.data[0]);
        const res = reorderColumns(cls, ['Navn', 'Køn', 'Niveau']);
        expect(res.ok).toBe(true);
        expect(res.changed).toBe(false);
        expect(Object.keys(cls.data[0])).toEqual(before);
    });

    it('rører ikke regler, rangering, skjulte kolonner eller visningskolonnen', () => {
        const cls = makeClass();
        reorderColumns(cls, ['Niveau', 'Køn', 'Navn']);
        // Alt slår op på NAVN, ikke plads — derfor skal intet af det følge med.
        expect(cls.rules).toEqual([{ type: 'distribute', column: 'Køn' },
                                   { type: 'cluster', column: 'Navn' }]);
        expect(cls.hiddenColumns).toEqual(['Niveau']);
        expect(cls.columnOrders).toEqual({ Niveau: ['Lav', 'Middel', 'Høj'] });
    });

    it('siger fra, når der ikke er nogen klasse', () => {
        expect(reorderColumns(null, ['Navn']).ok).toBe(false);
        expect(reorderColumns(makeClass(), 'Navn').ok).toBe(false);
    });
});

// Sletningen boede før inde i DeleteColumnModal.vue, uden en eneste test.
// Den flyttede herhen, fordi den skal rydde op de SAMME steder som et omdøb.
describe('deleteColumn', () => {
    it('fjerner kolonnen fra listen og fra hver række', () => {
        const cls = makeClass();
        const res = deleteColumn(cls, makeUi(), 'Køn');
        expect(res.ok).toBe(true);
        expect(cls.columns).toEqual(['Navn', 'Niveau']);
        expect(cls.data.every(row => !('Køn' in row))).toBe(true);
    });

    it('tager reglerne på kolonnen med — i begge regelsæt', () => {
        const cls = makeClass();
        const res = deleteColumn(cls, makeUi(), 'Køn');
        expect(res.rulesRemoved).toBe(2);          // én i rules, én i matrixRules
        expect(cls.rules.map(r => r.column)).toEqual(['Navn']);
        expect(cls.matrixRules).toEqual([]);
    });

    it('rydder rangering, skjulte kolonner og sortering', () => {
        const cls = makeClass();
        const ui = makeUi();
        ui.sortState.col = 'Niveau';
        deleteColumn(cls, ui, 'Niveau');
        expect(cls.columnOrders).not.toHaveProperty('Niveau');
        expect(cls.hiddenColumns).toEqual([]);
        expect(ui.sortState.col).toBe(null);
    });

    it('flytter visningen, når det var visningskolonnen der røg', () => {
        const cls = makeClass();
        const ui = makeUi();                        // displayColumn: 'Navn'
        const res = deleteColumn(cls, ui, 'Navn');
        expect(ui.displayColumn).toBe('Køn');
        expect(res.displayMoved).toBe('Køn');
    });

    it('lader visningen være, når en anden kolonne slettes', () => {
        const cls = makeClass();
        const ui = makeUi();
        const res = deleteColumn(cls, ui, 'Niveau');
        expect(ui.displayColumn).toBe('Navn');
        expect(res.displayMoved).toBe(null);
    });

    // Værnet: en indsat navneliste ER en klasse med én kolonne. Slettes den,
    // står hver elev som "(uden navn)" overalt — og beskeden om det blev
    // sprunget over, fordi den tomme visningskolonne er falsk.
    it('nægter at slette den sidste kolonne — og rører intet', () => {
        const cls = { columns: ['Navn'], data: [{ Navn: 'Anna', _rowId: 'r1' }], rules: [] };
        const ui = { displayColumn: 'Navn', sortState: { col: null, dir: 'asc' } };
        const res = deleteColumn(cls, ui, 'Navn');
        expect(res.ok).toBe(false);
        expect(res.error).toContain('eneste kolonne');
        expect(cls.columns).toEqual(['Navn']);
        expect(cls.data[0].Navn).toBe('Anna');
        expect(ui.displayColumn).toBe('Navn');
    });

    // __MatrixSource__ har DOBBELT underscore og tæller derfor ikke som en
    // kolonne læreren kan vise navne fra.
    it('__MatrixSource__ redder ikke den sidste rigtige kolonne', () => {
        const cls = {
            columns: ['Navn', '__MatrixSource__'],
            data: [{ Navn: 'Anna', __MatrixSource__: 'Gruppe 1', _rowId: 'r1' }],
            rules: [],
        };
        const res = deleteColumn(cls, { displayColumn: 'Navn' }, 'Navn');
        expect(res.ok).toBe(false);
    });

    it('siger fra på en kolonne der ikke findes', () => {
        const cls = makeClass();
        expect(deleteColumn(cls, makeUi(), 'Findes Ikke').ok).toBe(false);
        expect(cls.columns).toHaveLength(3);
    });

    it('en ødelagt række vælter ikke sletningen for de øvrige', () => {
        const cls = makeClass();
        cls.data.splice(1, 0, null);
        expect(deleteColumn(cls, makeUi(), 'Køn').ok).toBe(true);
        expect(cls.data[0]).not.toHaveProperty('Køn');
        expect(cls.data[2]).not.toHaveProperty('Køn');
    });
});
