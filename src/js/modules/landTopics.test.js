// landTopics.test.js — emnerne, når en kørsel lander, og lageret er fuldt
// (gennemsyn 84, 10/11 2026).
//
// Emnekortet (grupdk_topics_<fil>) er den kilde, ALT andet læser emnerne
// fra: kortet på skærmen (GroupCard: group.topic || getTopic), matrix-
// rundens kilder (topicFor i engineInputNow), Vis for klassen, eksporten og
// en genindlæsning (hydrateGroupTopics). Kan landAnswer ikke skrive det nye
// kort, står det FORRIGE kort tilbage — med de samme gruppenavne ("Group 1"
// …). Før satte landAnswer så topic: null på grupperne og sagde "står uden
// emne", men skærmen, matrix og genindlæsningen viste den forrige kørsels
// emner på de nye grupper. Løftet her: hvad grupperne har som emne, er
// præcis det, der står i lageret — og beskeden siger det, der faktisk står.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { tryNextEngine, abortNextEngine, buildEngineInput } from './nextEngine.js';
import { state } from './state.js';
import * as storage from './storage.js';
import { clearRuns } from './runHistory.js';

if (window.happyDOM) window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;

const FILE = 'emner-fuldt-lager.csv';
const topicKey = 'grupdk_topics_' + FILE;

function makeClass(topics) {
    return {
        filename: FILE,
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

let workers = [];
function stubWorkers() {
    workers = [];
    vi.stubGlobal('Worker', function FakeWorker() {
        const w = { posted: [], terminate() {}, postMessage(m) { this.posted.push(m); } };
        workers.push(w);
        return w;
    });
}
const lastRunWorker = () => workers.filter(w => w.posted.some(m => m.type === 'run')).at(-1);

async function land(groups) {
    const done = tryNextEngine(false);
    lastRunWorker().onmessage({ data: { type: 'answer', answer: {
        contractVersion: 3, status: 'ok', groups, lockedTopics: {},
        messages: [], rules: [{ rule: 0, met: true }], playback: null,
    } } });
    expect(await done).toBe('done');
}

// Afvis skrivninger af emnekortet: alle, eller kun den første.
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

// Det, matrix-runden ville få som kilder lige nu (som engineInputNow).
function matrixTopics() {
    const input = buildEngineInput({
        cls: state.currentClass, isMatrix: true, groupMode: 'size',
        homeGroups: state.storedStandardGroups,
        topicFor: (name) => storage.getTopic(name, 'S_'),
    });
    return input.matrix.homeGroups.map(g => g.topic);
}

// Hvad kortet på skærmen viser, når klassen har emner (GroupCard.topicDisplay).
const shownTopics = () => state.storedStandardGroups.map(g => g.topic || storage.getTopic(g.name, 'S_') || null);
const groupTopics = () => state.storedStandardGroups.map(g => g.topic ?? null);

beforeEach(() => {
    localStorage.clear();
    stubWorkers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.notifyInfo = vi.fn();
    window.notifyError = vi.fn();
    state.groupMode = 'size';
    state.storedStandardGroups = [];
    state.storedMatrixGroups = null;
});

afterEach(() => {
    abortNextEngine();
    clearRuns();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    state.currentClass = null;
    state.storedStandardGroups = [];
    state.isGenerating = false;
    state.activeJobId = null;
});

describe('nye emner kan ikke gemmes', () => {
    it('de gamle emner fjernes i stedet: grupperne, skærmen og matrix står alle uden emne, som beskeden siger', async () => {
        state.currentClass = makeClass(['Klima', 'Migration']);
        await land([{ members: ['r1', 'r2'], topic: 'Klima' }, { members: ['r3', 'r4'], topic: 'Migration' }]);
        expect(groupTopics()).toEqual(['Klima', 'Migration']);

        // Næste kørsel: det nye kort afvises (kun den første skrivning).
        rejectTopicWrites({ onlyFirst: true });
        await land([{ members: ['r1', 'r3'], topic: 'Migration' }, { members: ['r2', 'r4'], topic: 'Klima' }]);

        expect(groupTopics()).toEqual([null, null]);
        expect(shownTopics()).toEqual([null, null]);
        expect(matrixTopics()).toEqual([null, null]);
        expect(JSON.parse(localStorage.getItem(topicKey))).toEqual({});
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/står uden emne/));
    });

    it('kan heller ikke de gamle fjernes, står grupperne med dem — og beskeden siger det', async () => {
        state.currentClass = makeClass(['Klima', 'Migration']);
        await land([{ members: ['r1', 'r2'], topic: 'Klima' }, { members: ['r3', 'r4'], topic: 'Migration' }]);

        rejectTopicWrites();
        await land([{ members: ['r1', 'r3'], topic: 'Migration' }, { members: ['r2', 'r4'], topic: 'Klima' }]);

        // Det, der står i lageret, er det, grupperne har — ét svar overalt.
        expect(groupTopics()).toEqual(['Klima', 'Migration']);
        expect(shownTopics()).toEqual(groupTopics());
        expect(matrixTopics()).toEqual(groupTopics());
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/forrige dannelse/));
        expect(window.notifyError).not.toHaveBeenCalledWith(expect.stringMatching(/står uden emne/));
    });
});

