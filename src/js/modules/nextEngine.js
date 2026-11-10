// nextEngine.js — kontakten til gruppemotoren (grup.dk/motor/engine/).
//
// Siden 3/11 2026 er det den ENESTE motor: den gamle Python-motor (Pyodide)
// er fjernet. generation.js kalder tryNextEngine() herunder. Kan motoren ikke
// danne grupperne (opsætningen kan ikke bruges, den fejler, går i stå eller
// svarer noget, der bryder kontrakten), står grupperne på skærmen urørte, og
// læreren får en rolig besked om hvorfor. En time må aldrig gå i stå.
//
// Formatet ind og ud er kontrakten i docs/grupper-js-motor-kontrakt.md. Det er
// den eneste beskrivelse, motorens side bygger motoren efter, så ændres noget
// her, skal kontrakten følge med (og omvendt).
//
// Motoren ligger i grup.dk/motor/engine/ (med egne tests og dommer — se
// docs/grupper.md). Et svar med grupper lægges på skærmen af landAnswer() herunder:
// numre, emner, gem, historik, afspilning. Stop beholder den foreløbig bedste
// deling (kontraktens afsnit 5).

import { ref, computed, markRaw, reactive, watch } from 'vue';
import { state } from './state.js';
import * as storage from './storage.js';
import * as replay from './replay.js';
import { pushRun, markClean } from './runHistory.js';
import { beginRun, announce, commitRun } from './setupNotices.js';
import { togetherComponents } from './together.js';
import { ruleDisplayOrder } from './recipe.js';
import { ruleMarks } from './ruleMarks.js';
import { checkForNewBuild, NEW_BUILD_MESSAGE } from './newBuild.js';
import {
    ROW_ID, RULE_TYPES, memberIdStr, nfc, migrateRefsToRowIds, memberDisplayName,
    groupDisplayName, homeGroupFingerprint, setupSignature, groupCountText,
} from './utils.js';

export const CONTRACT_VERSION = 3;

/**
 * Budgettet: 10 sekunder til og med 100 elever, 30 over (kontrakten). Uden
 * frø er `maxAttempts` et MINDSTE antal forsøg (kontrakten 9.2) — motoren
 * fortsætter, til den ikke bliver bedre, eller tiden er gået. Læreren kan se
 * fremgangen og stoppe, når hun er tilfreds. (Tallene 20 og 3/2 er de samme,
 * som den gamle motor fik.)
 */
export function appBudget(studentCount) {
    return {
        maxSeconds: studentCount > 100 ? 30 : 10,
        maxAttempts: 20,
        minAttempts: studentCount <= 60 ? 3 : 2,
    };
}

/** Så længe må motoren tie (ingen fremgang, intet svar), før den regnes for gået i stå. */
export const SILENCE_LIMIT_MS = 20000;
/**
 * Så længe ventes der på motorens svar efter Stop. Kontrakten lover ca. 1
 * sekund; dobbelt så meget, før tråden afbrydes og grupperne bliver stående.
 */
export const STOP_WAIT_MS = 2500;

/** Gruppenummeret i et internt navn ("Group 3" → 3), eller null. */
const GROUP_NUMBER = /(?:Group|Gruppe)\s+(\d+)/i;
export function groupNumberOf(name) {
    const m = String(name ?? '').match(GROUP_NUMBER);
    return m ? parseInt(m[1], 10) : null;
}

/** Reglerne, der har valgte værdier (kun de to Adskil). */
const VALUE_RULES = [RULE_TYPES.SEPARATE, RULE_TYPES.STRICT_SEPARATE];
/** Reglerne, en tekstkolonnes rækkefølge (columnOrders) gælder for. */
const ORDERED_RULES = [RULE_TYPES.BALANCE, RULE_TYPES.MINIMIZEDIFF, RULE_TYPES.GROUP_SORT];

const asText = (v) => (v === undefined || v === null) ? '' : nfc(String(v));

/**
 * Byg kontraktens input (afsnit 2) ud fra lærerens klasse.
 *
 * Ren funktion: alt kommer ind som argumenter, så den kan testes uden
 * browser. Svarer `null`, når appen slet ikke skal kalde motoren (ingen
 * elever, alle låst, antal grupper ≤ låste, matrix uden stamgrupper). Så
 * siger tryNextEngine selv hvorfor (nothingToSendText).
 *
 * @param {object} o
 * @param {object} o.cls             klassen (data, rules, matrixRules, settings, …)
 * @param {boolean} o.isMatrix
 * @param {string} o.groupMode       'size' | 'number' (stamvisningens valg)
 * @param {object|null} o.overrideSettings  { mode, target, mod, matrixStrategy, matrixRepresentationType }
 * @param {string[]} o.skipTogether  "Dan uden aftalen": elever i aftaler, der springes over
 * @param {Array} o.viewGroups       grupperne i visningen nu (de låste læses herfra)
 * @param {Array} o.homeGroups       stamgrupperne (kilden til matrix)
 * @param {Function} o.topicFor      opslag af en stamgruppes gemte emne på navn
 */
