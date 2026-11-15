import { parseCSV, stripEmptyColumns, nfc, cellNumber } from './utils.js';
import { readLectio, extractLectioNames } from './lectio.js';

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

/**
 * Læs en indsat tekst eller en CSV-fil som en klasse: kolonnenavne, rækker og
 * advarsler, uden at gemme noget. createClass() (py_bridge.js) gemmer det,
 * denne funktion giver, og importens udsnit ("Sådan bliver klassen" i
 * ImportSection.vue) viser det, mens læreren indsætter — samme funktion, så
 * udsnittet aldrig kan vise noget andet end det, der bliver oprettet.
 * Rækkerne har endnu ingen _rowId (createClass giver dem det).
 *
 * @param {string} csvContent
 * @param {boolean|'auto'} hasHeaders  er første linje kolonnenavne? 'auto':
 *                              afgør det selv (looksLikeHeaderRow) — det bruger
 *                              importen; true/false bruges kun i testene
 * @param {number} maxRows      højst så mange elever (MAX_ROWS_PER_CLASS)
 * @returns {{ error: string } | { headers: string[], data: object[], warnings: string[], usedHeaders: boolean }}
 */
export function readClassText(csvContent, hasHeaders, maxRows) {
    // RFC 4180-parser: klarer citerede felter over flere linjer,
    // skilletegn inde i felter og dobbelte anførselstegn.
    // NFC før alt andet: "å" skrevet som a + ring (typisk kopieret ud af
    // en PDF) gemmes som det ene tegn, et dansk tastatur skriver. Ellers
    // bliver "Århus" og "Århus" to værdier i hver regel og hver liste.
    const parsed = parseCSV(nfc(csvContent));
    if (parsed.length === 0) return { error: 'Tom fil' };

    // Excel-filer har næsten altid et "brugt område" der er bredere end
    // dataene, så importen slæbte en stribe navnløse tomme kolonner med.
    // Fjern dem FØR overskrifterne udledes — ellers bliver en tom
    // kolonne længst til venstre valgt som ID-kolonne, og så mangler
    // ALLE elever et ID ved gruppedannelse.
    const stripped = stripEmptyColumns(parsed);
    const emptyColumnsRemoved = stripped.removed;
    let rows = stripped.rows;
    if (rows.length === 0 || rows[0].length === 0) return { error: 'Tom fil' };

    // Afgør selv, om første linje er kolonnenavne (Kenneth 15/11 2026: et
    // flueben, programmet selv kan regne ud, kan kun ødelægge noget). En
    // titel over listen ("Klasse 2bx elevliste" over "Navn  Køn  Niveau")
    // springes over først — kun når linjen under den tydeligt er
    // kolonnenavne (isTitleLine), så en elev aldrig forsvinder.
    let titleLine = null;
    if (hasHeaders === 'auto') {
        if (isTitleLine(rows)) {
            titleLine = String(rows[0].find(c => String(c ?? '').trim() !== '') ?? '').trim();
            rows = rows.slice(1);
        }
        hasHeaders = looksLikeHeaderRow(rows);
    }
    // parsed følger rows (tomme kolonner fjernet, ikke rækker); de målinger,
    // der bruger parsed nedenfor, skal starte samme sted.
    const skip = titleLine === null ? 0 : 1;

    // Find den bredeste række, så kolonner ikke tabes tavst, når en
    // senere række har flere celler end den første.
    let maxCols = 0;
    for (const r of rows) if (r.length > maxCols) maxCols = r.length;

    let headers;
    let dataRows;
    if (hasHeaders) {
        headers = rows[0].slice();
        dataRows = rows.slice(1);
    } else {
        headers = ['Navn'];
        for (let i = 1; i < maxCols; i++) headers.push(`Info ${i}`);
        dataRows = rows;
    }

    // Fyld overskrifterne op til den bredeste række, så ekstra celler overlever.
    while (headers.length < maxCols) headers.push(`Info ${headers.length}`);

    // Excel/CSV-overskrifter er brugerdata, aldrig interne programfelter.
    const originalHeaders = headers;
    headers = normalizeImportHeaders(headers);
    const renamedHeaders = headers.filter((header, index) => header !== String(originalHeaders[index] ?? '').trim());

    if (dataRows.length > maxRows) {
        return { error: `For mange rækker (${dataRows.length}). Maks ${maxRows} elever pr. klasse.` };
    }

    const data = dataRows.map(cols => {
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = cols[idx] !== undefined ? cols[idx] : '';
        });
        return row;
    });

    // Advarsler der ikke stopper importen, men vises, så læreren kan
    // rette data lige efter.
    const warnings = [];
    if (parsed.unclosedQuote) {
        warnings.push('Filen har et anførselstegn (") i starten af en celle, der aldrig bliver lukket. ' +
            'Alt efter det blev læst som én lang celle, så der mangler sandsynligvis elever. Ret tegnet i filen og importér igen.');
    }
    if (renamedHeaders.length) {
        warnings.push(`Kolonnenavne blev omdøbt for at bevare alle data og undgå interne feltnavne: ${renamedHeaders.join(', ')}.`);
    }

    // 0) Tomme kolonner fra Excels oppustede "brugte område" er fjernet.
    // Sig det højt — ellers tror læreren at der mangler noget.
    if (titleLine !== null) {
        warnings.push(`Første linje ("${titleLine}") er sprunget over: den ligner en titel over ` +
            `listen, og linjen under den har kolonnenavnene.`);
    }
    if (emptyColumnsRemoved > 0) {
        warnings.push(`${emptyColumnsRemoved} helt ${emptyColumnsRemoved === 1 ? 'tom kolonne' : 'tomme kolonner'} blev sprunget over ved importen. ` +
            `Det er normalt for Excel-filer og betyder ikke at der mangler data.`);
    }

    // 0b) Overskriftsrækken har ÉN udfyldt celle, mens resten af arket
    // har flere. Det er mønstret for en titel-linje ("Klasse 1a —
    // elevliste") øverst i et Excel-ark: så bliver titlen læst som
    // kolonnenavne, den rigtige overskriftsrække bliver til en "elev",
    // og alle kolonner hedder "Info 1", "Info 2" …
    //
    // Der advares kun — der rettes ikke automatisk. En fil hvor kun
    // første kolonne HAR en overskrift ser strukturelt fuldstændig
    // ens ud, og at springe linjen over dér ville æde en rigtig elev.
    if (hasHeaders && maxCols >= 2 && rows.length > 2) {
        const filled = (r) => r.filter(c => String(c ?? '').trim() !== '').length;
        const bodyWithSeveral = rows.slice(1).filter(r => filled(r) >= 2).length;
        if (filled(rows[0]) === 1 && bodyWithSeveral >= 2) {
            const title = String(rows[0].find(c => String(c ?? '').trim() !== '') ?? '').trim();
            warnings.push(`Bemærk: første linje ("${title}") har kun én udfyldt celle, mens ` +
                `resten af arket har flere kolonner. Er det en overskrift over regnearket — ` +
                `og ikke kolonnenavne — så er kolonnerne læst forkert. Slet linjen i filen ` +
                `og importér igen.`);
        }
    }

    // 1) Tomme celler i visningskolonnen. Ikke længere en fejl — hver
    // elev har sit eget _rowId, så gruppedannelsen kører uanset. Men
    // eleven ville stå uden navn på gruppekortet, så det er værd at
    // nævne. Dubletter nævnes IKKE: to elever må gerne hedde det samme.
    const displayCol = headers[0];
    let blankNames = 0;
    for (const row of data) {
        if (String(row[displayCol] ?? '').trim() === '') blankNames++;
    }
    if (blankNames > 0) {
        warnings.push(blankNames === 1
            ? `Bemærk: 1 række har ingen værdi i "${displayCol}" og vil stå uden navn i grupperne.`
            : `Bemærk: ${blankNames} rækker har ingen værdi i "${displayCol}" og vil stå uden navn i grupperne.`);
    }

    // 2) Uens rækker: nogle rækker har FLERE celler end overskriften.
    // Næsten altid et komma brugt både som skilletegn OG som decimal
    // (fx "7,5"), som tavst deler karakterer ud i ekstra kolonner.
    // Måles på `parsed` (FØR tomme kolonner blev fjernet) — stripEmptyColumns
    // gør alle rækker lige lange, så en måling på `rows` ville aldrig give udslag.
    if (hasHeaders) {
        const headerCount = parsed[skip].length;
        const ragged = parsed.slice(skip + 1).filter(r => r.length > headerCount).length;
        if (ragged > 0) {
            warnings.push(`Bemærk: ${ragged} ${ragged === 1 ? 'række har' : 'rækker har'} flere ` +
                `kolonner end overskrifterne. Det sker ofte når komma bruges både som ` +
                `skilletegn OG i decimaltal (fx "7,5"). Prøv at gemme filen med semikolon (;) ` +
                `som skilletegn — så bevares decimaltallene.`);
        }
    }

    return { headers, data, warnings, usedHeaders: !!hasHeaders };
}

