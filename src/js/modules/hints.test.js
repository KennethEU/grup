// hints.test.js — beskederne ved måltalsfeltet.
//
// De tre der prøves her, handler alle om det samme regnestykke: hvor mange
// grupper der er plads til, når man tæller de elever der faktisk er til stede
// og ikke låst fast. Beskederne skal kunne følges — et råd der peger på et
// tal, loftet i generation.js afviser i samme øjeblik, er værre end tavshed.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Knapperne i emne-beskederne gemmer klassen; testen skal ikke kalde serveren.
vi.mock('./classActions.js', () => ({ autoSave: vi.fn() }));

// generateMatrixGroups importeres af hints.js (knappen i matrix-hintet), og
// den trækker hele api-kæden med sig. Her måles der kun på tekst, så kæden
// erstattes af en attrap.
vi.mock('./generation.js', () => ({ generateMatrixGroups: vi.fn(), generateWithoutTogether: vi.fn() }));

import { state } from './state.js';
import { allHints, hintsFor, ANCHOR_TARGET } from './hints.js';
import { isRecipeHint } from './recipe.js';
import { generateWithoutTogether } from './generation.js';

/** Teksterne på de beskeder der hører til måltalsfeltet. */
function targetTexts() {
    return hintsFor(ANCHOR_TARGET).map(h => h.text);
}

/** n elever, hvoraf de første `absent` er markeret fraværende. */
function students(n, absent = 0) {
    return Array.from({ length: n }, (_, i) => ({
        Navn: `S${i}`, _rowId: `r${i}`, _excluded: i < absent,
    }));
}

describe('hints — for mange grupper til for få elever', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.currentClass = {
            filename: 'test',
            data: students(28, 20),          // 8 til stede
            columns: ['Navn'],
            rules: [],
            settings: { groupTarget: '14', groupMod: '+' },
            separations: [],
            topics: [],
        };
        state.storedStandardGroups = [];
        state.storedMatrixGroups = [];
        state.groupMode = 'number';
        state.activeView = 'standard';
        state.idColumn = '_rowId';
        state.displayColumn = 'Navn';
    });

    it('siger til, når tallet ikke kan fyldes op', () => {
        const t = targetTexts().join('\n');
        expect(t).toMatch(/Du beder om 14 grupper, men der er kun 8 elever/);
        expect(t).toMatch(/Der dannes højst 8 grupper/);
    });

    it('tier, når tallet kan lade sig gøre', () => {
        state.currentClass.data = students(28, 0);
        expect(targetTexts().join('\n')).not.toMatch(/Du beder om/);
    });

    it('tier i størrelses-tilstand — dér betyder tallet noget andet', () => {
        state.groupMode = 'size';
        expect(targetTexts().join('\n')).not.toMatch(/Du beder om/);
    });

    it('regner låste grupper med, så loftet er det samme som motorens', () => {
        // 6 elever: 2 låst fast, 4 frie. 9 ønskede grupper → 8 nye til 4 elever.
        state.currentClass.data = students(6, 0);
        state.currentClass.settings = { groupTarget: '9', groupMod: '+' };
        state.storedStandardGroups = [
            { name: 'Group 1', members: ['r0', 'r1'], locked: true },
        ];
        const t = targetTexts().join('\n');
        expect(t).toMatch(/kun 4 elever til rådighed ud over den gruppe, du har låst/);
        expect(t).toMatch(/Der dannes højst 5 grupper/);
    });
});