export function buildEngineInput({ cls, isMatrix, groupMode, overrideSettings = null, skipTogether = [], viewGroups = [], homeGroups = [], topicFor = () => null }) {
    if (!cls || !Array.isArray(cls.data)) return null;
    const idOf = (row) => String(row[ROW_ID] ?? '').trim();

    // Fraværende ud først (kontrakten: de findes ingen steder i input).
    const present = cls.data.filter(r => !r._excluded);
    const presentIds = new Set(present.map(idOf));
    const presentMembers = (members) => (members || []).map(memberIdStr).filter(id => id && presentIds.has(id));

    // De låste grupper og deres elever.
    const locked = (viewGroups || []).filter(g => g && g.locked);
    const lockedIds = new Set();
    locked.forEach(g => (g.members || []).forEach(m => { const id = memberIdStr(m); if (id) lockedIds.add(id); }));
    const free = present.filter(r => !lockedIds.has(idOf(r)));
    if (free.length === 0) return null;

    // Reglerne i den rækkefølge, opskriften VISER dem: i
    // trin efter type (Adskil altid, Vejer tungt, Mål, Saml), og inden for
    // et trin som i listen (ruleDisplayOrder i recipe.js). Så får motoren
    // præcis det, læreren ser. Kun regler med en kolonne.
    const shownRules = ruleDisplayOrder((isMatrix ? cls.matrixRules : cls.rules) || []);
    const rules = [];
    const sources = [];   // for hver regel i input: dens plads i klassens liste
    for (const { rule: r, index: sourceIndex } of shownRules) {
        const column = r && (r.column || r.attribute);
        if (!column) continue;
        const type = r.type || r.name;
        // Opdel i matrix: opskriften tilbyder den ikke (MATRIX_EXCLUDED_RULES),
        // men en ældre gemt matrixregel kan stadig have den. Kontrakten
        // (version 3) lover, at appen aldrig sender den.
        if (isMatrix && type === RULE_TYPES.AGGREGATE) continue;
        const rule = { type, column };
        if (VALUE_RULES.includes(type)) {
            const raw = Array.isArray(r.values) ? r.values : (r.value ? [r.value] : []);
            let values = raw.map(v => asText(v).trim()).filter(Boolean);
            // En værdi, som KUN låste elever har, gør ingenting (svar 5) — den
            // fjernes her, og står ingen tilbage, sendes reglen ikke.
            const inFree = new Set(free.map(s => asText(s[column]).trim()));
            const inLocked = new Set(present.filter(s => lockedIds.has(idOf(s))).map(s => asText(s[column]).trim()));
            values = values.filter(v => inFree.has(v) || !inLocked.has(v));
            if (!values.length) continue;
            rule.values = values;
        }
        rules.push(rule);
        sources.push(sourceIndex);
    }

    // Kun de kolonner, en regel bruger — ingen navne, intet andet.
    const columns = [...new Set(rules.map(r => r.column))];
    const students = free.map(row => {
        const out = { [ROW_ID]: idOf(row) };
        for (const c of columns) out[c] = asText(row[c]);
        return out;
    });

    const columnOrders = {};
    for (const r of rules) {
        if (!ORDERED_RULES.includes(r.type)) continue;
        const order = cls.columnOrders && cls.columnOrders[r.column];
        if (Array.isArray(order) && order.length) columnOrders[r.column] = order.map(asText);
    }

    // Aftalerne. Skal sammen sendes som samlede blokke; en blok, der kun har
    // låste elever, er allerede opfyldt og sendes ikke. Låste elever i en
    // blok BLIVER stående, så motoren kan sige "på tværs af en låst gruppe".
    const skip = new Set((skipTogether || []).map(id => String(id).trim()));
    const together = isMatrix ? [] : togetherComponents(cls.togetherGroups || [], present)
        .filter(ids => !ids.some(id => skip.has(id)))
        .filter(ids => ids.some(id => !lockedIds.has(id)));
    const freeIds = new Set(students.map(s => s[ROW_ID]));
    const avoid = (cls.separations || [])
        .map(sep => (sep.ids || []).map(id => String(id).trim()).filter(id => freeIds.has(id)))
        .filter(ids => ids.length >= 2);

    // Nummeret, læreren ser. En låst gruppe uden nummer i navnet (sker ikke i
    // dag) får et højt, ledigt nummer, så den ikke tager et af de nye.
    let spare = 1000;
    const lockedGroups = locked.map(g => {
        const number = groupNumberOf(g.name) ?? spare++;
        return {
            id: String(g.name),
            number,
            name: groupDisplayName(g.name),
            members: presentMembers(g.members),
            topic: (!isMatrix && g.topic && String(g.topic).trim()) ? String(g.topic).trim() : null,
        };
    });

    // Størrelsen, som læreren har sat den.
    const settings = (isMatrix ? cls.matrixSettings : cls.settings) || {};
    const target = overrideSettings ? overrideSettings.target : settings.groupTarget;
    const mod = overrideSettings ? overrideSettings.mod : settings.groupMod;
    const mode = overrideSettings?.mode || groupMode;
    let strategy = isMatrix ? (overrideSettings?.matrixStrategy || settings.matrixStrategy || 'full_strict') : null;
    if (strategy === 'full' || strategy === 'full_flex') strategy = 'full_strict';

    let size;
    if (isMatrix && strategy === 'full_strict') {
        size = { mode: 'full' };
    } else if ((!isMatrix && mode === 'number') || (isMatrix && strategy === 'count')) {
        const count = parseInt(target || 0, 10);
        if (!(count > locked.length)) return null;   // appen siger selv fra
        size = { mode: 'count', count };
    } else {
        // Et mål under 1 (kun muligt fra en gammel eller importeret
        // indstilling — opskriften tillader det ikke) sendes, som det er:
        // motoren svarer "invalid-input", og læreren får dens besked om, hvad
        // der skal rettes.
        size = { mode: 'perGroup', target: parseInt(target || 3, 10) || 3, adjust: mod === '-' ? 'minus' : 'plus' };
    }

    let matrix = null;
    if (isMatrix) {
        if (!homeGroups || homeGroups.length === 0) return null;
        const repType = overrideSettings?.matrixRepresentationType || settings.matrixRepresentationType || 'topic';
        // Stamgruppens id er det navn, læreren ser ("Gruppe 2"), ikke det
        // interne ("Group 2"): motoren skriver id'et i sine beskeder ("Kilderne
        // "Gruppe 2", "Gruppe 3" … har kun 5 elever"), og appen læser det aldrig
        // tilbage. Giver to grupper samme visningsnavn, bruges de interne.
        const shown = homeGroups.map(g => groupDisplayName(g.name));
        const unique = new Set(shown).size === shown.length;
        matrix = {
            source: repType === 'group' ? 'homeGroup' : 'topic',
            homeGroups: homeGroups.map((g, i) => {
                const stored = topicFor(g.name);
                const topic = (stored && stored.trim()) ? stored.trim()
                    : (g.topic && String(g.topic).trim()) ? String(g.topic).trim() : null;
                return { id: unique ? shown[i] : String(g.name), members: presentMembers(g.members), topic };
            }),
        };
    }

    const input = {
        contractVersion: CONTRACT_VERSION,
        view: isMatrix ? 'matrix' : 'home',
        students,
        rules,
        columnOrders,
        agreements: { together, avoid },
        lockedGroups,
        size,
        topics: isMatrix ? [] : (cls.topics || []).map(t => asText(t).trim()).filter(Boolean),
        matrix,
        budget: appBudget(students.length),
        seed: null,
    };
    ruleSources.set(input, sources);
    return input;
}

/**
 * Hvilken af klassens regler hver regel i input kom fra (input → liste af
 * pladser i `rules`/`matrixRules`). Input sendes sorteret efter trin og uden
 * regler, der ikke gør noget, så motorens regelnummer er ikke klassens.
 * Holdes uden for input, så motoren kun får kontraktens felter.
 */
export const ruleSources = new WeakMap();

/**
 * Kan en besked fra motoren IKKE læses? Beskederne læses af issueKey
 * (`values` og `students` lægges sammen med join), fillMessageText og
 * hints.js — en besked, der ikke er et objekt, eller hvis lister ikke er
 * lister, ville kaste dér. Bruges både på svaret (contractProblem) og på
 * check() (engineCheck).
 */
export function unreadableMessage(m) {
    return !m || typeof m !== 'object'
        || (m.students != null && !Array.isArray(m.students))
        || (m.values != null && !Array.isArray(m.values));
}

/**
 * Bryder svaret kontrakten? Svarer en kort dansk forklaring, eller null.
 * Kun "ok"-svar har grupper at tjekke (afsnit 3.3).
 */
