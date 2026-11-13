// Tal, som appen læser på én måde og motoren på en anden
// (gennemsyn 100, 13/11 2026) — søster til textVsEngine.test.js og
// matrixVsEngine.test.js.
//
// Gruppekortets snit, sorteringen i elevlisten, placeringen af en efternøler
// og advarslerne i opskriften læser alle en celle med cellNumber(). Motoren
// læser den med parseNumber(). Testen her danner tilfældige klasser med celler,
// der ligner tal, og kræver, at de elever, appen regner for "har et tal", er
// præcis dem, motoren giver et tal.
//
// Den fandt to forskelle, da den blev skrevet: appen læste "1e3" som 1000
// (motoren: tekst), og motoren læser "- 5" som -5 (appen: tekst). Nu bruger
// cellNumber() motorens egen funktion.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./classActions.js', () => ({ autoSave: vi.fn() }));
vi.mock('./generation.js', () => ({ generateMatrixGroups: vi.fn(), generateWithoutTogether: vi.fn() }));

import { buildEngineInput } from './nextEngine.js';
import { cellNumber, columnIsNumeric, compareCellValues } from './utils.js';
import { state } from './state.js';
import { allHints } from './hints.js';
import { buildTask } from '../../../motor/engine/task.js';
import { check } from '../../../motor/engine/engine.js';

