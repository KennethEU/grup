// replay.js — afspilningen af en optaget gruppedannelse.
//
// HVAD DEN GØR: motoren har skrevet ned, hvordan eleverne blev delt ud, og
// hvert bytte og hver flytning bagefter (motor/engine/playback.js; appen
// laver det om til hændelser i playbackToRecording i nextEngine.js). Her
// spilles det igennem, så læreren kan se det ske i de rigtige gruppekort.
//
// INGEN DOM HERINDE. Filen regner kun ud, hvem der sidder hvor på et givet
// tidspunkt; Vue tegner det. Det er den samme opdeling som resten af
// modulerne, og den gør afspilningen testbar uden en browser.
//
// AFSPILNINGEN EJER ALDRIG DATA. Den skriver til state.replay, som
// GroupResultsPanel læser i stedet for de rigtige grupper — nøjagtig som
// historik-menuens forhåndsvisning (previewRunIndex) allerede gør. Stopper
// afspilningen, falder kortene tilbage til sandheden af sig selv, fordi de
// aldrig holdt op med at læse den.
//
// Optagelsen findes kun i hukommelsen (state.lastRecording, ryddes ved
// klasseskift og genindlæsning), så den kommer altid fra JS-motoren. Den
// gamle Python-motors optagelser havde flere slags hændelser (efterpas,
// "opfylder en regel", bytter med spøgelseselever og afkortede optagelser);
// de kan ikke nås længere og er fjernet (133. gennemsyn).

import { markRaw } from 'vue';
import { state } from './state.js';
import { ruleTypeLabel } from './recipe.js';

// Hændelsernes art (tredje felt). Motoren giver kun to: et trin, der gør
// grupperne bedre, og et ryst, der gør dem værre med vilje (effect "worse").
export const KIND_IMPROVE = 0;  // motoren fandt et bytte der gør det bedre
export const KIND_UPHILL = 1;   // motoren gør det VÆRRE med vilje
// Findes kun her: uddelingen er ikke en hændelse i optagelsen, men et [elev,
// gruppe]-par i `deal`. Afspilleren behandler den som en art, så kortene kan
// fremhæve den elev, der lige blev lagt.
export const KIND_DEAL = 4;

// Hastigheden læreren kan taste. Under 1 ms er der ingen forskel at se, og
// over 2 sekunder er det ikke længere en afspilning.
export const MIN_SPEED_MS = 1;
export const MAX_SPEED_MS = 2000;
export const DEFAULT_SPEED_MS = 60;

let timer = null;

/**
 * Regeltekst til én hændelse: "Adskil på Navn" — eller null.
 *
 * Navnet er det samme som i opskriften og regelmenuen (ruleTypeLabel i
 * recipe.js): afspilning og opskrift må ikke bruge hvert sit ord om den samme
 * regel. Til 14/11 2026 havde filen sin egen tabel, og "Adskil altid" hed
 * bare "Adskil" her.
 */
export function ruleLabel(raw) {
    if (!raw) return null;
    const cut = String(raw).indexOf(':');
    const type = cut === -1 ? String(raw) : String(raw).slice(0, cut);
    const attr = cut === -1 ? '' : String(raw).slice(cut + 1);
    const label = ruleTypeLabel(type.toLowerCase());
    return attr ? `${label} på ${attr}` : label;
}

/**
 * Hvor står hver elev til sidst? elev → [gruppe, plads], fra motorens svar.
 * Bruges til at tegne hvert billede i den rækkefølge, kortene ender i.
 */
function finalRank(run) {
    if (!Array.isArray(run.final)) return null;
    const rank = new Map();
    run.final.forEach((group, gi) => group.forEach((id, i) => rank.set(id, [gi, i])));
    return rank;
}

