// state.js - appens fælles tilstand
// Klassen og grupperne, fortryd/gentag i elevlisten og nogle UI-flag.
//
// VIGTIGT: `state` er pakket ind i Vues reactive(), så Vue-komponenterne og
// den almindelige JS-kode deler den SAMME reaktive proxy. Enhver ændring af
// `state.*` tegner automatisk skærmen om.

import { reactive, markRaw, toRaw } from 'vue';
import { ROW_ID } from './utils.js';

/** Så mange fortryd-trin gemmes højst */
const MAX_UNDO_STEPS = 50;

// Dyb kopi. structuredClone er ~2-3× hurtigere end JSON-vejen — men den kaster
// DataCloneError, hvis værdien indeholder en Vue-proxy (det sker, når et
// reaktivt array spredes: `[...arr]` lægger proxyer ned i det nye array).
// Uden faldet tilbage ville ét sådant tilfælde slå fortryd helt ud af drift.
const deepClone = (v) => {
    if (typeof structuredClone === 'function') {
        try { return structuredClone(v); } catch { /* falder igennem */ }
    }
    return JSON.parse(JSON.stringify(v));
};

// Det rå objekt bag proxyen (eksporteres ikke — alt går gennem proxyen).
// _undoStack / _redoStack er pakket i markRaw(), så Vue IKKE laver proxyer af
// hvert gemt øjebliksbillede. Skærmen læser aldrig stakkene direkte, kun via
// canUndo()/canRedo() — så det er sikkert og sparer O(N×felter) proxyer pr.
// fortryd-trin.
const _rawState = {
    // Data
    currentClass: null,
    storedStandardGroups: null,
    storedMatrixGroups: null,
    lastGeneratedGroups: null,

    // UI State
    lastClassIndex: 0,
    showGroupTags: false,
    showHiddenContent: false,
    sortState: { col: null, dir: 'asc' },
    groupMode: 'size',
    activeView: 'standard',
    navView: 'dashboard', // 'dashboard', 'class', 'backup', 'help', 'edu', 'gdpr'
    classViewTab: 'students', // 'students', 'groups', 'history'
    // Ét vindue til begge slags aftaler; fanen siger hvilken der vises.
    showAgreementsModal: false,
    agreementTab: 'together', // 'together' | 'separate'
    // Elever (_rowId) hvis aftale(r) skal markeres, når vinduet åbnes fra en
    // advarsel ("Vis aftalen"). Tom = ingen markering.
    agreementHighlight: [],
    importViewTab: 'import', // 'import', 'export'
    // Hvilken importform Import & backup skal åbne på ('drop' | 'paste'), når
    // læreren kommer fra en "Indsæt fra Excel"-genvej. Brugt én gang af
    // ImportSection og så nulstillet, så et almindeligt besøg stadig åbner på
    // Upload.
    importModeRequest: null,
    // "Matrixen er dannet ud fra ANDRE stamgrupper og skal dannes forfra."
    // Gemmes med grupperne (saveGroupsToStorage), så det overlever en
    // genindlæsning — den gamle matrix ligger stadig i storedMatrixGroups, og
    // uden flaget ville den blive vist, udskrevet og gemt som gyldig.
    matrixGroupsStale: false,
    // Aftryk af de stamgrupper, den NUVÆRENDE matrix blev dannet ud fra —
    // se homeGroupFingerprint() i utils.js. Driver hintet "stamgrupperne er
    // ændret, siden matrixen blev dannet". Lever kun i hukommelsen: efter en
    // genindlæsning ved vi ikke hvor matrixen kom fra, og så er tavshed
    // ærligere end en advarsel vi ikke kan stå inde for.
    matrixSourceFingerprint: null,
    isGenerating: false,
    // Job-id'et for den gruppedannelse, der kører lige nu. Starter læreren en
    // ny (eller stopper), ignoreres det gamle jobs resultat, også hvis det
    // når frem senere. Så kan et sent svar ikke overskrive storedStandardGroups.
    activeJobId: null,

    // Elev-identiteten. ALTID ROW_ID — læreren vælger den ikke længere, og den
    // svarer ikke til nogen synlig kolonne. Feltet er bevaret (frem for at
    // skrive ROW_ID direkte ud i hvert opslag), fordi hele identitets-
    // plumbingen — låse, undgåelser, historik, matrix — allerede læser det.
    idColumn: ROW_ID,

    // Kolonnen der VISES: på gruppekortene, i undgåelses-listen og i historik.
    // Det er den læreren vælger i "Vis:"-menuen, og den har ingen krav om at
    // være unik eller udfyldt. Persisteres i klassens `id_column`-felt, som
    // netop indeholdt lærerens valg i forvejen — derfor migrerer gamle klasser
    // helt af sig selv.
    displayColumn: '',

    // De markerede elever (til "Lav aftale": undgåelser og Skal sammen)
    selectedForAction: new Set(),

    // Fortryd/gentag-stakkene til elevlisten — rå (ikke reaktive), så vi ikke
    // betaler for proxyer til 50 øjebliksbilleder, som intet på skærmen læser.
    _undoStack: markRaw([]),
    _redoStack: markRaw([]),
    // Stakkene er ikke reaktive, så knapperne "Fortryd" og "Gentag" kan ikke
    // se, når de ændrer sig. Tallet her tælles op ved HVER ændring af dem, og
    // canUndo()/canRedo() læser det — så slukker og tænder knapperne af sig selv.
    undoVersion: 0,

    // Kørselshistorik: de seneste gruppedannelser i DENNE fane.
    // Bevidst kun i hukommelsen — den overlever ikke en genindlæsning, og
    // kan derfor aldrig æde af den localStorage-kvote alle dida.dk-værktøjer
    // deler. markRaw af samme grund som stakkene ovenfor: UI'et læser
    // listen gennem listRuns(), aldrig snapshottene selv.
    _runHistory: markRaw([]),

    // Aftryk af grupperne som de sidst kom fra motoren (eller fra en
    // gendannet kørsel). Bruges til at opdage manuelle flytninger, så
    // "gå tilbage" kun spørger "er du sikker?", når der er noget at miste.
    _lastGeneratedFingerprint: null,

    // Regler og indstillinger som de var, da grupperne på skærmen blev dannet.
    // Gemmes ved hver generering, fordi kørselshistorikken tager sit snapshot
    // FØRST ved den næste generering — og til den tid kan læreren allerede
    // have ændret dem.
    _lastRunInputs: null,

    // Hvilken tidligere kørsel der lige nu FORHÅNDSVISES på gruppekortene.
    // null = vis de rigtige grupper. Reaktiv (ikke markRaw), fordi kortene
    // skal tegne sig om, når den ændrer sig.
    previewRunIndex: null,

    // Optagelsen af den seneste gruppedannelse — læreren kan afspille den og
    // se motoren arbejde (recorder.py → replay.js). Én pr. visning: en
    // matrix-kørsel må ikke smide stamgruppernes optagelse væk, og omvendt.
    //
    // KUN I HUKOMMELSEN, med vilje. En optagelse fylder op mod to megabyte,
    // og alle dida.dk-værktøjer deler den samme localStorage-kvote; "Lagerplads
    // fuld" er allerede en kendt fejlvej her (se emne-tildelingen i
    // generation.js). Den forsvinder ved en genindlæsning, og afspilleren
    // siger det i stedet for at lade som ingenting.
    lastRecording: { standard: null, matrix: null },
    // Aftryk af de grupper, hver optagelse hører til. Passer det ikke længere
    // (læreren har flyttet en elev i hånden), må afspilningen ikke starte:
    // den ville køre hen mod en placering, kortene ikke har.
    lastRecordingFingerprint: { standard: null, matrix: null },

    // Den igangværende afspilning. null = ingen. Se replay.js — afspilningen
    // ejer aldrig grupperne, den lægger sig kun oven på dem.
    replay: null,

};

