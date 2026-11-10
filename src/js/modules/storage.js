// storage.js — lagring i localStorage.
// Skriver via safeStorageSet i py_bridge.js (tåler fuld lagerplads).
// Rydder i historikken, så den ikke vokser uden grænse.

import { state } from './state.js';
// safeStorageSet bor i py_bridge.js; her hedder den bare safeSave.
import { safeStorageSet as safeSave } from './py_bridge.js';
import { debounce, newUuid, mergeClassTopics } from './utils.js';
import {
    CLASSES_KEY, GROUPS_PREFIX, TOPICS_PREFIX, HISTORY_PREFIX, SESSION_PREFIX,
    LAST_CLASS_KEY, LAST_CLASS_INDEX_KEY, UNREADABLE_CLASSES_KEY,
} from './storageKeys.js';
import { legacyProtection, removeLegacyClassData } from './migrateStorage.js';
// runHistory.js importerer også storage.js. Ringen er ufarlig: ingen af de to
// bruger den anden, før en funktion kaldes (kun adoptForeignGroups gør).
import { pushRun } from './runHistory.js';
import * as replay from './replay.js';

/** Højst så mange gemte sessioner beholdes pr. klasse */
const MAX_HISTORY_SESSIONS = 50;

/** Ældste alder (i dage) før en session luges ud automatisk */
const MAX_HISTORY_AGE_DAYS = 90;

// --- TOPICS ---

// Cachen bruges kun til læsning. Skrivninger henter altid det senest gemte
// kort, fordi en anden fanes storage-hændelse kan vente i hændelseskøen.
let _topicMapCache = null;
let _topicMapCacheKey = null;

function _topicStorageKey() {
    if (!state.currentClass || !state.currentClass.filename) return null;
    return `${TOPICS_PREFIX}${state.currentClass.filename}`;
}

function _invalidateTopicCache() {
    _topicMapCache = null;
    _topicMapCacheKey = null;
}

// Har læreren appen åben i to faner, skriver de i det SAMME localStorage.
// Emnekortet gemmes under ét — `saveTopic()` læser hele kortet, sætter én
// nøgle og skriver det HELE tilbage. Uden den her lytter ville fane B's cache
// aldrig opdage, at fane A har skrevet et emne, og B's næste emne-rettelse
// ville sende det forældede kort tilbage: A's emne væk uden en lyd.
// Skrivninger læser desuden direkte fra lageret: hændelsen kan stadig vente
// i køen, når læreren gemmer. Lytteren holder de efterfølgende læsninger ajour.
if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', (e) => {
        // e.key er null når en anden fane har kaldt localStorage.clear().
        if (!e.key || e.key.startsWith(TOPICS_PREFIX)) _invalidateTopicCache();
        _noticeForeignGroups(e);
    });
}

// Pr. klasse: den fordeling (hvem står hvor), vi sidst har sagt til om, at
// en anden fane har gemt. Filnavn → _memberLists(...) af den anden fanes grupper.
const _foreignGroupsWarned = new Map();

/**
 * Har den ANDEN fane dannet grupper i den klasse, vi står i?
 *
 * `grupdk_groups_<fil>` skrives under ét: hele gruppesættet ovenpå, uden et
 * tidsstempel at sammenligne med. Har læreren samme klasse åben to steder,
 * genererer i fane A og bagefter flytter én elev i fane B, lægger B's gem sin
 * gamle fordeling ovenpå — kørslen fra A er væk, sammen med de emner og
 * flytninger der hørte til den. Uden en lyd.
 *
 * Hændelsen er den billige vej til at opdage det: den fyres KUN i de andre
 * faner, aldrig i den der skrev. Derfor kan den ikke give falsk alarm på
 * fanens egne skrivninger — og der skal hverken læses eller parses noget for
 * hver gang grupperne gemmes (det sker ved hvert træk, hvert emne, hver lås).
 *
 * Vi retter ikke skærmen af os selv: det ville rive lærerens arbejde væk midt
 * i en time. Hun får beskeden og bestemmer selv — med en knap, "Hent de nye
 * grupper", der henter den anden fanes grupper ind her.
 *
 * Hvornår kommer den igen? Når den anden fane gemmer en ANDEN fordeling end
 * den, vi sidst sagde til om. Den anden fane gemmer ved hvert emne og hver
 * lås, og de gemninger skal ikke give en ny besked hver gang. Men før kom den
 * kun én gang pr. klasse, til læreren trykkede "Hent": lukkede hun den med
 * krydset, var den brugt op, og en NY kørsel i den anden fane blev skrevet
 * væk af næste træk her uden en lyd. (Står beskeden stadig på skærmen,
 * lægges der ikke en til; notificationState springer dubletter over.)
 */
function _noticeForeignGroups(e) {
    if (!e.key || !e.key.startsWith(GROUPS_PREFIX)) return;
    // newValue er null, når nøglen blev SLETTET — det er en klasse-sletning,
    // og den har sin egen besked (AppTopbar lukker klassen). To beskeder om
    // det samme er værre end én.
    if (e.newValue === null) return;
    if (!state.currentClass || !state.currentClass.filename) return;
    if (e.key !== `${GROUPS_PREFIX}${state.currentClass.filename}`) return;
    // Samme fordeling som den, vi sidst sagde til om: intet nyt at sige.
    let incoming;
    try { incoming = _incomingMemberLists(e.newValue); } catch { incoming = null; }
    if (incoming !== null && _foreignGroupsWarned.get(state.currentClass.filename) === incoming) return;
    // Viser fanen allerede de samme grupper, er der intet at sige. Den anden
    // fane gemmer flere gange pr. kørsel, og efter "Hent de nye grupper" kom
    // beskeden ellers straks igen om grupper, læreren lige havde hentet.
    // Det koster ét JSON.parse, men kun i de ANDRE faner og kun for netop
    // denne klasse — ikke ved fanens egne gemninger.
    // Glem samtidig det, vi sidst sagde til om: ændrer den anden fane grupperne
    // tilbage til netop den fordeling, er det nyt igen.
    if (_sameGroupsAsShown(e.newValue)) { _foreignGroupsWarned.delete(state.currentClass.filename); return; }
    _foreignGroupsWarned.set(state.currentClass.filename, incoming);

    const filename = state.currentClass.filename;
    const displayName = state.currentClass.name || filename;
    const msg = `Grupperne i "${displayName}" er lige blevet ændret i en anden fane.\n\n`
        + 'Det du ser her, er ikke det nyeste — og flytter du en elev nu, '
        + 'skriver du den anden fanes grupper væk.';
    const action = { label: 'Hent de nye grupper', run: () => adoptForeignGroups(filename) };
    if (typeof window !== 'undefined' && window.notifyError) window.notifyError(msg, action);
    else console.warn(msg);
}

