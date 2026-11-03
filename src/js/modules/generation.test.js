import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state } from './state.js';

// Gruppedannelsen fra knapperne (generation.js) og de udgange, hvor der IKKE
// kommer grupper: læreren får en rolig besked, grupperne på skærmen står
// urørte, og historikken får intet skridt. Motoren selv (svaret, der lander)
// prøves i nextEngine.test.js og engineNext.test.js.
//
// (Indtil 3/11 2026 prøvede filen den gamle Python-motors vej: forberedelsen
// af reglerne, emnefordelingen og beskederne fra Python. Den vej er fjernet.)

vi.mock('./storage.js', () => ({
    saveGroupsToStorage: vi.fn(),
    saveTopic: vi.fn(() => true),
    getTopic: vi.fn(() => null),
    clearTopics: vi.fn(() => true),
    replaceTopicsForPrefix: vi.fn(() => true),
    populateDatalistFromStorage: vi.fn(),
    readTopicMap: vi.fn(() => ({})),
    replaceTopicMap: vi.fn(() => true),
    hydrateGroupTopics: vi.fn(),
}));

import { handleGenerate, executeGeneration, cancelGeneration, generateMatrixGroups } from './generation.js';
import { abortNextEngine } from './nextEngine.js';
import { listRuns, clearRuns } from './runHistory.js';

/** En tråd, der svarer med `answer` — eller aldrig, når den er undefined. */
function stubWorker(answer) {
    vi.stubGlobal('Worker', function FakeWorker() {
        this.terminate = () => {};
        this.postMessage = (msg) => {
            if (msg?.type !== 'run' || answer === undefined) return;
            queueMicrotask(() => this.onmessage?.({ data: { type: 'answer', answer } }));
        };
    });
}

function makeClass(extra = {}) {
    return {
        filename: 'test',
        data: [
            { _rowId: 'r1', Navn: 'Anna', Køn: 'K' },
            { _rowId: 'r2', Navn: 'Bob', Køn: 'M' },
            { _rowId: 'r3', Navn: 'Clara', Køn: 'K' },
            { _rowId: 'r4', Navn: 'David', Køn: 'M' },
        ],
        columns: ['Navn', 'Køn'],
        rules: [{ type: 'distribute', column: 'Køn' }],
        settings: { groupMode: 'size', groupTarget: '2', groupMod: '+' },
        separations: [],
        togetherGroups: [],
        ...extra,
    };
}

const OLD_GROUPS = () => [
    { name: 'Group 1', members: ['r1', 'r3'] },
    { name: 'Group 2', members: ['r2', 'r4'] },
];

