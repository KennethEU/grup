import { describe, it, expect, vi, beforeEach } from 'vitest';
import { state, pushUndo, undo, redo, clearUndoHistory } from './state.js';
import { togetherComponents } from './together.js';
import { RULE_WEIGHT_NOTES, newUuid } from './utils.js';
import { setupSignature, orderIdsByRow, cellIsNumber, cellNumber, compareCellValues, columnNumericStats, columnIsNumeric, splitByLockedGroups, escapeHtml, detectDelimiter, parseCSV, stripEmptyColumns, ROW_ID, ROW_ID_PATTERN, ensureRowIds, memberDisplayName, migrateRefsToRowIds, getColorForString, clearColorRegistry, debounce, RULE_TYPES, RULE_OPTIONS, RULE_DESCRIPTIONS, RULES_WITHOUT_VALUES, MATRIX_EXCLUDED_RULES, isInternalField, teacherColumns, isMemberAbsent, memberIdStr, homeGroupFingerprint, buildStudentIndex, brokenSeparations, groupDisplayName, groupShortName, nfc, valueKey, canonicalSpellings, normalizeCellText } from './utils.js';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. escapeHtml
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('escapeHtml', () => {
    it('escaper alle farlige tegn', () => {
        expect(escapeHtml('<script>alert("xss")</script>'))
            .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('escaper &', () => {
        expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('escaper enkelte anførselstegn', () => {
        expect(escapeHtml("it's")).toBe('it&#039;s');
    });

    it('klarer null/undefined', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });

    it('gør tal til tekst', () => {
        expect(escapeHtml(42)).toBe('42');
    });

    it('lader ufarlig tekst være urørt', () => {
        expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('klarer tom tekst', () => {
        expect(escapeHtml('')).toBe('');
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. CSV Parsing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('detectDelimiter', () => {
    it('finder komma', () => {
        expect(detectDelimiter('a,b,c')).toBe(',');
    });

    it('finder tab', () => {
        expect(detectDelimiter('a\tb\tc')).toBe('\t');
    });

    it('finder semikolon', () => {
        expect(detectDelimiter('a;b;c')).toBe(';');
    });

    it('foretrækker tab, når der er lige mange som kommaer', () => {
        // 2 tabs vs 2 commas → tab wins (tabCount > commaCount check is first)
        expect(detectDelimiter('a\tb,c\td')).toBe('\t');
    });

    it('bruger komma for almindelig tekst', () => {
        expect(detectDelimiter('hello world')).toBe(',');
    });
});

describe('parseCSV: én linje', () => {
    it('læser en simpel linje med komma', () => {
        expect(parseCSV('a,b,c')).toEqual([['a', 'b', 'c']]);
    });

    it('fjerner mellemrum omkring værdier uden anførselstegn', () => {
        expect(parseCSV('  a , b , c  ')).toEqual([['a', 'b', 'c']]);
    });

    it('bevarer mellemrum inde i anførselstegn', () => {
        // RFC 4180: a quoted field "  hello  " keeps its surrounding spaces.
        expect(parseCSV('"  hello  ",b')).toEqual([['  hello  ', 'b']]);
    });

    it('klarer felter i anførselstegn med komma indeni', () => {
        expect(parseCSV('"hello, world",b')).toEqual([['hello, world', 'b']]);
    });

    it('klarer escapede anførselstegn (dobbelt "")', () => {
        expect(parseCSV('"say ""hello""",b')).toEqual([['say "hello"', 'b']]);
    });

    it('klarer tab som skilletegn', () => {
        expect(parseCSV('a\tb\tc')).toEqual([['a', 'b', 'c']]);
    });

    it('klarer semikolon som skilletegn', () => {
        expect(parseCSV('a;b;c')).toEqual([['a', 'b', 'c']]);
    });

    it('klarer tomme felter', () => {
        expect(parseCSV('a,,c')).toEqual([['a', '', 'c']]);
    });

    it('klarer ét enkelt felt', () => {
        expect(parseCSV('hello')).toEqual([['hello']]);
    });
});

describe('parseCSV: citeret celle der aldrig lukkes', () => {
    it('markerer filen, så importen kan advare', () => {
        const r = parseCSV('Navn,Info\nAnna,"aldrig lukket\nBob,x');
        expect(r.unclosedQuote).toBe(true);
    });
    it('markerer ikke en almindelig fil', () => {
        expect(parseCSV('Navn,Info\nAnna,"ok"\nBob,5" skærm').unclosedQuote).toBe(false);
    });
});

describe('parseCSV', () => {
    it('læser CSV over flere linjer med overskrift', () => {
        const result = parseCSV('Navn,Køn\nAnna,K\nBob,M');
        expect(result).toEqual([
            ['Navn', 'Køn'],
            ['Anna', 'K'],
            ['Bob', 'M'],
        ]);
    });

    it('finder selv tab som skilletegn', () => {
        const result = parseCSV('a\tb\n1\t2');
        expect(result).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('springer tomme linjer over', () => {
        const result = parseCSV('a,b\n\nc,d\n  \ne,f');
        expect(result).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f']]);
    });

    it('svarer en tom liste for tom tekst', () => {
        expect(parseCSV('')).toEqual([]);
        expect(parseCSV('   ')).toEqual([]);
    });

    it('bevarer linjeskift inde i felter i anførselstegn (RFC 4180)', () => {
        const result = parseCSV('Navn,Info\nAnna,"linje 1\nlinje 2"\nBob,enkel');
        expect(result).toEqual([
            ['Navn', 'Info'],
            ['Anna', 'linje 1\nlinje 2'],
            ['Bob', 'enkel'],
        ]);
    });

    it('klarer CRLF-linjeskift', () => {
        const result = parseCSV('a,b\r\n1,2\r\n3,4');
        expect(result).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
    });

    it('klarer escapede anførselstegn i felter over flere linjer', () => {
        const result = parseCSV('a,b\n1,"hej ""du""\nfortsat"');
        expect(result).toEqual([['a', 'b'], ['1', 'hej "du"\nfortsat']]);
    });

    it('læser en fil uden linjeskift til sidst', () => {
        expect(parseCSV('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    });
});

describe('parseCSV — anførselstegn midt i en celle', () => {
    it('et enkelt " midt i et navn æder ikke resten af filen', () => {
        const result = parseCSV('Navn,Info\nJens 5" Hansen,a\nAnna,b\nBob,c');
        expect(result).toEqual([['Navn', 'Info'], ['Jens 5" Hansen', 'a'], ['Anna', 'b'], ['Bob', 'c']]);
    });

    it('kaldenavn i anførselstegn midt i en celle bevares', () => {
        const result = parseCSV('Navn;Klasse\nJens "Jonny" Hansen;1a');
        expect(result[1]).toEqual(['Jens "Jonny" Hansen', '1a']);
    });

    it('et enkelt " i første linje påvirker ikke skilletegnet eller rækkerne', () => {
        const result = parseCSV('Navn;Ø 5"\nAnna;1\nBob;2');
        expect(result).toEqual([['Navn', 'Ø 5"'], ['Anna', '1'], ['Bob', '2']]);
    });

    it('en citeret celle efter mellemrum fungerer stadig', () => {
        expect(parseCSV('a, "x, y",b')).toEqual([['a', 'x, y', 'b']]);
    });

    it('et " midt i en celle er bare et tegn', () => {
        expect(parseCSV('5" skærm,b')).toEqual([['5" skærm', 'b']]);
    });
});

describe('parseCSV: citerede celler (som Excel skriver dem)', () => {
    it('en overskrift med komma i anførselstegn forskyder ikke kolonnerne (regression: B3)', () => {
        expect(parseCSV('"Navn, fuld","Køn"\n"Anna","K"\n')).toEqual([['Navn, fuld', 'Køn'], ['Anna', 'K']]);
    });
    it('celler over flere linjer kommer uændret tilbage', () => {
        expect(parseCSV('"a"\n"linje 1\nlinje 2"\n')).toEqual([['a'], ['linje 1\nlinje 2']]);
    });
});

describe('ensureRowIds', () => {
    it('giver hver række et unikt id', () => {
        const data = [{ Navn: 'Anna' }, { Navn: 'Bob' }, { Navn: 'Clara' }];
        expect(ensureRowIds(data)).toBe(3);
        const ids = data.map(r => r[ROW_ID]);
        expect(new Set(ids).size).toBe(3);
    });

    it('to elever med samme navn får hvert sit id', () => {
        const data = [{ Navn: 'Anna Hansen' }, { Navn: 'Anna Hansen' }];
        ensureRowIds(data);
        expect(data[0][ROW_ID]).not.toBe(data[1][ROW_ID]);
    });

    it('en række uden navn får også et id', () => {
        const data = [{ Navn: '' }];
        ensureRowIds(data);
        expect(data[0][ROW_ID]).toBeTruthy();
    });

    it('er idempotent — rører ikke eksisterende id-er', () => {
        const data = [{ Navn: 'Anna', [ROW_ID]: 'r7' }, { Navn: 'Bob' }];
        expect(ensureRowIds(data)).toBe(1);
        expect(data[0][ROW_ID]).toBe('r7');
        expect(ensureRowIds(data)).toBe(0);
    });

    it('genbruger ikke det højeste id efter sletning', () => {
        const data = [{ [ROW_ID]: 'r1' }, { [ROW_ID]: 'r2' }, { [ROW_ID]: 'r3' }];
        data.pop();                // slet r3 — tælleren mistede netop sit maksimum
        data.push({ Navn: 'Ny' });  // ny elev
        ensureRowIds(data);
        expect(['r1', 'r2', 'r3']).not.toContain(data[2][ROW_ID]);
    });

    it('en helt tømt og genindlæst klasse giver nye elever nye identiteter', () => {
        const original = [{ [ROW_ID]: 'r1' }, { [ROW_ID]: 'r2' }];
        const data = JSON.parse(JSON.stringify(original.slice(0, 0)));
        data.push({ Navn: 'Ny' }, { Navn: 'Også ny' });
        ensureRowIds(data);
        expect(data.map(row => row[ROW_ID]).some(id => ['r1', 'r2'].includes(id))).toBe(false);
    });

    // Et id fylder ikke ét sted, men ét pr. medlem i hver gemt gruppe og hver
    // af historikkens 50 sessioner. Målt: 500 elever koster 708 KB ekstra bare
    // ved at gå fra 16 til 32 hextegn, ud af en kvote på ~5 MB. Længden er
    // altså et lagerbudget og ikke en detalje — derfor et værn om den.
    it('nye id-er er 16 hextegn — længden er et lagerbudget', () => {
        const data = [{ Navn: 'Anna' }, { Navn: 'Bo' }];
        ensureRowIds(data);
        for (const row of data) {
            expect(row[ROW_ID]).toMatch(/^r-[a-f0-9]{16}$/);
        }
    });

    it('bevarer både gamle og nye id-er gennem en JSON-rundtur', () => {
        const original = [{ Navn: 'Anna', [ROW_ID]: 'r7' }, { Navn: 'Bo' }];
        ensureRowIds(original);
        const restored = JSON.parse(JSON.stringify(original));
        expect(ensureRowIds(restored)).toBe(0);
        expect(restored).toEqual(original);
    });

    it('fortryd og gentag bevarer aftalens elev uden at give den til en ny elev', () => {
        clearUndoHistory();
        state.currentClass = {
            data: [{ Navn: 'Anna', [ROW_ID]: 'r1' }, { Navn: 'Bo', [ROW_ID]: 'r2' }],
            togetherGroups: [{ ids: ['r1', 'r2'] }],
        };
        pushUndo();
        state.currentClass.data.pop();
        state.currentClass.data.push({ Navn: 'Clara' });
        ensureRowIds(state.currentClass.data);
        const addedId = state.currentClass.data[1][ROW_ID];
        expect(togetherComponents(state.currentClass.togetherGroups, state.currentClass.data)).toEqual([]);

        expect(undo()).toBe(true);
        expect(ensureRowIds(state.currentClass.data)).toBe(0);
        expect(togetherComponents(state.currentClass.togetherGroups, state.currentClass.data)).toEqual([['r1', 'r2']]);
        expect(redo()).toBe(true);
        expect(state.currentClass.data[1][ROW_ID]).toBe(addedId);
        expect(togetherComponents(state.currentClass.togetherGroups, state.currentClass.data)).toEqual([]);
        clearUndoHistory();
        state.currentClass = null;
    });

    it('giver et dubleret id (kopieret række) et nyt id', () => {
        const data = [{ [ROW_ID]: 'r1' }, { [ROW_ID]: 'r1' }];
        ensureRowIds(data);
        expect(data[0][ROW_ID]).not.toBe(data[1][ROW_ID]);
    });
});

describe('memberDisplayName', () => {
    const data = [
        { [ROW_ID]: 'r1', Navn: 'Anna', Kaldenavn: 'A' },
        { [ROW_ID]: 'r2', Navn: '' },
    ];

    it('viser værdien fra den valgte visningskolonne', () => {
        expect(memberDisplayName('r1', data, 'Navn')).toBe('Anna');
        expect(memberDisplayName('r1', data, 'Kaldenavn')).toBe('A');
    });

    it('viser "(uden name)" når kolonnen er tom for eleven', () => {
        expect(memberDisplayName('r2', data, 'Navn')).toBe('(uden navn)');
    });

    it('bruger det frosne navn for en slettet elev (spøgelse)', () => {
        expect(memberDisplayName({ id: 'r9', name: 'David' }, data, 'Navn')).toBe('David');
    });

    it('taber ikke navnet på en umigreret navne-reference', () => {
        // Gammel gemt gruppe hvor medlemmet ER navnet.
        expect(memberDisplayName('Ukendt Elev', data, 'Navn')).toBe('Ukendt Elev');
    });

    it('skriver aldrig et _rowId frem som om det var et navn', () => {
        // Ældre gemte grupper bærer id'et som sit eget "navn". Blev eleven
        // siden slettet, stod der "r12" på gruppekortet, på udskriften og i
        // den kopierede liste — et id er en nøgle, ikke noget man læser.
        expect(memberDisplayName({ id: 'r12', name: 'r12' }, data, 'Navn')).toBe('(uden navn)');
    });

    it('viser heller ikke nye tilfældige id-er som navne på slettede elever', () => {
        const removed = [{ Navn: 'Bo' }];
        ensureRowIds(removed);
        const id = removed[0][ROW_ID];
        expect(memberDisplayName(id, [], 'Navn')).toBe('(uden navn)');
        expect(memberDisplayName({ id, name: id }, [], 'Navn')).toBe('(uden navn)');
        expect(memberDisplayName({ id, name: 'Bo' }, [], 'Navn')).toBe('Bo');
    });
});

describe('buildStudentIndex — genvejen må svare præcis som gennemløbningen', () => {
    // Gruppekortene slår hver elev op flere gange pr. gentegning, og hvert
    // opslag gennemløb før HELE elevlisten. Kortet her er genvejen. Værnet
    // handler ikke om at det er hurtigere — det handler om at et navn og et
    // fraværs-flueben stadig peger på den samme elev som før.
    const data = [
        { [ROW_ID]: 'r1', Navn: 'Anna' },
        { [ROW_ID]: 'r2', Navn: 'Bo', _excluded: true },
        { [ROW_ID]: 'r3', Navn: '' },
    ];

    it('giver samme svar med og uden kort', () => {
        const byId = buildStudentIndex(data);
        for (const m of ['r1', 'r2', 'r3', 'r9', 'Ukendt Elev', { id: 'r9', name: 'David' }]) {
            expect(memberDisplayName(m, null, 'Navn', byId))
                .toBe(memberDisplayName(m, data, 'Navn'));
            expect(isMemberAbsent(m, null, byId)).toBe(isMemberAbsent(m, data));
        }
    });

    it('første række vinder ved dublet-id — som .find() gør', () => {
        // Ikke-unikke id'er er allerede en advarsel ved import; her handler det
        // kun om, at de to veje ikke må vælge hver sin række.
        const duplicateNames = [
            { [ROW_ID]: 'r1', Navn: 'Først' },
            { [ROW_ID]: 'r1', Navn: 'Sidst' },
        ];
        const byId = buildStudentIndex(duplicateNames);
        expect(memberDisplayName('r1', null, 'Navn', byId)).toBe('Først');
        expect(memberDisplayName('r1', duplicateNames, 'Navn')).toBe('Først');
    });

    it('springer tomme rækker og rækker uden _rowId over', () => {
        const messy = [null, { Navn: 'Uden id' }, { [ROW_ID]: '  ', Navn: 'Blanktegn' },
                       { [ROW_ID]: 'r5', Navn: 'Eva' }];
        const byId = buildStudentIndex(messy);
        expect(byId.size).toBe(1);
        expect(memberDisplayName('r5', null, 'Navn', byId)).toBe('Eva');
    });

    it('en tom elevliste giver et tomt kort, ikke et brag', () => {
        expect(buildStudentIndex(null).size).toBe(0);
        expect(buildStudentIndex(undefined).size).toBe(0);
        expect(buildStudentIndex([]).size).toBe(0);
    });
});

describe('migrateRefsToRowIds', () => {
    const makeClass = () => ({
        columns: ['Navn', 'Køn'],
        data: [
            { Navn: 'Anna', Køn: 'K' },
            { Navn: 'Bob', Køn: 'M' },
            { Navn: 'Clara', Køn: 'K' },
        ],
    });

    it('sætter ikke et _rowId som medlemmets navn', () => {
        // Anden runde: medlemmerne ER allerede id'er. Før blev "r1" sat som
        // navn på sig selv, og navnet fulgte med ud på gruppekortet, hvis
        // eleven blev slettet.
        const cls = makeClass();
        const groups = [{ name: 'G1', members: ['Anna', 'Bob'] }];
        migrateRefsToRowIds(cls, 'Navn', { groupSets: [groups] });
        migrateRefsToRowIds(cls, 'Navn', { groupSets: [groups] });

        groups[0].members.forEach(m => {
            const memberName = (typeof m === 'object' && m !== null) ? m.name : null;
            expect(memberName === undefined || memberName === null || !ROW_ID_PATTERN.test(memberName)).toBe(true);
        });
    });

    it('oversætter undgåelser fra navne til _rowId', () => {
        const cls = makeClass();
        const separations = [{ ids: ['Anna', 'Clara'] }];
        migrateRefsToRowIds(cls, 'Navn', { separations });

        const idOf = (n) => cls.data.find(r => r.Navn === n)[ROW_ID];
        expect(separations[0].ids).toEqual([idOf('Anna'), idOf('Clara')]);
    });

    it('oversætter gemte gruppers medlemmer og beholder navnet', () => {
        const cls = makeClass();
        const groups = [{ name: 'G1', members: ['Anna', 'Bob'] }];
        migrateRefsToRowIds(cls, 'Navn', { groupSets: [groups] });

        const idOf = (n) => cls.data.find(r => r.Navn === n)[ROW_ID];
        expect(groups[0].members.map(m => m.id)).toEqual([idOf('Anna'), idOf('Bob')]);
        expect(groups[0].members.map(m => m.name)).toEqual(['Anna', 'Bob']);
    });

    it('er idempotent — anden kørsel ændrer intet', () => {
        const cls = makeClass();
        const separations = [{ ids: ['Anna'] }];
        const groups = [{ name: 'G1', members: ['Bob'] }];
        migrateRefsToRowIds(cls, 'Navn', { separations, groupSets: [groups] });

        const after = JSON.stringify({ separations, groups, data: cls.data });
        const second = migrateRefsToRowIds(cls, 'Navn', { separations, groupSets: [groups] });
        expect(second).toEqual({ rowIdsAdded: 0, refsRemapped: 0 });
        expect(JSON.stringify({ separations, groups, data: cls.data })).toBe(after);
    });

    it('lader en ukendt reference stå (bliver et spøgelse)', () => {
        const cls = makeClass();
        const groups = [{ name: 'G1', members: ['Slettet Elev'] }];
        migrateRefsToRowIds(cls, 'Navn', { groupSets: [groups] });
        expect(groups[0].members[0].id).toBe('Slettet Elev');
        expect(groups[0].members[0].name).toBe('Slettet Elev');
    });

    it('udleder den gamle ID-kolonne når den ikke er gemt', () => {
        const cls = makeClass();
        const separations = [{ ids: ['Bob'] }];
        migrateRefsToRowIds(cls, undefined, { separations });
        expect(separations[0].ids[0]).toBe(cls.data.find(r => r.Navn === 'Bob')[ROW_ID]);
    });

    it('bevarer låst-flag og andre gruppefelter', () => {
        const cls = makeClass();
        const groups = [{ name: 'G1', members: ['Anna'], locked: true, topic: 'Alpha' }];
        migrateRefsToRowIds(cls, 'Navn', { groupSets: [groups] });
        expect(groups[0].locked).toBe(true);
        expect(groups[0].topic).toBe('Alpha');
    });
});

describe('stripEmptyColumns', () => {
    it('dropper tomme kolonner til sidst i et oppustet Excel-område', () => {
        // sheet_to_csv skriver hele arkets "brugte område" ud, så en 3-kolonners
        // elevliste kom ind som "Navn,Køn,Emne,,,,,,,,,".
        const rows = parseCSV('Navn,Køn,Emne,,,,\nAnna,K,Biologi,,,,\nMikkel,M,Fysik,,,,\n');
        const { rows: out, removed } = stripEmptyColumns(rows);
        expect(removed).toBe(4);
        expect(out).toEqual([['Navn', 'Køn', 'Emne'], ['Anna', 'K', 'Biologi'], ['Mikkel', 'M', 'Fysik']]);
    });

    it('dropper en tom første kolonne, så den ikke kan blive ID-kolonnen', () => {
        // Data der starter i kolonne B gjorde tidligere den tomme kolonne A til
        // ID-kolonne → alle elever manglede ID ved gruppedannelse.
        const rows = parseCSV(',Navn,Køn\n,Anna,K\n,Mikkel,M\n');
        const { rows: out, removed } = stripEmptyColumns(rows);
        expect(removed).toBe(1);
        expect(out[0]).toEqual(['Navn', 'Køn']);
    });

    it('dropper en tom afstandskolonne i midten', () => {
        const rows = parseCSV('Navn,,Køn\nAnna,,K\n');
        expect(stripEmptyColumns(rows).rows).toEqual([['Navn', 'Køn'], ['Anna', 'K']]);
    });

    it('beholder en kolonne med overskrift, men endnu uden data', () => {
        // Læreren har lavet en "Noter"-kolonne som skal udfyldes senere.
        const rows = parseCSV('Navn,Køn,Noter\nAnna,K,\nMikkel,M,\n');
        const { rows: out, removed } = stripEmptyColumns(rows);
        expect(removed).toBe(0);
        expect(out[0]).toEqual(['Navn', 'Køn', 'Noter']);
    });

    it('beholder en kolonne med data, men uden overskrift', () => {
        const rows = parseCSV('Navn,\nAnna,K\n');
        expect(stripEmptyColumns(rows).removed).toBe(0);
    });

    it('fylder korte rækker ud til de beholdte kolonners bredde', () => {
        const rows = [['Navn', 'Køn', ''], ['Anna']];
        expect(stripEmptyColumns(rows).rows).toEqual([['Navn', 'Køn'], ['Anna', '']]);
    });

    it('behandler celler med kun mellemrum som tomme', () => {
        const rows = [['Navn', '   '], ['Anna', ' ']];
        expect(stripEmptyColumns(rows).removed).toBe(1);
    });

    it('lader input være urørt, når intet er tomt', () => {
        const rows = [['Navn', 'Køn'], ['Anna', 'K']];
        const { rows: out, removed } = stripEmptyColumns(rows);
        expect(removed).toBe(0);
        expect(out).toBe(rows); // samme reference — ingen unødig kopi
    });

    it('klarer et tomt input', () => {
        expect(stripEmptyColumns([])).toEqual({ rows: [], removed: 0 });
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Color Registry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('getColorForString', () => {
    beforeEach(() => {
        clearColorRegistry();
    });

    it('svarer et tomt objekt for null/undefined', () => {
        expect(getColorForString(null)).toEqual({});
        expect(getColorForString('')).toEqual({});
    });

    it('svarer et tomt objekt for "matrix"', () => {
        expect(getColorForString('matrix')).toEqual({});
        expect(getColorForString('Matrix')).toEqual({});
    });

    it('svarer et oklch-farveobjekt for gyldig tekst', () => {
        const result = getColorForString('GroupA');
        expect(result).toHaveProperty('bg');
        expect(result).toHaveProperty('color');
        expect(result).toHaveProperty('border');
        expect(result.bg).toMatch(/^oklch\(/);
    });

    it('samme tekst giver samme farve (uanset store og små bogstaver)', () => {
        const a = getColorForString('Hello');
        const b = getColorForString('hello');
        expect(a).toEqual(b);
    });

    it('samme tekst giver samme farve (uanset mellemrum)', () => {
        const a = getColorForString('Hello');
        const b = getColorForString('  Hello  ');
        expect(a).toEqual(b);
    });

    it('forskellige tekster får forskellige farver', () => {
        const a = getColorForString('Alpha');
        const b = getColorForString('Beta');
        expect(a.bg).not.toBe(b.bg);
    });

    it('bliver ved med at give forskellige farvetoner ud over paletten på 12', () => {
        const colors = [];
        for (let i = 0; i < 13; i++) {
            colors.push(getColorForString(`group-${i}`));
        }
        // The 13th distinct string used to wrap back to hue #1. Now it gets a
        // fresh golden-angle hue (12 * 137.5 % 360 = 210), so it must differ.
        expect(colors[12].bg).not.toBe(colors[0].bg);
        expect(colors[12].bg).toBe('oklch(0.96 0.03 210)');
    });

    it('clearColorRegistry nulstiller farverne', () => {
        getColorForString('Alpha');
        clearColorRegistry();
        // After clear, "Alpha" should get index 0 again (same color as before clear)
        const result = getColorForString('Beta');
        // Beta now gets index 0 (the first slot), same hue as Alpha had before
        expect(result.bg).toMatch(/^oklch\(0\.96 0\.03 220\)/);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Debounce
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('debounce', () => {
    it('udsætter kaldet', async () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it('kalder kun én gang ved hurtige kald efter hinanden', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced();
        debounced();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it('giver argumenterne fra det sidste kald videre', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounce(fn, 50);

        debounced('first');
        debounced('second');
        debounced('third');

        vi.advanceTimersByTime(50);
        expect(fn).toHaveBeenCalledWith('third');

        vi.useRealTimers();
    });

    // flush() findes for det øjeblik, hvor fanen lukkes, mens en skrivning
    // stadig venter. Uden den er ændringen aldrig nået længere end
    // hukommelsen — og Grupper har ingen server at hente den fra.
    it('flush() kører det ventende NU, med de sidste argumenter', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounce(fn, 1000);

        debounced('a');
        debounced('b');
        expect(debounced.flush()).toBe(true);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('b');

        // Og timeren må ikke fyre bagefter — så var det gjort to gange.
        vi.advanceTimersByTime(2000);
        expect(fn).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it('flush() gør ingenting, når der ikke er noget at gøre', () => {
        vi.useFakeTimers();
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        expect(debounced.flush()).toBe(false);
        expect(fn).not.toHaveBeenCalled();

        // Heller ikke lige efter at en kørsel er løbet af.
        debounced();
        vi.advanceTimersByTime(100);
        expect(debounced.flush()).toBe(false);
        expect(fn).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Constants Integrity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('RULE_TYPES-konstanterne', () => {
    it('har alle de forventede regeltyper', () => {
        expect(RULE_TYPES.DISTRIBUTE).toBe('distribute');
        expect(RULE_TYPES.AGGREGATE).toBe('aggregate');
        expect(RULE_TYPES.CLUSTER).toBe('cluster');
        expect(RULE_TYPES.SEPARATE).toBe('separate');
        expect(RULE_TYPES.BALANCE).toBe('balance');
        expect(RULE_TYPES.MINIMIZEDIFF).toBe('minimizediff');
        expect(RULE_TYPES.GROUP_SORT).toBe('group_sort');
        expect(RULE_TYPES.STRICT_SEPARATE).toBe('strict_separate');
    });

    it('er frosset (kan ikke ændres)', () => {
        expect(Object.isFrozen(RULE_TYPES)).toBe(true);
    });
});

describe('RULE_OPTIONS', () => {
    it('har valgmuligheder til lærerens UI (danske navne)', () => {
        expect(RULE_OPTIONS.length).toBeGreaterThan(0);
        RULE_OPTIONS.forEach(opt => {
            expect(opt).toHaveProperty('value');
            expect(opt).toHaveProperty('label');
            expect(opt.label.length).toBeGreaterThan(0);
        });
    });

    it('har SEPARATE (Adskil) som en fuld regel, men ikke strict_separate', () => {
        const values = RULE_OPTIONS.map(o => o.value);
        // "Adskil" is now selectable in the Regler menu (value-based separation),
        // alongside the name-based "Undgå hinanden" tab.
        expect(values).toContain(RULE_TYPES.SEPARATE);
        // strict_separate stays an internal type (no UI entry point yet).
        expect(values).not.toContain(RULE_TYPES.STRICT_SEPARATE);
    });
});

describe('RULE_DESCRIPTIONS', () => {
    it('har en beskrivelse for hver RULE_TYPE', () => {
        Object.values(RULE_TYPES).forEach(type => {
            expect(RULE_DESCRIPTIONS[type]).toBeDefined();
            expect(RULE_DESCRIPTIONS[type].length).toBeGreaterThan(0);
        });
    });
});

describe('RULES_WITHOUT_VALUES', () => {
    it('dækker alle regler, hvor motoren arbejder på hele kolonnen', () => {
        expect(RULES_WITHOUT_VALUES).toContain(RULE_TYPES.BALANCE);
        expect(RULES_WITHOUT_VALUES).toContain(RULE_TYPES.MINIMIZEDIFF);
        expect(RULES_WITHOUT_VALUES).toContain(RULE_TYPES.DISTRIBUTE);
        expect(RULES_WITHOUT_VALUES).toContain(RULE_TYPES.CLUSTER);
        expect(RULES_WITHOUT_VALUES).toContain(RULE_TYPES.GROUP_SORT);
        expect(RULES_WITHOUT_VALUES).toContain(RULE_TYPES.AGGREGATE);
    });

    it('Adskil beholder værdien — den er den eneste regel, motoren læser den i', () => {
        expect(RULES_WITHOUT_VALUES).not.toContain(RULE_TYPES.SEPARATE);
        expect(RULES_WITHOUT_VALUES).not.toContain(RULE_TYPES.STRICT_SEPARATE);
    });
});

describe('RULE_WEIGHT_NOTES', () => {
    it('hver regel i menuen siger, hvor tungt den vejer', () => {
        // Uden den her kan en ny regeltype smutte ind i menuen uden et ord om,
        // hvad der sker, når den støder sammen med en anden — og så er læreren
        // tilbage ved at gætte på motorens skjulte vægte.
        for (const opt of RULE_OPTIONS) {
            expect(RULE_WEIGHT_NOTES[opt.value], opt.label).toBeTruthy();
        }
    });

    it('Opdel er den eneste, der beskrives som strukturel', () => {
        expect(RULE_WEIGHT_NOTES[RULE_TYPES.AGGREGATE]).toMatch(/deler klassen op først/i);
        expect(RULE_WEIGHT_NOTES[RULE_TYPES.DISTRIBUTE]).toMatch(/mål/i);
    });
});

describe('MATRIX_EXCLUDED_RULES', () => {
    it('udelader aggregate i matrix', () => {
        expect(MATRIX_EXCLUDED_RULES).toContain(RULE_TYPES.AGGREGATE);
    });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Topic comparison and rounding helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
    eqTopic,
    findTopicIndex,
    computeTopicAdjustedTarget,
    suggestTopicMultiple,
} from './utils.js';

describe('eqTopic', () => {
    it('null/tomt er aldrig ens', () => {
        expect(eqTopic(null, null)).toBe(false);
        expect(eqTopic('', '')).toBe(false);
        expect(eqTopic('A', '')).toBe(false);
        expect(eqTopic(undefined, 'A')).toBe(false);
    });
    it('sammenligner uden store/små bogstaver og uden mellemrum omkring', () => {
        expect(eqTopic('Liberalisme', 'liberalisme')).toBe(true);
        expect(eqTopic('  Liberalisme ', 'LIBERALISME')).toBe(true);
        expect(eqTopic('Liberalisme', 'Konservatisme')).toBe(false);
    });
});

describe('findTopicIndex', () => {
    it('svarer -1 for tomme/null-input', () => {
        expect(findTopicIndex([], 'A')).toBe(-1);
        expect(findTopicIndex(['A'], '')).toBe(-1);
        expect(findTopicIndex(null, 'A')).toBe(-1);
    });
    it('finder et match uden store/små bogstaver', () => {
        expect(findTopicIndex(['Liberalisme', 'Konservatisme'], 'liberalisme')).toBe(0);
        expect(findTopicIndex(['Liberalisme', 'Konservatisme'], 'KONSERVATISME')).toBe(1);
        expect(findTopicIndex(['Liberalisme'], 'Socialisme')).toBe(-1);
    });
});

describe('computeTopicAdjustedTarget', () => {
    it('svarer null uden emner', () => {
        const r = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 3, sizeMod: '+',
            studentCount: 30, lockedCount: 0, topicCount: 0,
        });
        expect(r).toBeNull();
    });

    it('svarer null uden elever', () => {
        const r = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 3, sizeMod: '+',
            studentCount: 0, lockedCount: 0, topicCount: 3,
        });
        expect(r).toBeNull();
    });

    // Size mode — '+' modifier → larger groups → FLOOR
    it('size+: 30 students, size 3, 3 topics → 9 groups (rounds 10 down)', () => {
        const r = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 3, sizeMod: '+',
            studentCount: 30, lockedCount: 0, topicCount: 3,
        });
        expect(r.naiveNew).toBe(10); // floor(30/3)
        expect(r.adjustedNew).toBe(9); // floor to multiple of 3
        expect(r.didAdjust).toBe(true);
        expect(r.direction).toBe('down');
    });

    // Size mode — '-' modifier → smaller groups → CEIL
    it('size-: 30 students, size 3, 3 topics → 12 groups (rounds 10 up)', () => {
        const r = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 3, sizeMod: '-',
            studentCount: 30, lockedCount: 0, topicCount: 3,
        });
        expect(r.naiveNew).toBe(10); // ceil(30/3)
        expect(r.adjustedNew).toBe(12);
        expect(r.direction).toBe('up');
    });

    // Uden flueben regnes som "+" — det er sådan, motoren får det
    // (buildEngineInput: alt andet end "-" er "plus").
    it('størrelse uden flueben: regnes som "+"', () => {
        const blank = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 3, sizeMod: '',
            studentCount: 28, lockedCount: 0, topicCount: 3,
        });
        const plus = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 3, sizeMod: '+',
            studentCount: 28, lockedCount: 0, topicCount: 3,
        });
        expect(blank).toEqual(plus);
        expect(blank.naiveNew).toBe(9); // floor(28/3)
    });

    it('justerer ikke, når tallet allerede er et multiplum', () => {
        const r = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 3, sizeMod: '+',
            studentCount: 27, lockedCount: 0, topicCount: 3,
        });
        expect(r.naiveNew).toBe(9);
        expect(r.adjustedNew).toBe(9);
        expect(r.didAdjust).toBe(false);
        expect(r.direction).toBe('none');
    });

    // Size mode + locked groups: rounding accounts for locked total
    it('størrelse+: tager hensyn til låste grupper i afrundingen', () => {
        const r = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 3, sizeMod: '+',
            studentCount: 24, lockedCount: 2, topicCount: 3,
        });
        // naiveNew = floor(24/3) = 8
        // total with locked = 8 + 2 = 10 → floor to 9 (multiple of 3, ≥3)
        // adjustedNew = 9 - 2 = 7
        expect(r.naiveNew).toBe(8);
        expect(r.adjustedNew).toBe(7);
        expect(r.naiveTotal).toBe(10);
        expect(r.adjustedTotal).toBe(9);
    });

    // Number mode honors teacher's choice — no rounding
    it('antal: respekterer lærerens tal, ingen afrunding', () => {
        const r = computeTopicAdjustedTarget({
            mode: 'number', numberTarget: 5,
            studentCount: 30, lockedCount: 0, topicCount: 3,
        });
        expect(r.naiveNew).toBe(5);
        expect(r.adjustedNew).toBe(5);
        expect(r.didAdjust).toBe(false);
    });

    // Færre grupper end emner: kun "én elev mindre" giver én gruppe pr. emne
    // (motorens spec. 4.4, svar 41). "Én elev ekstra" holder størrelsen.
    it('færre grupper end emner: "+" holder størrelsen, "-" giver én pr. emne', () => {
        const plus = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 10, sizeMod: '+',
            studentCount: 5, lockedCount: 0, topicCount: 3,
        });
        expect(plus.adjustedNew).toBe(1);
        const minus = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 10, sizeMod: '-',
            studentCount: 5, lockedCount: 0, topicCount: 3,
        });
        expect(minus.adjustedNew).toBe(3);
        expect(minus.adjustedSizes).toEqual([2, 2, 1]);
    });

    // Regression: with FEWER present students than topics (many absent), the
    // student cap must win over the topic floor — never more groups than there
    // are students (otherwise Python builds empty phantom groups).
    // Regression: afrundingen må ikke efterlade én kæmpe gruppe ved siden af de
    // låste. Med 18 frie elever, "4+" og 5 emner ligger begge multipler (1 eller
    // 6 nye grupper) uden for valget, så det rå tal bliver stående.
    it('låste grupper: beholder det rene antal, når intet multiplum passer', () => {
        const r = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 4, sizeMod: '+',
            studentCount: 18, lockedCount: 4, topicCount: 5,
        });
        expect(r.adjustedNew).toBe(4);
        expect(r.didAdjust).toBe(false);
    });

    // Størrelsen er lærerens valg. Hvert par er [elever, størrelse, flueben,
    // emner, forventede grupper]. Fundet 1/11 2026: 28/"4+"/5 gav 10 grupper på 2-3.
    it.each([
        [28, 4, '+', 5, 7],
        [28, 4, '-', 5, 7],
        [22, 4, '+', 4, 5],
        [30, 4, '+', 4, 7],
        [29, 3, '+', 6, 9],
        [28, 4, '+', 3, 6],  // 6 grupper på 4-5 er inden for valget: der rundes
        [28, 4, '-', 3, 9],  // 9 grupper på 3-4 ligeså
    ])('%i elever, str. %i%s, %i emner giver %i grupper', (studentCount, sizeNum, sizeMod, topicCount, groups) => {
        const r = computeTopicAdjustedTarget({ mode: 'size', sizeNum, sizeMod, studentCount, lockedCount: 0, topicCount });
        expect(r.adjustedNew).toBe(groups);
    });

    // Det eneste sted, størrelsen må vige: færre grupper end emner — og kun
    // ved "én elev mindre". Fundet 12/11 2026: appen lovede også 5 grupper ved
    // "én elev ekstra", men motoren danner 4 (og skriver, at et emne ingen får).
    it('færre grupper end emner: én gruppe pr. emne kun ved "-"', () => {
        const plus = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 5, sizeMod: '+',
            studentCount: 24, lockedCount: 0, topicCount: 5,
        });
        expect(plus.naiveTotal).toBe(4);
        expect(plus.adjustedNew).toBe(4);
        const minus = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 6, sizeMod: '-',
            studentCount: 24, lockedCount: 0, topicCount: 5,
        });
        expect(minus.naiveTotal).toBe(4);
        expect(minus.adjustedNew).toBe(5);
    });

    // Med en "Opdel" regner motoren pr. pulje.
    it('Opdel: grupperne tælles pr. pulje', () => {
        const whole = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 4, sizeMod: '+', studentCount: 28, lockedCount: 0, topicCount: 1,
        });
        const pools = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 4, sizeMod: '+', studentCount: 28, poolSizes: [13, 15], lockedCount: 0, topicCount: 1,
        });
        expect(whole.adjustedNew).toBe(7);
        expect(pools.adjustedNew).toBe(6);            // 3 + 3
        expect(pools.adjustedSizes).toEqual([5, 4, 4, 5, 5, 5]);
    });

    it('giver aldrig flere grupper end elever, når der er færre elever end emner', () => {
        const r = computeTopicAdjustedTarget({
            mode: 'size', sizeNum: 3, sizeMod: '+',
            studentCount: 2, lockedCount: 0, topicCount: 3,
        });
        expect(r.adjustedNew).toBeLessThanOrEqual(2);
        expect(r.adjustedNew).toBeGreaterThanOrEqual(1);
    });
});

// Afrundingens løfter, prøvet over mange klasser på én gang. Tallene kommer
// fra motorens egen funktion (se plannedNewGroups), så det her er motorens
// regler set fra appen: gruppetallet ligger altid mellem 1 og antal frie
// elever. Runder den, lander totalen på et multiplum af antal emner, og alle
// grupper holder lærerens valg: "4+" er 4-5, "4-" er 3-4. Færre grupper end
// emner giver én pr. emne ved "-", så længe der er elever nok; ved "+" bliver
// størrelsen stående.
describe('computeTopicAdjustedTarget — løfterne over mange klasser', () => {
    it('holder sig inden for lærerens størrelse, når den runder', () => {
        const broken = [];
        for (const mod of ['+', '-'])
        for (let students = 1; students <= 40; students++)
        for (const size of [2, 3, 4, 5, 6])
        for (let locked = 0; locked <= 4; locked++)
        for (let topics = 1; topics <= 6; topics++) {
            const a = computeTopicAdjustedTarget({
                mode: 'size', sizeNum: size, sizeMod: mod,
                studentCount: students, lockedCount: locked, topicCount: topics,
            });
            const label = JSON.stringify({ mod, students, size, locked, topics, a });
            if (a.adjustedNew < 1 || a.adjustedNew > students) broken.push(`antal ${label}`);
            if (a.adjustedSizes.reduce((x, y) => x + y, 0) !== students) broken.push(`elever ${label}`);
            if (a.naiveTotal < topics) {
                const perTopic = topics - locked;
                const expected = mod === '-' && topics > 1 && perTopic <= students ? perTopic : a.naiveNew;
                if (a.adjustedNew !== expected) broken.push(`én pr. emne ${label}`);
                continue;
            }
            if (!a.didAdjust) continue;
            if (a.adjustedTotal % topics !== 0) broken.push(`multiplum ${label}`);
            const low = mod === '+' ? size : size - 1;
            const high = mod === '-' ? size : size + 1;
            const g = a.adjustedNew;
            if (Math.floor(students / g) < low || Math.ceil(students / g) > high) broken.push(`størrelse ${label}`);
        }
        expect(broken).toEqual([]);
    });
});

describe('suggestTopicMultiple', () => {
    it('svarer null, når målet allerede er et multiplum', () => {
        const r = suggestTopicMultiple({ numberTarget: 6, lockedCount: 0, topicCount: 3 });
        expect(r).toBeNull();
    });
    it('svarer det næste multiplum opad', () => {
        const r = suggestTopicMultiple({ numberTarget: 5, lockedCount: 0, topicCount: 3 });
        expect(r).toEqual({ nextMultiple: 6, nextNew: 6, minPerTopic: 1 });
    });
    it('trækker låste grupper fra nextNew', () => {
        const r = suggestTopicMultiple({ numberTarget: 5, lockedCount: 2, topicCount: 3 });
        expect(r.nextMultiple).toBe(6);
        expect(r.nextNew).toBe(4);
    });
});

describe('teacherColumns — hvad læreren skal SE', () => {
    // Hele grunden til at funktionen findes: de to spørgsmål har FORSKELLIGT
    // svar på __MatrixSource__. Den er ikke et internt felt (den skal med i
    // motorens CSV og overleve et gem), men den er heller ikke lærerens
    // kolonne — hun skal ikke kunne slette den eller lægge en regel på den.
    it('__MatrixSource__ er ikke intern, men vises heller ikke', () => {
        expect(isInternalField('__MatrixSource__')).toBe(false);
        expect(teacherColumns(['Navn', '__MatrixSource__'])).toEqual(['Navn']);
    });

    it('interne felter er ude', () => {
        expect(teacherColumns(['Navn', '_rowId', 'Køn', '_excluded']))
            .toEqual(['Navn', 'Køn']);
    });

    it('rækkefølgen er lærerens egen', () => {
        expect(teacherColumns(['Karakter', 'Navn', 'Køn']))
            .toEqual(['Karakter', 'Navn', 'Køn']);
    });

    it('tåler at der ingen klasse er', () => {
        expect(teacherColumns(null)).toEqual([]);
        expect(teacherColumns(undefined)).toEqual([]);
        expect(teacherColumns([null, 42, 'Navn'])).toEqual(['Navn']);
    });
});

describe('isInternalField — hvad må ikke ud i lærerens Excel-fil', () => {
    it('ét ledende underscore er internt', () => {
        expect(isInternalField('_rowId')).toBe(true);
        expect(isInternalField('_excluded')).toBe(true);
    });

    it('to underscores er et ægte grupperings-input og bevares', () => {
        expect(isInternalField('__MatrixSource__')).toBe(false);
    });

    it('almindelige kolonner er ikke interne', () => {
        expect(isInternalField('Navn')).toBe(false);
        expect(isInternalField('Køn')).toBe(false);
        expect(isInternalField('')).toBe(false);
    });

    it('tåler ikke-strenge', () => {
        expect(isInternalField(null)).toBe(false);
        expect(isInternalField(undefined)).toBe(false);
        expect(isInternalField(42)).toBe(false);
    });
});


describe('groupDisplayName — gruppenavnet som læreren skal se det', () => {
    // Reglen stod skrevet i hånden 13 steder, og det 14. sted glemte den:
    // advarslen om en brudt undgåelse skrev "Anna og Bo i Group 1".
    it('oversætter det interne navn', () => {
        expect(groupDisplayName('Group 1')).toBe('Gruppe 1');
        expect(groupDisplayName('Group 12')).toBe('Gruppe 12');
    });

    it('rører ikke et navn der allerede er dansk', () => {
        expect(groupDisplayName('Gruppe 3')).toBe('Gruppe 3');
    });

    it('normaliserer dobbelte mellemrum, som kaldestederne gjorde før', () => {
        expect(groupDisplayName('Gruppe  3')).toBe('Gruppe 3');
    });

    it('oversætter kun i BEGYNDELSEN — et emne må gerne hedde noget med Group', () => {
        expect(groupDisplayName('Fokusgruppe Group')).toBe('Fokusgruppe Group');
    });

    it('tåler tomt og manglende input', () => {
        expect(groupDisplayName(null)).toBe('');
        expect(groupDisplayName(undefined)).toBe('');
        expect(groupDisplayName('')).toBe('');
    });
});

describe('groupShortName — den forkortelse der står ved siden af en elev', () => {
    // Forkortelsen stod skrevet i hånden tre steder og var ikke ens:
    // gruppekortet og den kopierede liste skrev "Grp 3", udskriften "Gr. 3".
    // Samme elev, samme stamgruppe, to mærkater.
    it('forkorter både det interne og det danske navn ens', () => {
        expect(groupShortName('Group 3')).toBe('Grp 3');
        expect(groupShortName('Gruppe 3')).toBe('Grp 3');
        expect(groupShortName('Gruppe  12')).toBe('Grp 12');
    });

    // Mærkatet får også EMNER ind: kortet viser stamgruppens emne frem for
    // dens navn, når der er et. De gamle håndskrevne .replace(/^Gruppe/,'Grp')
    // skar den slags midt over — "Gruppearbejde" blev til "Grparbejde".
    it('rører ikke et emne der tilfældigvis begynder med Gruppe', () => {
        expect(groupShortName('Gruppearbejde')).toBe('Gruppearbejde');
        expect(groupShortName('Gruppedynamik i 3.b')).toBe('Gruppedynamik i 3.b');
    });

    it('rører kun begyndelsen', () => {
        expect(groupShortName('Emne om Gruppe 2')).toBe('Emne om Gruppe 2');
    });

    // Formen SKAL blive ved med at være læsbar for `SOURCE_RE` i
    // restoreGroups.js — den skræller " (Grp 3 - Klima)" af igen, når læreren
    // limer den kopierede liste tilbage ind. Kender parseren ikke formen,
    // bliver forkortelsen en del af elevens navn, og eleven findes ikke.
    it('bliver ved med at matche den parser der læser mærkatet tilbage', () => {
        const SOURCE_RE = /\s*\((?:grp|gruppe|group)\s*\d+[^)]*\)\s*$/i;
        const csvLine = `Anna (${groupShortName('Group 3')} - Klima)`;
        expect(SOURCE_RE.test(csvLine)).toBe(true);
        expect(csvLine.replace(SOURCE_RE, '')).toBe('Anna');
    });

    it('tåler tomt og manglende input', () => {
        expect(groupShortName(null)).toBe('');
        expect(groupShortName(undefined)).toBe('');
        expect(groupShortName('')).toBe('');
    });
});