// Hvem står i hvilken gruppe — det eneste, der afgør, om grupperne er de samme.
function _memberLists(groups) {
    return JSON.stringify((groups || []).map(g => (g && g.members) || []));
}

// Stamgrupper og matrix under ét, så de kan sammenlignes som én tekst.
// Kaster ved ulæselig JSON — kalderen afgør, hvad det betyder.
function _incomingMemberLists(newValue) {
    const saved = JSON.parse(newValue);
    return _memberLists(saved?.standard) + '|' + _memberLists(saved?.matrix);
}

function _sameGroupsAsShown(newValue) {
    try {
        const saved = JSON.parse(newValue);
        return _memberLists(saved?.standard) === _memberLists(state.storedStandardGroups)
            && _memberLists(saved?.matrix) === _memberLists(state.storedMatrixGroups);
    } catch {
        return false;
    }
}

/**
 * "Hent de nye grupper": læs grupperne, den anden fane har gemt, ind her.
 *
 * Lageret ER allerede det nyeste (den anden fane skrev det), så vi henter dem
 * bare, som når klassen åbnes (selectClass i AppTopbar.vue). Er læreren skiftet
 * til en anden klasse, før hun trykkede, sker der intet — knappen hørte til den
 * klasse, beskeden handlede om.
 *
 * Knappen afløste rådet "Genindlæs siden". Derfor skal alt, hvad der beskriver
 * grupperne på skærmen og kun lever i hukommelsen, se ud bagefter, som det ville
 * efter en genindlæsning (samme prøve som i classMemory.js). Og det er et skift
 * af fordelingen som en ny kørsel, så det går gennem pushRun() som de andre:
 *   - pushRun() lægger DENNE fanes grupper i kørselsmenuen, så et klik for
 *     meget kan fortrydes, og slipper en markeret elev ("Flyt hertil" stod
 *     ellers på kortene og flyttede intet).
 *   - Aftrykket af stamgrupperne, matrixen blev dannet ud fra, er denne fanes.
 *     Den anden fanes matrix hører til DENS stamgrupper, så det gamle aftryk
 *     gav en falsk "Stamgrupperne er ændret, siden matrixen blev dannet" — med
 *     en knap, der dannede den rigtige matrix om. Ukendt = null = tavshed.
 *   - Optagelsen og en igangværende afspilning er denne fanes kørsel og ville
 *     blive vist oven på de nye grupper.
 *   - Aftrykket af sidste kørsel fik kørselsmenuen til at kalde de hentede
 *     grupper "rørt i hånden" og spørge "er du sikker?" for ingenting.
 * Kendt rest: emnekortet læses fra lageret, så kørslen, pushRun() lægger til
 * side, får den anden fanes emner med, hvis den har skrevet nogen.
 *
 * Bagefter kommer beskeden igen, hvis den anden fane ændrer dem endnu en gang
 * (det gør den også uden "Hent"; se _noticeForeignGroups).
 * @returns {boolean} true, hvis grupperne blev hentet
 */
export function adoptForeignGroups(filename) {
    if (!state.currentClass || state.currentClass.filename !== filename) return false;
    const notify = (kind, msg) => {
        if (typeof window !== 'undefined' && window[kind]) window[kind](msg);
    };
    _foreignGroupsWarned.delete(filename);
    // Har læreren flyttet en elev HER efter beskeden, står denne fanes grupper
    // i lageret igen (beskeden advarede om netop det). Så er der intet nyt at
    // hente, og "hentet" ville være usandt.
    let raw = null;
    try { raw = localStorage.getItem(`${GROUPS_PREFIX}${filename}`); } catch { /* låst lager */ }
    if (!raw || _sameGroupsAsShown(raw)) {
        notify('notifyInfo', 'Der er ingen nyere grupper at hente: grupperne her er gemt '
            + 'efter den anden fanes. Den anden fanes grupper står stadig i den anden fane.');
        return false;
    }
    const saved = loadGroupsFromStorage();
    if (!saved) return false;

    replay.stop();
    state.previewRunIndex = null;
    pushRun();

    // Den anden fane kan også have skrevet emner; cachen må ikke vise de gamle.
    _invalidateTopicCache();
    if (saved.standard) hydrateGroupTopics(saved.standard, 'S_');
    if (saved.matrix) hydrateGroupTopics(saved.matrix, 'M_');
    state.storedStandardGroups = saved.standard || null;
    state.storedMatrixGroups = saved.matrix || null;
    state.lastGeneratedGroups = saved.standard || null;
    state.matrixGroupsStale = !!(saved.matrixStale
        && Array.isArray(saved.matrix) && saved.matrix.length > 0);
    state.matrixSourceFingerprint = null;
    state._lastGeneratedFingerprint = null;
    state._lastRunInputs = null;
    state.lastRecording = { standard: null, matrix: null };
    state.lastRecordingFingerprint = { standard: null, matrix: null };
    populateDatalistFromStorage();
    notify('notifySuccess', 'De nye grupper er hentet.');
    return true;
}

let topicReadWarningKey = null;

function getTopicMap(forWrite = false) {
    const key = _topicStorageKey();
    if (!key) return forWrite ? null : {};
    if (!forWrite && _topicMapCache !== null && _topicMapCacheKey === key) return _topicMapCache;
    try {
        const raw = localStorage.getItem(key);
        const map = raw === null ? {} : JSON.parse(raw);
        if (!isRecord(map) || !Object.values(map).every(value => value === null || typeof value === 'string')) {
            throw new Error('Invalid topic map');
        }
        _topicMapCache = map;
        _topicMapCacheKey = key;
        topicReadWarningKey = null;
        // Skrivninger arbejder på en kopi: en afvist skrivning må hverken
        // ændre læsecachen eller snige sig med i næste vellykkede gem.
        return forWrite ? { ...map } : map;
    } catch (e) {
        _invalidateTopicCache();
        if (topicReadWarningKey !== key) {
            topicReadWarningKey = key;
            console.error('[Storage] Emnerne kunne ikke læses:', e);
            const message = 'De gemte gruppeemner kunne ikke læses. Dine emneændringer '
                + 'kan derfor ikke gemmes. De gamle data er bevaret. Prøv at genindlæse '
                + 'siden, eller gendan klassen fra en backup under "Import & backup".';
            if (typeof window !== 'undefined' && window.notifyError) window.notifyError(message);
        }
        // En manglende nøgle er et tomt kort; en ulæselig nøgle er IKKE.
        // Læsere kan fortsætte, men ændringer skal afvises uden overskrivning.
        return forWrite ? null : {};
    }
}

