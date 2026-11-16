// nextEngineRaces.test.js — appens brug af motoren, når tingene sker i en
// uheldig rækkefølge (gennemsyn 4/11 2026):
//   1. Stop, mens appen spørger serveren om en ny udgave, og en ny kørsel
//      oveni — den gamle kørsel må ikke slukke den nye.
//   2. check() med en besked, der ikke kan læses — ingen advarsler hellere
//      end en computed, der kaster.
//   3. To klasser med samme input (en kopi) — check() skal spørges igen ved
//      klasseskiftet.
// Egen fil, så check()-trådens modul-tilstand (checkWorker) er frisk.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { tryNextEngine, abortNextEngine, engineCheck, engineTogetherStop, dropIdleEngineWorker } from './nextEngine.js';
import { cancelGeneration } from './generation.js';
import { state } from './state.js';
import { clearRuns } from './runHistory.js';

// Hovedfil-scriptet nedenfor er kun et mærke til checkForNewBuild. happy-dom
// prøver at hente det og skriver en lang fejl, når det ikke må (som i
// newBuild.test.js).
if (window.happyDOM) window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;

function makeClass(filename) {
    return {
        filename,
        data: [
            { _rowId: 'r1', Navn: 'Ida', Køn: 'Pige' },
            { _rowId: 'r2', Navn: 'Bo', Køn: 'Dreng' },
            { _rowId: 'r3', Navn: 'Ali', Køn: 'Pige' },
            { _rowId: 'r4', Navn: 'Eva', Køn: 'Dreng' },
        ],
        rules: [{ type: 'distribute', column: 'Køn' }],
        settings: { groupMode: 'size', groupTarget: 2, groupMod: '-' },
    };
}

// Alle falske tråde, i den rækkefølge de blev startet. check()-tråden og
// kørslens tråd er begge "new Worker", så de skelnes på det, de har fået.
// check()-tråden startes kun én gang pr. fil og lever videre mellem testene,
// så den findes i allWorkers, der aldrig nulstilles.
let workers = [];
const allWorkers = [];
function stubWorkers() {
    workers = [];
    vi.stubGlobal('Worker', function FakeWorker() {
        const w = {
            posted: [],
            terminated: false,
            terminate() { this.terminated = true; },
            postMessage(m) { this.posted.push(m); },
        };
        workers.push(w);
        allWorkers.push(w);
        return w;
    });
}
const runWorkers = () => workers.filter(w => w.posted.some(m => m.type === 'run'));
const checkWorkerNow = () => allWorkers.find(w => w.posted.some(m => m.type === 'check'));
const lastCheck = (w) => w.posted.filter(m => m.type === 'check').at(-1);

async function flush(times = 5) {
    for (let i = 0; i < times; i++) await Promise.resolve();
}

afterEach(() => {
    abortNextEngine();
    dropIdleEngineWorker();
    clearRuns();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.querySelectorAll('script[data-test-entry]').forEach(el => el.remove());
    state.currentClass = null;
    state.storedStandardGroups = [];
    state.isGenerating = false;
    state.activeJobId = null;
});

