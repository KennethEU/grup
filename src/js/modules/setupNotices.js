// setupNotices.js — bemærkninger om OPSÆTNINGEN står i gruppeopskriften.
//
// HVORFOR: det meste gruppedannelsen fortæller, handler om klassen og reglerne
// — 'Fordel på "Køn" kan ikke gå helt op: 14 elever har værdien "Pige" …',
// "Grupperne bygges efter Balancér …", "Matrix begrænses af emnet …". Som
// beskeder (toasts) kom de ved hvert eneste tryk på Dan grupper: den blå
// forsvandt efter 8 sekunder og kom igen, den røde skulle lukkes igen og igen.
// Opsætningen bestemmes i opskriften, så bemærkningerne står dér: i stakken
// øverst i opskriften sammen med de andre advarsler (lastRunHints i hints.js,
// siden 13/11 2026 — før under "Sidste dannelse" nederst) og talt med i
// bjælkens "N advarsler". De står der, mens det, der skal dannes, er det
// samme som sidst (lastRunApplies i nextEngine.js).
//
// HUKOMMELSEN er kun i fanen: den ryddes ved klasseskift (classMemory.js) og
// ved en genindlæsning — samme prøve som resten af classMemory: tomt er
// præcis det, læreren ville have efter F5.
//
// EN KØRSEL AD GANGEN: bemærkningerne samles i en kladde og bliver først til
// "sidste dannelse", når resultatet lander (commitRun). Stoppes kørslen eller
// fejler den, står grupperne — og dermed bemærkningerne — uændret.
//
// (Før 2/11 2026 viste den gamle skærm dem som beskeder, én gang pr. klasse,
// med en "Vis igen"-linje. Den vej er slettet sammen med den gamle skærm.)

import { reactive } from 'vue';

export const setupNotices = reactive({
    /**
     * ALT, sidste gruppedannelse havde at sige om opsætningen, pr. visning:
     * [{ text, type }]. Står i opskriftens stak (lastRunHints i hints.js).
     */
    last: { standard: [], matrix: [] },
    /**
     * Kørslens nummer pr. visning, talt op ved hver commitRun. Indgår i
     * stakkens id'er, så en note, læreren har lukket med krydset, kommer
     * igen ved næste dannelse — også når teksten er den samme.
     */
    lastRunNo: { standard: 0, matrix: 0 },
    /**
     * Aftrykket (utils.setupSignature) af den opsætning, `last` er lavet med.
     * Bruges ikke længere til at afgøre, om noterne vises (det gør det
     * strengere lastRunApplies i nextEngine.js, forslag 78), men står her,
     * så en hentet kørsel får hele sin tilstand tilbage (forslag 88).
     */
    lastSignature: { standard: null, matrix: null },
});

let pendingView = 'standard';

// Tælleren bag lastRunNo. Går kun opad — også over klasseskift og når en
// hentet kørsel får sit gamle nummer tilbage (forslag 88) — så to kørsler
// aldrig deler et nummer, og et lukket kryds aldrig rammer en anden kørsel.
let runCounter = 0;

const seen = new Set();   // `${type}\u0000${text}` — kun varsler (announceOnce)
let pending = null;       // kladden for den kørsel, der er i gang

const keyOf = (text, type) => `${type}\u0000${text}`;

/** En gruppedannelse går i gang: saml bemærkningerne i en kladde. */
export function beginRun(view = 'standard') {
    pending = [];
    pendingView = view === 'matrix' ? 'matrix' : 'standard';
}

/**
 * Resultatet er landet: kladden bliver "sidste dannelse". `signature` er
 * aftrykket af den opsætning, kørslen blev lavet med (utils.setupSignature).
 */
export function commitRun(signature = null) {
    setupNotices.last[pendingView] = pending || [];
    setupNotices.lastSignature[pendingView] = signature;
    setupNotices.lastRunNo[pendingView] = ++runCounter;
    pending = null;
}

/**
 * En bemærkning om opsætningen: den lægges i kladden (eller, uden en kørsel i
 * gang, direkte i "sidste dannelse"). Samme tekst står der kun én gang.
 * `type` er 'info' (blå) eller 'error' (rød: reglerne kan ikke opfyldes).
 */
