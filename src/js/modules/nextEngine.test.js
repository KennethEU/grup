import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildEngineInput, contractProblem, runNextEngine, tryNextEngine, abortNextEngine, stopNextEngine, appBudget, freeNumbers, fillMessageText, coveredByRecipeHint, playbackToRecording, issueKey, severityOf, dedupeAnswerMessages, attemptsText, resultSlot, replacedByResult, noteKeys, runStatusFor, dropIdleEngineWorker } from './nextEngine.js';
import { seatingAt, frameCount } from './replay.js';
import { state } from './state.js';
import { listRuns, clearRuns } from './runHistory.js';

// En lille opdigtet klasse: 6 elever, r6 fraværende, r5 i en låst gruppe.
function makeClass(extra = {}) {
    return {
        data: [
            { _rowId: 'r1', Navn: 'Ida', Køn: 'Pige', Karakter: 12, Niveau: 'Høj' },
            { _rowId: 'r2', Navn: 'Bo', Køn: 'Dreng', Karakter: '7', Niveau: 'Lav' },
            { _rowId: 'r3', Navn: 'Ali', Køn: ' pige', Karakter: null, Niveau: 'Middel' },
            { _rowId: 'r4', Navn: 'Eva', Køn: 'Dreng', Karakter: '4', Niveau: 'Lav' },
            { _rowId: 'r5', Navn: 'Kim', Køn: 'Pige', Karakter: '02', Niveau: 'Høj' },
            { _rowId: 'r6', Navn: 'Liv', Køn: 'Dreng', Karakter: '10', Niveau: 'Lav', _excluded: true },
        ],
        rules: [
            { type: 'distribute', column: 'Køn' },
            { type: 'balance', column: 'Niveau' },
            { type: 'separate', column: 'Karakter', value: '12' },
            { type: 'separate', column: 'Karakter', values: ['02'] },   // kun den låste har 02
            { type: 'cluster', column: '' },                             // ingen kolonne valgt
        ],
        columnOrders: { Niveau: ['Lav', 'Middel', 'Høj'], Køn: ['Pige', 'Dreng'] },
        togetherGroups: [{ ids: ['r1', 'r2'] }, { ids: ['r5', 'r6'] }],
        separations: [{ ids: ['r3', 'r4', 'r6'] }, { ids: ['r4', 'r5'] }],
        topics: ['Klima', ' ', 'Migration'],
        settings: { groupMode: 'size', groupTarget: 2, groupMod: '-' },
        ...extra,
    };
}
const locked = [{ name: 'Group 2', locked: true, members: [{ id: 'r5' }], topic: 'Klima' }];
const base = (o = {}) => buildEngineInput({ cls: makeClass(), isMatrix: false, groupMode: 'size', viewGroups: locked, ...o });