describe('Stop, mens appen spørger om en ny udgave', () => {
    it('den gamle kørsel slukker ikke en ny kørsel, og den nye kørsels grupper lander', async () => {
        stubWorkers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        window.notifyInfo = vi.fn();
        window.notifyError = vi.fn();

        // Siden kører en bygget udgave (en hovedfil), så checkForNewBuild
        // spørger serveren — og svaret lader vente på sig.
        const entry = document.createElement('script');
        entry.type = 'module';
        entry.src = '/assets/index-gammel.js';
        entry.dataset.testEntry = '1';
        document.head.appendChild(entry);
        let answerFetch;
        const fetchMock = vi.fn(() => new Promise((resolve) => { answerFetch = resolve; }));
        vi.stubGlobal('fetch', fetchMock);

        state.currentClass = makeClass('stop-under-hentning');
        state.groupMode = 'size';
        state.storedStandardGroups = [];

        // Kørsel 1: motoren fejler, og appen spørger om en ny udgave.
        const first = tryNextEngine(false);
        const firstWorker = runWorkers()[0];
        firstWorker.onmessage({ data: { type: 'crash', message: 'motor-filen manglede' } });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(state.isGenerating).toBe(true);

        // Læreren trykker Stop (overlayet viser stadig Stop) og danner igen.
        cancelGeneration();
        expect(state.isGenerating).toBe(false);
        const second = tryNextEngine(false);
        const secondJob = state.activeJobId;
        expect(secondJob).not.toBe(null);

        // Serveren svarer: samme udgave. Kørsel 1 må ikke røre noget nu.
        answerFetch(new Response('<script type="module" src="/assets/index-gammel.js"></script>', {
            status: 200, headers: { 'content-type': 'text/html' },
        }));
        expect(await first).toBe('done');
        expect(state.isGenerating).toBe(true);
        expect(state.activeJobId).toBe(secondJob);
        expect(window.notifyError).not.toHaveBeenCalled();

        // Kørsel 2's svar lander.
        const secondWorker = runWorkers().find(w => w !== firstWorker);
        secondWorker.onmessage({ data: { type: 'answer', answer: {
            contractVersion: 3, status: 'ok',
            groups: [{ members: ['r1', 'r2'] }, { members: ['r3', 'r4'] }],
            messages: [], rules: [{ rule: 0, met: true }], playback: null,
        } } });
        expect(await second).toBe('done');
        expect(state.isGenerating).toBe(false);
        expect(state.storedStandardGroups.map(g => g.members)).toEqual([['r1', 'r2'], ['r3', 'r4']]);
    });

    it('er der kommet en ny udgave, siges det stadig efter Stop — uden at røre tilstanden', async () => {
        stubWorkers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        window.notifyInfo = vi.fn();
        window.notifyError = vi.fn();
        const entry = document.createElement('script');
        entry.type = 'module';
        entry.src = '/assets/index-gammel.js';
        entry.dataset.testEntry = '1';
        document.head.appendChild(entry);
        let answerFetch;
        vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { answerFetch = resolve; })));

        state.currentClass = makeClass('ny-udgave-efter-stop');
        state.groupMode = 'size';
        const first = tryNextEngine(false);
        runWorkers()[0].onmessage({ data: { type: 'crash', message: 'motor-filen manglede' } });
        await flush();
        cancelGeneration();

        answerFetch(new Response('<script type="module" src="/assets/index-NY.js"></script>', {
            status: 200, headers: { 'content-type': 'text/html' },
        }));
        expect(await first).toBe('done');
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/opdateret, mens siden stod åben/));
        expect(state.isGenerating).toBe(false);
    });
});

describe('check() — beskederne før kørslen', () => {
    it('en besked, der ikke kan læses: ingen advarsler (null) i stedet for en computed, der kaster', async () => {
        stubWorkers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        state.currentClass = makeClass('skaev-check');
        state.activeView = 'standard';
        state.groupMode = 'size';
        await nextTick();
        const w = checkWorkerNow();
        expect(w).toBeTruthy();

        const reply = (messages) => w.onmessage({ data: { type: 'checked', id: lastCheck(w).id, answer: { status: 'ok', messages } } });
        reply([{ code: 'rule-not-met', rule: 0, values: 'Pige', students: [], text: 'x' }]);
        expect(() => engineCheck.value).not.toThrow();
        expect(engineCheck.value).toBe(null);
        reply([null]);
        expect(engineCheck.value).toBe(null);

        reply([{ code: 'rule-not-met', rule: 0, values: ['Pige'], students: [], text: 'x', type: 'note' }]);
        expect(engineCheck.value.messages.length).toBe(1);
    });

    it('en kopi af klassen (samme input) spørges igen ved klasseskiftet', async () => {
        stubWorkers();
        state.activeView = 'standard';
        state.groupMode = 'size';
        state.currentClass = makeClass('3a.csv');
        await nextTick();
        const w = checkWorkerNow();
        const message = { code: 'rule-not-met', rule: 0, values: [], students: [], text: 'x', type: 'note' };
        w.onmessage({ data: { type: 'checked', id: lastCheck(w).id, answer: { status: 'ok', messages: [message] } } });
        expect(engineCheck.value?.messages.length).toBe(1);

        const before = w.posted.length;
        state.currentClass = makeClass('3a_kopi.csv');
        await nextTick();
        expect(w.posted.length).toBe(before + 1);
        w.onmessage({ data: { type: 'checked', id: lastCheck(w).id, answer: { status: 'ok', messages: [message] } } });
        expect(engineCheck.value?.messages.length).toBe(1);
    });
});