export function contractProblem(input, answer) {
    if (!answer || typeof answer !== 'object') return 'svaret var tomt';
    if (!['ok', 'impossible', 'unsupported', 'error', 'stopped'].includes(answer.status)) return 'svaret havde ingen gyldig status';
    // "stopped" uden en hel deling er gyldigt (kontraktens afsnit 5).
    if (answer.status === 'stopped' && answer.groups == null) return null;
    // Beskederne læses ved "ok", "stopped" og "impossible" (landAnswer og
    // showImpossible). En besked, der ikke er et objekt, eller hvis elever ikke
    // er en liste, ville kaste dér — og ved "impossible" EFTER at overlayet er
    // slukket. Så hellere en kontrakt-grund med en læsbar besked.
    if (answer.status !== 'error' && answer.status !== 'unsupported' && answer.messages != null) {
        if (!Array.isArray(answer.messages) || answer.messages.some(unreadableMessage)) {
            return 'svaret havde en besked, der ikke kunne læses';
        }
    }
    if (answer.status !== 'ok' && answer.status !== 'stopped') return null;
    if (!Array.isArray(answer.groups) || answer.groups.length === 0) return 'svaret havde ingen grupper';
    const expected = new Set(input.students.map(s => s[ROW_ID]));
    const seen = new Set();
    for (const g of answer.groups) {
        const members = g && Array.isArray(g.members) ? g.members : null;
        if (!members || members.length === 0) return 'svaret havde en tom gruppe';
        for (const id of members) {
            if (!expected.has(id)) return 'svaret nævnte en ukendt elev';
            if (seen.has(id)) return 'en elev stod i to grupper';
            seen.add(id);
        }
    }
    if (seen.size !== expected.size) return 'en elev manglede i grupperne';
    // Én linje pr. regel i input (afsnit 3.5): mærkerne i opskriften læses
    // herfra, og et skævt svar må ikke kaste, efter at grupperne er skrevet.
    if (answer.rules != null) {
        const ruleCount = (input.rules || []).length;
        const bad = (r) => !r || typeof r !== 'object' || !Number.isInteger(r.rule) || r.rule < 0 || r.rule >= ruleCount
            || !(r.met === true || r.met === false || r.met === null);
        if (!Array.isArray(answer.rules) || answer.rules.some(bad)) return 'svaret havde en regel-linje, der ikke kunne læses';
    }
    return null;
}


// ─── Svaret → appens form (rene funktioner, testet uden browser) ────────────

/**
 * Numrene til de nye grupper: de ledige 1, 2, 3 … i svarets rækkefølge, uden
 * om de låste gruppers numre (kontraktens afsnit 3.3).
 */
export function freeNumbers(count, lockedNumbers) {
    const taken = new Set(lockedNumbers);
    const out = [];
    let n = 1;
    while (out.length < count) {
        if (!taken.has(n)) out.push(n);
        n++;
    }
    return out;
}

/**
 * En beskeds tekst med navne: `{elever}` → elevernes navne, `{gruppe:N}` →
 * navnet på gruppe N i svaret ("Gruppe 3"). Motoren kender ingen navne.
 */
export function fillMessageText(msg, { studentName, groupName }) {
    const names = (msg.students || []).map(studentName).filter(Boolean).join(', ');
    return String(msg.text || '')
        .split('{elever}').join(names || 'eleverne')
        .replace(/\{gruppe:(\d+)\}/g, (_, n) => groupName(parseInt(n, 10)) || `gruppe ${parseInt(n, 10) + 1}`);
}

/**
 * Har opskriften allerede sagt det samme før kørslen? Så skal motorens
 * besked ikke stå to gange. Sammenligningen sker på kode, regel og kolonne —
 * ikke på teksten. I dag gælder det kun "cellerne er ikke tal".
 */
export function coveredByRecipeHint(msg, input, hintIds) {
    const rule = Number.isInteger(msg.rule) ? input.rules[msg.rule] : null;
    // (Grenene for appens gamle feasibility:*-advarsler er fjernet 3/11 2026
    // sammen med advarslerne — check() siger det nu.)
    if (msg.code !== 'non-numeric-cells' || !rule) return false;
    const col = msg.column || rule.column || null;
    return hintIds.some(id => id.startsWith('hint:non-numeric:') && id.includes(`:${rule.type}:${col}`));
}

// ─── Én sag, én besked — og hvornår den er rød ──────────────────────────────
//
// Efter kontrakten (version 3, spørgsmål 45 og 49 hos den rene side):
// nøglen for "samme forhold" er code + rule + pool + values + students
// (sorteret), og farven følger beskedens `type`. Motoren sender aldrig samme
// nøgle to gange i ét svar eller ét check.

/**
 * Nøglen for "samme sag": en besked før kørslen (check) og en efter (run)
 * med samme nøgle handler om det samme, og appen viser den én gang. Eksempel
 * (Kenneths matrix-runde 2): "Højst én fra hvert emne kan ikke lade sig gøre
 * med 6 matrixgrupper …" kommer både fra check() og fra svaret — samme nøgle.
 */
export function issueKey(msg) {
    return [
        msg?.code ?? '', msg?.rule ?? '', msg?.pool ?? '',
        (msg?.values || []).join('|'), [...(msg?.students || [])].sort().join(','),
    ].join('~');
}

/**
 * Beskeder før kørslen om en regel (eller aftale), som resultatet efter
 * kørslen afløser: advarslerne om det, der ikke kan opfyldes, og noten om et
 * Skal sammen-par, Adskil alligevel må lade stå sammen (spørgsmål 51).
 */
const WARNING_CODES = new Set(['separate-unavoidable', 'cluster-unavoidable', 'avoid-unavoidable', 'together-separate-pair']);

/**
 * En Skal sammen-blok, der stopper dannelsen (rød, med "Dan grupper uden
 * aftalen")? Alle together-…-koder er "impossible" — undtagen noten
 * together-separate-pair (spørgsmål 51), som er blå og ikke stopper noget.
 */
export function isTogetherStop(msg) {
    return String(msg?.code || '').startsWith('together-') && msg?.type === 'impossible';
}

/**
 * Pladsen for en regels resultat — én pr. regel og pulje, for Undgå hinanden
 * én pr. aftale og pulje (spørgsmål 50). check() sender advarslen ("8 elever
 * skal adskilles, men der er kun 7 grupper …", rødt), og svaret sender i
 * stedet resultatet ("to ender i samme gruppe … Det kunne ikke undgås",
 * blåt). De to har IKKE samme nøgle (kode, værdier og elever er forskellige —
 * målt: 85 af 107 advarsler i sæt 1 og 2 har et resultat på samme plads),
 * så uden pladsen stod advarslen rødt i opskriften ved siden af resultatet.
 * Den eneste afvigelse fra kontraktens nøgle; meldt til den rene side.
 * null for alt andet.
 */
export function resultSlot(msg) {
    const code = msg?.code;
    const rule = Number.isInteger(msg?.rule) ? msg.rule : null;
    const students = msg?.students || [];
    const avoid = code === 'avoid-unavoidable' || (code === 'rule-not-met' && rule === null && students.length > 0);
    if (!WARNING_CODES.has(code) && code !== 'rule-not-met') return null;
    if (rule === null && !avoid) return null;      // fx matrix-kilderne
    return ['slot', rule ?? '', msg?.pool ?? '', avoid ? [...students].sort().join(',') : ''].join('~');
}

/** Er beskeden en advarsel, som et resultat på samme plads har afløst? */
export function replacedByResult(msg, keys) {
    return WARNING_CODES.has(msg?.code) && keys.has(resultSlot(msg));
}

