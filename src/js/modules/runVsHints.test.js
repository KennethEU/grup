// Motorens beskeder EFTER kørslen mod appens advarsler over grupperne
// (gennemsyn 102, 13/11 2026) — søster til hintsVsEngine.test.js, som tog
// tjekket FØR kørslen.
//
// Efter "Dan grupper" står der tre slags beskeder om det samme resultat:
//   1. motorens resultat under "Sidste dannelse" ("Undgå hinanden: Anna og Bo
//      … står i samme gruppe (Gruppe 3)"),
//   2. appens egne advarsler over grupperne, målt på kortene
//      ("Undgåelse brudt: Anna og Bo i Gruppe 3 står sammen"),
//   3. motorens tjek af opskriften, som den ser ud nu (check()).
// De må ikke sige hver sit: samme elever, samme gruppe, og en advarsel fra
// tjekket skal vige for resultatet — men KUN mens resultatet handler om det,
// der står nu.
//
// Her køres motoren rigtigt (kort budget, fast frø) på tilfældige klasser, og
// svaret lægges på skærmen, som landAnswer gør det (numre uden om de låste,
// noterne med deres nøgler, aftrykket af kørslens input).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./classActions.js', () => ({ autoSave: vi.fn() }));
vi.mock('./generation.js', () => ({ generateMatrixGroups: vi.fn(), generateWithoutTogether: vi.fn() }));
// engineCheck er normalt svaret fra motorens tråd. Her er det en ref, testen
// selv fylder med svaret fra check() — resten af nextEngine.js er den ægte.
vi.mock('./nextEngine.js', async (importOriginal) => {
    const original = await importOriginal();
    const { ref } = await import('vue');
    return { ...original, engineCheck: ref(null) };
});

import {
    buildEngineInput, engineCheck, APP_OWNED_CODES, freeNumbers, fillMessageText, severityOf, noteKeys,
    dedupeAnswerMessages, lastRunStatus, inputFingerprint, replacedByResult, issueKey,
} from './nextEngine.js';
import { state } from './state.js';
import { brokenSeparations, groupDisplayName, setupSignature, valueKey } from './utils.js';
import { beginRun, announce, commitRun, clearSetupNotices, setupNotices } from './setupNotices.js';
import { allHints } from './hints.js';
import { currentLastNotes } from './recipe.js';
import { check, run } from '../../../motor/engine/engine.js';

