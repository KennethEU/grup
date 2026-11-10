// Hele kæden med tilfældige, skæve klasser (gennemsyn 81, 10/11 2026):
// buildEngineInput → motoren → contractProblem, dommeren og beskedteksterne.
//
// Klasserne er små og mærkelige med vilje: 1–24 elever, fraværende, låste
// grupper, aftaler med fraværende, låste og slettede elever, overlappende
// Skal sammen, tomme celler, regler uden kolonne, emner med mellemrum, matrix
// med alle tre størrelser. Testen holder løfterne i kontrakten
// (docs/grupper-js-motor-kontrakt.md) på BEGGE sider: appens input er gyldigt
// (ingen fraværende eller låste i students, blokkene overlapper ikke, ingen
// Opdel i matrix), motoren fejler aldrig, svaret består appens eget tjek og
// dommerens faste krav, og ingen besked har en pladsholder tilbage. Et svar
// med grupper køres også gennem appens rene led, der lægger det på skærmen:
// nye gruppenumre uden om de låstes (freeNumbers), afspilningen ender i
// svarets grupper (playbackToRecording + seatingAt), ét mærke pr. regel i
// opskriften (ruleMarks) og beskedernes nøgler/farve. Stop midt i en kørsel
// prøves for sig (nederst): motoren kigger kun efter Stop hver 150 ms, så de
// små klasser er færdige, før den ser det.
//
// Som sonde kørte kæden til og med beskederne 51.000 klasser uden ét fund (frø 1–7). Her kører et
// fast udsnit, så den er hurtig og altid giver det samme. Vil du lede bredere:
// SEED=8 N=6000 npx vitest run src/js/modules/engineChain.test.js
import { it, expect } from 'vitest';
import {
    buildEngineInput, contractProblem, fillMessageText, freeNumbers, playbackToRecording,
    ruleSources, severityOf, issueKey, dedupeAnswerMessages, groupNumberOf,
} from './nextEngine.js';
import { ruleMarks } from './ruleMarks.js';
import { seatingAt, frameCount } from './replay.js';
import { run } from '../../../motor/engine/engine.js';
import { judge } from '../../../motor/judge/judge.mjs';