// ─── Stop og motorens svar på samme tid (82. gennemsyn, 10/11 2026) ─────────
// Motoren ser Stop højst hvert 150. ms (LOOK_UP_MS i solve.js), så en lille
// klasse bliver ofte færdig, før den ser det. Hvad der end kommer tilbage
// efter Stop, skal appen ende i én rolig tilstand: overlayet væk, grupperne
// enten lagt eller urørte — aldrig en fejlbesked, aldrig en halv tilstand.
describe('Stop, og så svarer motoren', () => {
    const OLD = () => [
        { name: 'Group 1', members: ['r1', 'r3'] },
        { name: 'Group 2', members: ['r2', 'r4'] },
    ];
    const NEW_GROUPS = [{ members: ['r1', 'r2'] }, { members: ['r3', 'r4'] }];

    /** Start en kørsel, tryk Stop, og lad tråden svare med `message`. */
    async function stopThenReply(filename, message) {
        stubWorkers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        window.notifyInfo = vi.fn();
        window.notifyError = vi.fn();
        state.currentClass = makeClass(filename);
        state.groupMode = 'size';
        state.storedStandardGroups = OLD();
        const run = tryNextEngine(false);
        expect(state.isGenerating).toBe(true);
        cancelGeneration();
        const w = runWorkers()[0];
        // Stop beder tråden om den foreløbig bedste — én gang.
        expect(w.posted.filter(m => m.type === 'cancel').length).toBe(1);
        // Et tryk mere (dobbeltklik, eller Enter på knappen) sender ikke igen.
        cancelGeneration();
        expect(w.posted.filter(m => m.type === 'cancel').length).toBe(1);
        expect(state.isGenerating).toBe(true); // "Stopper …" står, til svaret kommer
        w.onmessage({ data: message });
        expect(await run).toBe('done');
        expect(state.isGenerating).toBe(false);
        expect(state.activeJobId).toBe(null);
        // Et svar (også efter Stop) lægger tråden til side til næste kørsel;
        // en fejl lukker den (89. gennemsyn, se "Kørslens tråd genbruges" i
        // nextEngine.js).
        expect(w.terminated).toBe(message.type !== 'answer');
        expect(window.notifyError).not.toHaveBeenCalled();
        return w;
    }
    const answer = (extra) => ({ type: 'answer', answer: {
        contractVersion: 3, messages: [], rules: [{ rule: 0, met: true }], playback: null, ...extra,
    } });

    it('"ok" lige efter Stop: motoren nåede at blive færdig, og grupperne lander', async () => {
        await stopThenReply('ok-efter-stop', answer({ status: 'ok', groups: NEW_GROUPS }));
        expect(state.storedStandardGroups.map(g => g.members)).toEqual([['r1', 'r2'], ['r3', 'r4']]);
        expect(window.notifyInfo).not.toHaveBeenCalledWith(expect.stringMatching(/urørte/));
    });

    it('"stopped" med en deling: den lander, og beskeden siger "de bedste"', async () => {
        await stopThenReply('stoppet', answer({ status: 'stopped', groups: NEW_GROUPS }));
        expect(state.storedStandardGroups.map(g => g.members)).toEqual([['r1', 'r2'], ['r3', 'r4']]);
        expect(window.notifyInfo).toHaveBeenCalledWith(expect.stringMatching(/de bedste, motoren nåede/));
    });

    it('"stopped" uden en deling: grupperne står urørte', async () => {
        await stopThenReply('stoppet-tom', answer({ status: 'stopped', groups: null }));
        expect(state.storedStandardGroups).toStrictEqual(OLD());
        expect(window.notifyInfo).toHaveBeenCalledWith(expect.stringMatching(/stoppet\. Dine nuværende grupper er urørte/));
    });

    it('motoren kaster efter Stop: et Stop uden deling, ingen fejlbesked', async () => {
        await stopThenReply('crash-efter-stop', { type: 'crash', message: 'boom' });
        expect(state.storedStandardGroups).toStrictEqual(OLD());
        expect(window.notifyInfo).toHaveBeenCalledWith(expect.stringMatching(/urørte/));
    });

    it('et svar, der bryder kontrakten efter Stop: grupperne står urørte', async () => {
        await stopThenReply('skaevt-efter-stop', answer({ status: 'stopped', groups: [{ members: ['r1', 'x9'] }] }));
        expect(state.storedStandardGroups).toStrictEqual(OLD());
        expect(window.notifyInfo).toHaveBeenCalledWith(expect.stringMatching(/urørte/));
    });

    it('"impossible" efter Stop: ingen rød advarsel, den kommer igen ved næste Dan grupper', async () => {
        await stopThenReply('umulig-efter-stop', answer({ status: 'impossible', groups: null,
            messages: [{ code: 'together-impossible', type: 'stop', students: ['r1', 'r2'], text: 'x' }] }));
        expect(state.storedStandardGroups).toStrictEqual(OLD());
        expect(engineTogetherStop.value).toBe(null);
    });
});

