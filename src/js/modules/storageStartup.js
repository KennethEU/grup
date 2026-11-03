// storageStartup.js — det allerførste, Grupper gør: få lageret på plads.
//
// Importeres ØVERST i main.js. ES-moduler kører i den rækkefølge, de
// importeres, så alt her er færdigt, før nogen anden del af appen læser
// lageret (klasselisten, grupperne, sidste klasse …).
//
// Tre ting, i denne rækkefølge:
//  1. ?migrate=<token>: klasser, der kommer fra dida.dk/grupper (stod før i
//     index.html — se adoptTransferEntries i migrateStorage.js).
//  2. De gamle nøglenavne flyttes til de nye (migrateStorage.js).
//  3. En lytter: har læreren stadig en fane åben fra FØR opdateringen, kører
//     den den gamle kode og skriver under de gamle navne. Hver gang den gør
//     det, flyttes det med det samme, efter de samme regler.
//
// Gik noget galt, kan appen ikke sige det endnu (beskederne findes først,
// når siden er bygget). Rapporten gemmes, og reportStorageMigration() siger
// det, når AppTopbar er klar.

import {
    migrateLegacyStorage, migrateLegacySession, adoptTransferEntries, currentKeyFor,
} from './migrateStorage.js';

/** window.localStorage eller window.sessionStorage — eller null (privat vindue, blokeret). */
function browserStore(name) {
    try { return typeof window !== 'undefined' ? window[name] : null; } catch { return null; }
}

/** Hent pakken fra dida.dk/grupper, hvis adressen har ?migrate=<token>. */
function receiveTransfer(storage) {
    try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('migrate');
        if (!token || !/^[0-9a-f]{32}$/.test(token)) return;
        // Synkront med vilje: pakken skal ligge i lageret, før appen læser det.
        const xhr = new window.XMLHttpRequest();
        xhr.open('GET', '/api/grupper-transfer/' + encodeURIComponent(token), false);
        xhr.send(null);
        if (xhr.status === 200) {
            const res = JSON.parse(xhr.responseText);
            if (res && res.entries && typeof res.entries === 'object') adoptTransferEntries(storage, res.entries);
        }
        params.delete('migrate');
        const search = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (search ? '?' + search : '') + window.location.hash);
    } catch (e) {
        console.warn('[migration] Fejl under modtagelse:', e);
    }
}

/** Det, der gik galt undervejs — siges af reportStorageMigration(). */
const problems = { failed: [], lost: [], copies: [] };

/** Værdier, der kun findes i hukommelsen: { key, value } (det gamle navn). */
const unsaved = [];
let retryTimer = null;

/**
 * Prøv igen hvert 5. sekund at gemme det, der kun ligger i hukommelsen.
 * Sletter læreren en gammel klasse (som beskeden beder om), bliver der plads.
 * Værdien lægges tilbage under sit GAMLE navn — så tager den almindelige
 * flytning den, med de samme regler (også fletningen af klasselisten).
 */
function retryLost() {
    if (retryTimer || typeof setInterval !== 'function') return;
    retryTimer = setInterval(() => {
        const store = browserStore('localStorage');
        if (!store) return;
        for (let i = unsaved.length - 1; i >= 0; i--) {
            const { key, value } = unsaved[i];
            try {
                store.setItem(key, value);
                if (store.getItem(key) === value) unsaved.splice(i, 1);
            } catch { /* stadig fuldt — prøv igen om lidt */ }
        }
        if (unsaved.length === 0) {
            clearInterval(retryTimer);
            retryTimer = null;
            const report = migrateLegacyStorage(store);
            collect(report);
            announce(store, report.written);
            window.notifySuccess?.('Det, der manglede plads til, er gemt nu. Genindlæs siden for at se det.');
        }
    }, 5000);
}