/** Nøglerne, en note i "Sidste dannelse" husker: sin egen og sin plads. */
export function noteKeys(msg) {
    return [issueKey(msg), resultSlot(msg)].filter(Boolean);
}

/**
 * Rød ('error') kun for det, læreren SKAL rette (Kenneth 3/11): en
 * opsætning, der ikke kan dannes (status "impossible"), og en regel, læreren
 * selv har sat, som ikke kan opfyldes med klassen (type "impossible"). To
 * regler, der trækker hver sin vej ("conflict"), er ingen fejl — de giver
 * bare hinanden mindre plads — og er blå som alt andet ("note"): 'info'.
 */
export function severityOf(msg, answerStatus = 'ok') {
    if (answerStatus === 'impossible') return 'error';
    return msg?.type === 'impossible' ? 'error' : 'info';
}

/**
 * Samme nøgle kun én gang i ét svar. Kontrakten lover, at motoren aldrig
 * sender det; skulle det ske, står den sidste.
 */
export function dedupeAnswerMessages(messages) {
    const list = messages || [];
    const last = new Map(list.map((m, i) => [issueKey(m), i]));
    return list.filter((m, i) => last.get(issueKey(m)) === i);
}

/**
 * "Forsøg 13 af 20 – det bedste. 9 andre forsøg endte lige så godt."
 * Motorens tal for, hvilket forsøg grupperne kommer fra (kontrakt v3,
 * stats.winner og stats.sameAsWinner). Tom tekst, når tallene mangler — fx
 * når Stop kom, før noget forsøg var færdigt.
 */
export function attemptsText(stats) {
    const winner = stats?.winner;
    const attempts = stats?.attempts;
    if (!Number.isInteger(winner) || winner < 1 || !Number.isInteger(attempts) || attempts < winner) return '';
    let text = `Forsøg ${winner} af ${attempts} – det bedste.`;
    const same = stats.sameAsWinner;
    if (Number.isInteger(same) && same > 0) {
        text += same === 1 ? ' 1 andet forsøg endte lige så godt.' : ` ${same} andre forsøg endte lige så godt.`;
    }
    return text;
}

/**
 * Koder, som appen selv siger med en knap (og derfor beholder sin egen
 * besked for): motorens udgave vises ikke, hverken før eller efter kørslen.
 *   text-only-column        → "… gør ingenting" med "Ranger værdierne…"
 *   topic-rounding          → emne-afrundingen med knapper til antallet
 *   fewer-groups-than-asked → "flere grupper end elever" ved måltallet
 */
export const APP_OWNED_CODES = new Set(['text-only-column', 'topic-rounding', 'fewer-groups-than-asked']);

// ─── check(): beskederne før kørslen ────────────────────────────────────────

/**
 * Motorens input bygget af det, der står i appen lige nu. ÉT sted, så check(),
 * mærkerne (runStatusFor) og selve kørslen altid bygger det ens.
 */
function engineInputNow(isMatrix, { overrideSettings = null, skipTogether = [] } = {}) {
    return buildEngineInput({
        cls: state.currentClass,
        isMatrix,
        groupMode: state.groupMode,
        overrideSettings,
        skipTogether,
        viewGroups: (isMatrix ? state.storedMatrixGroups : state.storedStandardGroups) || [],
        homeGroups: state.storedStandardGroups || [],
        topicFor: (name) => storage.getTopic(name, 'S_'),
    });
}

/** Det input, appen ville sende lige nu (eller null). */
function currentEngineInput(isMatrix, skipTogether = []) {
    if (!state.currentClass) return null;
    try {
        return engineInputNow(isMatrix, { skipTogether });
    } catch (e) {
        return null;
    }
}

// check() kører i sin egen, vedvarende tråd (engine-worker.js), ikke på
// siden — se forklaringen øverst i engine-worker.js. Hver gang det input, appen
// ville sende, ændrer sig, sendes det dertil; svaret lander i checkAnswer.
// Under 1 ms selv for 286 elever (målt 3/11), så svaret er der et øjeblik efter.
const checkAnswer = ref(null);   // { id, input, answer }
let checkWorker = null;
let checkSeq = 0;

function ensureCheckWorker() {
    if (checkWorker || typeof Worker === 'undefined') return checkWorker;
    try {
        checkWorker = defaultWorker();
        checkWorker.onmessage = (e) => {
            const m = e.data || {};
            if (m.type === 'checked' && m.id === checkSeq) checkAnswer.value = { ...pendingCheck, answer: m.answer };
        };
        checkWorker.onerror = (e) => {
            console.error('[Gruppemotor] check()-tråden fejlede:', e && e.message ? e.message : e);
            try { checkWorker.terminate(); } catch { /* væk i forvejen */ }
            checkWorker = null;
            checkAnswer.value = null;
        };
    } catch (e) {
        console.error('[Gruppemotor] check() kunne ikke startes:', e);
        checkWorker = null;
    }
    return checkWorker;
}

let pendingCheck = null;
const checkInput = computed(() => currentEngineInput(state.activeView === 'matrix'));
// Klassens filnavn er en del af nøglen: en kopi af en klasse (fx "3a_kopi"
// fra flytningen af lagernøglerne, eller en backup lagt ind som ny klasse)
// har de samme elev-id'er og dermed præcis samme input. Uden filnavnet
// skete der intet ved skiftet fra 3a til kopien, og engineCheck gav null i
// kopien (svaret hørte til 3a) — opskriften stod uden motorens advarsler,
// til læreren ændrede noget.
watch(() => (checkInput.value
    ? JSON.stringify([state.currentClass?.filename ?? null, checkInput.value])
    : ''), (key) => {
    if (!key) { checkAnswer.value = null; return; }
    const worker = ensureCheckWorker();
    if (!worker) return;
    // Klassen og visningen kommer med, så et svar om én klasse aldrig vises
    // i en anden (læreren skifter klasse, før svaret er der).
    pendingCheck = { id: ++checkSeq, input: checkInput.value, filename: state.currentClass?.filename ?? null, isMatrix: state.activeView === 'matrix' };
    worker.postMessage({ type: 'check', id: checkSeq, input: JSON.parse(key)[1] });
}, { immediate: true });

/**
 * Motorens beskeder om opsætningen lige nu — eller null (intet at tjekke,
 * svaret er ikke kommet endnu, eller check() fejlede). Er opskriften lige
 * ændret, står det forrige svar, til det nye er der (et øjeblik).
 *
 * Svar: { input, status, messages } — beskederne uden APP_OWNED_CODES.
 */
export const engineCheck = computed(() => {
    if (!checkInput.value) return null;
    const got = checkAnswer.value;
    if (!got || got.filename !== (state.currentClass?.filename ?? null) || got.isMatrix !== (state.activeView === 'matrix')) return null;
    const answer = got.answer;
    // "unsupported" (fx "invalid-input": en størrelse uden for 1–999): ingen
    // advarsler her — trykker læreren Dan grupper, siger motoren hvad der skal
    // rettes.
    if (!answer || answer.status === 'error' || answer.status === 'unsupported' || !Array.isArray(answer.messages)) return null;
    // En besked, der ikke kan læses, ville kaste i hints.js (inde i en
    // computed) og give det røde fejlbanner ved hver ændring af opskriften.
    // Så hellere ingen advarsler før kørslen — Dan grupper siger stadig fra.
    if (answer.messages.some(unreadableMessage)) {
        console.error('[Gruppemotor] check() svarede med en besked, der ikke kunne læses.');
        return null;
    }
    return {
        input: got.input,
        status: answer.status,
        messages: answer.messages.filter(m => !APP_OWNED_CODES.has(m.code)),
    };
});