// Ord, der kun står øverst i en kolonne, aldrig som en elev. Små bogstaver.
// Danske og de almindelige engelske (testene og nogle eksporter bruger "Name").
const HEADER_WORDS = new Set([
    'navn', 'navne', 'fornavn', 'fornavne', 'efternavn', 'fulde navn', 'elev', 'elever',
    'elevnavn', 'køn', 'klasse', 'hold', 'niveau', 'id', 'nr', 'nr.', 'nummer', 'e-mail',
    'email', 'mail', 'karakter', 'karakterer', 'gruppe', 'emne', 'info', 'bemærkning',
    'bemærkninger', 'studieretning', 'alder', 'fødselsdag', 'type',
    // Engelske kolonnenavne (fx en eksport fra et engelsksproget system).
    'name', 'names', 'first name', 'last name', 'surname', 'full name', 'student',
    'students', 'gender', 'sex', 'class', 'group', 'level', 'grade', 'age',
]);

/**
 * Er første række en titel over listen? Én udfyldt celle, og rækken under
 * har mindst to udfyldte celler, hvoraf én er et kolonnenavn (HEADER_WORDS).
 * Kun da springes den over — en fil, hvor kun første kolonne har et
 * kolonnenavn ("Navn" alene øverst), har "Navn" i FØRSTE række og rammes ikke.
 */