/**
 * Læs hele emne-kortet for klassen ({ 'S_Group 1': 'Liberalisme', ... }).
 * Bruges af kørselshistorikken, som gemmer og gendanner kortet under ét —
 * emnerne hører til den kørsel de blev dannet sammen med.
 */
export function readTopicMap() {
    return { ...getTopicMap() };
}

/**
 * Overskriv hele emne-kortet på én gang.
 *
 * VIGTIGT: cachen SKAL nulstilles. `getTopicMap()` husker kortet mellem kald,
 * så uden nulstillingen ville næste getTopic() servere de gamle emner videre,
 * og kortene ville vise ét emne mens badges og matrixfordeling læste et andet.
 *
 * @returns {boolean} false hvis skrivningen blev afvist (fuld lagerplads)
 */
export function replaceTopicMap(map) {
    const key = _topicStorageKey();
    if (!key) return false;
    const ok = safeSave(key, JSON.stringify(map || {}));
    _invalidateTopicCache();
    return ok !== false;
}

export function getTopic(id, typePrefix) {
    const map = getTopicMap();
    return map[`${typePrefix}${id}`] || null;
}

/**
 * Gem ét gruppeemne, eller slet det hvis værdien er tom.
 * Returnerer false ved læse- eller skrivefejl. Kalderen må først opdatere
 * gruppens kopi af emnet efter et vellykket gem.
 */
export function saveTopic(id, topic, typePrefix) {
    const key = _topicStorageKey();
    if (!key) return false;

    const mapKey = `${typePrefix}${id}`;
    const map = getTopicMap(true);
    if (map === null) return false;

    if (topic) {
        map[mapKey] = topic;
    } else {
        delete map[mapKey];
    }

    const ok = safeSave(key, JSON.stringify(map));
    _invalidateTopicCache();

    // Saml opdateringen af emneforslag, mens læreren taster.
    schedulePopulateDatalist();

    return ok !== false; // safeStorageSet svarer true|false; undefined tæller som lykket
}

function _populateDatalistNow() {
    const map = getTopicMap();
    let datalist = document.getElementById('topics-datalist');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'topics-datalist';
        document.body.appendChild(datalist);
    }

    const topics = new Set();
    Object.keys(map).forEach(key => {
        if (key.startsWith('S_') && map[key]) {
            topics.add(map[key]);
        }
    });

    datalist.innerHTML = '';
    topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        datalist.appendChild(opt);
    });
}

// 250 ms føltes rigtigt: hurtigt nok til, at forslagene er opdateret, før
// lærerens blik når ned til feltet, og langsomt nok til at samle hurtige
// rettelser i ét kald.
const schedulePopulateDatalist = debounce(_populateDatalistNow, 250);

export function populateDatalistFromStorage() {
    // Den offentlige indgang er synkron til de kald, der kører én gang ved
    // opstart (fx ClassView). Skrivevejene herinde bruger den samlede version.
    _populateDatalistNow();
}

/**
 * Samme opdatering, men samlet sammen.
 *
 * `<datalist>`'en er ÉT element i body, delt af alle gruppekort — og hvert
 * kort byggede den forfra i sin setup(). Ved 50 grupper var det 50 identiske
 * genopbygninger af den samme DOM-liste, midt i den gentegning læreren venter
 * på. De 250 ms er usynlige: feltet skal klikkes på, før listen kan bruges.
 */
export function refreshTopicDatalistSoon() {
    schedulePopulateDatalist();
}

// --- GROUPS ---

export function saveGroupsToStorage() {
    if (!state.currentClass || !state.currentClass.filename) return false;
    const data = {
        standard: state.storedStandardGroups,
        matrix: state.storedMatrixGroups,
        // "Matrixen skal dannes forfra" skal overleve en genindlæsning. Levede
        // flaget kun i hukommelsen, stod det på false næste morgen, og den
        // gamle matrix blev vist, udskrevet og gemt, som om den hørte til de
        // nye stamgrupper. Læses igen i selectClass() (AppTopbar.vue).
        matrixStale: !!state.matrixGroupsStale,
    };
    // Nu står DENNE fanes grupper i lageret. Gemmer den anden fane bagefter
    // den fordeling, vi sagde til om sidst, er den væk igen ved næste træk
    // her — så skal beskeden kunne komme igen.
    _foreignGroupsWarned.delete(state.currentClass.filename);
    return safeSave(`${GROUPS_PREFIX}${state.currentClass.filename}`, JSON.stringify(data)) !== false;
}

export function loadGroupsFromStorage() {
    if (!state.currentClass || !state.currentClass.filename) return null;
    try {
        const str = localStorage.getItem(`${GROUPS_PREFIX}${state.currentClass.filename}`);
        return str ? JSON.parse(str) : null;
    } catch (e) { console.error("Group Storage Error", e); return null; }
}

// --- MISC ---
export function saveLastClassFilename(filename) {
    safeSave(LAST_CLASS_KEY, filename);
}

export function getLastClassFilename() {
    return localStorage.getItem(LAST_CLASS_KEY) || null;
}

// Gammel reserve: lageret brugte før et løbenummer i stedet for filnavnet
export function saveLastClassIndex(index) {
    safeSave(LAST_CLASS_INDEX_KEY, String(index));
}

export function getLastClassIndex() {
    return parseInt(localStorage.getItem(LAST_CLASS_INDEX_KEY) || '0');
}

// --- HISTORY ---

/**
 * De to lofter over en klasses gemte sessioner, som ren funktion: højst
 * MAX_HISTORY_SESSIONS stykker, og ingen ældre end MAX_HISTORY_AGE_DAYS.
 *
 * Skilt ud fra saveHistory(), fordi gendannelse fra backup skal håndhæve
 * PRÆCIS de samme to lofter — se writeClassExtras(). Den vej skrev før
 * direkte i lageret, og en backup kender ingen grænser.
 *
 * @returns {{ kept: Array, dropped: Array }} `dropped` er dem der ryger ud;
 *   kaldstedet afgør, om deres payload skal slettes (saveHistory) eller
 *   aldrig skrives (writeClassExtras).
 */
