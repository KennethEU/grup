import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state.js';
import { ROW_ID_PATTERN } from './utils.js';

const topics = {};
vi.mock('./storage.js', () => ({
    getTopic: (name, prefix) => topics[`${prefix}${name}`] || null,
    saveTopic: vi.fn(),
    saveGroupsToStorage: vi.fn(),
}));
vi.mock('./classActions.js', () => ({ autoSave: vi.fn() }));
vi.mock('./generation.js', () => ({
    generateMatrixGroups: vi.fn(),
    handleGenerate: vi.fn(),
}));

import { buildGroupsClipboardText, deleteGroup, addEmptyGroup } from './groupActions.js';
import * as storage from './storage.js';

beforeEach(() => {
    for (const k of Object.keys(topics)) delete topics[k];
    state.currentClass = {
        name: '3.a',
        data: [
            { _rowId: 'r1', Navn: 'Anna' },
            { _rowId: 'r2', Navn: 'Bo' },
            { _rowId: 'r3', Navn: 'Cecilie' },
            { _rowId: 'r4', Navn: 'Anna' }, // to elever med SAMME navn
        ],
    };
    state.displayColumn = 'Navn';
    state.storedStandardGroups = null;
    state.storedMatrixGroups = null;
});

describe('buildGroupsClipboardText — kopiering leverer navne, ikke interne id\'er', () => {
    it('returnerer null når der ingen grupper er', () => {
        expect(buildGroupsClipboardText(false)).toBeNull();
        expect(buildGroupsClipboardText(true)).toBeNull();
    });

    it('kopierer stamgrupper med navne og emne', () => {
        topics['S_Group 1'] = 'Biologi';
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];

        const text = buildGroupsClipboardText(false);

        expect(text).toContain('Gruppe 1 - Biologi');
        expect(text).toContain('Anna');
        expect(text).toContain('Bo');
        expect(text).not.toMatch(new RegExp(`\\b${ROW_ID_PATTERN.source.slice(1, -1)}\\b`));
    });

    it('kopierer matrixgrupper med navne', () => {
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1', 'r3'] }];

        const text = buildGroupsClipboardText(true);

        expect(text).toContain('Anna');
        expect(text).toContain('Cecilie');
        expect(text).not.toMatch(new RegExp(`\\b${ROW_ID_PATTERN.source.slice(1, -1)}\\b`));
    });

    it('sætter stamgruppen i parentes når læreren beder om kilden', () => {
        topics['S_Group 1'] = 'Biologi';
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'] },
            { name: 'Group 2', members: ['r3'] },
        ];
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1', 'r3'] }];

        const text = buildGroupsClipboardText(true, true);

        expect(text).toContain('Anna (Grp 1 - Biologi)');
        expect(text).toContain('Cecilie (Grp 2)');
    });

    it('finder kilden på identitet, så to elever med samme navn ikke bytter stamgruppe', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'] }, // Anna
            { name: 'Group 2', members: ['r4'] }, // også Anna
        ];
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r4'] }];

        const text = buildGroupsClipboardText(true, true);

        expect(text).toContain('Anna (Grp 2)');
        expect(text).not.toContain('Grp 1');
    });

    it('bruger lærerens visningskolonne', () => {
        state.currentClass.data[0].Kaldenavn = 'Ann';
        state.displayColumn = 'Kaldenavn';
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'] }];

        expect(buildGroupsClipboardText(false)).toContain('Ann');
    });

    it('beholder navnet på en slettet elev', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: [{ id: 'r9', name: 'Dorte' }] },
        ];

        expect(buildGroupsClipboardText(false)).toContain('Dorte');
    });

    // Fluebenet "Til stede" i elevlisten fjerner IKKE eleven fra gruppen —
    // kun papirkurven gør det. Uden markeringen limer læreren en liste ind i
    // Lectio med elever, der ikke er i lokalet.
    it('markerer en elev der er sat fraværende i elevlisten', () => {
        state.currentClass.data[1]._excluded = true; // Bo
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'] }];

        const text = buildGroupsClipboardText(false);

        expect(text).toContain('Bo (fraværende)');
        expect(text).toContain('Anna\n'); // Anna er der — ingen markering
        expect(text).not.toContain('Anna (fraværende)');
    });

    it('markerer også fraværende i matrixkopien', () => {
        state.currentClass.data[2]._excluded = true; // Cecilie
        state.storedMatrixGroups = [{ name: 'Group 1', members: ['r1', 'r3'] }];

        expect(buildGroupsClipboardText(true)).toContain('Cecilie (fraværende)');
    });

    it('kalder ikke et spøgelse fraværende — det er en anden tilstand', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: [{ id: 'r9', name: 'Dorte' }] },
        ];

        expect(buildGroupsClipboardText(false)).not.toContain('fraværende');
    });
});