// Den reaktive proxy — DEN er den ene sandhed. Vue-komponenterne og den
// øvrige kode importerer det samme objekt.
export const state = reactive(_rawState);

/**
 * Læg et øjebliksbillede af klassens data på fortryd-stakken.
 * Kaldes FØR en ændring, der skal kunne fortrydes.
 */
export function pushUndo() {
    if (!state.currentClass || !state.currentClass.data) return;

    // toRaw() pakker proxyen ud, så structuredClone ikke går gennem hver
    // getter — hurtigere og uden bivirkninger.
    const snapshot = deepClone(toRaw(state.currentClass.data));
    state._undoStack.push(snapshot);

    if (state._undoStack.length > MAX_UNDO_STEPS) {
        state._undoStack.shift();
    }

    // En ny handling tømmer gentag-stakken. Længden sættes til 0, så det
    // stadig er det samme markRaw-array.
    state._redoStack.length = 0;
    state.undoVersion++;
}

/**
 * Lad `columns` følge nøglerækkefølgen i de rækker vi lige har lagt tilbage.
 *
 * `columns` er en afledt kopi: den rækkefølge der GEMMES, udledes af
 * rækkernes nøgler i `updateClass()` (`columnsOfRows`, første række
 * bestemmer rækkefølgen). Et fortryd bytter hele
 * `data`-arrayet ud, og har handlingen flyttet kolonnerne om
 * (`reorderColumns`), står `columns` tilbage i den NYE orden, mens rækkerne
 * er tilbage i den gamle. Tabellen ville så vise én rækkefølge, mens en helt
 * anden blev skrevet ned — og forskellen dukkede først op efter næste
 * genindlæsning.
 *
 * Vi sorterer kun; der tilføjes og fjernes ingen kolonner. En kolonne der
 * mangler i række 0 (huller i et regneark) skal ikke forsvinde ud af listen
 * her — det er en anden sag end rækkefølgen.
 */