export function pruneHistoryMeta(historyMetaArray) {
    const entries = (Array.isArray(historyMetaArray) ? historyMetaArray : [])
        .filter(e => e && typeof e === 'object' && !Array.isArray(e));

    // Luger ud: fjern sessioner ældre end MAX_HISTORY_AGE_DAYS
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_HISTORY_AGE_DAYS);

    let kept = entries.filter(entry => {
        if (!entry.date) return true;
        const t = new Date(entry.date).getTime();
        // En ulæselig dato er ikke det samme som "for gammel". Uden dette
        // tjek gav sammenligningen `false` på en Invalid Date, og sessionen
        // blev smidt ud selvom den var gemt i går.
        if (Number.isNaN(t)) return true;
        return t >= cutoff.getTime();
    });

    // Loft på antallet. Sorteringen sker KUN når loftet er ramt — ellers
    // ville listen blive ombyttet på hver eneste skrivning.
    if (kept.length > MAX_HISTORY_SESSIONS) {
        // En ulæselig eller manglende dato tæller som NYESTE (samme valg som
        // aldersfilteret: den smides ikke ud). Med NaN i sammenligningen er
        // rækkefølgen udefineret, og en frisk session kunne ryge.
        const when = (e) => {
            const t = new Date(e.date).getTime();
            return Number.isNaN(t) ? Infinity : t;
        };
        kept.sort((a, b) => {
            const wa = when(a), wb = when(b);
            return wa === wb ? 0 : (wb > wa ? 1 : -1);
        });
        kept = kept.slice(0, MAX_HISTORY_SESSIONS);
    }

    const keptSet = new Set(kept);
    return { kept, dropped: entries.filter(e => !keptSet.has(e)) };
}

/**
 * Gem listen over gemte sessioner for den aktuelle klasse.
 * Luger automatisk ud ud over de to lofter (se pruneHistoryMeta).
 *
 * @returns {boolean} false hvis skrivningen blev afvist (fuld lagerplads).
 *   Kaldstederne SKAL forgrene sig på svaret — en fejlet skrivning må ikke
 *   se ud som en succes. Før svarede funktionen ingenting, og et omdøb eller
 *   en sletning der aldrig nåede lageret, gav samme tavse kvittering som en
 *   der gjorde: listen så rigtig ud, indtil læreren genindlæste siden.
 */
export function saveHistory(historyMetaArray) {
    if (!state.currentClass || !state.currentClass.filename) return false;

    const { kept, dropped } = pruneHistoryMeta(historyMetaArray);

    // Slet payloaden for de sessioner udrensningen lige har luget ud —
    // både dem alderen tog og dem antallet tog. Kun antals-udrensningen
    // gjorde det før, så en session der faldt for 90-dages-grænsen
    // efterlod sin tunge payload i lageret: usynlig i listen, men den fyldte
    // stadig. Det er præcis den plads læreren mangler, når kvoten løber fuld.
    dropped.forEach(entry => {
        if (entry.id) deleteSessionPayload(entry.id);
    });

    return safeSave(`${HISTORY_PREFIX}${state.currentClass.filename}`, JSON.stringify(kept)) !== false;
}

export function getHistory() {
    if (!state.currentClass || !state.currentClass.filename) return [];
    try {
        const str = localStorage.getItem(`${HISTORY_PREFIX}${state.currentClass.filename}`);
        const parsed = str ? JSON.parse(str) : [];
        // Gyldig JSON er ikke nødvendigvis en liste. Et objekt eller null her
        // fik Historik-fanen til at kaste ved `[...liste]` og "Gem session" ved
        // `.some()` — samme udfald som ulæselig JSON skal give: en tom liste.
        return Array.isArray(parsed) ? parsed.filter(e => e && typeof e === 'object') : [];
    } catch (e) { console.error("History Error", e); return []; }
}

// Payload (den tunge del af en session gemmes for sig)
export function saveSessionPayload(sessionObj) {
    if (!sessionObj.id) return false;
    // Svaret sendes videre, så kaldstedet kan undgå en "spøgelses"-linje i
    // historikken (listen gemt, men indholdet tabt), når lageret er fuldt.
    return safeSave(`${SESSION_PREFIX}${sessionObj.id}`, JSON.stringify(sessionObj));
}

export function loadSessionPayload(sessionId) {
    try {
        const str = localStorage.getItem(`${SESSION_PREFIX}${sessionId}`);
        return str ? JSON.parse(str) : null;
    } catch (e) { return null; }
}

export function deleteSessionPayload(sessionId) {
    localStorage.removeItem(`${SESSION_PREFIX}${sessionId}`);
}

// --- CLASS DELETION CLEANUP ---

/**
 * Fjern ALT i localStorage, der hører til en klasse (filnavn).
 * Kaldes, når en klasse slettes, så der ikke bliver forældreløse data.
 */
export function cleanupClassStorage(filename) {
    if (!filename) return;

    // 1. Emner
    localStorage.removeItem(`${TOPICS_PREFIX}${filename}`);
    _invalidateTopicCache();

    // 2. Grupper
    localStorage.removeItem(`${GROUPS_PREFIX}${filename}`);

    // 3. Historik og alle sessioners payloads — men kun dem, ingen anden
    //    klasses historik nævner. Nøglen `grupdk_session_<id>` er fælles for
    //    alle klasser, og flytningen fra de gamle nøglenavne kan give en kopi
    //    ("3.b (kopi)") en historik med de samme id'er som originalen. Uden
    //    tjekket tog sletningen af kopien originalens gemte sessioner med.
    const historyKey = `${HISTORY_PREFIX}${filename}`;
    try {
        const history = JSON.parse(localStorage.getItem(historyKey));
        if (Array.isArray(history)) {
            const elsewhere = sessionIdsInHistories(historyKey);
            history.forEach(entry => {
                if (entry && entry.id && elsewhere.ids && !elsewhere.ids.has(entry.id)) {
                    localStorage.removeItem(`${SESSION_PREFIX}${entry.id}`);
                }
            });
        }
    } catch (e) {
        console.error("Cleanup history parse error:", e);
    }
    localStorage.removeItem(historyKey);

    // 4. Det samme under de gamle nøglenavne (fra før navneskiftet 3/11 2026)
    //    — ellers kunne det komme igen på en ny klasse med samme filnavn.
    removeLegacyClassData(localStorage, filename);
}

/**
 * Alle session-id'er, som historik-listerne nævner — undtagen listen under
 * `skipKey`. `ids` er null, hvis bare én liste ikke kunne læses: så ved vi
 * ikke, hvad den kendte, og intet må slettes ud fra svaret.
 */
