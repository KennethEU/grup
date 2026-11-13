// Tekst, som appen sammenligner på én måde og motoren på en anden
// (gennemsyn 99, 13/11 2026) — søster til matrixVsEngine.test.js.
//
// Appen regner to celler for samme værdi, når valueKey() er ens (uden
// mellemrum i enderne og uden forskel på store og små bogstaver). Motoren gør
// det samme med normalizeText(). Testen her danner tilfældige klasser, hvor
// samme værdi er stavet på flere måder ("Dreng", "dreng", " DRENG "), og
// kræver, at det, appen sender, får motoren til at mærke og rangere præcis de
// elever, læreren ser i opskriften.
//
// Den fandt én fejl, da den blev skrevet: filteret "en Adskil-værdi, som kun
// låste elever har, sendes ikke" sammenlignede tegn for tegn. Stod den valgte
// værdi som "Dreng" hos en låst elev og som "dreng" hos de frie, blev reglen
// slet ikke sendt, og drengene blev ikke spredt.
import { it, expect } from 'vitest';
import { buildEngineInput } from './nextEngine.js';
import { valueKey, applyColumnOrders, rankingAffectsColumn } from './utils.js';
import { buildTask } from '../../../motor/engine/task.js';
import { normalizeText } from '../../../motor/engine/values.js';

