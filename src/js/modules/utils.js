// utils.js - hjælpefunktioner og fælles konstanter

// Motorens rene regneregel for antal grupper (ingen tråd, ingen søgning) —
// se plannedNewGroups længere nede.
import { planGroupCounts, splitEven } from '../../../motor/engine/sizes.js';
import { parseNumber } from '../../../motor/engine/values.js';

// --- HTML Sanitization (prevent XSS from CSV/user data) ---
export function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --- Regeltyperne (de samme navne som i motorens kontrakt, docs/grupper-js-motor-kontrakt.md) ---
export const RULE_TYPES = Object.freeze({
    DISTRIBUTE: 'distribute',
    AGGREGATE: 'aggregate',
    CLUSTER: 'cluster',
    SEPARATE: 'separate',
    BALANCE: 'balance',
    MINIMIZEDIFF: 'minimizediff',
    GROUP_SORT: 'group_sort',
    STRICT_SEPARATE: 'strict_separate'
});

/**
 * Aftryk af hele opsætningen en gruppedannelse blev lavet med: størrelse,
 * regler (med rækkefølge og værdier), aftaler, emner og hvor mange der er til
 * stede. "Sidste dannelse" i opskriften hører kun til, mens aftrykket passer —
 * ændrer læreren noget, handler noterne om en anden opskrift og tælles ikke
 * med i advarslerne.
 *
 * Matrix-runden har sit eget: om der blandes på emner eller stamgrupper
 * (noten "Højst én fra hver stamgruppe kan ikke lade sig gøre …" handler om
 * netop det valg), og Undgå hinanden-aftalerne, som også gælder i matrix.
 * Begge manglede til 13/11 2026: skiftede læreren til "ét fra hvert emne",
 * eller fjernede hun en aftale, stod det gamle resultat der stadig — og
 * prøvekørslen holdt pause, fordi den troede, resultatet passede. Skal
 * sammen og emnelisten sendes ikke til motoren i matrix og er ikke med.
 */
export function setupSignature(cls, isMatrix = false, groupMode = 'size') {
    if (!cls) return '';
    const settings = (isMatrix ? cls.matrixSettings : cls.settings) || {};
    const rules = (isMatrix ? cls.matrixRules : cls.rules) || [];
    const ruleParts = rules.map(r => `${r.type ?? r.name ?? ''}|${r.column ?? r.attribute ?? ''}|${r.value ?? ''}`);
    const ids = (list) => (list || []).map(a => [...(a.ids || [])].map(String).sort().join(',')).sort();
    const present = (cls.data || []).filter(r => !r._excluded).length;
    return JSON.stringify({
        s: isMatrix
            ? [settings.matrixStrategy, settings.groupTarget, settings.groupMod, settings.matrixRepresentationType || 'topic']
            : [groupMode, settings.groupTarget, settings.groupMod],
        r: ruleParts,
        t: isMatrix ? [] : ids(cls.togetherGroups),
        a: ids(cls.separations),
        e: isMatrix ? [] : (cls.topics || []).map(x => String(x ?? '').trim()).filter(Boolean),
        p: present,
    });
}

// Reglernes navne i opskriften (værdi → dansk navn). Korte, ét ord, så de
// passer ind i sætningen; forklaringen står under navnet i regelmenuen.
export const RULE_OPTIONS = Object.freeze([
    { value: RULE_TYPES.DISTRIBUTE, label: 'Fordel' },
    { value: RULE_TYPES.SEPARATE, label: 'Adskil' },
    { value: RULE_TYPES.MINIMIZEDIFF, label: 'Ensartede' },
    { value: RULE_TYPES.BALANCE, label: 'Balancér' },
    { value: RULE_TYPES.CLUSTER, label: 'Klyng' },
    { value: RULE_TYPES.GROUP_SORT, label: 'Saml' },
    { value: RULE_TYPES.AGGREGATE, label: 'Opdel' }
]);

// Forklaringen af hver regel — det ENESTE sted, teksten til læreren står.
// Vises under regelnavnet i opskriftens regelmenu (RecipeRules.vue). Hold dem
// konkrete og uden fagord.
export const RULE_DESCRIPTIONS = Object.freeze({
    [RULE_TYPES.DISTRIBUTE]: 'Spreder en egenskab jævnt ud — fx lige mange drenge og piger i hver gruppe.',
    [RULE_TYPES.SEPARATE]: 'Spreder elever med en valgt værdi, så højst én af dem er i hver gruppe.',
    [RULE_TYPES.MINIMIZEDIFF]: 'Gør medlemmerne i hver gruppe så ens som muligt (fx ens karakterniveau sammen).',
    [RULE_TYPES.BALANCE]: 'Gør gruppernes gennemsnit ens — fx samme karaktergennemsnit i hver gruppe.',
    [RULE_TYPES.CLUSTER]: 'Sørger for at elever med samme værdi ikke ender alene — mindst to sammen.',
    [RULE_TYPES.GROUP_SORT]: 'Forsøger blødt at samle elever med samme værdi i samme gruppe.',
    [RULE_TYPES.AGGREGATE]: 'Hver gruppe får kun elever med samme værdi — streng opdeling efter en egenskab.',
    [RULE_TYPES.STRICT_SEPARATE]: 'Adskil altid — bestemte elever må aldrig være i samme gruppe.'
});

/**
 * Hvor tungt vejer reglen — og er den overhovedet til forhandling?
 *
 * Læreren kunne se HVAD en regel gør (RULE_DESCRIPTIONS), men ikke hvad der
 * sker, når to regler vil hver sin vej. Motoren har faste, skjulte vægte
 * (scoring.WEIGHTS), og de afgør resultatet uden at nogen får det at vide.
 * Vægtene kan ikke sættes af læreren — men de kan siges højt.
 *
 * Tre niveauer, og de er ikke et skøn:
 *   Opdel        deler klassen i puljer FØR nogen anden regel bruges
 *                (solvers.solve_aggregate). Den er strukturel, ikke en vægt.
 *   Klyng/Adskil koster millioner pr. overtrædelse (2.000.000 og 1.000.000).
 *                De vinder i praksis over resten — men kan brydes.
 *   Resten       koster hundreder eller mindre og viger for de to ovenfor.
 *
 * De numeriske regler (Balancér, Ensartede) ganges med en afstand og en
 * varians, ikke med et antal brud, så deres tal kan ikke stilles op ved siden
 * af de andres. Derfor siger teksten "vejer lettere", ikke et rangnummer.
 */
export const RULE_WEIGHT_NOTES = Object.freeze({
    [RULE_TYPES.AGGREGATE]: 'Ligger altid øverst og deler klassen op først — de øvrige regler arbejder inde i hver del.',
    [RULE_TYPES.CLUSTER]: 'Vejer tungt: viger kun, hvis den ikke kan gå op.',
    [RULE_TYPES.SEPARATE]: 'Vejer tungt: viger kun, hvis den ikke kan gå op.',
    [RULE_TYPES.STRICT_SEPARATE]: 'Vejer tungest af alt — brydes kun, hvis intet andet er muligt.',
    [RULE_TYPES.DISTRIBUTE]: 'Et mål: viger for Opdel, Klyng og Adskil.',
    [RULE_TYPES.BALANCE]: 'Et mål: viger for Opdel, Klyng og Adskil.',
    [RULE_TYPES.MINIMIZEDIFF]: 'Et mål: viger for Opdel, Klyng og Adskil.',
    [RULE_TYPES.GROUP_SORT]: 'Et mål, og det letteste af dem — viger for alle de andre.'
});

/**
 * Regeltyper, hvor en valgt VÆRDI ikke betyder noget — værdifeltet skjules.
 *
 * Balancér og Ensartede regner på tal og har aldrig haft et værdifelt. De fire
 * andre HAVDE et, og det var en løgn: de arbejder alle på hele kolonnen, og
 * ingen af dem så nogensinde på `values`.
 *
 *   Opdel   — `solve_aggregate` deler op efter ALLE værdier i kolonnen
 *             (`cluster_by_attr`), uanset hvad der stod i feltet.
 *   Saml    — tæller forskellige værdier i gruppen; ingen værdi-filtrering.
 *   Klyng   — straffer enlige elever på enhver værdi. Klyng kører altid motor
 *             A (WEIGHED_ENGINE_TYPES), så motor B's værdi-udgave nås aldrig.
 *   Fordel  — den værste af de fire: motor A og resultat-scoreren ser hele
 *             kolonnen, mens motor B's Python-regel FAKTISK ville have
 *             spredt kun den valgte værdi. Samme regel gav altså to
 *             forskellige grupperinger alt efter, hvilke ANDRE regler læreren
 *             havde valgt — og opfyldelsesprocenten i tabellen målte hele
 *             kolonnen i begge tilfælde. Nu sendes `values` ikke med for
 *             nogen af de fire (generation.js), så alle tre steder er enige:
 *             reglen gælder kolonnen.
 *
 * Skal én bestemt værdi behandles for sig, er det "Adskil", der gør det — den
 * er den eneste regel, hvor værdien har haft en virkning hele vejen igennem.
 */
export const RULES_WITHOUT_VALUES = Object.freeze([
    RULE_TYPES.BALANCE,
    RULE_TYPES.MINIMIZEDIFF,
    RULE_TYPES.DISTRIBUTE,
    RULE_TYPES.CLUSTER,
    RULE_TYPES.GROUP_SORT,
    RULE_TYPES.AGGREGATE
]);

// Regler, der IKKE kan vælges i matrix-runden.
// Opdel strider mod matrixen: matrixen spreder eleverne fra stamgrupperne,
// mens Opdel holder elever med samme værdi sammen. Matrixen har i forvejen en
// fast, automatisk fordeling på __MatrixSource__.
export const MATRIX_EXCLUDED_RULES = Object.freeze([
    RULE_TYPES.AGGREGATE
]);

/**
 * Saml gentagne kald til ét, `wait` millisekunder efter det sidste.
 *
 * Den returnerede funktion har en `flush()`: kør det der venter NU, i stedet
 * for at vente resten af tiden. Den findes, fordi en udskudt skrivning er en
 * skrivning der ikke er sket endnu — og lukker læreren fanen imens, findes
 * ændringen ingen steder. Se flushPendingWrites() i classActions.js.
 * `flush()` gør ingenting, hvis der ikke er noget at gøre.
 */
export function debounce(func, wait) {
    let timeout;
    let pendingArgs = null;

    function executedFunction(...args) {
        const later = () => {
            timeout = null;
            pendingArgs = null;
            func(...args);
        };
        pendingArgs = args;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    }

    executedFunction.flush = () => {
        if (!timeout) return false;
        clearTimeout(timeout);
        timeout = null;
        const args = pendingArgs || [];
        pendingArgs = null;
        func(...args);
        return true;
    };

    return executedFunction;
}

