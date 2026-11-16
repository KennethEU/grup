import { describe, it, expect } from 'vitest';
import { togetherComponents, togetherConflict, brokenTogether, deadTogetherIndexes, togetherPath } from './together.js';

const rows = [1, 2, 3, 4].map(i => ({ _rowId: `r${i}`, Navn: `Elev ${i}` }));
const agreements = [{ ids: ['r1', 'r2'] }, { ids: ['r2', 'r3'] }];
const group = (members, locked = false) => ({ name: 'Group 1', members, locked });

describe('Skal sammen', () => {
    it('bevarer forbindelsen gennem en fraværende elev og filtrerer slettede fra', () => {
        const students = rows.map(s => ({ ...s, _excluded: s._rowId === 'r2' }));
        expect(togetherComponents(agreements, students)[0].sort()).toEqual(['r1', 'r3']);
        expect(togetherComponents(agreements, rows.slice(0, 1))).toEqual([]);
    });
    it('finder indirekte modsatrettede aftaler', () => {
        const conflict = togetherConflict(togetherComponents(agreements, rows), [{ ids: ['r1', 'r3'] }]);
        expect(conflict.reason).toContain('undgåelse');
    });
    it('tillader en hel låst enhed men afviser en aftale på tværs af låse', () => {
        const units = [['r1', 'r2']];
        expect(togetherConflict(units, [], [group(['r1', 'r2'], true)])).toBeNull();
        expect(togetherConflict(units, [], [group(['r1'], true)])?.reason).toContain('låst');
        expect(togetherConflict(units, [], [group(['r1'], true), group(['r2'], true)])).not.toBeNull();
    });
    it('viser brud efter flytning eller gendannelse, også med uplacerede elever', () => {
        expect(brokenTogether([group(['r1', 'r2', 'r3'])], agreements, rows)).toEqual([]);
        expect(brokenTogether([group(['r1', 'r2']), group(['r3'])], agreements, rows)).toHaveLength(1);
        expect(brokenTogether([group(['r1', 'r2'])], agreements, rows)).toHaveLength(1);
        expect(brokenTogether([], agreements, rows)).toEqual([]);
    });
    it('en aftale gennem en slettet elev er ikke død, så længe den binder to andre', () => {
        // r2 er slettet. Motoren holder stadig r1 og r3 sammen gennem den.
        const withoutR2 = rows.filter(s => s._rowId !== 'r2');
        expect(togetherComponents(agreements, withoutR2)[0].sort()).toEqual(['r1', 'r3']);
        expect([...deadTogetherIndexes(agreements, withoutR2)]).toEqual([]);

        // Nævnes den slettede elev kun i ÉN aftale, binder den ingenting.
        expect([...deadTogetherIndexes([{ ids: ['r1', 'r2'] }], withoutR2)]).toEqual([0]);
        // To slettede, hver i én aftale: begge døde, og samlet oprydning er sikker.
        const both = [{ ids: ['r1', 'r2'] }, { ids: ['r3', 'r9'] }, { ids: ['r1', 'r4'] }];
        expect([...deadTogetherIndexes(both, withoutR2)].sort()).toEqual([0, 1]);
        expect(togetherComponents(both.filter((_, i) => i === 2), withoutR2))
            .toEqual(togetherComponents(both, withoutR2));
    });
    it('en fraværende elev står stadig i klassen — aftalen er ikke død', () => {
        const students = rows.map(s => ({ ...s, _excluded: s._rowId === 'r2' }));
        expect([...deadTogetherIndexes([{ ids: ['r1', 'r2'] }], students)]).toEqual([]);
    });
});

describe('togetherPath', () => {
    const agreements = [{ ids: ['a', 'm'] }, { ids: ['m', 'e'] }, { ids: ['x', 'y', 'z'] }];
    it('nævner eleverne mellem to elever', () => {
        expect(togetherPath(agreements, 'a', 'e')).toEqual(['m']);
    });
    it('tom liste, når de står i samme aftale', () => {
        expect(togetherPath(agreements, 'x', 'z')).toEqual([]);
    });
    it('null, når intet binder dem', () => {
        expect(togetherPath(agreements, 'a', 'x')).toBeNull();
    });
});
