import { describe, it, expect } from 'vitest';
import { separationConflictIds, partnersOutside, findBestGroup } from './placement.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// placement.js — efternøler-placering
//
// Kernesemantik der låses fast her: emnet vejer ALTID tungest; en
// undgåelse brydes KUN når emne-prioriteten tvinger det (alle grupper i
// det mindst-belastede emne har konflikt) — og kun dér advares læreren.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const student = (id, extra = {}) => ({ Navn: id, ...extra });
const group = (name, memberIds, opts = {}) => ({
    name,
    members: memberIds,
    locked: false,
    topic: null,
    ...opts,
});

// `random: () => 0` gør lodtrækningen ved lige score forudsigelig: den første
// af de lige gode grupper vinder. Testene nedenfor måler altså scoren; selve
// lodtrækningen har sine egne tests ("lige score trækker lod").
const baseCtx = (overrides = {}) => ({
    random: () => 0,
    idCol: 'Navn',
    rules: [],
    separations: [],
    classTopics: [],
    allStudents: [],
    ...overrides,
});

describe('separationConflictIds', () => {
    const seps = [{ ids: ['Anna', 'Bob'] }, { ids: ['Anna', 'Carl'] }];

    it('finder alle de medlemmer, eleven skal undgå', () => {
        const g = group('G1', ['Bob', 'Carl', 'Dina']);
        const ids = separationConflictIds(student('Anna'), g, { idCol: 'Navn', separations: seps });
        expect(ids.sort()).toEqual(['Bob', 'Carl']);
    });

    it('svarer tomt, når der ingen konflikt er', () => {
        const g = group('G1', ['Dina', 'Erik']);
        const ids = separationConflictIds(student('Anna'), g, { idCol: 'Navn', separations: seps });
        expect(ids).toEqual([]);
    });

    it('tæller aldrig eleven som en konflikt med sig selv', () => {
        // Tilbagevendende elev der stadig står i gruppen
        const g = group('G1', ['Anna', 'Dina']);
        const ids = separationConflictIds(student('Anna'), g, { idCol: 'Navn', separations: seps });
        expect(ids).toEqual([]);
    });
});

describe('findBestGroup — grundregler', () => {
    it('svarer null uden grupper eller uden ulåste grupper', () => {
        expect(findBestGroup(student('Ny'), [], baseCtx())).toBe(null);
        expect(findBestGroup(student('Ny'), null, baseCtx())).toBe(null);
        const allLocked = [group('G1', ['A'], { locked: true })];
        expect(findBestGroup(student('Ny'), allLocked, baseCtx())).toBe(null);
    });

    it('vælger aldrig en låst gruppe', () => {
        const groups = [
            group('Låst lille', [], { locked: true }),
            group('Åben stor', ['A', 'B', 'C']),
        ];
        expect(findBestGroup(student('Ny'), groups, baseCtx()).name).toBe('Åben stor');
    });

    it('foretrækker den mindste gruppe, når hverken emner eller regler gælder', () => {
        const groups = [group('Stor', ['A', 'B', 'C']), group('Lille', ['D'])];
        expect(findBestGroup(student('Ny'), groups, baseCtx()).name).toBe('Lille');
    });
});

