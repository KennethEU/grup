// trialRunQueue.test.js — prøvekørslens tråd og kø (trialRun.js), når tingene
// sker i en uheldig rækkefølge (107. gennemsyn, 13/11 2026):
//   1. Læreren ændrer opskriften, mens en prøvekørsel regner. Svaret må ikke
//      sætte den næste i gang, før opskriften har stået stille.
//   2. Læreren skifter klasse, mens en prøvekørsel regner. Svaret om den
//      gamle klasse må ikke stå i den nye.
//   3. Svaret læses med opskriftens advarsler fra dengang, kørslen startede.
//
// Egen fil og friske moduler (vi.resetModules) pr. test: trialRun.js sætter
// kun sin vagt op, hvis der findes en `Worker`, når filen indlæses. Trådene
// er falske; tjekket er motorens rigtige check().

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { check } from '../../../motor/engine/engine.js';

let workers = [];
function stubWorkers() {
    workers = [];
    vi.stubGlobal('Worker', function FakeWorker() {
        const w = { posted: [], answered: new Set(), terminated: false };
        w.postMessage = (m) => { w.posted.push(m); };
        w.terminate = () => { w.terminated = true; };
        workers.push(w);
        return w;
    });
}
const trialRuns = () => workers.flatMap(w => w.posted.filter(m => m.type === 'run' && m.cores === 1).map(m => ({ w, m })));

async function flush() {
    for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); }
}

/** Svar på alle ubesvarede check()-spørgsmål med motorens rigtige check(). */
async function answerChecks() {
    await flush();
    for (const w of workers) {
        for (const m of w.posted) {
            if (m.type !== 'check' || w.answered.has(m)) continue;
            w.answered.add(m);
            w.onmessage({ data: { type: 'checked', id: m.id, answer: check(m.input) } });
        }
    }
    await flush();
}

/**
 * Prøvekørsel nr. `i` svarer: et gyldigt svar efter kontrakten (fire elever
 * pr. gruppe, alle regler opfyldt), evt. med en ekstra besked. Ikke motorens
 * run(): den holder pause med setTimeout, og uret er falsk her.
 */
async function answerTrial(i, extraMessages = () => []) {
    const { w, m } = trialRuns()[i];
    const ids = m.input.students.map(s => s._rowId);
    const groups = [];
    for (let k = 0; k < ids.length; k += 4) groups.push({ members: ids.slice(k, k + 4), topic: null });
    const answer = {
        contractVersion: m.input.contractVersion, status: 'ok', groups, lockedTopics: {},
        messages: extraMessages(m.input),
        rules: m.input.rules.map((_, rule) => ({ rule, met: true })), playback: null,
    };
    w.onmessage({ data: { type: 'answer', id: m.id, answer } });
    await flush();
}

function makeClass(filename) {
    const data = [];
    for (let i = 0; i < 24; i++) data.push({ _rowId: 'r' + i, Navn: 'Elev ' + i, Køn: i % 2 ? 'P' : 'D', Niveau: String(i % 5) });
    return {
        filename, data,
        rules: [{ type: 'distribute', column: 'Køn', value: '' }, { type: 'balance', column: 'Niveau', value: '' }],
        settings: { groupTarget: 4, groupMod: '+' },
        togetherGroups: [], separations: [], topics: [],
    };
}

