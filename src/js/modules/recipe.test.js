import { describe, it, expect } from 'vitest';
import { ruleSentence, ruleIsIncomplete, sizeSentence, namesText, recipeSummary, ruleTypeLabel, findTwinRule, ruleValueExists, expectedNewGroups, typingOutsideRecipe, perGroupEstimate, currentLastNotes } from './recipe.js';
import { setupSignature } from './utils.js';
import { RULE_TYPES, RULE_OPTIONS } from './utils.js';

const plain = (parts) => parts.map(p => p.text).join('');

describe('opskriften: regler som sætninger', () => {
    it('har en sætning til hver regeltype i menuen', () => {
        for (const opt of RULE_OPTIONS) {
            const s = ruleSentence({ type: opt.value, column: 'Køn', value: 'P' });
            expect(s[0]).toMatchObject({ token: 'type', text: opt.label });
            expect(s.some(p => p.token === 'column' && p.text === 'Køn')).toBe(true);
        }
    });

    it('Fordel læses som en hel sætning', () => {
        expect(plain(ruleSentence({ type: RULE_TYPES.DISTRIBUTE, column: 'Køn' }))).toBe('Fordel Køn jævnt i grupperne.');
    });

    it('Adskil nævner værdien og markerer den, når den mangler', () => {
        const s = ruleSentence({ type: RULE_TYPES.SEPARATE, column: 'Niveau', value: '' });
        expect(s.find(p => p.token === 'value')).toMatchObject({ text: 'vælg værdi', missing: true });
        expect(ruleIsIncomplete({ type: RULE_TYPES.SEPARATE, column: 'Niveau', value: '' })).toBe(true);
        expect(ruleIsIncomplete({ type: RULE_TYPES.SEPARATE, column: 'Niveau', value: 'Høj' })).toBe(false);
    });

    it('en regel uden kolonne er ufuldstændig, men en Fordel behøver ingen værdi', () => {
        expect(ruleIsIncomplete({ type: RULE_TYPES.DISTRIBUTE, column: '' })).toBe(true);
        expect(ruleIsIncomplete({ type: RULE_TYPES.DISTRIBUTE, column: 'Køn' })).toBe(false);
        expect(ruleSentence({ type: RULE_TYPES.DISTRIBUTE, column: '' })[2]).toMatchObject({ missing: true });
    });

    it('den strenge adskillelse har sit eget navn', () => {
        expect(ruleTypeLabel(RULE_TYPES.STRICT_SEPARATE)).toBe('Adskil altid');
    });
});

describe('opskriften: størrelse og opsummering', () => {
    it('størrelse og afrunding', () => {
        expect(plain(sizeSentence({ mode: 'size', target: 4, mod: '+' })))
            .toBe('Dan grupper på 4 elever. Går det ikke op, får nogle grupper én elev ekstra.');
        expect(plain(sizeSentence({ mode: 'size', target: 1, mod: '-' })))
            .toBe('Dan grupper på 1 elev. Går det ikke op, får nogle grupper én elev mindre.');
    });

    it('antal grupper har ingen afrunding', () => {
        expect(plain(sizeSentence({ mode: 'number', target: 7 }))).toBe('Dan 7 grupper.');
    });

    it('navne i en aftale', () => {
        expect(namesText(['Emma'])).toBe('Emma');
        expect(namesText(['Emma', 'Noah'])).toBe('Emma og Noah');
        expect(namesText(['Emma', 'Ida', 'Noah'])).toBe('Emma, Ida og Noah');
    });

    it('opsummeringen tæller kun regler der kan bruges, og bøjer ordene', () => {
        const rules = [
            { type: RULE_TYPES.DISTRIBUTE, column: 'Køn' },
            { type: RULE_TYPES.DISTRIBUTE, column: '' },
        ];
        expect(recipeSummary({ mode: 'size', target: 4, rules, together: 1, separations: 1, topics: 5 }))
            .toBe('4 pr. gruppe · 1 regel · 2 aftaler · 5 emner');
        expect(recipeSummary({ mode: 'number', target: 1 })).toBe('1 gruppe');
    });
});