// ─── Skal sammen-stoppet, når en kørsel ender uden grupper (172. gennemsyn) ──
// Motoren havde sagt, at en Skal sammen ikke kan holdes (advarslen over
// grupperne med "Dan grupper uden aftalen"). Læreren trykker på knappen (eller
// Dan grupper), og kørslen ender UDEN grupper: tråden dør, motoren kaster,
// svaret bryder kontrakten, eller læreren stopper. Grupperne står urørte —
// så skal advarslen også. Før forsvandt den til næste Dan grupper.
describe('Skal sammen-stoppet står tilbage, når ingen grupper lander', () => {
    const OLD = () => [
        { name: 'Group 1', members: ['r1', 'r3'] },
        { name: 'Group 2', members: ['r2', 'r4'] },
    ];
    const STOP = { filename: 'stop.csv', ids: ['r1', 'r2'], text: 'Ida og Bo kan ikke være sammen.', input: 'x', skipTogether: [] };

    async function runAndEnd(end, { skipTogether = [] } = {}) {
        stubWorkers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        window.notifyInfo = vi.fn();
        window.notifyError = vi.fn();
        state.currentClass = makeClass('stop.csv');
        state.groupMode = 'size';
        state.storedStandardGroups = OLD();
        engineTogetherStop.value = { ...STOP };
        const run = tryNextEngine(false, null, { skipTogether });
        // Under kørslen er knappen væk (kan ikke trykkes to gange).
        expect(engineTogetherStop.value).toBe(null);
        const w = runWorkers()[0];
        await end(w);
        expect(await run).toBe('done');
        expect(state.isGenerating).toBe(false);
        expect(state.storedStandardGroups).toStrictEqual(OLD());
    }
    afterEach(() => { engineTogetherStop.value = null; });

    it('tråden dør midt i kørslen (onerror): fejlbeskeden, og stoppet står tilbage', async () => {
        await runAndEnd(async (w) => {
            w.onmessage({ data: { type: 'progress', progress: { attempt: 1 } } });
            w.onerror({ message: 'død', preventDefault() {} });
        }, { skipTogether: ['r1', 'r2'] });
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/kunne ikke dannes: Den stødte på en fejl\. Dine nuværende grupper er urørte/));
        expect(engineTogetherStop.value).toStrictEqual(STOP);
    });

    it('et svar, der bryder kontrakten: stoppet står tilbage', async () => {
        await runAndEnd(async (w) => {
            w.onmessage({ data: { type: 'answer', answer: { status: 'ok', groups: [{ members: ['r1', 'x9'] }], messages: [] } } });
        });
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/ukendt elev/));
        expect(engineTogetherStop.value).toStrictEqual(STOP);
    });

    // 175. gennemsyn (210): netudfald, mens tråd-filen hentes. Ingen ny udgave
    // (ingen hovedfil på siden i testen), så beskeden nævner forbindelsen.
    it('tråd-filen kan ikke hentes (Event uden tekst): beskeden nævner forbindelsen, og stoppet står tilbage', async () => {
        await runAndEnd(async (w) => {
            w.onerror({ type: 'error', preventDefault() {} });
        });
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/motoren kunne ikke hentes\. Dine nuværende grupper er urørte\. Tjek forbindelsen, og prøv igen/));
        expect(window.notifyError).not.toHaveBeenCalledWith(expect.stringMatching(/stødte på en fejl/));
        expect(engineTogetherStop.value).toStrictEqual(STOP);
    });

    it('læreren stopper, og motoren har ingen deling: stoppet står tilbage', async () => {
        await runAndEnd(async (w) => {
            cancelGeneration();
            w.onmessage({ data: { type: 'answer', answer: { status: 'stopped', groups: null, messages: [] } } });
        });
        expect(window.notifyInfo).toHaveBeenCalledWith(expect.stringMatching(/urørte/));
        expect(engineTogetherStop.value).toStrictEqual(STOP);
    });

    it('grupper lander: stoppet er væk (aftalen kunne holdes, eller den blev sprunget over)', async () => {
        stubWorkers();
        window.notifyInfo = vi.fn();
        window.notifyError = vi.fn();
        state.currentClass = makeClass('stop.csv');
        state.groupMode = 'size';
        state.storedStandardGroups = OLD();
        engineTogetherStop.value = { ...STOP };
        const run = tryNextEngine(false);
        runWorkers()[0].onmessage({ data: { type: 'answer', answer: {
            contractVersion: 3, status: 'ok', groups: [{ members: ['r1', 'r2'] }, { members: ['r3', 'r4'] }],
            messages: [], rules: [{ rule: 0, met: true }], playback: null,
        } } });
        await run;
        expect(state.storedStandardGroups.map(g => g.members)).toEqual([['r1', 'r2'], ['r3', 'r4']]);
        expect(engineTogetherStop.value).toBe(null);
    });
});