describe('buildEngineInput — kontraktens input', () => {
    it('tager fraværende og låste ud og sender kun reglernes kolonner som tekst', () => {
        const input = base();
        expect(input.contractVersion).toBe(3);
        expect(input.view).toBe('home');
        expect(input.students.map(s => s._rowId)).toEqual(['r1', 'r2', 'r3', 'r4']);
        // Ingen navne; tal bliver tekst; tom celle er "".
        expect(input.students[0]).toEqual({ _rowId: 'r1', Køn: 'Pige', Niveau: 'Høj', Karakter: '12' });
        expect(input.students[2].Karakter).toBe('');
        // Mellemrum og store/små bogstaver er motorens sag — de sendes som de er.
        expect(input.students[2].Køn).toBe(' pige');
    });

    it('sender reglerne, som opskriften viser dem (trin, så listens rækkefølge) og dropper Adskil-værdier, kun låste har', () => {
        // Listen: Fordel, Balancér, Adskil 12, Adskil 02, Klyng uden kolonne.
        // Vist: Vejer tungt (Adskil), så Mål (Fordel, Balancér).
        expect(base().rules).toEqual([
            { type: 'separate', column: 'Karakter', values: ['12'] },
            { type: 'distribute', column: 'Køn' },
            { type: 'balance', column: 'Niveau' },
        ]);
    });

    it('sender kun rækkefølgen for kolonner, en talregel bruger', () => {
        expect(base().columnOrders).toEqual({ Niveau: ['Lav', 'Middel', 'Høj'] });
    });

    it('aftalerne: låste bliver i Skal sammen, fraværende og låste ud af Undgå', () => {
        const input = base();
        // r5+r6: r6 er fraværende, så blokken er kun r5 → under to, sendes ikke.
        expect(input.agreements.together).toEqual([['r1', 'r2']]);
        expect(input.agreements.avoid).toEqual([['r3', 'r4']]);
        // Med r5 i en blok med en fri elev bliver den låste stående.
        const cls = makeClass({ togetherGroups: [{ ids: ['r1', 'r5'] }] });
        const across = buildEngineInput({ cls, isMatrix: false, groupMode: 'size', viewGroups: locked });
        expect(across.agreements.together).toEqual([['r1', 'r5']]);
    });

    it('"Dan uden aftalen" fjerner blokken', () => {
        expect(base({ skipTogether: ['r2'] }).agreements.together).toEqual([]);
    });

    it('låste grupper, emner, størrelse og budget', () => {
        const input = base();
        expect(input.lockedGroups).toEqual([{ id: 'Group 2', number: 2, name: 'Gruppe 2', members: ['r5'], topic: 'Klima' }]);
        expect(input.topics).toEqual(['Klima', 'Migration']);
        expect(input.size).toEqual({ mode: 'perGroup', target: 2, adjust: 'minus' });
        expect(input.budget).toEqual({ maxSeconds: 10, maxAttempts: 20, minAttempts: 3 });
        expect(input.matrix).toBeNull();
        expect(input.seed).toBeNull();
    });

    it('antal grupper er lærerens samlede tal; ≤ låste grupper kalder ingen motor', () => {
        expect(base({ groupMode: 'number', overrideSettings: { mode: 'number', target: 3 } }).size)
            .toEqual({ mode: 'count', count: 3 });
        expect(base({ overrideSettings: { mode: 'number', target: 1 } })).toBeNull();
    });

    it('ingen frie elever → null (appen siger det selv)', () => {
        const all = [{ name: 'Group 1', locked: true, members: ['r1', 'r2', 'r3', 'r4', 'r5'] }];
        expect(base({ viewGroups: all })).toBeNull();
    });

    it('matrix: en gammel gemt Opdel-regel sendes aldrig med', () => {
        const input = buildEngineInput({
            cls: makeClass({ matrixRules: [{ type: 'aggregate', column: 'Køn' }, { type: 'distribute', column: 'Køn' }], matrixSettings: { matrixStrategy: 'size', groupTarget: 2 } }),
            isMatrix: true, groupMode: 'size', viewGroups: [], homeGroups: [{ name: 'Group 1', members: ['r1', 'r2', 'r3', 'r4'] }],
        });
        expect(input.rules).toEqual([{ type: 'distribute', column: 'Køn' }]);
    });

    it('matrix: kilderne fra stamgrupperne, ingen Skal sammen, ingen emner', () => {
        const homeGroups = [
            { name: 'Group 1', members: ['r1', 'r2', 'r6'], topic: 'Klima' },
            { name: 'Group 2', members: ['r3', 'r4', 'r5'], topic: '' },
        ];
        const input = buildEngineInput({
            cls: makeClass({ matrixRules: [{ type: 'distribute', column: 'Køn' }], matrixSettings: { matrixStrategy: 'full', matrixRepresentationType: 'topic' } }),
            isMatrix: true, groupMode: 'size', viewGroups: [], homeGroups,
            topicFor: (name) => (name === 'Group 2' ? 'Migration' : null),
        });
        expect(input.view).toBe('matrix');
        expect(input.size).toEqual({ mode: 'full' });
        expect(input.agreements.together).toEqual([]);
        expect(input.topics).toEqual([]);
        expect(input.matrix).toEqual({
            source: 'topic',
            homeGroups: [
                { id: 'Gruppe 1', members: ['r1', 'r2'], topic: 'Klima' },
                { id: 'Gruppe 2', members: ['r3', 'r4', 'r5'], topic: 'Migration' },
            ],
        });
    });

    it('matrix: kildernes id er det navn, læreren ser — motoren skriver det i sine beskeder', () => {
        const build = (names) => buildEngineInput({
            cls: makeClass({ matrixRules: [], matrixSettings: { matrixStrategy: 'full', matrixRepresentationType: 'group' } }),
            isMatrix: true, groupMode: 'size', viewGroups: [],
            homeGroups: names.map((name, i) => ({ name, members: [['r1', 'r2'], ['r3', 'r4']][i] })),
        }).matrix.homeGroups.map(g => g.id);
        expect(build(['Group 1', 'Group 2'])).toEqual(['Gruppe 1', 'Gruppe 2']);
        expect(build(['Group 7', 'Klimagruppen'])).toEqual(['Gruppe 7', 'Klimagruppen']);
        // To grupper, der ville hedde det samme: de interne navne, så kilderne ikke smelter sammen.
        expect(build(['Group 1', 'Gruppe 1'])).toEqual(['Group 1', 'Gruppe 1']);
    });

    it('en låst gruppes emne sendes med klasselistens stavemåde ("klima" → "Klima"), ukendte emner som de er', () => {
        // Motoren sammenligner tegn for tegn: "klima" var for den et ugyldigt
        // emne, og den låste gruppe fik et nyt (måske "Migration").
        const topicOf = (topic) => base({ viewGroups: [{ ...locked[0], topic }] }).lockedGroups[0].topic;
        expect(topicOf(' klima ')).toBe('Klima');
        expect(topicOf('MIGRATION')).toBe('Migration');
        expect(topicOf('Energi')).toBe('Energi');
        expect(topicOf('')).toBeNull();
    });

    it('budgettet: 20 forsøg, 3/2, 10 sek. til og med 100 elever, 30 over', () => {
        expect(appBudget(60)).toEqual({ maxSeconds: 10, maxAttempts: 20, minAttempts: 3 });
        expect(appBudget(61).minAttempts).toBe(2);
        expect(appBudget(100).maxSeconds).toBe(10);
        expect(appBudget(101).maxSeconds).toBe(30);
    });
});

