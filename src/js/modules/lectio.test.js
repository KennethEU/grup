import { describe, it, expect, beforeEach } from 'vitest';
import { isLectioFormat, extractLectioNames, readLectio } from './lectio.js';
import { pyBridge } from './py_bridge.js';
// Listen er i Lectios eget format (taget fra en rigtig liste), men navnene er
// opdigtede — se testdata/README.md. `?raw` giver filen som tekst.
import LIST from '../../../testdata/lectio_elevliste.txt?raw';
// Lectios to sider med elevlisten, kopieret af Kenneth 14/11 2026 med navne,
// hold, lokale og initialer skiftet ud (testdata/README.md).
import LESSON from '../../../testdata/lectio_lektion.txt?raw';
import TABLE from '../../../testdata/lectio_laerere_og_elever.txt?raw';
import TABLE_EMPTY_COLS from '../../../testdata/lectio_laerere_og_elever_tomme_kolonner.txt?raw';
const LINES = LIST.trim().split('\n');

describe('isLectioFormat — genkender en liste kopieret fra Lectio', () => {
    it('genkender hele listen', () => {
        expect(isLectioFormat(LIST)).toBe(true);
    });

    // Kopieret fra en browser på Windows kommer linjeskiftene som \r\n, og en
    // markering med musen tager tit en tom linje (eller en tabulator) med
    // foran — sådan så det eksempel ud, læreren sendte.
    it('tåler Windows-linjeskift og tomme linjer foran', () => {
        expect(isLectioFormat('\t\n\n' + LINES.join('\r\n') + '\r\n')).toBe(true);
    });

    it('tåler én linje skrevet til i hånden', () => {
        expect(isLectioFormat([...LINES.slice(0, 9), 'Ny Elev'].join('\n'))).toBe(true);
    });

    it('siger nej til en almindelig Excel-liste', () => {
        expect(isLectioFormat('Navn\tKøn\nAnna Holm\tPige\nMads Ærø\tDreng')).toBe(false);
    });

    // "Hansen, Bo" har et komma — men intet hold bagefter.
    it('siger nej til navne med komma, der ikke er fra Lectio', () => {
        expect(isLectioFormat('Hansen, Bo\nJensen, Ida\nLund, Åse')).toBe(false);
    });

    it('dømmer ikke på én linje alene', () => {
        expect(isLectioFormat(LINES[0])).toBe(false);
    });

    it('en linje med kun holdet er ikke en elev', () => {
        expect(isLectioFormat(', 2Tz 03 (2Tz)\n, 2Tz 11 (2Tz)')).toBe(false);
    });
});

