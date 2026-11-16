// nextEngineCheckRetry.test.js — tjek-trådens fejlvej og beskeder, der ikke
// kan pakkes ud (173. gennemsyn, 16/11 2026):
//   1. Tjek-tråden fejler (ikke en ny udgave): et nyt forsøg af sig selv efter
//      2, 4 og 8 sekunder — ikke først, når læreren ændrer opskriften.
//   2. En ny udgave er lagt op: ingen nye forsøg, én besked.
//   3. onmessageerror på tjek-tråden, kørslens tråd og prøvekørslens tråd.
//   4. Input, der ikke kan sendes til kørslens tråd: løftet svarer stadig.
// Egen fil, så tjek-trådens modul-tilstand (checkWorker, checkWorkerGone og
// antallet af nye forsøg) er frisk.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import {
    engineCheck, runNextEngine, isNextEngineRunning, dropIdleEngineWorker,
    CHECK_RETRY_MS, CHECK_MAX_RETRIES,
} from './nextEngine.js';
import { state } from './state.js';

if (window.happyDOM) window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;

function makeClass(filename, extra = 0) {
    const data = [
        { _rowId: 'r1', Navn: 'Ida', Køn: 'Pige' },
        { _rowId: 'r2', Navn: 'Bo', Køn: 'Dreng' },
        { _rowId: 'r3', Navn: 'Ali', Køn: 'Pige' },
        { _rowId: 'r4', Navn: 'Eva', Køn: 'Dreng' },
    ];
    for (let i = 0; i < extra; i++) data.push({ _rowId: `x${i}`, Navn: `Ny${i}`, Køn: 'Pige' });
    return {
        filename,
        data,
        rules: [{ type: 'distribute', column: 'Køn' }],
        settings: { groupMode: 'size', groupTarget: 2, groupMod: '-' },
    };
}

// Tjek-tråden lever videre mellem testene (modul-tilstand), så listen
// nulstilles aldrig.
const workers = [];
function stubWorkers() {
    vi.stubGlobal('Worker', function FakeWorker() {
        const w = {
            posted: [],
            terminated: false,
            terminate() { this.terminated = true; },
            postMessage(m) { this.posted.push(m); },
        };
        workers.push(w);
        return w;
    });
}
const checksOf = (w) => w.posted.filter(m => m.type === 'check');
const liveCheckWorker = () => workers.filter(w => !w.terminated && checksOf(w).length).at(-1);
const reply = (w) => w.onmessage({
    data: { type: 'checked', id: checksOf(w).at(-1).id, answer: { status: 'ok', messages: [] } },
});
const totalChecks = () => workers.reduce((n, w) => n + checksOf(w).length, 0);

beforeEach(() => {
    vi.useFakeTimers();
    stubWorkers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.notifyError = vi.fn();
    state.activeView = 'standard';
    state.groupMode = 'size';
    state.storedStandardGroups = [];
});

afterEach(() => {
    dropIdleEngineWorker();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.querySelectorAll('script[data-test-entry]').forEach(el => el.remove());
    state.currentClass = null;
});

