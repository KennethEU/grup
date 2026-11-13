// Motorens beskeder før kørslen mod appens egne advarsler
// (gennemsyn 101, 13/11 2026) — søster til numbersVsEngine.test.js,
// textVsEngine.test.js og matrixVsEngine.test.js.
//
// Opskriften viser to slags advarsler i samme stak: appens egne (hints.js) og
// motorens (check()). Tre af motorens koder vises ALDRIG (APP_OWNED_CODES),
// fordi appen har sin egen besked med en knap. Det er kun i orden, når appens
// besked faktisk står der: ellers får læreren intet at vide. Og omvendt må de
// to ikke stå side om side og sige det samme (eller hver sit) om samme regel.
//
// I de andre enhedstests er engineCheck tom (der er ingen Web Worker), så den
// slags ses kun i e2e. Her får hints.js et RIGTIGT check()-svar for tusindvis
// af tilfældige klasser.
import { describe, it, expect, vi } from 'vitest';

vi.mock('./classActions.js', () => ({ autoSave: vi.fn() }));
vi.mock('./generation.js', () => ({ generateMatrixGroups: vi.fn(), generateWithoutTogether: vi.fn() }));
// engineCheck er normalt svaret fra motorens tråd. Her er det en ref, testen
// selv fylder med svaret fra check() — resten af nextEngine.js er den ægte.
vi.mock('./nextEngine.js', async (importOriginal) => {
    const original = await importOriginal();
    const { ref } = await import('vue');
    return { ...original, engineCheck: ref(null) };
});

import { buildEngineInput, engineCheck, APP_OWNED_CODES } from './nextEngine.js';
import { state } from './state.js';
import { columnIsNumeric } from './utils.js';
import { allHints } from './hints.js';
import { check } from '../../../motor/engine/engine.js';