describe('extractLectioNames — kun navnene kommer med', () => {
    const names = extractLectioNames(LIST).split('\n');

    it('giver én linje pr. elev', () => {
        expect(names).toHaveLength(LINES.length);
    });

    it('fjerner holdet og elevnummeret, uanset hvor mange cifre', () => {
        expect(names[0]).toBe('Ali Hassan Yousef');
        expect(names[14]).toBe('Malthe Rønne Toft');         // nr. 101
        expect(names[names.length - 1]).toBe('Zakarias Ploug'); // nr. 263
        expect(names.some(n => /2Tz|\(|,/.test(n))).toBe(false);
    });

    it('bevarer mellemnavne, bindestreg og æøå', () => {
        expect(names).toContain('Esther Kamille Bach Winther');
        expect(names).toContain('Silje Anne-Marie Holt');
        expect(names).toContain('Åse Hjort Kappel');
        expect(names).toContain('Wilma Æbelø Dalgaard');
    });

    it('fjerner Windows-linjeskift og tomme linjer', () => {
        const fromWindows = extractLectioNames('\t\n' + LINES.join('\r\n') + '\r\n').split('\n');
        expect(fromWindows).toEqual(names);
    });

    // En linje uden hold er skrevet til i hånden — den er en elev, og hun
    // skal med. Genkendelsen tåler netop den (se ovenfor).
    it('beholder en linje skrevet til i hånden', () => {
        const out = extractLectioNames([...LINES.slice(0, 9), 'Ny Elev'].join('\n')).split('\n');
        expect(out).toHaveLength(10);
        expect(out[9]).toBe('Ny Elev');
    });
});

// Et hold kan hedde noget med mellemrum ("2a SA"). Før blev sådan en liste
// ikke genkendt, og holdet kom med ind i navnekolonnen.
describe('Lectio-hold med mellemrum i navnet', () => {
    const SPACED = [
        'Anna Holm, 2a SA 04 (2a SA)',
        'Mads Ærø Lund, 2a SA 12 (2a SA)',
        'Silje Anne-Marie Holt, 2a SA 101 (2a SA)',
    ].join('\n');

    it('genkendes', () => {
        expect(isLectioFormat(SPACED)).toBe(true);
    });

    it('kun navnene kommer med', () => {
        expect(extractLectioNames(SPACED).split('\n'))
            .toEqual(['Anna Holm', 'Mads Ærø Lund', 'Silje Anne-Marie Holt']);
    });

    it('parentesen behøver ikke være ens med holdet foran', () => {
        const mixed = 'Anna Holm, 2a SA 04 (2a)\nBo Lund, 2a SA 05 (2a)';
        expect(isLectioFormat(mixed)).toBe(true);
        expect(extractLectioNames(mixed)).toBe('Anna Holm\nBo Lund');
    });

    it('en linje med kun holdet er stadig ikke en elev', () => {
        expect(isLectioFormat(', 2a SA 03 (2a SA)\n , 2a SA 11 (2a SA)')).toBe(false);
    });

    // Navnet har selv et komma, så det kommer ud i anførselstegn — ellers
    // læser CSV-tolkningen bagefter det som to kolonner (se herunder).
    it('stopper ved sidste komma — resten af navnet bliver', () => {
        expect(extractLectioNames('Holm, Anna, 2a SA 04 (2a SA)\nLund, Bo, 2a SA 05 (2a SA)'))
            .toBe('"Holm, Anna"\n"Lund, Bo"');
    });
});

// Teksten fra extractLectioNames læses som CSV, og CSV-læsningen gætter
// skilletegnet. Før gav én linje "Hansen, Bo" HELE klassen to kolonner:
// "Hansen" i Navn, "Bo" i en ny "Info 1" og en tom "Info 1" hos alle andre.
describe('navne med skilletegn bliver i ét felt hele vejen ind i klassen', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
    });

    const importNames = (text) => {
        const res = pyBridge.createClass('2Tz', extractLectioNames(text), false);
        expect(res.error).toBeUndefined();
        return pyBridge.getClass(res.filename).content;
    };

    it.each([
        ['et komma', 'Hansen, Bo'],
        ['et semikolon', 'Bo; Ida'],
        ['et komma og anførselstegn', 'Holm, Mads "Mini"'],
        ['anførselstegn alene', 'Mads "Mini" Holm'],
    ])('en linje skrevet til i hånden med %s', (_label, name) => {
        for (const text of [LIST.trim() + '\n' + name, name + '\n' + LIST.trim()]) {
            const content = importNames(text);
            expect(content.columns).toEqual(['Navn']);
            expect(content.data).toHaveLength(LINES.length + 1);
            expect(content.data.map(r => r.Navn)).toContain(name);
            expect(content.data.map(r => r.Navn)).toContain('Zakarias Ploug');
        }
    });

    it('en hel Lectio-liste giver præcis navnene i én kolonne', () => {
        const content = importNames(LIST);
        expect(content.columns).toEqual(['Navn']);
        expect(content.data.map(r => r.Navn)).toEqual(extractLectioNames(LIST).split('\n'));
    });
});

