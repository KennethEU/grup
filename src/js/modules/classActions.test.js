import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state.js';

// Mock dependencies that classActions imports
vi.mock('./api.js', () => ({
    saveClassData: vi.fn(() => Promise.resolve()),
}));
vi.mock('./py_bridge.js', () => ({
    safeStorageSet: (key, value) => { localStorage.setItem(key, value); return true; },
}));
// Den rigtige openAgreements (den sætter kun state), resten er attrapper.
vi.mock('./modalState.js', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, modalActions: { ...actual.modalActions, openDeleteColumn: vi.fn() } };
});

import { handleAddRow, handleSeparateAction, coveredSeparationIndexes, autoSave, registerPendingWrite, flushPendingWrites, syncDisplayColumn } from './classActions.js';
import { saveClassData } from './api.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// classActions Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('handleAddRow', () => {
    beforeEach(() => {
        state.currentClass = {
            filename: 'test',
            data: [{ Navn: 'Anna', Køn: 'K' }],
            columns: ['Navn', 'Køn'],
            rules: [],
            settings: {},
        };
        state.activeView = 'standard';
        state.idColumn = 'Navn';
    });

    it('tilføjer en ny tom række øverst', () => {
        handleAddRow();
        expect(state.currentClass.data.length).toBe(2);
        expect(state.currentClass.data[0].Navn).toBe('');
        expect(state.currentClass.data[0].Køn).toBe('');
    });

    it('gør intet uden currentClass', () => {
        state.currentClass = null;
        handleAddRow(); // should not throw
    });

    it('opretter data-listen, hvis den mangler', () => {
        state.currentClass.data = null;
        handleAddRow();
        expect(state.currentClass.data).toBeDefined();
        // Actually, handleAddRow checks `if (!state.currentClass.data)` and sets []
        expect(state.currentClass.data.length).toBeGreaterThanOrEqual(1);
    });
});

