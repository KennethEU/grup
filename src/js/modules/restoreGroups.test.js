import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state.js';
import { ROW_ID_PATTERN } from './utils.js';
import { setupNotices, beginRun, announce, commitRun, clearSetupNotices } from './setupNotices.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// restoreGroups.js — gendan grupper fra tekst eller fra en gemt kolonne
//
// Det der låses fast her: de fire værdiformater læses ens uanset hvilken
// fane de kommer fra, gruppetallet bevares (huller og alt), navne gættes
// aldrig når to elever hedder det samme, og fraværet sættes BEGGE veje.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const savedTopics = new Map();
let storageRejects = false;

vi.mock('./storage.js', () => ({
    saveTopic: vi.fn((id, topic, prefix) => {
        if (storageRejects) return false;
        if (topic) savedTopics.set(`${prefix}${id}`, topic);
        else savedTopics.delete(`${prefix}${id}`);
        return true;
    }),
    getTopic: vi.fn((id, prefix) => savedTopics.get(`${prefix}${id}`) || null),
    // Én skrivning for hele prefikset: sætter de nye emner OG rydder dem ud,
    // der ikke har en gruppe længere. Mocken gør begge dele, som den rigtige.
    replaceTopicsForPrefix: vi.fn((prefix, groups) => {
        if (storageRejects) return false;
        [...savedTopics.keys()].forEach(k => {
            if (k.startsWith(prefix)) savedTopics.delete(k);
        });
        (groups || []).forEach(g => {
            const topic = (g && g.topic != null) ? String(g.topic).trim() : '';
            if (topic) savedTopics.set(`${prefix}${g.name}`, topic);
        });
        return true;
    }),
    // Grupperne får det, der står i kortet (saveTopicsOrSettle, når intet kunne skrives).
    hydrateGroupTopics: vi.fn((groups, prefix) => {
        (groups || []).forEach(g => { g.topic = savedTopics.get(`${prefix}${g.name}`) || null; });
    }),
    saveGroupsToStorage: vi.fn(() => !storageRejects),
}));

vi.mock('./classActions.js', () => ({ autoSave: vi.fn() }));
vi.mock('./runHistory.js', () => ({ pushRun: vi.fn(), markClean: vi.fn() }));

const {
    normalizeName, parseGroupValue, parseGroupsText, parseGroupsColumn,
    candidateColumns, bestCandidateColumn, buildNameIndex, nearestStudent,
    resolveTextGroups, buildPlan, applyPlan,
    MAX_PASTE_LINES, MAX_PASTE_LINE_CHARS
} = await import('./restoreGroups.js');

// Elevrække: navn i kolonnen "Navn", identitet i _rowId.
const student = (rowId, studentName, extra = {}) => ({ _rowId: rowId, Navn: studentName, ...extra });

const CLASS_CSV = [
    student('r1', 'Anna Quist Fassov'),
    student('r2', 'Gustav Føgh'),
    student('r3', 'Melad Sayed'),
    student('r4', 'Sadaq Liban Abdi Hagi-Ali'),
    student('r5', 'Pernille Løvendorf Rørstrøm'),
];

function setClass(data = CLASS_CSV, extra = {}) {
    state.currentClass = {
        filename: 'test.csv',
        columns: ['Navn', 'Klasse', 'Vismandsgrupper'],
        data: data.map(r => ({ ...r })),
        topics: [],
        rules: [],
        separations: [],
        settings: {},
        ...extra
    };
    state.displayColumn = 'Navn';
    state.storedStandardGroups = null;
    state.storedMatrixGroups = null;
    state._undoStack.length = 0;
    return state.currentClass.data;
}

beforeEach(() => {
    savedTopics.clear();
    storageRejects = false;
    window.notifySuccess = vi.fn();
    window.notifyError = vi.fn();
});

// ────────────────────────────────────────────────────────────────────────

describe('parseGroupValue — de fire formater', () => {
    it('læser "Gruppe 6" som gruppe 6 uden emne', () => {
        expect(parseGroupValue('Gruppe 6')).toEqual({ number: 6, topic: null });
        expect(parseGroupValue('  group 6 ')).toEqual({ number: 6, topic: null });
    });

    it('læser et rent tal som gruppenummer', () => {
        expect(parseGroupValue('6')).toEqual({ number: 6, topic: null });
    });

    it('læser "Gruppe 1 - Klima" som nummer og emne', () => {
        expect(parseGroupValue('Gruppe 1 - Klima')).toEqual({ number: 1, topic: 'Klima' });
        expect(parseGroupValue('3 – EU')).toEqual({ number: 3, topic: 'EU' });
    });

    it('læser en ren tekstværdi som emne uden nummer', () => {
        expect(parseGroupValue('Klima')).toEqual({ number: null, topic: 'Klima' });
    });

    it('skærer IKKE et emne over ved dets egen bindestreg', () => {
        // Står der ikke et gruppenavn før stregen, er hele strengen emnet.
        expect(parseGroupValue('EU - og Danmark'))
            .toEqual({ number: null, topic: 'EU - og Danmark' });
    });

    it('giver tom værdi hverken nummer eller emne', () => {
        expect(parseGroupValue('   ')).toEqual({ number: null, topic: null });
    });
});

