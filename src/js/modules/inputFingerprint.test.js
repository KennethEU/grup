// Aftrykket af motorens input (inputFingerprint i nextEngine.js) afgør, om
// "Sidste dannelse" stadig gælder: mærkerne ved reglerne, noterne i stakken og
// om prøvekørslen holder pause (lastRunApplies). Det skal ændre sig, når
// motoren ville regne på noget andet — og KUN da.
//
// 130. gennemsyn: matrixens input har stamgruppernes elever i kortets
// rækkefølge. Trak læreren en elev op eller ned i sit eget stamkort efter at
// have dannet matrixen, forsvandt matrixens mærker og noter, og prøvekørslen
// gik i gang — selv om matrixen er dannet af præcis de samme stamgrupper.
// (129. rettede det samme for matrix-advarslen og stamvisningens mærker.)

import { describe, it, expect, vi } from 'vitest';
import { buildEngineInput, inputFingerprint } from './nextEngine.js';

vi.mock('./storage.js', () => ({
    readTopicMap: () => ({}),
    replaceTopicMap: () => true,
    hydrateGroupTopics: () => {},
    saveGroupsToStorage: () => true,
    getTopic: () => null,
}));

const ids = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];

function makeClass(strategy = 'group') {
    return {
        filename: '2a',
        data: ids.map((id, i) => ({ _rowId: id, Navn: `Elev ${i + 1}`, Køn: i % 2 ? 'M' : 'K' })),
        rules: [{ type: 'balance', column: 'Køn' }],
        matrixRules: [{ type: 'balance', column: 'Køn' }],
        settings: { groupTarget: 3 },
        matrixSettings: { groupTarget: 3, matrixStrategy: 'full_strict', matrixRepresentationType: strategy },
        separations: [], topics: ['EU', 'FN'], togetherGroups: [],
    };
}

const homeGroups = () => [
    { name: 'Group 1', topic: 'EU', members: ['r1', 'r2', 'r3'] },
    { name: 'Group 2', topic: 'FN', members: ['r4', 'r5', 'r6'] },
];

function matrixPrint(cls, homes) {
    return inputFingerprint(buildEngineInput({ cls, isMatrix: true, groupMode: 'size', viewGroups: [], homeGroups: homes }));
}

describe('inputFingerprint', () => {
    it('matrix: en ny rækkefølge i et stamkort giver samme aftryk', () => {
        const cls = makeClass();
        const before = matrixPrint(cls, homeGroups());
        const homes = homeGroups();
        homes[0].members = ['r3', 'r1', 'r2'];
        expect(matrixPrint(cls, homes)).toBe(before);
    });

    it('matrix: en elev, der skifter stamgruppe, giver et andet aftryk', () => {
        const cls = makeClass();
        const before = matrixPrint(cls, homeGroups());
        const homes = homeGroups();
        homes[0].members = ['r1', 'r2', 'r4'];
        homes[1].members = ['r3', 'r5', 'r6'];
        expect(matrixPrint(cls, homes)).not.toBe(before);
    });

    it('matrix "Én fra hver stamgruppe": et nyt emne på en stamgruppe giver samme aftryk (motoren ser ikke emnet)', () => {
        const cls = makeClass('group');
        const before = matrixPrint(cls, homeGroups());
        const homes = homeGroups();
        homes[0].topic = 'NATO';
        expect(matrixPrint(cls, homes)).toBe(before);
    });

    it('matrix "Én fra hvert emne": et nyt emne på en stamgruppe giver et andet aftryk', () => {
        const cls = makeClass('topic');
        const before = matrixPrint(cls, homeGroups());
        const homes = homeGroups();
        homes[0].topic = 'NATO';
        expect(matrixPrint(cls, homes)).not.toBe(before);
    });

    it('stam: en låst gruppe med eleverne i en anden rækkefølge giver samme aftryk', () => {
        const cls = makeClass();
        const print = (members) => inputFingerprint(buildEngineInput({
            cls, isMatrix: false, groupMode: 'size',
            viewGroups: [{ name: 'Group 1', locked: true, members }],
        }));
        expect(print(['r3', 'r1', 'r2'])).toBe(print(['r1', 'r2', 'r3']));
        expect(print(['r1', 'r2', 'r4'])).not.toBe(print(['r1', 'r2', 'r3']));
    });

    it('budget og frø tæller ikke med', () => {
        const input = buildEngineInput({ cls: makeClass(), isMatrix: false, groupMode: 'size' });
        const before = inputFingerprint(input);
        input.budget = { ...input.budget, timeMs: 1 };
        input.seed = 42;
        expect(inputFingerprint(input)).toBe(before);
    });
});
