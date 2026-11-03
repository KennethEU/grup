// Regressionsværn for klasser gemt FØR _rowId blev indført.
//
// Alt herinde er "eksisterende data": de shapes der rent faktisk kan ligge i en
// lærers browser lige nu. De køres gennem de RIGTIGE produktionsfunktioner —
// ikke gennem forenklede stand-ins — så en fremtidig ændring, der brækker
// migreringen, fejler her frem for hos læreren.
//
// Dækker: klasser, undgåelser, gemte/låste/matrix-grupper, spøgelser fra en
// tidligere gendannelse, historik-sessioner, og selve gruppedannelsen.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state.js';
import { ROW_ID, ROW_ID_PATTERN, migrateRefsToRowIds, memberDisplayName, memberIdStr, RULE_TYPES } from './utils.js';

vi.mock('./py_bridge.js', () => ({
    safeStorageSet: (k, v) => { localStorage.setItem(k, v); return true; },
}));
vi.mock('./storage.js', () => ({
    saveGroupsToStorage: vi.fn(),
    saveTopic: vi.fn(() => true),
    getTopic: vi.fn(() => null),
    clearTopics: vi.fn(),
    replaceTopicsForPrefix: vi.fn(() => true),
    populateDatalistFromStorage: vi.fn(),
    getHistory: vi.fn(() => []),
    saveHistory: vi.fn(),
    saveSessionPayload: vi.fn(() => true),
    loadSessionPayload: vi.fn(),
    deleteSessionPayload: vi.fn(),
}));

import { executeGeneration } from './generation.js';
import { abortNextEngine } from './nextEngine.js';
import { restoreSession } from './history.js';
import * as storage from './storage.js';

// ── Legacy-fixtures ────────────────────────────────────────────────────────
// Præcis som py_bridge.updateClass gemte dem før _rowId: rå CSV-rækker uden
// nogen intern nøgle, og referencer der peger på ID-kolonnens VÆRDI.

/** Ældste format: intet id_column, ingen separations, ingen columns. */
function oldestClass() {
    return {
        filename: 'gammel.csv',
        data: [
            { Navn: 'Anna', 'Køn': 'K' },
            { Navn: 'Bob', 'Køn': 'M' },
            { Navn: 'Clara', 'Køn': 'K' },
        ],
    };
}

/** Typisk klasse: id_column gemt, undgåelser og grupper med navne-strenge. */
function typicalLegacyClass() {
    return {
        filename: 'legacy.csv',
        columns: ['Navn', 'Køn', 'Niveau'],
        id_column: 'Navn',
        data: [
            { Navn: 'Anna', 'Køn': 'K', Niveau: 'Høj', _excluded: false },
            { Navn: 'Bob', 'Køn': 'M', Niveau: 'Lav', _excluded: true },
            { Navn: 'Clara', 'Køn': 'K', Niveau: 'Høj', _excluded: false },
            { Navn: 'David', 'Køn': 'M', Niveau: 'Middel', _excluded: false },
        ],
        separations: [{ ids: ['Anna', 'David'] }],
        rules: [],
    };
}

