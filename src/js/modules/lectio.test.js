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
});
