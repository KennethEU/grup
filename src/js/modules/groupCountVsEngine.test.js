// Opskriftens skøn ("ca. 7 grupper") og emne-beskeden mod motoren selv
// (gennemsyn 96, 12/11 2026).
//
// Før havde appen sit eget regnestykke for antal grupper. Det var uenigt med
// motoren i hver tiende klasse med emner (fx 24 elever, grupper på 5 med "én
// elev ekstra" og 5 emner: appen lovede 5 grupper, motoren dannede 4) og i
// hver tredje med en "Opdel", fordi motoren regner pr. pulje. Nu bruger appen
// motorens egen funktion; testen her holder øje med, at det også er de samme
// TAL, der går ind i den: de frie elever, puljerne, de låste og emnerne.
//
// Vejen på motorens side er den rigtige: buildEngineInput → buildTask →
// computeLayout. Vejen på appens side er den, RecipePanel.vue og hints.js går:
// splitByLockedGroups → poolSizesFor → expectedNewGroups.
import { it, expect } from 'vitest';
import { buildEngineInput } from './nextEngine.js';
import { expectedNewGroups } from './recipe.js';
import { splitByLockedGroups, poolSizesFor, computeTopicAdjustedTarget } from './utils.js';
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

function makeClass(R) {
    const pick = (a) => a[Math.floor(R() * a.length)];
    const int = (a, b) => a + Math.floor(R() * (b - a + 1));
    const n = int(1, 34);
    const data = [];
    for (let i = 1; i <= n; i++) {
        data.push({
            _rowId: 'r' + i, Navn: 'E' + i,
            // Skæve stavemåder og tomme celler: puljerne skal tælles som i motoren.
            Køn: pick(['Pige', 'Dreng', ' pige', 'DRENG ', '', null]),
            Hold: pick(['a', 'b', 'c']),
            ...(R() < 0.15 ? { _excluded: true } : {}),
        });
    }
    // Nogle låste grupper af de første elever (også fraværende, som i appen).
    const groups = [];
    let at = 0;
    for (let k = int(0, 2); k > 0 && at + 2 <= n; k--) {
        const size = int(1, 3);
        groups.push({ name: `Group ${groups.length + 1}`, locked: true, members: data.slice(at, at + size).map(r => r._rowId) });
        at += size;
    }
    const rules = [];
    if (R() < 0.5) rules.push({ type: 'aggregate', column: pick(['Køn', 'Hold', '']) });
    if (R() < 0.3) rules.push({ type: 'distribute', column: 'Hold' });
    const topics = Array.from({ length: pick([0, 0, 1, 2, 3, 5, 6]) }, (_, i) => 'Emne ' + (i + 1));
    const settings = { groupMode: pick(['size', 'size', 'number']), groupTarget: int(1, 9), groupMod: pick(['+', '-']) };
    return { cls: { data, rules, topics, settings, togetherGroups: [], separations: [] }, groups };
}

it('opskriftens skøn er motorens antal grupper — med Opdel, emner, låste grupper og fravær', () => {
    const R = rng(Number(process.env.SEED) || 96);
    const N = Number(process.env.N) || 4000;
    let compared = 0;
    for (let i = 0; i < N; i++) {
        const { cls, groups } = makeClass(R);
        const { groupMode, groupTarget, groupMod } = cls.settings;
        const input = buildEngineInput({ cls, isMatrix: false, groupMode, viewGroups: groups });
        if (!input) continue;                       // ingen frie elever, eller antal ≤ låste
        const motor = computeLayout(buildTask(input)).total;

        const split = splitByLockedGroups(cls.data, groups, '_rowId');
        const poolSizes = poolSizesFor(split.free, cls.rules);
        const app = expectedNewGroups({
            mode: groupMode, target: groupTarget, mod: groupMod, students: split.freeCount,
            poolSizes, lockedGroups: groups.length, topicCount: cls.topics.length,
        });
        expect(app, JSON.stringify({ settings: cls.settings, poolSizes, locked: groups.length, topics: cls.topics.length })).toBe(motor);

        // Emne-beskedens tal (hints.js) er de samme.
        if (groupMode === 'size' && cls.topics.length) {
            const adj = computeTopicAdjustedTarget({
                mode: 'size', sizeNum: groupTarget, sizeMod: groupMod, studentCount: split.freeCount,
                poolSizes, lockedCount: groups.length, topicCount: cls.topics.length,
            });
            expect(adj.adjustedNew).toBe(motor);
            expect(adj.adjustedSizes.reduce((a, b) => a + b, 0)).toBe(split.freeCount);
        }
        compared++;
    }
    expect(compared).toBeGreaterThan(N / 2);
});