describe('migration — klasser gemt før _rowId', () => {
    it('ældste format (intet id_column) får stadig id-er', () => {
        const cls = oldestClass();
        const res = migrateRefsToRowIds(cls, cls.id_column, {});
        expect(res.rowIdsAdded).toBe(3);
        expect(new Set(cls.data.map(r => r[ROW_ID])).size).toBe(3);
    });

    it('oversætter undgåelser og bevarer fraværsmarkering', () => {
        const cls = typicalLegacyClass();
        migrateRefsToRowIds(cls, cls.id_column, { separations: cls.separations });

        const id = (n) => cls.data.find(r => r.Navn === n)[ROW_ID];
        expect(cls.separations[0].ids).toEqual([id('Anna'), id('David')]);
        // _excluded må ikke gå tabt under migreringen
        expect(cls.data.find(r => r.Navn === 'Bob')._excluded).toBe(true);
    });

    it('oversætter gemte, låste OG matrix-grupper i én kørsel', () => {
        const cls = typicalLegacyClass();
        const standard = [
            { name: 'Group 1', members: ['Anna', 'Bob'], locked: true, topic: 'Alpha' },
            { name: 'Group 2', members: ['Clara', 'David'] },
        ];
        const matrix = [{ name: 'M1', members: ['Anna', 'Clara'] }];

        migrateRefsToRowIds(cls, cls.id_column, { groupSets: [standard, matrix] });

        const id = (n) => cls.data.find(r => r.Navn === n)[ROW_ID];
        expect(standard[0].members.map(m => m.id)).toEqual([id('Anna'), id('Bob')]);
        expect(standard[1].members.map(m => m.id)).toEqual([id('Clara'), id('David')]);
        expect(matrix[0].members.map(m => m.id)).toEqual([id('Anna'), id('Clara')]);
        // Lås og emne overlever
        expect(standard[0].locked).toBe(true);
        expect(standard[0].topic).toBe('Alpha');
    });

    it('bevarer spøgelser fra en TIDLIGERE gendannelse ({id,name,isGhost})', () => {
        // restoreSession lagde objekter i members længe før denne ændring.
        const cls = typicalLegacyClass();
        const groups = [{
            name: 'G1',
            members: ['Anna', { id: 'Fraflyttet', name: 'Fraflyttet', isGhost: true }],
        }];
        migrateRefsToRowIds(cls, cls.id_column, { groupSets: [groups] });

        expect(groups[0].members[0].id).toBe(cls.data.find(r => r.Navn === 'Anna')[ROW_ID]);
        expect(groups[0].members[1].isGhost).toBe(true);
        expect(groups[0].members[1].name).toBe('Fraflyttet');
    });

    it('rører ikke __MatrixSource__ (dobbelt underscore = ægte input)', () => {
        const cls = typicalLegacyClass();
        cls.data.forEach((r, i) => { r.__MatrixSource__ = `kilde${i}`; });
        migrateRefsToRowIds(cls, cls.id_column, {});
        expect(cls.data[0].__MatrixSource__).toBe('kilde0');
    });

    it('håndterer en gammel ID-kolonne med TAL-værdier', () => {
        const cls = {
            columns: ['Elevnr', 'Navn'],
            id_column: 'Elevnr',
            data: [{ Elevnr: 101, Navn: 'Anna' }, { Elevnr: 102, Navn: 'Bob' }],
        };
        const separations = [{ ids: [101, 102] }];
        migrateRefsToRowIds(cls, cls.id_column, { separations });
        expect(separations[0].ids).toEqual([cls.data[0][ROW_ID], cls.data[1][ROW_ID]]);
    });

    // ── To elever med præcis samme navn ────────────────────────────────────
    // Det gamle format kunne ikke skelne dem: begge referencer sagde bare
    // "Anna". Id'erne uddeles derfor én ad gangen, så ingen elev bliver væk og
    // ingen står to steder på én gang.

    function twinClass() {
        return {
            columns: ['Navn'],
            id_column: 'Navn',
            data: [{ Navn: 'Anna' }, { Navn: 'Anna' }, { Navn: 'Bob' }],
        };
    }

    it('to ens navne i SAMME gruppe bliver til to forskellige elever', () => {
        const cls = twinClass();
        const groups = [{ name: 'G1', members: ['Anna', 'Anna'] }, { name: 'G2', members: ['Bob'] }];
        migrateRefsToRowIds(cls, cls.id_column, { groupSets: [groups] });

        // memberIdStr, ikke m.id: et medlem der ALLEREDE er migreret, og som
        // ikke har noget navn at bære med, bliver stående som den rene
        // id-streng det er.
        const ids = groups[0].members.map(memberIdStr);
        expect(new Set(ids).size).toBe(2);                   // ikke samme elev to gange
        expect(ids.sort()).toEqual([cls.data[0][ROW_ID], cls.data[1][ROW_ID]].sort());
    });

    it('to ens navne i HVER SIN gruppe fordeles på hver sin elev', () => {
        const cls = twinClass();
        const groups = [{ name: 'G1', members: ['Anna', 'Bob'] }, { name: 'G2', members: ['Anna'] }];
        migrateRefsToRowIds(cls, cls.id_column, { groupSets: [groups] });

        const g1 = groups[0].members.map(m => m.id);
        const g2 = groups[1].members.map(m => m.id);
        // Ingen elev optræder i to grupper samtidig …
        expect(g1.filter(x => g2.includes(x))).toEqual([]);
        // … og alle tre elever er placeret.
        expect([...g1, ...g2].sort()).toEqual(cls.data.map(r => r[ROW_ID]).sort());
    });

    it('stam- og matrixgrupper er to uafhængige opdelinger af de SAMME elever', () => {
        const cls = twinClass();
        const standard = [{ name: 'S1', members: ['Anna', 'Anna', 'Bob'] }];
        const matrix = [{ name: 'M1', members: ['Anna'] }, { name: 'M2', members: ['Anna', 'Bob'] }];
        migrateRefsToRowIds(cls, cls.id_column, { groupSets: [standard, matrix] });

        // Begge sæt dækker alle tre elever — puljen nulstilles mellem dem.
        expect(standard[0].members.map(m => m.id).sort())
            .toEqual(cls.data.map(r => r[ROW_ID]).sort());
        expect([...matrix[0].members, ...matrix[1].members].map(m => m.id).sort())
            .toEqual(cls.data.map(r => r[ROW_ID]).sort());
    });

    it('den samme elev må optræde i FLERE undgåelser', () => {
        const cls = twinClass();
        const separations = [{ ids: ['Anna', 'Bob'] }, { ids: ['Anna', 'Bob'] }];
        migrateRefsToRowIds(cls, cls.id_column, { separations });
        // Hver undgåelse er sin egen liste → begge peger på den samme (første) Anna.
        expect(separations[0].ids).toEqual(separations[1].ids);
    });

    it('én undgåelse med begge tvillinge-navne rammer to forskellige elever', () => {
        const cls = twinClass();
        const separations = [{ ids: ['Anna', 'Anna'] }];
        migrateRefsToRowIds(cls, cls.id_column, { separations });
        expect(new Set(separations[0].ids).size).toBe(2);
    });

    it('flere referencer end elever: den overskydende bliver et spøgelse', () => {
        const cls = twinClass();
        const groups = [{ name: 'G1', members: ['Anna', 'Anna', 'Anna'] }];
        migrateRefsToRowIds(cls, cls.id_column, { groupSets: [groups] });
        // memberIdStr, ikke m.id: et medlem der ALLEREDE er migreret, og som
        // ikke har noget navn at bære med, bliver stående som den rene
        // id-streng det er.
        const ids = groups[0].members.map(memberIdStr);
        expect(ids.slice(0, 2).sort()).toEqual([cls.data[0][ROW_ID], cls.data[1][ROW_ID]].sort());
        expect(ids[2]).toBe('Anna');            // uoversat → spøgelse
        expect(groups[0].members[2].name).toBe('Anna');
    });

    it('en delvist migreret gruppe uddeler ikke en allerede-taget elev igen', () => {
        const cls = twinClass();
        migrateRefsToRowIds(cls, cls.id_column, {});          // kun id-er
        const secondAnna = cls.data[1][ROW_ID];
        // Gruppen har ét migreret medlem (anden Anna) og én gammel navne-reference.
        const groups = [{ name: 'G1', members: [secondAnna, 'Anna'] }];
        migrateRefsToRowIds(cls, cls.id_column, { groupSets: [groups] });

        // memberIdStr, ikke m.id: et medlem der ALLEREDE er migreret, og som
        // ikke har noget navn at bære med, bliver stående som den rene
        // id-streng det er.
        const ids = groups[0].members.map(memberIdStr);
        expect(new Set(ids).size).toBe(2);
        expect(ids).toContain(secondAnna);
        expect(ids).toContain(cls.data[0][ROW_ID]);
    });

    it('kører kun én gang — anden indlæsning ændrer intet', () => {
        const cls = typicalLegacyClass();
        const groups = [{ name: 'G1', members: ['Anna', 'Bob'] }];
        migrateRefsToRowIds(cls, cls.id_column, { separations: cls.separations, groupSets: [groups] });
        const snapshot = JSON.stringify({ d: cls.data, s: cls.separations, g: groups });

        const second = migrateRefsToRowIds(cls, cls.id_column, { separations: cls.separations, groupSets: [groups] });
        expect(second).toEqual({ rowIdsAdded: 0, refsRemapped: 0 });
        expect(JSON.stringify({ d: cls.data, s: cls.separations, g: groups })).toBe(snapshot);
    });

    it('viser stadig elevens navn efter migrering', () => {
        const cls = typicalLegacyClass();
        const groups = [{ name: 'G1', members: ['Clara'] }];
        migrateRefsToRowIds(cls, cls.id_column, { groupSets: [groups] });
        expect(memberDisplayName(groups[0].members[0], cls.data, 'Navn')).toBe('Clara');
    });
});