import { addRule, updateRuleField, deleteRule, ONLY_ONE_AGGREGATE } from './recipe.js';

describe('opskriften: ændringer i regellisten', () => {
    it('en ny regel er en Fordel uden kolonne', () => {
        const rules = [];
        expect(addRule(rules)).toBe(0);
        expect(rules[0]).toEqual({ type: RULE_TYPES.DISTRIBUTE, column: '', value: '' });
    });

    it('skiftes kolonnen, tømmes værdien — og ligeså ved en type uden værdi', () => {
        const rules = [{ type: RULE_TYPES.SEPARATE, column: 'Niveau', value: 'Høj' }];
        updateRuleField(rules, 0, 'column', 'Køn');
        expect(rules[0]).toMatchObject({ column: 'Køn', value: '' });
        updateRuleField(rules, 0, 'value', 'P');
        updateRuleField(rules, 0, 'type', RULE_TYPES.DISTRIBUTE);
        expect(rules[0].value).toBe('');
    });

    it('en regel der bliver til Opdel, flyttes øverst', () => {
        const rules = [
            { type: RULE_TYPES.DISTRIBUTE, column: 'Køn', value: '' },
            { type: RULE_TYPES.DISTRIBUTE, column: 'Hold', value: '' },
        ];
        updateRuleField(rules, 1, 'type', RULE_TYPES.AGGREGATE);
        expect(rules.map(r => r.column)).toEqual(['Hold', 'Køn']);
    });

    it('der kan kun være én Opdel', () => {
        const rules = [
            { type: RULE_TYPES.AGGREGATE, column: 'Hold', value: '' },
            { type: RULE_TYPES.DISTRIBUTE, column: 'Køn', value: '' },
        ];
        expect(updateRuleField(rules, 1, 'type', RULE_TYPES.AGGREGATE)).toBe(ONLY_ONE_AGGREGATE);
        expect(rules[1].type).toBe(RULE_TYPES.DISTRIBUTE);
    });

    it('slet', () => {
        const rules = [{ type: RULE_TYPES.DISTRIBUTE, column: 'Køn' }];
        expect(deleteRule(rules, 0)).toBe(true);
        expect(rules).toEqual([]);
        expect(deleteRule(rules, 0)).toBe(false);
    });
});

import { matrixSentence, matrixSummary } from './recipe.js';

describe('runde 2: matrix som sætning', () => {
    it('fuld blanding på stamgrupper og på emner', () => {
        expect(plain(matrixSentence({ strategy: 'full_strict', repType: 'group' })))
            .toBe('Bland stamgrupperne helt — én fra hver stamgruppe.');
        expect(plain(matrixSentence({ strategy: 'full_strict', repType: 'topic' })))
            .toBe('Bland stamgrupperne helt — én fra hvert emne.');
    });
    it('størrelse har afrunding, antal har ikke', () => {
        expect(plain(matrixSentence({ strategy: 'size', target: 4, mod: '-' })))
            .toBe('Bland stamgrupperne til grupper på 4 elever. Går det ikke op, får nogle grupper én elev mindre.');
        expect(plain(matrixSentence({ strategy: 'count', target: 1 }))).toBe('Bland stamgrupperne til 1 gruppe.');
    });
    it('opsummering', () => {
        expect(matrixSummary({ strategy: 'full_strict', repType: 'group' })).toBe('én fra hver stamgruppe');
        expect(matrixSummary({ strategy: 'size', target: 5, rules: [{ type: RULE_TYPES.DISTRIBUTE, column: 'Køn' }] }))
            .toBe('5 pr. gruppe · 1 regel');
    });
});

import { columnFitness } from './recipe.js';

