// Prøvekørslen i baggrunden (trialRun.js): den rene omregning af motorens
// svar til det, opskriften viser. Selve tråden og ventetiden prøves i
// browseren (e2e/proevekoersel.spec.ts).
import { describe, it, expect } from 'vitest';
import { trialText, readTrialAnswer, trialNoteText, TRIAL_BUDGET, TRIAL_SEED } from './trialRun.js';
import { buildEngineInput, ruleSources } from './nextEngine.js';
import { run, check } from '../../../motor/engine/engine.js';

describe('trialText', () => {
    it('fjerner parentesen med grupper', () => {
        expect(trialText('Adskil på "Rolle": to ender i samme gruppe ({gruppe:2}).')).toBe('Adskil på "Rolle": to ender i samme gruppe.');
        expect(trialText('Fordel på "Køn" går ikke helt op i 6 grupper ({gruppe:0}, {gruppe:1}, {gruppe:2}, {gruppe:3}, {gruppe:4}, …).'))
            .toBe('Fordel på "Køn" går ikke helt op i 6 grupper.');
    });
    it('fjerner rådet om at danne igen — der er ikke dannet noget endnu', () => {
        expect(trialText('Saml på "Niveau" er ikke helt opfyldt ({gruppe:1}). Prøv at danne igen.')).toBe('Saml på "Niveau" er ikke helt opfyldt.');
    });
    it('rører ikke andre parenteser og pladsholderen for elever', () => {
        expect(trialText('Undgå hinanden: {elever} skal i hver sin gruppe (2 par).')).toBe('Undgå hinanden: {elever} skal i hver sin gruppe (2 par).');
    });
});

// En klasse, hvor Adskil ikke kan holdes (9 med "Høj", 7 grupper) og Fordel kan.
function makeClass() {
    const data = [];
    for (let i = 0; i < 28; i++) {
        data.push({ _rowId: 'r' + i, Navn: 'Elev ' + i, Køn: i % 2 ? 'P' : 'D', Niveau: i < 9 ? 'Høj' : 'Lav' });
    }
    return {
        data,
        rules: [
            { type: 'distribute', column: 'Køn', value: '' },
            { type: 'separate', column: 'Niveau', value: 'Høj' },
        ],
        settings: { groupTarget: 4, groupMod: '+' },
        togetherGroups: [], separations: [], topics: [],
    };
}

describe('readTrialAnswer', () => {
    it('giver et mærke pr. regel og gentager ikke det, det hurtige tjek har sagt', async () => {
        const cls = makeClass();
        const input = buildEngineInput({ cls, isMatrix: false, groupMode: 'size' });
        const answer = await run({ ...input, budget: { ...TRIAL_BUDGET }, seed: TRIAL_SEED });
        expect(answer.status).toBe('ok');
        const sources = ruleSources.get(input);
        const checkMessages = check(input).messages;
        // Tjekket siger allerede, at Adskil ikke kan holdes.
        expect(checkMessages.some(m => m.code === 'separate-unavoidable')).toBe(true);

        const got = readTrialAnswer(input, answer, { sources, checkMessages });
        // Reglerne står i klassens rækkefølge: 0 = Fordel, 1 = Adskil.
        expect(got.rules[0].state).toBe('met');
        expect(got.rules[1].state).toBe('best');
        // Adskils resultat står ikke som note: tjekkets advarsel om samme regel dækker den.
        expect(got.notes).toEqual([]);

        // Uden tjekkets beskeder kommer resultatet med — uden gruppenavne.
        const alone = readTrialAnswer(input, answer, { sources, checkMessages: [] });
        expect(alone.notes.length).toBe(1);
        expect(alone.notes[0].text).toMatch(/^Adskil på "Niveau"/);
        expect(alone.notes[0].text).not.toMatch(/\{gruppe|Gruppe \d|gruppe \d/);
    });

    it('er den samme hver gang for samme opskrift (fast frø)', async () => {
        const input = buildEngineInput({ cls: makeClass(), isMatrix: false, groupMode: 'size' });
        const a = await run({ ...input, budget: { ...TRIAL_BUDGET }, seed: TRIAL_SEED });
        const b = await run({ ...input, budget: { ...TRIAL_BUDGET }, seed: TRIAL_SEED });
        expect(a.groups).toEqual(b.groups);
    });

    // 97. gennemsyn: motorens input har ingen navne, så aftrykket ændrer sig
    // ikke, når læreren retter et navn. Noten gemmes derfor med pladsholderen,
    // og navnet sættes ind, når den vises.
    it('gemmer noten uden navne, så et rettet navn slår igennem', async () => {
        const input = buildEngineInput({ cls: makeClass(), isMatrix: false, groupMode: 'size' });
        const answer = await run({ ...input, budget: { ...TRIAL_BUDGET }, seed: TRIAL_SEED });
        // En besked om to elever, som motoren ville skrive den.
        const withNames = { ...answer, messages: [...answer.messages, { code: 'avoid-broken', severity: 'warning', students: ['r0', 'r1'], text: 'Undgå hinanden: {elever} ender i samme gruppe ({gruppe:0}).' }] };
        const got = readTrialAnswer(input, withNames, { sources: ruleSources.get(input), checkMessages: check(input).messages });
        const note = got.notes.find(n => n.students.length === 2);
        expect(note.text).toBe('Undgå hinanden: {elever} ender i samme gruppe.');
        expect(note.students).toEqual(['r0', 'r1']);
        expect(trialNoteText(note, (id) => ({ r0: 'Asta', r1: 'Bo' })[id])).toBe('Undgå hinanden: Asta, Bo ender i samme gruppe.');
        expect(trialNoteText(note, (id) => ({ r0: 'Astrid', r1: 'Bo' })[id])).toBe('Undgå hinanden: Astrid, Bo ender i samme gruppe.');
    });

    // Med fast frø skal svaret være det samme, uanset hvor mange kerner
    // motoren får — ellers ville prøvekørslen på én kerne sige noget andet end
    // den samme prøvekørsel med hjælpetråde. (I Node er der altid én kerne;
    // testen vogter, at `cores` kan gives med uden at ændre svaret.)
    it('cores: 1 giver samme svar som uden', async () => {
        const input = buildEngineInput({ cls: makeClass(), isMatrix: false, groupMode: 'size' });
        const a = await run({ ...input, budget: { ...TRIAL_BUDGET }, seed: TRIAL_SEED });
        const b = await run({ ...input, budget: { ...TRIAL_BUDGET }, seed: TRIAL_SEED }, { cores: 1 });
        expect(b.groups).toEqual(a.groups);
        expect(b.stats.cores).toBe(1);
    });

    it('et svar, der ikke kan bruges, giver ingenting', () => {
        const input = buildEngineInput({ cls: makeClass(), isMatrix: false, groupMode: 'size' });
        expect(readTrialAnswer(input, null)).toBeNull();
        expect(readTrialAnswer(input, { status: 'error', messages: [] })).toBeNull();
        expect(readTrialAnswer(input, { status: 'ok', groups: [{ members: ['r0'] }], messages: [], rules: [] })).toBeNull();
    });
});
