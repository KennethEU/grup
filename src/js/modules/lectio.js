// lectio.js — genkend en elevliste kopieret fra Lectio.
//
// Lectio skriver én elev pr. linje med holdet bagefter:
//   "Fornavn Mellemnavn Efternavn, 2Tz 04 (2Tz)"
// Importen skal kun have navnene. Funktionerne lå før inde i
// ImportSection.vue, hvor intet kunne teste dem — og det er den indgang,
// forsiden selv peger på ("Indsæt klasseliste direkte fra Lectio").
// Værn: lectio.test.js med testdata/lectio_elevliste.txt.

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

/**
 * Ligner teksten en Lectio-liste? Mindst 80 % af linjerne skal have holdet
 * til sidst, så én linje der er skrevet til i hånden, ikke slår genkendelsen
 * fra. Én linje alene er ikke nok at dømme på.
 */
export function isLectioFormat(text) {
    const all = lines(text);
    if (all.length < 2) return false;
    const matchCount = all.filter(l => isLectioLine(l.trim())).length;
    return matchCount >= Math.ceil(all.length * 0.8);
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
    return lines(text)
        .map(line => asOneField(line.replace(LECTIO_SUFFIX, '').trim()))
        .join('\n');
}

function asOneField(name) {
    return /[,;\t]/.test(name) ? '"' + name.replace(/"/g, '""') + '"' : name;
}