function collect(report) {
    problems.failed.push(...report.failed);
    problems.lost.push(...report.lost);
    problems.copies.push(...report.copies);
    if (report.undecided.length) {
        // To udgaver af det samme, og ingen måde at vide, hvilken der er den
        // rigtige: begge bliver stående (se migrateStorage.js, punkt 4).
        // Læreren kan ikke gøre noget ved det, så det siges kun i konsollen.
        console.warn('[migrateStorage] Begge udgaver bevaret:', report.undecided);
    }
    if (report.lost.length) {
        // Hverken det nye eller det gamle navn kunne skrives (lageret er helt
        // fuldt). Værdien findes nu kun her: den prøves gemt igen, til der er
        // plads — se retryLost().
        console.error('[migrateStorage] Kunne ikke gemmes igen:', report.lost);
        unsaved.push(...report.lost);
        retryLost();
    }
    if (report.failed.length) console.warn('[migrateStorage] Står stadig under det gamle navn:', report.failed);
}

/**
 * Fanen har selv skrevet nyt i lageret. Storage-hændelser når kun ANDRE
 * faner, så fanens egne lyttere (klasselisten, emnerne, grupperne) får en
 * hændelse, som om en anden fane havde skrevet — det er jo også sandt.
 */
function announce(storage, keys) {
    for (const key of keys) {
        try {
            window.dispatchEvent(new StorageEvent('storage', {
                key, newValue: storage.getItem(key), oldValue: null, storageArea: storage, url: window.location.href,
            }));
        } catch { /* gamle browsere uden StorageEvent-konstruktør: næste opstart tager det */ }
    }
}

export function startStorage() {
    if (typeof window === 'undefined') return;
    const local = browserStore('localStorage');
    if (local) {
        receiveTransfer(local);
        collect(migrateLegacyStorage(local));
    }
    const session = browserStore('sessionStorage');
    if (session) collect(migrateLegacySession(session));

    window.addEventListener('storage', (e) => {
        // Kun når en gammel fane har SKREVET noget. En sletning (newValue
        // null) er typisk en anden ny fanes egen flytning — at reagere på den
        // ville sætte to faner til at svare hinanden.
        if (!e || e.newValue === null || !currentKeyFor(e.key)) return;
        const store = browserStore('localStorage');
        if (!store || e.storageArea !== store) return;
        const report = migrateLegacyStorage(store, { freshKey: e.key });
        collect(report);
        announce(store, report.written);
        if (report.failed.length || report.lost.length || report.copies.length) reportStorageMigration();
    });
}

/**
 * Sig det til læreren, hvis noget ikke kunne flyttes. Kaldes, når siden er
 * klar (AppTopbar), og igen, hvis en gammel fanes skrivning ikke kunne flyttes.
 */
export function reportStorageMigration() {
    if (typeof window === 'undefined' || !window.notifyError) return;
    if (problems.copies.length) {
        // En fane fra før opdateringen lagde en klasse ind, der allerede
        // fandtes. Den rigtige er urørt; den gamle fanes udgave står ved
        // siden af.
        const names = problems.copies.map(c => `"${c.name}"`).join(', ');
        window.notifyInfo?.(`${names} kom fra en fane, der stod åben fra før grup.dk blev opdateret. `
            + 'Din klasse er urørt, og begge udgaver er gemt — slet den, du ikke skal bruge.');
    }
    if (problems.lost.length) {
        window.notifyError('Noget af det, der var gemt i browseren, kunne ikke gemmes igen, fordi lageret er helt fuldt. '
            + 'Luk IKKE fanen: slet en gammel klasse, så gemmes det af sig selv.');
    } else if (problems.failed.length) {
        window.notifyError('Noget af det, der var gemt i browseren, ligger stadig under et gammelt navn og vises måske ikke. '
            + 'Intet er slettet. Slet en gammel klasse, hvis lageret er fuldt, og genindlæs så siden.');
    }
    problems.failed.length = 0;
    problems.lost.length = 0;
    problems.copies.length = 0;
}

startStorage();
