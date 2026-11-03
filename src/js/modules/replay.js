// replay.js — afspilningen af en optaget gruppedannelse.
//
// HVAD DEN GØR: motoren har skrevet ned, hvordan grupperne så ud til at
// begynde med, og hvilke to elever der byttede plads hver eneste gang
// (recorder.py). Her spilles det igennem, så læreren kan se det ske i de
// rigtige gruppekort.
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

import { markRaw } from 'vue';
import { state } from './state.js';

// Samme tal som recorder.py's KIND_*. De to filer skal være enige.
export const KIND_IMPROVE = 0;  // motoren fandt et bytte der gør det bedre
export const KIND_UPHILL = 1;   // motoren gør det VÆRRE med vilje
export const KIND_RULE = 2;     // motor B opfylder en regel
export const KIND_JOINT = 3;    // efterpasset
// Findes kun her: uddelingen er ikke en hændelse i optagelsen, men et [elev,
// gruppe]-par i `deal`. Afspilleren behandler den som en art, så kortene kan
// fremhæve den elev, der lige blev lagt.
export const KIND_DEAL = 4;

// Hastigheden læreren kan taste. Under 1 ms er der ingen forskel at se, og
// over 2 sekunder er det ikke længere en afspilning.
export const MIN_SPEED_MS = 1;
export const MAX_SPEED_MS = 2000;
export const DEFAULT_SPEED_MS = 60;

// Regelnavnene som motoren kender dem → det læreren kalder dem i menuen.
// Samme oversættelse som i HintsStack: advarsler og afspilning må ikke bruge
// hvert sit ord om den samme regel.
const RULE_LABELS = {
    distribute: 'Fordel',
    cluster: 'Klyng',
    separate: 'Adskil',
    strict_separate: 'Adskil',
    aggregate: 'Opdel',
    balance: 'Balancér',
    minimizediff: 'Ensartede',
    group_sort: 'Saml',
};

let timer = null;

/** Regeltekst til én hændelse: "Adskil på Navn" — eller null. */
export function ruleLabel(raw) {
    if (!raw) return null;
    const cut = String(raw).indexOf(':');
    const name = cut === -1 ? String(raw) : String(raw).slice(0, cut);
    const attr = cut === -1 ? '' : String(raw).slice(cut + 1);
    const label = RULE_LABELS[name.toLowerCase()] || name;
    // Motor B lægger selv en "fordel spøgelserne"-regel forrest, som læreren
    // ikke har bedt om. Den skal ikke se ud som en af hendes egne.
    if (attr === '_rowId' || attr === 'phantom') return 'Udjævner gruppestørrelser';
    return attr ? `${label} på ${attr}` : label;
}

/**
 * Hvem sidder hvor efter `n` bytter?
 *
 * Spoler altid forfra. Det lyder dyrt, men er det ikke: 9.408 bytter på
 * almindelige arrays tager under 5 ms, og til gengæld findes der ingen
 * mellemgemte billeder der kan komme ud af trit med sandheden. Det er samme
 * afvejning som alle andre steder i det her værktøj — én kilde frem for en
 * hurtig kopi.
 */
export function seatingAt(run, n) {
    const deal = run.deal || [];
    const seating = run.seed.map(() => []);
    const total = frameCount(run);

    // Motor B sorterer medlemmerne, når resultatet skrives til sin outputfil,
    // og efterpasset kan ændre rækkefølgen efter sidste optagede bytte. Den
    // rækkefølge kan ikke altid rekonstrueres fra deltaerne alene. Ved et
    // komplet slutbillede bruger vi derfor motorens gemte facit. En afkortet
    // optagelse må ikke gøre det — dér mangler der bevidst hændelser, og
    // afspilleren skal blive ved med at vise advarslen om den manglende slutning.
    if (!run.truncated && n >= total && Array.isArray(run.final)) {
        return run.final.map(group => group.slice());
    }

    // FASE 1 — uddelingen. Motoren sorterer eleverne og lægger dem ud én ad
    // gangen; det er dét, der sker, før noget som helst bliver byttet. Er vi
    // stadig midt i den, står resten af pladserne tomme.
    const dealt = Math.max(0, Math.min(n, deal.length));
    for (let i = 0; i < dealt; i++) {
        const [id, gi] = deal[i];
        if (seating[gi]) seating[gi].push(id);
    }
    if (n < deal.length) return seating;

    // FASE 2 — bytterne. Herfra er alle på plads, og vi kan lige så godt tage
    // det færdige udgangspunkt: det er den samme fordeling, og det er den,
    // Python-testen holder os op på.
    const after = run.seed.map(g => g.slice());
    const where = new Map();
    after.forEach((group, gi) => group.forEach(m => where.set(m, gi)));

    const stop = Math.max(0, Math.min(n - deal.length, run.events.length));
    for (let i = 0; i < stop; i++) {
        const event = run.events[i];
        if (isMove(event)) { moveTo(after, where, event[0], event[8]); continue; }
        const kind = event[2];
        for (const [a, b] of pairsOf(event)) swapPair(after, where, a, b, kind);
    }
    return after;
}