describe('contractProblem — regel-linjerne (mærkerne læses herfra)', () => {
    const input = { students: [{ _rowId: 'a' }, { _rowId: 'b' }], rules: [{ type: 'distribute', column: 'Køn' }] };
    const ok = (rules) => ({ status: 'ok', groups: [{ members: ['a', 'b'] }], messages: [], rules });
    it('godtager linjer med et gyldigt regelnummer og met true/false/null', () => {
        expect(contractProblem(input, ok([{ rule: 0, met: true }]))).toBeNull();
        expect(contractProblem(input, ok([{ rule: 0, met: null }]))).toBeNull();
    });
    it('afviser et ukendt regelnummer, en forkert met og en liste, der ikke er en liste', () => {
        expect(contractProblem(input, ok([{ rule: 3, met: true }]))).toMatch(/regel-linje/);
        expect(contractProblem(input, ok([{ rule: 0, met: 'ja' }]))).toMatch(/regel-linje/);
        expect(contractProblem(input, ok({ rule: 0 }))).toMatch(/regel-linje/);
    });
});

describe('contractProblem — bryder svaret kontrakten?', () => {
    const input = { students: [{ _rowId: 'a' }, { _rowId: 'b' }, { _rowId: 'c' }] };
    it('godtager et gyldigt svar og svar uden grupper', () => {
        expect(contractProblem(input, { status: 'ok', groups: [{ members: ['a', 'b'] }, { members: ['c'] }] })).toBeNull();
        expect(contractProblem(input, { status: 'unsupported', reason: { text: 'x' } })).toBeNull();
        // Stop uden en hel deling er gyldigt; Stop med en deling tjekkes som "ok".
        expect(contractProblem(input, { status: 'stopped', groups: null })).toBeNull();
        expect(contractProblem(input, { status: 'stopped', groups: [{ members: ['a'] }] })).toMatch(/manglede/);
    });
    it('fanger manglende, dobbelte og ukendte elever, tomme grupper og forkert status', () => {
        expect(contractProblem(input, { status: 'ok', groups: [{ members: ['a', 'b'] }] })).toMatch(/manglede/);
        expect(contractProblem(input, { status: 'ok', groups: [{ members: ['a', 'b'] }, { members: ['b', 'c'] }] })).toMatch(/to grupper/);
        expect(contractProblem(input, { status: 'ok', groups: [{ members: ['a', 'b', 'c', 'x'] }] })).toMatch(/ukendt/);
        expect(contractProblem(input, { status: 'ok', groups: [{ members: ['a', 'b', 'c'] }, { members: [] }] })).toMatch(/tom/);
        expect(contractProblem(input, { status: 'fint' })).toMatch(/status/);
        expect(contractProblem(input, null)).toMatch(/tomt/);
    });
    it('fanger beskeder, der ikke kan læses — også ved "impossible"', () => {
        const ok = { status: 'ok', groups: [{ members: ['a', 'b', 'c'] }] };
        expect(contractProblem(input, { ...ok, messages: [{ text: 'x', students: ['a'] }] })).toBeNull();
        expect(contractProblem(input, { ...ok, messages: null })).toBeNull();
        expect(contractProblem(input, { ...ok, messages: [null] })).toMatch(/besked/);
        expect(contractProblem(input, { ...ok, messages: 'x' })).toMatch(/besked/);
        expect(contractProblem(input, { ...ok, messages: [{ text: 'x', students: 'a' }] })).toMatch(/besked/);
        expect(contractProblem(input, { status: 'impossible', messages: [null] })).toMatch(/besked/);
        // Ved "error" og "unsupported" læses beskederne ikke: motorens egen
        // forklaring (reason.text) skal stå, ikke vores.
        expect(contractProblem(input, { status: 'error', messages: [null] })).toBeNull();
    });
});