// ─── Hvad blev opfyldt? (mærker i opskriften) ──────────────────────────────

/**
 * Sidste kørsels mærker pr. visning (ruleMarks.js): pr. regel og for
 * aftalerne, plus aftrykket af det input og de grupper, de hører til.
 */
export const lastRunStatus = reactive({ standard: null, matrix: null });

/** Input'et uden budget og frø — det, der afgør, hvad motoren svarede. */
function inputFingerprint(input) {
    if (!input) return '';
    const { budget, seed, lockedGroups, ...rest } = input;
    // Hvilken af klassens regler hver regel i input kom fra: en regel uden
    // kolonne (eller Adskil uden værdi) sendes ikke, så sletter læreren den
    // bagefter, er input det samme — men mærkerne ville sidde én linje forkert.
    rest.sources = ruleSources.get(input) || null;
    // Et låst grupper-emne, motoren selv har givet (lockedTopics), ændrer
    // input bagefter uden at ændre grupperne eller reglerne: emnet tæller ikke.
    rest.lockedGroups = (lockedGroups || []).map(({ topic, ...g }) => g);  // eslint-disable-line no-unused-vars
    return JSON.stringify(rest);
}

/**
 * Mærkerne for sidste kørsel — KUN mens de passer til det, der står: samme
 * input, som appen ville sende nu (regler, rækkefølge, aftaler, størrelse,
 * cellerne i reglernes kolonner, fravær, låste grupper), og samme grupper
 * (en elev flyttet i hånden gør resultatet til et andet). Ellers null: et
 * flueben ved en regel, kørslen ikke havde, er værre end intet. Strengere
 * end "Sidste dannelse" (setupSignature), som ikke ser celler og flytninger.
 */
export function runStatusFor(isMatrix) {
    const status = lastRunStatus[isMatrix ? 'matrix' : 'standard'];
    if (!status) return null;
    const groups = (isMatrix ? state.storedMatrixGroups : state.storedStandardGroups) || [];
    if (homeGroupFingerprint(groups) !== status.groups) return null;
    if (inputFingerprint(currentEngineInput(isMatrix, status.skipTogether)) !== status.input) return null;
    return status;
}

/**
 * Motorens afspilning (kontraktens 3.6) → afspillerens optagelse (replay.js).
 * Kun det vindende forsøg. Et bytte er et par; en Skal sammen-blok er ét
 * billede med flere par; en flytning uden makker er en flytte-hændelse
 * (b = null, målgruppen som niende felt). "Ryst" (effect "worse") er det,
 * afspilleren kalder "gør det værre med vilje".
 */
export function playbackToRecording(playback, input) {
    if (!playback || !Array.isArray(playback.attempts) || !playback.attempts.length) return null;
    const best = playback.attempts[playback.best || 0] || playback.attempts[0];
    if (!best || !Array.isArray(best.deal) || !Array.isArray(best.groups)) return null;
    const ruleText = (i) => {
        const r = Number.isInteger(i) ? input.rules[i] : null;
        return r ? `${r.type}:${r.column}` : null;
    };
    const kindOf = (effect) => (effect === 'worse' ? replay.KIND_UPHILL : replay.KIND_IMPROVE);
    const seed = best.groups.map(() => []);
    for (const [id, g] of best.deal) if (seed[g]) seed[g].push(id);
    const events = [];
    for (const step of best.moves || []) {
        const kind = kindOf(step.effect);
        const rule = ruleText(step.rule);
        if (Array.isArray(step.swap)) {
            events.push([step.swap[0], step.swap[1], kind, null, null, null, rule]);
        } else if (Array.isArray(step.swaps) && step.swaps.length) {
            const [first, ...rest] = step.swaps;
            events.push([first[0], first[1], kind, null, null, null, rule, rest]);
        } else if (step.move !== undefined && Number.isInteger(step.to)) {
            events.push([step.move, null, kind, null, null, null, rule, [], step.to]);
        }
    }
    return {
        best_run_index: 0,
        runs: [{
            won: true,
            seed,
            deal: best.deal.map(([id, g]) => [id, g]),
            events,
            final: best.groups.map(g => g.slice()),
            truncated: false,
            // Slutningen er lagt sammen til ét spring (for mange trin).
            merged: !!best.cut,
        }],
    };
}

// ─── Motorens tråd ──────────────────────────────────────────────────────────

/**
 * Kørslen lige nu, til skærmen: overlayets fremgang og Stop-knappen.
 * `progress` er kontraktens fremgang uden `best` (den kan være stor).
 */
export const nextRun = ref({ active: false, progress: null, stopping: false });

/**
 * En umulig Skal sammen fra motoren: alle blokkenes elever og teksten.
 * hints.js viser den i stedet for sin egen Skal sammen-advarsel, og knappen
 * "Dan grupper uden aftalen" fjerner ALLE blokkene på én gang.
 */
export const engineTogetherStop = ref(null);

let current = null;   // { worker, finish, stop } for kørslen i gang

function defaultWorker() {
    return new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
}

/**
 * Kør motoren i sin egen tråd. Svarer ALTID (aldrig en hængende
 * promise):
 *   { kind: 'answer', answer }        motoren svarede (også "stopped" efter Stop;
 *                                     så står der også afterStop: true)
 *   { kind: 'failed', reason }        kastede, gik i stå, eller kunne ikke starte
 *   { kind: 'cancelled' }             afbrudt uden svar (Stop uden svar i tide)
 */
