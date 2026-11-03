// @vitest-environment node
//
// Motoren (grup.dk/motor/engine/) set fra appens
// side: svarer den på det input, appen bygger, i kontraktens form? I Node
// (ingen Worker) kører motoren på én kerne. Motorens egne tests ligger i dens
// eget projekt; her prøves kun samspillet.
import { describe, it, expect } from 'vitest';
import { run, check, ENGINE_INFO } from '../../../motor/engine/engine.js';
import { buildEngineInput, contractProblem, playbackToRecording, issueKey, severityOf, dedupeAnswerMessages, noteKeys, replacedByResult } from './nextEngine.js';
import { seatingAt, frameCount } from './replay.js';

const rows = Array.from({ length: 14 }, (_, i) => ({
    _rowId: `r${i + 1}`, Navn: `Elev ${i + 1}`, Køn: i % 2 ? 'Dreng' : 'Pige', Niveau: ['Lav', 'Middel', 'Høj'][i % 3],
}));
const cls = (extra = {}) => ({
    data: rows, rules: [{ type: 'distribute', column: 'Køn' }, { type: 'distribute', column: 'Niveau' }],
    togetherGroups: [], separations: [{ ids: ['r1', 'r3'] }], topics: ['Klima', 'Migration'],
    settings: { groupMode: 'size', groupTarget: 4, groupMod: '+' }, ...extra,
});
const inputFor = (c, o = {}) => ({ ...buildEngineInput({ cls: c, isMatrix: false, groupMode: 'size', viewGroups: [], ...o }), seed: 7 });