describe('svaret → appens form', () => {
    it('nye grupper får de ledige numre uden om de låste', () => {
        expect(freeNumbers(4, [2, 4])).toEqual([1, 3, 5, 6]);
        expect(freeNumbers(2, [])).toEqual([1, 2]);
    });

    it('{elever} og {gruppe:N} fyldes ud', () => {
        const fill = { studentName: (id) => ({ a: 'Ida', b: 'Bo' })[id], groupName: (i) => ['Gruppe 1', 'Gruppe 3'][i] };
        expect(fillMessageText({ text: 'To ({elever}) står i {gruppe:1}.', students: ['a', 'b'] }, fill))
            .toBe('To (Ida, Bo) står i Gruppe 3.');
    });

    it('en besked, opskriften allerede har sagt med "… gør ingenting", står ikke to gange', () => {
        const input = { rules: [{ type: 'balance', column: 'Karakter' }] };
        const ids = ['hint:non-numeric:stam:balance:Karakter'];
        expect(coveredByRecipeHint({ code: 'non-numeric-cells', rule: 0 }, input, ids)).toBe(true);
        expect(coveredByRecipeHint({ code: 'non-numeric-cells', rule: 0 }, input, [])).toBe(false);
        // Appens gamle feasibility:*-advarsler findes ikke længere.
        expect(coveredByRecipeHint({ code: 'separate-unavoidable', rule: 0 }, input, ['feasibility:separate:Karakter:x'])).toBe(false);
    });

    it('afspilningen ender i grupperne — med bytte, flytning, blok og et samlet spring', () => {
        const input = { rules: [{ type: 'distribute', column: 'Køn' }] };
        const playback = {
            best: 0,
            attempts: [{
                deal: [['a', 0], ['b', 0], ['c', 1], ['d', 1], ['e', 2]],
                moves: [
                    { swap: ['a', 'c'], rule: 0, effect: 'better' },
                    { move: 'e', to: 0, rule: null, effect: 'worse' },
                    { swaps: [['b', 'd'], ['e', 'a']], rule: null, effect: 'same' },
                ],
                groups: [['c', 'd', 'a'], ['b', 'e'], []],
                cut: true,
            }],
        };
        const rec = playbackToRecording(playback, input);
        const run = rec.runs[0];
        expect(run.merged).toBe(true);
        expect(run.truncated).toBe(false);
        expect(run.events[0][6]).toBe('distribute:Køn');
        expect(run.events[1]).toEqual(['e', null, 1, null, null, null, null, [], 0]);
        // Uden slutbilledet som facit: spol helt igennem og sammenlign som mængder.
        const end = seatingAt({ ...run, final: null }, frameCount(run));
        expect(end.map(g => [...g].sort())).toEqual([['a', 'c', 'd'], ['b', 'e'], []]);
        expect(playbackToRecording(null, input)).toBeNull();
    });
});

// En falsk tråd, så runNextEngine kan prøves uden en rigtig Worker.
function fakeWorker(behaviour) {
    const w = {
        terminated: false,
        posted: [],
        terminate() { this.terminated = true; },
        postMessage(m) { this.posted.push(m); behaviour(this, m); },
    };
    return w;
}

