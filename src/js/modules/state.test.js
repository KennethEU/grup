import { describe, it, expect, beforeEach } from 'vitest';
import { computed } from 'vue';
import { state, pushUndo, undo, redo, clearUndoHistory, canUndo, canRedo, pruneSelection, undoShortcut } from './state.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Undo / Redo State Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Fortryd/Gentag', () => {
    beforeEach(() => {
        clearUndoHistory();
        state.currentClass = {
            data: [
                { Navn: 'Anna', Køn: 'K' },
                { Navn: 'Bob', Køn: 'M' },
            ],
            columns: ['Navn', 'Køn'],
        };
    });

    it('canUndo er false fra start', () => {
        expect(canUndo()).toBe(false);
    });

    it('canRedo er false fra start', () => {
        expect(canRedo()).toBe(false);
    });

    it('pushUndo gør canUndo true', () => {
        pushUndo();
        expect(canUndo()).toBe(true);
    });

    it('undo henter de forrige data tilbage', () => {
        pushUndo();
        // Mutate data
        state.currentClass.data[0].Navn = 'Changed';

        const result = undo();
        expect(result).toBe(true);
        expect(state.currentClass.data[0].Navn).toBe('Anna');
    });

    it('undo svarer false, når der intet er at fortryde', () => {
        expect(undo()).toBe(false);
    });

    it('redo gentager efter undo', () => {
        pushUndo();
        state.currentClass.data[0].Navn = 'Changed';

        undo(); // back to Anna
        expect(state.currentClass.data[0].Navn).toBe('Anna');

        redo(); // forward to Changed
        expect(state.currentClass.data[0].Navn).toBe('Changed');
    });

    it('redo svarer false, når der intet er at gentage', () => {
        expect(redo()).toBe(false);
    });

    it('pushUndo tømmer gentag-stakken', () => {
        pushUndo();
        state.currentClass.data[0].Navn = 'Changed';
        undo();
        expect(canRedo()).toBe(true);

        // New action clears redo
        pushUndo();
        expect(canRedo()).toBe(false);
    });

    it('flere fortryd-trin i træk virker', () => {
        // State 1: Anna, Bob
        pushUndo();
        state.currentClass.data[0].Navn = 'Step2';

        pushUndo();
        state.currentClass.data[0].Navn = 'Step3';

        undo(); // back to Step2
        expect(state.currentClass.data[0].Navn).toBe('Step2');

        undo(); // back to Anna
        expect(state.currentClass.data[0].Navn).toBe('Anna');
    });

    it('fortryd-stakken holdes på højst 50 trin', () => {
        for (let i = 0; i < 60; i++) {
            pushUndo();
            state.currentClass.data[0].Navn = `Step${i}`;
        }
        // Stack should be capped at 50
        expect(state._undoStack.length).toBe(50);
    });

    it('laver dybe kopier (ændringer rører ikke de gemte trin)', () => {
        pushUndo();
        state.currentClass.data.push({ Navn: 'Charlie', Køn: 'M' });

        undo();
        expect(state.currentClass.data.length).toBe(2); // original 2
    });

    it('clearUndoHistory tømmer begge stakke', () => {
        pushUndo();
        state.currentClass.data[0].Navn = 'X';
        undo();

        clearUndoHistory();
        expect(canUndo()).toBe(false);
        expect(canRedo()).toBe(false);
    });

    it('pushUndo gør intet uden currentClass', () => {
        state.currentClass = null;
        pushUndo();
        expect(canUndo()).toBe(false);
    });

    it('undo gør intet uden currentClass', () => {
        state.currentClass = null;
        expect(undo()).toBe(false);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// State Defaults
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Knapperne Fortryd/Gentag i elevlisten læser canUndo()/canRedo() i en
// computed(). Stakkene er markRaw, så uden undoVersion ville knappen aldrig
// opdage, at der er kommet noget at fortryde.
describe('Fortryd-knappen følger stakken', () => {
    beforeEach(() => {
        clearUndoHistory();
        state.currentClass = { data: [{ Navn: 'Anna' }], columns: ['Navn'] };
    });

    it('computed(canUndo/canRedo) regnes om ved push, fortryd, gentag og tømning', () => {
        const u = computed(() => canUndo());
        const r = computed(() => canRedo());
        expect([u.value, r.value]).toEqual([false, false]);
        pushUndo();
        expect([u.value, r.value]).toEqual([true, false]);
        undo();
        expect([u.value, r.value]).toEqual([false, true]);
        redo();
        expect([u.value, r.value]).toEqual([true, false]);
        clearUndoHistory();
        expect([u.value, r.value]).toEqual([false, false]);
    });
});

describe('Tilstandens standardværdier', () => {
    it('har de forventede standardværdier', () => {
        expect(state.groupMode).toBe('size');
        expect(state.activeView).toBe('standard');
        expect(state.classViewTab).toBe('students');
        expect(state.isGenerating).toBe(false);
        expect(state.matrixGroupsStale).toBe(false);
    });

    it('sortState har standardværdier', () => {
        expect(state.sortState).toEqual({ col: null, dir: 'asc' });
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fortryd af en kolonneflytning.
//
// `columns` er en afledt kopi — den rækkefølge der GEMMES, er nøglerne i
// række 0. Bytter fortryd hele `data` ud uden at rette `columns`, viser
// tabellen én rækkefølge, mens en anden bliver skrevet ned, og forskellen
// dukker først op efter næste genindlæsning.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Fortryd holder columns i sync med rækkerne', () => {
    beforeEach(() => {
        clearUndoHistory();
        state.currentClass = {
            columns: ['Navn', 'Køn', 'Niveau'],
            data: [
                { Navn: 'Anna', Køn: 'P', Niveau: 'Høj', _rowId: 'r1' },
                { Navn: 'Bo', Køn: 'D', Niveau: 'Lav', _rowId: 'r2' },
            ],
        };
    });

    it('sætter columns tilbage i den gamle rækkefølge', () => {
        pushUndo();
        // Som reorderColumns ville have gjort det.
        state.currentClass.columns = ['Niveau', 'Navn', 'Køn'];
        state.currentClass.data = state.currentClass.data.map(r =>
            ({ Niveau: r.Niveau, Navn: r.Navn, Køn: r.Køn, _rowId: r._rowId }));

        expect(undo()).toBe(true);
        expect(state.currentClass.columns).toEqual(['Navn', 'Køn', 'Niveau']);
    });

    it('og annullerer fortrydelsen igen ved redo', () => {
        pushUndo();
        state.currentClass.columns = ['Niveau', 'Navn', 'Køn'];
        state.currentClass.data = state.currentClass.data.map(r =>
            ({ Niveau: r.Niveau, Navn: r.Navn, Køn: r.Køn, _rowId: r._rowId }));

        undo();
        expect(redo()).toBe(true);
        expect(state.currentClass.columns).toEqual(['Niveau', 'Navn', 'Køn']);
    });

    it('fjerner ikke en kolonne der mangler i række 0', () => {
        // Huller i regnearket: kolonnen findes på række 2, men ikke på række 1.
        state.currentClass.data[0] = { Navn: 'Anna', Køn: 'P', _rowId: 'r1' };
        pushUndo();
        state.currentClass.data = [{ Køn: 'P', Navn: 'Anna', _rowId: 'r1' }];

        undo();
        expect(state.currentClass.columns).toContain('Niveau');
        expect(state.currentClass.columns).toHaveLength(3);
    });

    it('rører ikke columns, når fortryd ikke har flyttet noget', () => {
        pushUndo();
        state.currentClass.data[0].Navn = 'Anna Marie';
        undo();
        expect(state.currentClass.columns).toEqual(['Navn', 'Køn', 'Niveau']);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// pruneSelection — markeringen må ikke overleve eleven
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('pruneSelection', () => {
    beforeEach(() => {
        clearUndoHistory();
        state.currentClass = {
            data: [
                { Navn: 'Anna', _rowId: 'r-a' },
                { Navn: 'Bob', _rowId: 'r-b' },
                { Navn: 'Clara', _rowId: 'r-c' },
            ],
            columns: ['Navn'],
        };
        state.selectedForAction = new Set(['r-a', 'r-b', 'r-c']);
    });

    it('fjerner markeringen af en elev der ikke er i klassen længere', () => {
        state.currentClass.data.splice(1, 1);   // Bob slettes
        pruneSelection();
        expect([...state.selectedForAction]).toEqual(['r-a', 'r-c']);
    });

    it('rører ikke markeringen når alle elever stadig står i klassen', () => {
        pruneSelection();
        expect(state.selectedForAction.size).toBe(3);
    });

    it('tåler en klasse uden elevrækker', () => {
        state.currentClass.data = null;
        pruneSelection();
        expect(state.selectedForAction.size).toBe(0);
    });

    it('fortryd rydder markeringen af de elever, fortrydelsen tager væk', () => {
        // Fortryd her går TILBAGE til en liste uden Clara: hun blev tilføjet
        // efter snapshottet, og et fortryd fjerner hende igen.
        state.currentClass.data = [
            { Navn: 'Anna', _rowId: 'r-a' },
            { Navn: 'Bob', _rowId: 'r-b' },
        ];
        pushUndo();
        state.currentClass.data = [
            { Navn: 'Anna', _rowId: 'r-a' },
            { Navn: 'Bob', _rowId: 'r-b' },
            { Navn: 'Clara', _rowId: 'r-c' },
        ];
        undo();
        expect([...state.selectedForAction]).toEqual(['r-a', 'r-b']);
    });

    it('gentag rydder markeringen på samme måde', () => {
        pushUndo();
        state.currentClass.data = [{ Navn: 'Anna', _rowId: 'r-a' }];
        undo();                 // tilbage til alle tre
        expect(state.selectedForAction.size).toBe(3);
        redo();                 // frem til kun Anna
        expect([...state.selectedForAction]).toEqual(['r-a']);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// undoShortcut — genvejen læses ens, uanset stort eller lille bogstav
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('undoShortcut', () => {
    // Testmiljøet er ikke en Mac, så genvejstasten er Ctrl.
    const key = (k, extra = {}) => ({ key: k, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, ...extra });

    it('Ctrl+Z er fortryd, Ctrl+Y er gentag', () => {
        expect(undoShortcut(key('z'))).toBe('undo');
        expect(undoShortcut(key('y'))).toBe('redo');
    });

    it('Ctrl+Shift+Z er gentag — tasten kommer som stort "Z"', () => {
        expect(undoShortcut(key('Z', { shiftKey: true }))).toBe('redo');
    });

    it('Ctrl+Z med Caps Lock ("Z" uden Shift) er stadig fortryd', () => {
        expect(undoShortcut(key('Z'))).toBe('undo');
    });

    it('ignorerer bogstavet uden Ctrl og kombinationer med AltGr', () => {
        expect(undoShortcut(key('z', { ctrlKey: false }))).toBe(null);
        expect(undoShortcut(key('z', { altKey: true }))).toBe(null);
        expect(undoShortcut(key('a'))).toBe(null);
    });
});
