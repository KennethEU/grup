// Matrix-opskriftens "Stamgruppe"/"Emne" mod det, tjekket og kørslen regner på
// (104. gennemsyn, 13/11 2026, tematik 81).
//
// Panelet (MatrixRecipePanel.vue) viser shownMatrixRepType(gemt, harEmner) og
// sender det ved "Dan matrixgrupper" (overrideSettings). Tjekket, prøvekørslen
// og mærkerne bygger input af det GEMTE valg (buildEngineInput: gemt eller
// "topic"). Uden emner viser panelet "Stamgruppe" uden at gemme det (med
// vilje: to faner), så de to veje sender ikke altid samme `matrix.source`.
// Testen her holder fast i, at motoren alligevel svarer det samme: tjekket
// giver samme beskeder og kørslen samme grupper, uanset om input er bygget af
// det gemte eller det viste valg.
import { describe, it, expect } from 'vitest';
import { buildEngineInput } from './nextEngine.js';
import { shownMatrixRepType } from './recipe.js';
import { run, check } from '../../../motor/engine/engine.js';

function rng(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const SAVED = [undefined, 'topic', 'group', 'noget andet'];

// En tilfældig klasse med stamgrupper. Emner: ingen, på nogle eller på alle
// stamgrupper — på kortet (g.topic) eller gemt (topicFor), som i appen.
function makeCase(R) {
    const pick = (a) => a[Math.floor(R() * a.length)];
    const int = (a, b) => a + Math.floor(R() * (b - a + 1));
    const n = int(4, 24);
    const data = [];
    for (let i = 1; i <= n; i++) {
        data.push({
            _rowId: 'r' + i, Navn: 'E' + i,
            Køn: pick(['Pige', 'Dreng']),
            ...(R() < 0.1 ? { _excluded: true } : {}),
        });
    }
    const k = int(2, 5);
    const homeGroups = Array.from({ length: k }, (_, i) => ({ name: `Group ${i + 1}`, members: [] }));
    data.forEach((r, i) => homeGroups[i % k].members.push(r._rowId));
    const topicMode = pick(['none', 'none', 'some', 'all']);
    const stored = new Map();
    for (const g of homeGroups) {
        const has = topicMode === 'all' || (topicMode === 'some' && R() < 0.5);
        if (!has) continue;
        const topic = pick(['Klima', 'EU', 'Migration']);
        if (R() < 0.5) g.topic = topic; else stored.set(g.name, topic);
    }
    const hasTopics = homeGroups.some(g => (g.topic && g.topic.trim()) || stored.has(g.name));
    const strategy = pick(['full_strict', 'full_strict', 'size', 'count']);
    const target = int(2, 5);
    const saved = pick(SAVED);
    const matrixSettings = { matrixStrategy: strategy, groupMode: 'size', groupTarget: target, groupMod: pick(['+', '-']) };
    if (saved !== undefined) matrixSettings.matrixRepresentationType = saved;
    const cls = {
        data, rules: [], topics: [],
        matrixRules: R() < 0.5 ? [{ type: 'distribute', column: 'Køn' }] : [],
        matrixSettings, togetherGroups: [], separations: [],
    };
    return { cls, homeGroups, topicFor: (name) => stored.get(name) ?? null, hasTopics, saved };
}

function inputs(c) {
    const base = { cls: c.cls, isMatrix: true, groupMode: 'size', viewGroups: [], homeGroups: c.homeGroups, topicFor: c.topicFor };
    const s = c.cls.matrixSettings;
    const fromSaved = buildEngineInput(base);
    const fromPanel = buildEngineInput({
        ...base,
        overrideSettings: {
            mode: s.groupMode, target: s.groupTarget, mod: s.groupMod,
            matrixStrategy: s.matrixStrategy,
            matrixRepresentationType: shownMatrixRepType(c.saved, c.hasTopics),
        },
    });
    return { fromSaved, fromPanel };
}

describe('matrix: det viste "Stamgruppe"/"Emne" og det gemte valg', () => {
    it('shownMatrixRepType: uden emner altid stamgruppe, ellers det gemte og emne som reserve', () => {
        expect(shownMatrixRepType(undefined, false)).toBe('group');
        expect(shownMatrixRepType('topic', false)).toBe('group');
        expect(shownMatrixRepType('group', true)).toBe('group');
        expect(shownMatrixRepType('topic', true)).toBe('topic');
        expect(shownMatrixRepType(undefined, true)).toBe('topic');
        expect(shownMatrixRepType('noget andet', true)).toBe('topic');
    });

    it('med emner sender panelet og det gemte valg samme kilde', () => {
        const R = rng(81);
        let seen = 0;
        for (let i = 0; i < 400; i++) {
            const c = makeCase(R);
            if (!c.hasTopics) continue;
            seen++;
            const { fromSaved, fromPanel } = inputs(c);
            expect(fromPanel.matrix.source, `saved=${c.saved}`).toBe(fromSaved.matrix.source);
        }
        expect(seen).toBeGreaterThan(100);
    });

    it('tjekket svarer det samme, uanset om input er bygget af det gemte eller det viste valg', () => {
        const R = rng(8101);
        let differentSource = 0;
        for (let i = 0; i < 600; i++) {
            const c = makeCase(R);
            const { fromSaved, fromPanel } = inputs(c);
            if (fromSaved === null || fromPanel === null) { expect(fromPanel).toBe(fromSaved); continue; }
            if (fromSaved.matrix.source !== fromPanel.matrix.source) differentSource++;
            expect(check(fromPanel), `sag ${i}, saved=${c.saved}, emner=${c.hasTopics}`).toEqual(check(fromSaved));
        }
        // Testen skal faktisk prøve tilfældet uden emner med "topic" gemt.
        expect(differentSource).toBeGreaterThan(50);
    });

    it('kørslen danner de samme grupper (samme frø)', async () => {
        const R = rng(8102);
        let tried = 0;
        let formed = 0;
        for (let i = 0; i < 200 && tried < 40; i++) {
            const c = makeCase(R);
            const { fromSaved, fromPanel } = inputs(c);
            if (!fromSaved || !fromPanel || fromSaved.matrix.source === fromPanel.matrix.source) continue;
            tried++;
            const a = await run({ ...fromSaved, seed: 7, budget: { maxSeconds: 2, maxAttempts: 2, minAttempts: 1 } });
            const b = await run({ ...fromPanel, seed: 7, budget: { maxSeconds: 2, maxAttempts: 2, minAttempts: 1 } });
            if (a.groups?.length) formed++;
            expect(b.groups, `sag ${i}`).toEqual(a.groups);
            expect(b.messages, `sag ${i}`).toEqual(a.messages);
        }
        expect(tried).toBeGreaterThan(20);
        expect(formed).toBeGreaterThan(20);
    }, 60000);
});
