// lectio.js — genkend en elevliste kopieret fra Lectio.
//
// Lectio skriver én elev pr. linje med holdet bagefter:
//   "Fornavn Mellemnavn Efternavn, 2Tz 04 (2Tz)"
// Importen skal kun have navnene. Funktionerne lå før inde i
// ImportSection.vue, hvor intet kunne teste dem — og det er den indgang,
// forsiden selv peger på ("Indsæt klasseliste direkte fra Lectio").
// Værn: lectio.test.js med testdata/lectio_elevliste.txt og Lectios to
// sider (testdata/lectio_lektion.txt og lectio_laerere_og_elever*.txt).

import { HEADER_WORDS } from './headerWords.js';

// Holdet til sidst på linjen: ", <hold> <nr> (<hold>)". Genkendelsen kræver
// også et navn FØR kommaet — en linje med kun holdet er ikke en elev.
//
// Holdnavnet må have mellemrum ("2a SA 04 (2a SA)"). Før krævede mønstret et
// hold uden mellemrum, og så blev en sådan liste slet ikke genkendt: holdet
// kom med ind i navnekolonnen. Holdet må bare ikke indeholde komma eller
// parentes — så kan mønstret ikke række ind i selve navnet. Parentesen skal
// ikke være ens med holdet foran; vi ved ikke, om Lectio altid skriver det
// samme begge steder.
const LECTIO_SUFFIX = /,\s*[^,()]*\S\s+\d+\s+\([^()]*\S[^()]*\)\s*$/;

/**
 * Har linjen holdet til sidst OG et navn foran? Før stod det som ét mønster
 * ("^.*\S.*" + holdet), men de to `.*` gjorde det kvadratisk: en indsat
 * Excel-liste på 300 × 20 celler kostede ca. 40 ms ved hver ændring i feltet,
 * én lang linje 150–200 ms. Holdet til sidst kan kun begynde ét sted (der er
 * intet komma og ingen parentes mellem dets komma og parentesen), så det er
 * samme svar at finde holdet og så se efter et navn foran det.
 */
function isLectioLine(line) {
    const match = LECTIO_SUFFIX.exec(line);
    return match !== null && /\S/.test(line.slice(0, match.index));
}