describe('handleSeparateAction', () => {
    beforeEach(() => {
        state.currentClass = {
            filename: 'test',
            // _rowId er elevens identitet i produktionen; uden den på fixturen
            // testede vi en kodesti, der ikke findes. Værdien er sat lig navnet,
            // fordi resten af filen refererer eleverne ved navn.
            data: [
                { Navn: 'Anna', Køn: 'K', _rowId: 'Anna' },
                { Navn: 'Bob', Køn: 'M', _rowId: 'Bob' },
                { Navn: 'Clara', Køn: 'K', _rowId: 'Clara' },
            ],
            columns: ['Navn', 'Køn'],
            separations: [],
            rules: [],
            settings: {},
        };
        state.activeView = 'standard';
        state.idColumn = 'Navn';
        state.selectedForAction = new Set();
        window.notifyInfo = vi.fn();
        window.notifyError = vi.fn();
    });

    it('kræver mindst 2 markerede elever', () => {
        state.selectedForAction = new Set(['Anna']);
        handleSeparateAction();
        expect(window.notifyInfo).toHaveBeenCalledWith('Vælg mindst 2 elever.');
        expect(state.currentClass.separations.length).toBe(0);
    });

    it('opretter en undgåelse for 2+ markerede elever', () => {
        state.selectedForAction = new Set(['Anna', 'Bob']);
        handleSeparateAction();
        expect(state.currentClass.separations.length).toBe(1);
        expect(state.currentClass.separations[0].ids).toEqual(['Anna', 'Bob']);
    });

    it('rydder markeringen efter at have oprettet undgåelsen', () => {
        state.selectedForAction = new Set(['Anna', 'Bob']);
        handleSeparateAction();
        expect(state.selectedForAction.size).toBe(0);
    });

    it('opretter ikke den samme undgåelse to gange', () => {
        state.currentClass.separations = [{ ids: ['Anna', 'Bob'], timestamp: 1 }];
        state.selectedForAction = new Set(['Anna', 'Bob']);
        handleSeparateAction();
        // Should not add a second one
        expect(state.currentClass.separations.length).toBe(1);
    });

    it('åbner undgåelses-vinduet efter undgåelsen (intet faneskift)', () => {
        // Undgåelser bor i et modal-vindue i elev-fanen — der findes ingen
        // 'avoid'-fane (gyldige faner: students/groups/history, se AppTopbar).
        state.classViewTab = 'students';
        state.showAgreementsModal = false;
        state.selectedForAction = new Set(['Anna', 'Bob']);
        handleSeparateAction();
        expect(state.showAgreementsModal).toBe(true);
        expect(state.agreementTab).toBe('separate');
        expect(state.classViewTab).toBe('students');
    });

    it('siger det med en besked — og åbner IKKE vinduet — når reglen findes', () => {
        // Vindue eller besked, aldrig begge dele: beskederne ligger øverst på
        // skærmen og dækkede vinduets faner og luk-knap på en telefon.
        state.currentClass.separations = [{ ids: ['Anna', 'Bob'], timestamp: 1 }];
        state.showAgreementsModal = false;
        state.selectedForAction = new Set(['Anna', 'Bob']);
        handleSeparateAction();
        expect(state.showAgreementsModal).toBe(false);
        expect(window.notifyInfo).toHaveBeenCalledWith(expect.stringContaining('findes allerede'));
    });

    it('opretter separations-listen, hvis den mangler', () => {
        delete state.currentClass.separations;
        state.selectedForAction = new Set(['Anna', 'Clara']);
        handleSeparateAction();
        expect(state.currentClass.separations.length).toBe(1);
    });

    // Rækkefølgen bestemmer, hvad beskederne læser ("Anna og Clara"). Den
    // fulgte før id'ets alfabet, hvilket kun så rigtigt ud, så længe id'erne
    // var r1, r2, … Nu følger den elevlisten.
    it('gemmer id-erne i elevlistens rækkefølge', () => {
        state.selectedForAction = new Set(['Clara', 'Anna']);
        handleSeparateAction();
        expect(state.currentClass.separations[0].ids).toEqual(['Anna', 'Clara']);
    });

    it('— og det er listens orden, ikke alfabetets', () => {
        // Clara flyttes ØVERST i elevlisten; alfabetet ville stadig sige Anna.
        state.currentClass.data.unshift(state.currentClass.data.pop());
        state.selectedForAction = new Set(['Anna', 'Clara']);
        handleSeparateAction();
        expect(state.currentClass.separations[0].ids).toEqual(['Clara', 'Anna']);
    });

    // Markeringen peger på _rowId og overlever eleven. Sletter læreren en af
    // tre markerede elever og vælger så "Undgå hinanden", blev det døde id
    // skrevet med i undgåelsen: den kunne aldrig gå i brug, men stod i listen,
    // talte med i badget — og dækkede den rigtige undgåelse af de to, der var
    // tilbage, så DEN ikke kunne tilføjes bagefter.
    it('springer markerede elever over, der ikke er i klassen længere', () => {
        state.selectedForAction = new Set(['Anna', 'Bob', 'Clara']);
        state.currentClass.data = state.currentClass.data.filter(s => s.Navn !== 'Bob');
        handleSeparateAction();
        expect(state.currentClass.separations).toHaveLength(1);
        expect(state.currentClass.separations[0].ids).toEqual(['Anna', 'Clara']);
    });

    it('— og siger "vælg mindst 2", når der kun er én tilbage', () => {
        state.selectedForAction = new Set(['Anna', 'Bob']);
        state.currentClass.data = state.currentClass.data.filter(s => s.Navn === 'Anna');
        handleSeparateAction();
        expect(state.currentClass.separations).toHaveLength(0);
        expect(window.notifyInfo).toHaveBeenCalledWith('Vælg mindst 2 elever.');
    });

    it('afviser en undgåelse, der kolliderer med Skal sammen', () => {
        state.currentClass.data = [
            { _rowId: 'r1', Navn: 'Anna' },
            { _rowId: 'r2', Navn: 'Bob' },
            { _rowId: 'r3', Navn: 'Clara' },
        ];
        state.displayColumn = 'Navn';
        state.currentClass.togetherGroups = [{ ids: ['r1', 'r2'] }];
        state.selectedForAction = new Set(['r1', 'r2']);

        handleSeparateAction();

        expect(state.currentClass.separations).toHaveLength(0);
        // Siger at intet blev gemt, og hvem det gælder (parret, ikke hele aftalen).
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringContaining('Undgå hinanden blev ikke gemt: Anna og Bob skal sammen.'));
    });

    it('afviser også en indirekte konflikt gennem flere Skal sammen-aftaler', () => {
        state.currentClass.data = [
            { _rowId: 'r1', Navn: 'Anna' },
            { _rowId: 'r2', Navn: 'Bob' },
            { _rowId: 'r3', Navn: 'Clara' },
        ];
        state.displayColumn = 'Navn';
        state.currentClass.togetherGroups = [
            { ids: ['r1', 'r2'] },
            { ids: ['r2', 'r3'] },
        ];
        state.selectedForAction = new Set(['r1', 'r3']);

        handleSeparateAction();

        expect(state.currentClass.separations).toHaveLength(0);
        expect(window.notifyError).toHaveBeenCalledWith(
            expect.stringContaining('Undgå hinanden blev ikke gemt: Anna og Clara skal sammen via Bob.'));
    });

    it('afviser en undgåelse, der allerede er dækket af en større undgåelse', () => {
        state.currentClass.separations = [{ ids: ['Anna', 'Bob', 'Clara'] }];
        state.selectedForAction = new Set(['Anna', 'Bob']);

        handleSeparateAction();

        expect(state.currentClass.separations).toHaveLength(1);
        expect(window.notifyInfo).toHaveBeenCalledWith(expect.stringContaining('dækket af en større'));
    });

    it('BEVARER en mindre undgåelse, når en større regel oprettes', () => {
        // Læreren har ikke trukket den mindre regel tilbage. Slettede vi den,
        // ville løftet om Anna+Bob forsvinde den dag hun fjerner den store.
        state.currentClass.separations = [{ ids: ['Anna', 'Bob'], timestamp: 1 }];
        state.selectedForAction = new Set(['Anna', 'Bob', 'Clara']);

        handleSeparateAction();

        expect(state.currentClass.separations.map(s => s.ids))
            .toEqual([['Anna', 'Bob'], ['Anna', 'Bob', 'Clara']]);
        // ... men den skal kunne ses som virkningsløs, så længe den store står.
        expect([...coveredSeparationIndexes(state.currentClass.separations)]).toEqual([0]);
    });

    it('peger kun dubletter og delmængder ud — aldrig en selvstændig regel', () => {
        const savedRules = [
            { ids: ['Anna', 'Bob'] },
            { ids: ['Anna', 'Bob', 'Clara'] },
            { ids: ['Dan', 'Eva'] },
            { ids: ['Dan', 'Eva'] },
        ];
        expect([...coveredSeparationIndexes(savedRules)]).toEqual([0, 3]);
        expect([...coveredSeparationIndexes([])]).toEqual([]);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sidste chance for at gemme, når fanen lukkes
//
// Grupper har ingen server. Alt der kun ligger i hukommelsen, når fanen
// lukkes, er væk. To ting lå der (gennemsyn 1/9): cellen læreren stod midt
// i (elevtabellens celler skriver først ved `blur`), og de udskudte
// skrivninger på Grupper-fanen.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('flushPendingWrites', () => {
    beforeEach(() => {
        state.currentClass = {
            filename: 'test.csv',
            data: [{ Navn: 'Anna' }],
            columns: ['Navn'],
            rules: [],
            settings: {},
        };
        state.activeView = 'standard';
        saveClassData.mockClear();
        document.body.innerHTML = '';
    });

    it('gemmer klassen', () => {
        flushPendingWrites();
        expect(saveClassData).toHaveBeenCalledTimes(1);
    });

    it('kører de tilmeldte udskudte skrivninger FØR der gemmes', () => {
        const savedOrder = [];
        saveClassData.mockImplementation(() => { savedOrder.push('gem'); return Promise.resolve(); });
        registerPendingWrite(() => savedOrder.push('udskudt'));

        flushPendingWrites();

        expect(savedOrder).toEqual(['udskudt', 'gem']);
    });

    it('en frameldt skrivning køres ikke igen', () => {
        const fn = vi.fn();
        const unsubscribe = registerPendingWrite(fn);
        unsubscribe();
        flushPendingWrites();
        expect(fn).not.toHaveBeenCalled();
    });

    it('én skrivning der kaster, forhindrer ikke gemmet', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        registerPendingWrite(() => { throw new Error('boom'); });
        const laterCall = vi.fn();
        registerPendingWrite(laterCall);

        flushPendingWrites();

        expect(laterCall).toHaveBeenCalled();
        expect(saveClassData).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    // Selve fundet: cellen læreren stadig står i. Værdien skrives først ind
    // i klassen ved `blur`, og der fyrer ingen blur, når fanen lukkes.
    it('tager fokus fra det felt der redigeres, så værdien når ind i klassen', () => {
        const firstCell = document.createElement('div');
        firstCell.setAttribute('contenteditable', 'true');
        document.body.appendChild(firstCell);
        let blurredCell = false;
        firstCell.addEventListener('blur', () => { blurredCell = true; });
        firstCell.focus();

        flushPendingWrites();

        expect(blurredCell).toBe(true);
    });

    it('rører ikke fokus, når der ikke redigeres noget', () => {
        const undoButton = document.createElement('button');
        document.body.appendChild(undoButton);
        undoButton.focus();

        flushPendingWrites();

        expect(document.activeElement).toBe(undoButton);
    });
});

describe('handleTogetherAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.currentClass = {
            filename: 'together.csv',
            data: [1, 2, 3].map(i => ({ _rowId: `r${i}`, Navn: `Elev ${i}` })),
            rules: [], settings: {}, separations: [], togetherGroups: [],
        };
        state.displayColumn = 'Navn';
        state.activeView = 'standard';
        state.isGenerating = false;
        state.selectedForAction = new Set(['r1', 'r2']);
        window.notifyInfo = vi.fn();
        window.notifyError = vi.fn();
        window.notifySuccess = vi.fn();
    });

    it('gemmer elevernes identitet og rydder markeringen, men flytter ingen grupper', async () => {
        const { handleTogetherAction } = await import('./classActions.js');
        const before = state.storedStandardGroups;
        handleTogetherAction();
        expect(state.currentClass.togetherGroups[0].ids).toEqual(['r1', 'r2']);
        expect(saveClassData.mock.calls[0][10].togetherGroups).toEqual(state.currentClass.togetherGroups);
        expect(state.selectedForAction.size).toBe(0);
        expect(state.storedStandardGroups).toBe(before);
        state.selectedForAction = new Set(['r2', 'r1']);
        handleTogetherAction();
        expect(state.currentClass.togetherGroups).toHaveLength(1);
    });

    it('afviser en indirekte konflikt med en undgåelse, også når eleven er fraværende', async () => {
        const { handleTogetherAction } = await import('./classActions.js');
        state.currentClass.togetherGroups = [{ ids: ['r2', 'r3'] }];
        state.currentClass.separations = [{ ids: ['r1', 'r3'] }];
        state.currentClass.data[2]._excluded = true;
        handleTogetherAction();
        expect(state.currentClass.togetherGroups).toHaveLength(1);
        expect(saveClassData).not.toHaveBeenCalled();
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringContaining('undgåelse'));
    });
});

