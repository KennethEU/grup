import { describe, it, expect } from 'vitest';
import { fullMatrixInfo } from './matrixInfo.js';

const data = [
    { _rowId: 'r1' }, { _rowId: 'r2' }, { _rowId: 'r3' }, { _rowId: 'r4' },
    { _rowId: 'r5' }, { _rowId: 'r6' }, { _rowId: 'r7', _excluded: true },
];
const groups = [
    { name: 'Group 1', members: ['r1', 'r2', 'r3'] },
    { name: 'Group 2', members: ['r4', 'r5', 'r6', 'r7'] },
];

describe('Fuld matrix: antal og størrelse', () => {
    it('antal matrixgrupper = den mindste stamgruppe, kun fremmødte', () => {
        const info = fullMatrixInfo({ groups, data, idCol: '_rowId', repType: 'group' });
        expect(info).toMatchObject({ numHomeGroups: 2, numGroups: 3, totalStudents: 6, avgSize: 2, isExact: true });
    });

    it('på emner tælles grupper med samme emne sammen', () => {
        const topics = { 'Group 1': 'EU', 'Group 2': 'eu' };
        const info = fullMatrixInfo({ groups, data, idCol: '_rowId', repType: 'topic', storedTopic: g => topics[g.name] });
        expect(info).toMatchObject({ numTopics: 1, usingTopics: true, numGroups: 6 });
    });

    it('et emne der hedder "constructor" giver ikke NaN', () => {
        const info = fullMatrixInfo({ groups, data, idCol: '_rowId', repType: 'topic', storedTopic: () => 'constructor' });
        expect(info.numGroups).toBe(6);
    });

    it('låste matrixgrupper: deres elever fordeles ikke, og grupperne tæller med', () => {
        // r4 er låst: Group 2 har to frie tilbage (r5, r6), så der dannes 2 nye + 1 låst.
        const lockedGroups = [{ name: 'Group 1', locked: true, members: [{ id: 'r4' }] }];
        const info = fullMatrixInfo({ groups, data, idCol: '_rowId', repType: 'group', lockedGroups });
        expect(info).toMatchObject({ numGroups: 3, totalStudents: 5, avgSize: 3 });
    });

    it('en kilde uden frie elever: ingen nye matrixgrupper, heller ikke når en er låst', () => {
        const lockedGroups = [{ name: 'Group 1', locked: true, members: ['r1', 'r2', 'r3'] }];
        const info = fullMatrixInfo({ groups, data, idCol: '_rowId', repType: 'group', lockedGroups });
        expect(info).toMatchObject({ numGroups: 0, avgSize: 0 });
    });

    it('en elev uden stamgruppe fordeles også og tæller med i størrelsen', () => {
        const more = [...data, { _rowId: 'r8' }, { _rowId: 'r9' }, { _rowId: 'r10' }];
        const info = fullMatrixInfo({ groups, data: more, idCol: '_rowId', repType: 'group' });
        expect(info).toMatchObject({ numGroups: 3, totalStudents: 9, avgSize: 3 });
    });

    it('en stamgruppe uden emne falder ikke sammen med et emne, der hedder som gruppen', () => {
        const topics = { 'Group 1': '', 'Group 2': 'Group 1' };
        const info = fullMatrixInfo({ groups, data, idCol: '_rowId', repType: 'topic', storedTopic: g => topics[g.name] });
        expect(info).toMatchObject({ numTopics: 2, numGroups: 3 });
    });

    it('uden stamgrupper er der intet at regne på', () => {
        expect(fullMatrixInfo({ groups: [], data, idCol: '_rowId', repType: 'group' })).toBeNull();
    });
});