function sessionIdsInHistories(skipKey) {
    const ids = new Set();
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key === skipKey || !key.startsWith(HISTORY_PREFIX)) continue;
        try {
            const list = JSON.parse(localStorage.getItem(key));
            if (Array.isArray(list)) list.forEach(e => e && e.id && ids.add(e.id));
            else if (list != null) return { ids: null };
        } catch (e) {
            return { ids: null };
        }
    }
    return { ids };
}

// --- GAMLE SESSIONER I KLASSER, DER IKKE BRUGES ---

/**
 * Hold løftet om "højst 50 pr. klasse, ingen ældre end 90 dage" for ALLE
 * klasser — også dem, læreren ikke har åbnet i et halvt år.
 *
 * Udrensningen sker ellers kun i saveHistory(), altså når læreren gemmer en
 * ny session i netop den klasse. En klasse fra august, der aldrig blev rørt
 * igen, beholdt derfor sine sessioner — med elevernes navne — for evigt,
 * selvom GDPR-siden og privatlivspolitikken siger "højst 90 dage".
 *
 * Kører ved opstart. Det er de samme to lofter (pruneHistoryMeta), så intet
 * forsvinder, som ikke var forsvundet ved klassens næste gem.
 *
 * FORSIGTIGHEDEN er den samme som i oprydningen af slettede klasser:
 *  - ligger der en ulæselig klasseliste til side, ryddes intet (læreren er
 *    måske midt i at redde sine klasser);
 *  - en klasse med data under de gamle nøglenavne røres ikke;
 *  - en ulæselig historik-liste røres ikke;
 *  - en payload slettes kun, hvis ingen anden liste stadig nævner den.
 *
 * @returns {number} antal sessioner der blev luget ud
 */
export function pruneStaleHistories() {
    if (unreadableListKept()) return 0;
    const legacy = legacyProtection(localStorage);
    if (legacy.all) return 0;

    // Først alle lister, så de id'er, der bliver STÅENDE, er kendt, før
    // noget slettes.
    const plans = [];
    const keptIds = new Set();
    let unreadable = false;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(HISTORY_PREFIX)) continue;
        const raw = localStorage.getItem(key);
        let list;
        try {
            list = JSON.parse(raw);
        } catch (e) {
            unreadable = true;
            continue;
        }
        if (!Array.isArray(list)) {
            if (list != null) unreadable = true;
            continue;
        }
        const filename = key.slice(HISTORY_PREFIX.length);
        if (legacy.files.has(filename)) {
            list.forEach(e => e && e.id && keptIds.add(e.id));
            continue;
        }
        const { kept, dropped } = pruneHistoryMeta(list);
        kept.forEach(e => e.id && keptIds.add(e.id));
        if (dropped.length > 0) plans.push({ key, raw, kept, dropped });
    }

    let removed = 0;
    plans.forEach(({ key, raw, kept, dropped }) => {
        // Har en anden fane gemt en session i klassen, siden listen blev
        // læst, ville vores udgave skrive den væk — og dens payload blev så
        // ryddet som forældreløs ved næste opstart. Så venter vi til næste gang.
        if (localStorage.getItem(key) !== raw) return;
        // Listen FØRST. Afvises skrivningen (fuldt lager), står både listen
        // og sessionerne, som de stod — og der prøves igen ved næste opstart.
        if (safeSave(key, JSON.stringify(kept)) === false) return;
        removed += dropped.length;
        // Kunne en anden liste ikke læses, ved vi ikke, om den nævner
        // sessionen. Så bliver payloaden liggende (som i cleanupOrphanedPayloads).
        if (unreadable) return;
        dropped.forEach(e => {
            if (e.id && !keptIds.has(e.id) && !legacy.sessions.has(e.id)) deleteSessionPayload(e.id);
        });
    });
    if (removed > 0) {
        console.log(`[Storage] Lugede ${removed} gemt(e) session(er) ud (over 90 dage eller ud over de 50 nyeste).`);
    }
    return removed;
}

// --- TOPIC PRUNING ---

/**
 * Skriv emnerne for ÉT prefix ned i ÉN skrivning — og ryd samtidig ud i de
 * emner, der ikke længere har en gruppe.
 *
 * HVORFOR DEN FINDES: emnekortet er ÉN nøgle i lageret. `saveTopic()` læser
 * hele kortet, sætter én nøgle og skriver det HELE tilbage. Kaldt i en løkke
 * over grupperne — som gendannelse, kørselsgendannelse og emne-tildelingen
 * ved generering gjorde — bliver det N fulde skrivninger af det samme kort,
 * plus en `pruneTopics()` oveni. Målt på en klasse med 220 elever: 17
 * tastetryk i ét emnefelt gav 34 skrivninger (17 af kortet, 17 af hele
 * gruppe-blobben à ~3,9 KB).
 *
 * Tiden er ikke problemet — 34 skrivninger tog 0,1 ms. Problemet er, at hver
 * enkelt af dem kan blive AFVIST for sig (fuld kvote, Safari i privat
 * browsing). Så står kortet halvskrevet: gruppe 1-4 har sessionens emner,
 * gruppe 5-10 har dem fra i forgårs, og skærmen viser en tredje ting. Med én
 * skrivning findes kun to udfald — hele det nye kort, eller det gamle urørt —
 * og ét svar at forgrene sig på.
 *
 * Udrensningen er med her MED VILJE: `pruneTopics()` bagefter ville være
 * endnu en skrivning, og den kan fejle alene.
 *
 * @param {string} prefix 'S_' (stamgrupper) eller 'M_' (matrix)
 * @param {Array<{name: string, topic?: string|null}>} groups grupperne som de
 *   ser ud NU. Emner for gruppenavne der ikke står på listen, fjernes.
 * @returns {boolean} false hvis skrivningen blev afvist
 */
export function replaceTopicsForPrefix(prefix, groups) {
    const key = _topicStorageKey();
    if (!key) return false;

    const map = getTopicMap(true);
    if (map === null) return false;
    const next = {};

    // Behold alt der hører til det ANDET prefix urørt — stamgruppernes emner
    // og matrixens ligger i samme kort.
    Object.keys(map).forEach(k => {
        if (!k.startsWith(prefix)) next[k] = map[k];
    });

    (groups || []).forEach(g => {
        if (!g || !g.name) return;
        const topic = (g.topic === null || g.topic === undefined) ? '' : String(g.topic).trim();
        if (topic) next[`${prefix}${g.name}`] = topic;
    });

    const ok = safeSave(key, JSON.stringify(next));
    _invalidateTopicCache();
    schedulePopulateDatalist();
    return ok !== false;
}