function isTitleLine(rows) {
    if (rows.length < 3) return false;
    const filled = (r) => r.map(c => String(c ?? '').trim()).filter(Boolean);
    const top = filled(rows[0]);
    const next = filled(rows[1]);
    return top.length === 1 && !HEADER_WORDS.has(top[0].toLowerCase())
        && next.length >= 2 && next.some(c => HEADER_WORDS.has(c.toLowerCase()));
}

/**
 * Er første række kolonnenavne? Importen spørger ikke læreren længere
 * (Kenneth 15/11 2026); udsnittet "Sådan bliver klassen" viser, hvad der er
 * valgt, og hvordan det rettes. Første række er kolonnenavne, når:
 *
 *   1. en celle er et ord, der kun står øverst i en kolonne ("Navn", "Køn",
 *      "Klasse" …) — og det er også udvejen, når reglen tager fejl: skriv
 *      "Navn" øverst, så er linjen kolonnenavne;
 *   2. en kolonne har tal i resten, men ikke øverst ("Karakter" over 7, 10, 4);
 *   3. en kolonne har få værdier, der går igen, og den øverste er ikke én af
 *      dem ("Køn" over Pige, Dreng, Pige …).
 *
 * En liste med bare navne har ingen af delene: navnene går ikke igen og er
 * ikke tal, så første linje er en elev. Én linje alene er altid en elev.
 *
 * @param {string[][]} rows rækkerne, som parseCSV giver dem (tomme kolonner fjernet)
 * @returns {boolean}
 */
export function looksLikeHeaderRow(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return false;
    const first = rows[0].map(c => String(c ?? '').trim());
    if (first.some(c => HEADER_WORDS.has(c.toLowerCase()))) return true;

    const body = rows.slice(1);
    for (let col = 0; col < first.length; col++) {
        const head = first[col];
        if (!head) continue;
        const values = [];
        for (const r of body) {
            const v = String(r[col] ?? '').trim();
            if (v) values.push(v);
        }
        if (values.length < 3) continue;
        // 2. Tal under en tekst.
        if (cellNumber(head) === null
            && values.filter(v => cellNumber(v) !== null).length >= values.length * 0.8) return true;
        // 3. Få værdier, der går igen, og den øverste er ikke én af dem.
        const distinct = new Set(values.map(v => v.toLowerCase()));
        if (distinct.size <= values.length / 2 && !distinct.has(head.toLowerCase())) return true;
    }
    return false;
}

/**
 * Hvad sker der med en indsat tekst? Er den fra Lectio, importeres kun
 * navnene (extractLectioNames) uden kolonnenavne, så kolonnen hedder "Navn".
 * Ellers bruges teksten, som den er, og om første linje er kolonnenavne,
 * afgøres af looksLikeHeaderRow ('auto').
 *
 * Både udsnittet i importen og "Opret klasse" (ImportSection.vue) spørger
 * her, så de ikke kan være uenige om, hvad der importeres.
 *
 * @param {string} rawText    det indsatte
 * @returns {{ lectio: { names: string[], skipped: number } | null, content: string, hasHeaders: false | 'auto' }}
 */
export function planPaste(rawText) {
    const lectio = readLectio(rawText);
    return lectio
        ? { lectio, content: extractLectioNames(rawText), hasHeaders: false }
        : { lectio: null, content: String(rawText ?? ''), hasHeaders: 'auto' };
}
