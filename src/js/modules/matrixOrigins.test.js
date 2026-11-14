// matrixOrigins / matrixOriginDrift / groupSetFingerprint (129. gennemsyn).
//
// Matrix-advarslen "Stamgrupperne er ændret" og "Sidste dannelse"s mærker
// sammenlignede stamgruppernes medlemslister i rækkefølge. Så gav en elev
// meldt fraværende (ude af BÅDE stam- og matrixgruppen) og en ny rækkefølge i
// et kort en falsk alarm. Her prøves, at det, der gør matrixen skæv, stadig
// giver en skævhed, og at de tre falske ikke gør.
import { describe, it, expect } from 'vitest';
import { matrixOrigins, matrixOriginDrift, groupSetFingerprint } from './utils.js';

const stam = () => ([
    { name: 'Group 1', topic: 'Klima', members: ['r1', 'r2', 'r3'] },
    { name: 'Group 2', topic: 'EU', members: ['r4', 'r5', 'r6'] },
]);
const matrix = () => ([
    { name: 'Group 1', members: ['r1', 'r4'] },
    { name: 'Group 2', members: ['r2', 'r5'] },
    { name: 'Group 3', members: ['r3', 'r6'] },
]);

describe('matrixOriginDrift', () => {
    it('ingen ændring → ingen skævhed', () => {
        const snap = matrixOrigins(stam(), matrix());
        expect(matrixOriginDrift(snap, stam(), matrix())).toBeNull();
    });

    it('en elev flyttet til en anden stamgruppe → skævhed', () => {
        const snap = matrixOrigins(stam(), matrix());
        const s = stam();
        s[0].members = ['r2', 'r3'];
        s[1].members.push('r1');
        expect(matrixOriginDrift(snap, s, matrix())).toBe('r1=Group 2:EU');
    });

    it('to stamgrupper, der bytter emne → skævhed (emnet er kilden)', () => {
        const snap = matrixOrigins(stam(), matrix());
        const s = stam();
        s[0].topic = 'EU';
        s[1].topic = 'Klima';
        expect(matrixOriginDrift(snap, s, matrix())).not.toBeNull();
    });

    it('en elev taget ud af både stam- og matrixgruppen (papirkurven) → ingen skævhed', () => {
        const snap = matrixOrigins(stam(), matrix());
        const s = stam();
        const m = matrix();
        s[0].members = ['r2', 'r3'];
        m[0].members = ['r4'];
        expect(matrixOriginDrift(snap, s, m)).toBeNull();
    });

    it('en ny rækkefølge i et stamkort → ingen skævhed', () => {
        const snap = matrixOrigins(stam(), matrix());
        const s = stam();
        s[0].members.reverse();
        expect(matrixOriginDrift(snap, s, matrix())).toBeNull();
    });

    it('en elev sat ind i matrixen bagefter (efternøler) → ingen skævhed', () => {
        const snap = matrixOrigins(stam(), matrix());
        const s = stam();
        const m = matrix();
        s[1].members.push('r7');
        m[0].members.push('r7');
        expect(matrixOriginDrift(snap, s, m)).toBeNull();
    });

    it('en elev meldt væk (ude af begge) og sat tilbage i matrixen alene → ingen skævhed', () => {
        const snap = matrixOrigins(stam(), matrix());
        const s = stam();
        const m = matrix();
        s[0].members = ['r2', 'r3'];          // ikke i nogen stamgruppe
        m[0].members = ['r4'];
        m[1].members.push('r1');              // efternøler i matrix-visningen
        expect(matrixOriginDrift(snap, s, m)).toBeNull();
    });

    it('elever flyttet rundt i matrixen i hånden → ingen skævhed', () => {
        const snap = matrixOrigins(stam(), matrix());
        const m = matrix();
        m[0].members = ['r1', 'r5'];
        m[1].members = ['r2', 'r4'];
        expect(matrixOriginDrift(snap, stam(), m)).toBeNull();
    });

    it('ny skævhed giver ny nøgle', () => {
        const snap = matrixOrigins(stam(), matrix());
        const a = stam();
        a[0].members = ['r2', 'r3']; a[1].members.push('r1');
        const b = stam();
        b[0].members = ['r1', 'r3']; b[1].members.push('r2');
        expect(matrixOriginDrift(snap, a, matrix())).not.toBe(matrixOriginDrift(snap, b, matrix()));
    });

    it('uden aftryk (fx efter en genindlæsning) eller med et ulæseligt → null', () => {
        expect(matrixOriginDrift(null, stam(), matrix())).toBeNull();
        expect(matrixOriginDrift('ikke json', stam(), matrix())).toBeNull();
    });

    it('aftrykket er aldrig tomt — null betyder stadig "ved ikke"', () => {
        expect(matrixOrigins([], [])).toBe('[]');
    });

    it('medlemmer som objekter ({ id }) læses som id', () => {
        const s = stam();
        s[0].members = [{ id: 'r1' }, 'r2', 'r3'];
        const snap = matrixOrigins(s, matrix());
        expect(JSON.parse(snap)).toContainEqual(['r1', 'Group 1:Klima']);
    });
});

describe('groupSetFingerprint', () => {
    it('ser bort fra rækkefølgen i kortet — men ikke fra hvem der står hvor', () => {
        const a = stam();
        const b = stam();
        b[0].members.reverse();
        expect(groupSetFingerprint(a)).toBe(groupSetFingerprint(b));
        b[0].members = ['r1', 'r2'];
        b[1].members.push('r3');
        expect(groupSetFingerprint(a)).not.toBe(groupSetFingerprint(b));
    });
});