describe('findBestGroup — emne vejer tungest, undgåelse brydes kun når den SKAL', () => {
    const seps = [{ ids: ['Ny', 'Bob'] }];

    it('inden for samme emne vælges den konfliktfri gruppe (ingen advarsel nødvendig)', () => {
        const groups = [
            group('A-med-Bob', ['Bob'], { topic: 'EmneA' }),
            group('A-fri', ['Carl'], { topic: 'EmneA' }),
            group('B-stor', ['D', 'E', 'F', 'G'], { topic: 'EmneB' }),
        ];
        const ctx = baseCtx({ separations: seps, classTopics: ['EmneA', 'EmneB'] });
        // EmneA (2 elever) er mindst belastet → vælg A-gruppe; den konflikt-
        // fri af de to skal vinde, så undgåelsen overholdes.
        expect(findBestGroup(student('Ny'), groups, ctx).name).toBe('A-fri');
    });

    it('bryder undgåelsen når det mindst-belastede emne KUN har konflikt-grupper', () => {
        const groups = [
            group('A-med-Bob', ['Bob'], { topic: 'EmneA' }),
            group('B-fri', ['D', 'E', 'F'], { topic: 'EmneB' }),
        ];
        const ctx = baseCtx({ separations: seps, classTopics: ['EmneA', 'EmneB'] });
        // EmneA har 1 elev, EmneB har 3 → emne-prioriteten tvinger valget af
        // A-med-Bob trods konflikten. Det er PRÆCIS her advarslen skal fyre.
        const chosen = findBestGroup(student('Ny'), groups, ctx);
        expect(chosen.name).toBe('A-med-Bob');
        expect(separationConflictIds(student('Ny'), chosen, { idCol: 'Navn', separations: seps }))
            .toEqual(['Bob']);
    });

    it('ved emne-uafgjort afgør undgåelsen valget', () => {
        const groups = [
            group('A-med-Bob', ['Bob'], { topic: 'EmneA' }),
            group('B-fri', ['Carl'], { topic: 'EmneB' }),
        ];
        const ctx = baseCtx({ separations: seps, classTopics: ['EmneA', 'EmneB'] });
        // Begge emner har 1 elev → samme emne-score → konfliktfri vinder.
        expect(findBestGroup(student('Ny'), groups, ctx).name).toBe('B-fri');
    });

    it('emne-match er case-insensitivt', () => {
        const groups = [
            group('A', ['x', 'y', 'z'], { topic: 'liberalisme' }),
            group('B', ['v'], { topic: 'KONSERVATISME' }),
        ];
        const ctx = baseCtx({ classTopics: ['Liberalisme', 'Konservatisme'] });
        expect(findBestGroup(student('Ny'), groups, ctx).name).toBe('B');
    });

    it('låste gruppers elever tæller med i emne-regnskabet (som LPT i generation)', () => {
        const groups = [
            group('A-låst', ['p', 'q', 'r'], { topic: 'EmneA', locked: true }),
            group('A-åben', ['s'], { topic: 'EmneA' }),
            group('B-åben', ['t', 'u'], { topic: 'EmneB' }),
        ];
        const ctx = baseCtx({ classTopics: ['EmneA', 'EmneB'] });
        // EmneA har reelt 4 elever (3 låste + 1), EmneB kun 2 → B-åben skal
        // vinde. Taltes låste ikke med, så EmneA falsk underbelastet ud (1<2).
        expect(findBestGroup(student('Ny'), groups, ctx).name).toBe('B-åben');
    });

    it('undgåelse vejer tungere end gruppestørrelse', () => {
        const groups = [
            group('Lille-med-Bob', ['Bob'], {}),
            group('Stor-fri', ['C', 'D', 'E', 'F', 'G', 'H']),
        ];
        const ctx = baseCtx({ separations: seps });
        expect(findBestGroup(student('Ny'), groups, ctx).name).toBe('Stor-fri');
    });
});