export function runNextEngine(input, { onProgress, makeWorker = defaultWorker, silenceMs = SILENCE_LIMIT_MS, stopWaitMs = STOP_WAIT_MS } = {}) {
    abortNextEngine();
    return new Promise((resolve) => {
        let worker;
        let timer = null;
        let done = false;
        let stopping = false;

        const finish = (result) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { worker && worker.terminate(); } catch { /* allerede væk */ }
            if (current && current.worker === worker) current = null;
            resolve(result);
        };
        // Vagten: hvert livstegn skubber tidsgrænsen. En stor klasse må tage
        // tid, så længe motoren viser, at den arbejder (kontraktens afsnit 4).
        const keepAlive = () => {
            if (stopping) return;
            clearTimeout(timer);
            timer = setTimeout(() => finish({ kind: 'failed', reason: 'den svarede ikke' }), silenceMs);
        };
        // Stop: motoren skal svare med den foreløbig bedste. Kommer der intet
        // i tide, afbrydes tråden, og grupperne på skærmen bliver stående.
        const stop = () => {
            if (done || stopping) return;
            stopping = true;
            clearTimeout(timer);
            try { worker.postMessage({ type: 'cancel' }); } catch { /* væk i forvejen */ }
            timer = setTimeout(() => finish({ kind: 'cancelled' }), stopWaitMs);
        };

        try {
            worker = makeWorker();
        } catch (e) {
            finish({ kind: 'failed', reason: 'den kunne ikke startes' });
            return;
        }
        current = { worker, finish, stop };

        worker.onmessage = (e) => {
            const m = e.data || {};
            if (m.type === 'progress') {
                keepAlive();
                try { onProgress && onProgress(m.progress); } catch { /* skærmen må ikke vælte motoren */ }
            } else if (m.type === 'answer') {
                finish(stopping ? { kind: 'answer', answer: m.answer, afterStop: true } : { kind: 'answer', answer: m.answer });
            } else if (m.type === 'crash') {
                console.error('[Gruppemotor] Fejl:', m.message);
                finish(stopping ? { kind: 'cancelled' } : { kind: 'failed', reason: 'den stødte på en fejl' });
            }
        };
        worker.onerror = (e) => {
            console.error('[Gruppemotor] Tråden fejlede:', e && e.message ? e.message : e);
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            finish(stopping ? { kind: 'cancelled' } : { kind: 'failed', reason: 'den stødte på en fejl' });
        };

        keepAlive();
        worker.postMessage({ type: 'run', input });
    });
}

/** Kører motoren lige nu? */
export function isNextEngineRunning() {
    return !!current;
}

/**
 * Læreren trykkede Stop: bed motoren om den foreløbig bedste deling. Svaret
 * lander gennem tryNextEngine() som en almindelig dannelse.
 */
export function stopNextEngine() {
    if (!current) return false;
    current.stop();
    nextRun.value = { ...nextRun.value, stopping: true };
    return true;
}

/** Afbryd uden at vente (en ny kørsel, eller appen skal videre). */
export function abortNextEngine() {
    if (!current) return false;
    const { worker, finish } = current;
    current = null;
    try { worker.postMessage({ type: 'cancel' }); } catch { /* væk i forvejen */ }
    finish({ kind: 'cancelled' });
    return true;
}

// ─── Indgangen fra generation.js ────────────────────────────────────────────

/** Beskeden når læreren har stoppet, og grupperne på skærmen bliver stående. */
export const STOPPED_TEXT = 'Gruppedannelsen blev stoppet. Dine nuværende grupper er urørte.';
/** Matrix uden stamgrupper: der er intet at fordele på tværs af. */
export const NEED_HOME_GROUPS = 'Du skal danne stamgrupper først. Matrixgrupper dannes på tværs af stamgrupperne.';

let runCounter = 0;

/**
 * Hvorfor er der intet at sende til motoren? (buildEngineInput gav null.)
 * Samme beskeder, som Grupper har givet hele tiden — de kom før fra den
 * gamle motors vej.
 */
function nothingToSendText(isMatrix, overrideSettings, viewGroups) {
    if (isMatrix && !(state.storedStandardGroups || []).length) {
        return NEED_HOME_GROUPS;
    }
    const locked = viewGroups.filter(g => g && g.locked);
    const lockedIds = new Set(locked.flatMap(g => (g.members || []).map(memberIdStr)));
    const free = (state.currentClass.data || []).filter(r => !r._excluded && !lockedIds.has(String(r[ROW_ID])));
    if (!free.length) {
        return locked.length
            ? 'Alle elever er i låste grupper. Der er ingen nye grupper at danne.'
            : 'Ingen elever er til stede — alle er markeret fraværende eller fjernet. Tilføj eller gendan elever for at danne grupper.';
    }
    const settings = (isMatrix ? state.currentClass.matrixSettings : state.currentClass.settings) || {};
    const asked = parseInt((overrideSettings ? overrideSettings.target : settings.groupTarget) || 0, 10) || 0;
    return `Du har låst ${groupCountText(locked.length)}, men beder om ${groupCountText(asked)} i alt. `
        + 'Hæv antallet, eller lås en gruppe op.';
}

/** Grupperne blev ikke dannet: en rolig besked, og alt står, som det stod. */
function stopWithoutGroups(text, { error = false } = {}) {
    state.isGenerating = false;
    state.activeJobId = null;
    (error ? window.notifyError : window.notifyInfo)?.(text);
    return 'done';
}

/**
 * Dan grupperne med motoren (motor/engine). Svarer altid 'done': grupper
 * lagt, umulig, stoppet, kasseret — eller ikke dannet med en besked, hvor
 * grupperne på skærmen står urørte, og intet skridt lægges i historikken.
 */