describe('passer kolonnen til reglen?', () => {
    const rows = [
        { Navn: 'Ana', Karakter: '7', Niveau: 'Lav', Tom: '' },
        { Navn: 'Bo', Karakter: '4', Niveau: 'Høj', Tom: '' },
        { Navn: 'Cy', Karakter: '10', Niveau: 'Lav', Tom: '' },
        { Navn: 'Di', Karakter: '2', Niveau: 'Middel', Tom: '' },
    ];
    it('Ensartede og Balancér kræver tal — eller en rangering der rammer', () => {
        expect(columnFitness(rows, 'Karakter', RULE_TYPES.BALANCE).ok).toBe(true);
        expect(columnFitness(rows, 'Niveau', RULE_TYPES.MINIMIZEDIFF)).toMatchObject({ ok: false, reason: 'tekst' });
        expect(columnFitness(rows, 'Niveau', RULE_TYPES.MINIMIZEDIFF, { Niveau: ['Lav', 'Middel', 'Høj'] }).ok).toBe(true);
        expect(columnFitness(rows, 'Niveau', RULE_TYPES.MINIMIZEDIFF, { Niveau: ['A', 'B'] }).ok).toBe(false);
    });
    it('en kolonne med hver sin værdi kan ikke fordele noget', () => {
        expect(columnFitness(rows, 'Navn', RULE_TYPES.DISTRIBUTE)).toMatchObject({ ok: false, reason: 'unik' });
        expect(columnFitness(rows, 'Niveau', RULE_TYPES.DISTRIBUTE).ok).toBe(true);
    });
    it('en tom kolonne kan ingenting', () => {
        expect(columnFitness(rows, 'Tom', RULE_TYPES.DISTRIBUTE)).toMatchObject({ ok: false, reason: 'tom' });
    });
    it('uden kolonne er der intet at sige', () => {
        expect(columnFitness(rows, '', RULE_TYPES.DISTRIBUTE).ok).toBe(true);
    });
});

import { recipeHintText } from './recipe.js';

describe('noterne i opskriftens ord', () => {
    it('"+1"/"-1" bliver til ordet i linje 1', () => {
        expect(recipeHintText('Vil du hellere have 9 grupper, så tryk "-1".'))
            .toBe('Vil du hellere have 9 grupper, så vælg "én elev mindre".');
        expect(recipeHintText('… så tryk "+1".')).toBe('… så vælg "én elev ekstra".');
    });
    it('antal-tilstandens emne-note taler ikke om matrix', () => {
        expect(recipeHintText('7 grupper med 3 emner: ét emne tildeles kun 2 grupper og begrænser matrix. Brug 9 grupper for ligelig fordeling.'))
            .toBe('7 grupper med 3 emner: ét emne tildeles kun 2 grupper. Brug 9 grupper, så hvert emne får lige mange.');
        expect(recipeHintText('… og begrænser matrix. Brug 5 nye grupper (9 i alt) for ligelig fordeling.'))
            .toBe('…. Brug 5 nye grupper (9 i alt), så hvert emne får lige mange.');
    });
    it('andre noter er uændrede', () => {
        expect(recipeHintText('3 emner: antal grupper rundes ned fra 7 til 6.')).toBe('3 emner: antal grupper rundes ned fra 7 til 6.');
    });
});

describe('tvillingregler', () => {
    const rules = [
        { type: RULE_TYPES.SEPARATE, column: 'Rolle', value: 'Leder' },
        { type: RULE_TYPES.DISTRIBUTE, column: 'Køn', value: '' },
    ];
    it('Adskil på samme kolonne med en ANDEN værdi er ikke en tvilling', () => {
        expect(findTwinRule(rules, RULE_TYPES.SEPARATE, 'Rolle', 'Kasserer', -1)).toBe(-1);
    });
    it('Adskil med samme værdi (uanset store bogstaver) er en tvilling', () => {
        expect(findTwinRule(rules, RULE_TYPES.SEPARATE, 'Rolle', 'leder', -1)).toBe(0);
    });
    it('regler uden værdi er tvillinger på type + kolonne alene', () => {
        expect(findTwinRule(rules, RULE_TYPES.DISTRIBUTE, 'Køn', '', 5)).toBe(1);
    });
    it('reglen er ikke sin egen tvilling', () => {
        expect(findTwinRule(rules, RULE_TYPES.SEPARATE, 'Rolle', 'Leder', 0)).toBe(-1);
    });
});

