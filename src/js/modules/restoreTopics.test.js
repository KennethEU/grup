// restoreTopics.test.js — emnerne, når en GENDANNELSE ikke kan gemme
// emnekortet (gennemsyn 85, 10/11 2026).
//
// Samme løfte som landTopics.test.js giver ved en kørsel: emnekortet
// (grupdk_topics_<fil>) er den kilde, alt andet læser emnerne fra — matrix-
// rundens kilder, eksporten, Vis for klassen, udskriften, en genindlæsning OG
// en session, der gemmes bagefter (snapshotGroups: getTopic || g.topic).
// Kan gendannelsen ikke skrive det nye kort, står det FORRIGE kort tilbage
// med de samme gruppenavne. Før beholdt grupperne sessionens emner, mens
// alt andet læste de gamle — og en session gemt lige bagefter fik de gamle
// emner med, uden at nogen kunne se det.
//
// Løftet: grupperne har præcis de emner, der står i lageret, og beskeden
// siger, hvad der står.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { state } from './state.js';
import * as storage from './storage.js';
import { restoreSession, saveCurrentSession } from './history.js';
import { applyPlan } from './restoreGroups.js';
import { restoreRun, clearRuns, pushRun } from './runHistory.js';
import { tryNextEngine, abortNextEngine, buildEngineInput } from './nextEngine.js';

if (window.happyDOM) window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;

const FILE = 'emner-gendannelse.csv';
const topicKey = 'grupdk_topics_' + FILE;

function makeClass(topics = ['Klima', 'Migration']) {
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
        topics,
        settings: { groupMode: 'size', groupTarget: 2, groupMod: '-' },
        matrixSettings: { matrixStrategy: 'full_strict', matrixRepresentationType: 'topic' },
    };
}

// Lageret, som det står før gendannelsen: "Group 1" har Klima, "Group 2" Migration.
function seedCurrent() {
    state.storedStandardGroups = [
        { name: 'Group 1', members: ['r1', 'r2'], locked: false, topic: 'Klima' },
        { name: 'Group 2', members: ['r3', 'r4'], locked: false, topic: 'Migration' },
    ];
    expect(storage.replaceTopicsForPrefix('S_', state.storedStandardGroups)).toBe(true);
    storage.saveGroupsToStorage();
}

// En gemt session, hvor emnerne står omvendt.
function seedSession({ withMatrix = false } = {}) {
    const session = {
        id: 'sess-1', name: 'Uge 45', date: new Date().toISOString(),
        type: withMatrix ? 'WITH_MATRIX' : 'STANDARD_ONLY',
        groups: [
            { name: 'Group 1', members: [{ id: 'r1', name: 'Ida' }, { id: 'r3', name: 'Ali' }], locked: false, topic: 'Migration' },
            { name: 'Group 2', members: [{ id: 'r2', name: 'Bo' }, { id: 'r4', name: 'Eva' }], locked: false, topic: 'Klima' },
        ],
        matrixGroups: withMatrix ? [
            { name: 'Group 1', members: [{ id: 'r1', name: 'Ida' }, { id: 'r2', name: 'Bo' }], locked: false, topic: 'Migration' },
            { name: 'Group 2', members: [{ id: 'r3', name: 'Ali' }, { id: 'r4', name: 'Eva' }], locked: false, topic: 'Klima' },
        ] : [],
    };
    expect(storage.saveSessionPayload(session)).not.toBe(false);
    return session.id;
}

function rejectTopicWrites({ onlyFirst = false } = {}) {
    const setItem = localStorage.setItem.bind(localStorage);
    let rejected = 0;
    return vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
        if (key === topicKey && (!onlyFirst || rejected === 0)) {
            rejected++;
            throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' });
        }
        setItem(key, value);
    });
}

const groupTopics = (groups = state.storedStandardGroups) => groups.map(g => g.topic ?? null);
// Hvad kortet på skærmen viser, når klassen har emner (GroupCard.topicDisplay).
const shownTopics = (groups = state.storedStandardGroups, prefix = 'S_') =>
    groups.map(g => g.topic || storage.getTopic(g.name, prefix) || null);
// Hvad læserne, der går kortet-først (eksport, Vis for klassen, udskrift), ser.
const mapFirst = (groups = state.storedStandardGroups, prefix = 'S_') =>
    groups.map(g => storage.getTopic(g.name, prefix) || g.topic || null);
function matrixSourceTopics() {
    const input = buildEngineInput({
        cls: state.currentClass, isMatrix: true, groupMode: 'size',
        homeGroups: state.storedStandardGroups,
        topicFor: (name) => storage.getTopic(name, 'S_'),
    });
    return input.matrix.homeGroups.map(g => g.topic);
}
// Gem en session lige nu og læs dens stamgruppe-emner (snapshotGroups).
function savedSessionTopics(withMatrix = false) {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    saveCurrentSession('Efter gendannelsen', withMatrix);
    const meta = storage.getHistory().find(s => s.name === 'Efter gendannelsen');
    const payload = storage.loadSessionPayload(meta.id);
    return {
        standard: payload.groups.map(g => g.topic || null),
        matrix: payload.matrixGroups.map(g => g.topic || null),
    };
}

