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
const SUFFIX = ',\\s*[^,()]*\\S\\s+\\d+\\s+\\([^()]*\\S[^()]*\\)\\s*$';
const LECTIO_SUFFIX = new RegExp(SUFFIX);
const LECTIO_LINE = new RegExp('^.*\\S.*' + SUFFIX);

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
    const matchCount = all.filter(l => LECTIO_LINE.test(l.trim())).length;
    return matchCount >= Math.ceil(all.length * 0.8);
}

/** Navnene alene, én pr. linje — holdet bagefter fjernet. */
export function extractLectioNames(text) {
    return lines(text)
        .map(line => line.replace(LECTIO_SUFFIX, '').trim())
        .join('\n');
}