/**
 * Sortér hver gruppe efter, hvor eleverne ender: de elever, der ender i
 * gruppen, står på deres endelige plads (indbyrdes), og dem, der er på vej
 * videre, nederst i den rækkefølge, de kom.
 *
 * HVORFOR: motoren flytter eleverne rundt i gruppens liste på sin egen måde
 * (en elev, der går, får sin plads overtaget af gruppens sidste, og
 * søgningen sætter elever sidst uden at skrive det i loggen — moveLast i
 * motor/engine/state.js). Den rækkefølge kan ikke regnes ud af loggen. Før
 * 14/11 2026 sprang afspilningen derfor til motorens facit i det allersidste
 * billede, og navnene byttede plads inde i HVER gruppe i samme sekund (målt:
 * 35 af 35 kørsler på testklassen). Nu står de rigtigt hele vejen.
 */
function orderByFinal(seating, rank) {
    if (!rank) return seating;
    return seating.map((group, gi) => {
        const at = (id) => {
            const r = rank.get(id);
            return r && r[0] === gi ? r[1] : Infinity;
        };
        // Array.prototype.sort er stabil, så dem på vej videre beholder
        // deres indbyrdes rækkefølge.
        return group.slice().sort((a, b) => {
            const x = at(a);
            const y = at(b);
            return x === y ? 0 : x - y;
        });
    });
}

/**
 * Optagelsen med kortenes rækkefølge som facit.
 *
 * HVORFOR: trækker læreren en elev op eller ned i sit EGET kort efter
 * dannelsen, står de samme elever stadig i de samme grupper — afspilningen
 * passer. Men dens sidste billede tegnes i motorens rækkefølge (`final`, se
 * orderByFinal), og så ville kortene springe, når afspilningen stopper. Før
 * 14/11 2026 blev "Se kørslen" derfor slået fra med "Grupperne er ændret",
 * selvom ingen elev havde skiftet gruppe (136. gennemsyn, kandidat 126).
 *
 * Kun det vindende forsøg får kortenes rækkefølge — det er dét, kortene
 * viser. Optagelsen selv ændres aldrig (den er markRaw og deles); der laves
 * en overfladisk kopi. En gruppe, kortene ikke kender, beholder motorens.
 *
 * @param recording   optagelsen ({ best_run_index, runs })
 * @param groupNames  gruppenavn pr. indeks i optagelsen
 * @param cards       grupperne, som de står på kortene ({ name, members })
 * @param idOf        medlem → elev-id (memberIdStr)
 */
export function withCardOrder(recording, groupNames, cards, idOf = String) {
    if (!recording || !Array.isArray(recording.runs)) return recording;
    const best = recording.best_run_index || 0;
    const run = recording.runs[best];
    if (!run || !Array.isArray(run.final)) return recording;
    const byName = new Map((cards || []).map(g => [g.name, (g.members || []).map(idOf)]));
    const final = run.final.map((ids, i) => byName.get((groupNames || [])[i]) || ids);
    const runs = recording.runs.slice();
    runs[best] = { ...run, final };
    return { ...recording, runs };
}

/**
 * Hvem sidder hvor efter `n` billeder (først uddelingen, så bytterne)?
 *
 * Spoler altid forfra. Det lyder dyrt, men er det ikke: 9.408 bytter på
 * almindelige arrays tager under 5 ms, og til gengæld findes der ingen
 * mellemgemte billeder der kan komme ud af trit med sandheden. Det er samme
 * afvejning som alle andre steder i det her værktøj — én kilde frem for en
 * hurtig kopi.
 */
export function seatingAt(run, n) {
    const deal = run.deal || [];
    const rank = finalRank(run);

    // FASE 1 — uddelingen. Motoren lægger eleverne ud én ad gangen; det er
    // dét, der sker, før noget som helst bliver byttet. Er vi stadig midt i
    // den, står resten af pladserne tomme.
    if (n < deal.length) {
        const seating = run.seed.map(() => []);
        for (let i = 0; i < Math.max(0, n); i++) {
            const [id, gi] = deal[i];
            if (seating[gi]) seating[gi].push(id);
        }
        return orderByFinal(seating, rank);
    }

    // FASE 2 — bytterne. Herfra er alle på plads, og udgangspunktet er
    // uddelingens fordeling (seed).
    const after = run.seed.map(g => g.slice());
    const where = new Map();
    after.forEach((group, gi) => group.forEach(m => where.set(m, gi)));

    const stop = Math.max(0, Math.min(n - deal.length, run.events.length));
    for (let i = 0; i < stop; i++) {
        const event = run.events[i];
        if (isMove(event)) { moveTo(after, where, event[0], event[8]); continue; }
        for (const [a, b] of pairsOf(event)) swapPair(after, where, a, b);
    }
    return orderByFinal(after, rank);
}