describe('runNextEngine — tråden, tidsgrænsen og Stop', () => {
    afterEach(() => { vi.useRealTimers(); abortNextEngine(); });

    it('giver svaret videre og lægger tråden til side (lukker den ikke)', async () => {
        let w;
        const result = await runNextEngine({}, { makeWorker: () => (w = fakeWorker((self, m) => {
            if (m.type === 'run') queueMicrotask(() => self.onmessage({ data: { type: 'answer', answer: { status: 'ok' } } }));
        })) });
        expect(result).toEqual({ kind: 'answer', answer: { status: 'ok' } });
        expect(w.terminated).toBe(false);
        dropIdleEngineWorker();
        expect(w.terminated).toBe(true);
    });

    // 89. gennemsyn: tråden genbruges efter et rent svar. (Grunden dengang,
    // hukommelse pr. lukket tråd, holdt ikke ved en måling med footprint i
    // 90.; genbruget er beholdt, og deploy-tjekket bygger på det.)
    describe('genbrug af tråden', () => {
        // Én fabrik til alle kørsler i testen (som den rigtige `defaultWorker`).
        function factory(answerWith = 'answer') {
            const made = [];
            const make = () => {
                const w = fakeWorker((self, m) => {
                    if (m.type !== 'run') return;
                    const data = answerWith === 'answer'
                        ? { type: 'answer', id: m.id, answer: { status: 'ok' } }
                        : { type: 'crash', id: m.id, message: 'bum' };
                    queueMicrotask(() => self.onmessage({ data }));
                });
                made.push(w);
                return w;
            };
            return { make, made };
        }
        afterEach(() => dropIdleEngineWorker());

        it('to rene kørsler bruger samme tråd, og hver kørsel har sit eget nummer', async () => {
            const f = factory();
            await runNextEngine({}, { makeWorker: f.make });
            await runNextEngine({}, { makeWorker: f.make });
            expect(f.made).toHaveLength(1);
            const ids = f.made[0].posted.filter(m => m.type === 'run').map(m => m.id);
            expect(ids).toHaveLength(2);
            expect(ids[0]).not.toBe(ids[1]);
            expect(f.made[0].terminated).toBe(false);
        });

        it('svar efter Stop: tråden genbruges også', async () => {
            vi.useFakeTimers();
            const f = factory();
            let w;
            const p = runNextEngine({}, { makeWorker: () => (w = f.make()) });
            // fakeWorker svarer selv; Stop, før svaret er kommet
            stopNextEngine();
            expect((await p).afterStop).toBe(true);
            expect(w.terminated).toBe(false);
        });

        it('en fejl lukker tråden, og næste kørsel får en ny', async () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const bad = factory('crash');
            expect((await runNextEngine({}, { makeWorker: bad.make })).kind).toBe('failed');
            expect(bad.made[0].terminated).toBe(true);
            await runNextEngine({}, { makeWorker: bad.make }).catch(() => {});
            expect(bad.made).toHaveLength(2);
            spy.mockRestore();
        });

        it('tavshed lukker tråden, og næste kørsel får en ny', async () => {
            vi.useFakeTimers();
            const made = [];
            const make = () => { const w = fakeWorker(() => {}); made.push(w); return w; };
            const p = runNextEngine({}, { silenceMs: 1000, makeWorker: make });
            vi.advanceTimersByTime(1001);
            expect((await p).kind).toBe('failed');
            expect(made[0].terminated).toBe(true);
            runNextEngine({}, { makeWorker: make });
            expect(made).toHaveLength(2);
        });

        it('en ny kørsel midt i en gammel lukker den gamle tråd', async () => {
            vi.useFakeTimers();
            const made = [];
            const make = () => { const w = fakeWorker(() => {}); made.push(w); return w; };
            const first = runNextEngine({}, { makeWorker: make });
            runNextEngine({}, { makeWorker: make });
            expect(await first).toEqual({ kind: 'cancelled' });
            expect(made).toHaveLength(2);
            expect(made[0].terminated).toBe(true);
            expect(made[1].terminated).toBe(false);
        });

        it('en besked med en anden kørsels nummer rører ingenting', async () => {
            vi.useFakeTimers();
            let w;
            const seen = [];
            const p = runNextEngine({}, { onProgress: (pr) => seen.push(pr), makeWorker: () => (w = fakeWorker(() => {})) });
            const id = w.posted[0].id;
            w.onmessage({ data: { type: 'progress', id: id - 1, progress: { attempt: 9 } } });
            w.onmessage({ data: { type: 'answer', id: id - 1, answer: { status: 'ok', groups: 'gammel' } } });
            w.onmessage({ data: { type: 'answer', id, answer: { status: 'ok', groups: 'ny' } } });
            expect(seen).toEqual([]);
            expect((await p).answer.groups).toBe('ny');
        });

        it('en anden fabrik får aldrig en tråd fra den forrige', async () => {
            const a = factory();
            const b = factory();
            await runNextEngine({}, { makeWorker: a.make });
            await runNextEngine({}, { makeWorker: b.make });
            expect(b.made).toHaveLength(1);
            expect(a.made[0].terminated).toBe(true);
        });
    });

    it('en fejl i motoren er en fejl, ikke et hængende løfte', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await runNextEngine({}, { makeWorker: () => fakeWorker((self, m) => {
            if (m.type === 'run') queueMicrotask(() => self.onmessage({ data: { type: 'crash', message: 'bum' } }));
        }) });
        expect(result.kind).toBe('failed');
        spy.mockRestore();
    });

    it('kan tråden ikke startes, falder den tilbage', async () => {
        const result = await runNextEngine({}, { makeWorker: () => { throw new Error('ingen Worker'); } });
        expect(result.kind).toBe('failed');
    });

    it('tavshed giver tilbagefald, men fremgang holder den i live', async () => {
        vi.useFakeTimers();
        const seen = [];
        let w;
        const p = runNextEngine({}, { silenceMs: 1000, onProgress: (pr) => seen.push(pr.attempt), makeWorker: () => (w = fakeWorker(() => {})) });
        vi.advanceTimersByTime(900);
        w.onmessage({ data: { type: 'progress', progress: { attempt: 1 } } });
        vi.advanceTimersByTime(900);     // stadig i live: fremgangen skubbede grænsen
        w.onmessage({ data: { type: 'progress', progress: { attempt: 2 } } });
        vi.advanceTimersByTime(1001);
        const result = await p;
        expect(seen).toEqual([1, 2]);
        expect(result).toEqual({ kind: 'failed', reason: 'den svarede ikke' });
        expect(w.terminated).toBe(true);
    });

    it('Stop beder om den foreløbig bedste og venter på svaret', async () => {
        vi.useFakeTimers();
        let w;
        const p = runNextEngine({}, { makeWorker: () => (w = fakeWorker(() => {})) });
        expect(stopNextEngine()).toBe(true);
        expect(w.posted.map(m => m.type)).toEqual(['run', 'cancel']);
        w.onmessage({ data: { type: 'answer', answer: { status: 'stopped', groups: null } } });
        expect(await p).toEqual({ kind: 'answer', answer: { status: 'stopped', groups: null }, afterStop: true });
    });

    it('Stop uden svar i tide: afbrudt, og grupperne bliver stående', async () => {
        vi.useFakeTimers();
        let w;
        const p = runNextEngine({}, { stopWaitMs: 500, makeWorker: () => (w = fakeWorker(() => {})) });
        stopNextEngine();
        vi.advanceTimersByTime(501);
        expect(await p).toEqual({ kind: 'cancelled' });
        expect(w.terminated).toBe(true);
    });

    it('afbrydelse uden at vente (ny kørsel) afslutter som afbrudt', async () => {
        vi.useFakeTimers();
        let w;
        const p = runNextEngine({}, { makeWorker: () => (w = fakeWorker(() => {})) });
        expect(abortNextEngine()).toBe(true);
        expect(await p).toEqual({ kind: 'cancelled' });
        expect(w.posted.map(m => m.type)).toEqual(['run', 'cancel']);
        // Et svar, der kommer bagefter, rører ingenting.
        w.onmessage({ data: { type: 'answer', answer: { status: 'ok' } } });
        vi.advanceTimersByTime(1000);
        expect(w.terminated).toBe(true);
        expect(abortNextEngine()).toBe(false);
    });
});

