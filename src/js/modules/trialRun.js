// trialRun.js — prøvekørslen: en kort gruppedannelse i baggrunden.
//
// HVORFOR (Kenneth 12/11 2026): motoren er blevet så hurtig, at den kan prøve
// opskriften, MENS læreren skriver den. Det hurtige tjek (check() i
// nextEngine.js, under 1 ms) siger kun, hvad der ikke KAN gå op. Prøvekørslen
// danner faktisk grupper og siger, hvad der ikke GIK op: "Adskil på Rolle: to
// ender i samme gruppe". Så ser læreren det, før hun trykker Dan grupper.
//
// HVAD DEN ER — OG IKKE ER:
//   - Tre forsøg med et FAST frø. Samme opskrift giver derfor altid samme
//     prøvekørsel (advarslerne blinker ikke), og den er færdig på et øjeblik:
//     målt 12/11 på motorens testsæt 1 og 2 tog den typisk få millisekunder
//     og højst ca. et kvart sekund på én kerne.
//   - Grupperne fra prøvekørslen bruges ALDRIG. "Dan grupper" kører som altid:
//     nyt lod hver gang, hele budgettet, afspilning og Stop. Prøvekørslen
//     rører hverken grupperne på skærmen, historikken eller lageret.
//   - Den er et skøn. Den fulde kørsel leder længere og kan ende bedre (målt
//     på 300 klasser med 968 regler: med tre forsøg var prøvekørslen og en
//     fuld kørsel ikke uenige om én eneste regel; med ét forsøg om én).
//     Derfor står resultatet som "Prøvekørsel" med dæmpede mærker, ikke som
//     et resultat.
//
// HVOR DET STÅR (Kenneth 12/11): advarslerne fra prøvekørslen står i den SAMME
// stak øverst i opskriften som alle andre advarsler og ser ud som dem
// (hints.js, trialHints). Der er ikke et særligt sted til prøvekørslen: for
// læreren er det bare "det, du lige skal være opmærksom på". Kun mærkerne ved
// reglerne er dæmpede, fordi de ellers betyder "sådan gik det i grupperne på
// skærmen".
//
// HVORNÅR DEN KØRER: kun på Grupper-fanen, når opskriften har stået stille et
// øjeblik (TRIAL_QUIET_MS), når det hurtige tjek siger, at opsætningen kan
// dannes, og kun når der ikke allerede står et rigtigt resultat for præcis
// denne opskrift (mærkerne fra sidste kørsel eller "Sidste dannelse").
//
// Den har sin EGEN tråd (samme engine-worker.js som kørslen), så den aldrig
// står i vejen for Dan grupper eller for det hurtige tjek.
//
// ÉN KERNE (97. gennemsyn, 13/11 2026): motoren starter ellers op til 8
// hjælpetråde i HVER kørsel (motor/engine/solve.js, startPool). Det giver
// mening for Dan grupper, der leder i sekunder — men prøvekørslen er tre
// forsøg på få millisekunder, og den kører ved hver ændring af opskriften.
// Målt i Chrome på en maskine med 10 kerner: én prøvekørsel startede 8
// hjælpetråde, der hver skulle hente motoren og have en kopi af hele klassen.
// Derfor beder den om én kerne (`cores: 1` i beskeden til engine-worker.js).
// Svaret er det samme: med fast frø giver motoren samme vinder på én og på
// flere kerner (kontrakten).

import { reactive, computed, watch, toRaw, markRaw } from 'vue';
import { reactiveState as state } from './reactiveState.js';
import {
    checkInput, engineCheck, lastRunApplies, inputFingerprint, makeEngineWorker, ruleSources,
    contractProblem, dedupeAnswerMessages, APP_OWNED_CODES, coveredByRecipeHint, currentRecipeHintIds,
    fillMessageText, severityOf, issueKey, resultSlot, noteKeys,
} from './nextEngine.js';
import { ruleMarks } from './ruleMarks.js';
import { memberDisplayName } from './utils.js';