export async function tryNextEngine(isMatrix, overrideSettings = null, options = {}) {
    if (!state.currentClass) return 'done';

    // Identiteten sikres, før
    // låse, aftaler og matrix-kilder læses.
    migrateRefsToRowIds(
        state.currentClass,
        state.currentClass.id_column || state.displayColumn,
        {
            separations: state.currentClass.separations,
            togetherGroups: state.currentClass.togetherGroups,
            groupSets: [state.storedStandardGroups, state.storedMatrixGroups],
        }
    );

    const viewGroups = (isMatrix ? state.storedMatrixGroups : state.storedStandardGroups) || [];
    const input = engineInputNow(isMatrix, { overrideSettings, skipTogether: options.skipTogether || [] });
    // Intet at sende: sig hvorfor.
    if (!input) return stopWithoutGroups(nothingToSendText(isMatrix, overrideSettings, viewGroups));
    // Til e2e og udviklerkonsollen: præcis det, motoren fik (fx reglernes rækkefølge).
    if (typeof window !== 'undefined' && window.appDebug) window.appDebug.nextInput = input;

    const myId = `next-${++runCounter}`;
    state.isGenerating = true;
    state.activeJobId = myId;
    // En afspilning må ikke køre oven på en ny kørsel,
    // og bemærkningerne samles i en kladde, til resultatet lander.
    replay.stop();
    beginRun(isMatrix ? 'matrix' : 'standard');
    if (!isMatrix) engineTogetherStop.value = null;
    nextRun.value = { active: true, progress: null, stopping: false };

    const originFilename = state.currentClass.filename;
    const lockedGroups = viewGroups.filter(g => g && g.locked);

    let result;
    try {
        result = await runNextEngine(input, {
            onProgress: (p) => {
                if (state.activeJobId !== myId || !p) return;
                const { best, ...rest } = p; // eslint-disable-line no-unused-vars
                nextRun.value = { ...nextRun.value, progress: rest };
            },
        });
    } finally {
        nextRun.value = { active: false, progress: null, stopping: false };
    }

    const stoppedByTeacher = result.kind === 'cancelled' || result.afterStop === true
        || (result.kind === 'answer' && result.answer && result.answer.status === 'stopped');

    // En nyere kørsel er sat i gang: intet må lande, og intet må falde tilbage.
    if (state.activeJobId !== myId) return 'done';

    // Klasseskift undervejs: resultatet må kun lande i den klasse, det kom fra.
    if ((state.currentClass && state.currentClass.filename) !== originFilename) {
        state.isGenerating = false;
        state.activeJobId = null;
        if (result.kind === 'answer') {
            window.notifyInfo?.('Du skiftede klasse, mens grupperne blev dannet. Resultatet er kasseret, '
                + 'så det ikke lander i en anden klasse.');
        }
        return 'done';
    }

    // Stop uden en hel deling: grupperne på skærmen bliver stående. Også et
    // tomt svar efter Stop (derfor ?.) — ellers kastede linjen.
    // Et "impossible"-svar efter Stop ender også her: læreren bad om at
    // stoppe, og advarslen kommer igen ved næste Dan grupper.
    if (result.kind === 'cancelled' || (stoppedByTeacher && result.answer?.groups == null)) {
        return stopWithoutGroups(STOPPED_TEXT);
    }

    // Hvad gik galt? `setup`: motoren siger, at opsætningen ikke kan bruges
    // ("unsupported", fx en størrelse uden for 1–999) — dens tekst siger, hvad
    // der skal rettes. Ellers en fejl (motoren fejlede, svarede ikke, eller
    // svaret brød kontrakten).
    let reason = null;
    let setup = false;
    const answer = result.kind === 'answer' ? (result.answer || {}) : null;
    if (result.kind === 'failed') {
        // Er der lagt en ny udgave op, mens fanen stod åben, er den gamle
        // motor-fil væk fra serveren (rsync --delete), og hvert tryk ville
        // fejle igen. Så er beskeden "genindlæs", ikke "prøv igen".
        const newBuild = checkForNewBuild();
        const isNewBuild = newBuild ? await newBuild : false;
        // Hentningen ovenfor kan tage tid, og imens står overlayet med en
        // Stop-knap (motoren er allerede færdig, så Stop nulstiller det hele
        // i cancelGeneration). Har læreren trykket Stop — og måske startet en
        // ny kørsel — må denne kørsel ikke røre tilstanden mere: før slukkede
        // den her den NYE kørsels overlay, og den nye kørsels grupper blev
        // kasseret i stilhed. Kun beskeden om en ny udgave er stadig sand.
        if (state.activeJobId !== myId) {
            if (isNewBuild) window.notifyError?.(NEW_BUILD_MESSAGE);
            return 'done';
        }
        if (isNewBuild) return stopWithoutGroups(NEW_BUILD_MESSAGE, { error: true });
        reason = result.reason;
    } else {
        const problem = contractProblem(input, answer);
        if (problem) {
            reason = problem;
        } else if (answer.status === 'unsupported' || answer.status === 'error') {
            if (answer.status === 'error') console.error('[Gruppemotor] Svarede med en fejl:', answer.reason, answer.detail || '');
            const text = answer.reason && answer.reason.text;
            reason = (typeof text === 'string' && text.trim()) || 'opsætningen kunne ikke bruges';
            setup = answer.status === 'unsupported';
        }
    }

    // Læreren trykkede Stop, og motorens svar kan ikke lægges på skærmen (en
    // fejl, eller det bryder kontrakten): så er det et Stop uden en deling.
    if (reason && stoppedByTeacher) {
        return stopWithoutGroups(STOPPED_TEXT);
    }

    // Ingen grupper at lægge: grupperne på skærmen står, som de stod, og
    // historikken får intet skridt (pushRun kaldes kun i landAnswer).
    if (reason) {
        const sentence = reason.charAt(0).toUpperCase() + reason.slice(1).replace(/\.$/, '');
        if (setup) return stopWithoutGroups(`Grupperne blev ikke dannet. ${sentence}. Dine nuværende grupper er urørte.`);
        return stopWithoutGroups(`Grupperne kunne ikke dannes: ${sentence}. Dine nuværende grupper er urørte. `
            + 'Prøv igen — og genindlæs siden, hvis det sker igen.', { error: true });
    }

    state.isGenerating = false;
    state.activeJobId = null;

    if (answer.status === 'impossible') {
        showImpossible(answer, input, isMatrix);
        return 'done';
    }

    landAnswer(answer, input, { isMatrix, lockedGroups, skipTogether: options.skipTogether || [] });
    // "Dan grupper uden aftalen": siges først nu,
    // hvor grupperne faktisk er dannet.
    const skipped = options.skipTogether || [];
    if (skipped.length) {
        const fill = namers([]);
        window.notifyInfo?.(`Aftalen for ${skipped.map(fill.studentName).join(', ')} er tilsidesat i denne kørsel. `
            + 'Den gælder stadig, næste gang du trykker Dan grupper.');
        if (!isMatrix) engineTogetherStop.value = null;
    }
    if (answer.status === 'stopped') {
        window.notifyInfo?.('Gruppedannelsen blev stoppet. Grupperne er de bedste, motoren nåede at finde.');
    }
    return 'done';
}

/** Navne til beskederne: elever efter visningskolonnen, grupper efter nummer. */
function namers(groupNames) {
    const data = state.currentClass?.data || [];
    return {
        studentName: (id) => memberDisplayName(id, data, state.displayColumn),
        groupName: (i) => (groupNames[i] ? groupDisplayName(groupNames[i]) : null),
    };
}

/**
 * "Umulig": grupperne bliver stående, og læreren får at vide hvorfor. Skal
 * sammen-beskederne samles i én advarsel over grupperne med knappen "Dan
 * grupper uden aftalen", der fjerner ALLE de umulige blokke på én gang.
 */
function showImpossible(answer, input, isMatrix) {
    const fill = namers([]);
    const messages = answer.messages || [];
    const together = messages.filter(isTogetherStop);
    const others = messages.filter(m => !isTogetherStop(m));
    if (together.length && !isMatrix) {
        const ids = [...new Set(together.flatMap(m => m.students || []))];
        engineTogetherStop.value = {
            // Klassen, advarslen hører til: et klasseskift gør den forældet.
            filename: state.currentClass?.filename || null,
            ids,
            text: together.map(m => fillMessageText(m, fill)).join(' '),
        };
        window.notifyInfo?.('Grupperne blev ikke dannet — se den røde advarsel over grupperne.');
    }
    if (others.length || !together.length) {
        const text = (others.length ? others : messages).map(m => fillMessageText(m, fill)).join('\n')
            || 'Grupperne kunne ikke dannes med denne opsætning.';
        window.notifyError?.(text);
    }
}

/**
 * Læg et svar med grupper på skærmen: pushRun før overskrivningen, numre
 * uden om de låste, bemærkninger, emner, optagelse efter emnerne, gem og
 * "rent" aftryk.
 *
 * Alt, der kan kaste på et skævt svar (beskederne, afspilningen), regnes ud
 * FØR pushRun(). Kaster det, fanger executeGeneration det, og grupperne står
 * urørte — så må intet fra dette svar være lagt i historikken eller under
 * "Sidste dannelse".
 */