/**
 * Ryd emner i én visning: først emnekortet, dernæst grupperne i hukommelsen
 * og deres gemte kopi. Ved genindlæsning vinder emnekortet, også hvis den
 * anden skrivning blev afvist.
 * @param {string} prefix 'S_' (stamgrupper) eller 'M_' (matrix)
 */
export function clearTopics(prefix) {
    if (!state.currentClass || !state.currentClass.filename) return false;

    // Gem emnekortet FØRST. Afvises det, beholder både skærmen og de gemte
    // grupper deres emner, så en fejlet sletning ikke ligner en gennemført.
    if (replaceTopicsForPrefix(prefix, []) === false) return false;

    const groups = prefix === 'M_' ? state.storedMatrixGroups : state.storedStandardGroups;
    let allOk = true;
    if (Array.isArray(groups)) {
        groups.forEach(g => { g.topic = null; });
        if (saveGroupsToStorage() === false) allOk = false;
    }

    _populateDatalistNow();
    return allOk;
}

// --- FORÆLDRELØSE KLASSE-NØGLER ---

/**
 * Ligger der en ulæselig klasseliste til side (py_bridge._keepUnreadableCopy)?
 * Så ved vi ikke, hvilke klasser den kendte, og oprydningen ved opstart må
 * ikke kalde nogen af dem forældreløse — den nye liste kan være en enkelt
 * gendannet klasse, mens grupperne og historikken for resten stadig ligger her.
 */
function unreadableListKept() {
    try {
        return localStorage.getItem(UNREADABLE_CLASSES_KEY) !== null;
    } catch (e) {
        return true;
    }
}

/**
 * Ryd data der hører til en klasse, som ikke findes længere.
 *
 * En klasse fylder fire slags nøgler: `grupdk_groups_<fil>`,
 * `grupdk_topics_<fil>`, `grupdk_history_<fil>` og en
 * `grupdk_session_<id>` pr. gemt session. `cleanupClassStorage()` fjerner
 * dem alle, når læreren sletter klassen — men kun hvis sletningen kommer
 * dertil. To faner kunne før skrive en gruppe eller et emne ned igen, EFTER
 * oprydningen var kørt i den anden fane, og så blev gruppekortene liggende
 * med elevernes navne under en klasse, læreren havde slettet. Præcis det,
 * GDPR-siden lover ikke sker.
 *
 * Kører ved opstart. Sammenligner med klasselisten og rydder resten.
 *
 * FORSIGTIGHEDEN: der ryddes KUN, hvis klasselisten kunne læses OG faktisk
 * står i lageret. Findes nøglen slet ikke, mens der ligger klasse-nøgler,
 * er listen gået tabt — ikke klasserne. Dét er den situation, hvor
 * `_warnClassesUnreadable()` beder læreren om ikke at lukke fanen, og hvor
 * grupperne og historikken er det eneste, der er tilbage af hendes arbejde.
 *
 * @returns {number} antal klasser der blev ryddet efter
 */
export function cleanupOrphanedClassData() {
    // Ligger der stadig noget under de gamle nøglenavne for en klasse
    // (flytningen kunne ikke afgøre det, eller lageret var fuldt), kan den stå
    // i den gamle liste og dens grupper under det nye navn. Den klasse røres
    // ikke — de andre ryddes som altid.
    if (unreadableListKept()) return 0;
    const legacy = legacyProtection(localStorage);
    if (legacy.all) return 0;
    let known;
    try {
        const raw = localStorage.getItem(CLASSES_KEY);
        if (raw === null) return 0;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return 0;
        known = new Set(parsed.map(c => c && c.filename).filter(Boolean));
    } catch (e) {
        console.error('[Storage] Klasselisten kunne ikke læses — rydder ikke op.', e);
        return 0;
    }

    const PREFIXES = [GROUPS_PREFIX, TOPICS_PREFIX, HISTORY_PREFIX];
    const orphans = new Set();
    // Ét gennemløb, og sletningen sker FØR nøglelisten røres — at fjerne en
    // nøgle midt i `key(i)`-løkken flytter de øvrige og springer poster over.
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const prefix = PREFIXES.find(p => key.startsWith(p));
        if (!prefix) continue;
        const filename = key.slice(prefix.length);
        if (filename && !known.has(filename) && !legacy.files.has(filename)) orphans.add(filename);
    }

    // cleanupClassStorage() tager alle fire slags nøgler for én klasse —
    // også de gemte sessioners payloads, som historik-listen peger på.
    orphans.forEach(filename => cleanupClassStorage(filename));
    if (orphans.size > 0) {
        console.log(`[Storage] Ryddede data efter ${orphans.size} slettet(e) klasse(r).`);
    }
    return orphans.size;
}

// --- ORPHANED SESSION PAYLOAD CLEANUP ---

/**
 * Ryd op i de to måder en gemt session kan gå i stykker på.
 *
 * 1. PAYLOAD UDEN LISTE — en session der ligger og fylder, uden at nogen
 *    historik-liste kender den. Ren spildplads; slettes.
 * 2. LISTE UDEN PAYLOAD — en linje i historikken hvis data er væk. Den kan
 *    ikke gendannes og svarer "Kunne ikke hente session data!", når læreren
 *    klikker. Det sker fx når `saveHistory()` har slettet payloaden for en
 *    udrenset session, men selve liste-skrivningen bagefter blev afvist
 *    (fuld lagerplads) — så overlevede den GAMLE liste med en død linje i.
 *    Linjen fjernes, så listen kun viser sessioner der faktisk kan hentes.
 *
 * Ét gennemløb over NØGLELISTEN (`localStorage.key(i)`): den kan være flere
 * hundrede poster dyb efter et år i brug, og vi vil ikke scanne den to gange.
 * Trin 2 læser kun historik-nøglerne igen — dem er der én af pr. klasse.
 *
 * VIGTIGT om ulæselige historik-lister: en `grupdk_session_<id>`-nøgle
 * siger ikke selv hvilken klasse den hører til, så vi kan kun kalde den
 * forældreløs, hvis ALLE historik-lister blev læst. Kan bare én af dem ikke
 * parses, ved vi ikke, hvad den kendte til — og sletter derfor ingenting.
 * Før slettede en enkelt ulæselig liste hver eneste gemte session for den
 * klasse, automatisk og uden besked, første gang appen blev åbnet.
 *
 * @returns {number} Antal forældreløse payloads der blev slettet
 */