// Husker hvilken farve hver tekst har fået, så forskellige tekster får forskellige farver
const colorRegistry = new Map();
// Farvetoner valgt, så tekster efter hinanden står så tydeligt adskilt som muligt.
// Rækkefølge: blå, rød, grøn, lilla, orange, blågrøn, pink, indigo, gul, cyan, brun, lime
const distinctHues = [220, 0, 120, 280, 30, 170, 330, 250, 50, 190, 15, 80];

export function clearColorRegistry() {
    colorRegistry.clear();
}

export function getColorForString(str) {
    if (!str || str.toLowerCase() === 'matrix') return {};

    const key = str.trim().toLowerCase();

    // En tekst, vi ikke har set før, får den næste ledige farve
    if (!colorRegistry.has(key)) {
        // Den første tekst får farve 0, den anden farve 1 osv.
        const index = colorRegistry.size;
        let hue;
        if (index < distinctHues.length) {
            // De første 12 tekster bruger de håndvalgte toner ovenfor.
            hue = distinctHues[index];
        } else {
            // Derefter laves NYE toner med den gyldne vinkel (137,5°), så
            // teksterne stadig kan skelnes i stedet for at starte forfra ved tone 1.
            hue = (index * 137.5) % 360;
        }
        colorRegistry.set(key, hue);
    }

    const hue = colorRegistry.get(key);

    // oklch bruger de samme gradtal for tonen som den gamle hsla, men lader os
    // vælge lyshed og mætning direkte: meget lys baggrund, mørk mættet tekst,
    // mellemlys kant — så mærkaterne beholder deres bløde, læselige udseende.
    return {
        bg: `oklch(0.96 0.03 ${hue})`,
        color: `oklch(0.45 0.13 ${hue})`,
        border: `oklch(0.85 0.06 ${hue})`
    };
}


/**
 * Gæt skilletegnet ud fra en prøvelinje: tabulator, semikolon eller komma.
 */
export function detectDelimiter(line) {
    const tabCount = (line.match(/\t/g) || []).length;
    const semiCount = (line.match(/;/g) || []).length;
    const commaCount = (line.match(/,/g) || []).length;

    if (tabCount > commaCount && tabCount > semiCount) return '\t';
    // Ved lighed vinder semikolon: dansk Excel bruger ';' som skilletegn OG
    // ',' som decimaltegn, så en række som "Anders;7,5" har ét af hvert —
    // vælger vi komma, deles karakteren "7,5" forkert.
    if (semiCount >= commaCount && semiCount > 0) return ';';
    return ',';
}

/**
 * Læs en hel CSV-tekst til en liste af rækker (lister af celler).
 *
 * Går teksten igennem tegn for tegn, så linjeskift inde i citerede felter
 * ikke deler en række i to — krævet af RFC 4180 og almindeligt i
 * Excel-eksporter, hvor Info-celler indeholder linjeskift.
 */
export function parseCSV(text) {
    if (!text || !text.trim()) return [];

    // Gæt skilletegnet ud fra første linje. Vi kan ikke dele på '\n' på
    // forhånd (det er netop det, vi vil undgå), så find første linjeskift
    // uden for citering.
    let firstLineEnd = -1;
    let inQ = false;
    let atCellStart = true; // kun et " i starten af en celle åbner citering
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"' && (inQ || atCellStart)) {
            if (inQ && text[i + 1] === '"') { i++; continue; }
            inQ = !inQ;
            atCellStart = false;
        } else if (!inQ) {
            if (ch === '\n') {
                firstLineEnd = i;
                break;
            }
            if (ch === ',' || ch === ';' || ch === '\t') atCellStart = true;
            else if (ch !== ' ' && ch !== '\r') atCellStart = false;
        }
    }
    const sample = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
    const delimiter = detectDelimiter(sample);

    // Gennemløb så hele teksten.
    const rows = [];
    let row = [];
    let current = '';
    let inQuotes = false;
    let cellWasQuoted = false;
    let rowHasContent = false;

    const pushCell = () => {
        const cell = cellWasQuoted ? current : current.trim();
        row.push(cell);
        // En tom men citeret celle ("") tæller som indhold, så rækken bevares.
        // En celle med kun mellemrum uden citering bliver tom efter trim og
        // må IKKE holde rækken i live.
        if (cell.length > 0 || cellWasQuoted) rowHasContent = true;
        current = '';
        cellWasQuoted = false;
    };
    const pushRow = () => {
        pushCell();
        if (rowHasContent) rows.push(row);
        row = [];
        rowHasContent = false;
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            // Kun et anførselstegn i starten af en celle åbner citeret
            // tilstand. Ét enkelt " midt i et navn ("5" skærm") ville ellers
            // sluge resten af filen ind i én celle.
            if (ch === '"' && !cellWasQuoted && current.trim() === '') {
                inQuotes = true;
                cellWasQuoted = true;
                current = '';
            } else if (ch === delimiter) {
                pushCell();
            } else if (ch === '\n') {
                pushRow();
            } else if (ch === '\r') {
                // ignoreres — linjeskift håndteres af '\n'-grenen
            } else {
                current += ch;
            }
        }
    }
    // Skriv sidste række, hvis filen ikke sluttede med linjeskift
    if (current.length > 0 || row.length > 0 || cellWasQuoted) {
        pushRow();
    }
    // En citeret celle, der aldrig blev lukket, har slugt resten af filen.
    // Resultatet er stadig en liste (så alle kaldere virker uændret), men
    // importen kan læse flaget og advare læreren i stedet for at tie.
    Object.defineProperty(rows, 'unclosedQuote', { value: inQuotes, enumerable: false });
    return rows;
}

// ─── Elev-identitet ────────────────────────────────────────────────────────

/**
 * Navnet på det interne felt der identificerer en elevrække.
 *
 * ÉT ledende underscore, så isInternalField() automatisk holder det ude af
 * Excel-eksporten, af kolonnevælgerne og af elevtabellen. Gruppemotoren har
 * brug for det og får det eksplicit tilføjet til sin CSV (se py_bridge).
 *
 * Hvorfor overhovedet: før var lærerens valgte kolonne BÅDE identitet og
 * visning. Det gjorde en tom celle fatal (rækken kunne ikke refereres) og to
 * ens navne til én elev. De to roller er nu skilt ad — det her er identiteten,
 * og lærerens valg er kun et spørgsmål om hvad der står på gruppekortene.
 */
export const ROW_ID = '_rowId';

/**
 * Gamle _rowId'er er "r" efterfulgt af tal. Nye er "r-" efterfulgt af
 * tilfældige hextegn. Begge former skal genkendes og bevares.
 *
 * Længden er 16 tegn (64 bit) og ikke 128 bit, som det først blev skrevet.
 * Et id fylder nemlig ikke ét sted, men ét pr. elev PLUS ét pr. medlem i
 * hver gemt gruppe, hver matrixgruppe og hver af de op til 50 sessioner i
 * historikken. Målt på en fuld klasse (500 elever, 50 sessioner med både
 * stam- og matrixgrupper): sekventielle id'er fylder 1094 KB, 128 bit fylder
 * 2599 KB og 64 bit 1802 KB. Browserens kvote er ~5 MB for HELE appen, og
 * der er ingen server at lægge resten på — de 800 KB er en klasse mere.
 *
 * 64 bit er rigeligt til det, tilfældigheden skal: en ny elev må ikke arve
 * et id, en SLETTET elev stadig står med i en aftale eller en gammel session
 * (levende rækker er dækket af `reserved` nedenfor). Selv 5.000 elever over
 * en klasses levetid giver under 1 ud af 10^12 for et sammenfald.
 *
 * Intervallet {16,32} står der, fordi 32-tegns-id'er nåede at blive udstedt
 * af en enkelt bygning. De er lige så gyldige — de skal bare ikke laves flere af.
 *
 * Bruges til at kende forskel på et ID og et NAVN. Et id må aldrig stå på et
 * gruppekort, en udskrift eller i en kopieret liste — det er kun en nøgle.
 */
export const ROW_ID_PATTERN = /^(?:r\d+|r-[a-f0-9]{16,32})$/;

/** Antal tilfældige bytes i et nyt _rowId — 8 bytes = 16 hextegn = 64 bit. */
const ROW_ID_BYTES = 8;

/**
 * Et unikt id til en gemt session eller kørsel.
 *
 * crypto.randomUUID findes kun i en sikker kontekst (https, localhost); på en
 * skoleserver uden https ville det kaste, og "Gem session" ville dø uden
 * forklaring. getRandomValues virker overalt.
 */
export function newUuid() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Kolonnerne i elevrækkerne — nøglerne fra ALLE rækker, i den rækkefølge de
 * først optræder (første række bestemmer rækkefølgen, andre lægger kun til).
 *
 * Før stod `Object.keys(data[0])` fire steder: ved gem (updateClass), i
 * CSV'en til motoren, i ensretningen af store/små bogstaver og ved
 * indlæsning. Manglede den første elev en nøgle — en ældre klasse eller en
 * håndredigeret backup — forsvandt kolonnen fra kolonnelisten ved næste gem
 * og nåede aldrig motoren, mens cellerne lå usynligt i de andre rækker.
 */
export function columnsOfRows(rows) {
    const seen = new Set();
    const out = [];
    for (const row of (Array.isArray(rows) ? rows : [])) {
        if (!row || typeof row !== 'object') continue;
        for (const key of Object.keys(row)) {
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(key);
        }
    }
    return out;
}

/**
 * Den form en celles tekst gemmes i.
 *
 * Det samme bogstav kan skrives på to måder: "å" som ÉT tegn, eller som "a"
 * efterfulgt af en kombinerende ring. De ser ens ud på skærmen, men for
 * computeren er "Århus" og "Århus" to forskellige ord. Den anden form kommer
 * typisk med tekst, der er kopieret ud af en PDF på en Mac. NFC vælger den
 * første form — den et dansk tastatur selv skriver.
 */
export function nfc(text) {
    return String(text ?? '').normalize('NFC');
}

/**
 * Gem alle tekst-celler i klassen i NFC-form (se `nfc()`). Til klasser, der
 * blev importeret før 2026-09-24, hvor "å" kunne stå som a + ring. Kun
 * lærerens egne celler røres — interne felter (`_rowId`, `_excluded`) og
 * kolonnenavnene står, som de står: et kolonnenavn bruges også af regler,
 * skjulte kolonner og rækkefølger, og de peger alle på det samme navn.
 *
 * Retter rækkerne på stedet og returnerer, hvor mange celler der blev ændret
 * (0 på en klasse, der allerede er i orden — så kalderen ved, om der skal gemmes).
 */