function rng(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
const pick = (R, list) => list[Math.floor(R() * list.length)];

// Kolonnen "Niveau" i forskellige udgaver: kun ord, kun tal, få tal blandt
// ord, få ord blandt tal, og tomme celler.
const WORDS = ['Lav', 'Middel', 'Høj'];
function levelCells(R, n) {
    const kind = pick(R, ['words', 'numbers', 'fewNumbers', 'fewWords', 'empty']);
    return Array.from({ length: n }, () => {
        const blank = R() < 0.1;
        if (blank || kind === 'empty') return '';
        const word = pick(R, WORDS);
        const num = String(1 + Math.floor(R() * 5));
        if (kind === 'words') return word;
        if (kind === 'numbers') return num;
        if (kind === 'fewNumbers') return R() < 0.15 ? num : word;
        return R() < 0.15 ? word : num;
    });
}

const RULE_TYPES = ['balance', 'minimizediff', 'group_sort', 'cluster', 'distribute', 'separate', 'aggregate'];
// Rangeringer: en der passer, en der kun passer på noget, en med helt andre
// ord (klasselisten er skiftet ud), en med ét ord, og ingen.
const ORDERS = [null, null, ['Lav', 'Middel', 'Høj'], ['Lav', 'Middel'], ['Svag', 'Stærk'], ['Lav'], []];

function randomClass(R) {
    const n = 2 + Math.floor(R() * 22);
    const cells = levelCells(R, n);
    const data = cells.map((cell, k) => ({
        _rowId: 'r' + (k + 1), Navn: 'Elev ' + (k + 1), Niveau: cell,
        Hold: pick(R, ['a', 'b', 'c']), _excluded: R() < 0.12,
    }));
    const rules = [];
    const ruleCount = Math.floor(R() * 3);
    for (let i = 0; i < ruleCount; i++) {
        const type = pick(R, RULE_TYPES);
        const column = type === 'aggregate' ? 'Hold' : pick(R, ['Niveau', 'Niveau', 'Hold']);
        const rule = { type, column };
        if (type === 'separate') rule.values = [pick(R, column === 'Hold' ? ['a', 'b'] : ['Lav', '3'])];
        rules.push(rule);
    }
    const order = pick(R, ORDERS);
    const topics = Array.from({ length: pick(R, [0, 0, 2, 3, 5, 7]) }, (_, i) => 'Emne ' + (i + 1));
    const groupMode = R() < 0.5 ? 'size' : 'number';
    const cls = {
        filename: 'tilfaeldig', columns: ['Navn', 'Niveau', 'Hold'], data, rules,
        togetherGroups: [], separations: [], topics,
        columnOrders: order ? { Niveau: order } : {},
        settings: { groupTarget: String(1 + Math.floor(R() * (groupMode === 'size' ? 6 : 14))), groupMod: pick(R, ['+', '-']), groupMode },
    };
    // Indimellem en låst gruppe med de to første tilstedeværende.
    const present = data.filter(r => !r._excluded);
    const locked = (R() < 0.25 && present.length > 3)
        ? [{ name: 'Group 1', locked: true, members: present.slice(0, 2).map(r => r._rowId) }]
        : [];
    return { cls, groupMode, locked };
}

/** Sæt klassen i appen, giv hints.js motorens svar, og læs begge dele. */
function hintsWithCheck({ cls, groupMode, locked }) {
    state.currentClass = cls;
    state.activeView = 'standard';
    state.groupMode = groupMode;
    state.idColumn = '_rowId';
    state.displayColumn = 'Navn';
    state.storedStandardGroups = locked;
    state.storedMatrixGroups = [];
    const input = buildEngineInput({ cls, isMatrix: false, groupMode, viewGroups: locked, homeGroups: locked });
    const answer = input ? check(input) : null;
    const usable = answer && answer.status !== 'error' && answer.status !== 'unsupported';
    // Samme filter som den ægte engineCheck i nextEngine.js.
    engineCheck.value = usable
        ? { input, status: answer.status, messages: answer.messages.filter(m => !APP_OWNED_CODES.has(m.code)) }
        : null;
    return { input, answer: usable ? answer : null, hints: allHints.value };
}

const N = Number(process.env.N) || 4000;
const SEED = Number(process.env.SEED) || 101;

describe('motorens skjulte beskeder har altid en af appens egne i stedet', () => {
    it('text-only-column, topic-rounding og fewer-groups-than-asked', () => {
        const R = rng(SEED);
        const seen = { 'text-only-column': 0, 'topic-rounding': 0, 'fewer-groups-than-asked': 0 };
        let knownGap = 0;
        for (let i = 0; i < N; i++) {
            const setup = randomClass(R);
            const { input, answer, hints } = hintsWithCheck(setup);
            if (!answer) continue;
            const ids = hints.map(h => h.id);
            const context = () => JSON.stringify({ setup, ids });
            for (const m of answer.messages) {
                if (!APP_OWNED_CODES.has(m.code)) continue;
                seen[m.code]++;
                if (m.code === 'text-only-column') {
                    const rule = input.rules[m.rule];
                    // Hullet fra 101. (lukket i 111.): er kolonnen tal for
                    // HELE klassen, men er alle med et tal fraværende eller
                    // låst fast, ser motoren kun tekst — så siger appen det nu
                    // selv (samme id, anden tekst).
                    if (columnIsNumeric(setup.cls.data, rule.column)) knownGap++;
                    expect(ids.some(id => id.startsWith('hint:non-numeric:') && id.endsWith(`:${rule.type}:${rule.column}`)), context()).toBe(true);
                } else if (m.code === 'topic-rounding') {
                    expect(ids.some(id => id === 'hint:topic-rounding' || id === 'hint:topic-floor'), context()).toBe(true);
                } else {
                    expect(ids, context()).toContain('hint:too-many-groups');
                }
            }
        }
        // Testen skal faktisk have mødt alle tre.
        for (const code of Object.keys(seen)) expect(seen[code], code).toBeGreaterThan(20);
        // Hullet er sjældent i tilfældige klasser (målt: 2 af 15.000); den
        // særskilte test herunder rammer det med vilje.
        expect(knownGap).toBeLessThan(N / 500);
    });
});

describe('appens advarsel og motorens står ikke side om side om samme regel', () => {
    it('en tal-regel på en tekstkolonne giver én advarsel pr. regel', () => {
        const R = rng(SEED + 1);
        let both = 0;
        for (let i = 0; i < N; i++) {
            const setup = randomClass(R);
            const { input, answer, hints } = hintsWithCheck(setup);
            if (!answer) continue;
            const own = hints.filter(h => h.id.startsWith('hint:non-numeric:'));
            if (!own.length) continue;
            both++;
            // Motorens noter om, at cellerne ikke er tal eller ikke står i
            // rækkefølgen, for de regler, appen allerede har en advarsel om.
            const engineTexts = hints.filter(h => h.id.startsWith('engine:')).map(h => h.text);
            for (const m of answer.messages) {
                if (m.code !== 'non-numeric-cells' && m.code !== 'unranked-values') continue;
                const rule = input.rules[m.rule];
                if (!own.some(h => h.id.endsWith(`:${rule.type}:${rule.column}`))) continue;
                const shown = engineTexts.some(t => t.includes('placeres frit') && t.includes(`"${rule.column}"`));
                expect(shown, JSON.stringify({ setup, own: own.map(h => h.text), engineTexts })).toBe(false);
            }
        }
        expect(both).toBeGreaterThan(50);
    });

    it('"gør ingenting" står kun, når motoren heller ikke kan bruge reglen på nogen', () => {
        const R = rng(SEED + 2);
        let checked = 0;
        for (let i = 0; i < N; i++) {
            const setup = randomClass(R);
            const { input, answer, hints } = hintsWithCheck(setup);
            if (!answer) continue;
            for (const h of hints) {
                if (!h.id.startsWith('hint:non-numeric:') || !/gør ingenting/.test(h.text)) continue;
                const [, , , type, column] = h.id.split(':');
                // Reglen findes i input (ellers er der ingen frie elever med indhold).
                const at = input.rules.findIndex(r => r.type === type && r.column === column);
                if (at === -1) continue;
                checked++;
                // Motoren siger enten "kolonnen har ingen tal" (skjult, appen
                // siger det), eller at ALLE med en værdi står uden for
                // rækkefølgen — aldrig, at reglen virker for nogle.
                const codes = answer.messages.filter(m => m.rule === at).map(m => m.code);
                const filled = input.students.filter(s => String(s[column]).trim() !== '').length;
                const off = answer.messages.find(m => m.rule === at && (m.code === 'non-numeric-cells' || m.code === 'unranked-values'));
                const nothingWorks = codes.includes('text-only-column') || filled === 0 || (off && off.students.length === filled);
                expect(nothingWorks, JSON.stringify({ setup, text: h.text, codes })).toBe(true);
            }
        }
        expect(checked).toBeGreaterThan(50);
    });
});

describe('tallene i appens besked er motorens', () => {
    it('emne-afrundingen nævner de samme to antal som motorens note', () => {
        const R = rng(SEED + 3);
        let compared = 0;
        for (let i = 0; i < N; i++) {
            const setup = randomClass(R);
            const { answer, hints } = hintsWithCheck(setup);
            if (!answer) continue;
            const note = answer.messages.find(m => m.code === 'topic-rounding');
            const own = hints.find(h => h.id === 'hint:topic-rounding');
            if (!note || !own) continue;
            const engine = note.text.match(/rundet fra (\d+) til (\d+)/);
            const app = own.text.match(/fra (\d+) til (\d+)/);
            if (!engine) continue;
            compared++;
            expect(app && [app[1], app[2]], JSON.stringify({ setup, app: own.text, engine: note.text })).toEqual([engine[1], engine[2]]);
        }
        expect(compared).toBeGreaterThan(20);
    });

    it('"Der dannes højst N grupper" er det antal, motoren danner', () => {
        const R = rng(SEED + 4);
        let compared = 0;
        for (let i = 0; i < N; i++) {
            const setup = randomClass(R);
            const { answer, hints } = hintsWithCheck(setup);
            if (!answer) continue;
            const note = answer.messages.find(m => m.code === 'fewer-groups-than-asked');
            const own = hints.find(h => h.id === 'hint:too-many-groups');
            // Appens besked uden motorens note ville være en falsk advarsel.
            expect(Boolean(own), JSON.stringify({ setup, own, note })).toBe(Boolean(note));
            if (!note) continue;
            compared++;
            const engineNew = Number(note.text.match(/Der dannes (\d+) nye/)[1]);
            const appTotal = Number(own.text.match(/Der dannes højst (\d+) grupp/)[1]);
            expect(appTotal, JSON.stringify({ setup, app: own.text, engine: note.text })).toBe(engineNew + setup.locked.length);
        }
        expect(compared).toBeGreaterThan(20);
    });
});

describe('en forældet rækkefølge sendes ikke til motoren', () => {
    const classWith = (cells, order) => ({
        cls: {
            filename: 'foraeldet', columns: ['Navn', 'Niveau'],
            data: cells.map((cell, k) => ({ _rowId: 'r' + (k + 1), Navn: 'Elev ' + (k + 1), Niveau: cell })),
            rules: [{ type: 'balance', column: 'Niveau' }],
            togetherGroups: [], separations: [], topics: [],
            columnOrders: { Niveau: order },
            settings: { groupTarget: '4', groupMod: '+' },
        },
        groupMode: 'size',
        locked: [],
    });

    it('klasselisten er skiftet ud og har nu tal: Balancér regner på tallene', () => {
        // Før: motoren fik ["Svag","Stærk"], regnede kolonnen for rangeret, og
        // alle 12 stod "uden for rækkefølgen" — reglen gjorde ingenting.
        const { input, answer, hints } = hintsWithCheck(classWith(['2', '4', '7', '10', '12', '4', '7', '10', '2', '4', '7', '12'], ['Svag', 'Stærk']));
        expect(input.columnOrders).toEqual({});
        expect(answer.messages.map(m => m.code)).not.toContain('unranked-values');
        expect(hints.filter(h => /Niveau/.test(h.text))).toEqual([]);
    });

    it('klasselisten har nu andre ord: kun appens advarsel med "Ranger værdierne…"', () => {
        const { input, hints } = hintsWithCheck(classWith(['Lav', 'Høj', 'Middel', 'Lav', 'Høj', 'Middel', 'Lav', 'Høj'], ['Svag', 'Stærk']));
        expect(input.columnOrders).toEqual({});
        const about = hints.filter(h => /Niveau/.test(h.text));
        expect(about.length).toBe(1);
        expect(about[0].text).toMatch(/gør ingenting/);
        expect(about[0].action.label).toBe('Ranger værdierne…');
    });

    it('en rækkefølge, der rammer nogle af eleverne, sendes som før', () => {
        const { input, answer, hints } = hintsWithCheck(classWith(['Lav', 'Høj', 'Middel', 'Lav', 'Høj', 'Ukendt', 'Lav', 'Høj'], ['Lav', 'Middel', 'Høj']));
        expect(input.columnOrders).toEqual({ Niveau: ['Lav', 'Middel', 'Høj'] });
        expect(answer.messages.map(m => m.code)).toContain('unranked-values');
        // Motorens note står alene: appen har ingen advarsel om en rangeret kolonne.
        expect(hints.filter(h => /Niveau/.test(h.text)).map(h => h.id.split(':')[0])).toEqual(['engine']);
    });
});

describe('motorens beskeder bøjer "gruppe" rigtigt', () => {
    it('"kun 1 gruppe", ikke "kun 1 grupper", når emnerne er flere end grupperne', () => {
        const { hints } = hintsWithCheck({
            cls: {
                filename: 'en-gruppe', columns: ['Navn'],
                data: ['a', 'b', 'c'].map((x, k) => ({ _rowId: 'r' + (k + 1), Navn: 'Elev ' + x })),
                rules: [], togetherGroups: [], separations: [], topics: ['EU', 'FN', 'NATO'], columnOrders: {},
                settings: { groupTarget: '1', groupMod: '+' },
            },
            groupMode: 'number',
            locked: [],
        });
        const text = hints.map(h => h.text).join('\n');
        expect(text).toMatch(/Der er 3 emner, men kun 1 gruppe, så 2 emner får ingen gruppe\./);
    });
});

describe('emne-beskeden i antal-tilstand regner ikke på et tal, motoren ikke danner', () => {
    const setup = (target) => ({
        cls: {
            filename: 'puljer', columns: ['Navn', 'Hold'],
            data: Array.from({ length: 12 }, (_, k) => ({ _rowId: 'r' + (k + 1), Navn: 'Elev ' + (k + 1), Hold: ['a', 'b', 'c', 'd'][k % 4] })),
            rules: [{ type: 'aggregate', column: 'Hold' }],
            togetherGroups: [], separations: [], topics: ['EU', 'FN'], columnOrders: {},
            settings: { groupTarget: String(target), groupMod: '+' },
        },
        groupMode: 'number',
        locked: [],
    });

    it('tier, når Opdel giver flere puljer end det tastede antal grupper', () => {
        // 3 grupper tastet, men 4 puljer: motoren danner 4 (og siger det). Før
        // stod der også "3 grupper med 2 emner … Brug 4 grupper".
        const { answer, hints } = hintsWithCheck(setup(3));
        expect(answer.messages.map(m => m.code)).toContain('fewer-groups-than-pools');
        expect(hints.map(h => h.id)).not.toContain('hint:topic-count-mismatch');
        expect(hints.some(h => /Opdel giver 4 puljer/.test(h.text))).toBe(true);
    });

    it('står der stadig, når puljerne kan være i det tastede antal', () => {
        const { hints } = hintsWithCheck(setup(5));
        expect(hints.map(h => h.id)).toContain('hint:topic-count-mismatch');
    });
});

// ─── Matrix-runden (gennemsyn 103, 13/11 2026) ──────────────────────────────
// Det samme i runde 2: reglerne er matrixreglerne, størrelsen kommer fra
// matrix-opskriften ("Én fra hver", "Pr. gruppe", "Antal"), og kilderne er
// stamgrupperne. Stamgrupperne er her lagt tilfældigt (4 pr. gruppe).
function randomMatrix(R) {
    const setup = randomClass(R);
    const { cls } = setup;
    cls.topics = [];
    cls.matrixRules = cls.rules.filter(r => r.type !== 'aggregate');
    cls.rules = [];
    cls.matrixSettings = {
        groupTarget: String(1 + Math.floor(R() * 12)), groupMod: pick(R, ['+', '-']),
        matrixStrategy: pick(R, ['full_strict', 'size', 'count']),
        matrixRepresentationType: pick(R, ['topic', 'group']),
    };
    const ids = cls.data.map(r => r._rowId);
    const home = [];
    for (let i = 0; i < ids.length; i += 4) home.push({ name: 'Group ' + (home.length + 1), members: ids.slice(i, i + 4), topic: R() < 0.5 ? pick(R, ['EU', 'FN']) : null });
    // Indimellem en låst matrixgruppe med to af de tilstedeværende.
    const present = cls.data.filter(r => !r._excluded);
    const lockedMatrix = (R() < 0.25 && present.length > 3)
        ? [{ name: 'Group 1', locked: true, members: present.slice(0, 2).map(r => r._rowId) }]
        : [];
    return { cls, groupMode: setup.groupMode, home, lockedMatrix };
}

function matrixHintsWithCheck({ cls, groupMode, home, lockedMatrix }) {
    state.currentClass = cls;
    state.activeView = 'matrix';
    state.groupMode = groupMode;
    state.idColumn = '_rowId';
    state.displayColumn = 'Navn';
    state.storedStandardGroups = home;
    state.storedMatrixGroups = lockedMatrix;
    const input = buildEngineInput({ cls, isMatrix: true, groupMode, viewGroups: lockedMatrix, homeGroups: home });
    const answer = input ? check(input) : null;
    const usable = answer && answer.status !== 'error' && answer.status !== 'unsupported';
    engineCheck.value = usable
        ? { input, status: answer.status, messages: answer.messages.filter(m => !APP_OWNED_CODES.has(m.code)) }
        : null;
    return { input, answer: usable ? answer : null, hints: allHints.value };
}

describe('matrix: motorens skjulte beskeder har altid en af appens egne i stedet', () => {
    it('text-only-column og fewer-groups-than-asked (topic-rounding findes ikke i matrix)', () => {
        const R = rng(SEED + 5);
        const seen = { 'text-only-column': 0, 'topic-rounding': 0, 'fewer-groups-than-asked': 0 };
        let knownGap = 0;
        for (let i = 0; i < N; i++) {
            const setup = randomMatrix(R);
            const { input, answer, hints } = matrixHintsWithCheck(setup);
            if (!answer) continue;
            const ids = hints.map(h => h.id);
            const context = () => JSON.stringify({ setup, ids, messages: answer.messages });
            for (const m of answer.messages) {
                if (!APP_OWNED_CODES.has(m.code)) continue;
                seen[m.code]++;
                if (m.code === 'text-only-column') {
                    const rule = input.rules[m.rule];
                    if (columnIsNumeric(setup.cls.data, rule.column)) knownGap++;
                    expect(ids.some(id => id.startsWith('hint:non-numeric:matrix:') && id.endsWith(`:${rule.type}:${rule.column}`)), context()).toBe(true);
                } else if (m.code === 'fewer-groups-than-asked') {
                    expect(ids, context()).toContain('hint:too-many-groups');
                    // Tallet i appens besked er motorens (plus de låste).
                    const own = hints.find(h => h.id === 'hint:too-many-groups');
                    const engineNew = Number(m.text.match(/Der dannes (\d+) nye/)[1]);
                    const appTotal = Number(own.text.match(/Der dannes højst (\d+) grupp/)[1]);
                    expect(appTotal, context()).toBe(engineNew + setup.lockedMatrix.length);
                }
            }
            // Og omvendt: appens "flere grupper end elever" uden motorens note
            // ville være en falsk advarsel.
            if (ids.includes('hint:too-many-groups')) {
                expect(answer.messages.some(m => m.code === 'fewer-groups-than-asked'), context()).toBe(true);
            }
        }
        expect(seen['text-only-column']).toBeGreaterThan(20);
        expect(seen['fewer-groups-than-asked']).toBeGreaterThan(20);
        expect(seen['topic-rounding']).toBe(0);
        expect(knownGap).toBeLessThan(N / 500);
    });
});

// Hullet fra 101. gennemsyn, med vilje (111. gennemsyn, 13/11 2026): kolonnen
// er tal for klassen, men alle med et tal er fraværende eller låst fast.
// Motoren siger text-only-column (som appen aldrig viser); appen skal sige det
// selv — og kun dér, ikke når der er frie elever med tal tilbage.
describe('en tal-kolonne, hvor alle med et tal er væk', () => {
    function gapClass({ lockNumbers = false, excludeNumbers = false } = {}) {
        // 6 med tal (flertallet), 4 med tekst.
        const data = Array.from({ length: 10 }, (_, k) => ({
            _rowId: 'r' + (k + 1), Navn: 'Elev ' + (k + 1),
            Niveau: k < 6 ? String(1 + (k % 5)) : 'Middel', Hold: 'a',
            _excluded: excludeNumbers && k < 6,
        }));
        const cls = {
            filename: 'hul', columns: ['Navn', 'Niveau', 'Hold'], data,
            rules: [{ type: 'balance', column: 'Niveau' }],
            togetherGroups: [], separations: [], topics: [], columnOrders: {},
            settings: { groupTarget: '2', groupMod: '+', groupMode: 'size' },
        };
        const locked = lockNumbers
            ? [{ name: 'Group 1', locked: true, members: data.slice(0, 6).map(r => r._rowId) }]
            : [];
        return { cls, groupMode: 'size', locked };
    }
    const ownHint = (hints) => hints.find(h => h.id === 'hint:non-numeric:stam:balance:Niveau');

    it('alle med et tal er fraværende: motoren og appen siger begge "gør ingenting"', () => {
        const { answer, hints } = hintsWithCheck(gapClass({ excludeNumbers: true }));
        expect(answer.messages.map(m => m.code)).toContain('text-only-column');
        expect(ownHint(hints)?.text).toMatch(/fraværende eller låst fast/);
        // Ingen "Ranger"-knap: kolonnen skal ikke rangeres.
        expect(ownHint(hints)?.action).toBeUndefined();
    });

    it('alle med et tal er låst fast: samme besked', () => {
        const { answer, hints } = hintsWithCheck(gapClass({ lockNumbers: true }));
        expect(answer.messages.map(m => m.code)).toContain('text-only-column');
        expect(ownHint(hints)?.text).toMatch(/fraværende eller låst fast/);
    });

    it('matrix: alle med et tal er låst fast i en matrixgruppe', () => {
        const { cls } = gapClass();
        cls.matrixRules = cls.rules;
        cls.rules = [];
        cls.matrixSettings = { groupTarget: '2', groupMod: '+', matrixStrategy: 'size', matrixRepresentationType: 'group' };
        const ids = cls.data.map(r => r._rowId);
        const home = [0, 3, 6].map((at, i) => ({ name: 'Group ' + (i + 1), members: ids.slice(at, at + (i === 2 ? 4 : 3)), topic: null }));
        const lockedMatrix = [{ name: 'Group 1', locked: true, members: ids.slice(0, 6) }];
        const { answer, hints } = matrixHintsWithCheck({ cls, groupMode: 'size', home, lockedMatrix });
        expect(answer.messages.map(m => m.code)).toContain('text-only-column');
        const own = hints.find(h => h.id === 'hint:non-numeric:matrix:balance:Niveau');
        expect(own?.text).toMatch(/fraværende eller låst fast/);
        expect(own?.kind).toBe('info');
    });

    it('frie elever med tal: ingen advarsel (reglen virker)', () => {
        const { answer, hints } = hintsWithCheck(gapClass());
        expect(answer.messages.map(m => m.code)).not.toContain('text-only-column');
        expect(ownHint(hints)).toBeUndefined();
    });

    it('omvendt: appens "gør ingenting lige nu" står kun, når motoren siger text-only-column', () => {
        const R = rng(SEED + 11);
        let shown = 0;
        for (let i = 0; i < N; i++) {
            const setup = randomClass(R);
            // Halvdelen af gangene: alle med et tal i Niveau er fraværende,
            // så hullet faktisk rammes (ellers 2 af 15.000).
            if (R() < 0.5) setup.cls.data.forEach(r => { if (/^\d+$/.test(r.Niveau)) r._excluded = true; });
            const { input, answer, hints } = hintsWithCheck(setup);
            if (!answer) continue;
            for (const h of hints) {
                if (!h.id.startsWith('hint:non-numeric:') || !/gør ingenting lige nu/.test(h.text)) continue;
                shown++;
                const [, , , type, column] = h.id.split(':');
                const said = answer.messages.some(m => m.code === 'text-only-column'
                    && input.rules[m.rule]?.type === type && input.rules[m.rule]?.column === column);
                expect(said, JSON.stringify({ setup, id: h.id })).toBe(true);
            }
        }
        // Testen skal faktisk have mødt den.
        expect(shown).toBeGreaterThan(20);
    });
});
