// lockedMatrixNote.test.js — en låst matrixgruppe efter nye stamgrupper
// (135. gennemsyn, 14/11 2026).
//
// Motoren rører ikke en låst gruppe, og "én fra hver" gælder kun de frie
// elever. Låste læreren en matrixgruppe og dannede så stamgrupperne om, kom
// den låste gruppe med uændret ind i den nye matrix — måske med to elever fra
// samme NYE stamgruppe. Bagefter sagde intet det: matrixens aftryk regnes ud
// fra resultatet, så hverken "forældet" eller "Stamgrupperne er ændret" kom.
// Nu står en note under "Sidste dannelse".
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { tryNextEngine, abortNextEngine, buildEngineInput, lockedMatrixNote } from './nextEngine.js';
import { lockedMatrixDuplicates, matrixSourceById } from './utils.js';
import { setupNotices } from './setupNotices.js';
import { state } from './state.js';
import { clearRuns } from './runHistory.js';

if (window.happyDOM) window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;

const rows = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((id, i) => ({ _rowId: id, Navn: `E${i + 1}` }));

function makeClass(repType = 'group') {
    return {
        filename: 'laast-matrix.csv',
        data: rows.map(r => ({ ...r })),
        rules: [],
        matrixRules: [],
        topics: [],
        settings: { groupMode: 'size', groupTarget: 3, groupMod: '-' },
        matrixSettings: { matrixStrategy: 'full_strict', matrixRepresentationType: repType },
    };
}

// Stamgrupperne er dannet om: r1 og r2 står nu i SAMME stamgruppe.
const newHome = () => [
    { name: 'Group 1', members: ['r1', 'r2', 'r3'] },
    { name: 'Group 2', members: ['r4', 'r5', 'r6'] },
];

describe('lockedMatrixDuplicates', () => {
    const sources = matrixSourceById(newHome(), 'group');

    it('finder en låst gruppe med to fra samme kilde', () => {
        expect(lockedMatrixDuplicates([{ name: 'Group 1', members: ['r1', 'r2'] }], sources)).toEqual(['Group 1']);
    });

    it('tier om en låst gruppe med én fra hver', () => {
        expect(lockedMatrixDuplicates([{ name: 'Group 1', members: ['r1', 'r4'] }], sources)).toEqual([]);
    });

    it('en elev uden stamgruppe giver ingen dublet', () => {
        expect(lockedMatrixDuplicates([{ name: 'Group 1', members: ['r1', 'x9', 'x8'] }], sources)).toEqual([]);
    });
});

describe('lockedMatrixNote', () => {
    const inputWith = (locked, repType = 'group') => buildEngineInput({
        cls: makeClass(repType), isMatrix: true, groupMode: 'size',
        viewGroups: locked, homeGroups: newHome(),
    });

    it('siger det om en låst matrixgruppe med to fra samme stamgruppe', () => {
        const text = lockedMatrixNote(inputWith([{ name: 'Group 2', members: ['r1', 'r2'], locked: true }]));
        expect(text).toMatch(/^Den låste matrixgruppe Gruppe 2 har to eller flere elever fra samme stamgruppe/);
        expect(text).toMatch(/lås den op/);
    });

    it('nævner flere grupper', () => {
        const text = lockedMatrixNote(inputWith([
            { name: 'Group 1', members: ['r1', 'r2'], locked: true },
            { name: 'Group 3', members: ['r4', 'r5'], locked: true },
        ]));
        expect(text).toMatch(/^De låste matrixgrupper Gruppe 1 og Gruppe 3 har/);
    });

    it('siger "samme emne", når kilden er emnerne', () => {
        const text = lockedMatrixNote(inputWith([{ name: 'Group 2', members: ['r1', 'r2'], locked: true }], 'topic'));
        expect(text).toMatch(/fra samme emne/);
    });

    it('tier om en låst gruppe, der passer, og uden låste grupper', () => {
        expect(lockedMatrixNote(inputWith([{ name: 'Group 2', members: ['r1', 'r4'], locked: true }]))).toBeNull();
        expect(lockedMatrixNote(inputWith([]))).toBeNull();
    });

    it('en fraværende tæller ikke med', () => {
        const input = buildEngineInput({
            cls: { ...makeClass(), data: rows.map(r => ({ ...r, _excluded: r._rowId === 'r2' })) },
            isMatrix: true, groupMode: 'size',
            viewGroups: [{ name: 'Group 2', members: ['r1', 'r2'], locked: true }], homeGroups: newHome(),
        });
        expect(lockedMatrixNote(input)).toBeNull();
    });
});

// Hele vejen: "Dan matrixen igen" med en låst, gammel matrixgruppe.
describe('en matrix lander med en låst gruppe fra de forrige stamgrupper', () => {
    let workers = [];
    beforeEach(() => {
        localStorage.clear();
        workers = [];
        vi.stubGlobal('Worker', function FakeWorker() {
            const w = { posted: [], terminate() {}, postMessage(m) { this.posted.push(m); } };
            workers.push(w);
            return w;
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        window.notifyInfo = vi.fn();
        window.notifyError = vi.fn();
        state.groupMode = 'size';
        state.activeView = 'matrix';
    });
    afterEach(() => {
        abortNextEngine();
        clearRuns();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        state.currentClass = null;
        state.storedStandardGroups = [];
        state.storedMatrixGroups = null;
        state.matrixGroupsStale = false;
        state.isGenerating = false;
        state.activeJobId = null;
    });

    it('noten står under "Sidste dannelse", og matrixen er ikke længere forældet', async () => {
        state.currentClass = makeClass();
        state.storedStandardGroups = newHome();
        // Låst, da r1 og r2 kom fra hver sin (den gamle) stamgruppe.
        state.storedMatrixGroups = [
            { name: 'Group 1', members: ['r1', 'r2'], locked: true },
            { name: 'Group 2', members: ['r3', 'r4'] },
            { name: 'Group 3', members: ['r5', 'r6'] },
        ];
        state.matrixGroupsStale = true;

        const done = tryNextEngine(true);
        const worker = workers.filter(w => w.posted.some(m => m.type === 'run')).at(-1);
        worker.onmessage({ data: { type: 'answer', answer: {
            contractVersion: 3, status: 'ok',
            groups: [{ members: ['r3', 'r5'] }, { members: ['r4', 'r6'] }],
            lockedTopics: {}, messages: [], rules: [], playback: null,
        } } });
        expect(await done).toBe('done');

        expect(state.storedMatrixGroups.find(g => g.name === 'Group 1').members).toEqual(['r1', 'r2']);
        expect(state.matrixGroupsStale).toBe(false);
        const notes = setupNotices.last.matrix.map(n => n.text);
        expect(notes).toContainEqual(expect.stringMatching(/^Den låste matrixgruppe Gruppe 1 har to eller flere/));
    });
});
