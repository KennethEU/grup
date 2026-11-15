import { reactive, readonly, markRaw } from 'vue';

const state = reactive({
    notifications: []
});

let nextId = 0;
const timers = new Map();   // id → timeoutId
const expiries = new Map(); // id → udløbstidspunkt (eller Infinity)
// id → resterende ms for en besked, læreren er i gang med at læse (holdt
// fast med musen eller tastaturet, se hold() nedenfor). Den har intet ur.
const held = new Map();

// Når læreren slipper en holdt besked, står den mindst så længe endnu. Ellers
// kunne den forsvinde i samme øjeblik, musen forlod den — fx da læreren
// flyttede musen hen til knappen, beskeden fortalte om.
const RELEASE_MIN = 3000;

const MAX_VISIBLE = 5;

// `action` (valgfri): { label, run } — en knap i beskeden, fx "Hent de nye
// grupper". Et klik kører `run` og lukker beskeden.
function add(message, type = 'info', duration = 4000, action = null) {
    // Dublet: er den samme besked af samme type allerede på skærmen, stables
    // der ikke en til (fx gentagne mislykkede gemninger).
    //
    // Men uret skal STILLES OM. Uden det talte den gamle besked stadig ned:
    // trykker læreren på knappen igen 7 sekunder inde i en 8-sekunders info,
    // fik hun ikke en ny besked — hun fik ét sekund af den gamle, og så var
    // den væk, lige da hun kiggede op. Beskeden skal leve, så længe som hvis
    // den var ny.
    const twin = state.notifications.find(n => n.message === message && n.type === type);
    if (twin) {
        if (duration > 0) extendTo(twin.id, Date.now() + duration);
        // Den NYE knap gælder. Samme tekst er ikke altid samme sag: "Grupperne
        // i "2.g" er lige blevet ændret …" kan handle om en anden klasse med
        // samme navn, og den gamle knap ("Hent de nye grupper") peger på den
        // gamle klasse — et klik gjorde så ingenting, og den nye advarsel var
        // væk (150. gennemsyn).
        if (action) twin.action = markRaw({ ...action });
        return;
    }

    const id = nextId++;
    // markRaw: funktionen skal ikke pakkes ind i en Vue-proxy.
    state.notifications.push({ id, message, type, action: action ? markRaw({ ...action }) : null });

    // Loft over antal samtidige beskeder. Der ryddes efter PRIORITET, ikke kun
    // alder: den ældste mindre vigtige besked (info, så success) går først, så
    // en klæbende fejl — fx "Reglerne kan ikke opfyldes", som generation.js
    // lægger ind FØRST og som derfor er den ældste — aldrig skubbes af skærmen
    // af en byge af ligegyldige info-beskeder. Først når der intet andet er
    // tilbage, ryger en fejl.
    //
    // Den NYE besked er aldrig offeret. Før stod den med i feltet, der blev
    // ledt i, og så åd den sig selv: fem klæbende fejl på skærmen og en frisk
    // "Grupperne er dannet" — successen var den eneste af sin slags, blev
    // fundet med det samme og fjernet igen, uden nogensinde at være tegnet.
    // Læreren trykkede, og der skete ingenting. Fejl bliver hængende til de
    // klikkes væk, så fem af dem er ikke et sært tilfælde; det er en almindelig
    // eftermiddag. Derfor ledes der kun blandt de ÆLDRE — og er de alle sammen
    // fejl, ryger den ældste fejl. Den nyeste besked kommer altid på skærmen.
    //
    // Blandt fejlene går en fejl UDEN knap før en fejl MED knap. Knappen er
    // den eneste vej til at gøre noget ved sagen, og nogle af de beskeder
    // kommer ikke igen: "Grupperne … er lige blevet ændret i en anden fane"
    // (storage.js) siges kun én gang pr. fordeling. Før kunne fem andre fejl
    // (fx en backup-import med flere dårlige filer) skubbe den væk, og lærerens næste træk skrev så den anden
    // fanes grupper væk uden en lyd (15/11 2026, 150. gennemsyn).
    while (state.notifications.length > MAX_VISIBLE) {
        const older = state.notifications.slice(0, -1);
        const victim = older.find(n => n.type === 'info')
            || older.find(n => n.type === 'success')
            || older.find(n => !n.action)
            || older[0];
        remove(victim.id);
    }

    if (duration > 0) {
        const expiresAt = Date.now() + duration;
        expiries.set(id, expiresAt);
        timers.set(id, setTimeout(() => remove(id), duration));

        // Skub ældre beskeder, der udløber før denne, frem til samme tidspunkt,
        // så alle synlige beskeder kan nå at blive læst.
        state.notifications.forEach(n => {
            if (n.id !== id) extendTo(n.id, expiresAt);
        });
    } else {
        expiries.set(id, Infinity);
    }
}