// Genkendelsen var før ét mønster med "^.*\S.*" foran holdet. Det var
// kvadratisk i linjens længde (ca. 40 ms pr. ændring i feltet med en indsat
// Excel-liste på 300 × 20 celler). Den nye vej skal give præcis samme svar.
describe('genkendelsen giver samme svar som det gamle mønster', () => {
    const OLD_LINE = /^.*\S.*,\s*[^,()]*\S\s+\d+\s+\([^()]*\S[^()]*\)\s*$/;
    // Små brikker, der netop rammer mønstrets kanter: komma, parenteser,
    // tal, mellemrum, tabulator og bogstaver.
    const PIECES = [',', ', ', '(', ')', ' ', '\t', '0', '12', 'a', 'Bo', '2a SA', ' 04 ', '(2a)', 'Ø'];

    it('på 20.000 tilfældige linjer', () => {
        let seed = 7;
        const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
        for (let i = 0; i < 20000; i++) {
            const parts = Array.from({ length: 1 + rand(12) }, () => PIECES[rand(PIECES.length)]);
            const a = parts.join('');
            const b = a + '\n' + a;
            const oldAnswer = OLD_LINE.test(a.trim());
            expect(isLectioFormat(b), JSON.stringify(a)).toBe(oldAnswer);
        }
    });

    it('en lang linje tager ikke lang tid', () => {
        const long = 'a, b 1 '.repeat(2000);
        const start = performance.now();
        isLectioFormat(long + '\n' + long);
        // Før ca. 600 ms; nu under 1 ms. Grænsen er rummelig, så en travl
        // maskine ikke gør testen rød.
        expect(performance.now() - start).toBeLessThan(100);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lectios to sider (61, Kenneths kopier 14/11 2026). Før blev ingen af dem
// genkendt: lektionssiden gav 44 "elever" med sidens tekst imellem, og
// tabellen "Lærere og elever" gav hele rækken i én celle og læreren som elev.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('Lectios lektionsside og "Lærere og elever"', () => {
    // Facit: tabellens Fornavn + Efternavn for hver "Elev", læst direkte fra
    // filen — ikke gennem koden, der skal testes.
    const EXPECTED = TABLE.split('\n').map(l => l.split('\t'))
        .filter(c => c[0] === 'Elev').map(c => `${c[2]} ${c[3]}`);

    it('facit har 29 elever', () => {
        expect(EXPECTED).toHaveLength(29);
        expect(EXPECTED[0]).toBe('Adam Karim Haddad');
    });

    it.each([
        ['lektionssiden', LESSON],
        ['"Lærere og elever"', TABLE],
        ['"Lærere og elever" med tomme kolonner', TABLE_EMPTY_COLS],
    ])('%s genkendes og giver præcis de 29 navne i samme rækkefølge', (_label, text) => {
        expect(isLectioFormat(text)).toBe(true);
        expect(extractLectioNames(text).split('\n')).toEqual(EXPECTED);
    });

    it('sidens tekst, læreren og holdet kommer ikke med', () => {
        for (const text of [LESSON, TABLE, TABLE_EMPTY_COLS]) {
            const out = extractLectioNames(text);
            expect(out).not.toMatch(/Antal|Tidspunkt|Elever:|Type|Lærer|Mette|menu|Vis |2bx|\u00a0/);
        }
    });

    it('fortæller, hvor mange linjer fra siden der er sprunget over', () => {
        expect(readLectio(LESSON).skipped).toBe(16);   // 13 over listen, 3 under
        expect(readLectio(TABLE).skipped).toBe(6);     // menu (4), læreren, optællingen
    });

    it('lektionssiden med Windows-linjeskift', () => {
        expect(extractLectioNames(LESSON.replace(/\n/g, '\r\n')).split('\n')).toEqual(EXPECTED);
    });

    it('et navn skrevet til i hånden under tabellen kommer med', () => {
        const out = extractLectioNames(TABLE.trim() + '\nNy Elev').split('\n');
        expect(out).toEqual([...EXPECTED, 'Ny Elev']);
    });

    it('et navn skrevet til i hånden før og efter lektionssidens liste kommer med', () => {
        const out = extractLectioNames('Hansen, Bo\n' + LESSON.trim() + '\nNy Elev').split('\n');
        expect(out).toEqual(['"Hansen, Bo"', ...EXPECTED, 'Ny Elev']);
    });

    // (182), 159. gennemsyn: to sider efter hinanden (fx to hold, der skal i
    // grupper sammen). Før blev to lektionssider slet ikke genkendt (90
    // "elever" med "Tidspunkt:" øverst), og to tabeller gav den anden sides
    // menu som elever. Det andet hold er 2a, så testen ikke bygger på dubletter.
    const LESSON_2A = LESSON.replace(/2bx/g, '2a');
    const TABLE_2A = TABLE.replace(/2bx/g, '2a');

    it('to lektionssider efter hinanden giver begge holds elever og intet af siden', () => {
        const read = readLectio(LESSON + '\n' + LESSON_2A);
        expect(read.names).toEqual([...EXPECTED, ...EXPECTED]);
        expect(read.skipped).toBe(32);
    });

    it('to "Lærere og elever" efter hinanden: den andens menu er ikke elever', () => {
        const read = readLectio(TABLE + '\n' + TABLE_2A);
        expect(read.names).toEqual([...EXPECTED, ...EXPECTED]);
        expect(read.skipped).toBe(13);   // 6 + menu (3), overskriften, læreren, optællingen
    });

    // (184), 160. gennemsyn: en tabel og en lektionsside i samme indsæt (to
    // hold, kopieret fra hver sin side). Før gav tabel + lektion 57 navne,
    // 28 med holdet bagefter og den første væk; lektion + tabel mistede alle
    // lektionens 29 elever i stilhed (alt over overskriften var "menu").
    it.each([
        ['tabel + lektionsside', TABLE + '\n' + LESSON_2A],
        ['lektionsside + tabel', LESSON_2A + '\n' + TABLE],
        ['lektionsside + tabel med Windows-linjeskift', (LESSON_2A + '\n' + TABLE).replace(/\n/g, '\r\n')],
    ])('%s giver begge holds elever uden holdet og intet af siderne', (_label, text) => {
        const read = readLectio(text);
        expect(read.names).toEqual([...EXPECTED, ...EXPECTED]);
        expect(read.skipped).toBe(22);   // lektionssiden 16 + tabellen 6
        expect(read.names.join('\n')).not.toMatch(/[(,:]|2a|2bx|menu|Lærer/);
    });

    it('lektion + tabel + lektion: tre hold, alle med', () => {
        const LESSON_3C = LESSON.replace(/2bx/g, '3c');
        const read = readLectio(LESSON_2A + '\n' + TABLE + '\n' + LESSON_3C);
        expect(read.names).toEqual([...EXPECTED, ...EXPECTED, ...EXPECTED]);
        expect(read.skipped).toBe(38);
    });

    it('en elev skrevet til i hånden i lektionssiden før tabellen kommer med', () => {
        const lines = LESSON_2A.split('\n');
        const at = lines.findIndex(l => l.startsWith('Clara'));
        lines.splice(at, 0, 'Ny Elev');
        expect(readLectio(lines.join('\n') + '\n' + TABLE).names).toContain('Ny Elev');
    });

    // Over overskriften står kun en lektionsside, hvis linjerne ligner én
    // (80 %-reglen): to Lectio-agtige linjer i en menu gør ikke menuen til elever.
    it('to Lectio-agtige linjer i menuen over tabellen gør den ikke til elever', () => {
        const menu = ['Anna Holm, 2a 04 (2a)', 'menu', 'Vis kun aktuelle elever', 'Noget andet',
            'Mere menu', 'Bo Lund, 2a 05 (2a)', 'Lærere og elever'];
        const read = readLectio(menu.join('\n') + '\n' + TABLE);
        expect(read.names).toEqual(EXPECTED);
    });

    it('et navn skrevet til i hånden mellem to elever er stadig en elev', () => {
        const lines = LESSON.split('\n');
        const at = lines.findIndex(l => l.startsWith('Clara'));
        lines.splice(at, 0, 'Ny Elev');
        expect(readLectio(lines.join('\n')).names).toContain('Ny Elev');
        // Også to linjer, når de ikke ligner sidens tekst.
        lines.splice(at, 0, 'Anden Elev');
        expect(readLectio(lines.join('\n')).names).toEqual(expect.arrayContaining(['Ny Elev', 'Anden Elev']));
        // Én linje med punktum til sidst (ligner sidens tekst) er også en elev.
        const dot = LESSON.split('\n');
        dot.splice(at, 0, 'Bo Lund Jr.');
        expect(readLectio(dot.join('\n')).names).toContain('Bo Lund Jr.');
    });

    // (185), 161. gennemsyn: lærerens egen liste fra Excel (navn + tabulator
    // + køn) i samme felt som en Lectio-liste. Før blev linjen én elev med
    // tabulatoren i navnet, og ved "Lærere og elever" forsvandt den i stilhed.
    const OWN = 'Ida Lund\tPige\nOle Dam\tDreng';
    it.each([
        ['egen liste over lektionssiden', OWN + '\n' + LESSON, 'before'],
        ['egen liste under lektionssiden', LESSON + '\n' + OWN, 'after'],
        ['egen liste over tabellen', OWN + '\n' + TABLE, 'before'],
        ['egen liste under tabellen', TABLE + '\n' + OWN, 'after'],
        ['egen liste over tabellen med tomme kolonner', OWN + '\n' + TABLE_EMPTY_COLS, 'before'],
    ])('%s: navnet kommer med, og antallet med flere kolonner tælles', (_label, text, where) => {
        const read = readLectio(text);
        const own = ['Ida Lund', 'Ole Dam'];
        expect(read.names).toEqual(where === 'before' ? [...own, ...EXPECTED] : [...EXPECTED, ...own]);
        expect(read.trimmed).toBe(2);
        expect(read.names.join('\n')).not.toMatch(/\t|Pige|Dreng/);
    });

    it('egen liste over tabellen tæller ikke med i "linjer fra Lectios side"', () => {
        expect(readLectio(OWN + '\n' + TABLE).skipped).toBe(readLectio(TABLE).skipped);
    });

    it('egen liste ved Lectios elevliste (kun linjer): navnet uden kolonnerne', () => {
        const read = readLectio(OWN + '\n' + LIST);
        expect(read.names).toEqual(['Ida Lund', 'Ole Dam', ...readLectio(LIST).names]);
        expect(read.trimmed).toBe(2);
    });

    it('en linje med kun kolonnenavne ("Navn" + "Køn") er ikke en elev', () => {
        for (const text of ['Navn\tKøn\n' + OWN + '\n' + LESSON, 'Navn\tKøn\n' + OWN + '\n' + TABLE]) {
            const read = readLectio(text);
            expect(read.names).not.toContain('Navn');
            expect(read.names.slice(0, 2)).toEqual(['Ida Lund', 'Ole Dam']);
        }
    });

    it('en linje med kun ét navn og tomme celler tælles ikke som flere kolonner', () => {
        // Over og under tabellen: før forsvandt den under tabellen (tre celler).
        const above = readLectio('Ida Lund\t\t\n' + TABLE);
        expect(above.names[0]).toBe('Ida Lund');
        expect(above.trimmed).toBe(0);
        const below = readLectio(TABLE + '\nIda Lund\t\t');
        expect(below.names.at(-1)).toBe('Ida Lund');
        expect(below.trimmed).toBe(0);
    });

    it('"Hansen, Bo" er stadig ét navn (kommaet er ikke en kolonne)', () => {
        const read = readLectio('Hansen, Bo\n' + LESSON);
        expect(read.names[0]).toBe('Hansen, Bo');
        expect(read.trimmed).toBe(0);
    });

    it('Lectios egne sider alene har intet med flere kolonner', () => {
        for (const text of [LESSON, TABLE, TABLE_EMPTY_COLS]) expect(readLectio(text).trimmed).toBe(0);
    });

    it('to enlige Lectio-agtige linjer med klokkeslæt imellem er ikke Lectio', () => {
        const text = ['Anna Holm, 2a 04 (2a)', 'Møde kl. 10:09', 'Frokost: 12:00', 'Slut: 15:00',
            'Bo Lund, 2a 05 (2a)'].join('\n');
        expect(isLectioFormat(text)).toBe(false);
    });

    // Lærerens eget regneark med Fornavn og Efternavn, men uden Lectios
    // Type-kolonne, er IKKE fra Lectio og skal læses som før (med kolonner).
    it('et regneark med Fornavn/Efternavn uden Type er ikke Lectio', () => {
        expect(isLectioFormat('Fornavn\tEfternavn\tKøn\nAnna\tHolm\tPige\nBo\tLund\tDreng')).toBe(false);
        expect(isLectioFormat('ID\tFornavn\tEfternavn\n1\tAnna\tHolm\n2\tBo\tLund')).toBe(false);
    });

    // En Excel-liste, hvor to celler tilfældigvis ender som en Lectio-linje,
    // må ikke blive til Lectio: rækkerne mellem dem tæller med i 80 %-reglen.
    it('en Excel-liste med to Lectio-agtige celler midt i er ikke Lectio', () => {
        const rows = ['Navn\tKøn', 'Anna Holm, 2a 04 (2a)\tPige'];
        for (let i = 0; i < 8; i++) rows.push(`Elev ${i}\tDreng`);
        rows.push('Bo Lund, 2a 05 (2a)\tDreng');
        expect(isLectioFormat(rows.join('\n'))).toBe(false);
    });
});

describe('Lectios sider hele vejen ind i klassen', () => {
    beforeEach(() => {
        localStorage.clear();
        pyBridge._invalidateClassesCache();
    });

    it.each([['lektionssiden', LESSON], ['"Lærere og elever"', TABLE], ['tomme kolonner', TABLE_EMPTY_COLS]])(
        '%s giver én kolonne Navn med 29 elever', (_label, text) => {
            const res = pyBridge.createClass('2bx', extractLectioNames(text), false);
            expect(res.error).toBeUndefined();
            const content = pyBridge.getClass(res.filename).content;
            expect(content.columns).toEqual(['Navn']);
            expect(content.data).toHaveLength(29);
            expect(content.data[0].Navn).toBe('Adam Karim Haddad');
            expect(content.data[28].Navn).toBe('Ylva Josefine Rønne Østergaard');
        });

    it('egen liste (Navn + Køn) over tabellen giver én kolonne Navn med 31 elever (185)', () => {
        const text = 'Ida Lund\tPige\nOle Dam\tDreng\n' + TABLE;
        const res = pyBridge.createClass('2bx', extractLectioNames(text), false);
        expect(res.error).toBeUndefined();
        const content = pyBridge.getClass(res.filename).content;
        expect(content.columns).toEqual(['Navn']);
        expect(content.data).toHaveLength(31);
        expect(content.data.slice(0, 2).map(r => r.Navn)).toEqual(['Ida Lund', 'Ole Dam']);
    });

    it('lektionsside (2a) + tabel (2bx) giver én kolonne Navn med 58 elever (184)', () => {
        const text = LESSON.replace(/2bx/g, '2a') + '\n' + TABLE;
        const res = pyBridge.createClass('2a+2bx', extractLectioNames(text), false);
        expect(res.error).toBeUndefined();
        const content = pyBridge.getClass(res.filename).content;
        expect(content.columns).toEqual(['Navn']);
        expect(content.data).toHaveLength(58);
        expect(content.data.some(r => /\(|,/.test(r.Navn))).toBe(false);
    });
});
