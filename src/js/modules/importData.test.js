import { describe, it, expect } from 'vitest';
import { utils } from '../../vendor/xlsx.mjs';
import { compactImportSheet, normalizeImportHeaders, sheetDataCells, readClassText, looksLikeHeaderRow, planPaste } from './importData.js';
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

    it('true og false virker som før (bruges af createClass og testene)', () => {
        expect(readClassText('Anna\nBo', true, 500).headers).toEqual(['Anna']);
        expect(readClassText('Navn\nBo', false, 500).data).toHaveLength(2);
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