describe('findes kolonnen og værdien stadig?', () => {
    const rows = [{ Køn: 'Dreng' }, { Køn: 'Pige' }];
    const ctx = { columns: ['Køn'], rows };
    it('uden context markeres intet', () => {
        expect(ruleSentence({ type: RULE_TYPES.DISTRIBUTE, column: 'Alder' })[2]).toMatchObject({ text: 'Alder', missing: false });
    });
    it('en slettet kolonne får (findes ikke)', () => {
        expect(ruleSentence({ type: RULE_TYPES.DISTRIBUTE, column: 'Alder' }, ctx)[2]).toMatchObject({ text: 'Alder (findes ikke)', missing: true });
    });
    it('en værdi der ikke længere findes får (findes ikke) — store/små bogstaver er ligegyldige', () => {
        const gone = ruleSentence({ type: RULE_TYPES.SEPARATE, column: 'Køn', value: 'Andet' }, ctx).find(p => p.token === 'value');
        expect(gone).toMatchObject({ text: 'Andet (findes ikke)', missing: true });
        const ok = ruleSentence({ type: RULE_TYPES.SEPARATE, column: 'Køn', value: 'dreng' }, ctx).find(p => p.token === 'value');
        expect(ok).toMatchObject({ text: 'dreng', missing: false });
        expect(ruleValueExists(rows, 'Køn', 'PIGE')).toBe(true);
    });
});

describe('forventet antal grupper', () => {
    it('"én elev ekstra" runder ned', () => {
        expect(expectedNewGroups({ target: 4, mod: '+', students: 14 })).toBe(3);
    });
    it('"én elev ekstra" lægger en gruppe til, når den største ellers blev for stor (11 elever, 4+ giver 3)', () => {
        expect(expectedNewGroups({ target: 4, mod: '+', students: 11 })).toBe(3);
    });
    it('"én elev mindre" runder op', () => {
        expect(expectedNewGroups({ target: 4, mod: '-', students: 14 })).toBe(4);
        expect(expectedNewGroups({ target: 4, mod: '-', students: 13 })).toBe(4);
        expect(expectedNewGroups({ target: 4, mod: '-', students: 12 })).toBe(3);
    });
    it('aldrig flere grupper end elever, og nul elever giver nul', () => {
        expect(expectedNewGroups({ target: 4, mod: '-', students: 0 })).toBe(0);
        expect(expectedNewGroups({ mode: 'number', target: 9, students: 5 })).toBe(5);
    });
    it('emner runder kun, når størrelsen holder, som generation.js gør', () => {
        // 14 elever, mål 4, "+": 3 grupper på 4-5. 2 emner ville give 2 à 7 eller
        // 4 à 3-4, og begge er uden for valget, så de 3 bliver stående.
        expect(expectedNewGroups({ target: 4, mod: '+', students: 14, topicCount: 2 })).toBe(3);
        expect(expectedNewGroups({ target: 4, mod: '+', students: 24, topicCount: 3 })).toBe(6);
        expect(expectedNewGroups({ target: 4, mod: '-', students: 14, topicCount: 3 })).toBe(4);
    });
});

describe('genvejen ⌘/Ctrl+Enter og felter', () => {
    // Et lille stykke "DOM": closest() leder efter en vælger i kæden af forældre.
    const el = (tag, parent = null, extra = {}) => ({
        tag, parent, ...extra,
        closest(sel) {
            let n = this;
            while (n) {
                if ((sel.includes('input') && ['input', 'textarea', 'select'].includes(n.tag))
                    || (sel.includes('recipe-dialog') && n.recipeDialog)) return n;
                n = n.parent;
            }
            return null;
        },
    });
    it('et felt uden for opskriften blokerer genvejen', () => {
        expect(typingOutsideRecipe(el('input'))).toBe(true);
    });
    it('et felt inde i opskriftens vindue gør ikke', () => {
        const dialog = el('dialog', null, { recipeDialog: true });
        expect(typingOutsideRecipe(el('input', dialog))).toBe(false);
    });
    it('andre elementer blokerer ikke', () => {
        expect(typingOutsideRecipe(el('div'))).toBe(false);
        expect(typingOutsideRecipe(null)).toBe(false);
    });
});