let T, NE, state;
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.resetModules();
    stubWorkers();
    ({ state } = await import('./state.js'));
    NE = await import('./nextEngine.js');
    T = await import('./trialRun.js');
    state.navView = 'class';
    state.classViewTab = 'groups';
    state.activeView = 'standard';
    state.groupMode = 'size';
    state.isGenerating = false;
    state.storedStandardGroups = [];
});
afterEach(() => {
    state.currentClass = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('Prøvekørslens kø', () => {
    it('en ændring, mens den regner: den næste venter, til opskriften har stået stille', async () => {
        state.currentClass = makeClass('3a');
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        expect(trialRuns().length).toBe(1);

        // Læreren ændrer størrelsen, mens kørsel 1 regner …
        state.currentClass.settings.groupTarget = 3;
        await answerChecks();
        // … og 100 ms senere kommer svaret på kørsel 1.
        vi.advanceTimersByTime(100);
        await answerTrial(0);
        vi.advanceTimersByTime(1);
        // Før 107. gennemsyn startede kørsel 2 her, 100 ms efter ændringen.
        expect(trialRuns().length).toBe(1);
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS - 100);
        expect(trialRuns().length).toBe(2);
        // Svaret på kørsel 1 hører til den gamle opskrift og vises ikke.
        expect(T.trialFor(false)).toBe(null);
        await answerTrial(1);
        expect(T.trialFor(false)).not.toBe(null);
    });

    it('går tråden ned midt i en ændring, venter den næste også, til opskriften står stille', async () => {
        state.currentClass = makeClass('3a');
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        state.currentClass.settings.groupTarget = 3;
        await answerChecks();
        vi.advanceTimersByTime(100);
        const { w, m } = trialRuns()[0];
        w.onmessage({ data: { type: 'crash', id: m.id, message: 'test' } });
        await flush();
        vi.advanceTimersByTime(1);
        expect(trialRuns().length).toBe(1);
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS - 100);
        expect(trialRuns().length).toBe(2);
        expect(w.terminated).toBe(true);
    });

    it('stod opskriften allerede stille, da svaret kom, startes den næste med det samme', async () => {
        state.currentClass = makeClass('3a');
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        state.currentClass.settings.groupTarget = 3;
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS + 200);   // kørsel 1 regner stadig
        expect(trialRuns().length).toBe(1);
        await answerTrial(0);
        vi.advanceTimersByTime(0);
        expect(trialRuns().length).toBe(2);
    });

    it('et klasseskift, mens den regner: svaret om den gamle klasse står ikke i den nye', async () => {
        state.currentClass = makeClass('3a');
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        expect(trialRuns().length).toBe(1);

        // En kopi af klassen: samme elever, samme opskrift — kun filnavnet er et andet.
        state.currentClass = makeClass('3a_kopi');
        await answerChecks();
        await answerTrial(0);
        expect(T.trialFor(false)).toBe(null);
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        expect(trialRuns().length).toBe(2);
        await answerTrial(1);
        expect(T.trialFor(false)).not.toBe(null);
    });

    it('svaret læses med opskriftens advarsler fra dengang, kørslen startede', async () => {
        // "Cellerne er ikke tal" står i opskriften, da kørslen starter …
        let hintIds = ['hint:non-numeric:x:balance:Niveau'];
        NE.provideRecipeHintIds(() => hintIds);
        state.currentClass = makeClass('3a');
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        // … men ikke længere, da svaret kommer (fx et klasseskift og tilbage).
        hintIds = [];
        await answerTrial(0, (input) => [{
            code: 'non-numeric-cells', type: 'info', column: 'Niveau', text: 'Cellerne i "Niveau" er ikke tal.',
            rule: input.rules.findIndex(r => r.type === 'balance'),
        }]);
        const got = T.trialFor(false);
        expect(got).not.toBe(null);
        // Opskriftens egen advarsel siger det allerede: ingen note to gange.
        expect(got.notes.map(n => n.text)).not.toContain('Cellerne i "Niveau" er ikke tal.');
    });

    // 173. gennemsyn: tjek-tråden dør, før den har svaret. Prøvekørslen
    // venter på tjekket; uden et nyt forsøg af sig selv kom der ingen
    // prøvekørsel, før læreren ændrede opskriften.
    it('tjek-tråden dør før svaret: tjekket prøves igen, og prøvekørslen kommer af sig selv', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        state.currentClass = makeClass('3a');
        await flush();
        const dead = workers.find(w => w.posted.some(m => m.type === 'check'));
        // Den døde tråd svarer aldrig (answerChecks må ikke svare for den).
        dead.posted.forEach(m => dead.answered.add(m));
        dead.onerror({ message: 'net::ERR_NETWORK_CHANGED' });
        await flush();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS * 3);
        expect(trialRuns().length).toBe(0);
        // Opskriften står stille. Efter CHECK_RETRY_MS: et nyt tjek i en ny tråd.
        vi.advanceTimersByTime(NE.CHECK_RETRY_MS);
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        expect(trialRuns().length).toBe(1);
        await answerTrial(0);
        expect(T.trialFor(false)).not.toBe(null);
    });
});