describe('brokenSeparations — holdt undgåelsen i de grupper der står der nu?', () => {
    // Undgåelsen er en BLØD regel i motoren, og der er flere veje uden om den
    // bagefter: læreren flytter selv en elev, begge er låst i samme gruppe
    // (så dropper generation.js reglen tavst), eller en gemt session kommer
    // ind fra dengang undgåelsen ikke fandtes. Tjekket måler derfor på
    // grupperne, ikke på reglerne.
    const cls = () => ([
        { _rowId: 'r1', Navn: 'Anna' },
        { _rowId: 'r2', Navn: 'Bo' },
        { _rowId: 'r3', Navn: 'Carl' },
        { _rowId: 'r4', Navn: 'Dorte' },
    ]);
    const byId = () => buildStudentIndex(cls());
    const avoid = [{ ids: ['r1', 'r2'] }];

    it('siger intet når de to står i hver sin gruppe', () => {
        const groups = [
            { name: 'Gruppe 1', members: ['r1', 'r3'] },
            { name: 'Gruppe 2', members: ['r2', 'r4'] },
        ];
        expect(brokenSeparations(groups, avoid, byId())).toEqual([]);
    });

    it('finder de to når de er endt sammen', () => {
        const groups = [
            { name: 'Gruppe 1', members: ['r1', 'r2'] },
            { name: 'Gruppe 2', members: ['r3', 'r4'] },
        ];
        const broken = brokenSeparations(groups, avoid, byId());
        expect(broken).toHaveLength(1);
        expect(broken[0].groupName).toBe('Gruppe 1');
        expect(broken[0].ids).toEqual(['r1', 'r2']);
        expect(broken[0].locked).toBe(false);
    });

    it('melder også en LÅST gruppe — det er netop dér generation.js tier', () => {
        const groups = [{ name: 'Gruppe 1', locked: true, members: ['r1', 'r2'] }];
        expect(brokenSeparations(groups, avoid, byId())[0].locked).toBe(true);
    });

    it('medlemmer kan være objekter med id og navn', () => {
        const groups = [{ name: 'Gruppe 1', members: [{ id: 'r1', name: 'Anna' }, { id: 'r2', name: 'Bo' }] }];
        expect(brokenSeparations(groups, avoid, byId())).toHaveLength(1);
    });

    it('en fraværende elev er ikke i lokalet og udløser ingen advarsel', () => {
        const data = cls();
        data[1]._excluded = true;
        const groups = [{ name: 'Gruppe 1', members: ['r1', 'r2'] }];
        expect(brokenSeparations(groups, avoid, buildStudentIndex(data))).toEqual([]);
    });

    it('et spøgelse (slettet elevrække) tæller heller ikke med', () => {
        const data = cls().filter(s => s._rowId !== 'r2');
        const groups = [{ name: 'Gruppe 1', members: ['r1', 'r2'] }];
        expect(brokenSeparations(groups, avoid, buildStudentIndex(data))).toEqual([]);
    });

    it('tre elever i samme undgåelse meldes som ét brud pr. gruppe', () => {
        const groups = [
            { name: 'Gruppe 1', members: ['r1', 'r2', 'r3'] },
            { name: 'Gruppe 2', members: ['r4'] },
        ];
        const broken = brokenSeparations(groups, [{ ids: ['r1', 'r2', 'r3'] }], byId());
        expect(broken).toHaveLength(1);
        expect(broken[0].ids).toEqual(['r1', 'r2', 'r3']);
    });

    it('samme undgåelse brudt i to grupper giver to poster', () => {
        const groups = [
            { name: 'Gruppe 1', members: ['r1', 'r2'] },
            { name: 'Gruppe 2', members: ['r3', 'r4'] },
        ];
        const broken = brokenSeparations(groups, [{ ids: ['r1', 'r2'] }, { ids: ['r3', 'r4'] }], byId());
        expect(broken.map(b => b.groupName)).toEqual(['Gruppe 1', 'Gruppe 2']);
    });

    it('en undgåelse med under to id\'er er ingen undgåelse', () => {
        const groups = [{ name: 'Gruppe 1', members: ['r1', 'r2'] }];
        expect(brokenSeparations(groups, [{ ids: ['r1'] }], byId())).toEqual([]);
        expect(brokenSeparations(groups, [{ ids: ['r1', 'r1'] }], byId())).toEqual([]);
    });

    it('tåler tomme og forkerte input', () => {
        expect(brokenSeparations(null, null)).toEqual([]);
        expect(brokenSeparations([], [{ ids: ['r1', 'r2'] }])).toEqual([]);
        expect(brokenSeparations([{ name: 'G', members: null }], [{ ids: ['r1', 'r2'] }])).toEqual([]);
        expect(brokenSeparations([{ name: 'G', members: ['r1', 'r2'] }], [{}])).toEqual([]);
    });

    it('uden opslagskort tælles alle medlemmer med', () => {
        const groups = [{ name: 'Gruppe 1', members: ['r1', 'r2'] }];
        expect(brokenSeparations(groups, avoid)).toHaveLength(1);
    });
});

