// sessionShapes.test.js — en gemt session (Historik) med forkerte former
// indeni (122. gennemsyn, tematik 113).
//
// En session kan komme udefra: writeClassExtras() i backup-gendannelsen
// tjekker kun, at payloaden er et objekt. 121. gennemsyn rensede klassen,
// grupperne og emnerne; det her er indholdet af en GEMT SESSION, når den
// hentes frem med "Gendan" eller vises i forhåndsvisningen.
//
// Løfterne:
//   - en regel, der er `null`, vælter ikke gendannelsen halvvejs;
//   - en session uden en eneste læselig gruppe skriver ikke en tom fordeling
//     oven i dagens grupper;
//   - matrixen hentes kun, når der er læselige matrixgrupper;
//   - gruppenavne er brugbare og unikke (navnet er gruppens identitet);
//   - emner, der ikke er tekst, bliver ikke til "[object Object]";
//   - det, der blev ladt ude, siges.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { state } from './state.js';
import * as storage from './storage.js';
import { restoreSession, loadSessionForPreview } from './history.js';
import { hasManualChanges } from './runHistory.js';
import { giveUsableGroupNames, topicText, isUsableTarget } from './classShape.js';

if (window.happyDOM) window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;

const FILE = 'sessionformer.csv';

function makeClass() {
    return {
        filename: FILE,
        columns: ['Navn', 'Køn'],
        data: [
            { _rowId: 'r1', Navn: 'Ida', Køn: 'Pige' },
            { _rowId: 'r2', Navn: 'Bo', Køn: 'Dreng' },
            { _rowId: 'r3', Navn: 'Ali', Køn: 'Pige' },
            { _rowId: 'r4', Navn: 'Eva', Køn: 'Dreng' },
        ],
        rules: [{ type: 'distribute', column: 'Køn' }],
        topics: ['Klima'],
        settings: { groupMode: 'size', groupTarget: 2, groupMod: '-' },
        matrixSettings: {},
    };
}

function goodSession() {
    return {
        id: 's1', name: 'Uge 46', date: new Date().toISOString(), type: 'STANDARD_ONLY',
        activeRules: [{ name: 'distribute', attribute: 'Køn', values: '' }],
        groups: [
            { name: 'Group 1', members: [{ id: 'r1', name: 'Ida' }, { id: 'r2', name: 'Bo' }], locked: false, topic: 'Klima' },
            { name: 'Group 2', members: [{ id: 'r3', name: 'Ali' }, { id: 'r4', name: 'Eva' }], locked: false, topic: '' },
        ],
        matrixGroups: [],
    };
}

let messages;
beforeEach(() => {
    localStorage.clear();
    state.currentClass = makeClass();
    state.displayColumn = 'Navn';
    // Dagens grupper — dem, en fejlet gendannelse skal lade stå.
    state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2', 'r3', 'r4'], locked: false, topic: null }];
    state.storedMatrixGroups = null;
    state.activeView = 'standard';
    state.classViewTab = 'history';
    messages = { error: [], info: [] };
    window.notifyError = vi.fn(m => messages.error.push(m));
    window.notifyInfo = vi.fn(m => messages.info.push(m));
    window.notifySuccess = vi.fn();
});

function seed(mutate) {
    const s = goodSession();
    mutate(s);
    localStorage.setItem('grupdk_session_s1', JSON.stringify(s));
}