function rng(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
const pick = (R, list) => list[Math.floor(R() * list.length)];
const BUDGET = { maxSeconds: 1, maxAttempts: 2, minAttempts: 1 };

function randomClass(R) {
    const n = 6 + Math.floor(R() * 19);
    const data = Array.from({ length: n }, (_, k) => ({
        _rowId: 'r' + (k + 1), Navn: 'Elev ' + (k + 1),
        Køn: pick(R, ['Dreng', 'Pige', 'Pige', '']), Hold: pick(R, ['a', 'a', 'b']),
        _excluded: R() < 0.1,
    }));
    const rules = [];
    const ruleCount = Math.floor(R() * 3);
    for (let i = 0; i < ruleCount; i++) {
        const type = pick(R, ['separate', 'strict_separate', 'cluster', 'distribute', 'aggregate']);
        const rule = { type, column: type === 'aggregate' ? 'Hold' : 'Køn' };
        if (type === 'separate' || type === 'strict_separate') rule.value = pick(R, ['Dreng', 'Pige']);
        rules.push(rule);
    }
    // Undgå hinanden: op til tre aftaler med 2–5 elever (også fraværende).
    const someIds = (count) => {
        const ids = new Set();
        while (ids.size < count) ids.add(pick(R, data)._rowId);
        return [...ids];
    };
    const separations = Array.from({ length: Math.floor(R() * 4) }, () => ({ ids: someIds(2 + Math.floor(R() * 4)) }));
    const groupMode = R() < 0.6 ? 'size' : 'number';
    const cls = {
        filename: 'tilfaeldig', columns: ['Navn', 'Køn', 'Hold'], data, rules,
        togetherGroups: [], separations, topics: [], columnOrders: {},
        settings: { groupTarget: String(groupMode === 'size' ? 2 + Math.floor(R() * 4) : 2 + Math.floor(R() * 5)), groupMod: pick(R, ['+', '-']), groupMode },
    };
    // Indimellem en låst gruppe 2 (så de nye numre springer over 2).
    const present = data.filter(r => !r._excluded);
    const locked = (R() < 0.35 && present.length > 5)
        ? [{ name: 'Group 2', locked: true, members: present.slice(0, 2 + Math.floor(R() * 2)).map(r => r._rowId) }]
        : [];
    return { cls, groupMode, locked };
}

function setClass({ cls, groupMode }, groups) {
    state.currentClass = cls;
    state.activeView = 'standard';
    state.groupMode = groupMode;
    state.idColumn = '_rowId';
    state.displayColumn = 'Navn';
    state.storedStandardGroups = groups;
    state.storedMatrixGroups = [];
}

const inputNow = ({ cls, groupMode }, isMatrix = false) => buildEngineInput({
    cls, isMatrix, groupMode,
    viewGroups: isMatrix ? state.storedMatrixGroups : state.storedStandardGroups,
    homeGroups: state.storedStandardGroups,
});

/** Giv hints.js motorens tjek af det, der står nu (som engineCheck gør). */
function refreshCheck(setup, isMatrix = false) {
    const input = inputNow(setup, isMatrix);
    const answer = input ? check(input) : null;
    const usable = answer && answer.status !== 'error' && answer.status !== 'unsupported';
    engineCheck.value = usable
        ? { input, status: answer.status, messages: answer.messages.filter(m => !APP_OWNED_CODES.has(m.code)) }
        : null;
    return usable ? answer : null;
}

/**
 * Læg et svar på skærmen som landAnswer (den rene del): numre uden om de
 * låste, noterne under "Sidste dannelse" med deres nøgler, og kørslens aftryk.
 * Ændres landAnswers numre eller noter, så ret den med.
 */
function land(setup, input, answer, { isMatrix = false, locked = setup.locked } = {}) {
    const view = isMatrix ? 'matrix' : 'standard';
    const numbers = freeNumbers(answer.groups.length, input.lockedGroups.map(g => g.number));
    const newGroups = answer.groups.map((g, i) => ({ name: `Group ${numbers[i]}`, members: g.members.slice(), topic: (!isMatrix && g.topic) || null }));
    const groupNames = newGroups.map(g => g.name);
    const nameOf = (id) => setup.cls.data.find(r => r._rowId === id)?.Navn;
    const fill = { studentName: nameOf, groupName: (i) => (groupNames[i] ? groupDisplayName(groupNames[i]) : null) };
    beginRun(view);
    const texts = [];
    for (const m of dedupeAnswerMessages(answer.messages)) {
        if (APP_OWNED_CODES.has(m.code)) continue;
        const text = fillMessageText(m, fill);
        texts.push({ m, text });
        announce(text, severityOf(m, answer.status), noteKeys(m));
    }
    commitRun(setupSignature(setup.cls, isMatrix, setup.groupMode));
    const finalGroups = [...locked, ...newGroups];
    if (isMatrix) state.storedMatrixGroups = finalGroups;
    else state.storedStandardGroups = finalGroups;
    lastRunStatus[view] = { input: inputFingerprint(input), groups: '', skipTogether: [] };
    return { finalGroups, groupNames, texts };
}

/** Gruppenavnene ("Gruppe 3"), en udfyldt besked nævner. */
const namedGroups = (text) => [...text.matchAll(/Gruppe \d+/g)].map(x => x[0]);

beforeEach(() => {
    clearSetupNotices();
    lastRunStatus.standard = null;
    lastRunStatus.matrix = null;
    engineCheck.value = null;
});

const N = Number(process.env.N) || 300;
const SEED = Number(process.env.SEED) || 102;

describe('efter kørslen siger motoren og appen det samme', () => {
    it('Undgå hinanden: samme elever i samme gruppe, og gruppenavnet er kortets (også med en låst gruppe)', async () => {
        const R = rng(SEED);
        let runs = 0, brokenRuns = 0, withLock = 0, adskilNamed = 0, leftovers = 0;
        for (let i = 0; i < N; i++) {
            const setup = randomClass(R);
            clearSetupNotices();
            lastRunStatus.standard = null;
            setClass(setup, setup.locked);
            const input = inputNow(setup);
            if (!input) continue;
            const answer = await run({ ...input, seed: 7, budget: BUDGET }, {});
            if (answer.status !== 'ok') continue;
            runs++;
            const { finalGroups, texts } = land(setup, input, answer);
            const context = () => JSON.stringify({ i, setup, groups: finalGroups, texts: texts.map(t => t.text) });
            const byId = new Map(setup.cls.data.map(r => [r._rowId, r]));
            const byName = new Map(finalGroups.map(g => [groupDisplayName(g.name), g]));

            // (a) + (c): motorens resultat om en aftale nævner netop de kort,
            // hvor to af aftalens elever står sammen.
            const appBroken = brokenSeparations(finalGroups, setup.cls.separations, byId).filter(b => !b.locked);
            const motorAvoid = texts.filter(t => t.m.code === 'rule-not-met' && t.m.rule === null && t.m.students.length > 0);
            if (appBroken.length) brokenRuns++;
            if (setup.locked.length && motorAvoid.length) withLock++;
            for (const { m, text } of motorAvoid) {
                const named = namedGroups(text);
                expect(named.length, context()).toBeGreaterThan(0);
                for (const name of named) {
                    const group = byName.get(name);
                    expect(group, context()).toBeTruthy();
                    expect(group.locked, context()).toBeFalsy();
                    const together = group.members.filter(id => m.students.includes(id));
                    expect(together.length, context()).toBeGreaterThanOrEqual(2);
                }
            }
            for (const b of appBroken) {
                const name = groupDisplayName(b.groupName);
                const said = motorAvoid.some(t => namedGroups(t.text).includes(name) && b.ids.every(id => t.m.students.includes(id)));
                expect(said, context()).toBe(true);
            }

            // Appens advarsel over grupperne står der netop, når kortene har et brud.
            refreshCheck(setup);
            const hints = allHints.value;
            const anyBroken = brokenSeparations(finalGroups, setup.cls.separations, byId).length > 0;
            expect(hints.some(h => h.id.startsWith('hint:avoid-broken:')), context()).toBe(anyBroken);

            // (c) Adskil: de nævnte kort har mindst to med den valgte værdi.
            for (const { m, text } of texts) {
                const rule = Number.isInteger(m.rule) ? input.rules[m.rule] : null;
                if (m.code !== 'rule-not-met' || !rule || !['separate', 'strict_separate'].includes(rule.type)) continue;
                const keys = new Set(rule.values.map(valueKey));
                for (const name of namedGroups(text)) {
                    const group = byName.get(name);
                    expect(group, context()).toBeTruthy();
                    const marked = group.members.filter(id => keys.has(valueKey(byId.get(id)[rule.column])));
                    expect(marked.length, context()).toBeGreaterThanOrEqual(2);
                    adskilNamed++;
                }
            }

            // (b) Lige efter kørslen står ingen rød advarsel fra tjekket i
            // opskriften om noget, resultatet allerede har sagt: hver advarsel
            // om "kan ikke undgås" er afløst af resultatet på samme plads.
            const lastKeys = new Set(setupNotices.last.standard.flatMap(n => n.keys || []));
            for (const m of engineCheck.value?.messages || []) {
                if (!['separate-unavoidable', 'cluster-unavoidable', 'avoid-unavoidable'].includes(m.code)) continue;
                const gone = lastKeys.has(issueKey(m)) || replacedByResult(m, lastKeys);
                expect(gone, context()).toBe(true);
            }
            leftovers += hints.filter(h => h.id.startsWith('engine:') && h.kind === 'conflict').length;
        }
        // Udsnittet skal nå det, testen handler om.
        expect(runs).toBeGreaterThan(100);
        expect(brokenRuns).toBeGreaterThan(10);
        expect(withLock).toBeGreaterThan(2);
        expect(adskilNamed).toBeGreaterThan(5);
        expect(leftovers).toBe(0);
    }, 600000);
});

describe('et gammelt resultat skjuler ikke en ny advarsel', () => {
    // Otte drenge i fire grupper: Adskil kan ikke gå op, og resultatet siger
    // det. Låser læreren bagefter to grupper UDEN drenge, skal de otte drenge
    // i de to grupper, der er tilbage — det er en ny og værre advarsel, og den
    // skal ses, selv om "Sidste dannelse" har et resultat om samme regel.
    const makeSetup = () => {
        const data = Array.from({ length: 16 }, (_, k) => ({
            _rowId: 'r' + (k + 1), Navn: 'Elev ' + (k + 1), Køn: k < 12 ? 'Dreng' : 'Pige',
        }));
        const cls = {
            filename: 'laas', columns: ['Navn', 'Køn'], data,
            rules: [{ type: 'separate', column: 'Køn', value: 'Dreng' }],
            togetherGroups: [], separations: [], topics: [], columnOrders: {},
            settings: { groupTarget: '4', groupMod: '+', groupMode: 'size' },
        };
        return { cls, groupMode: 'size', locked: [] };
    };

    it('lige efter kørslen er advarslen afløst af resultatet; efter en låsning kommer den nye advarsel', async () => {
        const setup = makeSetup();
        setClass(setup, []);
        const input = inputNow(setup);
        const answer = await run({ ...input, seed: 7, budget: BUDGET }, {});
        expect(answer.status).toBe('ok');
        land(setup, input, answer);
        expect(setupNotices.last.standard.some(n => /par ender i samme gruppe/.test(n.text))).toBe(true);

        refreshCheck(setup);
        expect(allHints.value.filter(h => h.id.startsWith('engine:'))).toEqual([]);

        // Lås de to første grupper (samme opskrift, samme antal til stede —
        // aftrykket for "Sidste dannelse" er uændret).
        state.storedStandardGroups = state.storedStandardGroups.map((g, i) => (i < 2 ? { ...g, locked: true } : g));
        const after = refreshCheck(setup);
        expect(after.messages.some(m => m.code === 'separate-unavoidable')).toBe(true);
        const shown = allHints.value.filter(h => h.id.startsWith('engine:'));
        expect(shown.map(h => h.kind)).toContain('conflict');
    });
});

// ─── Matrix-runden (gennemsyn 103, 13/11 2026) ──────────────────────────────
// Det samme som ovenfor, men i runde 2: kortene er matrixgrupper, kilderne er
// stamgrupperne fra en RIGTIG stamkørsel (eller deres emner), og Undgå
// hinanden gælder også her. Hver anden gang låses en matrixgruppe, og
// matrix dannes én gang til, så de nye numre springer over den låste.
describe('matrix: efter kørslen siger motoren og appen det samme', () => {
    const MATRIX_RULES = ['separate', 'strict_separate', 'cluster', 'distribute'];

    it('Undgå hinanden nævner matrixkortene, og tjekkets advarsler er afløst af resultatet', async () => {
        const R = rng(SEED + 1);
        let runs = 0, brokenRuns = 0, withLock = 0, withTopics = 0, leftovers = 0;
        for (let i = 0; i < N; i++) {
            const setup = randomClass(R);
            setup.locked = [];
            const { cls } = setup;
            if (R() < 0.5) cls.topics = ['Klima', 'EU', 'Velfærd'].slice(0, 1 + Math.floor(R() * 3));
            cls.matrixRules = Array.from({ length: Math.floor(R() * 3) }, () => {
                const type = pick(R, MATRIX_RULES);
                const rule = { type, column: pick(R, ['Køn', 'Hold']) };
                if (type === 'separate' || type === 'strict_separate') rule.value = pick(R, ['Dreng', 'Pige', 'a']);
                return rule;
            });
            cls.matrixSettings = {
                groupTarget: String(2 + Math.floor(R() * 4)), groupMod: pick(R, ['+', '-']),
                matrixStrategy: pick(R, ['full_strict', 'size', 'count']),
                matrixRepresentationType: pick(R, ['topic', 'group']),
            };
            clearSetupNotices();
            lastRunStatus.standard = null;
            lastRunStatus.matrix = null;
            setClass(setup, []);

            // Runde 1: stamgrupperne, dannet af motoren.
            const homeInput = inputNow(setup, false);
            if (!homeInput) continue;
            const home = await run({ ...homeInput, seed: 7, budget: BUDGET }, {});
            if (home.status !== 'ok') continue;
            land(setup, homeInput, home);

            // Runde 2: matrix — og indimellem én gang til med en låst gruppe.
            state.activeView = 'matrix';
            let landed = null;
            let input = null;
            for (let round = 0; round < 2; round++) {
                const locked = round === 1
                    ? state.storedMatrixGroups.filter(g => g.name === 'Group 2').map(g => ({ ...g, locked: true }))
                    : [];
                if (round === 1) {
                    if (!locked.length || R() < 0.5) break;
                    state.storedMatrixGroups = state.storedMatrixGroups.map(g => (g.name === 'Group 2' ? locked[0] : g));
                }
                const next = inputNow(setup, true);
                if (!next) break;
                const answer = await run({ ...next, seed: 7, budget: BUDGET }, {});
                if (answer.status !== 'ok') break;
                input = next;
                landed = land(setup, input, answer, { isMatrix: true, locked });
                if (round === 1) withLock++;
            }
            if (!landed) continue;
            runs++;
            if (input.matrix.homeGroups.some(g => g.topic)) withTopics++;
            const { finalGroups, texts } = landed;
            const context = () => JSON.stringify({ i, cls, home: state.storedStandardGroups, groups: finalGroups, texts: texts.map(t => t.text) });
            const byId = new Map(cls.data.map(r => [r._rowId, r]));
            const byName = new Map(finalGroups.map(g => [groupDisplayName(g.name), g]));

            // Motorens resultat om en aftale nævner netop de MATRIXkort, hvor
            // to af aftalens elever står sammen — og omvendt.
            const appBroken = brokenSeparations(finalGroups, cls.separations, byId).filter(b => !b.locked);
            const motorAvoid = texts.filter(t => t.m.code === 'rule-not-met' && t.m.rule === null && t.m.students.length > 0);
            if (appBroken.length) brokenRuns++;
            for (const { m, text } of motorAvoid) {
                const named = namedGroups(text);
                expect(named.length, context()).toBeGreaterThan(0);
                for (const name of named) {
                    const group = byName.get(name);
                    expect(group, context()).toBeTruthy();
                    expect(group.locked, context()).toBeFalsy();
                    expect(group.members.filter(id => m.students.includes(id)).length, context()).toBeGreaterThanOrEqual(2);
                }
            }
            for (const b of appBroken) {
                const name = groupDisplayName(b.groupName);
                const said = motorAvoid.some(t => namedGroups(t.text).includes(name) && b.ids.every(id => t.m.students.includes(id)));
                expect(said, context()).toBe(true);
            }

            // Appens advarsel over matrixkortene står der netop, når de har et brud.
            refreshCheck(setup, true);
            const hints = allHints.value;
            const anyBroken = brokenSeparations(finalGroups, cls.separations, byId).length > 0;
            expect(hints.some(h => h.id.startsWith('hint:avoid-broken:')), context()).toBe(anyBroken);

            // Lige efter kørslen er hver "kan ikke undgås" fra tjekket afløst.
            const lastKeys = new Set(setupNotices.last.matrix.flatMap(n => n.keys || []));
            for (const m of engineCheck.value?.messages || []) {
                if (!['separate-unavoidable', 'cluster-unavoidable', 'avoid-unavoidable'].includes(m.code)) continue;
                expect(lastKeys.has(issueKey(m)) || replacedByResult(m, lastKeys), context()).toBe(true);
            }
            leftovers += hints.filter(h => h.id.startsWith('engine:') && h.kind === 'conflict').length;
        }
        expect(runs).toBeGreaterThan(100);
        expect(brokenRuns).toBeGreaterThan(10);
        expect(withLock).toBeGreaterThan(10);
        expect(withTopics).toBeGreaterThan(20);
        expect(leftovers).toBe(0);
    }, 600000);
});

describe('matrix: "Sidste dannelse" gælder kun den opskrift, kørslen fik', () => {
    // Otte elever i to stamgrupper, to matrixgrupper, og tre elever, der skal
    // undgå hinanden: to af dem må stå sammen, og resultatet siger det.
    const makeSetup = () => {
        const data = Array.from({ length: 8 }, (_, k) => ({ _rowId: 'r' + (k + 1), Navn: 'Elev ' + (k + 1) }));
        const cls = {
            filename: 'matrix', columns: ['Navn'], data, rules: [], matrixRules: [],
            togetherGroups: [], separations: [{ ids: ['r1', 'r2', 'r3'] }], topics: [], columnOrders: {},
            settings: { groupTarget: '2', groupMod: '+', groupMode: 'number' },
            matrixSettings: { groupTarget: '2', groupMod: '+', matrixStrategy: 'count', matrixRepresentationType: 'group' },
        };
        return { cls, groupMode: 'number', locked: [] };
    };
    const runMatrix = async () => {
        const setup = makeSetup();
        // Stamgrupperne lagt i hånden, så aftalen ikke er brudt i runde 1.
        setClass(setup, [
            { name: 'Group 1', members: ['r1', 'r4', 'r5', 'r6'] },
            { name: 'Group 2', members: ['r2', 'r3', 'r7', 'r8'] },
        ]);
        state.activeView = 'matrix';
        const input = inputNow(setup, true);
        const answer = await run({ ...input, seed: 7, budget: BUDGET }, {});
        expect(answer.status).toBe('ok');
        land(setup, input, answer, { isMatrix: true, locked: [] });
        expect(setupNotices.last.matrix.some(n => /står i samme gruppe/.test(n.text))).toBe(true);
        return setup;
    };
    const notesNow = (setup) => currentLastNotes(setupNotices, setup.cls, true, setup.groupMode);

    it('fjernes aftalen bagefter, står resultatet om den ikke længere under "Sidste dannelse"', async () => {
        const setup = await runMatrix();
        expect(notesNow(setup).length).toBeGreaterThan(0);
        setup.cls.separations = [];
        expect(notesNow(setup)).toEqual([]);
    });

    it('skiftes der fra "én fra hver stamgruppe" til "ét fra hvert emne", gælder noterne ikke mere', async () => {
        const setup = await runMatrix();
        setup.cls.matrixSettings = { ...setup.cls.matrixSettings, matrixRepresentationType: 'topic' };
        expect(notesNow(setup)).toEqual([]);
    });
});