import { isRecipeHint } from './recipe.js';

describe('advarslernes plads: gruppeopskriften eller over grupperne', () => {
    it('regler, aftaler og hvad der kan gå op hører til opskriften', () => {
        for (const id of ['conflict:standard:Køn:dup-distribute', 'feasibility:cluster:Sprog',
            'hint:no-value:stam:Køn', 'hint:non-numeric:stam:balance:Niveau',
            'hint:together:[1]', 'hint:together-cost:x']) {
            expect(isRecipeHint({ id })).toBe(true);
        }
    });
    it('det, der handler om de dannede grupper, bliver over grupperne', () => {
        for (const id of ['hint:unnamed', 'hint:avoid-broken:G1:a,b', 'hint:matrix-drift:abc']) {
            expect(isRecipeHint({ id })).toBe(false);
        }
        expect(isRecipeHint(null)).toBe(false);
    });
});

describe('tegnsætning efter et ord', () => {
    it('dele der begynder med . eller , er markeret, så de kan rykkes ind til ordet', () => {
        const parts = sizeSentence({ mode: 'number', target: 7 });
        expect(parts.at(-1)).toEqual({ text: '.', punct: true });
        const rule = ruleSentence({ type: RULE_TYPES.BALANCE, column: 'Karakter' });
        expect(rule.at(-1)).toMatchObject({ punct: true });
        expect(rule.at(-1).text.startsWith(',')).toBe(true);
        // almindelig tekst med mellemrum først er IKKE tegnsætning
        expect(ruleSentence({ type: RULE_TYPES.DISTRIBUTE, column: 'Køn' })[1]).toEqual({ text: ' ' });
    });
});

import { ruleDisplayOrder } from './recipe.js';

describe('reglerne i den rækkefølge, motoren bruger', () => {
    const rules = [
        { type: RULE_TYPES.DISTRIBUTE, column: 'Køn' },
        { type: RULE_TYPES.GROUP_SORT, column: 'Niveau' },
        { type: RULE_TYPES.SEPARATE, column: 'Niveau', value: 'Høj' },
        { type: RULE_TYPES.DISTRIBUTE, column: 'Sprog' },
    ];
    it('ordnet efter trin, stabilt inden for trinnet, med én overskrift pr. trin', () => {
        const out = ruleDisplayOrder(rules);
        expect(out.map(x => x.index)).toEqual([2, 0, 3, 1]);
        expect(out.map(x => x.heading)).toEqual(['Vejer tungt', 'Mål', '', 'Hvis det kan lade sig gøre']);
    });
    it('Opdel står altid først', () => {
        const out = ruleDisplayOrder([{ type: RULE_TYPES.DISTRIBUTE, column: 'Køn' }, { type: RULE_TYPES.AGGREGATE, column: 'Hold' }]);
        expect(out[0].index).toBe(1);
        expect(out[0].heading).toBe('Deles op først');
    });
});

describe('perGroupEstimate', () => {
    it('sætter kommaet i tallet, ikke i "ca."', () => {
        expect(perGroupEstimate(28, 3)).toBe('ca. 9,3 elever pr. gruppe');
        expect(perGroupEstimate(28, 4)).toBe('ca. 7 elever pr. gruppe');
        expect(perGroupEstimate(3, 3)).toBe('ca. 1 elev pr. gruppe');
        expect(perGroupEstimate(0, 3)).toBe('');
    });
});

