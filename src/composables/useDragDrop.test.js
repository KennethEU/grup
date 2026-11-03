import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state, undo, pushUndo, clearUndoHistory, canUndo } from '../js/modules/state.js';

vi.mock('../js/modules/storage.js', () => ({
    saveGroupsToStorage: vi.fn(),
}));

vi.mock('../js/modules/classActions.js', () => ({
    autoSave: vi.fn(),
}));

import {
    startDrag, dropOnTrash, pickUpMember, cancelPickUp, movePickedTo,
    pickedMemberId, pickedMemberName, moveMember, pickIsInContext,
    excludePicked,
    swapMembers, setSwapTarget, swapTarget, dropOnGroup, endDrag, justSwappedIds,
    getInsertIndex,
} from './useDragDrop.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// dropOnTrash — cross-view lock guard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('dropOnTrash', () => {
    beforeEach(() => {
        state.currentClass = {
            filename: 'test-class',
            data: [
                { Navn: 'Anna', Køn: 'K' },
                { Navn: 'Bob', Køn: 'M' },
            ],
            columns: ['Navn', 'Køn'],
        };
        state.activeView = 'matrix';
        state.storedStandardGroups = [
            { name: 'S1', members: ['Anna'], locked: true },
        ];
        state.storedMatrixGroups = [
            { name: 'M1', members: ['Anna'], locked: false },
        ];
    });

    it('fjerner IKKE en elev fra en LÅST gruppe i den anden visning', () => {
        // Dragging starts from the unlocked Matrix group (active view).
        startDrag('Anna', state.storedMatrixGroups[0]);
        dropOnTrash('Navn');

        // Removed from the unlocked source (Matrix) group — expected.
        expect(state.storedMatrixGroups[0].members).toHaveLength(0);
        // Must NOT have been removed from the LOCKED standard group.
        expect(state.storedStandardGroups[0].members).toEqual(['Anna']);
    });

    it('fjerner stadig en elev fra en ULÅST gruppe i den anden visning', () => {
        state.storedStandardGroups[0].locked = false;

        startDrag('Anna', state.storedMatrixGroups[0]);
        dropOnTrash('Navn');

        expect(state.storedMatrixGroups[0].members).toHaveLength(0);
        expect(state.storedStandardGroups[0].members).toHaveLength(0);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Markering — flyt en elev uden mus (tastatur/touch)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('pickUpMember / movePickedTo', () => {
    beforeEach(() => {
        cancelPickUp();
        state.activeView = 'standard';
        state.currentClass = { filename: 'k', data: [], columns: ['Navn'] };
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['Anna', 'Bo'], locked: false },
            { name: 'Group 2', members: ['Cille'], locked: false },
            { name: 'Group 3', members: ['Dan'], locked: true },
        ];
        state.storedMatrixGroups = [];
    });

    it('flytter en markeret elev til en anden gruppe', () => {
        pickUpMember('Anna', state.storedStandardGroups[0], 'Anna');
        expect(pickedMemberId.value).toBe('Anna');
        expect(pickedMemberName.value).toBe('Anna');

        expect(movePickedTo(state.storedStandardGroups[1])).toBe(true);

        expect(state.storedStandardGroups[0].members).toEqual(['Bo']);
        expect(state.storedStandardGroups[1].members).toEqual(['Cille', 'Anna']);
        // Markeringen ryddes, så "Flyt hertil"-knapperne forsvinder igen.
        expect(pickedMemberId.value).toBeNull();
    });

    it('markerer IKKE en elev i en låst gruppe', () => {
        pickUpMember('Dan', state.storedStandardGroups[2], 'Dan');
        expect(pickedMemberId.value).toBeNull();
    });

    it('flytter IKKE ind i en låst gruppe', () => {
        pickUpMember('Anna', state.storedStandardGroups[0], 'Anna');
        expect(movePickedTo(state.storedStandardGroups[2])).toBe(false);
        expect(state.storedStandardGroups[2].members).toEqual(['Dan']);
        // Markeringen består, så læreren kan vælge en anden gruppe.
        expect(pickedMemberId.value).toBe('Anna');
    });

    it('fortryder når den samme elev markeres igen', () => {
        pickUpMember('Anna', state.storedStandardGroups[0], 'Anna');
        pickUpMember('Anna', state.storedStandardGroups[0], 'Anna');
        expect(pickedMemberId.value).toBeNull();
    });

    it('flytter ikke ind i et forladt gruppeobjekt efter en regenerering', () => {
        pickUpMember('Anna', state.storedStandardGroups[0], 'Anna');
        // Generering udskifter hele listen — de gamle objekter er nu forladte.
        const orphan = state.storedStandardGroups[0];
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['Anna', 'Bo'], locked: false },
            { name: 'Group 2', members: ['Cille'], locked: false },
        ];
        expect(movePickedTo(state.storedStandardGroups[1])).toBe(true);
        // Den NYE liste blev ændret — ikke det forladte objekt.
        expect(state.storedStandardGroups[0].members).toEqual(['Bo']);
        expect(state.storedStandardGroups[1].members).toEqual(['Cille', 'Anna']);
        expect(orphan.members).toEqual(['Anna', 'Bo']);
    });

    it('en trækning overtager en igangværende markering', () => {
        pickUpMember('Anna', state.storedStandardGroups[0], 'Anna');
        startDrag('Bo', state.storedStandardGroups[0]);
        expect(pickedMemberId.value).toBeNull();
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Markeringen hører til ÉN klasse og ÉN visning
//
// Gruppenavne ("Group 1") og elev-id'er ("r7") går igen både mellem stam- og
// matrixgrupper og mellem klasser. Overlevede markeringen et skift, fandt
// navneopslaget i movePickedTo() en navnefælle i det NYE sæt — og flyttede
// en helt anden elev, med den markerede elevs navn stadig på knappen.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('markeringens kontekst', () => {
    beforeEach(() => {
        cancelPickUp();
        state.activeView = 'standard';
        state.currentClass = { filename: '2a', data: [], columns: ['Navn'] };
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r7', 'r8'], locked: false },
            { name: 'Group 2', members: ['r9'], locked: false },
        ];
        state.storedMatrixGroups = [
            { name: 'Group 1', members: ['r7', 'r9'], locked: false },
            { name: 'Group 2', members: ['r8'], locked: false },
        ];
    });

    it('flytter ikke i matrixen efter et skift fra stamgrupperne', () => {
        pickUpMember('r7', state.storedStandardGroups[0], 'Anna');
        state.activeView = 'matrix';

        expect(pickIsInContext()).toBe(false);
        expect(movePickedTo(state.storedMatrixGroups[1])).toBe(false);
        // Matrixen står urørt — og markeringen er ryddet, så båndet forsvinder.
        expect(state.storedMatrixGroups[0].members).toEqual(['r7', 'r9']);
        expect(state.storedMatrixGroups[1].members).toEqual(['r8']);
        expect(pickedMemberId.value).toBeNull();
    });

    it('flytter ikke i en anden klasse efter et klasseskift', () => {
        pickUpMember('r7', state.storedStandardGroups[0], 'Anna');
        // Ny klasse — samme gruppenavne, samme _rowId'er, andre elever.
        state.currentClass = { filename: '3b', data: [], columns: ['Navn'] };
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r7', 'r8'], locked: false },
            { name: 'Group 2', members: ['r9'], locked: false },
        ];

        expect(pickIsInContext()).toBe(false);
        expect(movePickedTo(state.storedStandardGroups[1])).toBe(false);
        expect(state.storedStandardGroups[0].members).toEqual(['r7', 'r8']);
        expect(state.storedStandardGroups[1].members).toEqual(['r9']);
        expect(pickedMemberId.value).toBeNull();
    });

    it('flytter stadig som normalt, når klasse og visning er uændrede', () => {
        pickUpMember('r7', state.storedStandardGroups[0], 'Anna');
        expect(pickIsInContext()).toBe(true);
        expect(movePickedTo(state.storedStandardGroups[1])).toBe(true);
        expect(state.storedStandardGroups[1].members).toEqual(['r9', 'r7']);
    });
});