describe('tjek-tråden fejler, uden at en ny udgave er lagt op', () => {
    it('prøver igen af sig selv med den opskrift, der står nu — 2, 4 og 8 sekunder, så ikke flere', async () => {
        expect(CHECK_RETRY_MS).toBe(2000);
        expect(CHECK_MAX_RETRIES).toBe(3);
        state.currentClass = makeClass('retry-a.csv');
        await nextTick();
        const first = liveCheckWorker();
        expect(first).toBeTruthy();
        reply(first);
        expect(engineCheck.value).not.toBe(null);

        // Tråden dør (fx et kort netværksudfald, da tråd-filen skulle hentes).
        first.onerror({ message: 'net::ERR_NETWORK_CHANGED', preventDefault() {} });
        expect(engineCheck.value).toBe(null);
        const before = totalChecks();

        // Opskriften ændres IKKE. Efter 2 sekunder: en ny tråd og et nyt tjek.
        await vi.advanceTimersByTimeAsync(CHECK_RETRY_MS - 1);
        expect(totalChecks()).toBe(before);
        await vi.advanceTimersByTimeAsync(1);
        expect(totalChecks()).toBe(before + 1);
        const second = liveCheckWorker();
        expect(second).not.toBe(first);
        expect(checksOf(second).at(-1).input.students.length).toBe(4);

        // Den nye tråd dør også: 4 sekunder, så 8, og så ikke flere.
        second.onerror({ message: 'igen' });
        await vi.advanceTimersByTimeAsync(2 * CHECK_RETRY_MS);
        expect(totalChecks()).toBe(before + 2);
        liveCheckWorker().onerror({ message: 'igen' });
        await vi.advanceTimersByTimeAsync(4 * CHECK_RETRY_MS);
        expect(totalChecks()).toBe(before + 3);
        liveCheckWorker().onerror({ message: 'igen' });
        await vi.advanceTimersByTimeAsync(60000);
        expect(totalChecks()).toBe(before + 3);

        // Som før: en ændring af opskriften sender igen — og et svar nulstiller.
        state.currentClass = makeClass('retry-a.csv', 1);
        await nextTick();
        expect(totalChecks()).toBe(before + 4);
        const fresh = liveCheckWorker();
        reply(fresh);
        expect(engineCheck.value).not.toBe(null);
        fresh.onerror({ message: 'en gang til' });
        await vi.advanceTimersByTimeAsync(CHECK_RETRY_MS);
        expect(totalChecks()).toBe(before + 5);
        reply(liveCheckWorker());
        expect(engineCheck.value).not.toBe(null);
    });

    it('et nyt forsøg sender den klasse, der står nu, ikke den, der stod, da tråden døde', async () => {
        state.currentClass = makeClass('retry-b.csv');
        await nextTick();
        const w = liveCheckWorker();
        reply(w);
        w.onerror({ message: 'væk' });
        // Læreren skifter klasse, før forsøget: watch'en sender selv (ny tråd).
        state.currentClass = makeClass('retry-c.csv', 2);
        await nextTick();
        const now = liveCheckWorker();
        reply(now);
        await vi.advanceTimersByTimeAsync(CHECK_RETRY_MS);
        // Forsøget sender igen den klasse, der står (seks elever).
        expect(checksOf(liveCheckWorker()).at(-1).input.students.length).toBe(6);
        reply(liveCheckWorker());
        expect(engineCheck.value).not.toBe(null);
    });

    it('et svar, der ikke kan pakkes ud: ingen advarsler, og et nyt tjek i samme tråd', async () => {
        state.currentClass = makeClass('retry-d.csv');
        await nextTick();
        const w = liveCheckWorker();
        reply(w);
        expect(engineCheck.value).not.toBe(null);
        const before = checksOf(w).length;
        w.onmessageerror({});
        expect(engineCheck.value).toBe(null);
        expect(w.terminated).toBe(false);
        await vi.advanceTimersByTimeAsync(CHECK_RETRY_MS);
        expect(checksOf(w).length).toBe(before + 1);
        reply(w);
        expect(engineCheck.value).not.toBe(null);
    });
});

describe('tjek-tråden fejler, fordi en ny udgave er lagt op', () => {
    it('ingen nye forsøg, og én besked om at genindlæse', async () => {
        const entry = document.createElement('script');
        entry.type = 'module';
        entry.src = '/assets/index-gammel.js';
        entry.dataset.testEntry = '1';
        document.head.appendChild(entry);
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            '<script type="module" src="/assets/index-ny.js"></script>',
            { status: 200, headers: { 'content-type': 'text/html' } },
        )));
        state.currentClass = makeClass('retry-e.csv');
        await nextTick();
        const w = liveCheckWorker();
        reply(w);
        const before = totalChecks();
        w.onerror({ message: 'worker-gammel.js 404' });
        await vi.advanceTimersByTimeAsync(60000);
        expect(totalChecks()).toBe(before);
        expect(window.notifyError).toHaveBeenCalledTimes(1);
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/opdateret, mens siden stod åben/));
    });
});

describe('kørslens tråd', () => {
    const input = { contractVersion: 3, students: [] };

    it('en besked, der ikke kan pakkes ud: svarer med det samme, ikke efter 20 sekunders tavshed', async () => {
        const w = { posted: [], terminated: false, postMessage(m) { this.posted.push(m); }, terminate() { this.terminated = true; } };
        const p = runNextEngine(input, { makeWorker: () => w });
        expect(typeof w.onmessageerror).toBe('function');
        w.onmessageerror({});
        await expect(p).resolves.toEqual({ kind: 'failed', reason: 'den stødte på en fejl' });
        expect(w.terminated).toBe(true);
        expect(isNextEngineRunning()).toBe(false);
    });

    it('input, der ikke kan sendes: løftet svarer "failed" og afviser ikke', async () => {
        const w = {
            terminated: false,
            postMessage() { const err = new Error('could not be cloned'); err.name = 'DataCloneError'; throw err; },
            terminate() { this.terminated = true; },
        };
        const p = runNextEngine(input, { makeWorker: () => w });
        await expect(p).resolves.toEqual({ kind: 'failed', reason: 'den kunne ikke startes' });
        expect(isNextEngineRunning()).toBe(false);
        // Vagten er væk: intet sker senere.
        expect(vi.getTimerCount()).toBe(0);
    });

    it('en tråd, der lægges til side, beholder ikke onmessageerror', async () => {
        const w = { posted: [], postMessage(m) { this.posted.push(m); }, terminate() {} };
        const p = runNextEngine(input, { makeWorker: () => w });
        w.onmessage({ data: { type: 'answer', id: w.posted[0].id, answer: { status: 'ok' } } });
        await p;
        expect(w.onmessageerror).toBe(null);
    });
});