export function announce(text, type = 'info', keys = null, result = false) {
    const list = pending || setupNotices.last[pendingView];
    const same = list.find(n => n.text === text && n.type === type);
    if (same) {
        if (result) same.result = true;
        // Samme tekst to gange (fx samme regel sat ind to gange i opskriften):
        // den står kun én gang, men husker BEGGE sagers nøgler. Før blev den
        // anden sags nøgler smidt væk, så motorens røde varsel om regel
        // nummer to stod i opskriften ved siden af resultatet (13/11 2026).
        if (keys && keys.length) same.keys = [...new Set([...(same.keys || []), ...keys])];
        return;
    }
    // `keys`: fra motorens beskeder — deres nøgler for "samme
    // sag" (nextEngine.noteKeys), så opskriften kan skjule motorens varsel om
    // en sag, sidste dannelse allerede har resultatet af. Uden nøgler som før.
    const note = keys && keys.length ? { text, type, keys } : { text, type };
    // `result`: noten handler om netop DE grupper, kørslen gav ("2 par ender i
    // samme gruppe (Gruppe 3)"), ikke om opsætningen. Se forgetRunResults().
    if (result) note.result = true;
    list.push(note);
}

/**
 * Hele fordelingen er skiftet ud uden en ny kørsel: en gemt session gendannet, grupper sat ind fra en liste (Gendan
 * grupper) eller hentet fra en anden fane. (En tidligere kørsel fra
 * kørselshistorikken får siden 13/11 2026 sine EGNE noter tilbage i stedet —
 * restoreLastRun i nextEngine.js, forslag 88; kun et snapshot uden dem
 * falder tilbage hertil.) Noterne om RESULTATET handler så
 * om grupper, der ikke står på skærmen længere, og fjernes. Noterne om
 * opsætningen ("Fordel på "Køn" kan ikke gå helt lige op …") gælder stadig og
 * bliver stående, og det samme gør aftrykket (lastSignature): prøvekørslen i
 * baggrunden skal opføre sig som før (forslag (78) i TODO.md handler om den).
 *
 * HVORFOR: dannede læreren grupper tre gange og hentede kørsel 1 frem, stod
 * kørsel 3's "Adskil på "Køn": 2 par ender i samme gruppe (Gruppe 3, Gruppe
 * 5)" under "Sidste dannelse" — men Gruppe 3 og 5 var nu nogle helt andre
 * elever (13/11 2026). Med samme opskrift kom intet spørgsmål, og aftrykket
 * passede, så intet skjulte noten.
 *
 * En flytning i hånden rører ikke noterne (bevidst; se forslag (78)).
 *
 * @param {string[]} views  de visninger, hvis grupper er skiftet ud
 */
export function forgetRunResults(views = ['standard', 'matrix']) {
    for (const view of views) {
        const list = setupNotices.last[view] || [];
        if (list.some(n => n.result)) setupNotices.last[view] = list.filter(n => !n.result);
    }
}

/**
 * Vis beskeden, hvis den er ny — ellers ingenting. Til et VARSEL før
 * kørslen ("Der kan gå op mod et halvt minut …"), ikke en bemærkning om
 * resultatet: i "Sidste dannelse" ville det stå EFTER en kørsel, der allerede
 * er færdig. Det er derfor stadig en besked, men kun én gang pr. klasse: på
 * et stort hold kommer varslet ellers ved hvert eneste tryk.
 */
export function announceOnce(text, type = 'info') {
    const key = keyOf(text, type);
    if (seen.has(key)) return;
    seen.add(key);
    if (type === 'error') window.notifyError?.(text);
    else window.notifyInfo?.(text);
}

/** Klasseskift: den nye klasse har ikke set noget endnu. */
export function clearSetupNotices() {
    seen.clear();
    pending = null;
    setupNotices.last = { standard: [], matrix: [] };
    setupNotices.lastSignature = { standard: null, matrix: null };
    // lastRunNo nulstilles IKKE: et id fra den forrige klasse må ikke kunne
    // genbruges af den nye klasses første kørsel (lukket med krydset).
}