describe('migration — gruppedannelse på en urørt legacy-klasse', () => {
    // Det, motoren får (appDebug.nextInput), læses, mens kørslen står og
    // venter på en tråd, der aldrig svarer — så afbrydes den.
    const inputFor = async () => {
        vi.stubGlobal('Worker', function FakeWorker() { this.postMessage = () => {}; this.terminate = () => {}; });
        window.appDebug = {};
        const run = executeGeneration(false);
        const input = window.appDebug.nextInput;
        abortNextEngine();
        await run;
        vi.unstubAllGlobals();
        return input;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        state.currentClass = typicalLegacyClass();
        state.currentClass.settings = { groupTarget: '2', groupMod: '+' };
        state.displayColumn = 'Navn';
        state.storedStandardGroups = null;
        state.storedMatrixGroups = null;
        state.activeView = 'standard';
        state.groupMode = 'size';
        state.isGenerating = false;
        window.notifyInfo = vi.fn();
        window.notifyError = vi.fn();
    });

    it('helbreder sig selv: id-er tildeles selvom klassen aldrig blev åbnet', async () => {
        const input = await inputFor();
        // Bob er fraværende og skal ikke med
        expect(input.students).toHaveLength(3);
        for (const row of input.students) expect(row[ROW_ID]).toMatch(ROW_ID_PATTERN);
    });

    it('en navne-baseret undgåelse virker stadig efter migreringen', async () => {
        const input = await inputFor();
        const id = (n) => state.currentClass.data.find(r => r.Navn === n)[ROW_ID];
        expect(input.agreements.avoid).toEqual([[id('Anna'), id('David')]]);
    });

    it('låste grupper med navne-medlemmer holder stadig deres elever ude', async () => {
        state.storedStandardGroups = [
            { name: 'Låst', members: ['Anna', 'Clara'], locked: true },
        ];
        const input = await inputFor();
        // Anna og Clara er låst, Bob er fraværende → kun David er fri
        const id = (n) => state.currentClass.data.find(r => r.Navn === n)[ROW_ID];
        expect(input.students.map(r => r[ROW_ID])).toEqual([id('David')]);
        expect(input.lockedGroups[0].members.sort()).toEqual([id('Anna'), id('Clara')].sort());
    });
});

