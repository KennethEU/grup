// Afgrænset måling af CSV-konverteringen, ikke XLSX-udpakning eller hele importen.
// Kør fra Grupper-kilden med: node tools/bench_import.mjs
import * as XLSX from '../src/vendor/xlsx.mjs';
import { compactImportSheet } from '../src/js/modules/importData.js';

const sheet = XLSX.utils.aoa_to_sheet([['Name'], ['Anna'], ['Bo']]);
sheet['!ref'] = 'A1:Z20000';
function medianDuration(fn) {
    const times = [];
    for (let i = 0; i < 7; i++) {
        const start = performance.now();
        fn();
        times.push(performance.now() - start);
    }
    return times.sort((a, b) => a - b)[3];
}
console.log(JSON.stringify({
    actualCells: 3,
    originalRangeCells: 520000,
    oldMedianMs: medianDuration(() => XLSX.utils.sheet_to_csv(sheet, { blankrows: false })),
    compactMedianMs: medianDuration(() => XLSX.utils.sheet_to_csv(
        compactImportSheet(sheet, XLSX.utils, 501), { blankrows: false })),
}, null, 2));