describe('parseGroupsText', () => {
    const PASTED_TEXT = [
        'Gruppe 1',
        'Anna Quist Fassov',
        'Gustav Føgh',
        '',
        'Gruppe 2',
        'Melad Sayed',
        ''
    ].join('\n');

    it('læser overskrifter og navne', () => {
        const { groups, error } = parseGroupsText(PASTED_TEXT);
        expect(error).toBeNull();
        expect(groups).toHaveLength(2);
        expect(groups[0].number).toBe(1);
        expect(groups[0].names.map(n => n.raw)).toEqual(['Anna Quist Fassov', 'Gustav Føgh']);
        expect(groups[1].names.map(n => n.raw)).toEqual(['Melad Sayed']);
    });

    it('bevarer gruppetallet — også med huller', () => {
        const { groups } = parseGroupsText('Gruppe 3\nAnna\n\nGruppe 7\nBob');
        expect(groups.map(g => g.number)).toEqual([3, 7]);
    });

    it('læser emnet efter bindestregen i overskriften', () => {
        const { groups } = parseGroupsText('Gruppe 1 - Klima\nAnna');
        expect(groups[0].topic).toBe('Klima');
    });

    it('skræller "(fraværende)" af og husker det', () => {
        const { groups } = parseGroupsText('Gruppe 1\nAnna Quist Fassov (fraværende)');
        expect(groups[0].names[0]).toEqual({ raw: 'Anna Quist Fassov', absent: true });
    });

    it('skræller matrix-kopiens kilde-parentes af — også med fravær bagefter', () => {
        const { groups } = parseGroupsText(
            'Gruppe 1\nAnna Quist Fassov (Grp 3 - Klima) (fraværende)');
        expect(groups[0].names[0]).toEqual({ raw: 'Anna Quist Fassov', absent: true });
    });

    it('rører ikke en parentes midt i navnet', () => {
        const { groups } = parseGroupsText('Gruppe 1\nAnna (Q) Fassov');
        expect(groups[0].names[0].raw).toBe('Anna (Q) Fassov');
    });

    it('melder fejl når der ikke er en eneste overskrift', () => {
        const { groups, error } = parseGroupsText('hej med dig\nog dig');
        expect(groups).toHaveLength(0);
        expect(error).toContain('gruppeoverskrifter');
    });

    it('samler navne før første overskrift som hjemløse', () => {
        const { groups, orphans } = parseGroupsText('Anna\nGruppe 1\nBob');
        expect(orphans).toEqual(['Anna']);
        expect(groups[0].names.map(n => n.raw)).toEqual(['Bob']);
    });
});

describe('nearestStudent', () => {
    const index = buildNameIndex(CLASS_CSV, 'Navn');

    it('finder eleven når et mellemnavn mangler', () => {
        const s = nearestStudent('Sadaq Hagi-Ali', index);
        expect(s.rowId).toBe('r4');
        expect(s.reason).toBe('navnedele');
    });

    it('finder eleven ved en enkelt stavefejl', () => {
        const s = nearestStudent('Gustav Fogh', index);
        expect(s.rowId).toBe('r2');
    });

    it('foreslår intet når to elever ligger lige tæt', () => {
        const doubt = buildNameIndex([
            student('r1', 'Anne Hansen'),
            student('r2', 'Anna Hansen'),
        ], 'Navn');
        expect(nearestStudent('Anny Hansen', doubt)).toBeNull();
    });

    it('foreslår intet når navnet er for langt væk', () => {
        expect(nearestStudent('Bertil Nordmand', index)).toBeNull();
    });

    // Grænsen: den næstbedste skal være MINDST 2 dårligere. Præcis 2 er nok.
    // (Mutationstest 2026-09-24: `< 2` kunne blive til `<= 2` uden at nogen
    // test opdagede det — og så ville en tydelig stavefejl ikke blive rettet.)
    it('finder eleven, når den næstbedste er præcis 2 længere væk', () => {
        const near = buildNameIndex([
            student('r1', 'Karoline Madsen'),   // afstand 1
            student('r2', 'Karina Madsen'),     // afstand 3
        ], 'Navn');
        const s = nearestStudent('Karolin Madsen', near);
        expect(s && s.rowId).toBe('r1');
        expect(s.reason).toBe('stavemåde');
    });

    it('springer elever over der allerede er brugt', () => {
        const s = nearestStudent('Gustav Fogh', index, new Set(['r2']));
        expect(s).toBeNull();
    });
});