describe('migration — historik-sessioner gemt før _rowId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        const cls = typicalLegacyClass();
        cls.data.forEach(r => { r._excluded = false; });
        state.currentClass = cls;
        state.displayColumn = 'Navn';
        state.storedStandardGroups = null;
        state.storedMatrixGroups = null;
        state.classViewTab = 'students';
        window.notifyInfo = vi.fn();
        window.notifyError = vi.fn();

        // Klassen er blevet åbnet (og dermed migreret) …
        migrateRefsToRowIds(cls, cls.id_column, { separations: cls.separations });
    });

    it('gendanner en gammel session hvor id-et VAR navnet', () => {
        // … men sessionen blev gemt dengang, hvor både id og navn var navnet.
        storage.loadSessionPayload.mockReturnValue({
            id: 's1', name: 'Gammel session', type: 'STANDARD_ONLY',
            groups: [
                { name: 'G1', members: [{ id: 'Anna', name: 'Anna' }, { id: 'Bob', name: 'Bob' }] },
                { name: 'G2', members: [{ id: 'Clara', name: 'Clara' }] },
            ],
            matrixGroups: [],
        });

        restoreSession('s1');

        const id = (n) => state.currentClass.data.find(r => r.Navn === n)[ROW_ID];
        const g1 = state.storedStandardGroups[0];
        // Navne-fallbacken har fundet eleverne og returneret deres _rowId
        expect(g1.members).toEqual([id('Anna'), id('Bob')]);
        expect(state.storedStandardGroups[1].members).toEqual([id('Clara')]);
    });

    it('en elev der er slettet siden, bliver et spøgelse med sit navn i behold', () => {
        storage.loadSessionPayload.mockReturnValue({
            id: 's2', name: 'Med fraflytter', type: 'STANDARD_ONLY',
            groups: [{ name: 'G1', members: [{ id: 'Anna', name: 'Anna' }, { id: 'Emil', name: 'Emil' }] }],
            matrixGroups: [],
        });

        restoreSession('s2');

        const ghost = state.storedStandardGroups[0].members.find(m => typeof m === 'object');
        expect(ghost.isGhost).toBe(true);
        expect(ghost.name).toBe('Emil');
        expect(memberDisplayName(ghost, state.currentClass.data, 'Navn')).toBe('Emil');
    });
});

describe('executeGeneration — fejl før den indre try', () => {
    it('slipper spinneren, hvis forberedelsen kaster', async () => {
        state.currentClass = typicalLegacyClass();
        state.currentClass.settings = { groupTarget: '2', groupMode: '+' };
        // Ødelagt rangering: columnOrders som getter, der kaster
        Object.defineProperty(state.currentClass, 'columnOrders', {
            get() { throw new Error('boom'); }, configurable: true,
        });
        state.currentClass.rules = [{ type: 'balance', column: 'Niveau' }];
        state.isGenerating = false;
        window.notifyError = vi.fn();
        await executeGeneration(false);
        expect(state.isGenerating).toBe(false);
    });
});
