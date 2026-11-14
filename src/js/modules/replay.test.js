// Afspilningens regnestykke: hvem sidder hvor efter n billeder?
//
// HVORFOR DEN HER TEST FINDES: kortene tegner eleverne i den rækkefølge,
// seatingAt giver. Ender afspilningen med de RIGTIGE elever i den FORKERTE
// orden, springer navnene i det sekund, den er færdig. Motorens egen
// rækkefølge kan ikke regnes ud af loggen (moveLast i motor/engine/state.js),
// så hvert billede ordnes efter motorens grupper (orderByFinal). Testen med
// den rigtige motor nederst holder løftet på en rigtig klasse.

import { describe, it, expect } from 'vitest';
import KLASSE from '../../../testdata/realistisk_klasse.json';
import { seatingAt, frameCount, start, stop, seek, ruleLabel, withCardOrder, KIND_IMPROVE, KIND_UPHILL } from './replay.js';
import { state } from './state.js';
import { buildEngineInput, playbackToRecording } from './nextEngine.js';
import { run as runEngine } from '../../../motor/engine/engine.js';

describe('seatingAt — rækkefølgen inde i gruppen', () => {
    it('uden motorens grupper: den tilflyttede bagest', () => {
        const run = {
            seed: [['a', 'b', 'c'], ['x', 'y', 'z']],
            deal: [],
            events: [['a', 'z', KIND_IMPROVE, null, null, null, null]],
        };
        expect(seatingAt(run, 1)).toEqual([['b', 'c', 'z'], ['x', 'y', 'a']]);
    });

    it('med motorens grupper: hvert billede i deres rækkefølge, de tilflyttende nederst', () => {
        const run = {
            seed: [['a', 'b', 'c'], ['x', 'y', 'z']],
            deal: [['a', 0], ['x', 1], ['b', 0], ['y', 1], ['c', 0], ['z', 1]],
            events: [
                ['a', 'z', KIND_IMPROVE, null, null, null, null],
                ['b', 'y', KIND_UPHILL, null, null, null, null],
            ],
            final: [['c', 'y', 'z'], ['b', 'a', 'x']],
        };
        // Under uddelingen: a og b skal videre, så de står efter c.
        expect(seatingAt(run, 5)).toEqual([['c', 'a', 'b'], ['x', 'y']]);
        // Efter første bytte står z på sin endelige plads; b skal videre.
        expect(seatingAt(run, 7)).toEqual([['c', 'z', 'b'], ['a', 'x', 'y']]);
        // Slutbilledet ER motorens grupper.
        expect(seatingAt(run, frameCount(run))).toEqual(run.final);
    });

    it('står på udgangspunktet, når uddelingen er spillet igennem', () => {
        const run = {
            seed: [['a', 'b'], ['x']],
            deal: [['a', 0], ['x', 1], ['b', 0]],
            events: [['a', 'x', KIND_IMPROVE, null, null, null, null]],
        };
        expect(frameCount(run)).toBe(4);
        expect(seatingAt(run, 1)).toEqual([['a'], []]);
        expect(seatingAt(run, 3)).toEqual([['a', 'b'], ['x']]);
        expect(seatingAt(run, 4)).toEqual([['b', 'x'], ['a']]);
    });
});

describe('blok-bytte — en Skal sammen-aftale flytter i ÉT billede', () => {
    // Motoren flytter en aftale samlet (en blok i motor/engine/playback.js).
    // Billedet imellem må ikke vise aftalens elever i hver sin gruppe —
    // noget motoren aldrig gør. Det er én hændelse med de øvrige par som
    // ottende felt (playbackToRecording i nextEngine.js).
    const block = {
        seed: [['a1', 'a2', 'c'], ['x', 'y', 'z']],
        deal: [],
        events: [['a1', 'x', KIND_IMPROVE, 0, 5, 3, null, [['a2', 'y']]]],
    };

    it('tæller som ét billede og holder aftalen samlet', () => {
        expect(frameCount(block)).toBe(1);
        expect(seatingAt(block, 1)).toEqual([['c', 'x', 'y'], ['z', 'a1', 'a2']]);
    });

    it('ender i samme rækkefølge som de to enkeltbytter ville have gjort', () => {
        const singles = { ...block, events: [
            ['a1', 'x', KIND_IMPROVE, 0, 5, 3, null],
            ['a2', 'y', KIND_IMPROVE, 0, 5, 3, null],
        ] };
        expect(seatingAt(block, 1)).toEqual(seatingAt(singles, 2));
    });

    it('fremhæver alle fire, der flyttede', () => {
        start({ runs: [block], best_run_index: 0 }, ['Group 1', 'Group 2'], []);
        seek(1);
        expect(state.replay.last.moved.sort()).toEqual(['a1', 'a2', 'x', 'y']);
        expect(state.replay.last.pairCount).toBe(2);
        stop();
    });
});