/** Tre forsøg, fast frø: hurtig og altid den samme for samme opskrift. */
export const TRIAL_BUDGET = Object.freeze({ maxSeconds: 0.6, maxAttempts: 3, minAttempts: 3 });
export const TRIAL_SEED = 1;
/** Så længe skal opskriften have stået stille, før den prøves. */
export const TRIAL_QUIET_MS = 500;
/** Svarer tråden ikke inden da, lukkes den (den skulle bruge under et sekund). */
export const TRIAL_GIVE_UP_MS = 8000;
/**
 * Så mange gange i træk må tråden fejle, før prøvekørslen holder helt op i
 * denne fane. En gammel fane efter en deploy kan ikke hente trådens fil (den
 * gamle er slettet på serveren); uden grænsen spurgte den serveren forgæves
 * ved HVER ændring af opskriften. Et svar nulstiller tælleren.
 */
export const TRIAL_MAX_FAILURES = 3;

/**
 * Sidste prøvekørsel pr. visning: { key, rules, agreements, notes } — eller
 * null. `key` er aftrykket af den opskrift, den blev lavet med; trialFor()
 * svarer kun, mens det stadig passer.
 *
 * Noterne gemmes UDEN navne: { key, text, students, type }, hvor `text` kan
 * indeholde pladsholderen {elever}. Navnene sættes ind, når noten vises
 * (trialNotes). Motorens input har ingen navne, så retter læreren et navn
 * eller skifter "Vis:", er aftrykket det samme — og en note med navnene
 * skrevet ind ville blive ved med at vise det gamle navn.
 */
export const trial = reactive({ standard: null, matrix: null });

const viewOf = (isMatrix) => (isMatrix ? 'matrix' : 'standard');

/** Aftrykket af det, prøvekørslen regner på: klassen, visningen og motorens input. */
function keyFor(input, isMatrix) {
    return JSON.stringify([state.currentClass?.filename ?? null, isMatrix, inputFingerprint(input)]);
}

/**
 * Motorens tekst, som den passer til en prøvekørsel:
 *   - uden henvisning til grupper. "To ender i samme gruppe (Gruppe 2)" peger
 *     på en gruppe i svaret — og prøvekørslens grupper findes ikke på skærmen.
 *     Motoren skriver altid grupperne som en parentes.
 *   - uden rådet "Prøv at danne igen": der er ikke dannet noget endnu.
 */
export function trialText(text) {
    return String(text ?? '')
        .replace(/ \((?:\{gruppe:\d+\}|…|, )+\)/g, '')
        .replace(/ Prøv at danne igen\./g, '');
}

/**
 * Prøvekørslens svar → det, opskriften viser. Ren omregning (trialRun.test.js).
 *
 * Noterne er KUN det, prøvekørslen fandt ud over det hurtige tjek: en besked,
 * tjekket allerede har sagt (samme sag, eller dets advarsel om samme regel og
 * pulje), står ikke to gange.
 *
 * @param input      det input, prøvekørslen fik (uden budget og frø)
 * @param answer     motorens svar
 * @param o.sources      reglernes plads i klassens liste (ruleSources)
 * @param o.checkMessages  det hurtige tjeks beskeder lige nu
 * @param o.hintIds      opskriftens egne advarsler (coveredByRecipeHint)
 * @returns {{ rules, agreements, notes: [{ key, text, students, type }] } | null}  null: svaret kan ikke bruges
 */
export function readTrialAnswer(input, answer, { sources = [], checkMessages = [], hintIds = [] } = {}) {
    if (!answer || contractProblem(input, answer)) return null;
    if (answer.status !== 'ok' && answer.status !== 'impossible') return null;

    const said = new Set();
    for (const m of checkMessages) {
        said.add(issueKey(m));
        const slot = resultSlot(m);
        if (slot) said.add(slot);
    }
    const notes = [];
    for (const m of dedupeAnswerMessages(answer.messages)) {
        if (APP_OWNED_CODES.has(m.code)) continue;
        if (coveredByRecipeHint(m, input, hintIds)) continue;
        if (noteKeys(m).some(k => said.has(k))) continue;
        notes.push({
            key: issueKey(m),
            text: trialText(m.text),
            students: Array.isArray(m.students) ? m.students.slice() : [],
            type: severityOf(m, answer.status),
        });
    }
    // "Umulig" uden grupper: ingen mærker, kun grunden.
    if (answer.status === 'impossible') return { rules: {}, agreements: null, notes };
    const marks = ruleMarks(input, answer, sources, severityOf);
    return { rules: marks.rules, agreements: marks.agreements, notes };
}

