// Matrix-opskriftens skøn ("→ 5 matrixgrupper") mod motoren selv
// (gennemsyn 98, 13/11 2026) — søster til groupCountVsEngine.test.js.
//
// "Én fra hver" regnes af fullMatrixInfo, "Pr. gruppe" og "Antal" af
// expectedNewGroups. Testen her danner tilfældige klasser med stamgrupper,
// fravær, låste matrixgrupper, elever uden stamgruppe og emner stavet på flere
// måder, og kræver, at appens tal er det, motoren lægger ud (computeLayout).
//
// Den fandt to fejl, da den blev skrevet:
//  1. skønnet så ikke de låste matrixgrupper (stamgrupper på 5 og 4 med én
//     låst elev fra den store: "→ 4 matrixgrupper", der kom 5), og
//  2. "EU" og "eu" var ét emne i appen, men to kilder i motoren.
import { it, expect } from 'vitest';
import { buildEngineInput } from './nextEngine.js';
import { fullMatrixInfo } from './matrixInfo.js';
import { expectedNewGroups } from './recipe.js';
import { splitByLockedGroups } from './utils.js';
import { buildTask } from '../../../motor/engine/task.js';
import { computeLayout } from '../../../motor/engine/sizes.js';

function rng(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function makeCase(R) {
    const pick = (a) => a[Math.floor(R() * a.length)];
    const int = (a, b) => a + Math.floor(R() * (b - a + 1));
    const n = int(4, 34);
    const data = Array.from({ length: n }, (_, k) => ({
        _rowId: 'r' + (k + 1),
        ...(R() < 0.12 ? { _excluded: true } : {}),
    }));
    // Stamgrupperne: skæve størrelser, og nogle gange en eller to elever, der
    // ikke står i nogen stamgruppe (tilføjet efter dannelsen).
    const homeCount = int(2, 7);
    const home = Array.from({ length: homeCount }, (_, k) => ({
        name: 'Group ' + (k + 1), members: [],
        // Tomt emne, samme emne på flere grupper, og samme emne stavet forskelligt.
        topic: pick(['', '', 'EU', 'eu', ' Eu ', 'FN', 'Nato', 'Group 1']),
    }));
    const outside = R() < 0.2 ? int(1, 2) : 0;
    data.slice(0, n - outside).forEach(r => pick(home).members.push(r._rowId));
    // Låste matrixgrupper af tilfældige elever (også fraværende, som i appen).
    const locked = [];
    for (let k = pick([0, 0, 1, 2]); k > 0; k--) {
        const members = Array.from({ length: int(1, 4) }, () => pick(data)._rowId);
        locked.push({ name: 'Group ' + (locked.length + 1), locked: true, members: [...new Set(members)] });
    }
    const matrixSettings = {
        matrixStrategy: pick(['full_strict', 'full_strict', 'size', 'count']),
        matrixRepresentationType: pick(['group', 'topic']),
        groupTarget: int(1, 9), groupMod: pick(['+', '-']),
    };
    return { cls: { data, matrixRules: [], matrixSettings }, home, locked };
}

it('matrix-opskriftens skøn er motorens antal matrixgrupper — med låste grupper, fravær og emner', () => {
    const R = rng(Number(process.env.SEED) || 98);
    const N = Number(process.env.N) || 4000;
    let compared = 0;
    const seen = { full_strict: 0, size: 0, count: 0 };
    for (let i = 0; i < N; i++) {
        const { cls, home, locked } = makeCase(R);
        const s = cls.matrixSettings;
        const input = buildEngineInput({ cls, isMatrix: true, groupMode: 'size', viewGroups: locked, homeGroups: home });
        if (!input) continue;                       // alle låst, eller antal ≤ låste
        const task = buildTask(input);
        const fresh = computeLayout(task).total;
        const label = JSON.stringify({ s, home: home.map(g => [g.topic, g.members.length]), locked: locked.map(g => g.members) });

        if (s.matrixStrategy === 'full_strict') {
            // Som MatrixRecipePanel.vue kalder den.
            const info = fullMatrixInfo({
                groups: home, data: cls.data, idCol: '_rowId',
                repType: s.matrixRepresentationType, storedTopic: () => '', lockedGroups: locked,
            });
            expect(info.numGroups, label).toBe(fresh > 0 ? fresh + locked.length : 0);
            expect(info.totalStudents, label).toBe(task.n);
        } else {
            const free = splitByLockedGroups(cls.data, locked, '_rowId').freeCount;
            const app = expectedNewGroups({
                mode: s.matrixStrategy === 'size' ? 'size' : 'number',
                target: s.groupTarget, mod: s.groupMod, students: free, lockedGroups: locked.length,
            });
            expect(app, label).toBe(fresh);
        }
        seen[s.matrixStrategy]++;
        compared++;
    }
    expect(compared).toBeGreaterThan(N / 2);
    for (const k of Object.keys(seen)) expect(seen[k], k).toBeGreaterThan(N / 10);
});

it('"EU" og "eu" på to stamgrupper er ét emne for motoren, under den første stavemåde', () => {
    const data = Array.from({ length: 8 }, (_, k) => ({ _rowId: 'r' + (k + 1) }));
    const home = [
        { name: 'Group 1', members: ['r1', 'r2'], topic: 'EU' },
        { name: 'Group 2', members: ['r3', 'r4'], topic: ' eu' },
        { name: 'Group 3', members: ['r5', 'r6', 'r7', 'r8'], topic: 'FN' },
    ];
    const cls = { data, matrixRules: [], matrixSettings: { matrixStrategy: 'full_strict', matrixRepresentationType: 'topic' } };
    const input = buildEngineInput({ cls, isMatrix: true, groupMode: 'size', homeGroups: home });
    expect(input.matrix.homeGroups.map(g => g.topic)).toEqual(['EU', 'EU', 'FN']);
    const task = buildTask(input);
    expect(task.matrix.sources.map(src => src.label)).toEqual(['EU', 'FN']);
    expect(computeLayout(task).total).toBe(4);   // før: 2 (tre kilder, den mindste på 2)
});