describe('ruleLabel — samme ord som opskriften', () => {
    it('"Adskil altid" hedder det samme i afspilningen som i opskriften', () => {
        expect(ruleLabel('strict_separate:Navn')).toBe('Adskil altid på Navn');
        expect(ruleLabel('separate:Køn')).toBe('Adskil på Køn');
        expect(ruleLabel('distribute:Køn')).toBe('Fordel på Køn');
        expect(ruleLabel('balance:Snit')).toBe('Balancér på Snit');
        expect(ruleLabel(null)).toBeNull();
    });
});

describe('med den rigtige motor: intet spring i det sidste billede', () => {
    // Målt 14/11 2026 før rettelsen: uden motorens grupper som facit endte
    // afspilningen i en anden rækkefølge end kortene i 35 af 35 kørsler på
    // testklassen, så navnene byttede plads i hver gruppe i det sidste billede.
    it('slutningen er motorens grupper, og i billedet før står kun de elever, der flytter i sidste trin, et andet sted', async () => {
        const data = KLASSE.rows.map((r, i) => ({ ...r, _rowId: 'r' + i }));
        let checked = 0;
        for (const rules of [[{ type: 'distribute', column: 'Køn' }], [{ type: 'balance', column: 'Snit' }, { type: 'distribute', column: 'Køn' }]]) {
            for (const seed of [1, 2, 3]) {
                const cls = { data, rules, matrixRules: [], columnOrders: {}, togetherGroups: [{ ids: ['r0', 'r1', 'r2'] }], separations: [], topics: [], settings: { groupTarget: 4, groupMod: '+' }, matrixSettings: {} };
                const input = buildEngineInput({ cls, isMatrix: false, groupMode: 'size', viewGroups: [], homeGroups: [], topicFor: () => null });
                const answer = await runEngine({ ...input, seed, budget: { maxSeconds: 1, maxAttempts: 2, minAttempts: 1 } }, {});
                const rec = playbackToRecording(answer.playback, input);
                if (!rec || !rec.runs[0].events.length) continue;
                const run = rec.runs[0];
                const groups = answer.groups.map(g => g.members);
                const total = frameCount(run);
                expect(seatingAt(run, total)).toEqual(groups);
                // Det næstsidste billede: kun de elever, det sidste trin
                // flyttede, må stå et andet sted. Alle andre står, hvor de
                // ender — også på pladsen inde i gruppen.
                const before = seatingAt(run, total - 1);
                const last = run.events[run.events.length - 1];
                const movers = new Set(last[1] === null ? [last[0]] : [[last[0], last[1]], ...(last[7] || [])].flat());
                before.forEach((group, gi) => {
                    const stay = group.filter(id => !movers.has(id));
                    expect(stay).toEqual(groups[gi].filter(id => !movers.has(id)));
                });
                expect(before.flat().length).toBe(groups.flat().length);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(3);
    }, 60000);
});

describe('withCardOrder — kortenes rækkefølge er facit (136. gennemsyn)', () => {
    // Trækker læreren en elev op i sit eget kort, er det stadig de samme
    // grupper. Afspilningens sidste billede skal så stå som kortene, ellers
    // springer navnene, når afspilningen stopper.
    const recording = {
        best_run_index: 0,
        runs: [{
            seed: [['a', 'b', 'c'], ['x', 'y', 'z']],
            deal: [['a', 0], ['x', 1], ['b', 0], ['y', 1], ['c', 0], ['z', 1]],
            events: [['a', 'z', KIND_IMPROVE, null, null, null, null]],
            final: [['b', 'c', 'z'], ['x', 'y', 'a']],
        }],
    };
    const names = ['Group 1', 'Group 2'];

    it('det sidste billede står i kortenes rækkefølge', () => {
        const cards = [
            { name: 'Group 2', members: ['a', 'x', 'y'] },
            { name: 'Group 1', members: [{ id: 'z' }, 'b', 'c'] },
        ];
        const idOf = (m) => (typeof m === 'object' ? m.id : m);
        const out = withCardOrder(recording, names, cards, idOf);
        const run = out.runs[0];
        expect(seatingAt(run, frameCount(run))).toEqual([['z', 'b', 'c'], ['a', 'x', 'y']]);
    });

    it('rører ikke optagelsen selv, og en ukendt gruppe beholder motorens rækkefølge', () => {
        const before = JSON.stringify(recording);
        const out = withCardOrder(recording, names, [{ name: 'Group 2', members: ['y', 'x', 'a'] }]);
        expect(JSON.stringify(recording)).toBe(before);
        expect(out.runs[0].final).toEqual([['b', 'c', 'z'], ['y', 'x', 'a']]);
    });

    it('uden facit eller optagelse: uændret', () => {
        expect(withCardOrder(null, names, [])).toBeNull();
        const noFinal = { best_run_index: 0, runs: [{ seed: [], deal: [], events: [] }] };
        expect(withCardOrder(noFinal, names, [])).toBe(noFinal);
    });
});