export function normalizeCellText(data) {
    let changed = 0;
    for (const row of (Array.isArray(data) ? data : [])) {
        if (!row || typeof row !== 'object') continue;
        for (const key of Object.keys(row)) {
            const v = row[key];
            if (typeof v !== 'string' || isInternalField(key)) continue;
            const fixed = v.normalize('NFC');
            if (fixed !== v) { row[key] = fixed; changed++; }
        }
    }
    return changed;
}

/**
 * Elevens celle i kolonnen — men KUN hvis rækken selv har den.
 *
 * `row[kolonne]` spørger også objektets arv. Hedder kolonnen "constructor",
 * "toString" eller "valueOf" (navne ethvert JavaScript-objekt har), og
 * mangler cellen på rækken, svarer `row[kolonne]` med en indbygget funktion
 * i stedet for ingenting — og den blev til teksten
 * "function Object() { [native code] }", som om eleven havde skrevet det.
 * Svarer `null` for en manglende celle.
 */
export function ownCell(row, col) {
    if (!row || typeof row !== 'object') return null;
    return Object.hasOwn(row, col) ? row[col] : null;
}

/**
 * Giv hver elevrække en tom celle i de kolonner, den mangler.
 *
 * Alt, der i dag skriver en række (import, "+ Kolonne", ny elev,
 * "Gem som kolonne", "Kategorisér"), skriver en celle i HVER kolonne. Men en
 * klasse gemt af en ældre udgave, eller en håndredigeret backup, kan have
 * rækker, hvor en celle mangler helt. Det er normalt ligegyldigt (en manglende
 * celle og en tom celle læses ens) — undtagen i en kolonne med et navn,
 * JavaScript selv bruger (se ownCell). Kaldes, når klassen åbnes, så hullerne
 * er væk ét sted, i stedet for at hvert eneste læsested skal huske det.
 *
 * Kun lærerens egne kolonner (teacherColumns). Programmets skjulte kolonner
 * (`__MatrixSource__`, `__Rang:…__`) opfindes ikke på rækker uden dem.
 *
 * Kolonnerne må ikke flytte sig: den gemte rækkefølge læses af rækkernes
 * nøgler (columnsOfRows, første række først). En række MED huller skrives
 * derfor om i kolonnelistens rækkefølge, og andre nøgler (`_rowId`,
 * `_excluded`, skjulte kolonner) lægges bagest i deres egen rækkefølge.
 * Rækker uden huller røres ikke.
 *
 * @returns {number} hvor mange celler der blev tilføjet (0 = intet at gemme)
 */
export function fillMissingCells(data, columns) {
    const cols = teacherColumns(Array.isArray(columns) ? columns : []);
    if (!Array.isArray(data) || cols.length === 0) return 0;
    let filled = 0;
    for (const row of data) {
        if (!row || typeof row !== 'object') continue;
        const missing = cols.filter(c => !Object.hasOwn(row, c));
        if (missing.length === 0) continue;
        const entries = cols.map(c => [c, Object.hasOwn(row, c) ? row[c] : '']);
        const colSet = new Set(cols);
        const rest = Object.keys(row).filter(k => !colSet.has(k)).map(k => [k, row[k]]);
        for (const k of Object.keys(row)) delete row[k];
        for (const [k, v] of [...entries, ...rest]) row[k] = v;
        filled += missing.length;
    }
    return filled;
}

/**
 * Nøglen to celleværdier sammenlignes på: uden mellemrum i enderne, samme
 * tegnform (se `nfc()`) og uden forskel på store og små bogstaver. "Dreng",
 * " dreng " og "Åse"/"Åse" bliver hver ét.
 */
export function valueKey(raw) {
    return nfc(raw).trim().toLowerCase();
}

/**
 * En kolonnes værdier, ÉN pr. `valueKey()`, i den stavemåde der står flest
 * gange (lige mange: den alfabetisk første). Kortet går fra nøgle til
 * stavemåde. Tomme celler er ikke en værdi og kommer ikke med.
 *
 * Bruges af motorens ensretning (py_bridge) OG af rullelisterne i regel-
 * rækken og "Kategoriser" — så det læreren vælger, er præcis den stavemåde
 * motoren får. Før havde hver sin kopi af beregningen.
 */
export function canonicalSpellings(rows, col) {
    const groups = new Map();   // nøgle -> Map<stavemåde, antal>
    for (const row of (Array.isArray(rows) ? rows : [])) {
        // Kun en celle rækken SELV har (se ownCell). Ellers tilbød rullelisten
        // "function Object() { [native code] }" i en kolonne kaldt "constructor".
        const raw = ownCell(row, col);
        if (raw == null) continue;
        const spelling = nfc(raw).trim();
        if (spelling === '') continue;
        const key = spelling.toLowerCase();
        if (!groups.has(key)) groups.set(key, new Map());
        const counts = groups.get(key);
        counts.set(spelling, (counts.get(spelling) || 0) + 1);
    }
    const out = new Map();
    for (const [key, counts] of groups) {
        const entries = [...counts.entries()];
        entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'da'));
        out.set(key, entries[0][0]);
    }
    return out;
}

/**
 * Er feltet et internt UI-felt på en elevrække?
 *
 * ÉT ledende underscore (`_excluded`, `_rowId`) = internt: det må hverken ud i
 * lærerens Excel-eksport, kolonnevælgerne eller elevtabellen. TO underscores
 * (`__MatrixSource__`) er derimod et ægte grupperings-input og bliver.
 *
 * Bor her — og ikke i py_bridge.js — fordi både motor-stien og eksport-stien
 * skal svare det samme på spørgsmålet.
 */
export function isInternalField(key) {
    return typeof key === 'string' && key.startsWith('_') && !key.startsWith('__');
}

/**
 * Kolonnerne læreren skal SE — i elevlisten, i menuerne, i regelbyggeren.
 *
 * IKKE det samme spørgsmål som `isInternalField()`, og forskellen er hele
 * grunden til at funktionen findes. `__MatrixSource__` er ikke et internt
 * felt: det er et ægte grupperings-input, som skal med i motorens CSV og
 * overleve et gem. Men det er programmets eget mærke, ikke en kolonne læreren
 * har lavet, og hun skal hverken kunne slette det, kategorisere efter det
 * eller lægge en regel på det — matrixdannelsen har i forvejen sin egen hårde
 * Fordel-regel på kolonnen, og en regel mere ville trække i den modsatte
 * retning.
 *
 * Reglen stod før skrevet i hånden som `!c.startsWith('_')` seks steder. Den
 * er rigtig, men den LIGNER en fejl — den næste der rydder op, retter den til
 * `isInternalField()`, og så siver `__MatrixSource__` ud i lærerens menuer.
 * Derfor ét navn i stedet.
 */
export function teacherColumns(columns) {
    if (!Array.isArray(columns)) return [];
    return columns.filter(c => typeof c === 'string'
        && !isInternalField(c)
        && !c.startsWith('__'));
}

/**
 * Giv hver række et _rowId hvis den mangler et — eller har et der allerede er
 * brugt (sker når en række kopieres). Idempotent: kald den så tit du vil.
 *
 * Nye id'er er tilfældige, så en ny elev aldrig arver en slettet elevs aftaler
 * eller plads i gemte grupper. Tilfældige id'er kræver ingen separat tæller,
 * der kan gå tabt ved fortryd, backup eller genindlæsning.
 *
 * @returns {number} hvor mange rækker der fik tildelt et nyt id
 */