describe('klassen har ikke længere emner, og de gamle kan ikke fjernes', () => {
    it('grupperne står med de gamle emner, så skærmen og matrix er enige — og beskeden siger det', async () => {
        state.currentClass = makeClass(['Klima', 'Migration']);
        await land([{ members: ['r1', 'r2'], topic: 'Klima' }, { members: ['r3', 'r4'], topic: 'Migration' }]);

        state.currentClass.topics = [];
        rejectTopicWrites();
        await land([{ members: ['r1', 'r3'] }, { members: ['r2', 'r4'] }]);

        expect(groupTopics()).toEqual(['Klima', 'Migration']);
        expect(matrixTopics()).toEqual(groupTopics());
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/står stadig på grupperne/));
    });
});

describe('en matrix-runde lander, og emnekortet har matrix-emner fra før', () => {
    // Matrix-emner kommer fra en hentet session eller et emne valgt på et
    // matrixkort. Motoren giver ikke matrixgrupperne emner, så de nye "Group 1"
    // og "Group 2" arvede før de gamle emner fra kortet — på skærmen
    // (GroupCard: group.topic || getTopic), i eksporten og efter en genindlæsning.
    async function landMatrix(groups) {
        const done = tryNextEngine(true);
        lastRunWorker().onmessage({ data: { type: 'answer', answer: {
            contractVersion: 3, status: 'ok', groups, lockedTopics: {},
            messages: [], rules: [], playback: null,
        } } });
        expect(await done).toBe('done');
    }
    const matrixShown = () => state.storedMatrixGroups.map(g => g.topic || storage.getTopic(g.name, 'M_') || null);

    it('de nye matrixgrupper står uden de gamle emner', async () => {
        state.currentClass = makeClass(['Klima', 'Migration']);
        await land([{ members: ['r1', 'r2'], topic: 'Klima' }, { members: ['r3', 'r4'], topic: 'Migration' }]);
        storage.replaceTopicsForPrefix('M_', [{ name: 'Group 1', topic: 'Migration' }, { name: 'Group 2', topic: 'Klima' }]);

        await landMatrix([{ members: ['r1', 'r3'] }, { members: ['r2', 'r4'] }]);

        expect(matrixShown()).toEqual([null, null]);
        expect(Object.keys(JSON.parse(localStorage.getItem(topicKey))).filter(k => k.startsWith('M_'))).toEqual([]);
        // Stamgruppernes emner er urørte.
        expect(groupTopics()).toEqual(['Klima', 'Migration']);
        expect(storage.getTopic('Group 1', 'S_')).toBe('Klima');
        expect(window.notifyError).not.toHaveBeenCalled();
    });

    it('kan de gamle ikke fjernes, står de på grupperne — og beskeden siger det', async () => {
        state.currentClass = makeClass(['Klima', 'Migration']);
        await land([{ members: ['r1', 'r2'], topic: 'Klima' }, { members: ['r3', 'r4'], topic: 'Migration' }]);
        storage.replaceTopicsForPrefix('M_', [{ name: 'Group 1', topic: 'Migration' }, { name: 'Group 2', topic: 'Klima' }]);

        rejectTopicWrites();
        await landMatrix([{ members: ['r1', 'r3'] }, { members: ['r2', 'r4'] }]);

        expect(state.storedMatrixGroups.map(g => g.topic)).toEqual(['Migration', 'Klima']);
        expect(matrixShown()).toEqual(['Migration', 'Klima']);
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/matrixgrupperne/));
    });
});