function rng(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Hver værdi i flere stavemåder — også med "å" som a + ring (NFD), som en
// tekst kopieret ud af en PDF på en Mac kan have.
const SPELLINGS = {
    dreng: ['Dreng', 'dreng', ' DRENG ', 'Dreng '],
    pige: ['Pige', 'pige', 'PIGE'],
    åse: ['Åse', 'åse', 'Åse'],
    7: ['7', ' 7'],
    '7,0': ['7,0'],
    '': ['', '  '],
};
const KEYS = Object.keys(SPELLINGS);

function makeCase(R) {
    const pick = (a) => a[Math.floor(R() * a.length)];
    const int = (a, b) => a + Math.floor(R() * (b - a + 1));
    const spelled = () => pick(SPELLINGS[pick(KEYS)]);
    const n = int(3, 16);
    const data = Array.from({ length: n }, (_, k) => ({
        _rowId: 'r' + (k + 1), A: spelled(), B: spelled(),
        ...(R() < 0.1 ? { _excluded: true } : {}),
    }));
    const locked = [];
    for (let k = pick([0, 1, 1, 2]); k > 0; k--) {
        const members = [...new Set(Array.from({ length: int(1, 4) }, () => pick(data)._rowId))];
        locked.push({ name: 'Group ' + (locked.length + 1), locked: true, members });
    }
    const values = () => [...new Set(Array.from({ length: int(1, 3) }, spelled))];
    const rules = [
        { type: pick(['separate', 'strict_separate']), column: 'A', values: values() },
        R() < 0.5 ? { type: 'separate', column: 'B', value: spelled() } : { type: 'separate', column: 'B', values: values() },
        { type: pick(['balance', 'minimizediff', 'group_sort']), column: 'A' },
    ];
    // Rangeringen: en værdi kan stå stavet anderledes end i cellerne.
    const order = [...new Set(Array.from({ length: int(2, 4) }, () => pick(SPELLINGS[pick(['dreng', 'pige', 'åse'])])))];
    const columnOrders = R() < 0.7 ? { A: order } : {};
    return { cls: { data, rules, columnOrders, settings: { groupTarget: 3, groupMod: '+' } }, locked };
}

it('motoren mærker og rangerer de samme elever, som appen gør — uanset stavemåden', () => {
    const R = rng(Number(process.env.SEED) || 99);
    const N = Number(process.env.N) || 3000;
    let compared = 0;
    let markedSeen = 0;
    let rankedSeen = 0;
    for (let i = 0; i < N; i++) {
        const { cls, locked } = makeCase(R);
        const input = buildEngineInput({ cls, isMatrix: false, groupMode: 'size', viewGroups: locked });
        if (!input) continue;
        const task = buildTask(input);
        const lockedIds = new Set(locked.flatMap(g => g.members));
        const free = cls.data.filter(r => !r._excluded && !lockedIds.has(r._rowId));
        expect(task.ids).toEqual(free.map(r => r._rowId));
        const label = JSON.stringify({ rules: cls.rules, free: free.map(r => [r.A, r.B]), locked: [...lockedIds], orders: cls.columnOrders });

        // Adskil: de frie elever med en af de valgte værdier, som appen ser dem.
        for (const rule of cls.rules.filter(r => r.type === 'separate' || r.type === 'strict_separate')) {
            const chosen = new Set((rule.values || [rule.value]).map(valueKey).filter(Boolean));
            const app = free.filter(r => chosen.has(valueKey(r[rule.column]))).map(r => r._rowId);
            // Motorens: alle sendte regler af samme type på samme kolonne.
            const sent = task.rules.filter(p => p.type === rule.type && p.column === rule.column && p.marked);
            const engine = task.ids.filter((id, k) => sent.some(p => p.marked[k]));
            // To Adskil på samme kolonne (A og B har hver sin) findes ikke her,
            // så "sent" er højst én regel.
            expect(engine, label).toEqual(app);
            markedSeen += app.length;
        }

        // Rangeringen: motorens tal pr. elev mod appens egen (applyColumnOrders,
        // som placeringen af en efternøler bruger).
        const order = cls.columnOrders.A;
        const numeric = task.rules.find(p => p.num && p.column === 'A');
        // Rækkefølgen sendes kun, når den rammer noget: mindst to trin og
        // mindst én elev i klassen med en værdi fra den (gennemsyn 101). En
        // forældet rækkefølge fik før motoren til at regne HVER elev for
        // "uden for rækkefølgen".
        const sent = rankingAffectsColumn(cls.data, 'A', order);
        if (order && numeric) expect(numeric.ranked, label).toBe(sent);
        if (order && numeric && sent) {
            const ranked = applyColumnOrders(free, cls.rules, cls.columnOrders);
            const rankCol = Object.keys(ranked.labelMap)[0];
            // Motorens rang er pladsen i listen (1, 2, 3 …); appens tæller kun
            // de forskellige værdier. Rækkefølgen og "hvem har en rang" skal
            // være ens, så sammenlign på værdien i stedet for på tallet.
            const keys = [];
            order.forEach(v => { const key = normalizeText(v); if (key !== null && !keys.includes(key)) keys.push(key); });
            free.forEach((r, k) => {
                const appRank = rankCol ? ranked.data[k][rankCol] : '';
                const engineRank = numeric.num[k];
                if (appRank === '') expect(Number.isNaN(engineRank), label).toBe(true);
                else {
                    expect(keys[Number(appRank) - 1], label).toBe(normalizeText(r.A));
                    expect(Number.isNaN(engineRank), label).toBe(false);
                    rankedSeen++;
                }
            });
        }
        compared++;
    }
    expect(compared).toBeGreaterThan(N / 2);
    expect(markedSeen).toBeGreaterThan(N);
    expect(rankedSeen).toBeGreaterThan(N);
});

it('en Adskil-værdi sendes, når en fri elev har den med andre store og små bogstaver end den låste', () => {
    const cls = {
        data: [
            { _rowId: 'r1', Køn: 'Dreng' },          // låst
            { _rowId: 'r2', Køn: 'dreng' },
            { _rowId: 'r3', Køn: 'dreng' },
            { _rowId: 'r4', Køn: 'Pige' },
            { _rowId: 'r5', Køn: 'Pige' },
        ],
        rules: [{ type: 'separate', column: 'Køn', values: ['Dreng'] }],
        settings: { groupTarget: 2, groupMod: '+' },
    };
    const locked = [{ name: 'Group 1', locked: true, members: ['r1'] }];
    const input = buildEngineInput({ cls, isMatrix: false, groupMode: 'size', viewGroups: locked });
    expect(input.rules).toEqual([{ type: 'separate', column: 'Køn', values: ['Dreng'] }]);
    const task = buildTask(input);
    expect([...task.rules[0].marked]).toEqual([1, 1, 0, 0]);
});

it('en Adskil-værdi, som KUN en låst elev har, sendes stadig ikke — heller ikke med anden stavemåde', () => {
    const cls = {
        data: [
            { _rowId: 'r1', Køn: 'dreng ' },         // låst, eneste dreng
            { _rowId: 'r2', Køn: 'Pige' },
            { _rowId: 'r3', Køn: 'Pige' },
        ],
        rules: [{ type: 'separate', column: 'Køn', values: ['Dreng'] }],
        settings: { groupTarget: 2, groupMod: '+' },
    };
    const locked = [{ name: 'Group 1', locked: true, members: ['r1'] }];
    const input = buildEngineInput({ cls, isMatrix: false, groupMode: 'size', viewGroups: locked });
    expect(input.rules).toEqual([]);
});