/**
 * Prøvekørslen for det, der står lige nu — eller null (ingen endnu, opskriften
 * er ændret siden, eller der står et rigtigt resultat).
 */
export function trialFor(isMatrix) {
    const got = trial[viewOf(isMatrix)];
    if (!got) return null;
    // Kun visningen på skærmen kan have en prøvekørsel (se wantedKey).
    if (isMatrix !== (state.activeView === 'matrix')) return null;
    return got.key === wanted.value ? got : null;
}

/** En note med navnene sat ind. `studentName`: id → navn. */
export function trialNoteText(note, studentName) {
    return fillMessageText(note, { studentName, groupName: () => null });
}

/**
 * Prøvekørslens noter for det, der står lige nu, med elevernes navne, som de
 * hedder NU: [{ key, text, type }]. Tom liste uden en prøvekørsel.
 */
export function trialNotes(isMatrix) {
    const got = trialFor(isMatrix);
    if (!got || !got.notes.length) return [];
    const data = state.currentClass?.data || [];
    const studentName = (id) => memberDisplayName(id, data, state.displayColumn);
    return got.notes.map(n => ({ key: n.key, type: n.type, text: trialNoteText(n, studentName) }));
}

/**
 * Nøglen for den prøvekørsel, der er brug for lige nu — eller '' (ingen):
 * ikke på Grupper-fanen, en dannelse i gang, intet at sende, det hurtige tjek
 * siger nej, eller sidste rigtige kørsel passer stadig til opskriften.
 */
function wantedKey() {
    const isMatrix = state.activeView === 'matrix';
    if (state.navView !== 'class' || state.classViewTab !== 'groups') return '';
    if (state.isGenerating || !state.currentClass) return '';
    const input = checkInput.value;
    if (!input) return '';
    // Tjekket skal have svaret om NETOP dette input, og sige "kan dannes".
    const chk = engineCheck.value;
    if (!chk || chk.status !== 'ok' || toRaw(chk.input) !== toRaw(input)) return '';
    // Et rigtigt resultat for præcis det, der skal dannes, vinder over en
    // prøve. Samme svar som noterne i stakken (lastRunApplies i
    // nextEngine.js, forslag 78): før holdt prøvekørslen pause efter det
    // løsere aftryk (setupSignature), så en låsning eller en rettet celle
    // efter Dan grupper hverken gav en prøve eller fjernede det gamle resultat.
    if (lastRunApplies(isMatrix)) return '';
    return keyFor(input, isMatrix);
}
// Regnes ÉN gang pr. ændring og deles af alle, der spørger (mærkerne,
// sektionen, bjælkens tælling og køen nedenfor): nøglen bygger motorens input
// om, og det skal ikke ske fire gange for hvert tastetryk.
const wanted = computed(wantedKey);

// ─── Tråden og køen ─────────────────────────────────────────────────────────
// Én prøvekørsel ad gangen. Ændres opskriften imens, startes den næste, når
// svaret er kommet OG opskriften har stået stille i TRIAL_QUIET_MS (quietLeft)
// — så to kørsler aldrig deler tråd, og en halvskrevet opskrift ikke prøves.

let worker = null;
let busy = null;        // { id, key, timer } for prøvekørslen i gang
let quietTimer = null;
let seq = 0;
let failedKey = '';     // en opskrift, tråden gik ned på, prøves ikke igen og igen
let failures = 0;       // fejl i træk uden et svar imellem (TRIAL_MAX_FAILURES)
let lastChangeAt = 0;   // sidste gang det, der skal prøves, ændrede sig (Date.now())