/**
 * En flytning uden makker: én elev går til en anden gruppe (b er null, og
 * målgruppen står som niende felt).
 */
function isMove(event) {
    return event[1] === null && Number.isInteger(event[8]);
}

function moveTo(after, where, a, to) {
    const from = where.get(a);
    if (from === undefined || from === to || !after[to]) return;
    const i = after[from].indexOf(a);
    if (i === -1) return;
    after[from].splice(i, 1);
    after[to].push(a);
    where.set(a, to);
}

/**
 * Parrene i én hændelse. Næsten altid ét: to elever, der byttede plads.
 *
 * Et blok-bytte (en Skal sammen-aftale der flytter samlet) har de øvrige par
 * som ottende felt. De skal anvendes i SAMME billede; før var hvert par sit
 * eget billede, og så stod aftalens elever i hver sin gruppe imellem dem,
 * noget motoren aldrig gjorde.
 */
function pairsOf(event) {
    const extra = Array.isArray(event[7]) ? event[7] : [];
    return [[event[0], event[1]], ...extra];
}

function swapPair(after, where, a, b) {
    const ga = where.get(a);
    const gb = where.get(b);
    // En hændelse vi ikke kan placere, springes over i stedet for at
    // vælte afspilningen. Sker det, er optagelsen og resultatet uenige —
    // engineChain.test.js holder øje med, at afspilningen ender i grupperne.
    if (ga === undefined || gb === undefined || ga === gb) return;
    const ia = after[ga].indexOf(a);
    const ib = after[gb].indexOf(b);
    if (ia === -1 || ib === -1) return;
    // Begge ud, og den nye bagerst. Rækkefølgen inde i gruppen ordnes
    // bagefter af orderByFinal.
    after[ga].splice(ia, 1);
    after[gb].splice(ib, 1);
    after[ga].push(b);
    after[gb].push(a);
    where.set(a, gb);
    where.set(b, ga);
}

/** Samlet antal billeder: først uddelingen, så bytterne. */
export function frameCount(run) {
    return (run.deal || []).length + run.events.length;
}

/** Hændelsen der lige er sket — det er den, kortene fremhæver. */
function eventAt(run, n) {
    const deal = run.deal || [];
    if (n <= 0) return null;
    if (n <= deal.length) {
        const [id, gi] = deal[n - 1];
        return { a: id, b: null, kind: KIND_DEAL, groupIndex: gi, rule: null };
    }
    const i = n - deal.length;
    if (i > run.events.length) return null;
    const event = run.events[i - 1];
    const [a, b, kind, , , , rule] = event;
    if (isMove(event)) {
        return { a, b: null, kind, rule: ruleLabel(rule),
                 moved: [a], pairCount: 1, isMove: true, groupIndex: event[8] };
    }
    const pairs = pairsOf(event);
    return {
        a, b, kind, rule: ruleLabel(rule),
        // Alle der flyttede i billedet — ved et blok-bytte flere end to.
        moved: pairs.flat(),
        pairCount: pairs.length,
    };
}

function apply() {
    const r = state.replay;
    if (!r) return;
    const run = r.recording.runs[r.runIndex];
    state.replay = {
        ...r,
        seating: seatingAt(run, r.frameIndex),
        last: eventAt(run, r.frameIndex),
        total: frameCount(run),
        dealCount: (run.deal || []).length,
    };
}