function landAnswer(answer, input, { isMatrix, lockedGroups, skipTogether = [] }) {
    const numbers = freeNumbers(answer.groups.length, input.lockedGroups.map(g => g.number));
    const newGroups = answer.groups.map((g, i) => ({
        name: `Group ${numbers[i]}`,
        members: g.members.slice(),
    }));
    const groupNames = newGroups.map(g => g.name);

    // Bemærkningerne under "Sidste dannelse" — de røde først (motoren sorterer).
    const fill = namers(groupNames);
    let hintIds = [];
    try { hintIds = recipeHintIds(); } catch { /* uden hints: vis alt */ }
    // Samme sag kun én gang (resultatet frem for varslet), appens egne
    // knap-beskeder ikke to gange, og rød kun for det, der skal rettes.
    const notes = [];
    for (const m of dedupeAnswerMessages(answer.messages)) {
        if (APP_OWNED_CODES.has(m.code)) continue;
        if (coveredByRecipeHint(m, input, hintIds)) continue;
        notes.push([fillMessageText(m, fill), severityOf(m, answer.status), noteKeys(m)]);
    }

    // En afspilning, der ikke kan læses, må ikke koste læreren grupperne:
    // så lander de bare uden afspilning (kontrakten tillader playback: null).
    let recording = null;
    try {
        recording = playbackToRecording(answer.playback, input);
    } catch (e) {
        console.error('[Gruppemotor] Afspilningen kunne ikke læses:', e);
    }

    // Mærkerne i opskriften (hvad blev opfyldt) — også regnet ud FØR pushRun.
    const marks = ruleMarks(input, answer, ruleSources.get(input), severityOf);

    pushRun();
    for (const [text, type, keys] of notes) announce(text, type, keys);
    commitRun(setupSignature(state.currentClass, isMatrix, state.groupMode));

    const finalGroups = [...lockedGroups, ...newGroups];

    const runRecording = recording ? markRaw({
        data: recording,
        // "Forsøg 13 af 20 – det bedste …" ved afspilningen (tom uden tal).
        attemptsText: attemptsText(answer.stats),
        groupNames,
        lockedGroups: lockedGroups.map(g => g.name),
    }) : null;
    const viewKey = isMatrix ? 'matrix' : 'standard';

    finalGroups.sort((a, b) => (groupNumberOf(a.name) ?? 999999) - (groupNumberOf(b.name) ?? 999999));

    // Emnerne hører kun til stamgrupperne.
    //
    // Emnekortet i lageret er det, ALT andet læser emnerne fra: kortet på
    // skærmen (GroupCard), matrix-rundens kilder (topicFor), Vis for klassen,
    // eksporten og en genindlæsning (hydrateGroupTopics). Kan det nye kort
    // ikke skrives, står det FORRIGE kort tilbage med de samme gruppenavne
    // ("Group 1" …). Så må grupperne ikke bare have topic: null — skærmen og
    // matrix ville stadig vise og bruge de gamle emner på de nye grupper.
    // Reglen er derfor: grupperne får det emne, der faktisk står i lageret,
    // og beskeden siger, hvad det er (gennemsyn 84, landTopics.test.js).
    const topicsFromStorage = () => finalGroups.forEach(g => { g.topic = storage.getTopic(g.name, 'S_') || null; });
    if (!isMatrix) {
        const hasTopics = (input.topics || []).length > 0;
        if (hasTopics) {
            newGroups.forEach((g, i) => { g.topic = answer.groups[i].topic || null; });
            const lockedTopics = answer.lockedTopics || {};
            for (const g of lockedGroups) {
                if (Object.prototype.hasOwnProperty.call(lockedTopics, String(g.name))) g.topic = lockedTopics[String(g.name)];
            }
            if (storage.replaceTopicsForPrefix('S_', finalGroups) === false) {
                // Prøv i stedet at fjerne de gamle stamgruppe-emner: det gør
                // kortet MINDRE, så det plejer at gå, selv når lageret er fuldt.
                if (storage.replaceTopicsForPrefix('S_', []) !== false) {
                    finalGroups.forEach(g => { g.topic = null; });
                    window.notifyError?.(
                        'Lagerplads fuld — emnerne kunne ikke gemmes, så grupperne '
                        + 'står uden emne. Slet en gammel session for at frigøre plads.'
                    );
                } else {
                    topicsFromStorage();
                    window.notifyError?.(
                        'Lagerplads fuld — de nye emner kunne ikke gemmes, så grupperne '
                        + 'står med emnerne fra forrige dannelse. Slet en gammel session '
                        + 'for at frigøre plads, og dan grupperne igen.'
                    );
                }
            }
        } else if (storage.clearTopics('S_') === false) {
            topicsFromStorage();
            window.notifyError?.(
                'Lagerplads fuld — de gamle gruppeemner kunne ikke fjernes, så de '
                + 'står stadig på grupperne. Slet en gammel session for at frigøre '
                + 'plads, og dan grupperne igen.'
            );
        } else {
            finalGroups.forEach(g => { g.topic = null; });
        }
    }

    state.lastRecording[viewKey] = runRecording;
    state.lastRecordingFingerprint[viewKey] = runRecording ? homeGroupFingerprint(finalGroups) : null;
    if (isMatrix) state.storedMatrixGroups = finalGroups;
    else state.storedStandardGroups = finalGroups;
    setRunStatus(viewKey, marks, input, finalGroups, skipTogether);
    state.lastGeneratedGroups = finalGroups;
    // Nye stamgrupper gør matrixgrupperne forældede; nye matrixgrupper husker,
    // hvilke stamgrupper de blev dannet ud fra.
    state.matrixGroupsStale = !isMatrix;
    state.matrixSourceFingerprint = isMatrix ? homeGroupFingerprint(state.storedStandardGroups) : null;
    storage.saveGroupsToStorage();
    markClean();

    logAnswer(answer, input);
}

/** Gem mærkerne for kørslen, der lige er landet (se runStatusFor). */
function setRunStatus(viewKey, marks, input, groups, skipTogether = []) {
    lastRunStatus[viewKey] = markRaw({
        input: inputFingerprint(input),
        groups: homeGroupFingerprint(groups),
        // "Dan grupper uden aftalen": samme aftaler sprunget over, når det
        // nuværende input sammenlignes med kørslens.
        skipTogether: [...skipTogether],
        ...marks,
    });
}

/** Opskriftens advarsler lige nu — sat af hints.js (undgår en import-kreds). */
let recipeHintIds = () => [];
export function provideRecipeHintIds(fn) { recipeHintIds = fn; }

/** Oversigten i udviklerkonsollen (kun under udvikling). */
function logAnswer(answer, input) {
    // Til fejlsøgning og e2e: hvor mange forsøg og kerner sidste svar brugte.
    if (typeof window !== 'undefined' && window.appDebug) window.appDebug.nextStats = { status: answer.status, ...(answer.stats || {}) };
    if (!import.meta.env.DEV) return;
    const label = (r) => `${r.type} på ${r.column}`;
    console.log(`[Gruppemotor] ${answer.status}: ${answer.groups.length} grupper, `
        + `${answer.stats?.attempts ?? '?'} forsøg, ${answer.stats?.seconds ?? '?'} sek., ${answer.stats?.cores ?? 1} kerne(r)`);
    for (const line of answer.rules || []) {
        const rule = input.rules[line.rule];
        const met = line.met === null ? 'ikke målt' : line.met ? 'opfyldt' : 'ikke opfyldt';
        console.log(`  ${rule ? label(rule) : `regel ${line.rule}`}: ${met}`);
    }
}