/**
 * Hvor længe der stadig skal ventes, før opskriften har stået stille i
 * TRIAL_QUIET_MS. 0, hvis den allerede har.
 *
 * HVORFOR (107. gennemsyn, 13/11 2026): når et svar kom (eller tråden
 * fejlede), startede den næste prøvekørsel MED DET SAMME — også selvom
 * læreren havde ændret opskriften for 100 ms siden og stadig var i gang.
 * Svaret ryddede nemlig ventetiden. Med et hold på 130 elever tager en
 * prøvekørsel et halvt sekund, så den næste kørte på en halvskrevet opskrift.
 */
function quietLeft() {
    return Math.max(0, lastChangeAt + TRIAL_QUIET_MS - Date.now());
}

function dropWorker() {
    if (!worker) return;
    try { worker.terminate(); } catch { /* væk i forvejen */ }
    worker = null;
}

function finishBusy() {
    if (busy) clearTimeout(busy.timer);
    busy = null;
}

function start() {
    const isMatrix = state.activeView === 'matrix';
    const key = wanted.value;
    if (!key || key === failedKey || typeof Worker === 'undefined') return;
    if (failures >= TRIAL_MAX_FAILURES) return;      // tråden kan ikke bruges i denne fane
    if (busy) return;                                // svaret sætter den næste i gang
    if (trial[viewOf(isMatrix)]?.key === key) return; // har den allerede

    const input = toRaw(checkInput.value);
    const context = {
        isMatrix,
        input,
        sources: ruleSources.get(input) || [],
        checkMessages: (engineCheck.value?.messages || []).slice(),
        // Opskriftens advarsler NU, sammen med tjekket: svaret gemmes under
        // denne opskrifts nøgle, så det skal læses med denne opskrifts
        // advarsler — ikke med dem, der står, når svaret kommer (læreren kan
        // have skiftet klasse imens). 107. gennemsyn.
        hintIds: currentRecipeHintIds(),
    };
    try {
        if (!worker) {
            worker = makeEngineWorker();
            worker.onmessage = onMessage;
            worker.onerror = (e) => {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                giveUp();
            };
        }
        const id = ++seq;
        busy = { id, key, context, timer: setTimeout(giveUp, TRIAL_GIVE_UP_MS) };
        // JSON-kopi: input kan ligge i Vues tilstand, og tråden skal have rene data.
        // cores: 1 — ingen hjælpetråde til tre korte forsøg (se øverst).
        worker.postMessage({ type: 'run', id, cores: 1, input: { ...JSON.parse(JSON.stringify(input)), budget: { ...TRIAL_BUDGET }, seed: TRIAL_SEED } });
    } catch (e) {
        giveUp();
    }
}

/** Tråden fejlede eller svarede ikke: ingen prøvekørsel for denne opskrift. Stille. */
function giveUp() {
    if (busy) failedKey = busy.key;
    failures++;
    finishBusy();
    dropWorker();
    // Er opskriften ændret imens, prøves den nye (indtil grænsen er nået),
    // når den har stået stille.
    if (failures < TRIAL_MAX_FAILURES) schedule(quietLeft());
}

function onMessage(e) {
    const m = e.data || {};
    if (!busy || m.id !== busy.id) return;
    if (m.type === 'progress') return;
    if (m.type === 'crash') { giveUp(); return; }
    if (m.type !== 'answer') return;
    const { key, context } = busy;
    finishBusy();
    failures = 0;   // tråden virker
    let result = null;
    try {
        result = readTrialAnswer(context.input, m.answer, {
            sources: context.sources,
            checkMessages: context.checkMessages,
            hintIds: context.hintIds,
        });
    } catch (err) {
        console.error('[Gruppemotor] Prøvekørslens svar kunne ikke læses:', err);
    }
    if (result) trial[viewOf(context.isMatrix)] = markRaw({ key, ...result });
    else failedKey = key;
    // Er opskriften ændret imens, prøves den nye — når den har stået stille.
    schedule(quietLeft());
}

function schedule(delay = TRIAL_QUIET_MS) {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(start, delay);
}

// Hver gang det, der skal prøves, ændrer sig: vent, til det har stået stille.
if (typeof Worker !== 'undefined') {
    watch(wanted, (key) => {
        lastChangeAt = Date.now();
        clearTimeout(quietTimer);
        if (key) schedule();
    }, { immediate: true });
}