describe('tryNextEngine — Stop efterlader grupperne, som de var', () => {
    let worker;
    afterEach(() => {
        abortNextEngine();
        vi.unstubAllGlobals();
        state.currentClass = null;
        state.isGenerating = false;
        state.activeJobId = null;
    });

    // Motoren svarer først, når læreren har trykket Stop — og svaret er en
    // fejl eller bryder kontrakten. Før faldt appen så tilbage og dannede
    // grupperne med den nuværende motor i op til 10 sekunder mere.
    const afterStop = (answer) => async () => {
        vi.stubGlobal('Worker', function FakeWorker() { worker = fakeWorker(() => {}); return worker; });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        window.notifyInfo = vi.fn();
        state.currentClass = { ...makeClass(), filename: 'stop-test' };
        state.groupMode = 'size';
        state.storedStandardGroups = [];

        const p = tryNextEngine(false);
        expect(state.isGenerating).toBe(true);
        expect(stopNextEngine()).toBe(true);
        worker.onmessage({ data: { type: 'answer', answer } });

        expect(await p).toBe('done');
        expect(state.isGenerating).toBe(false);
        expect(state.activeJobId).toBe(null);
        expect(window.notifyInfo).toHaveBeenCalledWith('Gruppedannelsen blev stoppet. Dine nuværende grupper er urørte.');
        expect(window.notifyInfo.mock.calls.some(([t]) => t.includes('nuværende motor i stedet'))).toBe(false);
        vi.restoreAllMocks();
    };

    it('en fejl efter Stop', afterStop({ status: 'error', reason: { code: 'crash', text: 'Der skete en fejl inde i motoren.' } }));
    it('et "stopped"-svar, der bryder kontrakten', afterStop({ status: 'stopped', groups: [{ members: ['r1'] }] }));
    it('intet svar efter Stop', afterStop(undefined));
});

describe('tryNextEngine — et skævt svar lander helt eller slet ikke', () => {
    let worker;
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

    const oldGroups = () => [
        { name: 'Group 1', members: [{ id: 'r1' }, { id: 'r3' }] },
        { name: 'Group 2', members: [{ id: 'r2' }, { id: 'r4' }, { id: 'r5' }] },
    ];
    const answerWith = (extra) => ({
        status: 'ok',
        groups: [{ members: ['r1', 'r2'] }, { members: ['r3', 'r4', 'r5'] }],
        messages: [],
        rules: [],
        playback: null,
        ...extra,
    });
    const run = async (answer) => {
        vi.stubGlobal('Worker', function FakeWorker() { worker = fakeWorker(() => {}); return worker; });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        window.notifyInfo = vi.fn();
        window.notifyError = vi.fn();
        state.currentClass = { ...makeClass(), filename: 'skaevt-svar' };
        state.groupMode = 'size';
        state.storedStandardGroups = oldGroups();
        const p = tryNextEngine(false);
        worker.onmessage({ data: { type: 'answer', answer } });
        return p;
    };

    // En afspilning, der ikke kan læses, må ikke koste læreren grupperne:
    // før kastede playbackToRecording EFTER pushRun().
    it('en afspilning, der ikke kan læses: grupperne lander uden afspilning', async () => {
        const playback = { attempts: [{ deal: [null], groups: [['r1']], moves: [] }], best: 0 };
        expect(await run(answerWith({ playback }))).toBe('done');
        expect(state.storedStandardGroups.map(g => g.members)).toEqual([['r1', 'r2'], ['r3', 'r4', 'r5']]);
        expect(state.lastRecording.standard).toBe(null);
        expect(listRuns().length).toBe(1);
    });

    // En besked, der ikke kan læses, bryder kontrakten: ingen grupper, en
    // besked, der siger hvorfor. Intet skridt i historikken, og de gamle
    // grupper står urørte.
    it('en besked, der ikke kan læses: ingen grupper, grund i beskeden, historikken urørt', async () => {
        expect(await run(answerWith({ messages: [null] }))).toBe('done');
        expect(window.notifyError).toHaveBeenCalledWith(expect.stringMatching(/besked, der ikke kunne læses/));
        expect(state.isGenerating).toBe(false);
        expect(state.storedStandardGroups).toEqual(oldGroups());
        expect(listRuns().length).toBe(0);
    });

    // "Umulig" med en skæv besked kastede i showImpossible, EFTER at
    // isGenerating var slukket.
    it('"umulig" med en besked, der ikke kan læses: ingen grupper, og intet kaster', async () => {
        expect(await run({ status: 'impossible', messages: [null] })).toBe('done');
        expect(state.storedStandardGroups).toEqual(oldGroups());
    });
});