describe('resolveTextGroups', () => {
    it('binder entydige navne', () => {
        const { groups } = parseGroupsText('Gruppe 1\nAnna Quist Fassov');
        const r = resolveTextGroups(groups, CLASS_CSV, 'Navn');
        expect(r.groups[0].items[0]).toMatchObject({ status: 'bound', rowId: 'r1' });
    });

    it('er ufølsom for store/små bogstaver og ekstra mellemrum', () => {
        const { groups } = parseGroupsText('Gruppe 1\n  anna   QUIST fassov  ');
        const r = resolveTextGroups(groups, CLASS_CSV, 'Navn');
        expect(r.groups[0].items[0].rowId).toBe('r1');
    });

    it('gætter ALDRIG mellem to elever med samme navn', () => {
        const data = [student('r1', 'Mads Hansen'), student('r2', 'Mads Hansen')];
        const { groups } = parseGroupsText('Gruppe 1\nMads Hansen');
        const r = resolveTextGroups(groups, data, 'Navn');
        expect(r.groups[0].items[0].status).toBe('ambiguous');
        expect(r.groups[0].items[0].rowId).toBeNull();
        expect(r.groups[0].items[0].candidates.map(c => c.rowId)).toEqual(['r1', 'r2']);
    });

    it('foreslår nærmeste elev og forvælger den', () => {
        const { groups } = parseGroupsText('Gruppe 1\nGustav Fogh');
        const r = resolveTextGroups(groups, CLASS_CSV, 'Navn');
        const it = r.groups[0].items[0];
        expect(it.status).toBe('unmatched');
        expect(it.action).toBe('bind');
        expect(it.rowId).toBe('r2');
    });

    it('foreslår "tilføj" når ingen elev ligner', () => {
        const { groups } = parseGroupsText('Gruppe 1\nBertil Nordmand');
        const r = resolveTextGroups(groups, CLASS_CSV, 'Navn');
        expect(r.groups[0].items[0].action).toBe('add');
        expect(r.groups[0].items[0].suggestion).toBeNull();
    });

    it('foreslår ikke en elev der allerede er bundet et andet sted', () => {
        const { groups } = parseGroupsText('Gruppe 1\nGustav Føgh\n\nGruppe 2\nGustav Fogh');
        const r = resolveTextGroups(groups, CLASS_CSV, 'Navn');
        expect(r.groups[0].items[0].rowId).toBe('r2');
        expect(r.groups[1].items[0].suggestion).toBeNull();
    });
});

describe('parseGroupsColumn', () => {
    const data = [
        student('r1', 'Anna', { G: 'Gruppe 1' }),
        student('r2', 'Bob', { G: 'Gruppe 6' }),
        student('r3', 'Carl', { G: 'Gruppe 1' }),
        student('r4', 'Dina', { G: '' }),
        student('r5', 'Emil', { G: 'Gruppe 3' }),
    ];

    it('bevarer gruppetallet med huller og sorterer stigende', () => {
        const { groups } = parseGroupsColumn('G', data);
        expect(groups.map(g => g.number)).toEqual([1, 3, 6]);
        expect(groups[0].items.map(i => i.rowId)).toEqual(['r1', 'r3']);
    });

    it('lader tom celle betyde ingen gruppe', () => {
        const { groups } = parseGroupsColumn('G', data);
        const allNamesInPlan = groups.flatMap(g => g.items.map(i => i.rowId));
        expect(allNamesInPlan).not.toContain('r4');
    });

    it('binder direkte på _rowId — aldrig på navnet', () => {
        const duplicateRows = [
            student('r1', 'Mads Hansen', { G: '1' }),
            student('r2', 'Mads Hansen', { G: '2' }),
        ];
        const { groups } = parseGroupsColumn('G', duplicateRows);
        expect(groups[0].items[0].rowId).toBe('r1');
        expect(groups[1].items[0].rowId).toBe('r2');
        expect(groups.every(g => g.items.every(i => i.status === 'bound'))).toBe(true);
    });

    it('læser rene tal som gruppenumre', () => {
        const groupNumber = [
            student('r1', 'Anna', { G: '5' }),
            student('r2', 'Bob', { G: '8' }),
        ];
        expect(parseGroupsColumn('G', groupNumber).groups.map(g => g.number)).toEqual([5, 8]);
    });

    it('nummererer 1..N når værdierne kun er emner', () => {
        const topicList = [
            student('r1', 'Anna', { G: 'Klima' }),
            student('r2', 'Bob', { G: 'EU' }),
            student('r3', 'Carl', { G: 'Klima' }),
        ];
        const { groups } = parseGroupsColumn('G', topicList);
        expect(groups.map(g => g.number)).toEqual([1, 2]);
        expect(groups.map(g => g.topic)).toEqual(['Klima', 'EU']);
    });

    it('læser "Gruppe 1 - Klima" som både nummer og emne', () => {
        const mixed = [
            student('r1', 'Anna', { G: 'Gruppe 1 - Klima' }),
            student('r2', 'Bob', { G: 'Gruppe 2 - EU' }),
        ];
        const { groups } = parseGroupsColumn('G', mixed);
        expect(groups.map(g => [g.number, g.topic])).toEqual([[1, 'Klima'], [2, 'EU']]);
    });

    it('giver værdier uden tal de næste ledige numre', () => {
        const mixed = [
            student('r1', 'Anna', { G: 'Gruppe 2' }),
            student('r2', 'Bob', { G: 'Restgruppen' }),
        ];
        const { groups } = parseGroupsColumn('G', mixed);
        expect(groups.map(g => g.number)).toEqual([2, 3]);
        expect(groups[1].topic).toBe('Restgruppen');
    });
});

