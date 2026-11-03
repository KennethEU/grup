import { describe, it, expect } from 'vitest';
import { utils } from '../../vendor/xlsx.mjs';
import { compactImportSheet, normalizeImportHeaders, sheetDataCells } from './importData.js';

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