describe('samme sag og farve (kontrakt v3)', () => {
    it('nøglen er code + rule + pool + values + students (sorteret)', () => {
        const spread = { code: 'matrix-sources-spread', rule: null, pool: null, values: ['Ukraine', 'Island'], students: [], text: 'a' };
        expect(issueKey(spread)).toBe(issueKey({ ...spread, text: 'b', type: 'note' }));
        expect(issueKey({ code: 'rule-not-met', rule: 0, values: ['Pige'] })).not.toBe(issueKey({ code: 'rule-not-met', rule: 1, values: ['Pige'] }));
        expect(issueKey({ code: 'rule-not-met', rule: 0, pool: 'a' })).not.toBe(issueKey({ code: 'rule-not-met', rule: 0, pool: 'b' }));
        const avoid = (students) => ({ code: 'avoid-unavoidable', rule: null, pool: null, values: [], students });
        expect(issueKey(avoid(['r1', 'r2', 'r9']))).not.toBe(issueKey(avoid(['r2', 'r5', 'r7'])));
        expect(issueKey(avoid(['r9', 'r1', 'r2']))).toBe(issueKey(avoid(['r1', 'r2', 'r9'])));
    });

    it('en advarsel før kørslen og resultatet efter deler plads — pr. regel og pulje, pr. aftale', () => {
        const warn = { code: 'separate-unavoidable', rule: 0, pool: '2.a', values: ['18'], students: ['e2', 'e5'] };
        const result = { code: 'rule-not-met', rule: 0, pool: '2.a', values: [], students: [] };
        expect(issueKey(warn)).not.toBe(issueKey(result));
        expect(replacedByResult(warn, new Set(noteKeys(result)))).toBe(true);
        expect(replacedByResult(warn, new Set(noteKeys({ ...result, pool: '2.b' })))).toBe(false);
        // Undgå hinanden: kun resultatet for SAMME aftale.
        const avoidWarn = { code: 'avoid-unavoidable', rule: null, pool: null, values: [], students: ['r2', 'r1'] };
        const avoidRes = (students) => ({ code: 'rule-not-met', rule: null, pool: null, values: [], students });
        expect(replacedByResult(avoidWarn, new Set(noteKeys(avoidRes(['r1', 'r2']))))).toBe(true);
        expect(replacedByResult(avoidWarn, new Set(noteKeys(avoidRes(['r1', 'r2', 'r3']))))).toBe(false);
        // Kun advarsler afløses; matrix-kildernes resultat (uden regel og elever) har ingen plads.
        expect(replacedByResult(result, new Set(noteKeys(result)))).toBe(false);
        expect(resultSlot({ code: 'rule-not-met', rule: null, values: ['A'], students: [] })).toBeNull();
    });

    it('farven følger type: rød kun for umulig — en konflikt er blå som en note', () => {
        expect(severityOf({ type: 'impossible', code: 'separate-unavoidable' }, 'ok')).toBe('error');
        expect(severityOf({ type: 'conflict', code: 'opposing-rules' }, 'ok')).toBe('info');
        expect(severityOf({ type: 'conflict', code: 'duplicate-rule' }, 'impossible')).toBe('error');
        expect(severityOf({ type: 'note', code: 'rule-not-met', unavoidable: true }, 'ok')).toBe('info');
        expect(severityOf({ type: 'note', code: 'rule-not-met', likelyBest: true }, 'ok')).toBe('info');
        expect(severityOf({ type: 'note', code: 'matrix-sources-spread' }, 'ok')).toBe('info');
        expect(severityOf({ type: 'note', code: 'topic-rounding' }, 'impossible')).toBe('error');
    });

    it('samme nøgle to gange i ét svar (lover kontrakten aldrig sker): den sidste står', () => {
        const msgs = [
            { code: 'rule-not-met', rule: 0, values: ['Pige'], text: 'før' },
            { code: 'small-pool', rule: null, pool: 'x', text: 'pulje' },
            { code: 'rule-not-met', rule: 0, values: ['Pige'], text: 'efter' },
        ];
        expect(dedupeAnswerMessages(msgs).map(m => m.text)).toEqual(['pulje', 'efter']);
    });
});