describe('candidateColumns', () => {
    const data = [
        student('r1', 'Anna', { Klasse: 'mus', Vismand: 'Gruppe 1' }),
        student('r2', 'Bob', { Klasse: 'ms1', Vismand: 'Gruppe 1' }),
        student('r3', 'Carl', { Klasse: 'mus', Vismand: 'Gruppe 2' }),
        student('r4', 'Dina', { Klasse: 'ms1', Vismand: 'Gruppe 2' }),
    ];
    const columns = ['Navn', 'Klasse', 'Vismand'];

    it('udelader visningskolonnen og programmets egne felter', () => {
        const c = candidateColumns(data, [...columns, '_excluded'], 'Navn');
        expect(c.map(x => x.column)).toEqual(['Klasse', 'Vismand']);
    });

    it('udelader en kolonne med kun én værdi', () => {
        const identicalNames = data.map(r => ({ ...r, Hold: 'A' }));
        const c = candidateColumns(identicalNames, [...columns, 'Hold'], 'Navn');
        expect(c.map(x => x.column)).not.toContain('Hold');
    });

    it('udelader en kolonne med en unik værdi pr. elev', () => {
        const c = candidateColumns(data, columns, 'Klasse');
        expect(c.map(x => x.column)).not.toContain('Navn');
    });

    it('tæller tomme celler med', () => {
        const withEmpty = [...data, student('r5', 'Emil', { Klasse: 'mse', Vismand: '' })];
        const c = candidateColumns(withEmpty, columns, 'Navn');
        expect(c.find(x => x.column === 'Vismand')).toMatchObject({ students: 4, blank: 1 });
    });

    it('markerer om værdierne bærer et gruppetal', () => {
        const c = candidateColumns(data, columns, 'Navn');
        expect(c.find(x => x.column === 'Vismand').numbered).toBe(true);
        expect(c.find(x => x.column === 'Klasse').numbered).toBe(false);
    });

    it('forvælger den kolonne hvis værdier ligner gruppenavne', () => {
        const c = candidateColumns(data, columns, 'Navn');
        expect(bestCandidateColumn(c)).toBe('Vismand');
    });

    it('forvælger IKKE en kategori-kolonne med halvdelen af klassen i hver', () => {
        // Fundet i browseren: "Køn" med 28 elever i to værdier vandt over en
        // rigtig gruppekolonne, dengang målestokken var flest elever pr. gruppe.
        const big = [];
        for (let i = 1; i <= 28; i++) {
            big.push(student('r' + i, 'Elev ' + i, {
                Køn: i % 2 ? 'P' : 'D',
                Grupper: 'Gruppe ' + (1 + (i % 7))
            }));
        }
        const c = candidateColumns(big, ['Navn', 'Køn', 'Grupper'], 'Navn');
        expect(bestCandidateColumn(c)).toBe('Grupper');
    });
});

