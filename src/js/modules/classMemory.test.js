// Værn om det, et klasseskift SKAL rydde.
//
// Hver test her svarer til noget, der overlevede skiftet, indtil
// clearClassMemory() samlede listen ét sted. Fejler en af dem, er der igen
// noget fra den forrige klasse, der beskriver den klasse, læreren kigger på.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state, pushUndo, canUndo } from './state.js';
import { clearClassMemory } from './classMemory.js';
import * as replay from './replay.js';

// storage.js rører localStorage gennem py_bridge; her handler testene kun om
// state, så lageret stubbes væk.
vi.mock('./storage.js', () => ({
    readTopicMap: () => ({}),
    replaceTopicMap: () => true,
    hydrateGroupTopics: () => {},
    saveGroupsToStorage: () => true,
    getTopic: () => null,
}));

function makeClass(filename = '2a') {
    return {
        filename,
        name: filename,
        data: [{ _rowId: 'r1', Navn: 'Anna' }, { _rowId: 'r2', Navn: 'Bo' }],
        columns: ['Navn'],
        rules: [], matrixRules: [],
        settings: {}, matrixSettings: {},
        separations: [], topics: [],
    };
}

// En optagelse med to uddelinger — nok til at afspilleren kan startes.
const recording = {
    runs: [{ seed: [[], []], deal: [['r1', 0], ['r2', 1]], events: [] }],
    best_run_index: 0,
};

beforeEach(() => {
    state.currentClass = makeClass();
    state.displayColumn = 'Navn';
    state.storedStandardGroups = null;
    state.storedMatrixGroups = null;
});

describe('clearClassMemory', () => {
    it('rydder flaget der ellers ville danne den næste klasses matrix om', () => {
        // Læreren danner stamgrupper i 2.a: matrixen er nu forældet DÉR.
        state.matrixGroupsStale = true;

        clearClassMemory();

        // Flaget må ikke følge med over i 3.b — switchGroupMode() ville se det
        // og danne 3.b's matrix om oven i den, læreren havde rettet i hånden.
        expect(state.matrixGroupsStale).toBe(false);
    });

    it('rydder optagelsen og dens aftryk', () => {
        state.lastRecording = { standard: recording, matrix: null };
        state.lastRecordingFingerprint = { standard: 'Gruppe 1::r1,r2', matrix: null };

        clearClassMemory();

        expect(state.lastRecording).toEqual({ standard: null, matrix: null });
        expect(state.lastRecordingFingerprint).toEqual({ standard: null, matrix: null });
    });

    it('stopper en afspilning der er i gang', () => {
        expect(replay.start(recording, ['Gruppe 1', 'Gruppe 2'], [], 'standard')).toBe(true);
        replay.play();
        expect(state.replay).not.toBeNull();

        clearClassMemory();

        expect(state.replay).toBeNull();
    });

    it('sætter visningen tilbage til stamgrupper', () => {
        state.activeView = 'matrix';
        clearClassMemory();
        // Matrix-knappen tegnes kun i en klasse med stamgrupper. Blev visningen
        // stående, mødte læreren et matrix-bånd uden en knap, der så valgt ud.
        expect(state.activeView).toBe('standard');
    });

    it('rydder forhåndsvisningen af en tidligere kørsel', () => {
        state.previewRunIndex = 0;
        clearClassMemory();
        expect(state.previewRunIndex).toBeNull();
    });

    it('rydder fortryd-stakken, kørselshistorikken og markeringen', () => {
        pushUndo();
        state._runHistory.push({ classFile: '2a' });
        state.matrixSourceFingerprint = 'noget';
        state._lastGeneratedFingerprint = 'noget';
        state._lastRunInputs = { rules: [] };
        state.selectedForAction.add('r1');

        clearClassMemory();

        expect(canUndo()).toBe(false);
        expect(state._runHistory.length).toBe(0);
        expect(state.matrixSourceFingerprint).toBeNull();
        expect(state._lastGeneratedFingerprint).toBeNull();
        expect(state._lastRunInputs).toBeNull();
        expect(state.selectedForAction.size).toBe(0);
    });

    it('lukker Aftaler-vinduet og stiller fanen tilbage', () => {
        // Vinduet viser den AKTUELLE klasses aftaler. Blev det stående åbent
        // hen over et skifte, stod læreren med en liste, hun ikke havde bedt
        // om — og på den fane, den forrige klasse efterlod.
        state.showAgreementsModal = true;
        state.agreementTab = 'separate';

        clearClassMemory();

        expect(state.showAgreementsModal).toBe(false);
        expect(state.agreementTab).toBe('together');
    });
});