describe('hints — emne-afrundingen lover kun det, loftet lader den holde', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.currentClass = {
            filename: 'test',
            data: students(30, 0),
            columns: ['Navn'],
            rules: [],
            settings: { groupTarget: '3', groupMod: '+' },
            separations: [],
            topics: ['Liberalisme', 'Socialisme', 'Konservatisme'],
        };
        state.storedStandardGroups = [];
        state.storedMatrixGroups = [];
        state.groupMode = 'size';
        state.activeView = 'standard';
        state.idColumn = '_rowId';
        state.displayColumn = 'Navn';
    });

    it('siger "multiplum", når totalen FAKTISK er et multiplum', () => {
        // 30 elever, størrelse 3, "+1" → 10 rundes ned til 9 (3 × 3).
        const t = targetTexts().join('\n');
        expect(t).toMatch(/3 emner: antal grupper rundes ned fra 10 til 9/);
        expect(t).toMatch(/multiplum af 3/);
    });

    it('lover IKKE et multiplum, når elev-loftet har taget det væk', () => {
        // Kun 2 elever til stede og 3 emner: loftet skærer ned til 2 grupper,
        // og 2 er ikke et multiplum af 3.
        state.currentClass.data = students(30, 28);
        const t = targetTexts().join('\n');
        expect(t).not.toMatch(/multiplum/);
        expect(t).toMatch(/3 emner, men kun 2 elever til rådighed/);
        expect(t).toMatch(/mindst ét emne får ingen/i);
    });
});

describe('hints — emner og gruppestørrelse', () => {
    const hint = (id) => hintsFor(ANCHOR_TARGET).find(h => h.id === id);
    beforeEach(() => {
        vi.clearAllMocks();
        state.currentClass = {
            filename: 'test',
            data: students(28, 0),
            columns: ['Navn'],
            rules: [],
            settings: { groupTarget: '4', groupMod: '+' },
            separations: [],
            topics: ['A', 'B', 'C', 'D', 'E'],
        };
        state.storedStandardGroups = [];
        state.storedMatrixGroups = [];
        state.groupMode = 'size';
        state.activeView = 'standard';
        state.idColumn = '_rowId';
        state.displayColumn = 'Navn';
    });

    it('holder størrelsen og tilbyder multiplerne, når tallet ikke går op', () => {
        const h = hint('hint:topic-uneven');
        expect(h.text).toMatch(/7 grupper går ikke lige op med 5 emner/);
        expect(h.actions.map(a => a.label)).toEqual(['Brug 5 grupper (5–6 elever)', 'Brug 10 grupper (2–3 elever)']);
    });

    it('siger prisen ved færre grupper end emner, og knappen vælger det rå antal', () => {
        state.currentClass.data = students(24, 0);
        state.currentClass.settings = { groupTarget: '5', groupMod: '+' };
        const h = hint('hint:topic-floor');
        expect(h.text).toMatch(/mindst 5 grupper/);
        expect(h.text).toMatch(/4–5 elever i stedet for 6/);
        expect(h.text).not.toMatch(/multiplum/);
        expect(h.actions[0].label).toBe('Brug 4 grupper (1 emne udgår)');
        h.actions[0].run();
        expect(state.groupMode).toBe('number');
        expect(state.currentClass.settings.groupTarget).toBe(4);
    });

    it('tier, når tallet går op', () => {
        state.currentClass.data = students(25, 0);
        state.currentClass.settings = { groupTarget: '5', groupMod: '+' };
        expect(hint('hint:topic-uneven')).toBeUndefined();
        expect(hint('hint:topic-floor')).toBeUndefined();
    });
});

describe('hints — forslaget skal kunne følges', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.currentClass = {
            filename: 'test',
            data: students(28, 0),
            columns: ['Navn'],
            rules: [],
            settings: { groupTarget: '12', groupMod: '+' },
            separations: [],
            topics: ['A', 'B', 'C', 'D', 'E'],   // 12 er ikke et multiplum af 5
        };
        state.storedStandardGroups = [];
        state.storedMatrixGroups = [];
        state.groupMode = 'number';
        state.activeView = 'standard';
        state.idColumn = '_rowId';
        state.displayColumn = 'Navn';
    });

    it('foreslår næste multiplum, når der er elever nok', () => {
        expect(targetTexts().join('\n')).toMatch(/Brug 15 grupper for ligelig fordeling/);
    });

    it('foreslår IKKE 15 grupper til 8 elever', () => {
        state.currentClass.data = students(28, 20);   // 8 til stede
        const t = targetTexts().join('\n');
        expect(t).not.toMatch(/Brug 15 grupper/);
        // Det ægte problem siges stadig — af den anden besked.
        expect(t).toMatch(/Du beder om 12 grupper, men der er kun 8 elever/);
    });
});

