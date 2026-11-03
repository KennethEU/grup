// adoptWww.js — Grupper-klasser, der er flyttet med fra www.dida.dk.
//
// dida.dk og www.dida.dk er to adresser, og browseren giver hver sit eget
// lager. En lærer kunne derfor have sine klasser i den ene fane og ingen i den
// anden (12/9/2026). Siden da sender serveren www videre til dida.dk — men
// FØRST flyttes det, browseren har gemt på www (public/flyt-til-dida.html →
// public/flyt-modtag.html, se app.js → "ÉN ADRESSE"). Grupper-delen lægges
// samlet i én nøgle, som adoptFromWww() henter ind første gang Grupper åbnes
// på dida.dk.
//
// Den anden vej ind er forsiden: har Grupper ingen klasser, spørger den selv
// efter dem på www (wwwCheck.js) og tilbyder at hente dem. Begge veje ender i
// adoptWwwEntries() nedenfor.
//
// HVORFOR IKKE BARE KOPIERE NØGLERNE: klassens filnavn er dens navn gjort
// lovligt ("1bms_sa.csv") og kun unikt på SAMME adresse. En lærer med "1bms
// SA" på begge adresser har altså to klasser med samme filnavn, og en
// kopiering ville lade den ene forsvinde. Gendannelsen fra backup kan omdøbe
// ved sammenfald, validere, skrive grupper/emner/historik med nye
// session-id'er og melde en fyldt lagerplads — den samme vej bruges her.
import * as api from './api.js';
import { plural } from './plural.js';
import { readClassExtras } from './storage.js';
import { CLASSES_KEY } from './storageKeys.js';
import { toCurrentEntries } from './migrateStorage.js';

/** Nøglen modtagersiden (public/flyt-modtag.html) lægger pakken i. */
export const WWW_STASH_KEY = 'dida_grupper_from_www';

/** Hvor læreren kan hente det, der ikke kom med. */
const STAY_ON_WWW = 'www.dida.dk/grupper/?bliv=1';

const BACKUP_HINT = `De ligger stadig dér: åbn ${STAY_ON_WWW} og tag en backup under "Import & backup".`;

/**
 * Mærket for, at www-klasserne er afklaret: hentet ind — eller www svarede,
 * at der ingen var. Så spørger forsiden ikke igen. www ryddes nemlig aldrig,
 * og uden mærket tilbød forsiden de gamle klasser igen, hver gang læreren
 * havde slettet sine egne her (13/9/2026).
 */
export const WWW_SETTLED_KEY = 'dida_grupper_www_settled';

export function wwwSettled() {
    try { return localStorage.getItem(WWW_SETTLED_KEY) !== null; } catch (e) { return false; }
}

export function markWwwSettled() {
    try {
        localStorage.setItem(WWW_SETTLED_KEY, new Date().toISOString());
    } catch (e) { /* så spørger forsiden bare igen næste gang */ }
}

function removeStash() {
    try { localStorage.removeItem(WWW_STASH_KEY); } catch (e) { /* intet at gøre */ }
}

/**
 * Klasselisten i en pakke af www-nøgler, der allerede har de nye navne — eller
 * null, hvis den ikke kan læses. Pakken har de GAMLE nøglenavne (sådan ligger
 * de på www); toCurrentEntries() giver dem de nye, så de læses på samme måde
 * som lagerets egne. Det sker ÉN gang pr. pakke, hos den der kalder.
 */
function classesIn(current) {
    if (!current || typeof current !== 'object') return null;
    try {
        const list = JSON.parse(current[CLASSES_KEY] || '[]');
        return Array.isArray(list) ? list : null;
    } catch (e) {
        return null;
    }
}

/** Hvor mange klasser ligger der i pakken? 0 ved en tom eller ulæselig pakke. */
export function countWwwClasses(entries) {
    if (!entries || typeof entries !== 'object') return 0;
    const list = classesIn(toCurrentEntries(entries));
    return list ? list.filter(c => c && typeof c.filename === 'string').length : 0;
}

/**
 * Findes klassen allerede her — samme filnavn og præcis de samme elever? Så
 * har læreren fx selv lagt en backup ind, og den skal ikke komme to gange.
 */
async function sameClassAlreadyHere(entry) {
    try {
        const here = await api.fetchClass(entry.filename);
        if (!here || here.error) return false;
        return JSON.stringify(here.data || []) === JSON.stringify(entry.data || [])
            && JSON.stringify(here.columns || []) === JSON.stringify(entry.columns || []);
    } catch (e) {
        return false;
    }
}

/**
 * Hent klasserne i en pakke af www-nøgler ind (klasselisten + grupper, emner,
 * historik og sessioner — under de gamle navne, som de ligger på www).
 *
 * @param {Object} entries  nøgle → rå streng, som i localStorage på www
 * @returns {Promise<Object>} { written, alreadyHere, failed, partial, invalid }
 *   eller { error } — beskeden til læreren er allerede vist
 */