beforeEach(() => {
    localStorage.clear();
    // Gendannelsen gemmer også klassen (autoSave → PUT /api/classes/<fil>).
    // I appen svarer api_adapter.js på det i browseren; her er den ikke
    // sat op, så kaldet gik ud på nettet til localhost:3000 — en rigtig
    // server på udviklerens maskine — og blev afbrudt ved testens slutning
    // ("2 unhandled errors" i hele vitest-kørslen, set 11/11). Klassen er
    // ikke det, testene her handler om, så svaret er bare "gemt".
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"success":true}',
        { status: 200, headers: { 'Content-Type': 'application/json' } })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.notifyInfo = vi.fn();
    window.notifyError = vi.fn();
    window.notifySuccess = vi.fn();
    state.currentClass = makeClass();
    state.groupMode = 'size';
    state.displayColumn = 'Navn';
    state.storedStandardGroups = [];
    state.storedMatrixGroups = null;
    state.matrixGroupsStale = false;
});

afterEach(() => {
    abortNextEngine();
    clearRuns();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    state.currentClass = null;
    state.storedStandardGroups = [];
    state.storedMatrixGroups = null;
    state.isGenerating = false;
    state.activeJobId = null;
});

describe('Hent session, og emnekortet kan ikke skrives', () => {
    it('de gamle emner fjernes i stedet: alt står uden emne, også en session gemt bagefter', () => {
        seedCurrent();
        const id = seedSession();
        rejectTopicWrites({ onlyFirst: true });
        restoreSession(id);

        expect(groupTopics()).toEqual([null, null]);
        expect(shownTopics()).toEqual([null, null]);
        expect(mapFirst()).toEqual([null, null]);
        expect(matrixSourceTopics()).toEqual([null, null]);
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/står uden emne/));
        // Grupperne selv er gemt — beskeden må ikke sige, at de er væk.
        expect(window.notifyError).not.toHaveBeenCalledWith(expect.stringMatching(/væk, når du genindlæser/));
        expect(savedSessionTopics().standard).toEqual([null, null]);
    });

    it('kan heller ikke de gamle fjernes, står grupperne med dem — overalt, og beskeden siger det', () => {
        seedCurrent();
        const id = seedSession();
        rejectTopicWrites();
        restoreSession(id);

        expect(groupTopics()).toEqual(['Klima', 'Migration']);
        expect(shownTopics()).toEqual(groupTopics());
        expect(mapFirst()).toEqual(groupTopics());
        expect(matrixSourceTopics()).toEqual(groupTopics());
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/emnerne fra før/));
        expect(savedSessionTopics().standard).toEqual(['Klima', 'Migration']);
    });

    it('matrixgrupperne følger samme regel', () => {
        seedCurrent();
        storage.replaceTopicsForPrefix('M_', [{ name: 'Group 1', topic: 'Klima' }, { name: 'Group 2', topic: 'Migration' }]);
        const id = seedSession({ withMatrix: true });
        rejectTopicWrites();
        restoreSession(id);

        const matrix = state.storedMatrixGroups;
        expect(groupTopics(matrix)).toEqual(['Klima', 'Migration']);
        expect(shownTopics(matrix, 'M_')).toEqual(groupTopics(matrix));
        expect(mapFirst(matrix, 'M_')).toEqual(groupTopics(matrix));
        expect(savedSessionTopics(true).matrix).toEqual(['Klima', 'Migration']);
    });

    it('alt går: sessionens emner overalt, ingen fejlbesked', () => {
        seedCurrent();
        restoreSession(seedSession());
        expect(groupTopics()).toEqual(['Migration', 'Klima']);
        expect(mapFirst()).toEqual(['Migration', 'Klima']);
        expect(window.notifyError).not.toHaveBeenCalled();
    });
});

describe('Gendan grupper (indsat liste), og emnekortet kan ikke skrives', () => {
    const plan = () => ({
        markAbsent: false,
        groups: [
            { name: 'Group 1', topic: 'Migration', explicitTopic: true, members: [{ rowId: 'r1' }, { rowId: 'r3' }] },
            { name: 'Group 2', topic: 'Klima', explicitTopic: true, members: [{ rowId: 'r2' }, { rowId: 'r4' }] },
        ],
    });

    it('de gamle emner fjernes i stedet, og beskeden siger "uden emne" — ikke at grupperne er væk', () => {
        seedCurrent();
        rejectTopicWrites({ onlyFirst: true });
        expect(applyPlan(plan())).toBe(true);

        expect(groupTopics()).toEqual([null, null]);
        expect(mapFirst()).toEqual([null, null]);
        expect(matrixSourceTopics()).toEqual([null, null]);
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/står uden emne/));
        expect(window.notifyError).not.toHaveBeenCalledWith(expect.stringMatching(/ikke gemt/));
    });

    it('kan heller ikke de gamle fjernes, står grupperne med dem overalt', () => {
        seedCurrent();
        rejectTopicWrites();
        expect(applyPlan(plan())).toBe(true);

        expect(groupTopics()).toEqual(['Klima', 'Migration']);
        expect(mapFirst()).toEqual(groupTopics());
        expect(matrixSourceTopics()).toEqual(groupTopics());
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/emnerne fra før/));
    });
});

describe('Kørselsmenuen: kun emnerne kunne ikke gemmes', () => {
    it('restoreRun siger, at grupperne er gemt, men emnerne ikke', () => {
        seedCurrent();
        pushRun();
        // Ny fordeling oven på, så kørslen ovenfor er den, der hentes.
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r1', 'r3'], locked: false, topic: 'Migration' },
            { name: 'Group 2', members: ['r2', 'r4'], locked: false, topic: 'Klima' },
        ];
        storage.replaceTopicsForPrefix('S_', state.storedStandardGroups);
        rejectTopicWrites();
        const result = restoreRun(0);
        expect(result.saved).toBe(false);
        expect(result.groupsSaved).toBe(true);
        expect(result.topicsSaved).toBe(false);
        // Skærm og lager er enige (restoreRun hydrerer fra lageret).
        expect(groupTopics()).toEqual(mapFirst());
    });
});
