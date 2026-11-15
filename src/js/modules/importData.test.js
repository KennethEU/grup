import { describe, it, expect } from 'vitest';
import { utils, read as readWorkbook, write as writeWorkbook } from '../../vendor/xlsx.mjs';
import { compactImportSheet, normalizeImportHeaders, sheetDataCells, readClassText, looksLikeHeaderRow, planPaste, sheetToImportCsv, XLSX_READ_OPTIONS, hiddenSheetParts, hiddenSheetNote, sheetsToOffer, fillMergedCells, mergedCellsNote, sheetToImport } from './importData.js';
import klasse from '../../../testdata/realistisk_klasse.json';

describe('grænserne for indlæsning af regneark', () => {
    it('ignorerer et fuldt Excel-område med kun tre udfyldte celler', () => {
        const sheet = utils.aoa_to_sheet([['Name'], ['Anna'], ['Bo']]);
        sheet['!ref'] = 'A1:XFD1048576';
        const result = compactImportSheet(sheet, utils, 501);
        expect(result['!ref']).toBe('A1:A3');
        expect(utils.sheet_to_csv(result)).toBe('Name\nAnna\nBo');
        expect(sheet['!ref']).toBe('A1:XFD1048576');
    });

    it('bevarer elever efter tomme rækker og kolonner samt talformat, nul og false', () => {
        const sheet = {
            B600: { t: 's', v: 'Name' }, Z600: { t: 's', v: 'Score' },
            B900: { t: 's', v: 'Anna' }, Z900: { t: 'n', v: 0, w: '0,0' },
            B1200: { t: 's', v: 'Bo' }, Z1200: { t: 'b', v: false },
            A1048576: { t: 'z' }, '!ref': 'A1:Z1048576',
        };
        const result = compactImportSheet(sheet, utils, 501);
        expect(result['!ref']).toBe('A1:B3');
        expect(utils.sheet_to_csv(result)).toBe('Name,Score\nAnna,"0,0"\nBo,FALSE');
    });

    it('tom formatering og tomme tekstceller tæller ikke som data', () => {
        expect(sheetDataCells({ A1: { t: 'z' }, B1: { t: 's', v: '  ' }, '!ref': 'A1:B1' })).toEqual([]);
        expect(() => compactImportSheet({}, utils, 501)).toThrow('ingen data');
    });

    it('grænsen tæller faktiske rækker, inklusive en eventuel overskrift', () => {
        const sheet = utils.aoa_to_sheet(Array.from({ length: 502 }, (_, i) => [`Row ${i}`]));
        expect(() => compactImportSheet(sheet, utils, 501)).toThrow('502');
        delete sheet.A502;
        expect(compactImportSheet(sheet, utils, 501)['!ref']).toBe('A1:A501');
        expect(() => compactImportSheet(sheet, utils, 500)).toThrow('501');
    });

    it('bevarer formlers gemte resultat og kolonner med kun en overskrift', () => {
        const sheet = { A1: { t: 's', v: 'Score' }, C1: { t: 's', v: 'Note' },
            A2: { t: 'n', f: '1+1', v: 2 }, '!ref': 'A1:C2' };
        expect(utils.sheet_to_csv(compactImportSheet(sheet, utils, 501))).toBe('Score,Note\n2,');
    });

    it('navne forbliver unikke også når omdøbninger selv kolliderer', () => {
        const input = ['A', 'A', 'A_2', 'A_3', '_rowId', 'Kolonne _rowId', '', 'Uden navn', '__proto__', 'constructor'];
        const output = normalizeImportHeaders(input);
        expect(new Set(output).size).toBe(input.length);
        expect(output).not.toContain('_rowId');
        expect(output).not.toContain('__proto__');
        expect(output).toContain('constructor');
        expect(output[2]).toBe('A_2');
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Importen afgør selv, om første linje er kolonnenavne (Kenneth 15/11 2026:
// et flueben, programmet selv kan regne ud, kan kun ødelægge noget).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('looksLikeHeaderRow og readClassText med "auto"', () => {
    const auto = (text) => readClassText(text, 'auto', 500);

    it('en liste med bare navne: første linje er en elev', () => {
        const r = auto('Anna Holm\nBo Lund\nCarla Dam');
        expect(r.usedHeaders).toBe(false);
        expect(r.headers).toEqual(['Navn']);
        expect(r.data.map(d => d.Navn)).toEqual(['Anna Holm', 'Bo Lund', 'Carla Dam']);
    });

    it('"Navn" øverst er kolonnenavne — også alene i én kolonne', () => {
        expect(auto('Navn\nAnna\nBo').headers).toEqual(['Navn']);
        expect(auto('Navn\nAnna\nBo').data).toHaveLength(2);
        expect(auto('Elevnavn\tKøn\nAnna\tPige\nBo\tDreng').usedHeaders).toBe(true);
    });

    it('engelske kolonnenavne genkendes også ("Name" over én elev)', () => {
        const r = auto('Name\nCSV Student');
        expect(r.usedHeaders).toBe(true);
        expect(r.data.map(d => d.Name)).toEqual(['CSV Student']);
    });

    it('tekst over tal er kolonnenavne', () => {
        const r = auto('Deltager\tPoint\nAnna\t7\nBo\t10\nCarla\t4');
        expect(r.usedHeaders).toBe(true);
        expect(r.headers).toEqual(['Deltager', 'Point']);
    });

    it('et ord over værdier, der går igen, er kolonnenavne', () => {
        const r = auto('Deltager\tSpor\nAnna\tA\nBo\tB\nCarla\tA\nDan\tB\nEva\tA\nFie\tB');
        expect(r.usedHeaders).toBe(true);
        expect(r.data).toHaveLength(6);
    });

    it('uden kolonnenavne: "Anna  Pige" øverst er en elev, fordi "Pige" går igen nedenunder', () => {
        const r = auto('Anna\tPige\nBo\tDreng\nCarla\tPige\nDan\tDreng');
        expect(r.usedHeaders).toBe(false);
        expect(r.data.map(d => d.Navn)).toEqual(['Anna', 'Bo', 'Carla', 'Dan']);
    });

    it('og et tal øverst i en tal-kolonne er en elev', () => {
        expect(auto('Anna\t7\nBo\t10\nCarla\t4').usedHeaders).toBe(false);
    });

    it('én linje alene er en elev', () => {
        expect(auto('Navn').usedHeaders).toBe(false);
        expect(looksLikeHeaderRow([['Navn']])).toBe(false);
    });

    // En titel over listen fra Excel: før kom den med som kolonnenavn, og
    // fordi skilletegnet blev gættet ud fra den, endte hver række i én celle.
    it('en titel over listen springes over, og kolonnerne læses rigtigt', () => {
        const r = auto('Klasse 2bx elevliste\nNavn\tKøn\tNiveau\nAnna Holm\tPige\tHøj\nBo Lund\tDreng\tLav');
        expect(r.headers).toEqual(['Navn', 'Køn', 'Niveau']);
        expect(r.data.map(d => d.Navn)).toEqual(['Anna Holm', 'Bo Lund']);
        expect(r.warnings.join(' ')).toContain('"Klasse 2bx elevliste") er sprunget over');
    });

    it('en elev øverst over rækker uden kolonnenavne springes IKKE over', () => {
        const r = auto('Anna Holm\nBo Lund\tDreng\nCarla Dam\tPige');
        expect(r.data.map(d => d.Navn)).toContain('Anna Holm');
    });

    // 152. gennemsyn: én kolonne, der viser, at første linje er en elev,
    // vinder over et gæt i en anden. Før blev Anna til kolonnenavnene.
    it('uden kolonnenavne: en elev med en værdi, ingen andre har, er stadig en elev', () => {
        const r = auto('Anna Holm\tPige\tSpansk\nBo Ek\tDreng\tTysk\nCe Lund\tPige\tFransk\n'
            + 'Dan Bo\tDreng\tTysk\nEva Ny\tPige\tFransk\nFie Ma\tPige\tTysk\nGo Ra\tDreng\tFransk');
        expect(r.usedHeaders).toBe(false);
        expect(r.data.map(d => d.Navn)).toContain('Anna Holm');
        expect(r.data).toHaveLength(7);
    });

    it('og et tal øverst i en tal-kolonne vinder over et ord, der går igen, i en anden', () => {
        const r = auto('Anna\t7\tSyg\nBo\t10\tA\nCe\t4\tA\nDan\t12\tB\nEva\t2\tB\nFie\t7\tA');
        expect(r.usedHeaders).toBe(false);
        expect(r.data).toHaveLength(6);
    });

    it('den realistiske klasse: med kolonnenavne er de kolonnenavne, uden er første linje en elev', () => {
        // Bemærkning har en celle med linjeskift: den skal i anførselstegn.
        const cell = (v) => /[\t\n"]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
        const toText = (rows) => rows.map(row => klasse.columns.map(c => cell(row[c] ?? '')).join('\t')).join('\n');
        const header = klasse.columns.join('\t');
        const withHeaders = auto(header + '\n' + toText(klasse.rows));
        expect(withHeaders.usedHeaders).toBe(true);
        expect(withHeaders.data).toHaveLength(klasse.rows.length);
        const without = auto(toText(klasse.rows));
        expect(without.usedHeaders).toBe(false);
        expect(without.data).toHaveLength(klasse.rows.length);
    });

    // Kan intet modbevise gættet ("Fritaget" over karakterer), bliver linjen
    // kolonnenavne — men så siges det, også ved en fil, som intet udsnit har.
    it('et gæt uden kendt kolonnenavn giver en advarsel med udvejen', () => {
        const r = auto('Anna Holm\tFritaget\nBo Ek\t7\nCe Lund\t10\nDan Bo\t4');
        expect(r.usedHeaders).toBe(true);
        expect(r.warnings.join(' ')).toContain('Første linje ("Anna Holm", "Fritaget") er læst som kolonnenavne');
        // Et kendt kolonnenavn er ikke et gæt: ingen advarsel.
        expect(auto('Navn\tKarakter\nBo Ek\t7\nCe Lund\t10\nDan Bo\t4').warnings.join(' ')).not.toContain('læst som kolonnenavne');
    });

    it('udvejen virker: "Navn" alene øverst gør Anna til en elev, uden en advarsel om at slette linjen', () => {
        const r = auto('Navn\nAnna Holm\tFritaget\nBo Ek\t7\nCe Lund\t10\nDan Bo\t4');
        expect(r.usedHeaders).toBe(true);
        expect(r.data.map(d => d.Navn)).toEqual(['Anna Holm', 'Bo Ek', 'Ce Lund', 'Dan Bo']);
        expect(r.data[0]['Info 1']).toBe('Fritaget');
        expect(r.warnings.join(' ')).not.toContain('Slet linjen');
        expect(r.warnings.join(' ')).not.toContain('læst som kolonnenavne');
        expect(r.warnings.join(' ')).not.toContain('flere kolonner end overskrifterne');
        // En rigtig titel (ikke et kolonnenavn) giver stadig advarslen.
        expect(readClassText('Klasse 1a\nAnna\tPige\nBo\tDreng\nCe\tPige', true, 500).warnings.join(' ')).toContain('Slet linjen');
    });

    // (173): et kendt kolonnenavn, der også er en af kolonnens egne værdier,
    // er en elevs værdi. Før blev Anna til kolonnenavnene uden en advarsel.
    it('"Student" som værdi: første linje er en elev, når ordet går igen i kolonnen', () => {
        const r = auto('Anna Holm\tStudent\nBo Ek\tKursist\nCe Lund\tStudent\nDan Bo\tKursist\nEva Ny\tKursist');
        expect(r.usedHeaders).toBe(false);
        expect(r.data.map(d => d.Navn)).toEqual(['Anna Holm', 'Bo Ek', 'Ce Lund', 'Dan Bo', 'Eva Ny']);
        // Samme ord i en anden kolonne end sin egen tæller stadig.
        expect(auto('Navn\tStatus\nAnna\tNavn\nBo\tKursist\nCe\tKursist').usedHeaders).toBe(true);
        // Et rigtigt kolonnenavn over værdier, det ikke selv er, er uændret.
        expect(auto('Status\tNavn\nStudent\tAnna\nKursist\tBo\nKursist\tCe').usedHeaders).toBe(true);
    });

    // Rådgiverens fund i 153.: en kopi af kolonnenavnene længere nede (to
    // lister efter hinanden) må ikke tælle som "ordet går igen i kolonnen".
    it('kolonnenavnene gentaget midt i listen er stadig kolonnenavne', () => {
        const r = auto('Navn\tKøn\nAnna\tPige\nBo\tDreng\nCe\tPige\nNavn\tKøn\nDan\tDreng\nEva\tPige');
        expect(r.headers).toEqual(['Navn', 'Køn']);
        expect(r.data[0]).toEqual({ Navn: 'Anna', 'Køn': 'Pige' });
        // Også "Navn" alene øverst og igen længere nede.
        expect(auto('Navn\nAnna Holm\tFritaget\nBo\t7\nNavn\nCe\t10\nDan\t4').data[0].Navn).toBe('Anna Holm');
    });

    // (176), 158. gennemsyn: kopien midt i listen blev før en elev, der hed
    // "Navn" med køn "Køn", uden en advarsel.
    it('en kopi af kolonnenavnene midt i listen bliver ikke en elev, og det siges', () => {
        const r = auto('Navn\tKøn\nAnna\tPige\nBo\tDreng\nCe\tPige\nnavn \tKØN\nDan\tDreng\nEva\tPige');
        expect(r.data.map(d => d.Navn)).toEqual(['Anna', 'Bo', 'Ce', 'Dan', 'Eva']);
        expect(r.warnings.join(' ')).toContain('1 linje længere nede var en kopi af kolonnenavnene');
        // "Navn" alene øverst og igen længere nede.
        const lone = auto('Navn\nAnna Holm\tFritaget\nBo\t7\nNavn\nCe\t10\nDan\t4');
        expect(lone.data.map(d => d.Navn)).toEqual(['Anna Holm', 'Bo', 'Ce', 'Dan']);
    });

    it('en titel gentaget over kolonnenavnene springes også over', () => {
        const r = auto('2bx elevliste\nNavn\tKøn\nAnna\tPige\nBo\tDreng\nCe\tPige\n2bx elevliste\nNavn\tKøn\nDan\tDreng\nEva\tPige');
        expect(r.data.map(d => d.Navn)).toEqual(['Anna', 'Bo', 'Ce', 'Dan', 'Eva']);
        expect(r.warnings.join(' ')).toContain('2 linjer længere nede var kopier af kolonnenavnene eller titlen');
    });

    it('kun nøjagtige kopier af RIGTIGE kolonnenavne springes over', () => {
        // En elev, der ligner kolonnenavnene i én celle, er en elev.
        expect(auto('Navn\tKøn\nAnna\tPige\nNavn\tDreng\nCe\tPige').data).toHaveLength(3);
        // Et ord, der står alene midt i listen uden kolonnenavne under sig, er en elev.
        const t = auto('2bx elevliste\nNavn\tKøn\nAnna\tPige\nBo\tDreng\nCe\tPige\n2bx elevliste\nDan\tDreng');
        expect(t.data.map(d => d.Navn)).toContain('2bx elevliste');
        // Gættede kolonnenavne (ingen kendte ord): en ens elev længere nede bliver.
        const g = readClassText('Anna\tFritaget\nBo\t7\nCe\t10\nAnna\tFritaget\nDan\t4', true, 500);
        expect(g.data).toHaveLength(4);
    });

    // (182), 159. gennemsyn: en ny titel på hver side ("side 2") blev en elev.
    it('en titel med et andet sidetal over kolonnenavnene springes over', () => {
        const r = auto('2bx side 1 af 2\nNavn\tKøn\nAnna\tPige\nBo\tDreng\nCe\tPige\n2bx side 2 af 2\nNavn\tKøn\nDan\tDreng\nEva\tPige');
        expect(r.data.map(d => d.Navn)).toEqual(['Anna', 'Bo', 'Ce', 'Dan', 'Eva']);
        expect(r.warnings.join(' ')).toContain('2 linjer længere nede var kopier af kolonnenavnene eller titlen');
    });

    it('en elev alene med sit navn lige over kopien af kolonnenavnene forsvinder ikke', () => {
        // Med en titel øverst: Ce ligner ikke titlen (bortset fra tal).
        const t = auto('2bx side 1\nNavn\tKøn\nAnna\tPige\nBo\tDreng\nCe\nNavn\tKøn\nDan\tDreng');
        expect(t.data.map(d => d.Navn)).toEqual(['Anna', 'Bo', 'Ce', 'Dan']);
        // Uden en titel øverst springes intet over ud over kopien.
        const n = auto('Navn\tKøn\nAnna\tPige\nBo\tDreng\nCe\nNavn\tKøn\nDan\tDreng');
        expect(n.data.map(d => d.Navn)).toEqual(['Anna', 'Bo', 'Ce', 'Dan']);
        // En linje, der ligner titlen, men har en værdi mere, er en elev.
        const v = auto('2bx side 1\nNavn\tKøn\nAnna\tPige\nBo\tDreng\n2bx side 2\tPige\nNavn\tKøn\nDan\tDreng');
        expect(v.data.map(d => d.Navn)).toContain('2bx side 2');
    });

    // (175): en elev med kun et navn øverst er ikke en titel, når linjen
    // under hende er en elev med "Student" som værdi.
    it('en elev øverst over en elev med "Student" springes ikke over som titel', () => {
        const r = auto('Anna\nBo\tStudent\nCe\tKursist\nDan\tStudent\nEva\tKursist');
        expect(r.data.map(d => d.Navn)).toEqual(['Anna', 'Bo', 'Ce', 'Dan', 'Eva']);
        expect(r.warnings.join(' ')).not.toContain('sprunget over');
        // En rigtig titel over rigtige kolonnenavne springes stadig over.
        expect(auto('Hold 2x\nNavn\tStatus\nBo\tStudent\nCe\tKursist\nDan\tStudent').headers).toEqual(['Navn', 'Status']);
    });

    it('true og false virker som før (bruges af createClass og testene)', () => {
        expect(readClassText('Anna\nBo', true, 500).headers).toEqual(['Anna']);
        expect(readClassText('Navn\nBo', false, 500).data).toHaveLength(2);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Excel-vejen (153. gennemsyn, (172)): en rigtig .xlsx skrives og læses igen
// med importens egne indstillinger, så talformater, datoer og flettede celler
// er, som SheetJS giver dem fra en fil — ikke som aoa_to_sheet lader dem.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('en Excel-fil hele vejen ind i readClassText', () => {
    const viaXlsx = (aoa, tweak) => {
        const sheet = utils.aoa_to_sheet(aoa);
        if (tweak) tweak(sheet);
        const book = utils.book_new();
        utils.book_append_sheet(book, sheet, 'Ark1');
        const back = readWorkbook(writeWorkbook(book, { type: 'array', bookType: 'xlsx' }), XLSX_READ_OPTIONS);
        return readClassText(sheetToImportCsv(back.Sheets.Ark1, utils, 500), 'auto', 500);
    };

    it('en titel i en flettet celle springes over', () => {
        const r = viaXlsx([['Klasse 2bx elevliste'], ['Navn', 'Køn', 'Karakter'], ['Anna', 'Pige', 7], ['Bo', 'Dreng', 10], ['Ce', 'Pige', 4]],
            s => { s['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }]; });
        expect(r.headers).toEqual(['Navn', 'Køn', 'Karakter']);
        expect(r.data.map(d => d.Navn)).toEqual(['Anna', 'Bo', 'Ce']);
    });

    it('en tom række 1 og kolonnenavnene i række 2', () => {
        const r = viaXlsx([[], ['Navn', 'Køn'], ['Anna', 'Pige'], ['Bo', 'Dreng'], ['Ce', 'Pige'], ['Dan', 'Dreng']]);
        expect(r.headers).toEqual(['Navn', 'Køn']);
        expect(r.data).toHaveLength(4);
    });

    it('uden kolonnenavne: tal med talformat "00" og decimaltal holder første elev', () => {
        const r = viaXlsx([['Anna', 7, 7.5], ['Bo', 10, 10.25], ['Ce', 4, 4], ['Dan', 12, 12]],
            s => { for (const k of ['B1', 'B2', 'B3', 'B4']) s[k].z = '00'; });
        expect(r.usedHeaders).toBe(false);
        expect(r.data[0]).toEqual({ Navn: 'Anna', 'Info 1': '07', 'Info 2': '7.5' });
    });

    it('datoer i Excels indbyggede format bliver danske', () => {
        const r = viaXlsx([['Navn', 'Fødselsdag'], ['Anna', new Date(2008, 0, 15)], ['Bo', new Date(2008, 4, 2)], ['Ce', new Date(2007, 11, 1)]]);
        expect(r.data.map(d => d['Fødselsdag'])).toEqual(['15-01-2008', '02-05-2008', '01-12-2007']);
    });

    it('"Student" som værdi i en fil (intet udsnit): ingen elev forsvinder', () => {
        const r = viaXlsx([['Anna Holm', 'Student'], ['Bo', 'Kursist'], ['Ce', 'Student'], ['Dan', 'Kursist'], ['Eva', 'Kursist']]);
        expect(r.data.map(d => d.Navn)).toEqual(['Anna Holm', 'Bo', 'Ce', 'Dan', 'Eva']);
    });

    it('udvejen "Navn" alene øverst virker også i en fil', () => {
        const r = viaXlsx([['Navn'], ['Anna Holm', 'Fritaget'], ['Bo', 7], ['Ce', 10], ['Dan', 4]]);
        expect(r.usedHeaders).toBe(true);
        expect(r.data.map(d => d.Navn)).toEqual(['Anna Holm', 'Bo', 'Ce', 'Dan']);
    });

    // (182), 159. gennemsyn: en fil, hvor hver side har sin titel, sine
    // kolonnenavne og en tom række imellem — ingen udsnit, så en titel, der
    // blev en elev, så læreren først på gruppekortene.
    it('hver side med sin egen titel, kolonnenavne og en tom række imellem', () => {
        const r = viaXlsx([['2bx side 1'], ['Navn', 'Køn'], ['Anna', 'Pige'], ['Bo', 'Dreng'], ['Ce', 'Pige'], [],
            ['2bx side 2'], ['Navn', 'Køn'], ['Dan', 'Dreng'], ['Eva', 'Pige']]);
        expect(r.headers).toEqual(['Navn', 'Køn']);
        expect(r.data.map(d => d.Navn)).toEqual(['Anna', 'Bo', 'Ce', 'Dan', 'Eva']);
    });

    it('titel, kolonnenavne og 500 elever kan importeres; 501 elever kan ikke', () => {
        const sheetOf = n => [['Hold 1x'], ['Navn', 'Køn'], ...Array.from({ length: n }, (_, i) => [`Elev ${i}`, i % 2 ? 'Pige' : 'Dreng'])];
        expect(viaXlsx(sheetOf(500)).data).toHaveLength(500);
        expect(() => viaXlsx(sheetOf(501))).toThrow('503 rækker');
    });
});

describe('planPaste — Lectio uden kolonnenavne, alt andet "auto"', () => {
    it('Lectio: kun navnene og ingen kolonnenavne', () => {
        const plan = planPaste('Anna Holm, 2a 04 (2a)\nBo Lund, 2a 05 (2a)');
        expect(plan.lectio).not.toBeNull();
        expect(plan.content).toBe('Anna Holm\nBo Lund');
        expect(plan.hasHeaders).toBe(false);
    });

    it('alt andet: teksten som den er, og importen afgør kolonnenavnene', () => {
        const plan = planPaste('Navn\tKøn\nAnna\tPige');
        expect(plan.lectio).toBeNull();
        expect(plan.hasHeaders).toBe('auto');
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Skjulte rækker, kolonner og ark (154. gennemsyn, (174)): et ark med hele
// årgangen filtreret til én klasse ser kort ud i Excel, men alle rækker kom
// med uden et ord. Skrives som en rigtig .xlsx og læses med importens egne
// indstillinger — uden cellStyles ser SheetJS slet ikke, hvad der er skjult.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('skjulte rækker, kolonner og ark i en Excel-fil', () => {
    const roundTrip = (book) => readWorkbook(writeWorkbook(book, { type: 'array', bookType: 'xlsx' }), XLSX_READ_OPTIONS);
    const sheetVia = (aoa, tweak) => {
        const sheet = utils.aoa_to_sheet(aoa);
        tweak(sheet);
        const book = utils.book_new();
        utils.book_append_sheet(book, sheet, 'Ark1');
        return roundTrip(book).Sheets.Ark1;
    };
    // Hele årgangen; 2b og 2c er filtreret fra (rækkerne er skjult), og
    // kolonne B (CPR) er skjult.
    const year = [['Navn', 'CPR', 'Klasse'], ['Anna', '010101-0000', '2a'], ['Bo', '020202-0000', '2b'],
        ['Ce', '030303-0000', '2a'], ['Dan', '040404-0000', '2c'], ['Eva', '050505-0000', '2a']];
    const filtered = s => {
        s['!rows'] = []; s['!rows'][2] = { hidden: true }; s['!rows'][4] = { hidden: true };
        // En skjult række og kolonne med kun mellemrum tæller ikke (tom celle).
        s.A10 = { t: 's', v: '  ' }; s['!rows'][9] = { hidden: true };
        s.D2 = { t: 's', v: ' ' }; s['!cols'] = [{}, { hidden: true }, {}, { hidden: true }];
        s['!ref'] = 'A1:D10';
    };

    it('tæller skjulte rækker og kolonner med indhold', () => {
        const sheet = sheetVia(year, filtered);
        expect(hiddenSheetParts(sheet, utils)).toEqual({ rows: 2, columns: ['B'] });
        const note = hiddenSheetNote(sheet, utils);
        expect(note).toContain('2 rækker var skjult eller filtreret fra i Excel');
        expect(note).toContain('Kolonne B var skjult i Excel');
        expect(note).toContain('slet eleverne i elevlisten');
    });

    it('én skjult række: ental hele vejen ("slet eleven", ikke "eleverne")', () => {
        const note = hiddenSheetNote(sheetVia(year, s => { s['!rows'] = []; s['!rows'][2] = { hidden: true }; }), utils);
        expect(note).toBe('1 række var skjult eller filtreret fra i Excel og kom alligevel med i klassen. ' +
            'Skulle den ikke med, så slet den i Excel og importér filen igen, eller slet eleven i elevlisten.');
    });

    it('importen tager dem stadig med (intet forsvinder i stilhed)', () => {
        const sheet = sheetVia(year, filtered);
        const r = readClassText(sheetToImportCsv(sheet, utils, 500), 'auto', 500);
        expect(r.data.map(d => d.Navn)).toEqual(['Anna', 'Bo', 'Ce', 'Dan', 'Eva']);
        expect(r.headers).toEqual(['Navn', 'CPR', 'Klasse']);
    });

    it('intet skjult giver ingen besked, og flere kolonner nævnes alle', () => {
        expect(hiddenSheetNote(sheetVia(year, () => {}), utils)).toBeNull();
        const note = hiddenSheetNote(sheetVia(year, s => { s['!cols'] = [{}, { hidden: true }, { hidden: true }]; }), utils);
        expect(note).toBe('Kolonnerne B og C var skjult i Excel og kom alligevel med. Skulle de ikke med, så slet dem ' +
            'i elevlisten (eller skjul indholdet med højreklik på kolonnenavnet).');
    });

    it('tæller rækkerne efter Excels rækkenumre, ikke efter tomme rækker er pakket væk', () => {
        // Tom række 2 og 3: Bo står i Excels række 5 (indeks 4), men efter
        // pakningen ville han stå i række 3 (indeks 2).
        const sheet = sheetVia([['Navn'], [], [], ['Anna'], ['Bo']], s => { s['!rows'] = []; s['!rows'][4] = { hidden: true }; });
        expect(hiddenSheetParts(sheet, utils).rows).toBe(1);
    });

    it('for mange rækker: beskeden siger, hvor mange der er skjult', () => {
        const aoa = [['Navn', 'Klasse']];
        for (let i = 0; i < 600; i++) aoa.push([`Elev ${i}`, i < 28 ? '2a' : '2b']);
        const sheet = sheetVia(aoa, s => { s['!rows'] = []; for (let r = 29; r <= 600; r++) s['!rows'][r] = { hidden: true }; });
        expect(() => sheetToImportCsv(sheet, utils, 500)).toThrow('601 rækker med indhold (heraf 572 skjult eller filtreret fra i Excel');
        // Uden skjulte rækker er beskeden som før.
        expect(() => sheetToImportCsv(sheetVia(aoa, () => {}), utils, 500)).toThrow(/601 rækker med indhold — flere/);
    });

    it('et skjult ark tilbydes ikke, medmindre kun skjulte ark har data', () => {
        const book = utils.book_new();
        utils.book_append_sheet(book, utils.aoa_to_sheet([['Navn'], ['Anna']]), 'Elever');
        utils.book_append_sheet(book, utils.aoa_to_sheet([['Opslag'], ['x']]), 'Lister');
        utils.book_append_sheet(book, utils.aoa_to_sheet([[]]), 'Tom');
        book.Workbook = { Sheets: [{}, { Hidden: 1 }, {}] };
        expect(sheetsToOffer(roundTrip(book))).toEqual(['Elever']);

        const onlyHidden = utils.book_new();
        utils.book_append_sheet(onlyHidden, utils.aoa_to_sheet([[]]), 'Tom');
        utils.book_append_sheet(onlyHidden, utils.aoa_to_sheet([['Navn'], ['Anna']]), 'Skjult');
        onlyHidden.Workbook = { Sheets: [{}, { Hidden: 1 }] };
        expect(sheetsToOffer(roundTrip(onlyHidden))).toEqual(['Skjult']);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Flettede celler (155. gennemsyn, (177)): "2a" flettet ned over flere elever
// står kun i den øverste celle i filen. Før fik de andre en tom celle uden et
// ord. Cellerne under fletningen bygges som MANGLENDE (null), sådan som Excel
// gemmer dem — ikke som tomme tekstceller.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('flettede celler i en Excel-fil', () => {
    const roundTrip = (book) => readWorkbook(writeWorkbook(book, { type: 'array', bookType: 'xlsx' }), XLSX_READ_OPTIONS);
    const sheetVia = (aoa, merges) => {
        const sheet = utils.aoa_to_sheet(aoa);
        sheet['!merges'] = merges.map(range => utils.decode_range(range));
        const book = utils.book_new();
        utils.book_append_sheet(book, sheet, 'Ark1');
        return roundTrip(book).Sheets.Ark1;
    };
    const importOf = (sheet) => readClassText(sheetToImportCsv(sheet, utils, 500), 'auto', 500);
    const cols = ['Navn', 'Klasse', 'Køn'];

    it('værdien skrives ned i hver elev, fletningen dækker', () => {
        const sheet = sheetVia([cols, ['Anna', '2a', 'Pige'], ['Bo', null, 'Dreng'], ['Ce', null, 'Pige'],
            ['Dan', '2b', 'Dreng'], ['Eva', null, 'Pige']], ['B2:B4', 'B5:B6']);
        expect(sheet.B3).toBeUndefined(); // sådan gemmer filen det
        const r = importOf(sheet);
        expect(r.data.map(d => d.Klasse)).toEqual(['2a', '2a', '2a', '2b', '2b']);
        expect(sheetToImport(sheet, utils, 500).mergedFilled).toBe(3);
        // Arket selv er urørt (hiddenSheetParts tæller på det).
        expect(sheet.B3).toBeUndefined();
    });

    it('en dato beholder sit format, når den skrives ned', () => {
        const sheet = sheetVia([['Navn', 'Født'], ['Anna', new Date(Date.UTC(2008, 0, 15))], ['Bo', null], ['Ce', '01-02-2008']], ['B2:B3']);
        const r = importOf(sheet);
        expect(r.data.map(d => d.Født)).toEqual(['15-01-2008', '15-01-2008', '01-02-2008']);
    });

    it('en titel flettet hen over arket forbliver én titel', () => {
        const sheet = sheetVia([['Elevliste 2a', null, null], cols, ['Anna', '2a', 'Pige'], ['Bo', '2a', 'Dreng']], ['A1:C1']);
        const r = importOf(sheet);
        expect(r.headers).toEqual(cols);
        expect(r.data.map(d => d.Navn)).toEqual(['Anna', 'Bo']);
        expect(fillMergedCells(sheet, utils).filled).toBe(0);
    });

    it('kun nedad i første kolonne: en fletning over to kolonner fylder ikke den anden', () => {
        const sheet = sheetVia([cols, ['Anna', '2a', null], ['Bo', null, null], ['Ce', '2b', 'Pige']], ['B2:C3']);
        const r = importOf(sheet);
        expect(r.data.map(d => [d.Klasse, d.Køn])).toEqual([['2a', ''], ['2a', ''], ['2b', 'Pige']]);
    });

    it('en tom skillelinje inde i fletningen bliver ikke en elev uden navn', () => {
        const sheet = sheetVia([cols, ['Anna', '2a', 'Pige'], [null, null, null], ['Bo', null, 'Dreng']], ['B2:B4']);
        const r = importOf(sheet);
        expect(r.data.map(d => d.Navn)).toEqual(['Anna', 'Bo']);
        expect(r.data.map(d => d.Klasse)).toEqual(['2a', '2a']);
        expect(r.warnings.join(' ')).not.toContain('uden navn');
    });

    it('en celle med indhold under fletningen overskrives aldrig', () => {
        const sheet = sheetVia([cols, ['Anna', '2a', 'Pige'], ['Bo', '2x', 'Dreng'], ['Ce', null, 'Pige']], ['B2:B4']);
        expect(importOf(sheet).data.map(d => d.Klasse)).toEqual(['2a', '2x', '2a']);
    });

    it('en tom øverste celle fylder intet', () => {
        const sheet = sheetVia([cols, ['Anna', null, 'Pige'], ['Bo', null, 'Dreng'], ['Ce', '2b', 'Pige']], ['B2:B3']);
        expect(fillMergedCells(sheet, utils).filled).toBe(0);
        // Kun mellemrum øverst er også tomt (samme regel som sheetDataCells).
        const spaces = sheetVia([cols, ['Anna', '  ', 'Pige'], ['Bo', null, 'Dreng'], ['Ce', '2b', 'Pige']], ['B2:B3']);
        expect(fillMergedCells(spaces, utils).filled).toBe(0);
    });

    it('en formel skrives ned som sit resultat, ikke som formlen', () => {
        const sheet = utils.aoa_to_sheet([cols, ['Anna', 3, 'Pige'], ['Bo', null, 'Dreng']]);
        sheet.B2.f = '1+2';
        sheet['!merges'] = [utils.decode_range('B2:B3')];
        const filled = fillMergedCells(sheet, utils).sheet;
        expect(filled.B3.v).toBe(3);
        expect(filled.B3.f).toBeUndefined();
    });

    it('kolonnenavne over to linjer: "Navn" flettet ned bliver ikke en elev, der hedder "Navn"', () => {
        const aoa = [['Navn', 'Karakter', null], [null, 'Mundtlig', 'Skriftlig'], ['Anna', '7', '10'], ['Bo', '4', '7'], ['Ce', '12', '10']];
        const sheet = sheetVia(aoa, ['A1:A2', 'B1:C1']);
        expect(fillMergedCells(sheet, utils).filled).toBe(0);
        const r = importOf(sheet);
        // Samme resultat som uden fletninger: linje to er (som før) en
        // række uden navn, og det siges.
        const plain = importOf(sheetVia(aoa, []));
        expect(r).toEqual(plain);
        expect(r.data.map(d => d.Navn)).not.toContain('Navn');
        // Også et kolonnenavn, Grupper ikke kender, i arkets øverste linje.
        const own = sheetVia([['Deltager', 'Karakter', null], [null, 'Mundtlig', 'Skriftlig'], ['Anna', '7', '10'], ['Bo', '4', '7']], ['A1:A2', 'B1:C1']);
        expect(fillMergedCells(own, utils).filled).toBe(0);
    });

    it('kolonnenavne over to linjer under en titel: "Navn" skrives heller ikke ned dér', () => {
        const aoa = [['Elevliste 2a', null, null], ['Navn', 'Karakter', null], [null, 'Mundtlig', 'Skriftlig'],
            ['Anna', '7', '10'], ['Bo', '4', '7'], ['Ce', '12', '10']];
        const sheet = sheetVia(aoa, ['A1:C1', 'A2:A3', 'B2:C2']);
        expect(fillMergedCells(sheet, utils).filled).toBe(0);
        const r = importOf(sheet);
        expect(r).toEqual(importOf(sheetVia(aoa, [])));
        expect(r.data.map(d => d.Navn)).not.toContain('Navn');
    });

    it('formaterede tomme celler under fletningen (sådan gemmer Excel en fletning med kant) udfyldes også', () => {
        const sheet = sheetVia([cols, ['Anna', '2a', 'Pige'], ['Bo', null, 'Dreng'], ['Ce', null, 'Pige']], ['B2:B4']);
        sheet.B3 = { t: 'z' };
        sheet.B4 = { t: 'z' };
        expect(importOf(sheet).data.map(d => d.Klasse)).toEqual(['2a', '2a', '2a']);
    });

    it('beskeden', () => {
        expect(mergedCellsNote(0)).toBeNull();
        expect(mergedCellsNote(1)).toContain('1 celle var flettet');
        expect(mergedCellsNote(9)).toBe('9 celler var flettet sammen med cellen ovenover i Excel. ' +
            'Værdien fra den flettede celle er sat ind hos hver elev, den dækker — sådan som det ser ud i Excel.');
    });

    it('.xls læses på samme måde', () => {
        const sheet = utils.aoa_to_sheet([cols, ['Anna', '2a', 'Pige'], ['Bo', null, 'Dreng'], ['Ce', null, 'Pige']]);
        sheet['!merges'] = [utils.decode_range('B2:B4')];
        const book = utils.book_new();
        utils.book_append_sheet(book, sheet, 'Ark1');
        const back = readWorkbook(writeWorkbook(book, { type: 'array', bookType: 'biff8' }), XLSX_READ_OPTIONS).Sheets.Ark1;
        expect(importOf(back).data.map(d => d.Klasse)).toEqual(['2a', '2a', '2a']);
    });
});
