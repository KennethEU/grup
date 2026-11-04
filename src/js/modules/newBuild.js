// ═══════════════════════════════════════════════════════════════════════════
// Ny udgave på serveren, mens fanen stod åben
// ═══════════════════════════════════════════════════════════════════════════
//
// HVORFOR DEN FINDES: en lærer har tit Grupper åben i dagevis, og der bliver
// deployet flere gange om dagen. Den åbne fane kører stadig den GAMLE
// udgave, og den henter først nogle af sine dele, når de skal bruges:
// "Om programmet", GDPR, vejledningen, Import & backup, Excel-delen.
//
// Er de gamle filer væk fra serveren, gav "Om programmet" et rødt banner med
// "Der opstod en fejl: Unable to preload CSS for …/PageLayout-….css" (målt
// 24/9 med en sonde, der gjorde de gamle filer til 404). Indtil 3/11 2026 kom
// den gamle Python-motors tråd oveni: den blev startet forfra efter hvert
// "Stop" og kunne blande gammel JavaScript med nye Python-filer.
//
// Løses af ét spørgsmål: "Peger den index.html, der ligger
// på serveren nu, på en anden hovedfil end den, denne fane kører?" Svaret
// kræver intet ekstra i buildet: index.html caches aldrig (app.js), og Vite
// giver hovedfilen et nyt navn, hver gang koden ændrer sig. I udvikling er
// navnet altid /src/js/modules/main.js, så spørgsmålet svarer nej.

export const NEW_BUILD_MESSAGE =
    'grup.dk er blevet opdateret, mens siden stod åben. Genindlæs siden (F5, på Mac Cmd+R) '
    + 'for at hente den nye udgave — dine klasser er gemt.';

// En del, der ikke kunne hentes, UDEN at der er kommet en ny udgave (typisk
// forbindelsen). Beskeden siger "genindlæs", ikke "prøv igen": WebKit (Safari)
// husker en fejlet hentning af en programdel og spørger aldrig serveren igen
// i den samme fane — målt 4/11 2026 i Playwrights WebKit med en sonde, der
// lod første hentning fejle.
// Chrome og Firefox prøver igen, men kun en genindlæsning virker overalt.
const RELOAD_HINT = 'Tjek forbindelsen, og genindlæs siden (F5, på Mac Cmd+R) — dine klasser er gemt.';
export const PART_UNAVAILABLE_MESSAGE = `En del af programmet kunne ikke hentes. ${RELOAD_HINT}`;
export const EXCEL_UNAVAILABLE_MESSAGE = `Excel-delen af programmet kunne ikke hentes. ${RELOAD_HINT}`;

/** Hovedfilen, som en side peger på — `./assets/index-XXXX.js` i drift. */
function entryScript(doc) {
    const el = doc.querySelector('script[type="module"][src]');
    return el ? el.getAttribute('src') : null;
}

// To steder kan spørge i samme øjeblik (banneret og lytteren nedenfor ved
// den samme manglende fil). De deler én hentning.
let inflight = null;

/**
 * Er der lagt en ny udgave op, siden denne fane blev åbnet?
 *
 * Returnerer `null`, når det ikke kan afgøres her (ingen hovedfil på siden,
 * fx i unit-tests) — så kan kalderen springe ventetiden helt over. Ellers et
 * Promise<boolean>. Alt der går galt (ingen forbindelse, en omdirigering,
 * noget der ikke er HTML) giver `false`: vi siger kun "ny udgave", når vi
 * har SET den.
 */
export function checkForNewBuild() {
    if (typeof document === 'undefined' || typeof fetch !== 'function') return null;
    const own = entryScript(document);
    if (!own) return null;
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const res = await fetch(new URL('index.html', document.baseURI).href, { cache: 'no-store' });
            // Se CLAUDE.md: en 302 til forsiden giver status 200 med forsidens
            // HTML. Den peger på en helt anden hovedfil og ville ligne en ny
            // udgave — derfor både `redirected` og `content-type`.
            if (!res.ok || res.redirected) return false;
            if (!(res.headers.get('content-type') || '').includes('text/html')) return false;
            const served = entryScript(new DOMParser().parseFromString(await res.text(), 'text/html'));
            return !!served && served !== own;
        } catch {
            return false;
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}

// Fejl fra en del af programmet, der ikke kunne hentes. Vite melder dem med
// hændelsen `vite:preloadError`, FØR fejlen når frem til den kode, der bad
// om delen — så App.vue's fejlfanger kan genkende dem på selve objektet.
const chunkErrors = new WeakSet();

/** Kom fejlen af, at en del af programmet ikke kunne hentes? */
export function isChunkLoadError(err) {
    return !!err && typeof err === 'object' && chunkErrors.has(err);
}

/**
 * Kaldstedets egen besked om en del, der ikke kunne hentes (Excel, zip).
 *
 * Er årsagen en ny udgave, har lytteren nedenfor allerede bedt læreren om at
 * genindlæse — så siges intet her. Før kom begge beskeder oven i hinanden.
 *
 * @returns {Promise<string|null>} beskeden, der blev vist — eller null, når
 *   det var en ny udgave (så står NEW_BUILD_MESSAGE allerede på skærmen)
 */
export async function reportPartUnavailable(err, message) {
    const check = isChunkLoadError(err) ? checkForNewBuild() : null;
    if (check && await check) return null;
    window.notifyError?.(message);
    return message;
}

/**
 * Lyt efter dele, der ikke kan hentes. Er årsagen en ny udgave, får læreren
 * den ene besked, der hjælper: genindlæs. Ellers siger den her ingenting —
 * så har kaldstedet sin egen besked (fx "Excel-delen … kunne ikke hentes").
 */
export function watchForNewBuild() {
    if (typeof window === 'undefined') return;
    window.addEventListener('vite:preloadError', (event) => {
        if (event.payload && typeof event.payload === 'object') chunkErrors.add(event.payload);
        const check = checkForNewBuild();
        if (!check) return;
        check.then((isNew) => {
            if (isNew) window.notifyError?.(NEW_BUILD_MESSAGE);
        });
    });
}