// Vis-kolonnen sættes ved indlæsningen (AppTopbar) og i ClassView. Før
// 10/11 2026 kun i ClassView, så en genindlæsning i Hjælp gav en tom
// Vis-kolonne, og næste gem skrev den første kolonne over lærerens valg.
describe('syncDisplayColumn', () => {
    beforeEach(() => {
        state.displayColumn = '';
        state.currentClass = { filename: 'test', columns: ['Navn', 'Køn', 'Karakter'], id_column: 'Køn', data: [] };
    });

    it('bruger lærerens gemte valg', () => {
        syncDisplayColumn();
        expect(state.displayColumn).toBe('Køn');
    });

    it('et gemt valg, der ikke findes, giver den første kolonne', () => {
        state.currentClass.id_column = 'Findes ikke';
        syncDisplayColumn();
        expect(state.displayColumn).toBe('Navn');
    });

    it('beholder et gyldigt valg, når klassen intet har gemt', () => {
        state.currentClass.id_column = '';
        state.displayColumn = 'Karakter';
        syncDisplayColumn();
        expect(state.displayColumn).toBe('Karakter');
    });

    it('et valg fra en anden klasse bruges ikke', () => {
        state.currentClass.id_column = '';
        state.displayColumn = 'Fornavn';
        syncDisplayColumn();
        expect(state.displayColumn).toBe('Navn');
    });

    it('interne felter og ingen klasse giver ingen Vis-kolonne', () => {
        state.currentClass = { columns: ['_rowId'] };
        syncDisplayColumn();
        expect(state.displayColumn).toBe('');
        state.currentClass = null;
        syncDisplayColumn();
        expect(state.displayColumn).toBe('');
    });

    it('og autoSave gemmer valget som id_column', () => {
        state.activeView = 'standard';
        syncDisplayColumn();
        saveClassData.mockClear();
        autoSave();
        expect(saveClassData.mock.calls[0][3]).toBe('Køn');
        // …og hukommelsen siger det samme, så elevlistens side ikke tager
        // det gamle valg frem, når den tegnes forfra (fx efter Hjælp).
        expect(state.currentClass.id_column).toBe('Køn');
    });
});