export function cleanupOrphanedPayloads() {
    // Samme forsigtighed som ovenfor: en historik under det gamle navn kender
    // sessioner, der allerede står under det nye, og en session under det
    // gamle navn er stadig en payload.
    const legacy = legacyProtection(localStorage);
    if (legacy.all) return 0;
    const knownIds = new Set(legacy.sessions);
    const sessionKeys = [];
    const historyKeys = [];
    let unreadableHistory = false;

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith(HISTORY_PREFIX)) {
            historyKeys.push(key);
            try {
                const history = JSON.parse(localStorage.getItem(key));
                if (Array.isArray(history)) {
                    history.forEach(entry => {
                        if (entry && entry.id) knownIds.add(entry.id);
                    });
                } else if (history != null) {
                    // Læsbar JSON, men ikke en liste — vi ved ikke hvad den
                    // indeholdt. `null` (tom nøgle) er derimod bare "ingen
                    // sessioner" og skal ikke spærre for oprydningen.
                    unreadableHistory = true;
                }
            } catch (e) {
                console.error('[Storage] Ulæselig historik-liste:', key, e);
                unreadableHistory = true;
            }
        } else if (key.startsWith(SESSION_PREFIX)) {
            sessionKeys.push(key);
        }
    }

    // 1. Payloads uden en liste der kender dem.
    let removed = 0;
    if (!unreadableHistory) {
        sessionKeys.forEach(key => {
            const sessionId = key.slice(SESSION_PREFIX.length);
            if (!knownIds.has(sessionId)) {
                localStorage.removeItem(key);
                removed++;
            }
        });
        if (removed > 0) {
            console.log(`[Storage] Ryddede ${removed} forældreløs(e) session-payload(s).`);
        }
    }

    // 2. Liste-linjer hvis payload er væk. Uafhængig af punkt 1 — her læses
    //    hver enkelt liste for sig, så en ulæselig liste ét sted ikke
    //    forhindrer oprydningen af en anden klasses døde linjer.
    const liveIds = new Set([...sessionKeys.map(k => k.slice(SESSION_PREFIX.length)), ...legacy.sessions]);
    historyKeys.forEach(key => {
        let history;
        try {
            history = JSON.parse(localStorage.getItem(key));
        } catch (e) { return; }
        if (!Array.isArray(history)) return;
        // Kun linjer der HAR et id, men hvis payload er væk, fjernes. En linje
        // helt uden id er fra en meget gammel version — den kan heller ikke
        // gendannes, men den er ikke vores at slette her.
        const keptSet = history.filter(e => !e || !e.id || liveIds.has(e.id));
        if (keptSet.length === history.length) return;
        // Skrivningen kan afvises (fuld lagerplads). Så bliver de døde linjer
        // stående til næste gang — det er en kosmetisk oprydning, ikke noget
        // der må stoppe opstarten.
        if (safeSave(key, JSON.stringify(keptSet)) !== false) {
            console.log(`[Storage] Fjernede ${history.length - keptSet.length} død(e) linje(r) fra ${key}.`);
        }
    });

    return removed;
}

// --- TOPIC LIST MIGRATION ---

/**
 * Læs de eksisterende emner pr. gruppe for den aktuelle klasse og returnér en
 * liste uden dubletter. Bruges til engangsmigreringen fra den gamle model (et
 * emne pr. gruppe) til klassens egen emneliste.
 * @returns {string[]} Unikke emnenavne i vilkårlig rækkefølge
 */
export function deriveClassTopicsFromGroupTopics() {
    if (!state.currentClass || !state.currentClass.filename) return [];
    const map = getTopicMap();
    const stamTopics = Object.keys(map)
        .filter(key => key.startsWith('S_'))
        .map(key => map[key])
        .filter(v => v && typeof v === 'string');
    // Dubletter findes uden hensyn til store/små bogstaver (første stavemåde
    // vinder) — mergeClassTopics, så "Liberalisme" og "liberalisme" ikke
    // bliver to klasse-emner.
    return mergeClassTopics([], stamTopics);
}

// --- GROUP TOPIC HYDRATION ---

/**
 * Sæt hver gruppes emne ind fra det separate emnelager (D).
 * D er den autoritative kilde for per-gruppe topics — hvis et topic mangler i
 * D, betragtes gruppen som "uden emne", uanset hvad der måtte ligge i C
 * (groups-blob). Dette undgår at en mislykket clearTopics-operation lader
 * spøgelses-topics overleve i C og blive genindlæst ved næste reload.
 *
 * Alle nuværende mutations-paths (saveTopic + g.topic = X) holder D og C
 * synkrone, så det er sikkert at lade D vinde.
 *
 * @param {Array} groups - listen af gruppe-objekter
 * @param {string} prefix - 'S_' eller 'M_'
 */
export function hydrateGroupTopics(groups, prefix) {
    if (!groups || !Array.isArray(groups)) return;

    const map = getTopicMap();
    groups.forEach(g => {
        const key = `${prefix}${g.name}`;
        const storedTopic = map[key];
        const trimmed = (storedTopic && typeof storedTopic === 'string') ? storedTopic.trim() : '';
        g.topic = trimmed.length > 0 ? trimmed : null;
    });
}

// --- BACKUP: DET DER LIGGER UDEN FOR KLASSE-OBJEKTET ---
//
// En klasse gemmes IKKE ét sted. `grupdk_classes` holder elevrækkerne,
// reglerne og indstillingerne — men grupperne, emnekortet og de gemte
// sessioner ligger i deres egne nøgler pr. klasse:
//
//   grupdk_groups_<filnavn>   grupperne som de står lige nu
//   grupdk_topics_<filnavn>   emne pr. gruppe ({ 'S_Group 1': 'Liberalisme' })
//   grupdk_history_<filnavn>  listen over gemte sessioner
//   grupdk_session_<id>       den enkelte sessions indhold
//
// Backup-filen indeholdt kun det første. Læreren fik altså en fil der lovede
// "alt data, regler og historik", men som efter en gendannelse efterlod
// klassen uden grupper, uden emner og uden en eneste gemt session — og der
// findes ingen server med en kopi. De to funktioner her læser og skriver
// netop de nøgler, med FILNAVN som argument (resten af filen arbejder på
// `state.currentClass`, men en backup rører klasser der ikke er åbne).

/** Et JSON-opslag, ikke en liste eller null. */
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Læs klassens grupper, emner og historik til backup. Manglende nøgler er
 * normale for en ny klasse. Ulæselige nøgler er derimod et tab, som kalderen
 * skal nævne, selv om resten af klassen stadig kan reddes i filen.
 */
