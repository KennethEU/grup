// lectio.js — genkend en elevliste kopieret fra Lectio.
//
// Lectio skriver én elev pr. linje med holdet bagefter:
//   "Fornavn Mellemnavn Efternavn, 2Tz 04 (2Tz)"
// Importen skal kun have navnene. Funktionerne lå før inde i
// ImportSection.vue, hvor intet kunne teste dem — og det er den indgang,
// forsiden selv peger på ("Indsæt klasseliste direkte fra Lectio").
// Værn: lectio.test.js med testdata/lectio_elevliste.txt og Lectios to
// sider (testdata/lectio_lektion.txt og lectio_laerere_og_elever*.txt).

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
    all.forEach((raw, i) => {
        const line = raw.trim();
        if (matched[i]) { hits++; names.push(nameOnLine(line)); return; }
        if ((i < first || i > last || gap[i]) && isPageText(line)) { skipped++; return; }
        names.push(line);
    });
    if (hits < Math.ceil(names.length * 0.8)) return null;
    return { names, skipped };
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

    const names = [];
    let students = 0;
    let skipped = header;   // alt over overskriften er sidens menu
    // Linjer skrevet til i hånden siden sidste elev. Kommer der en
    // overskrift igen (siden kopieret to gange, fx to hold), var de i stedet
    // den næste sides menu ("Lærere og elever", "menu" …) og springes over,
    // ligesom menuen over den første overskrift (159. gennemsyn, (182)).
    let loose = [];
    for (const raw of all.slice(header + 1)) {
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
        const line = raw.trim();
        if (cells.length === 1 && !isPageText(line)) { loose.push(line); continue; }
        skipped++;
    }
    names.push(...loose);
    if (students < 2) return null;
    return { names, skipped };
}

/**
 * Læs en tekst som en Lectio-liste. Svaret er navnene (én pr. elev) og
 * antallet af linjer fra Lectios side, der er sprunget over — eller null,
 * når teksten ikke er fra Lectio.
 *
 * @returns {{ names: string[], skipped: number } | null}
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