describe('den nye motor med appens input', () => {
    it('taler kontraktversion 3', () => {
        expect(ENGINE_INFO.contractVersion).toBe(3);
    });

    it('danner grupper, der holder kontrakten, med emner og en afspilning, der ender rigtigt', async () => {
        const input = inputFor(cls());
        const answer = await run(input, {});
        expect(answer.status).toBe('ok');
        expect(contractProblem(input, answer)).toBeNull();
        expect(answer.groups.every(g => ['Klima', 'Migration'].includes(g.topic))).toBe(true);
        expect(answer.rules).toHaveLength(2);
        const rec = playbackToRecording(answer.playback, input);
        expect(rec).not.toBeNull();
        const run0 = rec.runs[0];
        const end = seatingAt({ ...run0, final: null }, frameCount(run0));
        expect(end.map(g => [...g].sort())).toEqual(answer.groups.map(g => [...g.members].sort()));
    });

    it('en umulig Skal sammen-blok giver "impossible" med blokkens elever', async () => {
        const input = inputFor(cls({ togetherGroups: [{ ids: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'] }] }));
        const answer = await run(input, {});
        expect(answer.status).toBe('impossible');
        const msg = answer.messages.find(m => String(m.code).startsWith('together-'));
        expect(msg).toBeTruthy();
        expect([...msg.students].sort()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    });

    it('Stop med det samme: et gyldigt svar, aldrig en fejl', async () => {
        // En lille klasse kan blive færdig, før motoren ser Stop — så svarer
        // den "ok". Appen lægger begge dele på skærmen på samme måde.
        const input = inputFor(cls());
        const answer = await run(input, { isCancelled: () => true });
        expect(['stopped', 'ok']).toContain(answer.status);
        expect(contractProblem(input, answer)).toBeNull();
    });
});

// Kenneths matrix-runde 2 (3/11 2026): to emner som kilder (12 og 14 elever),
// 4 pr. matrixgruppe. "Højst én fra hver kilde" kan ikke holde, og samme sag
// stod før tre gange i "Sidste dannelse".
describe('samme sag kun én gang (matrix med to emner)', () => {
    const many = Array.from({ length: 26 }, (_, i) => ({ _rowId: `m${i + 1}`, Køn: i % 2 ? 'Dreng' : 'Pige' }));
    const ids = many.map(r => r._rowId);
    const homeGroups = [
        ...[0, 4, 8].map((s, k) => ({ name: `Group ${k + 1}`, members: ids.slice(s, s + 4), topic: 'Ukraine' })),
        ...[12, 16, 20, 24].map((s, k) => ({ name: `Group ${k + 4}`, members: ids.slice(s, s === 24 ? 26 : s + 4), topic: 'Island' })),
    ];
    const matrixInput = () => ({
        ...buildEngineInput({
            cls: {
                data: many, rules: [], matrixRules: [{ type: 'distribute', column: 'Køn' }], togetherGroups: [], separations: [], topics: [],
                matrixSettings: { matrixStrategy: 'size', groupTarget: 4, groupMod: '+', matrixRepresentationType: 'topic' },
            },
            isMatrix: true, groupMode: 'size', viewGroups: [], homeGroups,
        }),
        seed: 3,
    });

    const sourcesKey = (m) => m.code === 'matrix-sources-spread';

    it('før kørslen: ÉN besked om kilderne, og den er ikke rød', () => {
        const input = matrixInput();
        const before = check(input).messages.filter(sourcesKey);
        expect(before).toHaveLength(1);
        expect(before[0].values).toEqual(['Ukraine', 'Island']);
        expect(severityOf(before[0], 'ok')).toBe('info');
    });

    it('efter kørslen: samme nøgle og samme tekst — appen viser den én gang', async () => {
        const input = matrixInput();
        const [before] = check(input).messages.filter(sourcesKey);
        const answer = await run(input, {});
        expect(answer.status).toBe('ok');
        const shown = dedupeAnswerMessages(answer.messages).filter(m => issueKey(m) === issueKey(before));
        expect(shown).toHaveLength(1);
        expect(shown[0].text).toBe(before.text);
        expect(severityOf(shown[0], answer.status)).toBe('info');
        // Kilderne er spredt så jævnt, som det kan lade sig gøre: ingen "par"-besked.
        expect(answer.messages.filter(m => m.code === 'rule-not-met' && m.rule === null)).toHaveLength(0);
    });
});

// Kontrakt v3-kladden (spørgsmål 46): ugyldigt input er "unsupported" med
// "invalid-input", så appen falder tilbage — og check() siger det samme, så
// opskriften viser appens egne advarsler.
describe('ugyldigt input', () => {
    it('ingen elever: unsupported / invalid-input fra både check og run', async () => {
        const input = { ...inputFor(cls()), students: [] };
        for (const answer of [check(input), await run(input, {})]) {
            expect(answer.status).toBe('unsupported');
            expect(answer.reason.code).toBe('invalid-input');
            expect(contractProblem(input, answer)).toBeNull();
        }
    });
});

describe('størrelser uden for 1–999 (spørgsmål 47)', () => {
    it('et negativt mål fra en gammel indstilling: invalid-input fra check og run — check hænger ikke', async () => {
        const input = inputFor(cls({ settings: { groupMode: 'size', groupTarget: -2, groupMod: '+' } }));
        expect(input.size.target).toBe(-2);
        for (const answer of [check(input), await run(input, {})]) {
            expect(answer.status).toBe('unsupported');
            expect(answer.reason.code).toBe('invalid-input');
        }
    });
});

// Opdel + Adskil, der ikke kan gå op i nogen af puljerne: ét resultat pr.
// pulje (spørgsmål 50), med puljen i teksten, og check()'s advarsler har et
// resultat på samme plads.
describe('Opdel: ét resultat pr. pulje', () => {
    const rows = Array.from({ length: 16 }, (_, i) => ({
        _rowId: `p${i + 1}`, Hold: i < 8 ? '2.a' : '2.b', Niveau: i % 8 < 5 ? 'Høj' : 'Lav',
    }));
    const input = () => ({
        ...buildEngineInput({
            cls: { data: rows, rules: [{ type: 'aggregate', column: 'Hold' }, { type: 'separate', column: 'Niveau', value: 'Høj' }],
                togetherGroups: [], separations: [], topics: [], settings: { groupMode: 'size', groupTarget: 4, groupMod: '+' } },
            isMatrix: false, groupMode: 'size', viewGroups: [],
        }),
        seed: 5,
    });

    it('resultaterne står pr. pulje og nævner puljen; advarslerne afløses', async () => {
        const inp = input();
        const warnings = check(inp).messages.filter(m => m.code === 'separate-unavoidable');
        expect(warnings.map(m => m.pool).sort()).toEqual(['2.a', '2.b']);
        const answer = await run(inp, {});
        const results = answer.messages.filter(m => m.code === 'rule-not-met' && m.rule === 1);
        expect(results.map(m => m.pool).sort()).toEqual(['2.a', '2.b']);
        for (const m of results) expect(m.text).toContain(m.pool);
        expect(answer.messages.filter(m => m.code === 'separate-unavoidable')).toHaveLength(0);
        const keys = new Set(results.flatMap(noteKeys));
        for (const w of warnings) expect(replacedByResult(w, keys)).toBe(true);
    });
});

describe('stats: hvilket forsøg vandt (kontrakt v3-kladden, spørgsmål 44)', () => {
    it('winner er et færdigt forsøg, og sameAsWinner er et tal', async () => {
        const answer = await run(inputFor(cls()), {});
        expect(answer.stats.winner).toBeGreaterThanOrEqual(1);
        expect(answer.stats.winner).toBeLessThanOrEqual(answer.stats.attempts);
        expect(Number.isInteger(answer.stats.sameAsWinner)).toBe(true);
    });
});