// 174. gennemsyn (16/11 2026), (208) og (209): prøvekørslens tråd svigter.
// Før blev opskriften, tråden gik ned på, aldrig prøvet igen, og efter tre
// fejl holdt prøvekørslen helt op i fanen — også når nettet var tilbage.
describe('Prøvekørslens tråd svigter', () => {
    /** Prøvekørsel nr. i's tråd fejler, som når dens fil ikke kan hentes. */
    async function failTrial(i) {
        const { w } = trialRuns()[i];
        w.onerror({ message: 'net::ERR_INTERNET_DISCONNECTED' });
        await flush();
    }

    it('én fejl i forbindelsen, læreren rører intet: prøvekørslen kommer af sig selv', async () => {
        state.currentClass = makeClass('3a');
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        expect(trialRuns().length).toBe(1);
        await failTrial(0);
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS * 3);
        expect(trialRuns().length).toBe(1);          // ikke med det samme igen
        vi.advanceTimersByTime(T.TRIAL_RETRY_MS);
        expect(trialRuns().length).toBe(2);
        await answerTrial(1);
        expect(T.trialFor(false)).not.toBe(null);
    });

    it('tre fejl, mens opskriften ændres: efter pausen kommer prøvekørslen igen', async () => {
        state.currentClass = makeClass('3a');
        await answerChecks();
        for (const [i, size] of [[0, 3], [1, 5], [2, 6]]) {
            vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
            expect(trialRuns().length).toBe(i + 1);
            await failTrial(i);
            state.currentClass.settings.groupTarget = size;
            await answerChecks();
        }
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS * 3);
        expect(trialRuns().length).toBe(3);           // grænsen: ingen flere for nu
        vi.advanceTimersByTime(T.TRIAL_RETRY_MS);
        expect(trialRuns().length).toBe(4);
        await answerTrial(3);
        expect(T.trialFor(false)).not.toBe(null);
    });

    it('forsøgene bliver sjældnere, så længe forbindelsen er væk', async () => {
        state.currentClass = makeClass('3a');
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        await failTrial(0);
        vi.advanceTimersByTime(T.TRIAL_RETRY_MS - 1);
        expect(trialRuns().length).toBe(1);
        vi.advanceTimersByTime(2);
        expect(trialRuns().length).toBe(2);
        await failTrial(1);
        vi.advanceTimersByTime(T.TRIAL_RETRY_MS);
        expect(trialRuns().length).toBe(2);           // nu 30 s
        vi.advanceTimersByTime(T.TRIAL_RETRY_MS + 2);
        expect(trialRuns().length).toBe(3);
    });

    it('motoren kaster på en opskrift: den opskrift prøves ikke igen', async () => {
        state.currentClass = makeClass('3a');
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        const { w, m } = trialRuns()[0];
        w.onmessage({ data: { type: 'crash', id: m.id, message: 'test' } });
        await flush();
        vi.advanceTimersByTime(T.TRIAL_RETRY_MAX_MS * 2);
        expect(trialRuns().length).toBe(1);
        // En anden opskrift prøves som altid.
        state.currentClass.settings.groupTarget = 3;
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        expect(trialRuns().length).toBe(2);
    });

    it('fejl fra en ledig tråd tæller ikke (209)', async () => {
        state.currentClass = makeClass('3a');
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        await answerTrial(0);
        // Tråden er ledig; tre fejl fra den (fx en besked, der ikke kan pakkes ud).
        for (let i = 0; i < T.TRIAL_MAX_FAILURES; i++) {
            const w = trialRuns()[0].w;
            w.onmessageerror?.({});
            await flush();
        }
        // Læreren ændrer opskriften: prøvekørslen kommer som altid.
        state.currentClass.settings.groupTarget = 3;
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        expect(trialRuns().length).toBe(2);
    });

    it('en ny udgave er lagt op: prøvekørslen holder op og spørger ikke mere', async () => {
        vi.resetModules();
        vi.doMock('./newBuild.js', async (orig) => ({ ...(await orig()), checkForNewBuild: () => Promise.resolve(true) }));
        ({ state } = await import('./state.js'));
        NE = await import('./nextEngine.js');
        T = await import('./trialRun.js');
        state.navView = 'class';
        state.classViewTab = 'groups';
        state.activeView = 'standard';
        state.groupMode = 'size';
        state.isGenerating = false;
        state.storedStandardGroups = [];
        state.currentClass = makeClass('3a');
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS);
        await failTrial(0);
        vi.advanceTimersByTime(T.TRIAL_RETRY_MAX_MS * 3);
        state.currentClass.settings.groupTarget = 3;
        await answerChecks();
        vi.advanceTimersByTime(T.TRIAL_QUIET_MS * 3);
        expect(trialRuns().length).toBe(1);
        vi.doUnmock('./newBuild.js');
    });
});