describe('deleteGroup — låsen gælder også sletningen', () => {
    beforeEach(() => {
        state.activeView = 'standard';
    });

    it('sletter en tom, ulåst gruppe', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'], locked: false },
            { name: 'Group 2', members: [], locked: false },
        ];
        deleteGroup('Group 2');
        expect(state.storedStandardGroups.map(g => g.name)).toEqual(['Group 1']);
    });

    // En tom gruppe kan være en plads, læreren har sat af — og genereringen
    // regner med den (neededNewGroups = totalTarget - lockedGroups.length).
    // Låsen skal derfor også dække sletningen, ikke kun flytningerne.
    it('rører ikke en tom gruppe der er låst', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'], locked: false },
            { name: 'Group 2', members: [], locked: true },
        ];
        deleteGroup('Group 2');
        expect(state.storedStandardGroups.map(g => g.name)).toEqual(['Group 1', 'Group 2']);
    });

    it('rører ikke en gruppe med medlemmer i', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'], locked: false },
        ];
        deleteGroup('Group 1');
        expect(state.storedStandardGroups.map(g => g.name)).toEqual(['Group 1']);
    });

    it('gælder også matrixvisningen', () => {
        state.activeView = 'matrix';
        state.storedMatrixGroups = [
            { name: 'Group 1', members: [], locked: true },
            { name: 'Group 2', members: [], locked: false },
        ];
        deleteGroup('Group 1');
        deleteGroup('Group 2');
        expect(state.storedMatrixGroups.map(g => g.name)).toEqual(['Group 1']);
    });
});

// Fundet ved en mutationstest 2026-09-24: ingen test så på navnet på den nye
// gruppe. Med `maxNum - 1` fik den samme navn som en gruppe, der allerede
// fandtes — og to grupper med samme navn deler emne og gemmes oven i hinanden.
describe('addEmptyGroup — den nye gruppe får det næste LEDIGE nummer', () => {
    beforeEach(() => {
        state.activeView = 'standard';
    });

    it('tager nummeret efter det højeste, også når der er huller', () => {
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1'], locked: false },
            { name: 'Group 3', members: ['r2'], locked: false },
        ];
        addEmptyGroup();
        expect(state.storedStandardGroups.map(g => g.name))
            .toEqual(['Group 1', 'Group 3', 'Group 4']);
        // Et gammelt emne under samme navn ryddes, så gruppen starter tom.
        expect(storage.saveTopic).toHaveBeenCalledWith('Group 4', null, 'S_');
    });

    it('rammer matrixgrupperne i matrixvisningen', () => {
        state.activeView = 'matrix';
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1'], locked: false }];
        state.storedMatrixGroups = [{ name: 'Group 2', members: ['r2'], locked: false }];
        addEmptyGroup();
        expect(state.storedMatrixGroups.map(g => g.name)).toEqual(['Group 2', 'Group 3']);
        expect(state.storedStandardGroups.map(g => g.name)).toEqual(['Group 1']);
        expect(storage.saveTopic).toHaveBeenCalledWith('Group 3', null, 'M_');
    });
});