describe('buildPlan', () => {
    const planFrom = (text, opts = {}) => {
        const data = opts.data || CLASS_CSV;
        const { groups } = parseGroupsText(text);
        const r = resolveTextGroups(groups, data, 'Navn');
        if (opts.ret) opts.ret(r);
        return buildPlan({
            groups: r.groups, data, displayColumn: 'Navn',
            markAbsent: opts.markAbsent !== false,
            existingGroups: opts.existingGroups || []
        });
    };

    it('markerer dem der ikke står på listen som fraværende', () => {
        const p = planFrom('Gruppe 1\nAnna Quist Fassov\nGustav Føgh');
        expect(p.willBeAbsent.sort()).toEqual(['r3', 'r4', 'r5']);
    });

    it('sætter en fraværende elev til stede igen når hun står på listen', () => {
        const data = CLASS_CSV.map(r => r._rowId === 'r1' ? { ...r, _excluded: true } : { ...r });
        const p = planFrom('Gruppe 1\nAnna Quist Fassov', { data });
        expect(p.willBePresent).toEqual(['r1']);
    });

    it('blokerer når den samme elev står i to grupper', () => {
        const p = planFrom('Gruppe 1\nAnna Quist Fassov\n\nGruppe 2\nAnna Quist Fassov');
        expect(p.duplicates).toHaveLength(1);
        expect(p.blocking.join(' ')).toContain('Anna Quist Fassov');
    });

    it('blokerer når et tvetydigt navn ikke er afgjort', () => {
        const data = [student('r1', 'Mads Hansen'), student('r2', 'Mads Hansen')];
        const p = planFrom('Gruppe 1\nMads Hansen', { data });
        expect(p.blocking.join(' ')).toContain('flere elever');
    });

    it('slipper igennem når læreren HAR valgt hvem det er', () => {
        const data = [student('r1', 'Mads Hansen'), student('r2', 'Mads Hansen')];
        const p = planFrom('Gruppe 1\nMads Hansen', {
            data, ret: r => { r.groups[0].items[0].rowId = 'r2'; }
        });
        expect(p.blocking).toEqual([]);
        expect(p.groups[0].members).toEqual([{ rowId: 'r2' }]);
    });

    it('lægger et ukendt navn op som ny elev', () => {
        const p = planFrom('Gruppe 1\nBertil Nordmand');
        expect(p.newStudents).toEqual([{ name: 'Bertil Nordmand', group: 1 }]);
        expect(p.groups[0].members).toEqual([{ addName: 'Bertil Nordmand' }]);
    });

    it('blokerer et ukendt navn der står i to grupper', () => {
        const p = planFrom('Gruppe 1\nBertil Nordmand\n\nGruppe 2\nBertil Nordmand');
        expect(p.blocking).toEqual(['Bertil Nordmand står i både Gruppe 1 og Gruppe 2.']);
        expect(p.groups.flatMap(g => g.members)).toEqual([
            { addName: 'Bertil Nordmand' },
            { addName: 'Bertil Nordmand' },
        ]);
    });

    // En KENDT elev i flere grupper går en anden vej end et ukendt navn
    // (duplicates, ikke newNameGroups) — den havde ingen test af sin tekst
    // (mutationstest 2026-09-24).
    it('blokerer en kendt elev der står i tre grupper — og nævner alle tre', () => {
        const p = planFrom('Gruppe 1\nAnna Quist Fassov\n\nGruppe 2\nAnna Quist Fassov'
            + '\n\nGruppe 3\nAnna Quist Fassov');
        expect(p.blocking).toEqual(['Anna Quist Fassov står i både Gruppe 1, Gruppe 2 og Gruppe 3.']);
    });

    it('blokerer en kendt elev der står to gange i samme gruppe', () => {
        const p = planFrom('Gruppe 1\nAnna Quist Fassov\nAnna Quist Fassov');
        expect(p.blocking).toEqual(['Anna Quist Fassov står 2 gange i Gruppe 1.']);
    });

    it('blokerer ukendte navne der kun adskiller sig i mellemrum eller store bogstaver', () => {
        const p = planFrom('Gruppe 1\nBertil Nordmand\n\nGruppe 2\n  bertil  nordmand ');
        expect(p.blocking).toEqual(['Bertil Nordmand står i både Gruppe 1 og Gruppe 2.']);
    });

    it('springer et navn helt over når læreren vælger det', () => {
        const p = planFrom('Gruppe 1\nAnna Quist Fassov\nBertil Nordmand', {
            ret: r => { r.groups[0].items[1].action = 'skip'; }
        });
        expect(p.newStudents).toEqual([]);
        expect(p.groups[0].members).toEqual([{ rowId: 'r1' }]);
    });

    it('slår to blokke med SAMME gruppenummer sammen til én', () => {
        // Gruppenummeret ER gruppens identitet ("Group 1" bliver navnet, og
        // emnekort, sletning og Vue-nøgler slår alle op på det). To poster med
        // samme navn gav to kort med samme nøgle.
        const p = planFrom('Gruppe 1\nAnna Quist Fassov\n\nGruppe 1\nGustav Føgh');
        expect(p.groups.map(g => g.name)).toEqual(['Group 1']);
        expect(p.groups[0].members).toEqual([{ rowId: 'r1' }, { rowId: 'r2' }]);
        expect(p.mergedNumbers).toEqual([1]);
        expect(p.blocking).toEqual([]);
    });

    it('siger "står 2 gange i Gruppe 1" — ikke "i både Gruppe 1 og Gruppe 1"', () => {
        // Sker når den samme liste limes ind to gange.
        const p = planFrom('Gruppe 1\nAnna Quist Fassov\nAnna Quist Fassov');
        expect(p.blocking).toEqual(['Anna Quist Fassov står 2 gange i Gruppe 1.']);
    });

    it('lader et tvetydigt navn springe over, så knappen ikke er død for altid', () => {
        const data = [student('r1', 'Mads Hansen'), student('r2', 'Mads Hansen'), student('r3', 'Anna')];
        const blocked = planFrom('Gruppe 1\nAnna\nMads Hansen', { data });
        expect(blocked.blocking.join(' ')).toContain('flere elever');

        const skippedLines = planFrom('Gruppe 1\nAnna\nMads Hansen', {
            data, ret: r => { r.groups[0].items[1].action = 'skip'; }
        });
        expect(skippedLines.blocking).toEqual([]);
        expect(skippedLines.groups[0].members).toEqual([{ rowId: 'r3' }]);
    });

    it('melder en overskrift uden elever under sig', () => {
        const p = planFrom('Gruppe 1\nAnna Quist Fassov\n\nGruppe 2');
        expect(p.emptyGroups).toEqual([2]);
        expect(p.groups).toHaveLength(2);
        expect(p.blocking).toEqual([]);   // tomt kort er lovligt, bare værd at nævne
    });

    it('slår også ens numre sammen fra en kolonne ("Gruppe 1" og "1")', () => {
        const mixed = [
            student('r1', 'Anna', { G: 'Gruppe 1' }),
            student('r2', 'Bob', { G: '1' }),
        ];
        const { groups } = parseGroupsColumn('G', mixed);
        const p = buildPlan({ groups, data: mixed, displayColumn: 'Navn' });
        expect(p.groups.map(g => g.name)).toEqual(['Group 1']);
        expect(p.mergedNumbers).toEqual([1]);
    });

    it('advarer når næsten ingen af navnene er i klassen (forkert klasse)', () => {
        const p = planFrom('Gruppe 1\nBertil Nordmand\nCecilie Vang\nDorthe Riis');
        expect(p.mostlyUnknown).toBe(true);
    });

    it('advarer allerede, når præcis halvdelen af navnene er ukendte', () => {
        const p = planFrom('Gruppe 1\nAnna Quist Fassov\nGustav Føgh\nMelad Sayed\n'
            + 'Bertil Nordmand\nCecilie Vang\nDorthe Riis');
        expect(p.mostlyUnknown).toBe(true);
    });

    it('advarer IKKE ved en enkelt ny elev i en genkendt liste', () => {
        const p = planFrom('Gruppe 1\nAnna Quist Fassov\nGustav Føgh\n'
            + 'Melad Sayed\nSadaq Liban Abdi Hagi-Ali\nBertil Nordmand');
        expect(p.mostlyUnknown).toBe(false);
    });

    it('advarslen forsvinder, når de ukendte springes over i stedet', () => {
        const p = planFrom('Gruppe 1\nAnna Quist Fassov\nBertil Nordmand\n'
            + 'Cecilie Vang\nDorthe Riis', {
            ret: r => { r.groups[0].items.slice(1).forEach(it => { it.action = 'skip'; }); }
        });
        expect(p.mostlyUnknown).toBe(false);
    });

    it('nævner låste grupper der bliver overskrevet', () => {
        const p = planFrom('Gruppe 1\nAnna Quist Fassov', {
            existingGroups: [
                { name: 'Group 3', locked: true, members: [] },
                { name: 'Group 4', locked: false, members: [] }
            ]
        });
        expect(p.replaces).toEqual({ count: 2, lockedNames: ['Gruppe 3'] });
    });

    it('blokerer når der ikke er en eneste elev at placere', () => {
        const p = planFrom('Gruppe 1\nBertil Nordmand', {
            ret: r => { r.groups[0].items[0].action = 'skip'; }
        });
        expect(p.blocking.join(' ')).toContain('ingen elever');
    });
});