/**
 * En flytning uden makker: én elev går til en anden gruppe (b er null, og
 * målgruppen står som niende felt). Motoren (motor/engine) laver dem;
 * den gamle Python-motors optagelser byttede altid to.
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
 * som ottende felt — se recorder.swap_block. De skal anvendes i SAMME billede;
 * før var hvert par sit eget billede, og så stod aftalens elever i hver sin
 * gruppe imellem dem, noget motoren aldrig gjorde.
 */
function pairsOf(event) {
    const extra = Array.isArray(event[7]) ? event[7] : [];
    return [[event[0], event[1]], ...extra];
}

function swapPair(after, where, a, b, kind) {
    const ga = where.get(a);
    const gb = where.get(b);
    // En hændelse vi ikke kan placere, springes over i stedet for at
    // vælte afspilningen. Sker det, er optagelsen og resultatet uenige,
    // og så fanger Python-testen det (test_recorder.py) længe før det her.
    if (ga === undefined || gb === undefined || ga === gb) return;
    const ia = after[ga].indexOf(a);
    const ib = after[gb].indexOf(b);
    if (ia === -1 || ib === -1) return;

    // Motor A og den gamle motor B bytter ved at fjerne begge
    // elever og sætte den nye elev SIDST i den anden gruppe. Før stod de
    // på samme pladser i afspilleren, så medlemskabet var rigtigt, men
    // rækkefølgen i slutbilledet ikke lignede resultatet på kortene.
    // Efterpasset (KIND_JOINT) bytter derimod to listepositioner direkte
    // og skal derfor beholde den gamle pladsering.
    if (kind === KIND_JOINT) {
        after[ga][ia] = b;
        after[gb][ib] = a;
    } else {
        after[ga].splice(ia, 1);
        after[gb].splice(ib, 1);
        after[ga].push(b);
        after[gb].push(a);
    }
    where.set(a, gb);
    where.set(b, ga);
}

/** Samlet antal billeder: først uddelingen, så bytterne. */
export function frameCount(run) {
    return (run.deal || []).length + run.events.length;
}

/**
 * Hændelsen der lige er sket — det er den, kortene fremhæver.
 *
 * `soloMove` er vigtig: motor B fylder grupperne op med spøgelseselever, og de
 * tegnes ikke (de er ikke elever). Bytter en rigtig elev med et spøgelse, ser
 * det derfor ud, som om hun vandrer alene mellem to grupper — igen og igen.
 *
 * Det er ikke en fejl i afspilningen, det er hvad motoren gør: et spøgelse har
 * ingen værdi i nogen kolonne, så det kan aldrig bryde en regel, og
 * `valid_swap` i den gamle motor B godkender det som eneste mulige makker. Målt på
 * lærerens eget hold var 69-94 % af motor B's bytter af den slags — og for
 * reglen "Fordel på Køn" var det 100 %.
 *
 * Uden det her flag stod der bare "Bytte 143", mens én elev hoppede frem og
 * tilbage uden synlig grund.
 */
function eventAt(run, n, phantomPrefix) {
    const deal = run.deal || [];
    if (n <= 0) return null;
    if (n <= deal.length) {
        const [id, gi] = deal[n - 1];
        return { a: id, b: null, kind: KIND_DEAL, groupIndex: gi, passNum: null,
                 before: null, after: null, rule: null };
    }
    const i = n - deal.length;
    if (i > run.events.length) return null;
    const event = run.events[i - 1];
    const [a, b, kind, passNum, before, after, rule] = event;
    if (isMove(event)) {
        return { a, b: null, kind, passNum, before, after, rule: ruleLabel(rule),
                 moved: [a], pairCount: 1, soloMove: false, isMove: true, groupIndex: event[8] };
    }
    const p = phantomPrefix || '\u0000tom:';
    const aGhost = String(a).startsWith(p);
    const bGhost = String(b).startsWith(p);
    const pairs = pairsOf(event);
    return {
        a, b, kind, passNum, before, after, rule: ruleLabel(rule),
        // Alle der flyttede i billedet — ved et blok-bytte flere end to.
        moved: pairs.flat(),
        pairCount: pairs.length,
        // Én af de to er en tom plads — den anden ser ud til at flytte alene.
        soloMove: aGhost !== bGhost,
    };
}

function apply() {
    const r = state.replay;
    if (!r) return;
    const run = r.recording.runs[r.runIndex];
    state.replay = {
        ...r,
        seating: seatingAt(run, r.frameIndex),
        last: eventAt(run, r.frameIndex, r.phantomPrefix),
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
 * @param recording   optagelsen fra Python
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
        phantomPrefix: recording.phantom_prefix || '\u0000tom:',
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

export function selectRun(i) {
    const r = state.replay;
    if (!r) return;
    const idx = Math.max(0, Math.min(parseInt(i, 10) || 0, r.recording.runs.length - 1));
    pause();
    state.replay = { ...state.replay, runIndex: idx, frameIndex: 0 };
    apply();
}