describe('Gendan en session med forkerte former', () => {
    it('en regel, der er null, vælter ikke gendannelsen — kørselsmenuen er "ren" og fanen skifter', () => {
        seed(s => { s.activeRules = [null, 'abc', { name: 5, attribute: {} }, { name: 'distribute', attribute: 'Køn', values: '' }]; });
        expect(() => restoreSession('s1')).not.toThrow();
        expect(state.storedStandardGroups.map(g => g.members.length)).toEqual([2, 2]);
        expect(state.classViewTab).toBe('groups');
        // Uden markClean bagefter troede kørselsmenuen, at læreren havde
        // flyttet elever i hånden.
        expect(hasManualChanges()).toBe(false);
    });

    it('en session uden en eneste læselig gruppe lader dagens grupper stå', () => {
        for (const groups of [[null, 'abc', 5], []]) {
            seed(s => { s.groups = groups; });
            restoreSession('s1');
            expect(state.storedStandardGroups).toEqual([{ name: 'Group 1', members: ['r1', 'r2', 'r3', 'r4'], locked: false, topic: null }]);
            expect(state.classViewTab).toBe('history');
            expect(messages.error.at(-1)).toMatch(/ingen grupper i den, som kan læses/);
            expect(loadSessionForPreview('s1')).toBeNull();
        }
    });

    it('en gruppe, der ikke kan læses, lades ude, og det siges', () => {
        seed(s => { s.groups = [null, s.groups[1]]; });
        restoreSession('s1');
        expect(state.storedStandardGroups.map(g => g.name)).toEqual(['Group 2']);
        expect(messages.info.join(' ')).toMatch(/1 gruppe i den kunne ikke læses og er ladt ude/);
    });

    it('gruppenavne, der mangler eller findes to gange, får et ledigt "Group N"', () => {
        seed(s => {
            s.groups[0].name = null;
            s.groups.push({ name: 'Group 2', members: [], topic: '' });
        });
        restoreSession('s1');
        const names = state.storedStandardGroups.map(g => g.name);
        expect(new Set(names).size).toBe(names.length);
        expect(names).toEqual(['Group 1', 'Group 2', 'Group 3']);
        // Emnet for gruppen uden navn er gemt under dens nye navn.
        expect(storage.getTopic('Group 1', 'S_')).toBe('Klima');
        expect(messages.info.join(' ')).toMatch(/2 grupper havde intet brugbart navn/);
        const preview = loadSessionForPreview('s1');
        expect(preview.standard.map(g => g.name)).toEqual(['Group 1', 'Group 2', 'Group 3']);
    });

    it('et emne, der ikke er tekst, bliver ikke til "[object Object]"', () => {
        seed(s => { s.groups[0].topic = { a: 1 }; s.groups[1].topic = 7; });
        restoreSession('s1');
        expect(state.storedStandardGroups.map(g => g.topic)).toEqual(['', '7']);
        expect(state.currentClass.topics).toEqual(['Klima', '7']);
        expect(JSON.stringify(state.currentClass.topics)).not.toContain('object');
    });

    it('kun et rigtigt true låser en gruppe', () => {
        seed(s => { s.groups[0].locked = 'false'; s.groups[1].locked = true; });
        restoreSession('s1');
        expect(state.storedStandardGroups.map(g => g.locked)).toEqual([false, true]);
    });

    it('et medlem med et objekt som navn bliver et spøgelse uden "[object Object]"', () => {
        seed(s => { s.groups[0].members = [{ id: { x: 1 }, name: { y: 2 } }, { id: 'r2', name: 'Bo' }]; });
        restoreSession('s1');
        const ghost = state.storedStandardGroups[0].members[0];
        expect(ghost.isGhost).toBe(true);
        expect(ghost.name).toBe('Ukendt');
        expect(loadSessionForPreview('s1').standard[0].members[0]).toEqual({ name: 'Ukendt', isGhost: true });
    });

    it('matrixen hentes kun, når der er læselige matrixgrupper', () => {
        for (const matrixGroups of ['abc', [null], { a: 1 }]) {
            seed(s => { s.type = 'WITH_MATRIX'; s.matrixGroups = matrixGroups; });
            restoreSession('s1');
            expect(state.activeView).toBe('standard');
            expect(state.storedMatrixGroups).toBeNull();
            // Uden matrix skal den dannes forfra næste gang.
            expect(state.matrixGroupsStale).toBe(true);
            expect(loadSessionForPreview('s1').matrix).toBeNull();
        }
    });

    it('en rigtig matrix hentes stadig frem', () => {
        seed(s => {
            s.type = 'WITH_MATRIX';
            s.matrixGroups = [
                { name: 'Group 1', members: [{ id: 'r1' }, { id: 'r3' }], topic: '' },
                { name: 'Group 2', members: [{ id: 'r2' }, { id: 'r4' }], topic: '' },
            ];
        });
        restoreSession('s1');
        expect(state.activeView).toBe('matrix');
        expect(state.storedMatrixGroups.map(g => g.members)).toEqual([['r1', 'r3'], ['r2', 'r4']]);
        expect(state.matrixGroupsStale).toBe(false);
        expect(messages.info).toEqual([]);
    });
});

describe('Klassens egne gemte grupper med navne, der ikke kan bruges', () => {
    it('loadGroupsFromStorage giver unikke navne', () => {
        localStorage.setItem('grupdk_groups_' + FILE, JSON.stringify({
            standard: [
                { name: 'Group 1', members: ['r1'] },
                { name: 'Group 1', members: ['r2'] },
                { name: null, members: ['r3'] },
                { name: 'Group 2', members: ['r4'] },
            ],
            matrix: null,
        }));
        const saved = storage.loadGroupsFromStorage();
        expect(saved.standard.map(g => g.name)).toEqual(['Group 1', 'Group 3', 'Group 4', 'Group 2']);
    });
});

describe('classShape-hjælperne', () => {
    it('giveUsableGroupNames lader gode navne stå og tæller omdøbningerne', () => {
        const groups = [{ name: 'A' }, { name: 3 }, { name: '' }, { name: 'A' }, null];
        expect(giveUsableGroupNames(groups)).toBe(2);
        expect(groups.slice(0, 4).map(g => g.name)).toEqual(['A', '3', 'Group 1', 'Group 2']);
    });

    it('topicText: tekst og tal er emner, resten ikke', () => {
        expect([topicText('Klima'), topicText(4), topicText(null), topicText({}), topicText(['a'])])
            .toEqual(['Klima', '4', '', '', '']);
    });

    it('isUsableTarget: tal og taltekst på mindst 1, eller intet', () => {
        expect([4, '5', undefined, null].every(isUsableTarget)).toBe(true);
        expect(['abc', 0, '0', -2, NaN, {}, [], ''].some(isUsableTarget)).toBe(false);
    });
});