describe('moveMember', () => {
    it('flytter ikke UD af en låst gruppe', () => {
        const locked = { name: 'L', members: ['Anna'], locked: true };
        const target = { name: 'T', members: [], locked: false };
        expect(moveMember(locked, target, 'Anna')).toBe(false);
        expect(locked.members).toEqual(['Anna']);
        expect(target.members).toEqual([]);
    });

    it('indsætter på det angivne indeks', () => {
        const a = { name: 'A', members: ['Anna'], locked: false };
        const b = { name: 'B', members: ['Bo', 'Cille'], locked: false };
        expect(moveMember(a, b, 'Anna', 1)).toBe(true);
        expect(b.members).toEqual(['Bo', 'Anna', 'Cille']);
    });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Papirkurven uden mus (excludePicked)
//
// Papirkurven er en slip-zone og kun det: den kan hverken tappes på en iPad
// eller nås fra tastaturet. Den markerede elev skal derfor kunne meldes
// fraværende ad den vej — og gennem SAMME funktion som slippet, så låse-tjek,
// `_excluded` og oprydningen i det andet gruppesæt ikke kan drive fra hinanden.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('excludePicked', () => {
    beforeEach(() => {
        cancelPickUp();
        state.currentClass = {
            filename: 'test-class',
            data: [
                { Navn: 'Anna', Køn: 'K' },
                { Navn: 'Bob', Køn: 'M' },
            ],
            columns: ['Navn', 'Køn'],
        };
        state.activeView = 'standard';
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['Anna', 'Bob'], locked: false },
        ];
        state.storedMatrixGroups = [
            { name: 'Group 1', members: ['Anna'], locked: false },
        ];
    });

    it('melder den markerede elev fraværende og rydder markeringen', () => {
        pickUpMember('Anna', state.storedStandardGroups[0], 'Anna');
        expect(excludePicked('Navn')).toBe(true);

        expect(state.storedStandardGroups[0].members).toEqual(['Bob']);
        expect(state.currentClass.data[0]._excluded).toBe(true);
        expect(pickedMemberId.value).toBe(null);
    });

    it('tager hende også ud af det ANDET gruppesæt', () => {
        pickUpMember('Anna', state.storedStandardGroups[0], 'Anna');
        excludePicked('Navn');
        expect(state.storedMatrixGroups[0].members).toHaveLength(0);
    });

    it('rører ikke en LÅST gruppe i den anden visning', () => {
        state.storedMatrixGroups[0].locked = true;
        pickUpMember('Anna', state.storedStandardGroups[0], 'Anna');
        excludePicked('Navn');
        expect(state.storedMatrixGroups[0].members).toEqual(['Anna']);
    });

    it('gør ingenting, hvis visningen er skiftet siden markeringen', () => {
        pickUpMember('Anna', state.storedStandardGroups[0], 'Anna');
        state.activeView = 'matrix';
        expect(excludePicked('Navn')).toBe(false);
        expect(state.storedStandardGroups[0].members).toEqual(['Anna', 'Bob']);
        expect(state.currentClass.data[0]._excluded).toBeUndefined();
        // Markeringen ryddes, så knappen ikke bliver stående og love noget.
        expect(pickedMemberId.value).toBe(null);
    });

    it('slår kildegruppen op i CURRENT state — ikke i det gemte objekt', () => {
        const staleGroup = state.storedStandardGroups[0];
        pickUpMember('Anna', staleGroup, 'Anna');
        // En ny gruppedannelse udskifter listen med nye objekter.
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['Anna', 'Bob'], locked: false },
        ];
        expect(excludePicked('Navn')).toBe(true);
        expect(state.storedStandardGroups[0].members).toEqual(['Bob']);
        // Det forladte objekt er urørt — det er netop pointen.
        expect(staleGroup.members).toEqual(['Anna', 'Bob']);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Papirkurven og fortryd-stakken