// Aftaler kan begrænse søgningen; de beviser ikke i sig selv, at en regel
// er umulig. Motorens modbeviser ligger også i test_together.py.
describe('hints — aftalens pris på de øvrige regler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.currentClass = {
            filename: 'test',
            data: [
                { Navn: 'Anna', _rowId: 'r1', Niveau: '1' },
                { Navn: 'Bob', _rowId: 'r2', Niveau: '8' },
                { Navn: 'Clara', _rowId: 'r3', Niveau: '1' },
            ],
            columns: ['Navn', 'Niveau'],
            rules: [{ type: 'group_sort', column: 'Niveau' }],
            settings: { groupTarget: '2' },
            separations: [],
            togetherGroups: [],
            topics: [],
        };
        state.storedStandardGroups = [];
        state.storedMatrixGroups = [];
        state.groupMode = 'size';
        state.activeView = 'standard';
        state.idColumn = '_rowId';
        state.displayColumn = 'Navn';
    });

    const hintTexts = () => allHints.value.map(h => h.text).join('\n');

    it('tier, når aftalen ikke koster noget', () => {
        state.currentClass.togetherGroups = [{ ids: ['r1', 'r3'] }];   // begge niveau 1
        expect(hintTexts()).not.toMatch(/Aftalen kan begrænse/);
    });

    it('nævner regel og elever uden at erklære fordelingen umulig', () => {
        state.currentClass.togetherGroups = [{ ids: ['r1', 'r2'] }];   // niveau 1 og 8
        const t = hintTexts();
        expect(t).toMatch(/Saml på "Niveau"/);
        expect(t).toMatch(/Anna, Bob/);
        expect(t).toMatch(/forskellige værdier/);
        expect(t).toMatch(/kan begrænse fordelingen/);
        expect(t).not.toMatch(/kan ikke gå helt op|ikke en fejl/);
    });

    it('vender regnestykket om for Fordel — dér er det de ENS værdier', () => {
        state.currentClass.rules = [{ type: 'distribute', column: 'Niveau' }];
        state.currentClass.togetherGroups = [{ ids: ['r1', 'r3'] }];
        expect(hintTexts()).toMatch(/Fordel på "Niveau".*deler samme værdi/s);
        expect(hintTexts()).not.toMatch(/kan ikke gå helt op/);
    });

    it('tier på matrixfladen, hvor aftalerne ikke gælder', () => {
        state.currentClass.togetherGroups = [{ ids: ['r1', 'r2'] }];
        state.activeView = 'matrix';
        expect(hintTexts()).not.toMatch(/Aftalen kan begrænse/);
    });
});

// Konkrete falske alarmer fra dobbelttjekket 7/9.
describe('hints — Adskil uden en valgt værdi', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.currentClass = {
            filename: 'test',
            data: [
                { Navn: 'Anna', _rowId: 'r1', Hold: 'A' },
                { Navn: 'Bob', _rowId: 'r2', Hold: 'B' },
            ],
            columns: ['Navn', 'Hold'],
            rules: [],
            settings: { groupTarget: '2' },
            separations: [],
            togetherGroups: [],
            topics: [],
        };
        state.storedStandardGroups = [];
        state.storedMatrixGroups = [];
        state.groupMode = 'size';
        state.activeView = 'standard';
        state.idColumn = '_rowId';
        state.displayColumn = 'Navn';
    });

    const texts = () => allHints.value.map(h => h.text);

    it('siger fra, mens reglen bliver skrevet — ikke først efter kørslen', () => {
        state.currentClass.rules = [{ type: 'separate', column: 'Hold', value: '' }];
        expect(texts().some(t => /Adskil på "Hold" gør ingenting/.test(t))).toBe(true);
    });

    it('tier, så snart der er valgt en værdi', () => {
        state.currentClass.rules = [{ type: 'separate', column: 'Hold', value: 'A' }];
        expect(texts().some(t => /gør ingenting/.test(t))).toBe(false);
    });

    it('tier for undgåelserne, der får deres værdier af sig selv', () => {
        // Undgåelser bliver til strict_separate-regler MED elev-id'er i
        // generation.js; de står aldrig tomme i lærerens regelliste.
        state.currentClass.rules = [{ type: 'strict_separate', column: '_rowId', values: ['r1', 'r2'] }];
        expect(texts().some(t => /gør ingenting/.test(t))).toBe(false);
    });
});