/** Ikke-tomme linjer — også når teksten kommer med Windows-linjeskift. */
function lines(text) {
    return String(text ?? '').trim().split('\n').filter(l => l.trim());
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lectio har to sider med elevlisten (set i Kenneths kopier 14/11 2026,
// testdata/lectio_*.txt med opdigtede navne):
//
// 1. Lektionens side: "Elever:" efterfulgt af én elev pr. linje, som ovenfor.
//    Markerer læreren hele blokken, kommer sidens andre linjer med
//    ("Tidspunkt: …", "Type: Lektion", "Ingen forløb.", "Antal elever: 29"),
//    og den første elev står efter "Elever:" og en tabulator.
// 2. "Lærere og elever": en tabel med overskriften Type, ID, Fornavn,
//    Efternavn (og evt. flere kolonner, tomme eller ej) og en række pr.
//    person. Læreren står der også ("Lærer"), og over og under står sidens
//    menu og "Antal elever: 29, …".
//
// Før blev ingen af dem genkendt: lektionssiden gav 44 "elever" med
// sidens tekst imellem, og tabellen gav hele rækken i én celle og læreren
// som elev (61). readLectio() er DEN ene læsning; genkendelsen
// (isLectioFormat, kører ved hvert tastetryk) og importen
// (extractLectioNames) bruger den begge, så de ikke kan være uenige.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Er linjen tekst fra Lectios side og ikke en elev? Et kolon ("Type:
 * Lektion", "Antal elever: 29") eller et punktum til sidst ("Ingen
 * forløb."). Et navn skrevet til i hånden har ingen af delene — heller ikke
 * "Hansen, Bo" — så det kommer stadig med.
 */
function isPageText(line) {
    return line.includes(':') || /\.\s*$/.test(line);
}

/** Navnet på en Lectio-linje: før holdet, efter en evt. "Elever:" + tabulator. */
function nameOnLine(line) {
    const beforeHold = line.replace(LECTIO_SUFFIX, '');
    return beforeHold.slice(beforeHold.lastIndexOf('\t') + 1).trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Lærerens egen liste ved siden af en Lectio-liste (161. gennemsyn, (185))
//
// Indsætter læreren en Lectio-liste og sin egen liste fra Excel i samme felt
// (fx "Ida Lund" + tabulator + "Pige" over eller under), læses det hele som
// Lectio, og kun navnene kommer med. Før blev en sådan linje til ÉN elev,
// der hed "Ida Lund<tabulator>Pige", og under "Lærere og elever" forsvandt
// den helt i stilhed sammen med sidens menu.
//
// Tabulatoren er tegnet: et navn fra Lectio har aldrig en tabulator (kun
// "Elever:" + tabulator foran den første, og den linje er allerede
// genkendt). Et komma er IKKE et tegn — "Hansen, Bo" er ét navn, med vilje.
// Nu bliver første celle navnet, og mærket under feltet siger, hvor mange
// linjer der havde flere kolonner, så læreren ved, at fx Køn ikke kom med.
// En linje med kun kolonnenavne ("Navn" + tabulator + "Køn") er ikke en elev.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * En linje fra lærerens egen liste: celler adskilt af tabulator. Svaret er
 * første ikke-tomme celle (navnet), om der var flere celler med indhold, og
 * om alle cellerne er kolonnenavne — eller null uden tabulator. Linjen
 * skal være den rå linje: trim() fjerner tomme celler til sidst og dermed
 * tabulatoren i "Ida Lund" + tabulator + tabulator.
 *
 * @returns {{ name: string, dropped: boolean, header: boolean } | null}
 */
function ownRow(line) {
    if (!line.includes('\t')) return null;
    const filled = line.split('\t').map(c => c.trim()).filter(Boolean);
    if (filled.length === 0) return null;
    return {
        name: filled[0],
        dropped: filled.length > 1,
        header: filled.every(c => HEADER_WORDS.has(c.toLowerCase())),
    };
}

/**
 * Side 1: linjer med holdet til sidst. Linjerne mellem den første og den
 * sidste elev tæller alle med (en linje skrevet til i hånden dér er en elev,
 * som før). Uden for dem springes sidens tekst over (isPageText), men et navn
 * skrevet til i hånden før eller efter listen kommer stadig med. Mindst 80 %
 * af de linjer, der kommer med, skal have holdet til sidst, og mindst to.
 *
 * To lektionssider efter hinanden (fx to hold, der skal i grupper sammen)
 * har sidens tekst midt i: "Antal elever: 29", "Tidspunkt: …", "Ingen
 * forløb." … Før kom de linjer med som elever, og så faldt 80 %-reglen, så
 * HELE teksten blev læst som en almindelig liste: 90 "elever" med
 * "Tidspunkt:" øverst og holdet i en kolonne for sig (159. gennemsyn, (182)).
 * Nu springes sådan et stykke over (pageGaps) — men kun et stykke på mindst
 * to linjer, der ALLE er sidens tekst, med mindst to elever på hver side.
 * Én linje skrevet til i hånden mellem eleverne er stadig en elev.
 */
function readLectioLines(all) {
    const matched = all.map(l => isLectioLine(l.trim()));
    const first = matched.indexOf(true);
    const last = matched.lastIndexOf(true);
    if (first < 0 || first === last) return null;
    const gap = pageGaps(all, matched, first, last);

    const names = [];
    let hits = 0;
    let skipped = 0;
    let trimmed = 0;        // linjer fra lærerens egen liste med flere kolonner (185)
    all.forEach((raw, i) => {
        const line = raw.trim();
        if (matched[i]) { hits++; names.push(nameOnLine(line)); return; }
        if ((i < first || i > last || gap[i]) && isPageText(line)) { skipped++; return; }
        const own = ownRow(raw);   // raw: også "Navn" + tomme celler til sidst
        if (own?.header) { skipped++; return; }
        if (own) { names.push(own.name); if (own.dropped) trimmed++; return; }
        names.push(line);
    });
    if (hits < Math.ceil(names.length * 0.8)) return null;
    return { names, skipped, trimmed };
}

/**
 * Hvilke linjer mellem den første og den sidste elev er sidens tekst fra en
 * lektionsside nummer to? Et stykke uden hold på mindst to linjer, hvor hver
 * linje er sidens tekst (isPageText), og med mindst to elever lige før og
 * lige efter. Ét gennemløb: genkendelsen kører ved hvert tastetryk.
 *
 * Kravet om to elever på hver side er værnet mod, at en tekst med to
 * tilfældige Lectio-agtige linjer og nogle klokkeslæt ("10:09") imellem
 * bliver til Lectio — så ville resten forsvinde i stilhed.
 *
 * @returns {boolean[]} true for linjer i sådan et stykke
 */
function pageGaps(all, matched, first, last) {
    const gap = new Array(all.length).fill(false);
    let i = first;
    let runBefore = 0;      // elever lige før det stykke, vi står i
    while (i <= last) {
        if (matched[i]) { runBefore++; i++; continue; }
        let end = i;        // stykket uden hold: i .. end-1
        while (end <= last && !matched[end]) end++;
        let runAfter = 0;
        while (end + runAfter <= last && matched[end + runAfter]) runAfter++;
        const pageText = end - i >= 2 && all.slice(i, end).every(l => isPageText(l.trim()));
        if (pageText && runBefore >= 2 && runAfter >= 2) {
            for (let k = i; k < end; k++) gap[k] = true;
        }
        runBefore = 0;
        i = end;
    }
    return gap;
}

// Overskriften i "Lærere og elever": de fire første celler.
const TABLE_HEADER = ['type', 'id', 'fornavn', 'efternavn'];

/** Er linjen tabellens overskrift? Billig prøve først (kører ved hvert tastetryk). */
function isTableHeader(line) {
    return /^\s*type\t/i.test(line)
        && TABLE_HEADER.every((h, i) => (line.split('\t')[i] || '').trim().toLowerCase() === h);
}

/**
 * Side 2: tabellen. Kun rækker med typen "Elev" kommer med, som "Fornavn
 * Efternavn". Læreren, sidens menu over tabellen og optællingen under den
 * springes over; en linje uden tabulator skrevet til i hånden efter
 * overskriften kommer med (samme regel som side 1). Celler med kun et hårdt
 * mellemrum (U+00A0, som Lectio fylder tomme kolonner med) er tomme —
 * trim() fjerner det.
 */
function readLectioTable(all) {
    // Billig prøve først: genkendelsen kører ved hvert tastetryk, også på en
    // stor Excel-liste.
    const header = all.findIndex(isTableHeader);
    if (header < 0) return null;

    // En lektionsside FØR tabellen (fx to hold, hvor læreren har kopieret
    // fra hver sin side) læses som side 1. Før regnedes alt over overskriften
    // for menu, så lektionens elever forsvandt i stilhed (160. gennemsyn,
    // (184)). Kun op til og med den sidste elev med holdet til sidst: linjerne
    // derefter er tabelsidens egen menu ("Lærere og elever", "menu" …), som
    // ellers ville blive elever. Et navn skrevet til i hånden lige dér
    // springes derfor også over.
    const names = [];
    let students = 0;
    let skipped = 0;
    let trimmed = 0;
    let menuFrom = 0;       // alt over overskriften er sidens menu …
    const lastBefore = findLastIndex(all, header, l => isLectioLine(l.trim()));
    const before = lastBefore > 0 ? readLectioLines(all.slice(0, lastBefore + 1)) : null;
    if (before) {           // … undtagen en lektionsside dér
        names.push(...before.names);
        students += before.names.length;
        skipped = before.skipped;
        trimmed = before.trimmed;
        menuFrom = lastBefore + 1;
    }
    // … og lærerens egen liste med tabulator (185). Lectios menu har ingen
    // tabulator; har den alligevel, står der et kolon ("Vis:") og den er
    // sidens tekst.
    for (const raw of all.slice(menuFrom, header)) {
        const own = ownTableRow(raw);
        if (own && !own.header) { names.push(own.name); if (own.dropped) trimmed++; }
        else skipped++;
    }

    // Linjer skrevet til i hånden siden sidste elev. Kommer der en
    // overskrift igen (siden kopieret to gange, fx to hold), var de i stedet
    // den næste sides menu ("Lærere og elever", "menu" …) og springes over,
    // ligesom menuen over den første overskrift (159. gennemsyn, (182)).
    let loose = [];
    for (const raw of all.slice(header + 1)) {
        const line = raw.trim();
        // En lektionsside EFTER tabellen: elever med holdet til sidst. Før kom
        // de med holdet i navnet (", 2a 02 (2a)"), og den første ("Elever:" +
        // tabulator) forsvandt (184). Resten af lektionssiden har kolon,
        // punktum eller tabulator og springes over nedenfor.
        if (isLectioLine(line)) {
            names.push(...loose, nameOnLine(line));
            loose = [];
            students++;
            continue;
        }
        const cells = raw.split('\t').map(c => c.trim());
        if (isTableHeader(raw)) {
            skipped += loose.length + 1;
            loose = [];
            continue;
        }
        if (cells.length >= 4 && cells[0].toLowerCase() === 'elev') {
            const name = (cells[2] + ' ' + cells[3]).replace(/\s+/g, ' ').trim();
            if (name) { names.push(...loose, name); loose = []; students++; continue; }
        }
        if (cells.length === 1 && !isPageText(line)) { loose.push(line); continue; }
        // Lærerens egen liste under tabellen (185). Før forsvandt den her.
        const own = ownTableRow(raw);
        if (own && !own.header) { names.push(own.name); if (own.dropped) trimmed++; continue; }
        skipped++;
    }
    names.push(...loose);
    if (students < 2) return null;
    return { names, skipped, trimmed };
}

/**
 * En række fra lærerens egen liste ved siden af tabellen "Lærere og elever"
 * (185) — men ikke tabellens egne rækker (typen "Elev" eller "Lærer" i første
 * celle, overskriften) og ikke sidens tekst (kolon eller punktum).
 */
function ownTableRow(raw) {
    const own = ownRow(raw);
    if (!own || isTableHeader(raw) || isPageText(own.name)) return null;
    const type = raw.split('\t')[0].trim().toLowerCase();
    return type === 'elev' || type === 'lærer' ? null : own;
}

/** Sidste plads før `end`, hvor test(linje) er sand — ellers -1. */
function findLastIndex(all, end, test) {
    for (let i = end - 1; i >= 0; i--) if (test(all[i])) return i;
    return -1;
}

/**
 * Læs en tekst som en Lectio-liste. Svaret er navnene (én pr. elev),
 * antallet af linjer fra Lectios side, der er sprunget over, og antallet af
 * linjer fra lærerens egen liste, hvor kun første kolonne kom med (185) —
 * eller null, når teksten ikke er fra Lectio.
 *
 * @returns {{ names: string[], skipped: number, trimmed: number } | null}
 */
export function readLectio(text) {
    const all = lines(text);
    if (all.length < 2) return null;
    return readLectioTable(all) || readLectioLines(all);
}

/**
 * Ligner teksten en Lectio-liste? Se readLectio(). Én linje alene er ikke
 * nok at dømme på.
 */
export function isLectioFormat(text) {
    return readLectio(text) !== null;
}

/**
 * Navnene alene, én pr. linje — holdet bagefter fjernet.
 *
 * Teksten læses bagefter som CSV (createClass), og den gætter skilletegnet.
 * Et navn med komma — fx en linje skrevet til i hånden, "Hansen, Bo" — fik
 * så HELE klassen to kolonner: "Hansen" i Navn, "Bo" i en ny "Info 1", og
 * en tom "Info 1" hos alle de andre. Et navn med skilletegn sættes derfor i
 * anførselstegn (CSV's egen måde at sige "ét felt" på).
 */
export function extractLectioNames(text) {
    const read = readLectio(text);
    // Ikke fra Lectio: som før, linjerne med et evt. hold fjernet. Kalderen
    // spørger altid isLectioFormat() først, så det sker kun i testene.
    const names = read ? read.names : lines(text).map(nameOnLine);
    return names.map(asOneField).join('\n');
}

function asOneField(name) {
    return /[,;\t]/.test(name) ? '"' + name.replace(/"/g, '""') + '"' : name;
}