describe('splitByLockedGroups — hvem holder generering egentlig fri?', () => {
    // Hintet "N grupper låst (X elever). Generering rører kun de Y øvrige"
    // regnede før på g.members.length. Tre slags medlemmer ser ens ud der,
    // men kun én af dem er en elev generering holder fri.
    const cls = () => ([
        { _rowId: 'r1', Navn: 'Anna' },
        { _rowId: 'r2', Navn: 'Bo' },
        { _rowId: 'r3', Navn: 'Carl' },
        { _rowId: 'r4', Navn: 'Dorte' },
    ]);

    it('deler tilstedeværende elever i låste og frie', () => {
        const r = splitByLockedGroups(cls(), [{ locked: true, members: ['r1', 'r2'] }]);
        expect(r.presentCount).toBe(4);
        expect(r.lockedCount).toBe(2);
        expect(r.freeCount).toBe(2);
        expect([...r.freeIds].sort()).toEqual(['r3', 'r4']);
    });

    it('en FRAVÆRENDE elev i en låst gruppe er ikke en låst elev', () => {
        // Den gamle regnemåde: members.length = 2 låste, total (uden fraværende)
        // = 3 → kun 1 fri. I virkeligheden er både Carl og Dorte frie.
        const data = cls();
        data[1]._excluded = true;                       // Bo er fraværende
        const r = splitByLockedGroups(data, [{ locked: true, members: ['r1', 'r2'] }]);
        expect(r.presentCount).toBe(3);
        expect(r.lockedCount).toBe(1);                  // kun Anna
        expect(r.freeCount).toBe(2);                    // Carl + Dorte
    });

    it('et spøgelse efter en slettet elev tæller ikke som låst', () => {
        const r = splitByLockedGroups(cls(), [
            { locked: true, members: ['r1', { id: 'r99', name: 'Slettet Elev' }] },
        ]);
        expect(r.lockedCount).toBe(1);
        expect(r.freeCount).toBe(3);
    });

    it('summen går altid op — fri + låst kan ikke overstige de tilstedeværende', () => {
        // Netop dét gjorde "de -1 øvrige elever" mulig før. Selv med lutter
        // fraværende og spøgelser i den låste gruppe bliver differencen aldrig negativ.
        const data = cls();
        data.forEach(s => { s._excluded = true; });
        const r = splitByLockedGroups(data, [
            { locked: true, members: ['r1', 'r2', 'r3', 'r4', { id: 'r99', name: 'Væk' }] },
        ]);
        expect(r.presentCount).toBe(0);
        expect(r.lockedCount).toBe(0);
        expect(r.freeCount).toBe(0);
        expect(r.freeCount + r.lockedCount).toBe(r.presentCount);
    });

    it('medlemmer som {id, name}-objekter genkendes som elever', () => {
        const r = splitByLockedGroups(cls(), [
            { locked: true, members: [{ id: 'r1', name: 'Anna' }] },
        ]);
        expect(r.lockedCount).toBe(1);
    });

    it('ingen låste grupper: alle tilstedeværende er frie', () => {
        const r = splitByLockedGroups(cls(), []);
        expect(r.freeCount).toBe(4);
        expect(r.lockedCount).toBe(0);
    });

    it('freeIds bruges til at måle et undgå-sæt mod de elever der faktisk fordeles', () => {
        // Adskil-hintet talte før sep.ids.length rå. Er én af de fire
        // fraværende og én låst, er det kun to elever generering skal skille ad.
        const data = cls();
        data[3]._excluded = true;                       // Dorte er fraværende
        const { freeIds } = splitByLockedGroups(data, [{ locked: true, members: ['r3'] }]);
        const sep = ['r1', 'r2', 'r3', 'r4'];
        expect(sep.filter(id => freeIds.has(id))).toEqual(['r1', 'r2']);
    });

    it('tåler tom/manglende input', () => {
        expect(splitByLockedGroups(null, null).presentCount).toBe(0);
        expect(splitByLockedGroups([], undefined).freeCount).toBe(0);
        expect(splitByLockedGroups(cls(), [{ locked: true }]).lockedCount).toBe(0);
    });
});