describe('currentLastNotes — "Sidste dannelse" gælder kun, mens opsætningen passer', () => {
    const cls = () => ({ settings: { groupTarget: 4, groupMod: '+' }, rules: [{ type: 'distribute', column: 'Køn' }], data: [] });
    const notices = (c) => ({
        last: { standard: [{ text: 'Noget', type: 'info' }], matrix: [] },
        lastSignature: { standard: setupSignature(c, false, 'size'), matrix: null },
    });

    it('viser noterne, når reglerne er de samme', () => {
        const c = cls();
        expect(currentLastNotes(notices(c), c, false, 'size')).toHaveLength(1);
    });

    it('skjuler dem, når en regel eller størrelsen er ændret siden', () => {
        const c = cls();
        const n = notices(c);
        c.rules.push({ type: 'cluster', column: 'X' });
        expect(currentLastNotes(n, c, false, 'size')).toEqual([]);
        const c2 = cls();
        const n2 = notices(c2);
        c2.settings.groupTarget = 5;
        expect(currentLastNotes(n2, c2, false, 'size')).toEqual([]);
    });

    it('uden aftryk (fx en ældre kørsel) vises intet', () => {
        const c = cls();
        const n = notices(c);
        n.lastSignature.standard = null;
        expect(currentLastNotes(n, c, false, 'size')).toEqual([]);
    });
});

import { ruleTier, tierPositions, moveRuleInTier, setTierOrder } from './recipe.js';

describe('den nye motor: rækkefølgen inden for et trin', () => {
    const R = (type, column) => ({ type, column });
    const make = () => [
        R(RULE_TYPES.DISTRIBUTE, 'Køn'),        // 0 mål
        R(RULE_TYPES.SEPARATE, 'Niveau'),       // 1 tung
        R(RULE_TYPES.BALANCE, 'Karakter'),      // 2 mål
        R(RULE_TYPES.CLUSTER, 'Sprog'),         // 3 tung
        R(RULE_TYPES.GROUP_SORT, 'Hold'),       // 4 let
    ];

    it('trinnene og deres pladser', () => {
        const rules = make();
        expect(ruleTier(RULE_TYPES.STRICT_SEPARATE)).toBe('strict');
        expect(ruleTier(RULE_TYPES.SEPARATE)).toBe('heavy');
        expect(ruleTier(RULE_TYPES.MINIMIZEDIFF)).toBe('goal');
        expect(tierPositions(rules, 2)).toEqual([0, 2]);
        expect(tierPositions(rules, 3)).toEqual([1, 3]);
    });

    it('pil op/ned bytter med naboen i samme trin; de andre bliver, hvor de er', () => {
        const rules = make();
        expect(moveRuleInTier(rules, 2, -1)).toBe(0);
        expect(rules.map(r => r.column)).toEqual(['Karakter', 'Niveau', 'Køn', 'Sprog', 'Hold']);
        // Ingen nabo i trinnet: ingenting sker.
        expect(moveRuleInTier(rules, 0, -1)).toBe(-1);
        expect(moveRuleInTier(rules, 4, 1)).toBe(-1);
        expect(moveRuleInTier(rules, 4, -1)).toBe(-1);
    });

    it('visningen inden for et trin er listens rækkefølge — den, motoren får', () => {
        const rules = make();
        moveRuleInTier(rules, 3, -1);
        const shown = ruleDisplayOrder(rules).map(d => d.rule.column);
        expect(shown).toEqual(['Sprog', 'Niveau', 'Køn', 'Karakter', 'Hold']);
        const heavyInList = rules.filter(r => ruleTier(r.type) === 'heavy').map(r => r.column);
        expect(heavyInList).toEqual(['Sprog', 'Niveau']);
    });

    it('træk: trinnets regler lægges tilbage på trinnets pladser', () => {
        const rules = make();
        const pos = tierPositions(rules, 0);
        setTierOrder(rules, pos, [rules[2], rules[0]]);
        expect(rules.map(r => r.column)).toEqual(['Karakter', 'Niveau', 'Køn', 'Sprog', 'Hold']);
    });
});
