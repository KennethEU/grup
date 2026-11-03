import { describe, it, expect } from 'vitest';
import { isLectioFormat, extractLectioNames } from './lectio.js';
// Listen er i Lectios eget format (taget fra en rigtig liste), men navnene er
// opdigtede — se testdata/README.md. `?raw` giver filen som tekst.
import LIST from '../../../testdata/lectio_elevliste.txt?raw';
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

    it('stopper ved sidste komma — resten af navnet bliver', () => {
        expect(extractLectioNames('Holm, Anna, 2a SA 04 (2a SA)\nLund, Bo, 2a SA 05 (2a SA)'))
            .toBe('Holm, Anna\nLund, Bo');
    });
});
