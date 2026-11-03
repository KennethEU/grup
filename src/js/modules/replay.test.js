// Afspilningens regnestykke: hvem sidder hvor efter n billeder?
//
// HVORFOR DEN HER TEST FINDES: seatingAt spejler, hvordan motorerne flytter
// eleverne. Rammer spejlet ved siden af, ender afspilningen med de RIGTIGE
// elever i den FORKERTE orden, og navnene springer i det sekund, den er
// færdig. Python-siden holder det samme løfte mod de rigtige motorer
// (test_recorder.py); den her holder det mod koden, browseren kører.

import { describe, it, expect } from 'vitest';
import { seatingAt, frameCount, start, stop, seek, KIND_IMPROVE, KIND_RULE, KIND_JOINT } from './replay.js';
import { state } from './state.js';

describe('seatingAt — rækkefølgen inde i gruppen', () => {
    it('lægger den tilflyttede BAGEST ved motor A og motor B', () => {
        // Motor A (solvers.py) og motor B (den gamle Python-motor) gør begge:
        // fjern min elev, læg den anden bagest.
        const run = {
            seed: [['a', 'b', 'c'], ['x', 'y', 'z']],
            deal: [],
            events: [['a', 'z', KIND_IMPROVE, 1, 0, 0, null]],
        };
        expect(seatingAt(run, 1)).toEqual([['b', 'c', 'z'], ['x', 'y', 'a']]);

        const runB = { ...run, events: [['a', 'z', KIND_RULE, null, null, null, 'distribute:Køn']] };
        expect(seatingAt(runB, 1)).toEqual([['b', 'c', 'z'], ['x', 'y', 'a']]);
    });

    it('bytter pladser ved efterpasset', () => {
        // logic.py sætter de to ind på hinandens pladser.
        const run = {
            seed: [['a', 'b', 'c'], ['x', 'y', 'z']],
            deal: [],
            events: [['a', 'z', KIND_JOINT, 1, 10, 9, null]],
        };
        expect(seatingAt(run, 1)).toEqual([['z', 'b', 'c'], ['x', 'y', 'a']]);
    });

    it('holder de to arter fra hinanden i den samme kørsel', () => {
        const run = {
            seed: [['a', 'b'], ['x', 'y']],
            deal: [],
            events: [
                ['a', 'x', KIND_RULE, null, null, null, null],   // a bagest i g2, x bagest i g1
                ['b', 'a', KIND_JOINT, 1, 10, 9, null],          // bytter pladser
            ],
        };
        expect(seatingAt(run, 1)).toEqual([['b', 'x'], ['y', 'a']]);
        expect(seatingAt(run, 2)).toEqual([['a', 'x'], ['y', 'b']]);
    });

    it('står på udgangspunktet, når uddelingen er spillet igennem', () => {
        const run = {
            seed: [['a', 'b'], ['x']],
            deal: [['a', 0], ['x', 1], ['b', 0]],
            events: [['a', 'x', KIND_RULE, null, null, null, null]],
        };
        expect(frameCount(run)).toBe(4);
        expect(seatingAt(run, 1)).toEqual([['a'], []]);
        expect(seatingAt(run, 3)).toEqual([['a', 'b'], ['x']]);
        expect(seatingAt(run, 4)).toEqual([['b', 'x'], ['a']]);
    });
});

describe('blok-bytte — en Skal sammen-aftale flytter i ÉT billede', () => {
    // Motoren flytter en aftale samlet (solvers._optimize_loop). Før blev det
    // optaget som enkeltbytter, og billedet imellem viste aftalens elever i
    // hver sin gruppe — noget motoren aldrig gjorde. Nu er det én hændelse
    // med de øvrige par som ottende felt (recorder.swap_block).
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