/**
 * Skub én beskeds udløb frem til `expiresAt` — aldrig tilbage.
 *
 * Klæbende fejl (udløb Infinity) røres ikke: de skal blive stående, til
 * læreren klikker dem væk.
 */
function extendTo(id, expiresAt) {
    const existing = expiries.get(id);
    if (existing === undefined || existing === Infinity) return;
    // En holdt besked har intet ur at stille: kun dens rest vokser. Uden
    // dette startede en ny besked (eller en dublet) uret igen bag om ryggen
    // på læreren, der var i gang med at læse den.
    if (held.has(id)) {
        held.set(id, Math.max(held.get(id), expiresAt - Date.now()));
        return;
    }
    if (existing >= expiresAt) return;
    clearTimeout(timers.get(id));
    expiries.set(id, expiresAt);
    timers.set(id, setTimeout(() => remove(id), expiresAt - Date.now()));
}

/**
 * Læreren læser beskeden: stop dens ur (småting (æ) fra 156., rettet i 157. gennemsyn).
 *
 * En lang besked ruller efter ca. seks linjer, og importens fulde besked
 * (ca. 600 tegn) står i ca. 36 sek. Mens læreren rullede ned for at læse
 * resten, talte uret videre, og beskeden kunne forsvinde midt i en sætning.
 * NotificationManager kalder hold(), når musen bevæges eller hjulet drejes i
 * beskeden, eller den får fokus, og release(), når musen og fokus er ude af den
 * igen. Fejl (Infinity) har intet ur og røres ikke.
 */
function hold(id) {
    const existing = expiries.get(id);
    if (existing === undefined || existing === Infinity || held.has(id)) return;
    clearTimeout(timers.get(id));
    timers.delete(id);
    held.set(id, Math.max(0, existing - Date.now()));
}

/** Læreren er færdig med beskeden: uret går igen, med mindst RELEASE_MIN tilbage. */
function release(id) {
    if (!held.has(id)) return;
    const remaining = Math.max(held.get(id), RELEASE_MIN);
    held.delete(id);
    expiries.set(id, Date.now() + remaining);
    timers.set(id, setTimeout(() => remove(id), remaining));
}

function remove(id) {
    const idx = state.notifications.findIndex(n => n.id === id);
    if (idx !== -1) state.notifications.splice(idx, 1);
    clearTimeout(timers.get(id));
    timers.delete(id);
    expiries.delete(id);
    held.delete(id);
}

export const notificationState = readonly(state);
export const notificationActions = {
    add,
    remove,
    hold,
    release,
    // En kvittering står 5 sek., en lang som en info (60 ms pr. tegn): "4
    // klasser er hentet fra www.dida.dk, hvor du havde gemt dem. dida.dk
    // bruger nu kun adressen uden www." er ca. 110 tegn og nåede ikke at
    // blive læst på 5 sek. (157. gennemsyn).
    notifySuccess: (msg) => add(msg, 'success', Math.max(5000, msg.length * 60)),
    notifyError:   (msg, action = null) => add(msg, 'error', 0, action),
    notifyInfo:    (msg) => add(msg, 'info', Math.max(8000, msg.length * 60)),
};

if (typeof window !== 'undefined') {
    window.notify = add;
    window.notifySuccess = notificationActions.notifySuccess;
    window.notifyError   = notificationActions.notifyError;
    window.notifyInfo    = notificationActions.notifyInfo;
}