describe('attemptsText — hvilket forsøg grupperne kom fra', () => {
    it('vinderen, antallet og de lige så gode', () => {
        expect(attemptsText({ attempts: 20, winner: 13, sameAsWinner: 9 })).toBe('Forsøg 13 af 20 – det bedste. 9 andre forsøg endte lige så godt.');
        expect(attemptsText({ attempts: 20, winner: 13, sameAsWinner: 1 })).toBe('Forsøg 13 af 20 – det bedste. 1 andet forsøg endte lige så godt.');
        expect(attemptsText({ attempts: 37, winner: 2, sameAsWinner: 0 })).toBe('Forsøg 2 af 37 – det bedste.');
    });

    it('ingenting uden tal: Stop før første forsøg, intet stats, eller v2-svar', () => {
        expect(attemptsText({ attempts: 0, winner: null, sameAsWinner: null })).toBe('');
        expect(attemptsText(undefined)).toBe('');
        expect(attemptsText({ attempts: 20, seconds: 1 })).toBe('');
    });
});

describe('tryNextEngine — ugyldigt input: motorens besked, ingen grupper', () => {
    let worker;
    afterEach(() => {
        abortNextEngine();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        state.currentClass = null;
        state.isGenerating = false;
        state.activeJobId = null;
    });

    it('"unsupported" med "invalid-input": motorens tekst, grupperne står urørte', async () => {
        vi.stubGlobal('Worker', function FakeWorker() { worker = fakeWorker(() => {}); return worker; });
        window.notifyInfo = vi.fn();
        state.currentClass = { ...makeClass(), filename: 'ugyldigt' };
        state.groupMode = 'size';
        state.storedStandardGroups = [];
        const p = tryNextEngine(false);
        worker.onmessage({ data: { type: 'answer', answer: {
            contractVersion: 3, status: 'unsupported',
            reason: { code: 'invalid-input', text: 'Der er ingen elever at danne grupper af.' },
        } } });
        expect(await p).toBe('done');
        expect(window.notifyInfo).toHaveBeenCalledWith('Grupperne blev ikke dannet. '
            + 'Der er ingen elever at danne grupper af. Dine nuværende grupper er urørte.');
        expect(state.isGenerating).toBe(false);
        expect(state.storedStandardGroups).toEqual([]);
    });
});

describe('runStatusFor — mærkerne hører kun til sidste kørsel', () => {
    let worker;
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

    it('efter kørslen: et mærke pr. regel — væk, når rækkefølgen, en elev eller motoren skifter', async () => {
        vi.stubGlobal('Worker', function FakeWorker() { worker = fakeWorker(() => {}); return worker; });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        window.notifyInfo = vi.fn();
        state.currentClass = { ...makeClass(), filename: 'maerker' };
        state.groupMode = 'size';
        state.storedStandardGroups = [];
        const p = tryNextEngine(false);
        // Input'ets regler står efter trin: Adskil 12 (klassens 2), Adskil 02 (3),
        // Fordel (0), Balancér (1). Klyng uden kolonne (4) sendes ikke.
        worker.onmessage({ data: { type: 'answer', answer: {
            contractVersion: 3, status: 'ok',
            groups: [{ members: ['r1', 'r2'] }, { members: ['r3', 'r4', 'r5'] }],
            rules: [{ rule: 0, met: false }, { rule: 1, met: true }, { rule: 2, met: true }, { rule: 3, met: null }],
            messages: [{ type: 'note', code: 'rule-not-met', rule: 0, pool: null, values: [], students: [], text: 'x', unavoidable: true }],
            playback: null, stats: { attempts: 3, winner: 1, sameAsWinner: 2 },
        } } });
        expect(await p).toBe('done');

        const marks = () => runStatusFor(false)?.rules || null;
        expect(marks()).toEqual({
            2: { state: 'best', label: 'Ikke helt — det bedst mulige' },
            3: { state: 'met', label: 'Opfyldt' },
            0: { state: 'met', label: 'Opfyldt' },
            1: { state: 'unmeasured', label: 'Ikke målt' },
        });

        // En regel uden kolonne FORREST i listen (sendes ikke til motoren)
        // slettes: input er det samme, men alle pladser rykker — ingen mærker.
        state.currentClass.rules.unshift({ type: 'cluster', column: '' });
        expect(marks()).toBeNull();          // nu er pladserne forskudt den anden vej
        state.currentClass.rules.shift();
        expect(marks()).not.toBeNull();

        // Rækkefølgen ændret efter kørslen: ingen mærker. Byttet tilbage: igen.
        const rules = state.currentClass.rules;
        [rules[0], rules[1]] = [rules[1], rules[0]];
        expect(marks()).toBeNull();
        [rules[0], rules[1]] = [rules[1], rules[0]];
        expect(marks()).not.toBeNull();

        // En celle i en regels kolonne ændret: ingen mærker.
        const before = state.currentClass.data[0].Køn;
        state.currentClass.data[0].Køn = 'Dreng';
        expect(marks()).toBeNull();
        state.currentClass.data[0].Køn = before;
        expect(marks()).not.toBeNull();

        // En elev flyttet i hånden: grupperne er ikke kørslens længere.
        const groups = state.storedStandardGroups;
        const moved = groups[1].members.pop();
        groups[0].members.push(moved);
        expect(marks()).toBeNull();
        groups[0].members.pop();
        groups[1].members.push(moved);
        expect(marks()).not.toBeNull();

    });
});