export function ensureRowIds(data) {
    if (!Array.isArray(data)) return 0;

    const reserved = new Set(data.map(row => row && row[ROW_ID]));

    let added = 0;
    const seen = new Set();
    for (const row of data) {
        if (!row || typeof row !== 'object') continue;
        const v = row[ROW_ID];
        if (typeof v === 'string' && ROW_ID_PATTERN.test(v) && !seen.has(v)) {
            seen.add(v);
            continue;
        }
        let id;
        do {
            // getRandomValues virker også på HTTP; randomUUID kræver HTTPS.
            const bytes = crypto.getRandomValues(new Uint8Array(ROW_ID_BYTES));
            id = `r-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
        } while (reserved.has(id));
        row[ROW_ID] = id;
        reserved.add(id);
        seen.add(id);
        added++;
    }
    return added;
}

/**
 * Migrér en klasse gemt FØR _rowId fandtes.
 *
 * Dengang var lærerens valgte kolonne selve identiteten, så alt der peger på
 * en elev — undgåelser, gemte grupper, låste grupper — indeholder navne-
 * strenge. De skal oversættes til _rowId, ellers matcher de ingenting når
 * motoren nu regner i _rowId.
 *
 * Kaldes ved hver klasse-indlæsning og er idempotent: er alle referencer
 * allerede _rowId'er, laver den ingenting.
 *
 * To ens navne fordeles på forskellige elevrækker i rækkefølge inden for
 * hvert gruppesæt. Deres oprindelige indbyrdes placering kan ikke udledes
 * bagudrettet; _rowId fjerner den tvetydighed for nye fordelinger.
 *
 * @param {Object|Array} cls  klassen (eller bare dens elevrækker)
 * @param {string} oldIdCol   kolonnen der var identitet før; udledes hvis tom
 * @param {Object} refs       { separations, groupSets } der skal oversættes
 * @returns {{ rowIdsAdded: number, refsRemapped: number }}
 */
export function migrateRefsToRowIds(cls, oldIdCol, refs = {}) {
    const data = Array.isArray(cls) ? cls : (cls && cls.data);
    const rowIdsAdded = ensureRowIds(data);

    // Uden en gammel ID-kolonne kan navne-referencer ikke oversættes. De ældste
    // klasser fik aldrig `id_column` skrevet ned; dengang faldt appen tilbage
    // på den første synlige kolonne, så det gør vi også her.
    if (!oldIdCol && cls && Array.isArray(cls.columns)) {
        oldIdCol = teacherColumns(cls.columns)[0];
    }
    if (!oldIdCol && Array.isArray(data) && data[0]) {
        oldIdCol = teacherColumns(Object.keys(data[0]))[0];
    }

    // Gammel værdi -> ALLE elever der havde den, i rækkefølge. To elever med
    // samme navn står altså som to poster under samme nøgle.
    const rows = Array.isArray(data) ? data : [];
    const byOldValue = new Map();
    if (oldIdCol) {
        for (const row of rows) {
            if (!row) continue;
            const key = String(row[oldIdCol] ?? '').trim();
            if (!key) continue;
            if (!byOldValue.has(key)) byOldValue.set(key, []);
            byOldValue.get(key).push(row[ROW_ID]);
        }
    }
    const knownRowIds = new Set(rows.map(r => r && r[ROW_ID]));

    let refsRemapped = 0;

    // Id'er uddeles fra en PULJE, én ad gangen. Står "Anna Hansen" to steder
    // inden for samme pulje, KAN det ikke være den samme Anna — så de får hver
    // sin. Uden det pegede begge referencer på den første Anna: hun stod to
    // steder på én gang, og den anden Anna forsvandt ud af alle grupper.
    const makePool = () => {
        const pool = new Map();
        for (const [k, ids] of byOldValue) pool.set(k, ids.slice());
        return pool;
    };

    // En reference der ALLEREDE er et _rowId lægger beslag på sin elev, så en
    // navne-reference et andet sted i puljen ikke uddeler den samme elev igen.
    const claim = (pool, rowId) => {
        for (const ids of pool.values()) {
            const i = ids.indexOf(rowId);
            if (i !== -1) { ids.splice(i, 1); return; }
        }
    };
    const claimAll = (pool, values) => {
        for (const v of values) {
            const s = memberIdStr(v);
            if (knownRowIds.has(s)) claim(pool, s);
        }
    };

    const translateOne = (pool, value) => {
        const v = memberIdStr(value);
        if (knownRowIds.has(v)) return v;              // allerede migreret
        const queue = pool.get(v);
        if (queue && queue.length > 0) { refsRemapped++; return queue.shift(); }
        // Flere referencer end elever med det navn, eller et ukendt navn:
        // eleven findes ikke længere → bliver et spøgelse, som før.
        return v;
    };

    // Hver undgåelse er sin egen pulje: eleverne i ÉN undgåelse er forskellige,
    // men den samme elev må gerne optræde i flere undgåelser.
    for (const sep of [...(refs.separations || []), ...(refs.togetherGroups || [])]) {
        if (!sep || !Array.isArray(sep.ids)) continue;
        const pool = makePool();
        claimAll(pool, sep.ids);
        sep.ids = sep.ids.map(v => translateOne(pool, v));
    }

    // Hvert gruppesæt deler ÉN pulje på tværs af alle sine grupper, fordi
    // sættet er en opdeling: en elev sidder i præcis én gruppe. Stam- og
    // matrixgrupper er to uafhængige opdelinger og får derfor hver sin pulje.
    for (const groups of (refs.groupSets || [])) {
        if (!groups) continue;
        const pool = makePool();
        for (const g of groups) {
            if (g && Array.isArray(g.members)) claimAll(pool, g.members);
        }
        for (const g of groups) {
            if (!g || !Array.isArray(g.members)) continue;
            g.members = g.members.map(m => {
                const id = translateOne(pool, m);
                const isObject = typeof m === 'object' && m !== null;
                // Behold navnet fra dengang, så en slettet elev stadig kan
                // vises — men KUN hvis det ER et navn. Et medlem der allerede
                // er migreret, er strengen "r12", og den blev sat som navn på
                // sig selv. Blev eleven siden slettet, havde kortet ikke andet
                // at vise frem, og læreren fik "r12" at se på gruppekortet, på
                // udskriften og i den kopierede liste. Id'er er til opslag —
                // aldrig til at læse.
                const rawName = String((isObject ? (m.name ?? m.id) : m) ?? '').trim();
                if (!rawName || ROW_ID_PATTERN.test(rawName)) {
                    if (!isObject) return id;           // ren streng forbliver ren streng
                    const { name, ...rest } = m;      // det ubrugelige navn ryger ud
                    return { ...rest, id };
                }
                return { ...(isObject ? m : {}), id, name: rawName };
            });
        }
    }

    return { rowIdsAdded, refsRemapped };
}

/**
 * "1 gruppe" / "3 grupper" — dansk bøjning af et gruppeantal.
 *
 * docs/grupper.md gør det til en regel, at antal bøjes, og at de tre
 * advarselskilder lyder ens. `logic.py` har `_groups_text()`, og HintsStack havde
 * sin egen lokale kopi — men `generation.js` havde ingen og skrev
 * "Du har låst 1 grupper". Reglen bor her nu, så alle tre kilder kan dele den.
 *
 * @param {number} n
 * @returns {string}
 */
export function groupCountText(n) {
    return `${n} ${n === 1 ? 'gruppe' : 'grupper'}`;
}

/**
 * Gruppens navn, som det skal STÅ for læreren.
 *
 * Internt hedder grupperne "Group 1", "Group 2" — motoren er engelsk, og
 * navnet er samtidig nøglen til emne-kortet, låse og historik, så det kan
 * ikke bare oversættes ved kilden. Oversættelsen hører derfor til på vejen
 * ud til skærmen, præcis som `memberDisplayName()` for elevnavne.
 *
 * HVORFOR DEN FINDES: `.replace(/^Group/, 'Gruppe')` stod skrevet i hånden 13
 * steder i 10 filer — gruppekortet, udskriften, eksporten, historikken,
 * efternøler-modalen, forhåndsvisningen … Den slags regel uden ét hjem bliver
 * glemt af det NÆSTE sted, der tegner et gruppenavn, og det skete: advarslen
 * om en brudt undgåelse skrev "Anna og Bo i Group 1". docs/grupper.md siger
 * udtrykkeligt, at gruppenavne skal vises som på kortet.
 *
 * Den anden `replace` normaliserer mellemrum ("Gruppe  3" → "Gruppe 3") —
 * den fulgte med fra de kaldesteder der havde den, så alle steder nu svarer
 * ens.
 *
 * @param {string} name  gruppens interne navn
 * @returns {string}
 */
export function groupDisplayName(name) {
    return String(name ?? '')
        .replace(/^Group/, 'Gruppe')
        .replace(/^Gruppe\s+/, 'Gruppe ');
}

/**
 * Gruppens navn FORKORTET — til de steder hvor det skal stå ved siden af en
 * elev og ikke må stjæle linjen: oprindelses-mærkatet på matrixkortet, i den
 * kopierede liste og på udskriften.
 *
 * HVORFOR DEN FINDES: forkortelsen stod skrevet i hånden tre steder, og de var
 * ikke ens. `GroupCard.vue` og `groupActions.js` skrev "Grp 3"; `overview.js`
 * skrev "Gr. 3". Samme elev, samme stamgruppe, to forskellige mærkater
 * afhængigt af om læreren kiggede på skærmen eller på papiret.
 *
 * Værre: `SOURCE_RE` i `restoreGroups.js` — den der skræller " (Grp 3 - Klima)"
 * af igen, når listen limes tilbage ind — kender kun `grp|gruppe|group`. "Gr."
 * er altså den ENE af de tre former, vejen tilbage ikke kan læse.
 *
 * "Grp" er valgt, fordi det er den form de to andre steder og parseren allerede
 * bruger. Ændres den, skal `SOURCE_RE` med i samme ombæring.
 *
 * @param {string} name  gruppens interne navn ("Group 3" eller "Gruppe 3")
 * @returns {string}     "Grp 3"
 */
export function groupShortName(name) {
    // Kun når der står et TAL efter. Mærkatet får også emner ind (kortet viser
    // stamgruppens emne frem for dens navn, når der er et), og et emne der
    // hedder "Gruppearbejde" er ikke en gruppe. De gamle håndskrevne
    // `.replace(/^Gruppe/, 'Grp')` skar den slags midt over: "Grparbejde".
    return groupDisplayName(name).replace(/^Gruppe\s*(?=\d)/, 'Grp ');
}

/** Vises når en elev ikke har nogen værdi i visningskolonnen. */
export const UNNAMED_STUDENT = '(uden navn)';

/** Normalisér et gruppemedlem (id-streng eller {id, name}) til en trimmet id-streng. */
export function memberIdStr(m) {
    return String(typeof m === 'object' && m !== null ? (m.id ?? m.name ?? '') : m).trim();
}

/**
 * Slå én elevrække op på dens _rowId.
 *
 * ÉT sted, fordi `memberDisplayName()` og `isMemberAbsent()` skal finde
 * nøjagtig den samme række — ellers kan et navn og et fraværs-flueben komme
 * til at handle om hver sin elev.
 *
 * `byId` er et FÆRDIGT opslagskort (se `studentById` i lookups.js). Uden det
 * gennemløbes hele elevlisten pr. opslag, og gruppekortene spørger seks gange
 * pr. elev pr. gennemtegning — ved 300 elever blev det målbart (48,5 ms for at
 * tegne alle kort om). Kortet skal bygges med FØRSTE række pr. id, præcis som
 * `.find()` gør, så to elever med samme _rowId opfører sig ens begge veje.
 */
function findRowById(rows, id, byId) {
    if (byId) return byId.get(id) || undefined;
    const list = Array.isArray(rows) ? rows : [];
    return list.find(s => s && String(s[ROW_ID] ?? '').trim() === id);
}

/**
 * Sortér elev-id'er efter den rækkefølge, eleverne står i på ELEVLISTEN.
 *
 * HVORFOR: en undgåelse og en Skal sammen-aftale gemte deres id'er
 * `.sort()`et — altså alfabetisk på selve id'et. Så længe id'erne var "r1",
 * "r2", … faldt den sortering tilfældigvis sammen med rækkefølgen i listen,
 * og beskederne læste "Anna og Bo". Med tilfældige id'er er den sammenhæng
 * væk, og de samme to elever kunne stå "Bo og Anna" i dag og omvendt i
 * morgen — i banneret om en brudt undgåelse, i Aftaler-vinduet og i
 * konflikt-beskederne.
 *
 * Rækkefølgen på skærmen skal aldrig hvile på, hvordan en nøgle ser ud.
 * Ukendte id'er (en slettet elev, der stadig står i en gammel aftale) lægges
 * bagest i den orden, de kom i — de skal med, bare ikke forrest.
 *
 * @param {string[]} ids
 * @param {Array} data   klassens elevrækker
 * @returns {string[]} en ny liste; input røres ikke
 */
export function orderIdsByRow(ids, data) {
    const list = Array.isArray(ids) ? ids : [];
    const rows = Array.isArray(data) ? data : [];
    const at = new Map();
    rows.forEach((s, i) => {
        const id = s && String(s[ROW_ID] ?? '').trim();
        if (id && !at.has(id)) at.set(id, i);
    });
    return [...list].sort((a, b) => {
        const ai = at.has(a) ? at.get(a) : Infinity;
        const bi = at.has(b) ? at.get(b) : Infinity;
        if (ai !== bi) return ai - bi;
        return 0;   // begge ukendte: bevar deres indbyrdes orden
    });
}

/**
 * Byg opslagskortet fra en elevliste. Bruges af `lookups.js` (Vue-computed)
 * og af de gamle JS-moduler, der selv slår mange medlemmer op i træk.
 */
export function buildStudentIndex(data) {
    const map = new Map();
    const rows = Array.isArray(data) ? data : [];
    for (const s of rows) {
        if (!s) continue;
        const id = String(s[ROW_ID] ?? '').trim();
        // Første række vinder — samme svar som `.find()` ved dublet-id'er.
        if (id && !map.has(id)) map.set(id, s);
    }
    return map;
}

/**
 * Navnet der skal STÅ på et gruppemedlem.
 *
 * Medlemmer bæres rundt som _rowId, så navnet slås op i klassen via lærerens
 * valgte visningskolonne. Findes eleven ikke længere (spøgelse), bruges det
 * navn medlemmet fik med sig, dengang gruppen blev dannet — en ren id-streng
 * har intet navn med og falder derfor igennem til UNNAMED_STUDENT.
 *
 * Ren funktion (ingen state-import) så den kan bruges fra både Vue-komponenter
 * og de gamle JS-moduler uden cirkulære imports.
 *
 * @param {string|Object} m         medlemmet
 * @param {Array}  data             klassens elevrækker
 * @param {string} displayColumn    lærerens valgte kolonne
 * @param {Map}    [byId]           færdigt opslagskort — se findRowById()
 */
export function memberDisplayName(m, data, displayColumn, byId) {
    const id = memberIdStr(m);
    const student = findRowById(data, id, byId);

    if (student && displayColumn) {
        const val = String(student[displayColumn] ?? '').trim();
        if (val) return val;
    }
    if (!student) {
        // Objekt-medlemmer bærer navnet med fra dengang gruppen blev dannet.
        // Ligner det gemte "navn" et _rowId, ER det ikke et navn — ældre data
        // kan bære id'et som sit eget navn, og så stod der "r12" på kortet.
        const stored = (typeof m === 'object' && m !== null) ? String(m.name ?? '').trim() : '';
        if (stored && !ROW_ID_PATTERN.test(stored)) return stored;
        // Ren streng der IKKE ligner et _rowId: en umigreret reference, hvor
        // værdien selv var navnet. Vis den frem for at tabe navnet på gulvet.
        if (id && !ROW_ID_PATTERN.test(id)) return id;
    }
    return UNNAMED_STUDENT;
}

/**
 * Er dette gruppemedlem markeret fraværende i elevlisten?
 *
 * "Fraværende" har to indgange i appen — papirkurven på gruppekortet og
 * "Til stede"-fluebenet i elevlisten — men kun papirkurven fjerner eleven fra
 * gruppen. Sætter læreren fluebenet, bliver eleven stående på gruppekortet,
 * på udskriften og i den kopierede liste, som var hun der. Derfor spørger
 * alle tre visningssteder nu HER, så de svarer det samme.
 *
 * Et spøgelse (medlem hvis elevrække er slettet) er IKKE fraværende — det er
 * en anden tilstand med sin egen markering, og rækken findes ikke at spørge.
 *
 * Ren funktion (ingen state-import), af samme grund som memberDisplayName.
 *
 * @param {string|Object} m     medlemmet
 * @param {Array}  data         klassens elevrækker
 * @param {Map}    [byId]       færdigt opslagskort — se findRowById()
 * @returns {boolean}
 */
export function isMemberAbsent(m, data, byId) {
    const id = memberIdStr(m);
    const student = findRowById(data, id, byId);
    return !!(student && student._excluded);
}

/**
 * Aftryk af de stamgrupper, en matrix er dannet ud fra.
 *
 * Matrixgrupper dannes PÅ TVÆRS af stamgrupperne: hver elev får et
 * `__MatrixSource__` sat efter den stamgruppe hun står i, og motoren spreder
 * kilderne ud. Flytter læreren bagefter en elev i hånden, rører det kun
 * stamgrupperne — matrixen bliver stående og er nu skæv (to elever fra samme
 * stamgruppe i én matrixgruppe, og en anden stamgruppe uden repræsentant).
 * Aftrykket her gør driften målbar, så hintet i Matrix-visningen kun dukker
 * op når der FAKTISK er noget at advare om.
 *
 * Hvad der tælles med, og hvorfor:
 *   - **medlemmerne** — det er dem der bliver fordelt
 *   - **emnet** — med matrix-strategien "Emner" ER emnet kildeværdien, så to
 *     grupper der bytter emne skævvrider matrixen præcis som en flyttet elev
 *   - **navnet** — kildeværdien med strategien "Grupper"
 *
 * Og hvad der bevidst IKKE tælles med: **`locked`**. At låse en stamgruppe
 * ændrer ikke hvem der står i den, så matrixen er lige så gyldig bagefter.
 * Talte vi låsen med, ville et tryk på hængelåsen udløse en advarsel om en
 * skævhed, der ikke findes — og et hint man lærer at klikke væk, er værre end
 * intet hint.
 *
 * Emnet læses fra `g.topic` og IKKE fra emne-kortet i lageret, så funktionen
 * kan blive her i utils.js uden at importere `storage` (som selv importerer
 * utils). De to holdes i sync alle de steder et emne skrives, og skulle de
 * alligevel drive fra hinanden, er værste udfald et manglende eller et
 * overflødigt hint — ikke ødelagte data.
 *
 * @param {Array} groups   stamgrupperne
 * @returns {string}       aftryk til sammenligning med `===`
 */
export function homeGroupFingerprint(groups) {
    return (groups || []).map(g =>
        `${g.name}:${g.topic || ''}:${(g.members || []).map(memberIdStr).join(',')}`
    ).join('|');
}

/**
 * Undgåelser der er BRUDT i de grupper, der står på skærmen lige nu.
 *
 * HVORFOR DEN FINDES: en undgåelse er et løfte — "de to må aldrig ende
 * sammen" — og gruppedannelsen holder det som regel. Men der er tre veje
 * udenom BAGEFTER, som ingen af advarslerne før kørslen kan se:
 *
 *   - læreren trækker selv en elev over i en anden gruppe (moveMember)
 *   - begge elever står i en LÅST gruppe, og så dropper generation.js
 *     undgåelsen tavst (der er under to elever tilbage at adskille)
 *   - en gemt session eller en gendannet backup kommer ind med grupper,
 *     der blev dannet dengang undgåelsen ikke fandtes
 *
 * Og motoren selv kan bryde den: undgåelsen er en BLØD regel (vægt 1.000.000
 * i scoring.py), og Opdel vejer tungere (5.000.000). Målt: Opdel('Emne') med
 * to elever i samme emne og kun én gruppe dér satte dem sammen — men DET
 * tilfælde advarer logic.py allerede om før kørslen (Check 3).
 *
 * Klyng står med 2.000.000 i den samme tabel, men brød den ikke i nogen af de
 * kørsler, der er prøvet: `_score_cluster` straffer kun en elev der sidder
 * ALENE med sin værdi, ikke en klynge der ikke er samlet, så reglen giver
 * efter længe før undgåelsen gør. Vægttallet alene siger altså ikke, hvem der
 * vinder — derfor måles der HER på grupperne selv og ikke på reglerne:
 * uanset hvordan de to elever endte sammen, opdager tjekket det.
 *
 * Hvem der tælles med: kun elever der stadig står i klassen OG ikke er
 * markeret fraværende. Et spøgelse (slettet elevrække) og en fraværende elev
 * er ikke i lokalet, og generation.js filtrerer dem væk på præcis samme måde
 * — en advarsel om dem ville være falsk alarm.
 *
 * Ren funktion (ingen state-import), af samme grund som memberDisplayName.
 *
 * @param {Array} groups        grupperne som de ser ud nu
 * @param {Array} separations   klassens undgåelser ({ ids: [...] })
 * @param {Map}   [byId]        _rowId → elevrække (se buildStudentIndex).
 *                              Udelades den, tælles ALLE medlemmer med.
 * @returns {Array<{groupName: string, locked: boolean, ids: string[]}>}
 *          én post pr. undgåelse pr. gruppe hvor to eller flere sidder sammen
 */
export function brokenSeparations(groups, separations, byId) {
    const sets = [];
    for (const sep of (separations || [])) {
        const ids = (sep && Array.isArray(sep.ids)) ? sep.ids : [];
        const cleanIds = [...new Set(ids.map(id => String(id ?? '').trim()).filter(Boolean))];
        // Under to elever er ikke en undgåelse — der er ingen at holde adskilt.
        if (cleanIds.length >= 2) sets.push(cleanIds);
    }
    if (!sets.length) return [];

    const isPresent = (id) => {
        if (!byId) return true;
        const s = byId.get(id);
        return !!(s && !s._excluded);
    };

    const out = [];
    for (const g of (groups || [])) {
        const memberSet = new Set();
        for (const m of ((g && g.members) || [])) {
            const id = memberIdStr(m);
            if (id && isPresent(id)) memberSet.add(id);
        }
        if (memberSet.size < 2) continue;
        for (const ids of sets) {
            const together = ids.filter(id => memberSet.has(id));
            if (together.length >= 2) {
                out.push({
                    groupName: (g && g.name) ? String(g.name) : '',
                    locked: !!(g && g.locked),
                    ids: together,
                });
            }
        }
    }
    return out;
}

/**
 * Del klassen op i de elever generering FAKTISK rører, og dem der er låst fast.
 *
 * Tre grupper elever ser ens ud i `g.members`, men er det ikke:
 *   - fraværende (`_excluded`) — de bliver aldrig placeret
 *   - spøgelser — medlemmer af en gemt gruppe hvis elevrække er slettet siden
 *   - låste — nulevende, tilstedeværende elever i en låst gruppe
 * Kun den sidste slags er "låste elever". Tælles de to første med — og det
 * gør `g.members.length` — bliver "de N øvrige elever" for lavt, og et
 * undgå-sæt ser større ud end det generering rent faktisk skal fordele.
 *
 * Derfor tælles der her på ELEVRÆKKERNE og ikke på medlemslisterne: alt
 * tælles i samme univers, så free + locked altid giver present. Det er den
 * samme opdeling generation.js laver (activeData → generationData), og
 * grunden til at den bor her er den samme som for computeTopicAdjustedTarget:
 * hint-banneret og motoren må ikke kunne komme til at sige hver sit tal.
 *
 * @param {Array}  data          klassens elevrækker
 * @param {Array}  lockedGroups  de LÅSTE grupper i den aktive visning
 * @param {string} idCol         identitetskolonnen (altid _rowId i praksis)
 * @returns {{ free: Array, freeIds: Set<string>,
 *             presentCount: number, freeCount: number, lockedCount: number }}
 */
export function splitByLockedGroups(data, lockedGroups, idCol = ROW_ID) {
    const rows = Array.isArray(data) ? data : [];
    const present = rows.filter(s => s && !s._excluded);

    const lockedIds = new Set();
    for (const g of (lockedGroups || [])) {
        for (const m of ((g && g.members) || [])) {
            const id = memberIdStr(m);
            if (id) lockedIds.add(id);
        }
    }

    const idOf = (s) => String(s[idCol] ?? '').trim();
    const free = present.filter(s => {
        const v = idOf(s);
        return !(v && lockedIds.has(v));
    });

    return {
        free,
        freeIds: new Set(free.map(idOf).filter(Boolean)),
        presentCount: present.length,
        freeCount: free.length,
        // Aldrig negativ: begge tal kommer fra de samme rækker.
        lockedCount: present.length - free.length,
    };
}

/**
 * Fjern kolonner der er HELT tomme — både overskrift og alle celler.
 *
 * Excel gemmer et "brugt område" der ofte er langt bredere end de faktiske
 * data (celler man har skrevet i og slettet igen, eller hele kolonner der er
 * blevet formateret). sheet_to_csv skriver hele det område ud, så en elevliste
 * med 3 kolonner kommer ind som "Navn,Køn,Emne,,,,,,,,," — og de tomme felter
 * blev til kolonner der hed "Uden navn", "Uden navn_2" osv. Det samme sker når
 * man kopierer et helt kolonneudvalg (A:L) fra Excel og indsætter det.
 *
 * En kolonne med en overskrift men uden data røres IKKE — den er bevidst
 * (læreren vil udfylde den senere). Kun kolonner uden ét eneste tegn ryger.
 *
 * @param {string[][]} rows  Output fra parseCSV
 * @returns {{ rows: string[][], removed: number }}
 */
export function stripEmptyColumns(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return { rows: [], removed: 0 };

    let maxCols = 0;
    for (const r of rows) if (r.length > maxCols) maxCols = r.length;

    // Find de kolonne-indeks der har mindst ét ikke-tomt felt et sted.
    const keep = [];
    for (let c = 0; c < maxCols; c++) {
        let hasContent = false;
        for (const r of rows) {
            const cell = r[c];
            if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
                hasContent = true;
                break;
            }
        }
        if (hasContent) keep.push(c);
    }

    const removed = maxCols - keep.length;
    if (removed === 0) return { rows, removed: 0 };

    return {
        rows: rows.map(r => keep.map(c => (r[c] !== undefined ? r[c] : ''))),
        removed,
    };
}


/**
 * Hvor kommer hver elev FRA, når matrixgrupperne dannes?
 *
 * Matrixens hele pointe er én elev fra hver kilde i hver nye gruppe. Kilden er
 * enten stamgruppens navn ("Grp") eller dens emne ("Emner"), og motoren får
 * mærket ned som en skjult kolonne `__MatrixSource__` med en hård Fordel-regel.
 *
 * Funktionen bor HER og ikke i generation.js, fordi to steder skal bruge
 * præcis det samme svar: gruppedannelsen, og placeringen af en efternøler
 * (placement.js). Regnede de to hver sit mærke ud, ville en efternøler blive
 * spredt efter en kilde-inddeling, der ikke var den, grupperne blev dannet på.
 *
 * @param sourceGroups  stamgrupperne — kilden er ALTID stamgrupperne
 * @param repType       'group' (navnet) eller 'topic' (emnet, med navnet som
 *                      reserve)
 * @param topicFor      opslag af et gemt emne på gruppenavn; må mangle
 * @returns Map fra elev-id (trimmet streng) til kilde-mærke (småt)
 */
export function matrixSourceById(sourceGroups, repType = 'topic', topicFor = null) {
    const out = new Map();
    for (const g of (sourceGroups || [])) {
        if (!g || !Array.isArray(g.members)) continue;
        let source;
        if (repType === 'group') {
            source = String(g.name ?? '').trim().toLowerCase();
        } else {
            const stored = topicFor ? topicFor(g.name) : null;
            const topic = (stored && stored.trim()) ? stored.trim()
                : (g.topic && String(g.topic).trim()) ? String(g.topic).trim()
                : String(g.name ?? '');
            source = topic.toLowerCase();
        }
        for (const m of g.members) {
            const id = memberIdStr(m);
            if (id) out.set(id, source);
        }
    }
    return out;
}


// ─── Sammenligning af emner ────────────────────────────────────────────────

/**
 * Er to emner ens, uden hensyn til store/små bogstaver? Tomme er aldrig ens.
 * Brug den overalt, hvor emner sammenlignes, så forskelle i bogstaverne (fx
 * mellem det læreren skrev, og en gendannet session) ikke stille deler emnet i to.
 */
export function eqTopic(a, b) {
    if (!a || !b) return false;
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * Nøglen, to emner sammenlignes på: uden mellemrum i enderne, uden forskel på
 * store og små bogstaver og med ens tegn for é/å (NFC). Bruges, hvor emner
 * skal TÆLLES sammen (matrix-kilderne i buildEngineInput og fullMatrixInfo).
 */
export function topicKey(topic) {
    return nfc(String(topic ?? '').trim()).toLowerCase();
}

/**
 * Find `topic`s plads i `classTopics`, uden hensyn til store/små bogstaver og
 * mellemrum i enderne. Svarer -1, hvis det ikke findes, eller emnet er tomt.
 */
export function findTopicIndex(classTopics, topic) {
    if (!topic || !Array.isArray(classTopics)) return -1;
    const needle = String(topic).trim().toLowerCase();
    if (!needle) return -1;
    for (let i = 0; i < classTopics.length; i++) {
        if (String(classTopics[i] || '').trim().toLowerCase() === needle) return i;
    }
    return -1;
}

/**
 * Flet emner ind i klassens emneliste — uden hensyn til store og små bogstaver.
 *
 * Klassens egne emner beholder deres plads og stavemåde; nye kommer bagerst.
 * "Liberalisme" og "liberalisme" er ÉT emne, også når de begge står i
 * `incoming`: emnelisten runder gruppeantallet til et multiplum af antal
 * emner, så et emne for meget giver forkerte gruppestørrelser.
 *
 * Bruges af alle tre veje tilbage (kørselshistorik, gemt session, "Gendan
 * grupper"). De havde hver sin kopi, og kun den ene huskede de emner, den
 * selv lagde til.
 *
 * @returns {string[]} en NY liste
 */
export function mergeClassTopics(classTopics, incoming) {
    const merged = Array.isArray(classTopics) ? [...classTopics] : [];
    const seen = new Set(merged.map(t => String(t).trim().toLowerCase()));
    (incoming || []).forEach(t => {
        const trimmed = String(t ?? '').trim();
        const key = trimmed.toLowerCase();
        if (!trimmed || seen.has(key)) return;
        seen.add(key);
        merged.push(trimmed);
    });
    return merged;
}

/**
 * Emnet med KLASSENS stavemåde, hvis klassen har det — ellers uændret.
 *
 * Emnevælgeren på gruppekortet er en <select> med klassens emner som
 * valgmuligheder, og den matcher præcist: stod der "klima" på gruppen og
 * "Klima" i emnelisten, var vælgeren TOM, selvom gruppen havde et emne.
 */
export function classTopicSpelling(classTopics, topic) {
    const i = findTopicIndex(classTopics, topic);
    return i === -1 ? topic : classTopics[i];
}


// ─── Antal grupper: motorens eget regnestykke ─────────────────────────────

/**
 * Hvor mange NYE grupper danner motoren, og hvor store bliver de?
 *
 * Regnes af motorens EGEN funktion (`planGroupCounts` i motor/engine/sizes.js),
 * ikke af en kopi. Før 12/11 2026 havde appen sit eget regnestykke fra den
 * gamle motors tid, og de to var uenige: 24 elever, grupper på 5 med "én elev
 * ekstra" og 5 emner gav "ca. 5 grupper" i opskriften og beskeden "der skal
 * være mindst 5 grupper", mens motoren dannede 4 og selv skrev, at et emne
 * ingen gruppe fik. Med en "Opdel" var skønnet forkert i hver tredje klasse,
 * fordi motoren regner pr. pulje.
 *
 * Ind (som buildEngineInput i nextEngine.js sender det til motoren):
 *   mode        'size' (elever pr. gruppe) | 'number' (antal grupper i alt)
 *   target      tallet i feltet
 *   mod         '-' = én elev mindre; alt andet = én elev ekstra
 *   poolSizes   frie elever pr. Opdel-pulje (uden Opdel: [antal frie elever])
 *   lockedCount antal låste grupper
 *   topicCount  antal emner (0 i matrix)
 *
 * Ud: { newGroups, sizes } — sizes er de nye gruppers størrelser.
 * Null, når der ingen elever er, eller tallet ikke kan bruges.
 */
export function plannedNewGroups({ mode = 'size', target = 0, mod = '+', poolSizes = [], lockedCount = 0, topicCount = 0 } = {}) {
    const pools = (poolSizes || []).map(n => Math.max(0, Math.floor(Number(n) || 0))).filter(n => n > 0);
    const wanted = Math.floor(Number(target) || 0);
    if (!pools.length || wanted < 1) return null;
    let size;
    if (mode === 'number') {
        // Motoren får slet ikke et antal, der ikke er større end de låste
        // (buildEngineInput siger selv fra). Skønnet er da mindst én ny gruppe.
        size = { mode: 'count', count: Math.max(wanted, lockedCount + 1) };
    } else {
        size = { mode: 'perGroup', target: wanted, adjust: mod === '-' ? 'minus' : 'plus' };
    }
    const { counts } = planGroupCounts(pools, lockedCount, size, topicCount);
    const sizes = counts.flatMap((g, i) => splitEven(pools[i], g));
    return { newGroups: sizes.length, sizes };
}

/**
 * De frie elever delt i Opdel-puljer, som motoren gør det (buildTask i
 * motor/engine/task.js): én pulje pr. kombination af Opdel-kolonnernes værdier,
 * sammenlignet med valueKey (en tom celle er sin egen pulje). Uden en Opdel
 * med kolonne er hele holdet én pulje.
 *
 * @param {Array} freeRows  tilstedeværende elever uden for låste grupper
 * @param {Array} rules     klassens regler (kun stamgrupper har Opdel)
 * @returns {number[]} elever pr. pulje
 */
export function poolSizesFor(freeRows, rules) {
    const rows = Array.isArray(freeRows) ? freeRows : [];
    const columns = (rules || [])
        .filter(r => r && (r.type || r.name) === RULE_TYPES.AGGREGATE)
        .map(r => r.column || r.attribute)
        .filter(Boolean);
    if (!columns.length) return rows.length ? [rows.length] : [];
    const counts = new Map();
    for (const row of rows) {
        const key = JSON.stringify(columns.map(c => valueKey(ownCell(row, c) ?? '')));
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.values()];
}

/**
 * Hvad emnerne gør ved antallet af grupper, når læreren har valgt en
 * størrelse. Returnerer null, når der intet er at regne på (ingen emner eller
 * elever).
 *
 * Begge tal kommer fra plannedNewGroups ovenfor — altså fra motoren selv:
 * det rå antal er motorens tal UDEN emner, det justerede er tallet MED.
 * hints.js forklarer forskellen, og recipe.js (expectedNewGroups) viser det
 * justerede som skøn i opskriften.
 *
 * Motorens regler (spec. 4.4, Kenneths svar 40 og 41): totalen (med de låste)
 * rundes til et multiplum af antal emner — ned ved "én elev ekstra", op ved
 * "én elev mindre" — men kun når alle grupper bagefter holder lærerens
 * størrelse. Én undtagelse: giver "én elev mindre" færre grupper end emner,
 * får hvert emne alligevel én gruppe. Ved "én elev ekstra" bliver størrelsen
 * stående, og motoren skriver selv, at et emne ingen gruppe får.
 *
 * Ind:
 *   mode          'size' | 'number'
 *   sizeNum       ønsket gruppestørrelse (kun størrelses-tilstand)
 *   sizeMod       '+' | '-'                 (kun størrelses-tilstand)
 *   numberTarget  grupper i alt, låste iberegnet (kun antals-tilstand)
 *   studentCount  frie elever: uden låste grupper og uden fraværende
 *   poolSizes     de frie elever pr. Opdel-pulje (udeladt: én pulje)
 *   lockedCount   antal låste grupper
 *   topicCount    antal emner på klassen
 *
 * Ud: null, eller
 *   { naiveNew, adjustedNew,
 *     naiveTotal, adjustedTotal,
 *     naiveSizes, adjustedSizes,           (de nye gruppers størrelser)
 *     direction:  'up' | 'down' | 'none',
 *     didAdjust:  boolean }
 *   hvor *Total = *New + lockedCount.
 */
export function computeTopicAdjustedTarget({
    mode,
    sizeNum = 0,
    sizeMod = '',
    numberTarget = 0,
    studentCount = 0,
    poolSizes = null,
    lockedCount = 0,
    topicCount = 0,
}) {
    if (topicCount <= 0 || studentCount <= 0) return null;
    const common = {
        mode,
        target: mode === 'number' ? numberTarget : sizeNum,
        mod: sizeMod,
        poolSizes: Array.isArray(poolSizes) && poolSizes.length ? poolSizes : [studentCount],
        lockedCount,
    };
    const naive = plannedNewGroups({ ...common, topicCount: 0 });
    const adjusted = plannedNewGroups({ ...common, topicCount });
    if (!naive || !adjusted) return null;

    const naiveTotal = naive.newGroups + lockedCount;
    const adjustedTotal = adjusted.newGroups + lockedCount;
    let direction = 'none';
    if (adjustedTotal > naiveTotal) direction = 'up';
    else if (adjustedTotal < naiveTotal) direction = 'down';

    return {
        naiveNew: naive.newGroups,
        adjustedNew: adjusted.newGroups,
        naiveTotal,
        adjustedTotal,
        naiveSizes: naive.sizes,
        adjustedSizes: adjusted.sizes,
        direction,
        didAdjust: naiveTotal !== adjustedTotal,
    };
}

/**
 * Foreslå det næste multiplum af antallet af emner over lærerens valgte antal
 * grupper. Bruges ved "Antal grupper", når tallet ikke går op i antallet af
 * emner, så hvert emne får lige mange grupper.
 *
 * Svarer null, hvis numberTarget allerede er et multiplum, eller tallene er ugyldige.
 */
export function suggestTopicMultiple({ numberTarget, lockedCount = 0, topicCount }) {
    if (topicCount <= 0 || numberTarget <= 0) return null;
    if (numberTarget % topicCount === 0) return null;
    const nextMultiple = Math.ceil(numberTarget / topicCount) * topicCount;
    const nextNew = Math.max(1, nextMultiple - lockedCount);
    const minPerTopic = Math.floor(numberTarget / topicCount);
    return { nextMultiple, nextNew, minPerTopic };
}

/**
 * Er cellen et tal? Motorens EGEN tolkning (`parseNumber` i
 * motor/engine/values.js, spec. 3.2): kun cifre, evt. fortegn og højst ét
 * decimaltegn (komma eller punktum). "7,5" og "7.5" er 7,5; "7 dage", "nan",
 * "0x1A" og "1.000,5" er tekst.
 *
 * Til 13/11 2026 havde appen sin egen læsning her (fra tiden med Python-
 * motoren), og de to var uenige to steder: appen læste "1e3" som 1000
 * (motoren: tekst), og motoren læser "- 5" som -5 (appen: tekst). Så kunne
 * gruppekortets snit, sorteringen og advarslerne regne en celle med, som
 * motoren placerede frit, og omvendt. Nu er der én definition.
 */
export function cellIsNumber(raw) {
    return cellNumber(raw) !== null;
}

/**
 * Cellens TALVÆRDI — eller `null`, hvis den ikke er et tal.
 *
 * Samme tolkning som `cellIsNumber()` ovenfor; de deler krop, så de to aldrig
 * kan sige hver sit om den samme celle. Brug den overalt hvor en celleværdi
 * skal regnes på, og brug ALDRIG `parseFloat()` direkte:
 *
 *   parseFloat("7,5")  → 7      (kommaet stopper læsningen)
 *   parseFloat("7 dage") → 7    (resten smides væk)
 *   cellNumber("7,5")  → 7.5
 *   cellNumber("7 dage") → null
 *
 * Netop `parseFloat` stod på gruppekortets snit-udregning, og på en dansk
 * karakterkolonne (7,5 · 2,5) viste kortet 4,5, hvor motoren havde balanceret
 * på 5,0 — se `GroupCard.vue`.
 */
export function cellNumber(raw) {
    return parseNumber(raw);
}

/**
 * Sorteringsnøglens sammenligning af to celler — tal som tal, tekst som tekst.
 *
 * Elevtabellen sorterede før med `parseFloat`, og den læser en celle på en
 * TREDJE måde end resten af appen: den standser ved det første tegn der ikke
 * kan være et tal, og beholder det den nåede. "20 99 99 99" og "20 11 11 11"
 * blev derfor begge til tallet 20, sammenligningen svarede "ens", og de to
 * rækker blev stående i den rækkefølge de tilfældigvis stod i. En
 * telefonkolonne så altså sorteret ud uden at være det — og en lærer der
 * leder efter et nummer, leder i en liste hun tror er ordnet.
 *
 * `cellNumber()` siger nej til hele cellen i stedet, og så falder den
 * igennem til collatoren, som med `numeric: true` sorterer "20 11 11 11" før
 * "20 99 99 99". Det er samme rettelse som gruppekortets snit fik (se
 * `GroupCard.vue`) — dér var det "7,5", der blev læst som 7.
 *
 * Collatoren skal blive: uden tal-grenen ville "7,5" komme EFTER "7,25"
 * (collatoren sammenligner 5 med 25), og på karakterskalaen ville "02" komme
 * før "-3".
 *
 * Rækkefølgen (stigende) er: tal først i talrækkefølge, derefter tekst i
 * dansk alfabetisk orden. Tomme celler er ikke tal og lander forrest.
 */
const cellCollator = new Intl.Collator('da', { numeric: true });

export function compareCellValues(a, b) {
    const numA = cellNumber(a);
    const numB = cellNumber(b);
    if (numA !== null && numB !== null) return numA - numB;
    return cellCollator.compare(String(a ?? ''), String(b ?? ''));
}

/**
 * Hvor mange af de UDFYLDTE celler i kolonnen er tal?
 *
 * Spejler logic.count_numeric_cells i Python. Tomme celler tælles ikke med
 * nogen af stederne — "ikke udfyldt" er sin egen tilstand.
 *
 * @returns {{numeric: number, filled: number, examples: string[]}}
 *          `examples` er op til tre udfyldte værdier, der IKKE er tal.
 */
export function columnNumericStats(rows, col) {
    const out = { numeric: 0, filled: 0, examples: [] };
    if (!col || !Array.isArray(rows)) return out;
    for (const r of rows) {
        const text = String((r || {})[col] ?? '').trim();
        if (text === '') continue;
        out.filled++;
        if (cellIsNumber(text)) out.numeric++;
        // FORSKELLIGE eksempler: står der "ukendt" i 18 celler, hjælper det
        // ingen at få det at vide tre gange. Samme valg som logic.count_numeric_cells.
        else if (out.examples.length < 3 && !out.examples.includes(text)) out.examples.push(text);
    }
    return out;
}

/**
 * Kan kolonnen bære en TAL-regel — er FLERTALLET af værdierne tal?
 *
 * Samme tærskel som logic.column_has_numbers i Python, og af samme grund: da
 * spørgsmålet var "er der mindst ÉN celle med et tal?", kunne én enkelt celle
 * med "3" i stedet for "Middel" slukke både advarslen og knappen "Ranger værdierne…"
 * for hele klassen.
 */
export function columnIsNumeric(rows, col) {
    const { numeric, filled } = columnNumericStats(rows, col);
    return filled > 0 && numeric * 2 > filled;
}

/**
 * (Flyttet hertil fra hints.js 26/10 2026, så opskriften i beta bruger samme regel.)
 *
 * Er kolonnen rangeret PÅ EN MÅDE der rammer mindst én elev?
 *
 * Selve rækkefølgen skal have mindst to trin for at være en skala — og mindst
 * én elev skal have en værdi, der står i den. Ellers er rang-kolonnen tom hele
 * vejen ned, og reglen gør nøjagtig lige så lidt som uden rangering.
 * Sammenligningen er ufølsom for store/små bogstaver og mellemrum, samme regel
 * som applyColumnOrders i utils.js — og begge bruger valueKey(), som er
 * motorens egen nøgle (normalizeText i motor/engine/values.js).
 */
export function rankingAffectsColumn(rows, col, order) {
    if (!Array.isArray(order) || order.length < 2) return false;
    const seen = new Set();
    for (const v of order) {
        if (v == null) continue;
        const n = valueKey(v);
        if (n) seen.add(n);
    }
    // To TRIN, ikke to linjer: "Lav" og "lav" er samme trin for motoren, og
    // en skala med ét trin kan ingen regel bruge.
    if (seen.size < 2) return false;
    return (rows || []).some(s => seen.has(valueKey(ownCell(s, col))));
}

/**
 * Rækkefølgen på en tekstkolonne — "Lav < Middel < Høj".
 *
 * Kolonnen gemmes som `class.columnOrders = { "Aktivitetsniveau": ["Lav", …] }`.
 * Rangeringen beskriver KOLONNEN, ikke kørslen, og bor derfor som sit eget felt
 * på klassen — ikke i `settings`, som `runHistory.restoreSession()` erstatter i
 * sin helhed, når læreren går tilbage til en tidligere kørsel med indstillinger.
 * Havde den ligget dér, ville en rangering lavet EFTER den kørsel forsvinde
 * uden en lyd.
 */
export const RANK_PREFIX = '__Rang:';
const RANK_SUFFIX = '__';

/** De regler der kun kan arbejde med tal — plus "Saml", der bliver bedre af det. */
const RANKABLE_RULES = Object.freeze([
    RULE_TYPES.BALANCE,
    RULE_TYPES.MINIMIZEDIFF,
    RULE_TYPES.GROUP_SORT,
]);

function _rankColumnName(col, taken) {
    let name = `${RANK_PREFIX}${col}${RANK_SUFFIX}`;
    // Har læreren mod forventning en kolonne der hedder præcis det samme, må vi
    // ikke skrive oven i den — så ville hendes egne data forsvinde ud af CSV'en.
    let n = 2;
    while (taken.has(name)) {
        name = `${RANK_PREFIX}${col}#${n}${RANK_SUFFIX}`;
        n++;
    }
    return name;
}

/**
 * Læg en skjult tal-kolonne ved siden af hver rangeret kolonne, og peg de
 * tal-regler der bruger den, over på den.
 *
 * **Hvorfor ved siden af og ikke i stedet for?** Erstattede vi Lav/Middel/Høj
 * med 1/2/3, ville motoren virke — men Pythons lærervendte advarsler ville
 * begynde at sige "2" i stedet for "Middel" (klynge-singletons, "eleverne blev
 * ikke fundet", emnenavne i rum-advarslerne). At oversætte tal tilbage til ord
 * inde i fri prosa er skrøbeligt. Med en parallel kolonne står tekstkolonnen
 * urørt, og ALLE de advarsler er rigtige af sig selv; tilbage-oversættelsen
 * skrumper til ét kolonnenavn, som er entydigt (`labelMap`).
 *
 * De kategoriske regler (Fordel, Klyng, Adskil, Opdel) bliver bevidst stående
 * på tekstkolonnen — de virker allerede, og de skal blive ved med at tale om
 * "Middel".
 *
 * Rang-kolonnen laves kun for kolonner der FAKTISK bruges af en tal-regel.
 * Ellers ville en gammel rangering på en kolonne, ingen regel rører, sende en
 * ekstra kolonne med i CSV'en uden at udrette noget.
 *
 * Opslaget er ufølsomt for store/små bogstaver og mellemrum, så rangeringen er
 * uafhængig af `canonicalizeCategoricalCasing()` og kan køre før eller efter
 * den uden at ændre resultat.
 *
 * @param {Array}  data    elevrækker (muteres ALDRIG — der returneres kopier)
 * @param {Array}  rules   regler i motor-form ({name, attribute}) eller UI-form
 *                         ({type, column}) — begge forstås
 * @param {Object} orders  { kolonne: [værdi, værdi, …] } nedefra og op
 * @returns {{data: Array, rules: Array, labelMap: Object, unranked: Array}}
 *          `labelMap` oversætter rang-kolonnenavn → lærerens kolonnenavn.
 *          `unranked` er [{ column, count, values }] for elever med en værdi,
 *          der ikke står i rangeringen — `values` er op til tre eksempler, så
 *          beskeden kan sige HVAD der mangler og ikke bare hvor mange. En TOM
 *          celle tæller ikke med: "ikke udfyldt" er sin egen tilstand, som
 *          motoren allerede håndterer rigtigt.
 */
export function applyColumnOrders(data, rules, orders) {
    const rows = Array.isArray(data) ? data : [];
    const rulesArr = Array.isArray(rules) ? rules : [];
    const unchanged = { data, rules, labelMap: {}, unranked: [] };

    if (!orders || typeof orders !== 'object' || Array.isArray(orders)) return unchanged;
    if (rows.length === 0 || rulesArr.length === 0) return unchanged;

    // Hvilke kolonner har både en rangering OG en tal-regel der peger på dem?
    const used = new Set();
    for (const r of rulesArr) {
        if (!r) continue;
        const type = String(r.name || r.type || '').toLowerCase();
        if (!RANKABLE_RULES.includes(type)) continue;
        const col = r.attribute || r.column || '';
        if (col) used.add(col);
    }
    if (used.size === 0) return unchanged;

    // Alle rækkers nøgler, ikke kun den førstes — rækker kan have huller (se
    // columnsOfRows). En lærerkolonne, der først optræder i række to, skal
    // også være "taget", ellers kunne rang-kolonnen skrive oven i den.
    const taken = new Set(columnsOfRows(rows));
    const rankCols = Object.create(null);   // kolonne -> rang-kolonnenavn
    const lookups = Object.create(null);    // kolonne -> Map<småt, rang>
    const labelMap = Object.create(null);   // rang-kolonnenavn -> kolonne

    for (const col of used) {
        const order = orders[col];
        if (!Array.isArray(order) || order.length === 0) continue;

        const lookup = new Map();
        let rank = 0;
        for (const v of order) {
            if (v == null) continue;
            const key = valueKey(v);
            if (key === '' || lookup.has(key)) continue;  // dublet: første vinder
            lookup.set(key, ++rank);
        }
        if (lookup.size === 0) continue;

        const rankCol = _rankColumnName(col, taken);
        taken.add(rankCol);
        rankCols[col] = rankCol;
        lookups[col] = lookup;
        labelMap[rankCol] = col;
    }

    // Hvor mange elever RAMMER rangeringen, og hvor mange gør ikke? Tælles før
    // rang-kolonnerne skrives, fordi svaret afgør om de overhovedet skal
    // skrives. En tom celle er hverken det ene eller det andet.
    const stats = Object.create(null);   // kolonne -> { ramt, count, values:Set }
    for (const col of Object.keys(rankCols)) {
        const s = { hit: 0, count: 0, values: new Set() };
        for (const row of rows) {
            const raw = row[col];
            const text = raw == null ? '' : String(raw).trim();
            if (text === '') continue;       // ikke udfyldt — ikke urangeret
            if (lookups[col].get(valueKey(text)) !== undefined) { s.hit++; continue; }
            s.count++;
            if (s.values.size < 3) s.values.add(text);
        }
        stats[col] = s;
    }

    // Urangerede elever siges højt uanset hvad — også når rangeringen bliver
    // droppet nedenfor. Det er netop dér, beskeden betyder mest.
    const unranked = Object.keys(stats)
        .filter(col => stats[col].count > 0)
        .map(col => ({ column: col, count: stats[col].count, values: [...stats[col].values] }));

    // En rangering, INGEN elev rammer, er ikke en rangering. Skrev vi den
    // alligevel, blev rang-kolonnen tom hele vejen ned — og så siger motoren
    // "Reglen "Ensartede" på "Niveau" gør ingenting: ingen elever har en værdi
    // i den kolonne", hvilket er direkte forkert: de har alle sammen en værdi,
    // den står bare ikke i rangeringen. Lader vi i stedet reglen blive på
    // tekstkolonnen, får læreren motorens rigtige besked ("kan kun arbejde med
    // tal, og der står tekst i kolonnen") oveni vores egen om de urangerede.
    // Sker fx når klasselisten skiftes ud med en, der bruger andre ord.
    for (const col of Object.keys(rankCols)) {
        if (stats[col].hit > 0) continue;
        delete labelMap[rankCols[col]];
        delete rankCols[col];
    }

    const active = Object.keys(rankCols);
    if (active.length === 0) return { data, rules, labelMap: {}, unranked };

    // Skriv rang-kolonnerne. Rækkerne kopieres fladt — de deles med den
    // reaktive klasse-tilstand og må aldrig muteres (samme regel som
    // canonicalizeCategoricalCasing).
    const newData = rows.map(row => {
        const out = { ...row };
        for (const col of active) {
            const raw = row[col];
            const text = raw == null ? '' : String(raw).trim();
            const rank = text === '' ? undefined : lookups[col].get(valueKey(text));
            // Tom celle ELLER en værdi uden for rangeringen (fx en efternøler
            // med et nyt niveau) bliver TOM — ikke 0.
            //
            // Målt, og modsat af hvad man skulle tro: et nul gør dem til en
            // helt egen værdi, og så holder varians-straffen dem SAMLET i én
            // gruppe for sig (0 ud af 20 kørsler blandede dem ind blandt de
            // øvrige, mod 21 med en tom celle). Det er præcis den "aktivt
            // spredt ud"-fejl, kodebasen tidligere har ryddet op i for tomme
            // celler. "Ikke udfyldt" er en tilstand begge motorer allerede
            // håndterer rigtigt — værn: test_column_rank.py.
            out[rankCols[col]] = rank === undefined ? '' : String(rank);
        }
        return out;
    });

    // Peg tal-reglerne over på rang-kolonnen. Regel-objekterne kopieres.
    //
    // `sourceAttribute` følger med: motoren skal kunne se, at reglen EGENTLIG
    // handler om lærerens tekstkolonne. Uden det stod "Saml" på
    // `__Rang:Niveau__` mens "Fordel" stod på `Niveau`, og motorens
    // konflikt-tjek — der grupperer på kolonnenavnet — kunne ikke se, at de to
    // regler slås om den samme kolonne. Advarslen forsvandt altså i det
    // øjeblik læreren rangerede.
    const newRules = rulesArr.map(r => {
        if (!r) return r;
        const type = String(r.name || r.type || '').toLowerCase();
        if (!RANKABLE_RULES.includes(type)) return r;
        const col = r.attribute || r.column || '';
        const rankCol = rankCols[col];
        if (!rankCol) return r;
        const out = { ...r };
        if ('attribute' in out) out.attribute = rankCol;
        if ('column' in out) out.column = rankCol;
        out.sourceAttribute = col;
        return out;
    });

    return { data: newData, rules: newRules, labelMap, unranked };
}

/**
 * Dagens dato som ÅÅÅÅ-MM-DD i lærerens egen tidszone.
 *
 * toISOString() er UTC: henter man en fil kl. 01:00 dansk sommertid, får den
 * gårsdagens dato på sig og lander forkert i lærerens mappe. Bruges af
 * backup-eksporten (ExportSection.vue) og Del-menuens Excel-filer.
 */
export function todayStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Gør et klassenavn til et lovligt filnavn: alt andet end bogstaver (også
 * æøå), tal, mellemrum, bindestreg og understreg bliver til "_".
 *
 * "3.a" og "3/a" bliver begge til "3_a". Skal navnet være UNIKT — fx i en zip
 * med flere klasser — må kalderen selv sørge for det (se uniqueZipName i
 * ExportSection.vue).
 */
export function safeFileName(rawName) {
    return String(rawName || 'Klasse').replace(/[^a-z0-9æøåÆØÅ \-_]/gi, '_') || 'Klasse';
}