function rng(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function makeCase(R, size = null) {
    const pick = (a) => a[Math.floor(R() * a.length)];
    const int = (a, b) => a + Math.floor(R() * (b - a + 1));
    const n = size ?? pick([1, 2, 3, 4, 5, 7, 9, 13, 24]);
    const data = [];
    for (let i = 1; i <= n; i++) {
        data.push({
            _rowId: 'r' + i, Navn: 'E' + i,
            Køn: pick(['Pige', 'Dreng', ' pige', '', null]),
            Tal: pick([1, '2', '3,5', '', 'x', 12, null]),
            Niveau: pick(['Lav', 'Middel', 'Høj', '']),
            ...(R() < 0.2 ? { _excluded: true } : {}),
        });
    }
    const ids = data.map(r => r._rowId);
    const sub = () => [...ids.filter(() => R() < 0.25), ...(R() < 0.2 ? ['slettet' + int(1, 3)] : [])];
    const types = ['aggregate', 'strict_separate', 'separate', 'cluster', 'distribute', 'balance', 'minimizediff', 'group_sort'];
    const mkRules = () => {
        const out = [];
        for (let k = int(0, 3); k > 0; k--) {
            const r = { type: pick(types), column: pick(['Køn', 'Tal', 'Niveau', '']) };
            if (r.type.includes('separate')) r.values = [pick(['Pige', '12', 'Høj', 'x'])];
            out.push(r);
        }
        return out;
    };
    const isMatrix = R() < 0.3;
    // Grupperne i visningen: nogle låste. Matrix har stamgrupperne som kilde.
    const shuffled = ids.slice().sort(() => R() - 0.5);
    const groups = [];
    let i = 0;
    while (i < shuffled.length) {
        const k = int(1, 4);
        groups.push({ name: 'Group ' + (groups.length + 1), locked: R() < 0.25, members: shuffled.slice(i, i + k).map(id => ({ id })), topic: pick([null, 'Klima', 'Migration']) });
        i += k;
    }
    const cls = {
        data,
        rules: mkRules(),
        matrixRules: mkRules(),
        columnOrders: R() < 0.3 ? { Niveau: ['Lav', 'Middel', 'Høj'] } : {},
        togetherGroups: R() < 0.5 ? [{ ids: sub() }, { ids: sub() }] : [],
        separations: R() < 0.5 ? [{ ids: sub() }] : [],
        topics: R() < 0.4 ? ['Klima', 'Migration', ' '].slice(0, int(1, 3)) : [],
        settings: { groupTarget: pick([2, 3, '4', 5]), groupMod: pick(['+', '-']) },
        matrixSettings: { groupTarget: pick([2, 3, 6]), matrixStrategy: pick(['full_strict', 'count', 'size']), matrixRepresentationType: pick(['topic', 'group']) },
    };
    return {
        cls, isMatrix,
        groupMode: pick(['size', 'number']),
        viewGroups: isMatrix ? groups.map(g => ({ ...g, locked: R() < 0.15, name: 'M' + g.name })) : groups,
        homeGroups: isMatrix ? groups.map(g => ({ ...g, locked: false })) : [],
        topicFor: () => null,
    };
}

// Appens rene led, når et svar med grupper lægges på skærmen (landAnswer).
function checkLanding(input, answer, inv) {
    const groups = answer.groups.map(g => g.members);
    const lockedNumbers = input.lockedGroups.map(g => g.number);
    const numbers = freeNumbers(groups.length, lockedNumbers);
    if (numbers.length !== groups.length || numbers.some(n => lockedNumbers.includes(n)) || new Set(numbers).size !== numbers.length) {
        inv.push('gruppenumre ' + numbers + ' mod låste ' + lockedNumbers);
    }
    const recording = playbackToRecording(answer.playback, input);
    if (answer.status === 'ok' && !recording) inv.push('ingen afspilning ved ok');
    if (recording) {
        const runRec = recording.runs[0];
        const end = seatingAt({ ...runRec, final: null }, frameCount(runRec));
        const asSets = (list) => JSON.stringify(list.map(g => [...g].sort()));
        if (asSets(end) !== asSets(groups)) inv.push('afspilningen ender ikke i grupperne');
    }
    const marks = ruleMarks(input, answer, ruleSources.get(input), severityOf);
    if (Object.keys(marks.rules).length !== input.rules.length) inv.push('mærker ' + Object.keys(marks.rules).length + ' af ' + input.rules.length);
    for (const mark of [...Object.values(marks.rules), marks.agreements.mark]) {
        if (!mark || typeof mark.label !== 'string' || /undefined|NaN|null/.test(mark.label)) inv.push('mærke ' + JSON.stringify(mark));
    }
    for (const m of dedupeAnswerMessages(answer.messages)) {
        if (!['error', 'info'].includes(severityOf(m, answer.status)) || typeof issueKey(m) !== 'string') inv.push('besked ' + m.code);
    }
}

it('tilfældige skæve klasser: gyldigt input, ingen motorfejl, svaret holder kontrakten og dommeren, teksterne er udfyldte', async () => {
    const R = rng(Number(process.env.SEED || 1));
    const bad = [];
    const statuses = {};
    for (let t = 0; t < Number(process.env.N || 400); t++) {
        const c = makeCase(R);
        const input = buildEngineInput(c);
        if (!input) { statuses.null = (statuses.null || 0) + 1; continue; }
        // Kontraktens løfter om input (afsnit 2).
        const sids = new Set(input.students.map(s => s._rowId));
        const lockedIds = new Set(input.lockedGroups.flatMap(g => g.members));
        const absent = new Set(c.cls.data.filter(r => r._excluded).map(r => r._rowId));
        const inv = [];
        for (const id of sids) if (absent.has(id) || lockedIds.has(id)) inv.push('fraværende/låst i students ' + id);
        for (const id of lockedIds) if (absent.has(id)) inv.push('fraværende i låst gruppe ' + id);
        const seenBlock = new Set();
        for (const b of input.agreements.together) for (const id of b) { if (seenBlock.has(id)) inv.push('blokke overlapper'); seenBlock.add(id); if (!sids.has(id) && !lockedIds.has(id)) inv.push('ukendt i blok ' + id); }
        for (const a of input.agreements.avoid) for (const id of a) if (!sids.has(id)) inv.push('ukendt i avoid ' + id);
        if (input.view === 'matrix' && input.rules.some(r => r.type === 'aggregate')) inv.push('Opdel i matrix');
        const nums = input.lockedGroups.map(g => g.number);
        if (new Set(nums).size !== nums.length) inv.push('låste numre gentaget ' + nums);
        const answer = await run({ ...input, seed: 3, budget: { maxSeconds: 1, maxAttempts: 2, minAttempts: 1 } }, {});
        statuses[answer.status] = (statuses[answer.status] || 0) + 1;
        const problem = contractProblem(input, answer);
        if (problem) inv.push('contractProblem: ' + problem);
        for (const m of answer.messages || []) {
            const txt = fillMessageText(m, { studentName: () => 'NAVN', groupName: () => null });
            if (/[{}]|undefined|NaN|null|\[object|  |\s[.,]/.test(txt)) inv.push('tekst: ' + txt);
        }
        if (answer.status === 'error') inv.push('motorfejl ' + answer.detail);
        if (answer.status === 'ok' || answer.status === 'impossible') {
            const g = judge(input, answer, { samples: 1 });
            if (g.failures.length) inv.push('dommer ' + JSON.stringify(g.failures).slice(0, 300));
        }
        if (!problem && Array.isArray(answer.groups)) {
            try {
                checkLanding(input, answer, inv);
            } catch (e) {
                inv.push('landingen kastede: ' + e.message);
            }
        }
        if (inv.length) bad.push({ t, inv: [...new Set(inv)], input: JSON.stringify({ ...input, budget: undefined }).slice(0, 1200), cls: JSON.stringify(c).slice(0, 1500) });
    }
    // Alle fire udfald skal forekomme, ellers afprøver udsnittet for lidt.
    expect(statuses.ok).toBeGreaterThan(0);
    expect(statuses.impossible).toBeGreaterThan(0);
    expect(statuses.null).toBeGreaterThan(0);
    expect(bad.slice(0, 3)).toEqual([]);
}, 600000);

it('Stop midt i en kørsel med 90 elever: "stopped" med en hel deling, der kan lægges på skærmen', async () => {
    const R = rng(4);
    let checked = 0;
    for (let t = 0; t < 6; t++) {
        const c = makeCase(R, 90);
        c.isMatrix = false;
        c.groupMode = 'size';
        // Ingen låste og ingen Skal sammen: de kan stoppe dannelsen før start.
        c.viewGroups = [];
        c.cls.togetherGroups = [];
        c.cls.rules = [
            { type: 'distribute', column: 'Køn' },
            { type: 'balance', column: 'Tal' },
            { type: 'separate', column: 'Niveau', values: ['Høj'] },
        ];
        const input = buildEngineInput(c);
        const answer = await run({ ...input, seed: 5, budget: { maxSeconds: 30, maxAttempts: 500, minAttempts: 500 } }, { isCancelled: () => true });
        if (answer.status !== 'stopped' || !Array.isArray(answer.groups)) continue;
        checked++;
        expect(contractProblem(input, answer)).toBeNull();
        expect(answer.playback).toBeNull();
        const inv = [];
        checkLanding(input, answer, inv);
        expect(inv).toEqual([]);
    }
    // Mindst ét af de seks skal faktisk være stoppet med en deling.
    expect(checked).toBeGreaterThan(0);
}, 120000);

// Matrix bygget på en RIGTIG stamkørsel (gennemsyn 84, 10/11 2026). Testen
// ovenfor laver stamgrupperne tilfældigt; her dannes de af motoren og lægges
// på skærmen, som landAnswer gør det: numre uden om de låste ("Group N"),
// emnerne fra svaret (groups[i].topic + lockedTopics) og emne-kortet med
// S_-nøgler (replaceTopicsForPrefix). Matrix-runden læser så stamgrupperne
// og emnerne derfra (topicFor), præcis som engineInputNow. Imellem de to
// kørsler kan læreren have ændret fravær: en elev, der var væk ved
// stamkørslen, er i matrix uden stamgruppe (not-in-home-group), og en, der er
// gået hjem, er med i en stamgruppe uden at være i students.
//
// Som sonde kørte den 21.000 klasser (frø 3–9; med frø 9 1.872 matrix-kørsler,
// heraf 1.436 med emner og 101 med efternølere) uden ét fund. Vil du
// lede bredere: SEED=9 N=3000 PROBE_OUT=/tmp/sonde.json npx vitest run
// src/js/modules/engineChain.test.js -t "rigtig stamkørsel" (tællerne i filen).
// landHome er en kopi af landAnswers rene del (landAnswer selv rører state og
// lageret); ændres landAnswers numre eller emner, så ret den med.
function landHome(input, answer, viewGroups) {
    const numbers = freeNumbers(answer.groups.length, input.lockedGroups.map(g => g.number));
    const hasTopics = input.topics.length > 0;
    const newGroups = answer.groups.map((g, i) => ({
        name: `Group ${numbers[i]}`, members: g.members.map(id => ({ id })), topic: hasTopics ? (g.topic || null) : null,
    }));
    const lockedTopics = answer.lockedTopics || {};
    const locked = viewGroups.filter(g => g.locked).map(g => ({
        ...g,
        topic: hasTopics && Object.prototype.hasOwnProperty.call(lockedTopics, String(g.name)) ? lockedTopics[String(g.name)] : (hasTopics ? g.topic : null),
    }));
    const finalGroups = [...locked, ...newGroups].sort((a, b) => groupNumberOf(a.name) - groupNumberOf(b.name));
    // Emne-kortet, som replaceTopicsForPrefix('S_', …) skriver det.
    const topicMap = {};
    for (const g of finalGroups) {
        const t = g.topic == null ? '' : String(g.topic).trim();
        if (t) topicMap['S_' + g.name] = t;
    }
    return { finalGroups, topicMap };
}

it('matrix på en rigtig stamkørsel: emnerne og stamgrupperne går uændret videre, og svaret holder kontrakten og dommeren', async () => {
    const R = rng(Number(process.env.SEED || 2));
    const bad = [];
    const statuses = {};
    let matrixRuns = 0, withTopics = 0, lateComers = 0;
    for (let t = 0; t < Number(process.env.N || 250); t++) {
        // Hver femte et realistisk hold på 28, ellers de små og skæve.
        const c = makeCase(R, t % 5 === 0 ? 28 : null);
        // Stamkørslen: altid stamvisning, og oftere emner end i testen ovenfor.
        if (R() < 0.6) c.cls.topics = ['Klima', 'Migration', 'Velfærd', 'EU'].slice(0, 1 + Math.floor(R() * 4));
        const homeView = c.isMatrix ? c.homeGroups.map(g => ({ ...g, locked: R() < 0.25 })) : c.viewGroups;
        const homeInput = buildEngineInput({ ...c, isMatrix: false, viewGroups: homeView, homeGroups: [] });
        if (!homeInput) continue;
        const home = await run({ ...homeInput, seed: 7, budget: { maxSeconds: 1, maxAttempts: 2, minAttempts: 1 } }, {});
        if (contractProblem(homeInput, home) || !Array.isArray(home.groups) || !home.groups.length) continue;
        const { finalGroups, topicMap } = landHome(homeInput, home, homeView);

        // Fravær ændret mellem de to kørsler (nogle gange).
        const inv = [];
        if (R() < 0.3) {
            for (const row of c.cls.data) if (R() < 0.15) row._excluded = !row._excluded;
        }
        const matrixInput = buildEngineInput({
            ...c, isMatrix: true, viewGroups: [], homeGroups: finalGroups,
            topicFor: (name) => topicMap['S_' + name] || null,
        });
        if (!matrixInput) { statuses.null = (statuses.null || 0) + 1; continue; }
        matrixRuns++;

        // Det, stamkørslen lagde på skærmen, går uændret videre.
        const present = new Set(c.cls.data.filter(r => !r._excluded).map(r => r._rowId));
        const hg = matrixInput.matrix.homeGroups;
        if (hg.length !== finalGroups.length) inv.push('stamgrupper ' + hg.length + ' af ' + finalGroups.length);
        finalGroups.forEach((g, i) => {
            const want = g.topic == null || !String(g.topic).trim() ? null : String(g.topic).trim();
            if ((hg[i] && hg[i].topic) !== want) inv.push(`emne ${g.name}: ${hg[i] && hg[i].topic} ≠ ${want}`);
            const members = g.members.map(m => m.id).filter(id => present.has(id));
            if (JSON.stringify(hg[i] && hg[i].members) !== JSON.stringify(members)) inv.push('medlemmer ' + g.name);
        });
        if (new Set(hg.map(g => g.id)).size !== hg.length) inv.push('stamgruppe-id gentaget');
        if (hg.some(g => g.topic)) withTopics++;
        const inHome = new Set(hg.flatMap(g => g.members));
        const outside = matrixInput.students.filter(s => !inHome.has(s._rowId)).map(s => s._rowId);
        if (outside.length) lateComers++;

        const answer = await run({ ...matrixInput, seed: 3, budget: { maxSeconds: 1, maxAttempts: 2, minAttempts: 1 } }, {});
        statuses[answer.status] = (statuses[answer.status] || 0) + 1;
        const problem = contractProblem(matrixInput, answer);
        if (problem) inv.push('contractProblem: ' + problem);
        if (answer.status === 'error') inv.push('motorfejl ' + answer.detail);
        if (outside.length && answer.status === 'ok' && !answer.messages.some(m => m.code === 'not-in-home-group')) {
            inv.push('ingen not-in-home-group for ' + outside);
        }
        for (const m of answer.messages || []) {
            const txt = fillMessageText(m, { studentName: () => 'NAVN', groupName: () => null });
            if (/[{}]|undefined|NaN|null|\[object|  |\s[.,]/.test(txt)) inv.push('tekst: ' + txt);
        }
        if (answer.status === 'ok' || answer.status === 'impossible') {
            const g = judge(matrixInput, answer, { samples: 1 });
            if (g.failures.length) inv.push('dommer ' + JSON.stringify(g.failures).slice(0, 300));
        }
        if (Array.isArray(answer.groups) && answer.groups.some(g => g.topic != null)) inv.push('matrixgruppe med emne');
        if (!problem && Array.isArray(answer.groups)) {
            try { checkLanding(matrixInput, answer, inv); } catch (e) { inv.push('landingen kastede: ' + e.message); }
        }
        if (inv.length) bad.push({ t, inv: [...new Set(inv)], input: JSON.stringify({ ...matrixInput, budget: undefined }).slice(0, 1500) });
    }
    // Udsnittet skal faktisk nå de interessante tilfælde.
    if (process.env.PROBE_OUT) (await import('node:fs')).writeFileSync(process.env.PROBE_OUT, JSON.stringify({ matrixRuns, withTopics, lateComers, statuses }));
    expect(matrixRuns).toBeGreaterThan(50);
    expect(withTopics).toBeGreaterThan(10);
    expect(lateComers).toBeGreaterThan(0);
    expect(statuses.ok).toBeGreaterThan(0);
    expect(bad.slice(0, 3)).toEqual([]);
}, 600000);