describe('isMemberAbsent — én kilde til "er eleven her?"', () => {
    const data = [
        { _rowId: 'r1', Navn: 'Anna' },
        { _rowId: 'r2', Navn: 'Bo', _excluded: true },
    ];

    it('siger nej om en elev der er til stede', () => {
        expect(isMemberAbsent('r1', data)).toBe(false);
    });

    it('siger ja om en elev der er markeret fraværende', () => {
        expect(isMemberAbsent('r2', data)).toBe(true);
    });

    it('læser også et medlem der er gemt som objekt', () => {
        expect(isMemberAbsent({ id: 'r2', name: 'Bo' }, data)).toBe(true);
    });

    // Et spøgelse er en slettet elevrække — en anden tilstand med sin egen
    // markering. Der er ingen række at spørge, så svaret er nej.
    it('kalder ikke et spøgelse fraværende', () => {
        expect(isMemberAbsent({ id: 'r9', name: 'Dorte' }, data)).toBe(false);
    });

    it('tåler at klassen mangler', () => {
        expect(isMemberAbsent('r1', null)).toBe(false);
        expect(isMemberAbsent('r1', undefined)).toBe(false);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// homeGroupFingerprint — driver hintet "matrixen passer ikke længere"
//
// Matrixen dannes PÅ TVÆRS af stamgrupperne, så den bliver skæv, hvis
// stamgrupperne ændrer sig bagefter. Aftrykket skal fange præcis DE
// ændringer der skævvrider den — og ikke andet, for et hint man lærer at
// klikke væk, er værre end intet hint.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('homeGroupFingerprint', () => {
    const lockSplitGroups = () => ([
        { name: 'Group 1', topic: 'Liberalisme', locked: false, members: ['r1', 'r2'] },
        { name: 'Group 2', topic: 'Konservatisme', locked: false, members: ['r3', 'r4'] },
    ]);

    it('er uændret når intet er ændret', () => {
        expect(homeGroupFingerprint(lockSplitGroups())).toBe(homeGroupFingerprint(lockSplitGroups()));
    });

    it('ændrer sig når en elev flyttes mellem stamgrupper', () => {
        const before = homeGroupFingerprint(lockSplitGroups());
        const g = lockSplitGroups();
        g[0].members = ['r1'];
        g[1].members = ['r3', 'r4', 'r2'];
        expect(homeGroupFingerprint(g)).not.toBe(before);
    });

    // Med matrix-strategien "Emner" ER emnet kildeværdien, så to grupper der
    // bytter emne skævvrider matrixen præcis som en flyttet elev.
    it('ændrer sig når to groups bytter emne', () => {
        const before = homeGroupFingerprint(lockSplitGroups());
        const g = lockSplitGroups();
        g[0].topic = 'Konservatisme';
        g[1].topic = 'Liberalisme';
        expect(homeGroupFingerprint(g)).not.toBe(before);
    });

    // DET HER er den vigtige: en lås ændrer ikke hvem der står i gruppen, så
    // matrixen er lige så gyldig bagefter. Talte låsen med, ville et tryk på
    // hængelåsen advare om en skævhed der ikke findes.
    it('ændrer sig IKKE når en gruppe låses', () => {
        const before = homeGroupFingerprint(lockSplitGroups());
        const g = lockSplitGroups();
        g[0].locked = true;
        expect(homeGroupFingerprint(g)).toBe(before);
    });

    it('ser forskel på rækkefølgen af medlemmer inden for en gruppe', () => {
        // En omrokering inden for samme gruppe ændrer ikke matrixen, men
        // aftrykket er bevidst simpelt: hellere ét hint for meget i et
        // hjørnetilfælde end at bygge en sorteret sammenligning, der kan
        // drive fra den rigtige kildeberegning i generation.js.
        const g = lockSplitGroups();
        g[0].members = ['r2', 'r1'];
        expect(homeGroupFingerprint(g)).not.toBe(homeGroupFingerprint(lockSplitGroups()));
    });

    it('håndterer tom liste og null', () => {
        expect(homeGroupFingerprint([])).toBe('');
        expect(homeGroupFingerprint(null)).toBe('');
        expect(homeGroupFingerprint(undefined)).toBe('');
    });

    it('læser id-værdien ud af objekt-medlemmer (spøgelser) som af rene strenge', () => {
        const a = [{ name: 'G', topic: null, members: ['r1', 'r2'] }];
        const b = [{ name: 'G', topic: null, members: [{ id: 'r1', name: 'Anna' }, 'r2'] }];
        expect(homeGroupFingerprint(a)).toBe(homeGroupFingerprint(b));
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tal-tolkningen — den SKAL sige det samme som motoren
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('cellIsNumber', () => {
    it('læser danske tal, inkl. komma som decimaltegn', () => {
        for (const v of ['7', '7,5', '-3', '02', '00', '12.', ' 7 ', '+ 5', '- 5']) {
            expect(cellIsNumber(v), v).toBe(true);
        }
    });

    // "1e3" var 1000 i appen og tekst i motoren til 13/11 2026 (og "2e2" kan
    // være et holdnavn). Nu læser appen med motorens egen funktion.
    it('læser ikke eksponent-skrivemåden som et tal (motoren gør heller ikke)', () => {
        for (const v of ['1e3', '2E2', '1,5e2']) {
            expect(cellIsNumber(v), v).toBe(false);
        }
    });

    it('siger nej til tekst, tomt og halve tal', () => {
        for (const v of ['ukendt', 'fritaget', '-', '7%', '', '  ', null, undefined]) {
            expect(cellIsNumber(v), String(v)).toBe(false);
        }
    });

    // Number() og Pythons float() er ikke enige af sig selv: JS læser "0x1A"
    // som 26 og afviser "nan", Python gør præcis det modsatte. Er de to sider
    // uenige, kan hintet i skærmen sige ét og motoren gøre noget andet på
    // netop den kolonne, hintet handler om.
    it('afviser nan og inf — som Pythons scoring._numeric_val gør efter rettelsen', () => {
        for (const v of ['nan', 'NaN', 'inf', '-inf', 'Infinity']) {
            expect(cellIsNumber(v), v).toBe(false);
        }
    });

    it('afviser hex og understreger, som Python ikke kan læse', () => {
        expect(cellIsNumber('0x1A')).toBe(false);
        expect(cellIsNumber('1_0')).toBe(false);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// cellNumber — samme tolkning som cellIsNumber, men med tallet med
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('cellNumber', () => {
    // Fundet på gruppekortet: `parseFloat("7,5")` er 7, fordi kommaet stopper
    // læsningen. En klasse med karaktererne 7,5 og 2,5 fik derfor "Snit: 4,5"
    // på kortet, mens motoren havde balanceret på 5,0.
    it('læser kommaet som decimaltegn — dét parseFloat ikke gør', () => {
        expect(cellNumber('7,5')).toBe(7.5);
        expect(cellNumber('7.5')).toBe(7.5);
        expect(cellNumber('-3,25')).toBe(-3.25);
        // Kontrasten selv, så det står sort på hvidt hvorfor helperen findes.
        expect(parseFloat('7,5')).toBe(7);
    });

    it('tager ikke det halve af en celle med tekst i — dét gør parseFloat', () => {
        expect(cellNumber('7 dage')).toBe(null);
        expect(cellNumber('7%')).toBe(null);
        expect(parseFloat('7 dage')).toBe(7);
    });

    it('giver null for tomt, tekst, nan og inf', () => {
        for (const v of ['', '   ', null, undefined, 'fritaget', 'nan', 'Infinity', '0x1A']) {
            expect(cellNumber(v), String(v)).toBe(null);
        }
    });

    it('er enig med cellIsNumber om hver eneste celle', () => {
        const samples = ['7', '7,5', '02', '', 'syg', 'nan', '1e3', '-3', '0x1A', '7 dage'];
        for (const v of samples) {
            expect(cellIsNumber(v), v).toBe(cellNumber(v) !== null);
        }
    });
});

describe('compareCellValues — elevtabellens sortering', () => {
    // Hjælper: sortér stigende, som displayData i StudentTable.vue gør.
    const asc = (vals) => [...vals].sort(compareCellValues);

    it('sorterer tal som tal, også med dansk komma', () => {
        expect(asc(['10', '7,5', '-3', '02', '7,25']))
            .toEqual(['-3', '02', '7,25', '7,5', '10']);
    });

    it('holder tekst efter tal og i dansk alfabetisk orden', () => {
        expect(asc(['Ømer', '10', 'Anna', '-3']))
            .toEqual(['-3', '10', 'Anna', 'Ømer']);
    });

    // Regressionen: parseFloat læste begge numre som tallet 20, svarede "ens",
    // og lod rækkerne stå som de stod. Kolonnen så sorteret ud uden at være det.
    it('sorterer et telefonnummer på hele nummeret, ikke på de to første cifre', () => {
        expect(asc(['20 99 99 99', '20 11 11 11', '12 34 56 78', '40 00 00 01']))
            .toEqual(['12 34 56 78', '20 11 11 11', '20 99 99 99', '40 00 00 01']);
    });

    // Samme fejl, den anden vej: et elevnummer med bindestreg er ikke et tal.
    it('sorterer et sagsnummer på hele strengen', () => {
        expect(asc(['2024-12', '2024-3', '2023-9']))
            .toEqual(['2023-9', '2024-3', '2024-12']);
    });

    it('lægger tomme celler forrest', () => {
        expect(asc(['7', '', 'Fritaget'])).toEqual(['', '7', 'Fritaget']);
    });

    it('behandler null og undefined som tomme celler', () => {
        expect(compareCellValues(null, '')).toBe(0);
        expect(compareCellValues(undefined, '')).toBe(0);
    });

    // Tabellen og gruppekortets snit skal læse den SAMME celle ens — det var
    // netop dét, parseFloat brød (GroupCard.vue fik rettelsen i august 2026).
    // En celle cellNumber afviser, må aldrig sorteres på en talværdi: den skal
    // give præcis det collatoren giver.
    it('sorterer aldrig en ikke-talcelle på en talværdi', () => {
        const collator = new Intl.Collator('da', { numeric: true });
        const samples = ['syg', 'nan', '0x1A', '7 dage', '20 11 11 11',
                         '01-09-2026', '1.g', 'Fritaget'];
        for (const v of samples) {
            expect(cellNumber(v), v).toBe(null);
            expect(compareCellValues(v, '5'), v).toBe(collator.compare(v, '5'));
        }
    });
});

describe('columnNumericStats', () => {
    const rows = (vals) => vals.map(v => ({ K: v }));

    it('tæller kun de UDFYLDTE celler', () => {
        const { numeric, filled } = columnNumericStats(rows(['7', '', '  ', 'syg']), 'K');
        expect({ numeric, filled }).toEqual({ numeric: 1, filled: 2 });
    });

    it('giver op til tre FORSKELLIGE eksempler på det der ikke er tal', () => {
        // Skriver 18 elever "ukendt", hjælper det ingen at se det tre gange.
        expect(columnNumericStats(rows(Array(18).fill('ukendt')), 'K').examples)
            .toEqual(['ukendt']);
        expect(columnNumericStats(rows(['a', 'b', 'c', 'd']), 'K').examples)
            .toEqual(['a', 'b', 'c']);
    });

    it('er robust over for tom kolonne og manglende rækker', () => {
        expect(columnNumericStats([], 'K')).toEqual({ numeric: 0, filled: 0, examples: [] });
        expect(columnNumericStats(null, 'K')).toEqual({ numeric: 0, filled: 0, examples: [] });
        expect(columnNumericStats(rows(['7']), '')).toEqual({ numeric: 0, filled: 0, examples: [] });
    });
});

describe('columnIsNumeric', () => {
    const rows = (vals) => vals.map(v => ({ K: v }));

    // Hed engang "har kolonnen overhovedet ét tal?", og så kunne én elev, der
    // skrev "3" i stedet for "Middel", slukke både advarslen og knappen
    // "Ranger værdierne…" for hele klassen. Samme flertals-tærskel som
    // logic.column_has_numbers i motoren.
    it('én talcelle i en tekstkolonne gør den ikke til en talkolonne', () => {
        const vals = Array(23).fill('Middel');
        vals[5] = '3';
        expect(columnIsNumeric(rows(vals), 'K')).toBe(false);
    });

    it('flertal af tal ER en talkolonne — resten regnes som ikke udfyldt', () => {
        expect(columnIsNumeric(rows([...Array(20).fill('7'), ...Array(4).fill('fritaget')]), 'K'))
            .toBe(true);
    });

    it('præcis halvdelen er ikke et flertal', () => {
        expect(columnIsNumeric(rows([...Array(12).fill('7'), ...Array(12).fill('syg')]), 'K'))
            .toBe(false);
    });

    it('tomme celler tæller ikke med i regnestykket', () => {
        expect(columnIsNumeric(rows(['7', '8', '9', 'syg', ...Array(20).fill('')]), 'K'))
            .toBe(true);
    });

    it('en helt tom kolonne er ikke en talkolonne', () => {
        expect(columnIsNumeric(rows(Array(10).fill('')), 'K')).toBe(false);
    });
});

// memberIdStr lå tidligere i en ordret kopi i placement.js, og de eneste
// tests for den stod dér. Kopien er væk (efternøler-gennemsynet 2026-09-01);
// testene flyttede med hjem til originalen.
describe('memberIdStr', () => {
    it('klarer tekst-id\'er, objekter og fjerner mellemrum', () => {
        expect(memberIdStr(' Anna ')).toBe('Anna');
        expect(memberIdStr({ id: 'Bob' })).toBe('Bob');
        expect(memberIdStr({ name: 'Carl' })).toBe('Carl'); // ghost without id
        expect(memberIdStr({ id: ' Dina ', name: 'X' })).toBe('Dina');
    });
});

describe('setupSignature', () => {
    const cls = () => ({
        settings: { groupTarget: 4, groupMod: '+' },
        rules: [{ type: 'distribute', column: 'Køn', value: '' }],
        togetherGroups: [{ ids: ['r2', 'r1'] }], separations: [], topics: ['A'],
        data: [{ _rowId: 'r1' }, { _rowId: 'r2', _excluded: true }],
    });

    it('er ens for samme opsætning og skifter, når noget ændres', () => {
        const base = setupSignature(cls(), false, 'size');
        expect(setupSignature(cls(), false, 'size')).toBe(base);
        const changed = [
            (c) => { c.settings.groupTarget = 5; },
            (c) => { c.rules[0].column = 'Niveau'; },
            (c) => { c.rules.push({ type: 'cluster', column: 'X' }); },
            (c) => { c.togetherGroups = []; },
            (c) => { c.topics = []; },
            (c) => { c.data[1]._excluded = false; },
        ];
        for (const edit of changed) {
            const c = cls(); edit(c);
            expect(setupSignature(c, false, 'size')).not.toBe(base);
        }
        expect(setupSignature(cls(), false, 'number')).not.toBe(base);
    });

    // Matrix-runden: valget emne/stamgruppe og Undgå hinanden hører med
    // (begge sendes til motoren i matrix); Skal sammen og emnelisten gør ikke.
    it('matrix: skifter med kilden og med Undgå hinanden, ikke med Skal sammen og emnelisten', () => {
        const matrix = () => ({
            ...cls(),
            matrixRules: [{ type: 'distribute', column: 'Køn' }],
            matrixSettings: { groupTarget: 4, groupMod: '+', matrixStrategy: 'full_strict', matrixRepresentationType: 'group' },
        });
        const base = setupSignature(matrix(), true, 'size');
        expect(setupSignature(matrix(), true, 'size')).toBe(base);
        const changed = [
            (c) => { c.matrixSettings.matrixRepresentationType = 'topic'; },
            (c) => { c.matrixSettings.matrixStrategy = 'count'; },
            (c) => { c.separations = [{ ids: ['r1', 'r2'] }]; },
            (c) => { c.matrixRules = []; },
        ];
        for (const edit of changed) {
            const c = matrix(); edit(c);
            expect(setupSignature(c, true, 'size')).not.toBe(base);
        }
        const same = [
            (c) => { c.togetherGroups = []; },
            (c) => { c.topics = ['B', 'C']; },
            (c) => { c.rules = []; },
        ];
        for (const edit of same) {
            const c = matrix(); edit(c);
            expect(setupSignature(c, true, 'size')).toBe(base);
        }
        // Uden et gemt valg er kilden "emne" (som i motorens input).
        const unset = matrix(); delete unset.matrixSettings.matrixRepresentationType;
        const topic = matrix(); topic.matrixSettings.matrixRepresentationType = 'topic';
        expect(setupSignature(unset, true, 'size')).toBe(setupSignature(topic, true, 'size'));
    });
});

// Undgåelser og aftaler gemte før deres id'er `.sort()`et. Med "r1", "r2", …
// faldt det tilfældigvis sammen med elevlistens orden, så beskeden læste
// "Anna og Bo". Med tilfældige id'er var den sammenhæng væk, og de samme to
// elever kunne stå i vilkårlig orden fra gang til gang.
describe('orderIdsByRow', () => {
    const data = [
        { Navn: 'Anna', [ROW_ID]: 'r-ffff000000000001' },
        { Navn: 'Bo', [ROW_ID]: 'r-0000000000000002' },
        { Navn: 'Cecilie', [ROW_ID]: 'r-8888000000000003' },
    ];

    it('følger elevlisten, ikke id-ets alfabet', () => {
        const ids = ['r-8888000000000003', 'r-0000000000000002', 'r-ffff000000000001'];
        expect(orderIdsByRow(ids, data))
            .toEqual(['r-ffff000000000001', 'r-0000000000000002', 'r-8888000000000003']);
    });

    it('ukendte id-er lægges bagest i den orden de kom i', () => {
        const ids = ['ukendt-b', 'r-0000000000000002', 'ukendt-a'];
        expect(orderIdsByRow(ids, data))
            .toEqual(['r-0000000000000002', 'ukendt-b', 'ukendt-a']);
    });

    it('rører ikke listen den fik', () => {
        const ids = ['r-8888000000000003', 'r-ffff000000000001'];
        orderIdsByRow(ids, data);
        expect(ids).toEqual(['r-8888000000000003', 'r-ffff000000000001']);
    });

    it('tåler tomt input', () => {
        expect(orderIdsByRow(null, null)).toEqual([]);
    });
});

import { columnsOfRows } from './utils.js';

describe('columnsOfRows — kolonnerne fra ALLE rækker', () => {
    it('første række bestemmer rækkefølgen, de andre lægger kun til', () => {
        expect(columnsOfRows([
            { Navn: 'Anna', Køn: 'K' },
            { Karakter: '7', Navn: 'Bo', Køn: 'M' },
        ])).toEqual(['Navn', 'Køn', 'Karakter']);
    });

    it('tåler tomme lister og rækker, der ikke er objekter', () => {
        expect(columnsOfRows([])).toEqual([]);
        expect(columnsOfRows(null)).toEqual([]);
        expect(columnsOfRows([null, { Navn: 'Anna' }])).toEqual(['Navn']);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "å" som ét tegn eller som a + ring (NFC/NFD)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('nfc, valueKey og canonicalSpellings', () => {
    const NFC = 'Århus';          // Å som ét tegn
    const NFD = 'Århus';         // A + kombinerende ring

    it('de to former er forskellige tekster, til nfc() har været forbi', () => {
        expect(NFC === NFD).toBe(false);
        expect(nfc(NFD)).toBe(NFC);
        expect(nfc(null)).toBe('');
    });

    it('valueKey folder tegnform, mellemrum og store bogstaver', () => {
        expect(valueKey(` ${NFD} `)).toBe(valueKey('århus'));
        expect(valueKey('Dreng')).toBe(valueKey(' dreng '));
        // Accenter foldes IKKE væk: Rørstrøm og Rorstrom er to navne.
        expect(valueKey('Rørstrøm')).not.toBe(valueKey('Rorstrom'));
    });

    it('én værdi pr. nøgle, i den hyppigste stavemåde og altid som ét tegn', () => {
        const rows = [{ By: NFD }, { By: NFD }, { By: NFC }, { By: 'odense' }, { By: 'Odense' }, { By: '' }, {}];
        const m = canonicalSpellings(rows, 'By');
        expect([...m.values()].sort()).toEqual(['Odense', NFC].sort());
        expect(m.get(valueKey(NFD))).toBe(NFC);
    });
});

describe('normalizeCellText — engangs-migrering af gamle klasser', () => {
    it('retter a + ring i celler, men rører hverken interne felter eller en klasse i orden', () => {
        const NFD = 'Århus';
        const data = [
            { _rowId: 'r1', Navn: 'Anna', By: NFD, Tal: 7, _note: NFD },
            { _rowId: 'r2', Navn: 'Bo', By: 'Århus' },
        ];
        expect(normalizeCellText(data)).toBe(1);
        expect(data[0].By).toBe('Århus');
        expect(data[0].Tal).toBe(7);
        expect(data[0]._note).toBe(NFD);
        expect(normalizeCellText(data)).toBe(0);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// newUuid: virker også uden crypto.randomUUID (usikker kontekst, http)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('newUuid', () => {
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    it('giver et v4-id, og to kald giver to forskellige', () => {
        expect(newUuid()).toMatch(UUID_V4);
        expect(newUuid()).not.toBe(newUuid());
    });

    it('falder tilbage til getRandomValues, når randomUUID mangler', () => {
        const original = crypto.randomUUID;
        Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
        try {
            expect(newUuid()).toMatch(UUID_V4);
        } finally {
            Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
        }
    });
});
