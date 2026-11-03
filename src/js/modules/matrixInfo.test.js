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

    it('uden stamgrupper er der intet at regne på', () => {
        expect(fullMatrixInfo({ groups: [], data, idCol: '_rowId', repType: 'group' })).toBeNull();
    });
});