//
// `_excluded` ER elevdata, og fortryd-stakken i elevlisten gemmer netop
// elevrækkerne. Ændrer papirkurven dem uden et snapshot, springer stakken en
// handling over — og så fortryder ét Ctrl+Z TO ting: papirkurven OG den
// celleredigering, der lå før den.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('papirkurven og fortryd', () => {
    beforeEach(() => {
        cancelPickUp();
        clearUndoHistory();
        state.currentClass = {
            filename: 'test-class',
            data: [
                { Navn: 'Anna', Køn: 'K' },
                { Navn: 'Bob', Køn: 'M' },
            ],
            columns: ['Navn', 'Køn'],
        };
        state.activeView = 'standard';
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['Anna', 'Bob'], locked: false },
        ];
        state.storedMatrixGroups = null;
    });

    it('lægger et snapshot på stakken, så Ctrl+Z tager fraværet tilbage', () => {
        startDrag('Anna', state.storedStandardGroups[0]);
        dropOnTrash('Navn');
        expect(state.currentClass.data[0]._excluded).toBe(true);

        expect(undo()).toBe(true);
        // toBeFalsy: en frisk importeret klasse har slet ingen `_excluded`-nøgle,
        // og snapshottet er taget dér — fortryd giver altså `undefined`, ikke
        // `false`. Begge dele betyder "til stede".
        expect(state.currentClass.data[0]._excluded).toBeFalsy();
    });

    it('fortryder ikke en ældre rettelse i samme greb', () => {
        // Læreren retter en celle i elevlisten…
        pushUndo();
        state.currentClass.data[1].Navn = 'Bo';
        // …går til Grupper og trækker en elev i papirkurven.
        startDrag('Anna', state.storedStandardGroups[0]);
        dropOnTrash('Navn');

        // Første Ctrl+Z tager PAPIRKURVEN — ikke celleredigeringen.
        expect(undo()).toBe(true);
        // toBeFalsy: en frisk importeret klasse har slet ingen `_excluded`-nøgle,
        // og snapshottet er taget dér — fortryd giver altså `undefined`, ikke
        // `false`. Begge dele betyder "til stede".
        expect(state.currentClass.data[0]._excluded).toBeFalsy();
        expect(state.currentClass.data[1].Navn).toBe('Bo');

        // Andet Ctrl+Z tager celleredigeringen.
        expect(undo()).toBe(true);
        expect(state.currentClass.data[1].Navn).toBe('Bob');
    });

    it('lægger INTET snapshot, når eleven allerede er fraværende', () => {
        // Fraværende medlemmer bliver stående i gruppen, så de kan godt
        // trækkes i papirkurven — men så ændres kun grupperne, ikke dataene.
        state.currentClass.data[0]._excluded = true;
        startDrag('Anna', state.storedStandardGroups[0]);
        dropOnTrash('Navn');

        expect(state.storedStandardGroups[0].members).toEqual(['Bob']);
        expect(canUndo()).toBe(false);
    });

    it('gælder også papirkurven uden mus (markeringen)', () => {
        pickUpMember('Anna', state.storedStandardGroups[0], 'Anna');
        expect(excludePicked('Navn')).toBe(true);

        expect(undo()).toBe(true);
        // toBeFalsy: en frisk importeret klasse har slet ingen `_excluded`-nøgle,
        // og snapshottet er taget dér — fortryd giver altså `undefined`, ikke
        // `false`. Begge dele betyder "til stede".
        expect(state.currentClass.data[0]._excluded).toBeFalsy();
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// swapMembers — byt to elever ved at trække
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('swapMembers', () => {
    let g1, g2;
    beforeEach(() => {
        g1 = { name: 'Group 1', members: ['r1', 'r2', 'r3'], locked: false };
        g2 = { name: 'Group 2', members: ['r4', 'r5', 'r6'], locked: false };
        state.storedStandardGroups = [g1, g2];
        state.activeView = 'standard';
    });

    it('hver elev tager den andens plads, resten er uændret', () => {
        expect(swapMembers(g1, g2, 'r2', 'r5')).toBe(true);
        expect(g1.members).toEqual(['r1', 'r5', 'r3']);
        expect(g2.members).toEqual(['r4', 'r2', 'r6']);
        expect([...justSwappedIds.value].sort()).toEqual(['r2', 'r5']);
    });

    it('afviser, når en af grupperne er låst', () => {
        g2.locked = true;
        expect(swapMembers(g1, g2, 'r2', 'r5')).toBe(false);
        g2.locked = false;
        g1.locked = true;
        expect(swapMembers(g1, g2, 'r2', 'r5')).toBe(false);
        expect(g1.members).toEqual(['r1', 'r2', 'r3']);
        expect(g2.members).toEqual(['r4', 'r5', 'r6']);
    });

    it('afviser et bytte inden for én gruppe — det er kun en ny rækkefølge', () => {
        expect(swapMembers(g1, g1, 'r1', 'r3')).toBe(false);
        expect(g1.members).toEqual(['r1', 'r2', 'r3']);
    });

    it('afviser, når en elev ikke står i gruppen', () => {
        expect(swapMembers(g1, g2, 'r2', 'r99')).toBe(false);
        expect(g1.members).toEqual(['r1', 'r2', 'r3']);
    });

    it('bytter en spøgelseselev (ikke længere i klassen) som alle andre', () => {
        const ghost = { id: 'old', name: 'Old', isGhost: true };
        g2.members = ['r4', ghost];
        expect(swapMembers(g1, g2, 'r1', 'old')).toBe(true);
        expect(g1.members[0]).toBe(ghost);
        expect(g2.members[1]).toBe('r1');
    });
});

describe('dropOnGroup, mens et bytte vises', () => {
    let g1, g2;
    beforeEach(() => {
        g1 = { name: 'Group 1', members: ['r1', 'r2'], locked: false };
        g2 = { name: 'Group 2', members: ['r3', 'r4'], locked: false };
        state.storedStandardGroups = [g1, g2];
        state.activeView = 'standard';
    });

    it('bytter, når målkortet viser et bytte', () => {
        startDrag('r1', g1);
        setSwapTarget({ groupName: 'Group 2', memberId: 'r4', name: 'D' });
        dropOnGroup(g2, 0);
        expect(g1.members).toEqual(['r4', 'r2']);
        expect(g2.members).toEqual(['r3', 'r1']);
        endDrag();
    });

    it('flytter som normalt, når byttet hører til et andet kort', () => {
        const g3 = { name: 'Group 3', members: ['r5'], locked: false };
        startDrag('r1', g1);
        setSwapTarget({ groupName: 'Group 3', memberId: 'r5', name: 'E' });
        dropOnGroup(g2, 0);
        expect(g1.members).toEqual(['r2']);
        expect(g2.members).toEqual(['r1', 'r3', 'r4']);
        expect(g3.members).toEqual(['r5']);
        endDrag();
    });

    it('endDrag rydder byttet', () => {
        startDrag('r1', g1);
        setSwapTarget({ groupName: 'Group 2', memberId: 'r4', name: 'D' });
        endDrag();
        expect(swapTarget.value).toBe(null);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getInsertIndex — pladsen tælles i listen UDEN den trukne elev
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('getInsertIndex', () => {
    // En liste med rækker på 30 px. `rows` er [id, klasse] i DOM-rækkefølge;
    // en række på vej ud har display: none og derfor en tom kasse.
    function list(rows) {
        const ul = document.createElement('ul');
        let top = 0;
        for (const [id, cls] of rows) {
            const li = document.createElement('li');
            li.dataset.id = id;
            if (cls) li.className = cls;
            const t = cls === 'list-leave-active' ? 0 : top;
            const h = cls === 'list-leave-active' ? 0 : 30;
            li.getBoundingClientRect = () => ({ top: t, height: h, bottom: t + h });
            if (cls !== 'list-leave-active') top += 30;
            ul.appendChild(li);
        }
        return ul;
    }

    it('springer den trukne elev over, når hun står i listen', () => {
        // Anna trækkes inden for sit eget kort; musen står i Clara-rækkens
        // nederste halvdel (y = 80) — pladsen er efter Clara i [Bob, Clara, David].
        const ul = list([['Anna'], ['Bob'], ['Clara'], ['David']]);
        expect(getInsertIndex(ul, 80, 'Anna')).toBe(2);
        // Uden skipId tæller Anna med (et andet kort: hun står der ikke)
        expect(getInsertIndex(ul, 80)).toBe(3);
    });

    it('tæller ikke en række på vej ud eller pladsholderen med', () => {
        // Lige efter trækket startede: Annas række forsvinder (display: none),
        // og pladsholderen står øverst.
        const ul = list([['PREVIEW_ITEM', 'placeholder-item'], ['Anna', 'list-leave-active'],
            ['Bob'], ['Clara'], ['David']]);
        // Bob står på 30-60 under pladsholderen. Musen i hans øverste halvdel
        // er plads 0 i [Bob, Clara, David] — talte Annas række med, blev det 1.
        expect(getInsertIndex(ul, 35)).toBe(0);
        expect(getInsertIndex(ul, 50)).toBe(1);
    });

    it('moveMember lander dér, hvor pladsholderen stod', () => {
        // Kontrakten mellem de to: indekset er en plads i listen uden eleven.
        const g = { name: 'G1', locked: false, members: ['Anna', 'Bob', 'Clara', 'David'] };
        const ul = list([['Anna'], ['Bob'], ['Clara'], ['David']]);
        const idx = getInsertIndex(ul, 80, 'Anna');
        expect(moveMember(g, g, 'Anna', idx)).toBe(true);
        expect(g.members).toEqual(['Bob', 'Clara', 'Anna', 'David']);
    });
});