describe('hints — aftalens værdier måles som motorens', () => {
    beforeEach(() => {
        state.currentClass = {
            filename: 'hint-values', columns: ['Name', 'Value'],
            data: [{ _rowId: 'r1', Name: 'Anna', Value: '1' },
                   { _rowId: 'r2', Name: 'Bo', Value: '1,0' },
                   { _rowId: 'r3', Name: 'Clara', Value: '2' }],
            rules: [], togetherGroups: [{ ids: ['r1', 'r2'] }], separations: [],
        };
        state.activeView = 'standard';
        state.displayColumn = 'Name';
        state.storedStandardGroups = [];
        state.storedMatrixGroups = [];
    });
    const costHints = () => allHints.value.filter(h => h.id.startsWith('hint:together-cost:'));

    it.each(['group_sort', 'minimizediff'])('samme tal med komma giver intet %s-hint', type => {
        state.currentClass.rules = [{ type, column: 'Value' }];
        expect(costHints()).toEqual([]);
    });

    it('Klyng kan opfyldes med flere værdier i aftalen', () => {
        state.currentClass.rules = [{ type: 'cluster', column: 'Value' }];
        expect(costHints()).toEqual([]);
    });

    it('tomme værdier og forskellig stavning skaber ikke en falsk konflikt', () => {
        state.currentClass.data[0].Value = ' Høj ';
        state.currentClass.data[1].Value = 'høj';
        state.currentClass.rules = [{ type: 'group_sort', column: 'Value' }];
        expect(costHints()).toEqual([]);
        state.currentClass.data[1].Value = '';
        expect(costHints()).toEqual([]);
        state.currentClass.data[0].Value = '';
        state.currentClass.rules = [{ type: 'distribute', column: 'Value' }];
        expect(costHints()).toEqual([]);
    });

    it('Fordel ser også gentagelser i en blandet aftale — en gammel gemt værdi tier ikke hintet', () => {
        state.currentClass.togetherGroups = [{ ids: ['r1', 'r2', 'r3'] }];
        state.currentClass.data[1].Value = '1';
        state.currentClass.rules = [{ type: 'distribute', column: 'Value' }];
        expect(costHints()).toHaveLength(1);
        expect(costHints()[0].text).not.toMatch(/kan ikke gå helt op/);
        // Fordel arbejder på HELE kolonnen (RULES_WITHOUT_VALUES), og
        // værdifeltet findes ikke længere. En værdi, der er blevet stående på
        // en gammel regel, må derfor ikke kunne skjule en aftale, motoren
        // faktisk bliver begrænset af.
        state.currentClass.rules[0].value = '2';
        expect(costHints()).toHaveLength(1);
    });

    it('Ensartede på en rangeret tekstkolonne ser aftalens forskellige niveauer', () => {
        // Gruppedannelsen regner Lav/Høj om til rang 1/3. Læst som tal var
        // begge "ingenting", og hintet tav.
        state.currentClass.data[0].Value = 'Lav';
        state.currentClass.data[1].Value = 'Høj';
        state.currentClass.rules = [{ type: 'minimizediff', column: 'Value' }];
        expect(costHints()).toEqual([]);
        state.currentClass.columnOrders = { Value: ['Lav', 'Middel', 'Høj'] };
        expect(costHints()).toHaveLength(1);
        // Samme niveau i to stavemåder er ét niveau — ingen konflikt.
        state.currentClass.data[1].Value = ' lav ';
        expect(costHints()).toEqual([]);
    });
});