export async function adoptWwwEntries(entries) {
    // Læs pakkens nøgler på nøjagtig samme måde som lagerets egne.
    const current = entries && typeof entries === 'object' ? toCurrentEntries(entries) : null;
    const classes = classesIn(current);
    if (!classes) {
        window.notifyError?.(`Klasserne fra www.dida.dk kunne ikke læses. ${BACKUP_HINT}`);
        return { error: 'unreadable stash' };
    }

    const getItem = (key) => (Object.hasOwn(current, key) ? current[key] : null);
    const backup = classes
        .filter(c => c && typeof c === 'object' && typeof c.filename === 'string')
        .map(c => {
            const extras = readClassExtras(c.filename, getItem);
            return {
                ...(c.content && typeof c.content === 'object' ? c.content : {}),
                filename: c.filename,
                name: c.name,
                groups: extras.groups,
                groupTopics: extras.groupTopics,
                history: extras.history,
                sessions: extras.sessions,
            };
        });

    const inspected = await api.inspectBackup(backup);
    if (inspected.error) {
        window.notifyError?.(`Klasserne fra www.dida.dk kunne ikke hentes (${inspected.error}). ${BACKUP_HINT}`);
        return inspected;
    }

    const toWrite = [];
    let alreadyHere = 0;
    for (const entry of inspected.valid) {
        if (await sameClassAlreadyHere(entry)) { alreadyHere++; continue; }
        toWrite.push({ ...entry, __inspected: true });
    }

    const res = toWrite.length > 0
        ? await api.restoreBackup(toWrite, { collisionMode: 'rename', renameLabel: 'fra www.dida.dk' })
        : { written: 0, failed: [], partial: [], prunedSessions: 0 };

    if (res.error) {
        window.notifyError?.(`Klasserne fra www.dida.dk kunne ikke hentes (${res.error}). ${BACKUP_HINT}`);
        return res;
    }

    // Forsøget er gjort. Kom en klasse ikke med, siger beskeden nedenfor, hvor
    // den ligger — at tilbyde hele pakken igen ville lægge resten ind to gange.
    markWwwSettled();

    const failed = Array.isArray(res.failed) ? res.failed : [];
    const partial = Array.isArray(res.partial) ? res.partial : [];
    const skippedInvalid = inspected.invalid.length;
    if (res.written > 0 || failed.length > 0 || skippedInvalid > 0) {
        let msg = `${plural(res.written, 'klasse er', 'klasser er')} hentet fra www.dida.dk, hvor du havde gemt dem. `
            + 'dida.dk bruger nu kun adressen uden www.';
        if (partial.length > 0) {
            const parts = [...new Set(partial.flatMap(p => p.parts))].join(', ');
            msg += ` Bemærk: ${parts} kom ikke med for ${partial.map(p => p.filename).join(', ')}.`;
        }
        if (failed.length > 0 || skippedInvalid > 0) {
            msg += ` ${plural(failed.length + skippedInvalid, 'klasse', 'klasser')} kunne IKKE hentes. ${BACKUP_HINT}`;
            window.notifyError?.(msg);
        } else if (partial.length > 0 || res.prunedSessions > 0) {
            window.notifyInfo?.(msg);
        } else {
            window.notifySuccess?.(msg);
        }
    }

    return { written: res.written || 0, alreadyHere, failed, partial, invalid: inspected.invalid };
}

/**
 * Hent pakken, som mellemsiden på www har lagt her, hvis der ligger en.
 *
 * Pakken fjernes, FØR noget skrives — også når noget ikke kommer med:
 *  - Den er en fuld kopi af www-klasserne. Lå den her, mens klasserne blev
 *    skrevet, skulle lageret rumme dem to gange på én gang, og en lærer med
 *    meget historik fik "kunne IKKE hentes" alene af den grund (13/9/2026).
 *  - Et nyt forsøg ville lægge de omdøbte klasser ind en gang til.
 * Det, der ikke kom med, ligger stadig på www, og beskeden fortæller hvordan
 * det hentes.
 *
 * @returns {Promise<null|Object>} null når der intet var at hente
 */
export async function adoptFromWww() {
    let raw = null;
    try { raw = localStorage.getItem(WWW_STASH_KEY); } catch (e) { return null; }
    if (!raw) return null;
    removeStash();

    let entries = null;
    try {
        const stash = JSON.parse(raw);
        entries = stash && typeof stash.entries === 'object' ? stash.entries : null;
    } catch (e) {
        entries = null;
    }
    if (!entries) {
        window.notifyError?.(`Klasserne fra www.dida.dk kunne ikke læses. ${BACKUP_HINT}`);
        return { error: 'unreadable stash' };
    }

    return adoptWwwEntries(entries);
}
