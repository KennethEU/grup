// setupNotices.js — bemærkninger om OPSÆTNINGEN står i gruppeopskriften.
//
// HVORFOR: det meste gruppedannelsen fortæller, handler om klassen og reglerne
// — 'Fordel på "Køn" kan ikke gå helt op: 14 elever har værdien "Pige" …',
// "Grupperne bygges efter Balancér …", "Matrix begrænses af emnet …". Som
// beskeder (toasts) kom de ved hvert eneste tryk på Dan grupper: den blå
// forsvandt efter 8 sekunder og kom igen, den røde skulle lukkes igen og igen.
// Opsætningen bestemmes i opskriften, så bemærkningerne står dér: under
// "Sidste dannelse" (RecipeLastRun.vue) og talt med i bjælkens "N advarsler".
// De bliver stående, til næste dannelse siger noget andet.
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
     * [{ text, type }]. Står i opskriftens vindue som "Sidste dannelse".
     */
    last: { standard: [], matrix: [] },
    /**
     * Aftrykket (utils.setupSignature) af den opsætning, `last` er lavet med.
     * Noterne i `last` gælder kun, mens opsætningen stadig passer — ellers
     * handler de om en anden opskrift (se RecipeLastRun og bjælkens tælling).
     */
    lastSignature: { standard: null, matrix: null },
});

let pendingView = 'standard';

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
    pending = null;
}

/**
 * En bemærkning om opsætningen: den lægges i kladden (eller, uden en kørsel i
 * gang, direkte i "sidste dannelse"). Samme tekst står der kun én gang.
 * `type` er 'info' (blå) eller 'error' (rød: reglerne kan ikke opfyldes).
 */
export function announce(text, type = 'info', keys = null) {
    const list = pending || setupNotices.last[pendingView];
    if (list.some(n => n.text === text && n.type === type)) return;
    // `keys`: fra motorens beskeder — deres nøgler for "samme
    // sag" (nextEngine.noteKeys), så opskriften kan skjule motorens varsel om
    // en sag, sidste dannelse allerede har resultatet af. Uden nøgler som før.
    list.push(keys && keys.length ? { text, type, keys } : { text, type });
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
}
