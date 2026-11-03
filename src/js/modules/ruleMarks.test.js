import { describe, it, expect } from 'vitest';
import { ruleMarks, poolCount } from './ruleMarks.js';
import { severityOf } from './nextEngine.js';

// Et lille input: regel 0 Adskil, 1 Fordel, 2 Balancér, 3 Klyng. Sources
// siger, hvor i klassens liste hver regel stod (input er sorteret efter trin).
const input = (extra = {}) => ({
    rules: [
        { type: 'separate', column: 'Niveau', values: ['Høj'] },
        { type: 'distribute', column: 'Køn' },
        { type: 'balance', column: 'Karakter' },
        { type: 'cluster', column: 'Sprog' },
    ],
    students: [{ _rowId: 'a' }, { _rowId: 'b' }],
    agreements: { together: [], avoid: [] },
    ...extra,
});
const sources = [2, 0, 3, 1];
const rnm = (rule, extra = {}) => ({ type: 'note', code: 'rule-not-met', rule, pool: null, values: [], students: [], ...extra });

describe('ruleMarks — fra svaret til mærker pr. regel', () => {
    it('opfyldt, det bedst mulige, ikke opfyldt, ikke målt — på klassens pladser', () => {
        const answer = {
            status: 'ok',
            rules: [{ rule: 0, met: false }, { rule: 1, met: true }, { rule: 2, met: null }, { rule: 3, met: false }],
            messages: [rnm(0, { unavoidable: true }), rnm(3, { unavoidable: false, likelyBest: false })],
        };
        const { rules } = ruleMarks(input(), answer, sources, severityOf);
        expect(rules[2]).toEqual({ state: 'best', label: 'Ikke helt — det bedst mulige' });
        expect(rules[0]).toEqual({ state: 'met', label: 'Opfyldt' });
        expect(rules[3]).toEqual({ state: 'unmeasured', label: 'Ikke målt' });
        expect(rules[1]).toEqual({ state: 'open', label: 'Ikke opfyldt' });
    });

    it('"nok det bedste" (likelyBest) er også det bedst mulige; rød kun for det, der skal rettes', () => {
        const answer = {
            status: 'ok',
            rules: [{ rule: 0, met: false }, { rule: 1, met: false }],
            messages: [rnm(0, { likelyBest: true }), rnm(1, { type: 'impossible' })],
        };
        const { rules } = ruleMarks(input(), answer, sources, severityOf);
        expect(rules[2].state).toBe('best');
        expect(rules[0]).toEqual({ state: 'fix', label: 'Ikke opfyldt — skal rettes' });
    });

    it('en regel, motoren ikke fik (fx uden kolonne), får intet mærke', () => {
        const answer = { status: 'ok', rules: [{ rule: 0, met: true }], messages: [] };
        const { rules } = ruleMarks(input(), answer, [5], severityOf);
        expect(Object.keys(rules)).toEqual(['5']);
    });
});

describe('ruleMarks — Opdel: pr. pulje', () => {
    const opdel = () => input({
        rules: [{ type: 'aggregate', column: 'Hold' }, { type: 'separate', column: 'Niveau', values: ['Høj'] }, { type: 'balance', column: 'Karakter' }],
        students: [{ Hold: '2.a' }, { Hold: '2.b' }, { Hold: '2.c' }, { Hold: '2.a' }],
    });

    it('tæller puljerne ud fra Opdel-kolonnerne — som motoren: "Klima" og " klima" er én', () => {
        expect(poolCount(opdel())).toBe(3);
        expect(poolCount(input({ rules: [{ type: 'aggregate', column: 'Emne' }], students: [{ Emne: 'Klima' }, { Emne: ' klima' }, { Emne: 'Migration' }] }))).toBe(2);
        expect(poolCount(input())).toBe(0);
    });

    it('"Opfyldt i 2 af 3 puljer" — med "det bedst mulige", når puljen ikke kunne mere', () => {
        const answer = {
            status: 'ok',
            rules: [{ rule: 0, met: true }, { rule: 1, met: false }, { rule: 2, met: true }],
            messages: [rnm(1, { pool: '2.b', unavoidable: true })],
        };
        const { rules } = ruleMarks(opdel(), answer, [0, 1, 2], severityOf);
        expect(rules[1]).toEqual({ state: 'best', label: 'Opfyldt i 2 af 3 puljer — det bedst mulige', pools: { met: 2, total: 3 } });
        expect(rules[2].state).toBe('met');
    });

    it('to puljer uden om, den ene kan måske gøres bedre: "Opfyldt i 1 af 3 puljer"', () => {
        const answer = {
            status: 'ok',
            rules: [{ rule: 1, met: false }],
            messages: [rnm(1, { pool: '2.a', unavoidable: true }), rnm(1, { pool: '2.c', unavoidable: false })],
        };
        const { rules } = ruleMarks(opdel(), answer, [0, 1, 2], severityOf);
        expect(rules[1]).toEqual({ state: 'open', label: 'Opfyldt i 1 af 3 puljer', pools: { met: 1, total: 3 } });
    });
});

describe('ruleMarks — aftalerne', () => {
    const withAgreements = () => input({ agreements: { together: [['a', 'b']], avoid: [['c', 'd'], ['e', 'f', 'g']] } });

    it('alle holdt', () => {
        const { agreements } = ruleMarks(withAgreements(), { status: 'ok', rules: [], messages: [] }, sources, severityOf);
        expect(agreements).toEqual({ total: 3, broken: 0, brokenIds: [], mark: { state: 'met', label: 'Alle aftaler holdt' } });
    });

    it('en brudt Undgå hinanden (også i to puljer) tæller som én, med dens elever', () => {
        const answer = {
            status: 'ok', rules: [],
            messages: [rnm(null, { students: ['g', 'e', 'f'], pool: '2.a', unavoidable: true }), rnm(null, { students: ['e', 'f', 'g'], pool: '2.b', unavoidable: true })],
        };
        const { agreements } = ruleMarks(withAgreements(), answer, sources, severityOf);
        expect(agreements).toEqual({ total: 3, broken: 1, brokenIds: ['e', 'f', 'g'],
            mark: { state: 'best', label: '1 aftale brudt — det bedst mulige' } });
    });

    it('to ens Undgå-aftaler, begge brudt: to brud, selv om motoren sender én besked', () => {
        const twice = input({ agreements: { together: [], avoid: [['c', 'd'], ['d', 'c']] } });
        const answer = { status: 'ok', rules: [], messages: [rnm(null, { students: ['c', 'd'] })] };
        const { agreements } = ruleMarks(twice, answer, sources, severityOf);
        expect(agreements.broken).toBe(2);
        // Ikke uundgåeligt: blå pil ("en ny dannelse kan måske mere"), ikke "det bedst mulige".
        expect(agreements.mark).toEqual({ state: 'open', label: '2 aftaler brudt' });
    });

    it('matrix-kildernes resultat (uden elever) er ikke en aftale', () => {
        const answer = { status: 'ok', rules: [], messages: [rnm(null, { values: ['Ukraine'] })] };
        expect(ruleMarks(withAgreements(), answer, sources, severityOf).agreements.broken).toBe(0);
    });
});