function syncColumnOrderFromData(cls) {
    if (!cls || !Array.isArray(cls.columns) || !Array.isArray(cls.data)) return;
    const firstRow = cls.data[0];
    if (!firstRow) return;

    const rank = new Map(Object.keys(firstRow).map((k, i) => [k, i]));
    // Kolonner der ikke står i række 0, bliver hvor de er — derfor et stort
    // tal, så de lander bagest uden at bytte plads indbyrdes.
    const LAST = Number.MAX_SAFE_INTEGER;
    cls.columns = [...cls.columns].sort((a, b) =>
        (rank.has(a) ? rank.get(a) : LAST) - (rank.has(b) ? rank.get(b) : LAST));
}

/**
 * Smid markeringer af elever, der ikke er i klassen længere.
 *
 * Markeringen (`selectedForAction`) er en liste af `_rowId` — den peger på
 * elever, ikke på rækker på skærmen. Forsvinder en elev, mens hun er
 * markeret, bliver id'et liggende: sletter læreren én af tre markerede
 * elever, står der stadig tre.
 *
 * Følgen kunne ses to steder. "Lav aftale"-knappen vises fra to markerede og
 * blev stående, også når der kun var ÉN elev tilbage. Og "Undgå hinanden"
 * lavede så en undgåelse med de døde id'er i: den kan aldrig gå i brug
 * (generation.js filtrerer den fra), men den står i listen, tælles i badget
 * ved siden af "Aftaler" — og dækker en rigtig undgåelse af de samme elever,
 * så den ikke kan tilføjes bagefter.
 *
 * Kaldes hvert sted elevrækker kan forsvinde: sletningen i elevlisten, og
 * fortryd/gentag, som bytter hele listen ud.
 */
export function pruneSelection() {
    if (!state.selectedForAction || state.selectedForAction.size === 0) return;
    const rows = Array.isArray(state.currentClass?.data) ? state.currentClass.data : [];
    const known = new Set(rows.map(r => r && String(r[ROW_ID] ?? '').trim()).filter(Boolean));
    for (const id of [...state.selectedForAction]) {
        if (!known.has(String(id ?? '').trim())) state.selectedForAction.delete(id);
    }
}

/**
 * Fortryd den seneste ændring af klassens data.
 * @returns {boolean} true, hvis der blev fortrudt
 */
export function undo() {
    if (state._undoStack.length === 0 || !state.currentClass) return false;

    state._redoStack.push(deepClone(toRaw(state.currentClass.data)));
    state.currentClass.data = state._undoStack.pop();
    syncColumnOrderFromData(state.currentClass);
    pruneSelection();
    state.undoVersion++;
    return true;
}

/**
 * Gentag det senest fortrudte.
 * @returns {boolean} true, hvis der blev gentaget
 */
export function redo() {
    if (state._redoStack.length === 0 || !state.currentClass) return false;

    state._undoStack.push(deepClone(toRaw(state.currentClass.data)));
    state.currentClass.data = state._redoStack.pop();
    syncColumnOrderFromData(state.currentClass);
    pruneSelection();
    state.undoVersion++;
    return true;
}

/**
 * Er tastetrykket fortryd- eller gentag-genvejen? Giver 'undo', 'redo' eller null.
 *
 * Bruges af BÅDE den globale lytter i main.js og cellerne i elevlisten, så de
 * to aldrig kan læse genvejen forskelligt.
 *
 * HVORFOR toLowerCase(): `e.key` er det tegn, tasten skriver — og med Shift
 * nede er det et STORT "Z". Før sammenlignede vi med 'z', så Ctrl+Shift+Z
 * (gentag i Windows, på Chromebooks og i Firefox) aldrig blev genkendt:
 * intet skete uden for cellerne, og inde i en celle tog browserens egen
 * gentag over bag om appens stak. Caps Lock gør det samme ved Ctrl+Z i
 * Windows. Målt i Chromium: tasten kom som 'Z' med shiftKey sand.
 */
export function undoShortcut(e) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod || e.altKey || typeof e.key !== 'string') return null;
    const key = e.key.toLowerCase();
    if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
    if (key === 'y' && !e.shiftKey) return 'redo';
    return null;
}

/**
 * Tøm fortryd/gentag-stakkene (fx når der skiftes klasse).
 */
export function clearUndoHistory() {
    state._undoStack.length = 0;
    state._redoStack.length = 0;
    state.undoVersion++;
}

// `state.undoVersion` læses først, så en computed() der kalder dem, regnes om,
// når stakkene ændrer sig (se undoVersion ovenfor).
export function canUndo() {
    return state.undoVersion >= 0 && state._undoStack.length > 0;
}

export function canRedo() {
    return state.undoVersion >= 0 && state._redoStack.length > 0;
}