export function readClassExtras(filename, getItem = (key) => localStorage.getItem(key)) {
    // getItem: hvor nøglerne læses fra. Normalt lageret selv — men data flyttet
    // med fra www.dida.dk ligger i en pakke, ikke i lageret (se adoptWww.js),
    // og de skal læses på nøjagtig samme måde.
    const failed = new Set();
    const read = (key, fallback, label, valid) => {
        try {
            const raw = getItem(key);
            if (raw === null) return fallback;
            const value = JSON.parse(raw);
            if (valid(value)) return value;
        } catch (e) {
            console.error('[Storage] Kunne ikke læse', key, e);
        }
        failed.add(label);
        return fallback;
    };
    const groups = read(`${GROUPS_PREFIX}${filename}`, null, 'grupper',
        value => value === null || (isRecord(value)
            && ['standard', 'matrix'].every(key => value[key] == null || Array.isArray(value[key]))));
    const groupTopics = read(`${TOPICS_PREFIX}${filename}`, {}, 'emner', isRecord);
    const historyRaw = read(`${HISTORY_PREFIX}${filename}`, [], 'historik', Array.isArray);
    const history = historyRaw.filter(entry => {
        if (isRecord(entry) && entry.id) return true;
        failed.add('historik');
        return false;
    });

    // Id'er fra ældre backup-filer kan også hedde __proto__ eller constructor.
    // Et opslag uden prototype bevarer dem som almindelige egne nøgler.
    const sessions = Object.create(null);
    history.forEach(entry => {
        const payload = read(`${SESSION_PREFIX}${entry.id}`, null, 'historik', isRecord);
        if (payload) sessions[entry.id] = payload;
        else failed.add('historik');
    });

    return { groups, groupTopics, history, sessions, failed: [...failed] };
}

/**
 * Skriv de samme nøgler tilbage efter en gendannelse.
 *
 * Sessionerne får NYE id'er. Nøglen `grupdk_session_<id>` er global på
 * tværs af klasser, så en gendannelse med de gamle id'er kunne overskrive en
 * session der hører til en anden klasse — fx når backuppen lægges ind under
 * et nyt filnavn ("_gendannet_"), og begge klasser dermed findes samtidig.
 *
 * Skrivningen er "så meget som muligt": grupperne er vigtigere end
 * historikken, så de skrives først. Løber lagerpladsen tør undervejs,
 * fortæller returværdien hvad der ikke nåede med — en halv gendannelse må
 * ikke kvitteres som en hel.
 *
 * @returns {{written: string[], failed: string[], prunedSessions: number}}
 *   hvilke dele der kom med, og hvor mange sessioner de to lofter lugede væk
 */
export function writeClassExtras(filename, extras) {
    const written = [];
    const failed = [];
    // Hvor mange gemte sessioner udrensningen tog. Den skete tavst før: en
    // backup med et års historik kunne bære 200 sessioner, appen selv aldrig
    // ville have beholdt, og læreren fik en grøn kvittering på "gendannet"
    // uden at vide, at halvdelen aldrig kom med.
    let prunedSessions = 0;
    if (!filename || !extras || typeof extras !== 'object') {
        return { written, failed, prunedSessions };
    }

    const put = (key, value, label) => {
        if (safeSave(key, JSON.stringify(value)) === false) failed.push(label);
        else written.push(label);
    };

    if (extras.groups && typeof extras.groups === 'object') {
        put(`${GROUPS_PREFIX}${filename}`, extras.groups, 'grupper');
    }

    if (extras.groupTopics && typeof extras.groupTopics === 'object') {
        put(`${TOPICS_PREFIX}${filename}`, extras.groupTopics, 'emner');
        // Cachen kan holde et emnekort fra den klasse der lå her før.
        _invalidateTopicCache();
    }

    if (extras.history != null && !Array.isArray(extras.history)) failed.push('historik');
    if (Array.isArray(extras.history) && extras.history.length > 0) {
        const sessions = isRecord(extras.sessions) ? extras.sessions : {};
        const restoredMeta = [];
        let payloadFailures = 0;

        // De to lofter (50 sessioner, 90 dage) håndhæves af saveHistory() på
        // alt appen selv gemmer. Gendannelsen skrev udenom — direkte i
        // lageret — så en backup kunne lægge lige så mange sessioner ind, som
        // filen indeholdt. Hver session er en fuld gruppedannelse, og pladsen
        // deles med ALLE dida.dk-værktøjer: en gammel eller håndredigeret
        // backup kunne dermed fylde kvoten op med sessioner, appen selv for
        // længst ville have luget ud. Samme værn, samme sted som import og
        // klasserækker fik det.
        //
        // Udrensningen sker FØR payloadene skrives, ikke efter: de tunge
        // objekter skal slet ikke i lageret, og der er ikke plads til at
        // fortryde bagefter.
        const { kept: historyToWrite, dropped } = pruneHistoryMeta(extras.history);
        prunedSessions = dropped.length;
        if (historyToWrite.length + dropped.length !== extras.history.length) failed.push('historik');

        historyToWrite.forEach(entry => {
            if (!entry || typeof entry !== 'object') return;
            const payload = entry.id && Object.hasOwn(sessions, entry.id) ? sessions[entry.id] : null;
            // Uden payload er sessionen en blindgyde i listen ("Kunne ikke
            // hente session data!"). Så hellere udelade den helt.
            if (!isRecord(payload)) {
                payloadFailures++;
                return;
            }

            const newId = newUuid();

            if (safeSave(`${SESSION_PREFIX}${newId}`,
                JSON.stringify({ ...payload, id: newId })) === false) {
                payloadFailures++;
                return;
            }
            restoredMeta.push({ ...entry, id: newId });
        });

        if (restoredMeta.length > 0) {
            if (safeSave(`${HISTORY_PREFIX}${filename}`, JSON.stringify(restoredMeta)) === false) {
                failed.push('historik');
                // De nye payloads kan ikke åbnes uden listen. Ryd dem nu,
                // så et genforsøg ikke først kræver en genindlæsning for at
                // få den knappe lagerplads tilbage. Andre sessioner røres ikke.
                restoredMeta.forEach(entry => deleteSessionPayload(entry.id));
            } else {
                written.push('historik');
            }
        }
        if (payloadFailures > 0) failed.push('historik');
    }

    // Historikken kan have lagt sig i begge lister (nogle sessioner skrevet,
    // andre ikke). Delvist = ikke lykkedes.
    const failedParts = [...new Set(failed)];
    return {
        written: [...new Set(written)].filter(l => !failedParts.includes(l)),
        failed: failedParts,
        prunedSessions
    };
}