function clearTimer() {
    if (timer !== null) {
        clearTimeout(timer);
        timer = null;
    }
}

function tick() {
    const r = state.replay;
    if (!r || !r.playing) return;
    const run = r.recording.runs[r.runIndex];
    if (r.frameIndex >= frameCount(run)) {
        pause();
        return;
    }
    state.replay = { ...state.replay, frameIndex: r.frameIndex + 1 };
    apply();
    timer = setTimeout(tick, state.replay.speed);
}

/**
 * Begynd en afspilning.
 *
 * @param recording   optagelsen (playbackToRecording i nextEngine.js)
 * @param groupNames  gruppenavn pr. indeks i optagelsen — fanget da resultatet
 *                    kom hjem, ikke regnet ud igen her (generation.js)
 * @param lockedGroups de låste grupper, der stod udenfor hele kørslen
 * @param view        'standard' eller 'matrix' — hvilke kort optagelsen hører
 *                    til. Skifter læreren visning midt i en afspilning, ville
 *                    matrixens fordeling ellers blive tegnet i stamkortene.
 */
export function start(recording, groupNames, lockedGroups, view = 'standard') {
    if (!recording || !Array.isArray(recording.runs) || !recording.runs.length) return false;
    clearTimer();
    state.replay = {
        // markRaw: optagelsen ændres aldrig, og hvert billede gennemløber alle
        // dens hændelser forfra. Gennem Vues proxy kostede det ~7 ms pr.
        // billede ved 9.400 hændelser (målt 3/11), uden ~1 ms. state.replay
        // udskiftes helt ved hvert skridt, så skærmen opdateres stadig.
        recording: markRaw(recording),
        groupNames: groupNames || [],
        lockedGroups: lockedGroups || [],
        view,
        runIndex: recording.best_run_index || 0,
        frameIndex: 0,
        speed: DEFAULT_SPEED_MS,
        playing: false,
        seating: [],
        last: null,
        total: 0,
    };
    apply();
    return true;
}

export function stop() {
    clearTimer();
    state.replay = null;
}

export function play() {
    const r = state.replay;
    if (!r) return;
    const run = r.recording.runs[r.runIndex];
    // Tryk på Afspil ved enden begynder forfra i stedet for ikke at gøre
    // noget — det er dét, man mener med knappen på det tidspunkt.
    const from = r.frameIndex >= frameCount(run) ? 0 : r.frameIndex;
    state.replay = { ...r, frameIndex: from, playing: true };
    if (from !== r.frameIndex) apply();
    clearTimer();
    timer = setTimeout(tick, state.replay.speed);
}

export function pause() {
    clearTimer();
    if (state.replay) state.replay = { ...state.replay, playing: false };
}

export function toggle() {
    if (!state.replay) return;
    state.replay.playing ? pause() : play();
}

export function seek(n) {
    const r = state.replay;
    if (!r) return;
    const run = r.recording.runs[r.runIndex];
    const clamped = Math.max(0, Math.min(parseInt(n, 10) || 0, frameCount(run)));
    state.replay = { ...r, frameIndex: clamped };
    apply();
}

export function toEnd() {
    const r = state.replay;
    if (!r) return;
    pause();
    seek(frameCount(r.recording.runs[r.runIndex]));
}

/** Helt tilbage til før den første elev blev lagt. */
export function restart() {
    pause();
    seek(0);
}

export function setSpeed(ms) {
    const r = state.replay;
    if (!r) return;
    const n = parseInt(ms, 10);
    const safe = Number.isFinite(n)
        ? Math.max(MIN_SPEED_MS, Math.min(MAX_SPEED_MS, n))
        : DEFAULT_SPEED_MS;
    state.replay = { ...r, speed: safe };
    // Var afspilningen i gang, skal den nye hastighed gælde med det samme og
    // ikke først efter det bytte, der allerede er sat i gang.
    if (state.replay.playing) {
        clearTimer();
        timer = setTimeout(tick, safe);
    }
}