describe('applyPlan', () => {
    const restore = (text, opts = {}) => {
        const data = setClass(opts.cls);
        const { groups } = parseGroupsText(text);
        const r = resolveTextGroups(groups, data, 'Navn');
        if (opts.ret) opts.ret(r);
        const plan = buildPlan({
            groups: r.groups, data, displayColumn: 'Navn',
            markAbsent: opts.markAbsent !== false,
            existingGroups: state.storedStandardGroups || []
        });
        return { ok: applyPlan(plan), plan, data: state.currentClass.data };
    };

    // Stamgrupperne skiftes ud; matrixen står. Kun stamgruppernes noter om
    // RESULTATET handler om grupper, der ikke står der længere (106. gennemsyn).
    it('fjerner stamgruppernes resultat-noter, ikke matrixens', () => {
        clearSetupNotices();
        beginRun('standard'); announce('Opsætning'); announce('Resultat stam', 'info', null, true); commitRun('s');
        beginRun('matrix'); announce('Resultat matrix', 'info', null, true); commitRun('m');
        restore('Gruppe 1\nAnna Quist Fassov');
        expect(setupNotices.last.standard.map(n => n.text)).toEqual(['Opsætning']);
        expect(setupNotices.last.matrix.map(n => n.text)).toEqual(['Resultat matrix']);
    });

    it('skriver grupperne med interne navne og _rowId-medlemmer', () => {
        restore('Gruppe 1\nAnna Quist Fassov\nGustav Føgh\n\nGruppe 6\nMelad Sayed');
        expect(state.storedStandardGroups).toEqual([
            { name: 'Group 1', members: ['r1', 'r2'], locked: false, topic: null },
            { name: 'Group 6', members: ['r3'], locked: false, topic: null },
        ]);
        expect(state.lastGeneratedGroups).toBe(state.storedStandardGroups);
    });

    it('markerer de øvrige elever fraværende — og kun dem', () => {
        const { data } = restore('Gruppe 1\nAnna Quist Fassov');
        const absence = Object.fromEntries(data.map(r => [r._rowId, !!r._excluded]));
        expect(absence).toEqual({ r1: false, r2: true, r3: true, r4: true, r5: true });
    });

    it('lader fraværet være når fluebenet er slået fra', () => {
        const cls = CLASS_CSV.map(r => ({ ...r, _excluded: r._rowId === 'r5' }));
        const { data } = restore('Gruppe 1\nAnna Quist Fassov', { cls, markAbsent: false });
        expect(data.find(r => r._rowId === 'r2')._excluded).toBeFalsy();
        expect(data.find(r => r._rowId === 'r5')._excluded).toBe(true);
    });

    // "(fraværende)" er appens egen markering i den kopierede liste. Indtil
    // 23/9 blev den læst og smidt væk, så gendannelsen satte eleven til stede.
    it('holder en elev med "(fraværende)" på listen fraværende — men i gruppen', () => {
        const { plan, data } = restore('Gruppe 1\nAnna Quist Fassov\nGustav Føgh (fraværende)');
        expect(plan.willStayAbsent).toEqual(['r2']);
        expect(plan.willBeAbsent).not.toContain('r2');
        expect(state.storedStandardGroups[0].members).toEqual(['r1', 'r2']);
        expect(data.find(r => r._rowId === 'r2')._excluded).toBe(true);
        expect(data.find(r => r._rowId === 'r1')._excluded).toBe(false);
    });

    it('sætter ikke en fraværende elev til stede, når listen også siger fraværende', () => {
        const cls = CLASS_CSV.map(r => ({ ...r, _excluded: r._rowId === 'r2' }));
        const { plan, data } = restore('Gruppe 1\nGustav Føgh (fraværende)\nAnna Quist Fassov', { cls });
        expect(plan.willBePresent).toEqual([]);
        expect(data.find(r => r._rowId === 'r2')._excluded).toBe(true);
    });

    it('opretter en ny elev med "(fraværende)" som fraværende', () => {
        const { data } = restore('Gruppe 1\nAnna Quist Fassov\nBertil Nordmand (fraværende)');
        const fresh = data.find(r => r.Navn === 'Bertil Nordmand');
        expect(fresh._excluded).toBe(true);
        expect(state.storedStandardGroups[0].members).toContain(fresh._rowId);
    });

    it('rører ikke fraværet for "(fraværende)", når fluebenet er slået fra', () => {
        const { data } = restore('Gruppe 1\nAnna Quist Fassov\nGustav Føgh (fraværende)',
            { markAbsent: false });
        expect(data.find(r => r._rowId === 'r2')._excluded).toBeFalsy();
    });

    it('opretter nye elever med navnet i visningskolonnen', () => {
        const { data } = restore('Gruppe 1\nAnna Quist Fassov\nBertil Nordmand');
        const fresh = data.find(r => r.Navn === 'Bertil Nordmand');
        expect(fresh).toBeTruthy();
        expect(fresh._rowId).toMatch(ROW_ID_PATTERN);
        expect(fresh.Klasse).toBe('');   // tom celle, ikke en kategori
        expect(state.storedStandardGroups[0].members).toContain(fresh._rowId);
    });

    it('holder nye elever i lærerens rækkefølge øverst i listen', () => {
        const { data } = restore('Gruppe 1\nBertil Nordmand\nCecilie Vang');
        expect(data.slice(0, 2).map(r => r.Navn)).toEqual(['Bertil Nordmand', 'Cecilie Vang']);
    });

    it('gemmer emnet og fletter det ind i klassens emneliste', () => {
        restore('Gruppe 1 - Klima\nAnna Quist Fassov\n\nGruppe 2 - EU\nGustav Føgh');
        expect(state.storedStandardGroups.map(g => g.topic)).toEqual(['Klima', 'EU']);
        expect(savedTopics.get('S_Group 1')).toBe('Klima');
        expect(state.currentClass.topics).toEqual(['Klima', 'EU']);
    });

    it('gør IKKE en kategori-kolonnes værdier til klassens emner', () => {
        // Fundet i browseren 27/8: gendan fra "Aktivitetsniveau" (Høj/Middel/
        // Lav), og klassen fik pludselig tre emner. Så rundede hver senere
        // generering gruppeantallet til et multiplum af 3, og der stod en
        // advarsel om en indstilling læreren aldrig havde foretaget.
        const cls = [
            student('r1', 'Anna', { Niveau: 'Høj' }),
            student('r2', 'Bob', { Niveau: 'Lav' }),
        ];
        const data = setClass(cls);
        const { groups } = parseGroupsColumn('Niveau', data);
        const plan = buildPlan({ groups, data, displayColumn: 'Navn' });

        expect(plan.newTopics).toEqual([]);
        applyPlan(plan);

        // Mærkaten står stadig på kortet …
        expect(state.storedStandardGroups.map(g => g.topic)).toEqual(['Høj', 'Lav']);
        // … men klassens emneliste er urørt.
        expect(state.currentClass.topics).toEqual([]);
    });

    it('gør derimod "Gruppe 1 - Klima" i en kolonne til et rigtigt emne', () => {
        const cls = [
            student('r1', 'Anna', { Runde: 'Gruppe 1 - Klima' }),
            student('r2', 'Bob', { Runde: 'Gruppe 2 - EU' }),
        ];
        const data = setClass(cls);
        const { groups } = parseGroupsColumn('Runde', data);
        const plan = buildPlan({ groups, data, displayColumn: 'Navn' });

        expect(plan.newTopics).toEqual(['Klima', 'EU']);
        applyPlan(plan);
        expect(state.currentClass.topics).toEqual(['Klima', 'EU']);
    });

    it('melder kun de emner der FAKTISK er nye', () => {
        const cls = [
            student('r1', 'Anna', { Runde: 'Gruppe 1 - Klima' }),
            student('r2', 'Bob', { Runde: 'Gruppe 2 - EU' }),
        ];
        const data = setClass(cls);
        const { groups } = parseGroupsColumn('Runde', data);
        // Case-ufølsomt, som fletningen selv.
        const plan = buildPlan({ groups, data, displayColumn: 'Navn', classTopics: ['klima'] });
        expect(plan.newTopics).toEqual(['EU']);
    });

    it('tilføjer ikke et emne klassen allerede har — uanset store/små bogstaver', () => {
        setClass(undefined, { topics: ['klima'] });
        const { groups } = parseGroupsText('Gruppe 1 - Klima\nAnna Quist Fassov');
        const r = resolveTextGroups(groups, state.currentClass.data, 'Navn');
        applyPlan(buildPlan({
            groups: r.groups, data: state.currentClass.data, displayColumn: 'Navn'
        }));
        expect(state.currentClass.topics).toEqual(['klima']);
        // … og gruppen får klassens stavemåde. Emnevælgeren på kortet matcher
        // præcist, så "Klima" mod en emneliste med "klima" gav et TOMT mærkat.
        expect(state.storedStandardGroups[0].topic).toBe('klima');
        expect(savedTopics.get('S_Group 1')).toBe('klima');
    });

    it('lægger "Klima" og "klima" fra samme liste ind som ÉT emne', () => {
        // Forhåndsvisningen (newTopics) sagde ét emne; fletningen tilføjede to,
        // fordi den ikke huskede de emner, den selv lige havde lagt til.
        const { plan } = restore('Gruppe 1 - Klima\nAnna Quist Fassov\n\nGruppe 2 - klima\nGustav Føgh');
        expect(plan.newTopics).toEqual(['Klima']);
        expect(state.currentClass.topics).toEqual(['Klima']);
        expect(state.storedStandardGroups.map(g => g.topic)).toEqual(['Klima', 'Klima']);
    });

    it('lægger et fortryd-punkt og en kørsel FØR den overskriver', async () => {
        const { pushRun } = await import('./runHistory.js');
        restore('Gruppe 1\nAnna Quist Fassov');
        expect(state._undoStack.length).toBe(1);
        expect(pushRun).toHaveBeenCalled();
    });

    it('markerer matrixen forældet', () => {
        state.matrixSourceFingerprint = 'noget-gammelt';
        restore('Gruppe 1\nAnna Quist Fassov');
        expect(state.matrixGroupsStale).toBe(true);
        expect(state.matrixSourceFingerprint).toBeNull();
    });

    it('udfører ikke en plan der er blokeret', () => {
        const { ok } = restore('Gruppe 1\nAnna Quist Fassov\n\nGruppe 2\nAnna Quist Fassov');
        expect(ok).toBe(false);
        expect(state.storedStandardGroups).toBeNull();
    });

    it('kvitterer ikke som gemt når lagerpladsen er fuld', () => {
        storageRejects = true;
        restore('Gruppe 1\nAnna Quist Fassov');
        expect(window.notifyError).toHaveBeenCalled();
        expect(window.notifySuccess).not.toHaveBeenCalled();
    });

    it('gendanner lige så godt fra en kolonne', () => {
        const cls = [
            student('r1', 'Anna', { Vismandsgrupper: 'Gruppe 1' }),
            student('r2', 'Bob', { Vismandsgrupper: 'Gruppe 6' }),
            student('r3', 'Carl', { Vismandsgrupper: 'Gruppe 1' }),
            student('r4', 'Emil', { Vismandsgrupper: '' }),
        ];
        const data = setClass(cls);
        const { groups } = parseGroupsColumn('Vismandsgrupper', data);
        const plan = buildPlan({ groups, data, displayColumn: 'Navn' });
        expect(applyPlan(plan)).toBe(true);
        expect(state.storedStandardGroups).toEqual([
            { name: 'Group 1', members: ['r1', 'r3'], locked: false, topic: null },
            { name: 'Group 6', members: ['r2'], locked: false, topic: null },
        ]);
        expect(state.currentClass.data.find(r => r._rowId === 'r4')._excluded).toBe(true);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lofterne — teksten der IKKE er en gruppeliste
//
// Import har altid haft MAX_ROWS_PER_CLASS, og backup-gendannelse fik det
// samme værn ved sikkerhedsreviewet. Den indsatte liste havde intet: hvert
// afsnit blev slået op mod hver eneste elev med Levenshtein-afstand på
// skærmens egen tråd (50.000 linjer mod 300 elever = 33 sekunder frossen
// fane), og navne der ikke passede kunne skrives ind som nye elever uden
// grænse.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('restoreGroups — lofter på den indsatte tekst', () => {
    it('afviser en tekst med for mange linjer', () => {
        const lines = ['Gruppe 1'];
        for (let i = 0; i < MAX_PASTE_LINES; i++) lines.push(`Navn Nummer ${i}`);
        const res = parseGroupsText(lines.join('\n'));
        expect(res.groups).toEqual([]);
        expect(res.error).toContain('for lang');
        expect(res.error).toContain(String(MAX_PASTE_LINES));
    });

    it('lader en liste på præcis loftet slippe igennem', () => {
        const lines = ['Gruppe 1'];
        while (lines.length < MAX_PASTE_LINES) lines.push(`Navn Nummer ${lines.length}`);
        const res = parseGroupsText(lines.join('\n'));
        expect(res.error).toBe(null);
        expect(res.groups[0].names.length).toBe(MAX_PASTE_LINES - 1);
    });

    it('afviser en linje der er for lang til at være et navn', () => {
        const res = parseGroupsText(`Gruppe 1\n${'A'.repeat(MAX_PASTE_LINE_CHARS + 1)}`);
        expect(res.groups).toEqual([]);
        expect(res.error).toContain('tegn');
    });

    it('tomme linjer tæller ikke med i loftet', () => {
        const lines = ['Gruppe 1'];
        for (let i = 0; i < 10; i++) lines.push('Navn ' + i, '', '   ', '');
        const res = parseGroupsText(lines.join('\n'));
        expect(res.error).toBe(null);
        expect(res.groups[0].names.length).toBe(10);
    });

    it('blokerer en plan der ville sprænge klassens elevloft', () => {
        // 5 elever i klassen. 600 navne der ikke findes → alle sat til "add".
        const data = setClass(CLASS_CSV);
        const groups = [{
            number: 1,
            items: Array.from({ length: 600 }, (_, i) => ({
                raw: `Ukendt Elev ${i}`, status: 'unmatched', action: 'add'
            }))
        }];
        const plan = buildPlan({ groups, data, displayColumn: 'Navn' });
        expect(plan.blocking.some(b => b.includes('maks 500'))).toBe(true);
        expect(applyPlan(plan)).toBe(false);
        // Elevlisten er urørt.
        expect(state.currentClass.data.length).toBe(5);
    });

    it('blokerer ikke en almindelig liste med et par nye navne', () => {
        const data = setClass(CLASS_CSV);
        const parsed = parseGroupsText('Gruppe 1\nAnna Quist Fassov\nHelt Ny Elev');
        const { groups } = resolveTextGroups(parsed.groups, data, 'Navn');
        groups[0].items.forEach(it => { if (it.status === 'unmatched') it.action = 'add'; });
        const plan = buildPlan({ groups, data, displayColumn: 'Navn' });
        expect(plan.blocking).toEqual([]);
    });
});