function rng(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Celler, en lærer kan komme til at have i en "tal"-kolonne: danske tal,
// fortegn med og uden mellemrum, tusindtalspunktum, eksponent, holdnavne,
// ord og tomme.
const FIXED = ['7', '7,5', '7.5', '02', '00', '-3', '+4', '- 5', '+ 5', '12.', ',5', '.5',
    '1e3', '2E2', '1,5e2', '2e', 'e', '1.000', '1.000,5', '1 000', '7 dage', '7%', 'nan', 'Infinity',
    '0x1A', '1_0', '--5', '+-5', '-', '+', ',', '.', '', '  ', ' 7 ', 'Middel', 'fritaget', '٣', '７'];
const ALPHABET = ['0', '1', '5', '9', ',', '.', '-', '+', ' ', 'e', 'E', 'x'];

function randomCell(R) {
    if (R() < 0.6) return FIXED[Math.floor(R() * FIXED.length)];
    const length = 1 + Math.floor(R() * 5);
    let text = '';
    for (let k = 0; k < length; k++) text += ALPHABET[Math.floor(R() * ALPHABET.length)];
    return text;
}

it('motoren giver et tal til præcis de elever, appen læser et tal hos — og samme tal', () => {
    const R = rng(Number(process.env.SEED) || 100);
    const N = Number(process.env.N) || 2000;
    let numbers = 0;
    let texts = 0;
    for (let i = 0; i < N; i++) {
        const n = 3 + Math.floor(R() * 12);
        const data = Array.from({ length: n }, (_, k) => ({ _rowId: 'r' + (k + 1), A: randomCell(R) }));
        const type = ['balance', 'minimizediff', 'group_sort'][Math.floor(R() * 3)];
        const cls = { data, rules: [{ type, column: 'A' }], settings: { groupTarget: 3, groupMod: '+' } };
        const input = buildEngineInput({ cls, isMatrix: false, groupMode: 'size', viewGroups: [] });
        const task = buildTask(input);
        expect(task.ids).toEqual(data.map(r => r._rowId));
        const rule = task.rules.find(p => p.num && p.column === 'A');
        expect(rule, JSON.stringify(data)).toBeTruthy();
        data.forEach((row, k) => {
            const app = cellNumber(row.A);
            const engine = rule.num[k];
            if (app === null) {
                expect(Number.isNaN(engine), JSON.stringify(row.A)).toBe(true);
                texts++;
            } else {
                expect(engine, JSON.stringify(row.A)).toBe(app);
                numbers++;
            }
        });
        // "Har kolonnen et tal?" — motorens hasNumbers er appens "mindst én".
        expect(rule.hasNumbers).toBe(data.some(row => cellNumber(row.A) !== null));
    }
    expect(numbers).toBeGreaterThan(N);
    expect(texts).toBeGreaterThan(N);
});

describe('cellNumber læser som motoren', () => {
    it('eksponent-skrivemåden er tekst — "2e2" kan være et holdnavn', () => {
        for (const cell of ['1e3', '2E2', '1,5e2', '1e-3']) expect(cellNumber(cell), cell).toBe(null);
    });

    it('et fortegn med mellemrum efter er stadig et tal', () => {
        expect(cellNumber('- 5')).toBe(-5);
        expect(cellNumber('+ 5')).toBe(5);
    });

    it('sorteringen læser ikke "1e3" som 1000 — den står efter sit første ciffer som anden tekst', () => {
        // Før: 3, 20, 1e3 (som tallet 1000). Nu sorteres "1e3" som teksten
        // "1e3" (dansk rækkefølge med tal i teksten), altså før "3".
        expect(['20', '1e3', '3'].sort(compareCellValues)).toEqual(['1e3', '3', '20']);
    });
});

describe('advarslen om en tal-regel på en tekstkolonne siger det, motoren gør', () => {
    const rowsOf = (cells) => cells.map((cell, k) => ({ _rowId: 'r' + (k + 1), Navn: 'Elev ' + (k + 1), Niveau: cell }));
    const setClass = (cells, rules) => {
        state.currentClass = {
            filename: 'tal', columns: ['Navn', 'Niveau'], data: rowsOf(cells), rules,
            togetherGroups: [], separations: [], settings: { groupTarget: 4, groupMod: '+' },
        };
        state.activeView = 'standard';
        state.groupMode = 'size';
        state.idColumn = '_rowId';
        state.displayColumn = 'Navn';
        state.storedStandardGroups = [];
        state.storedMatrixGroups = [];
    };
    const hint = () => allHints.value.find(h => h.id.startsWith('hint:non-numeric:'));
    const codes = () => {
        const input = buildEngineInput({ cls: state.currentClass, isMatrix: false, groupMode: 'size', viewGroups: [] });
        return check(input).messages.map(m => m.code);
    };

    beforeEach(() => { state.currentClass = null; });

    it('kun tekst: "gør ingenting" — og motoren siger text-only-column', () => {
        setClass([...Array(12).fill('Middel'), ...Array(8).fill('Høj')], [{ type: 'balance', column: 'Niveau' }]);
        expect(hint().text).toMatch(/gør ingenting/);
        expect(codes()).toContain('text-only-column');
    });

    it('3 tal og 20 ord: reglen virker for de få — ikke "gør ingenting"', () => {
        const cells = [...Array(20).fill('Middel'), '3', '4', '5'];
        setClass(cells, [{ type: 'balance', column: 'Niveau' }]);
        expect(columnIsNumeric(state.currentClass.data, 'Niveau')).toBe(false);
        expect(hint().text).not.toMatch(/gør ingenting/);
        expect(hint().text).toMatch(/virker kun for de få elever, der har et tal/);
        expect(hint().action.label).toBe('Ranger værdierne…');
        // Motoren: reglen bruges på de tre, resten placeres frit.
        expect(codes()).toContain('non-numeric-cells');
        expect(codes()).not.toContain('text-only-column');
    });

    it('Saml med en aftale: ord tæller ikke som forskellige værdier, når kolonnen har et tal', () => {
        // Motoren regner Saml med tal, så snart én celle er et tal; "Høj" og
        // "Lav" er så "ikke udfyldt", og aftalen koster ikke reglen noget.
        setClass(['Høj', 'Lav', '3', 'Middel', 'Middel', 'Middel'], [{ type: 'group_sort', column: 'Niveau' }]);
        state.currentClass.togetherGroups = [{ ids: ['r1', 'r2'] }];
        expect(allHints.value.filter(h => h.id.startsWith('hint:together-cost:'))).toEqual([]);
        // Uden tallet er det en tekstkolonne, og de to ord ER forskellige.
        state.currentClass.data[2].Niveau = 'Middel';
        expect(allHints.value.filter(h => h.id.startsWith('hint:together-cost:'))).toHaveLength(1);
    });
});