beforeEach(() => {
    vi.clearAllMocks();
    clearRuns();
    state.currentClass = makeClass();
    state.storedStandardGroups = OLD_GROUPS();
    state.storedMatrixGroups = null;
    state.activeView = 'standard';
    state.groupMode = 'size';
    state.isGenerating = false;
    state.activeJobId = null;
    state.classViewTab = 'students';
    window.notifyInfo = vi.fn();
    window.notifyError = vi.fn();
});
afterEach(() => {
    abortNextEngine();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/** Alt er, som det var: grupperne, ingen kørsel i gang, intet i historikken. */
function expectNothingChanged() {
    expect(state.storedStandardGroups).toStrictEqual(OLD_GROUPS());
    expect(state.isGenerating).toBe(false);
    expect(state.activeJobId).toBeNull();
    expect(listRuns()).toHaveLength(0);
}

describe('handleGenerate — vagterne ved knappen', () => {
    it('gør intet uden en klasse', async () => {
        state.currentClass = null;
        stubWorker(undefined);
        await handleGenerate();
        expect(state.isGenerating).toBe(false);
    });

    it('starter ikke en ny kørsel oveni en, der er i gang', async () => {
        state.isGenerating = true;
        state.activeJobId = 'job-1';
        await handleGenerate();
        expect(state.activeJobId).toBe('job-1');
        state.isGenerating = false;
        state.activeJobId = null;
    });

    it('skifter til fanen med grupperne', async () => {
        stubWorker(undefined);
        handleGenerate();
        expect(state.classViewTab).toBe('groups');
    });

    it('kræver stamgrupper før matrix — fra både knappen og opskriften', async () => {
        state.activeView = 'matrix';
        state.storedStandardGroups = [];
        await handleGenerate();
        await generateMatrixGroups();
        expect(window.notifyInfo).toHaveBeenCalledTimes(2);
        expect(window.notifyInfo.mock.calls[0][0]).toMatch(/stamgrupper først/);
        expect(state.isGenerating).toBe(false);
    });
});

describe('ingen grupper: en rolig besked, og alt står urørt', () => {
    it('opsætningen kan ikke bruges ("unsupported"): motorens tekst siger, hvad der skal rettes', async () => {
        stubWorker({ contractVersion: 3, status: 'unsupported',
            reason: { code: 'invalid-input', text: 'Elever pr. gruppe skal være et helt tal fra 1 til 999.' } });
        await executeGeneration(false);
        expect(window.notifyInfo).toHaveBeenCalledWith('Grupperne blev ikke dannet. Elever pr. gruppe skal være '
            + 'et helt tal fra 1 til 999. Dine nuværende grupper er urørte.');
        expect(window.notifyError).not.toHaveBeenCalled();
        expectNothingChanged();
    });

    it('motoren fejler ("error"): en fejlbesked, men grupperne står', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        stubWorker({ contractVersion: 3, status: 'error', reason: { code: 'crash', text: 'Der skete en fejl inde i motoren.' } });
        await executeGeneration(false);
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/^Grupperne kunne ikke dannes: Der skete en fejl inde i motoren\. Dine nuværende grupper er urørte/));
        expectNothingChanged();
    });

    it('et svar, der bryder kontrakten, lægges ikke på skærmen', async () => {
        stubWorker({ contractVersion: 3, status: 'ok', groups: [{ members: ['r1'] }], messages: [], rules: [] });
        await executeGeneration(false);
        expect(window.notifyError).toHaveBeenCalled();
        expectNothingChanged();
    });

    it('alle elever i låste grupper', async () => {
        stubWorker(undefined);
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1', 'r2', 'r3', 'r4'], locked: true },
        ];
        await executeGeneration(false);
        expect(window.notifyInfo).toHaveBeenCalledWith('Alle elever er i låste grupper. Der er ingen nye grupper at danne.');
        expect(state.isGenerating).toBe(false);
    });

    it('ingen elever til stede', async () => {
        stubWorker(undefined);
        state.currentClass.data.forEach(r => { r._excluded = true; });
        await executeGeneration(false);
        expect(window.notifyInfo.mock.calls[0][0]).toMatch(/^Ingen elever er til stede/);
        expectNothingChanged();
    });

    it('antal grupper ikke større end de låste', async () => {
        stubWorker(undefined);
        state.groupMode = 'number';
        state.currentClass.settings = { groupMode: 'number', groupTarget: '1', groupMod: '+' };
        state.storedStandardGroups = [{ name: 'Group 1', members: ['r1', 'r2'], locked: true }];
        await executeGeneration(false);
        expect(window.notifyInfo).toHaveBeenCalledWith('Du har låst 1 gruppe, men beder om 1 gruppe i alt. '
            + 'Hæv antallet, eller lås en gruppe op.');
        expect(state.isGenerating).toBe(false);
    });

    it('noget kaster undervejs: overlayet slukkes, og grupperne står', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        Object.defineProperty(state.currentClass, 'columnOrders', { get() { throw new Error('boom'); }, configurable: true });
        await executeGeneration(false);
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/^Grupperne kunne ikke dannes/));
        expectNothingChanged();
    });
});

describe('cancelGeneration — udgangen ud af en lang kørsel', () => {
    it('Stop, mens motoren arbejder: den bedes om sin foreløbig bedste deling', async () => {
        stubWorker(undefined);
        const run = executeGeneration(false);
        expect(state.isGenerating).toBe(true);
        cancelGeneration();
        abortNextEngine();
        await run;
        expect(state.isGenerating).toBe(false);
        expect(state.storedStandardGroups).toStrictEqual(OLD_GROUPS());
    });

    it('gør ingenting, når der ikke er noget i gang', () => {
        cancelGeneration();
        expect(window.notifyInfo).not.toHaveBeenCalled();
    });
});