describe('findBestGroup — fordel/klyng som tiebreaker', () => {
    const allStudents = [
        student('Bob', { Køn: 'M' }),
        student('Carl', { Køn: 'M' }),
        student('Dina', { Køn: 'K' }),
    ];

    it('distribute foretrækker gruppen med færrest samme værdi', () => {
        const groups = [group('M-tung', ['Bob', 'Carl']), group('Blandet', ['Dina', 'Bob'])];
        const ctx = baseCtx({
            rules: [{ type: 'distribute', column: 'Køn' }],
            allStudents,
        });
        // Begge har 2 medlemmer (samme størrelses-score); 'M-tung' har 2 M'er,
        // 'Blandet' 1 → distribute peger på 'Blandet' for en M-elev.
        expect(findBestGroup(student('Ny', { Køn: 'M' }), groups, ctx).name).toBe('Blandet');
    });

    it('cluster foretrækker gruppen med flest samme værdi', () => {
        const groups = [group('M-tung', ['Bob', 'Carl']), group('Blandet', ['Dina', 'Bob'])];
        const ctx = baseCtx({
            rules: [{ type: 'cluster', column: 'Køn' }],
            allStudents,
        });
        expect(findBestGroup(student('Ny', { Køn: 'M' }), groups, ctx).name).toBe('M-tung');
    });

    // Prioriteringen øverst i placement.js lover at "mindste gruppe" (niveau 3)
    // står HØJERE end reglerne (niveau 4). Talte reglerne rå medlemmer, holdt
    // det ikke: to klyng-regler i en stor gruppe kunne samle nok point til at
    // sende efternøleren hen i den gruppe, der i forvejen var størst.
    it('kan ikke overtrumfe gruppestørrelsen, uanset hvor mange klyng-regler der er', () => {
        const manyGroups = [];
        for (let i = 0; i < 8; i++) manyGroups.push(student(`m${i}`, { Køn: 'M', Linje: 'A' }));
        manyGroups.push(student('sol', { Køn: 'M', Linje: 'A' }));

        const groups = [
            group('Stor-og-ens', ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']),
            group('Lille', ['sol']),
        ];
        const ctx = baseCtx({
            rules: [
                { type: 'cluster', column: 'Køn' },
                { type: 'cluster', column: 'Linje' },
            ],
            allStudents: manyGroups,
        });
        // Begge grupper er 100 % ens på begge regler — så reglerne er uafgjorte,
        // og størrelsen skal afgøre det.
        expect(findBestGroup(student('Ny', { Køn: 'M', Linje: 'A' }), groups, ctx).name)
            .toBe('Lille');
    });

    it('en tom gruppe straffes ikke af en fordel-regel', () => {
        const groups = [group('Tom', []), group('Blandet', ['Dina'])];
        const ctx = baseCtx({
            rules: [{ type: 'distribute', column: 'Køn' }],
            allStudents,
        });
        expect(findBestGroup(student('Ny', { Køn: 'M' }), groups, ctx).name).toBe('Tom');
    });

    it('forstår legacy regel-felter (attribute/name)', () => {
        const groups = [group('M-tung', ['Bob', 'Carl']), group('Blandet', ['Dina', 'Bob'])];
        const ctx = baseCtx({
            rules: [{ name: 'distribute', attribute: 'Køn' }],
            allStudents,
        });
        expect(findBestGroup(student('Ny', { Køn: 'M' }), groups, ctx).name).toBe('Blandet');
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fund fra efternøler-gennemsynet 2026-09-01.
//
// Modalen er lavet til at sætte en FRAVÆRENDE elev tilbage — så en klasse
// med fravær er normaltilfældet, ikke undtagelsen. Alligevel talte alle tre
// størrelses-følsomme niveauer (emne, gruppestørrelse, regler) de fraværende
// med, som om de sad der. Og regel-leddet sammenlignede rå celleværdier, så
// det kunne se to kategorier ("Dreng"/"dreng") eller en kategori for meget
// (den tomme celle), hvor gruppedannelsen så én henholdsvis ingen.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('findBestGroup — fraværende sidder der ikke', () => {
    const absentIds = (id, extra = {}) => student(id, { _excluded: true, ...extra });

    it('gruppestørrelsen tæller kun dem der er til stede', () => {
        const allStudents = [
            student('a1'), student('a2'), student('a3'),
            absentIds('b1'), absentIds('b2'), student('b3'), student('b4'),
        ];
        const groups = [
            group('Tre-til-stede', ['a1', 'a2', 'a3']),
            group('Fire-men-to-væk', ['b1', 'b2', 'b3', 'b4']),
        ];
        // Rå medlemstal: 3 mod 4 → den første. Til stede: 3 mod 2 → den anden.
        expect(findBestGroup(student('Ny'), groups, baseCtx({ allStudents })).name)
            .toBe('Fire-men-to-væk');
    });

    it('emne-regnskabet tæller kun dem der er til stede', () => {
        const allStudents = [
            absentIds('a1'), absentIds('a2'), student('a3'), student('a4'),
            student('b1'), student('b2'), student('b3'),
        ];
        const groups = [
            group('Klima', ['a1', 'a2', 'a3', 'a4'], { topic: 'Klima' }),
            group('EU', ['b1', 'b2', 'b3'], { topic: 'EU' }),
        ];
        // Rå: Klima 4, EU 3 → EU er mindst belastet. Til stede: Klima 2, EU 3
        // → Klima er den der mangler elever.
        const ctx = baseCtx({ allStudents, classTopics: ['Klima', 'EU'] });
        expect(findBestGroup(student('Ny'), groups, ctx).name).toBe('Klima');
    });

    it('regel-tiebreakeren ser bort fra fraværende gruppekammerater', () => {
        const allStudents = [
            absentIds('a1', { Køn: 'M' }), student('a2', { Køn: 'K' }),
            student('b1', { Køn: 'M' }), absentIds('b2', { Køn: 'K' }),
        ];
        const groups = [
            group('M-er-væk', ['a1', 'a2']),
            group('M-er-her', ['b1', 'b2']),
        ];
        const ctx = baseCtx({ allStudents, rules: [{ type: 'cluster', column: 'Køn' }] });
        // Begge har én til stede. Klyng skal pege på gruppen hvor det er
        // drengen der SIDDER der — ikke den hvor han er meldt fraværende.
        expect(findBestGroup(student('Ny', { Køn: 'M' }), groups, ctx).name)
            .toBe('M-er-her');
    });

    it('et spøgelse (medlem uden elevrække) tælles som til stede', () => {
        // Vi kan ikke spørge en række der ikke findes. Talte spøgelser som
        // fraværende, ville et ctx uden elevrækker klappe hver gruppe ned til
        // størrelse nul — og alle unit-tests ovenfor ville måle på ingenting.
        const groups = [
            group('To-spøgelser', ['spøgelse1', 'spøgelse2']),
            group('Én-rigtig', ['a1']),
        ];
        const ctx = baseCtx({ allStudents: [student('a1')] });
        expect(findBestGroup(student('Ny'), groups, ctx).name).toBe('Én-rigtig');
    });
});

describe('findBestGroup — værdierne måles som gruppedannelsen måler dem', () => {
    it('store og små bogstaver er samme værdi', () => {
        // canonicalizeCategoricalCasing() folder dem, FØR motoren ser dataene.
        // Den matchende gruppe står bevidst SIDST: med rå sammenligning var
        // begge grupper uafgjorte, og den første vandt.
        const allStudents = [student('p1', { Køn: 'Pige' }), student('d1', { Køn: '  dreng ' })];
        const groups = [group('Piger', ['p1']), group('Drenge', ['d1'])];
        const ctx = baseCtx({ allStudents, rules: [{ type: 'cluster', column: 'Køn' }] });
        expect(findBestGroup(student('Ny', { Køn: 'Dreng' }), groups, ctx).name)
            .toBe('Drenge');
    });

    it('en tom celle samler ikke eleven med de andre tomme celler', () => {
        // "Ikke udfyldt" er ikke en kategori — hverken her eller i
        // scoring.normalize_value(). Den tomme gruppe står sidst: før vandt
        // den på et klyng-match, nu er reglen tavs og de to er lige store.
        const allStudents = [student('m1', { Køn: 'M' }), student('e1', { Køn: '' })];
        const groups = [group('Med-svar', ['m1']), group('Uden-svar', ['e1'])];
        const ctx = baseCtx({ allStudents, rules: [{ type: 'cluster', column: 'Køn' }] });
        expect(findBestGroup(student('Ny', { Køn: '' }), groups, ctx).name)
            .toBe('Med-svar');
    });

    it('en tom celle gør ikke gruppen mindre ens', () => {
        // Nævneren er de medlemmer der HAR svaret (samme regnestykke som
        // n_valued i scoring._score_distribute), ikke gruppestørrelsen: en
        // gruppe med én dreng og én tom celle er 100 % drenge, ikke 50 %.
        const allStudents = [
            student('m1', { Køn: 'M' }), student('e1', { Køn: '' }),
            student('m2', { Køn: 'M' }), student('m3', { Køn: 'M' }),
        ];
        const groups = [
            group('Dreng-og-tom', ['m1', 'e1']),
            group('To-drenge', ['m2', 'm3']),
        ];
        const ctx = baseCtx({ allStudents, rules: [{ type: 'cluster', column: 'Køn' }] });
        // Begge er nu 100 % ens for en dreng, og lige store — så klyng-reglen
        // afgør ikke længere noget, og den første gruppe bliver stående.
        expect(findBestGroup(student('Ny', { Køn: 'M' }), groups, ctx).name)
            .toBe('Dreng-og-tom');
    });

    it('en elev uden svar i kolonnen bliver ikke flyttet af reglen', () => {
        const allStudents = [student('m1', { Køn: 'M' }), student('m2', { Køn: 'M' })];
        const groups = [group('Lille', ['m1']), group('Stor', ['m1', 'm2'])];
        const ctx = baseCtx({ allStudents, rules: [{ type: 'distribute', column: 'Køn' }] });
        expect(findBestGroup(student('Ny', { Køn: null }), groups, ctx).name).toBe('Lille');
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hele regelsættet, ikke kun fordel/klyng
//
// Dialogen lover læreren, at systemet finder den bedste gruppe. Indtil nu så
// den kun på emne, undgåelser, størrelse, Fordel og Klyng — så en efternøler
// kunne bryde en aftale, en Opdel-regel, en Adskil-regel eller matrixens
// én-pr.-stamgruppe, uden at noget sagde fra.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('partnersOutside — hvem mangler eleven at sidde hos?', () => {
    const ctx = { idCol: 'Navn', togetherComponents: [['Anna', 'Bob', 'Carl']] };

    it('nævner kun de partnere der IKKE sidder i gruppen', () => {
        expect(partnersOutside(student('Anna'), group('G1', ['Bob']), ctx)).toEqual(['Carl']);
    });

    it('tom liste når aftalen er hel', () => {
        expect(partnersOutside(student('Anna'), group('G1', ['Bob', 'Carl']), ctx)).toEqual([]);
    });

    it('tom liste når eleven slet ikke har en aftale', () => {
        expect(partnersOutside(student('Dina'), group('G1', ['Bob']), ctx)).toEqual([]);
    });
});

describe('findBestGroup — Skal sammen vejer tungest', () => {
    const ctx = (extra = {}) => baseCtx({
        togetherComponents: [['Anna', 'Bob']],
        ...extra,
    });

    it('vælger partnerens gruppe, selv om den er størst', () => {
        const groups = [group('G1', ['Carl']), group('G2', ['Bob', 'Dina', 'Erik'])];
        expect(findBestGroup(student('Anna'), groups, ctx()).name).toBe('G2');
    });

    it('slår både emnet og en undgåelse', () => {
        // Emnet "Klima" har færrest elever OG ingen undgåelse — men Bob sidder
        // i EU-gruppen, og aftalen er et krav, ikke en vægt.
        const groups = [
            group('G1', [], { topic: 'Klima' }),
            group('G2', ['Bob', 'Carl'], { topic: 'EU' }),
        ];
        const found = findBestGroup(student('Anna'), groups, ctx({
            classTopics: ['Klima', 'EU'],
            separations: [{ ids: ['Anna', 'Carl'] }],
        }));
        expect(found.name).toBe('G2');
    });

    it('en FRAVÆRENDE partner tæller stadig — han sidder der jo stadig', () => {
        // Vinduet er lavet til at sætte en fraværende tilbage, og partneren kan
        // udmærket selv være væk i dag. Gruppen er hans alligevel. G2 er
        // mindst (én til stede mod to), så uden aftalen ville den vinde.
        const groups = [group('G1', ['Bob', 'Dina', 'Erik']), group('G2', ['Carl'])];
        const found = findBestGroup(student('Anna'), groups, ctx({
            allStudents: [
                student('Bob', { _excluded: true }), student('Dina'),
                student('Erik'), student('Carl'),
            ],
        }));
        expect(found.name).toBe('G1');
    });

    it('en aftale i en LÅST gruppe kan ikke opfyldes — og siges videre', () => {
        const locked = group('G1', ['Bob'], { locked: true });
        const groups = [locked, group('G2', ['Carl'])];
        const found = findBestGroup(student('Anna'), groups, ctx());
        expect(found.name).toBe('G2');
        expect(partnersOutside(student('Anna'), found, ctx())).toEqual(['Bob']);
    });
});

describe('findBestGroup — matrixens én pr. stamgruppe', () => {
    const sourceById = new Map([
        ['Anna', 'grp 1'], ['Bob', 'grp 1'], ['Carl', 'grp 2'], ['Dina', 'grp 3'],
    ]);

    it('undgår gruppen der allerede har en fra samme stamgruppe', () => {
        // G1 er MINDST, men har Bob fra "grp 1" — samme kilde som Anna.
        const groups = [group('M1', ['Bob']), group('M2', ['Carl', 'Dina'])];
        const found = findBestGroup(student('Anna'), groups, baseCtx({
            sourceById,
            allStudents: [student('Bob'), student('Carl'), student('Dina')],
        }));
        expect(found.name).toBe('M2');
    });

    it('uden kilde-kort opfører den sig som før (mindste gruppe vinder)', () => {
        const groups = [group('M1', ['Bob']), group('M2', ['Carl', 'Dina'])];
        const found = findBestGroup(student('Anna'), groups, baseCtx({
            allStudents: [student('Bob'), student('Carl'), student('Dina')],
        }));
        expect(found.name).toBe('M1');
    });
});

describe('findBestGroup — Opdel og Adskil', () => {
    it('Opdel: eleven sættes ved bordet med sin egen værdi', () => {
        // G2 er størst, men G1 ville få en fremmed ind på et rent "EU"-bord.
        const students = [
            student('Bob', { Emne: 'EU' }), student('Carl', { Emne: 'EU' }),
            student('Dina', { Emne: 'Klima' }),
        ];
        const groups = [group('G1', ['Bob']), group('G2', ['Carl', 'Dina'])];
        // Dina sidder i G2, så G2 er allerede blandet; G1 er rent EU.
        const found = findBestGroup(student('Ny', { Emne: 'Klima' }), groups, baseCtx({
            rules: [{ type: 'aggregate', column: 'Emne' }],
            allStudents: students,
        }));
        expect(found.name).toBe('G2');
    });

    const roleStudents = [
        student('Bob', { Rolle: 'Ordstyrer' }),
        student('Carl', { Rolle: 'Referent' }),
        student('Dina', { Rolle: 'Referent' }),
    ];
    const roleGroups = () => [group('G1', ['Bob']), group('G2', ['Carl', 'Dina'])];

    it('Adskil: gruppen der allerede har værdien fravælges', () => {
        const found = findBestGroup(student('Ny', { Rolle: 'Ordstyrer' }), roleGroups(), baseCtx({
            rules: [{ type: 'separate', column: 'Rolle', value: 'Ordstyrer' }],
            allStudents: roleStudents,
        }));
        // G1 er MINDST, men har en ordstyrer i forvejen.
        expect(found.name).toBe('G2');
    });

    it('Adskil siger intet om en elev uden den valgte værdi', () => {
        const found = findBestGroup(student('Ny', { Rolle: 'Referent' }), roleGroups(), baseCtx({
            rules: [{ type: 'separate', column: 'Rolle', value: 'Ordstyrer' }],
            allStudents: roleStudents,
        }));
        expect(found.name).toBe('G1');   // igen bare mindste gruppe
    });
});

describe('findBestGroup — Saml, Balancér og Ensartede som tiebreaker', () => {
    it('Saml trækker mod gruppen med samme værdi', () => {
        const students = [student('Bob', { Emne: 'EU' }), student('Carl', { Emne: 'Klima' })];
        const groups = [group('G1', ['Bob']), group('G2', ['Carl'])];
        const found = findBestGroup(student('Ny', { Emne: 'EU' }), groups, baseCtx({
            rules: [{ type: 'group_sort', column: 'Emne' }],
            allStudents: students,
        }));
        expect(found.name).toBe('G1');
    });

    it('Ensartede sætter eleven hos dem, der ligner hende', () => {
        const students = [student('Bob', { Kar: '12' }), student('Carl', { Kar: '2' })];
        const groups = [group('G1', ['Bob']), group('G2', ['Carl'])];
        const found = findBestGroup(student('Ny', { Kar: '11' }), groups, baseCtx({
            rules: [{ type: 'minimizediff', column: 'Kar' }],
            allStudents: [...students, student('Ny', { Kar: '11' })],
        }));
        expect(found.name).toBe('G1');
    });

    it('Balancér trækker gruppens gennemsnit mod klassens', () => {
        // Klassens gennemsnit er 7. G1 ligger lavt (2) og G2 højt (12);
        // en 12-tals-elev hører hjemme i G1, hvis snittet skal nærme sig 7.
        const students = [student('Bob', { Kar: '2' }), student('Carl', { Kar: '12' })];
        const groups = [group('G1', ['Bob']), group('G2', ['Carl'])];
        const found = findBestGroup(student('Ny', { Kar: '12' }), groups, baseCtx({
            rules: [{ type: 'balance', column: 'Kar' }],
            allStudents: [...students, student('Ny', { Kar: '12' })],
        }));
        expect(found.name).toBe('G1');
    });

    it('Balancér under Opdel måles mod elevens eget hold, ikke hele klassen', () => {
        // Hold A ligger højt (G1 snit 70, G2 snit 90), hold B lavt (10).
        // Klassens snit er ca. 42 — så tæt kommer ingen gruppe på hold A.
        // Holdets snit (med Ny) er 68: en svag elev skal i den STÆRKE
        // gruppe, hvis holdets grupper skal ligne hinanden.
        const students = [
            student('a1', { Hold: 'A', Kar: '70' }), student('a2', { Hold: 'A', Kar: '70' }),
            student('a3', { Hold: 'A', Kar: '90' }), student('a4', { Hold: 'A', Kar: '90' }),
            student('b1', { Hold: 'B', Kar: '10' }), student('b2', { Hold: 'B', Kar: '10' }),
            student('b3', { Hold: 'B', Kar: '10' }), student('b4', { Hold: 'B', Kar: '10' }),
        ];
        const ny = student('Ny', { Hold: 'A', Kar: '20' });
        const groups = [
            group('G1', ['a1', 'a2']), group('G2', ['a3', 'a4']),
            group('G3', ['b1', 'b2']), group('G4', ['b3', 'b4']),
        ];
        const found = findBestGroup(ny, groups, baseCtx({
            rules: [{ type: 'aggregate', column: 'Hold' }, { type: 'balance', column: 'Kar' }],
            allStudents: [...students, ny],
        }));
        expect(found.name).toBe('G2');
    });

    it('Balancér måler klassens snit på dem, der er her i dag', () => {
        // Til stede: Bob 2, Carl 12, Ny 8 → snit 7,3; G1 kommer tættest.
        // De to fraværende 12-taller må ikke trække snittet op til 9,2,
        // for så ville G2 vinde — gruppedannelsen ser dem slet ikke.
        const students = [
            student('Bob', { Kar: '2' }), student('Carl', { Kar: '12' }),
            student('Dina', { Kar: '12', _excluded: true }),
            student('Erik', { Kar: '12', _excluded: true }),
        ];
        const ny = student('Ny', { Kar: '8', _excluded: true });
        const groups = [group('G1', ['Bob', 'Dina']), group('G2', ['Carl', 'Erik'])];
        const found = findBestGroup(ny, groups, baseCtx({
            rules: [{ type: 'balance', column: 'Kar' }],
            allStudents: [...students, ny],
        }));
        expect(found.name).toBe('G1');
    });

    it('Balancér på en rangeret tekstkolonne regner med rangen, som motoren', () => {
        // Lav < Middel < Høj = 1 < 2 < 3. G1 er lav (1), G2 er høj (3), og
        // snittet af dem, der er her, er 7/3 ≈ 2,3. En "Høj" hører hjemme i G1.
        // Uden rangeringen læste placeringen "Høj" som ingen tal og sprang
        // reglen over — så afgjorde lodtrækningen.
        const students = [student('Bob', { Niv: 'Lav' }), student('Carl', { Niv: 'Høj' })];
        const ny = student('Ny', { Niv: 'Høj' });
        const groups = [group('G1', ['Bob']), group('G2', ['Carl'])];
        for (const r of [0, 0.99]) {
            const found = findBestGroup(ny, groups, baseCtx({
                rules: [{ type: 'balance', column: 'Niv' }],
                allStudents: [...students, ny],
                columnOrders: { Niv: ['Lav', 'Middel', 'Høj'] },
                random: () => r,
            }));
            expect(found.name).toBe('G1');
        }
    });

    it('Ensartede på en rangeret tekstkolonne — også når eleven ikke står i listen', () => {
        // Rangen læses uden hensyn til store/små bogstaver og mellemrum, som i
        // applyColumnOrders. "Top" (4) ligner "Høj" (3) mere end "lav" (1).
        const students = [student('Bob', { Niv: 'lav' }), student('Carl', { Niv: 'Høj ' })];
        const groups = [group('G1', ['Bob']), group('G2', ['Carl'])];
        for (const r of [0, 0.99]) {
            const found = findBestGroup(student('Ny', { Niv: 'Top' }), groups, baseCtx({
                rules: [{ type: 'minimizediff', column: 'Niv' }],
                allStudents: students,
                columnOrders: { Niv: ['Lav', 'Middel', 'Høj', 'Top'] },
                random: () => r,
            }));
            expect(found.name).toBe('G2');
        }
    });

    it('de bløde regler kan stadig ikke overtrumfe gruppestørrelsen', () => {
        const students = [
            student('Bob', { Emne: 'EU' }), student('Carl', { Emne: 'EU' }),
            student('Dina', { Emne: 'EU' }), student('Erik', { Emne: 'Klima' }),
        ];
        const groups = [group('G1', ['Erik']), group('G2', ['Bob', 'Carl', 'Dina'])];
        const found = findBestGroup(student('Ny', { Emne: 'EU' }), groups, baseCtx({
            rules: [
                { type: 'group_sort', column: 'Emne' },
                { type: 'cluster', column: 'Emne' },
            ],
            allStudents: students,
        }));
        expect(found.name).toBe('G1');
    });
});

describe('findBestGroup — lige score trækker lod', () => {
    const allStudents = [student('a1'), student('b1'), student('c1')];
    const equalGroups = () => [group('G1', ['a1']), group('G2', ['b1']), group('G3', ['c1'])];

    it('kan vælge hver af de 100 % lige gode grupper', () => {
        const pick = r => findBestGroup(student('Ny'), equalGroups(),
            baseCtx({ allStudents, random: () => r })).name;
        expect(pick(0)).toBe('G1');
        expect(pick(0.5)).toBe('G2');
        expect(pick(0.99)).toBe('G3');
    });

    it('trækker ikke lod, når én gruppe er bare en smule bedre', () => {
        // G2 er mindst og vinder på størrelsen, uanset lodtrækningen.
        const groups = [group('G1', ['a1', 'c1']), group('G2', ['b1']), group('G3', ['a1', 'c1'])];
        for (const r of [0, 0.5, 0.99]) {
            expect(findBestGroup(student('Ny'), groups,
                baseCtx({ allStudents, random: () => r })).name).toBe('G2');
        }
    });

    it('bruger Math.random, når kalderen ikke giver en lodtrækning', () => {
        const ctx = baseCtx({ allStudents });
        delete ctx.random;
        const seen = new Set();
        for (let i = 0; i < 200; i++) seen.add(findBestGroup(student('Ny'), equalGroups(), ctx).name);
        expect([...seen].sort()).toEqual(['G1', 'G2', 'G3']);
    });
});
