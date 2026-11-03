// Importdata må hverken overskrive nabokolonner eller styre appens interne felter.
export function normalizeImportHeaders(headers) {
    const originals = headers.map(value => String(value ?? '').trim() || 'Uden navn');
    const bases = originals.map(name => name.startsWith('_') ? `Kolonne ${name}` : name);
    const reserved = new Set(bases);
    const used = new Set();
    return bases.map(base => {
        let name = base;
        let suffix = 2;
        // Reservér også navne længere henne i filen: A,A,A_2 må ikke miste A_2.
        while (used.has(name)) {
            do { name = `${base}_${suffix++}`; } while (reserved.has(name));
        }
        used.add(name);
        return name;
    });
}

export function sheetDataCells(sheet) {
    if (!sheet) return [];
    return Object.entries(sheet).filter(([key, cell]) =>
        /^[A-Z]+[1-9]\d*$/.test(key) && cell && cell.t !== 'z' &&
        (String(cell.v ?? '').trim() !== '' || Boolean(cell.f)));
}

// !ref er kun Excels brugte område. Byg et kompakt ark af de faktiske celler,
// så både tomme mellemrum og formatering langt ude i arket er gratis i CSV-leddet.
// Cellerne bevares med type, talformat og formelresultat; kun adresserne flyttes.
export function compactImportSheet(sheet, utils, maxRows) {
    const cells = sheetDataCells(sheet).map(([key, cell]) => ({ ...utils.decode_cell(key), cell }));
    const rows = [...new Set(cells.map(entry => entry.r))].sort((a, b) => a - b);
    const columns = [...new Set(cells.map(entry => entry.c))].sort((a, b) => a - b);
    if (rows.length > maxRows) {
        throw new Error(`Arket har ${rows.length} rækker med indhold. Maks ${maxRows} inklusive eventuelle overskrifter — del filen op i én fil pr. klasse.`);
    }
    if (!rows.length) throw new Error('Arket indeholder ingen data.');
    const rowIndex = new Map(rows.map((value, index) => [value, index]));
    const columnIndex = new Map(columns.map((value, index) => [value, index]));
    const compact = {};
    for (const { r, c, cell } of cells) {
        compact[utils.encode_cell({ r: rowIndex.get(r), c: columnIndex.get(c) })] = cell;
    }
    compact['!ref'] = utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: columns.length - 1 } });
    return compact;
}
