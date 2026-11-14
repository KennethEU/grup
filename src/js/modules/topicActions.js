// Klassens emner — tilføj, fjern og ryd (bruges af opskriftens emne-ord,
// RecipeTopics.vue). Emnerne fordeles på grupperne, når de dannes.
import { reactiveState } from './reactiveState.js';
import { autoSave } from './classActions.js';
import { clearTopics, saveTopic, saveGroupsToStorage } from './storage.js';
import { eqTopic, nfc, mergeClassTopics, classTopicSpelling } from './utils.js';

/** Opret emne-listen på klassen, når den mangler. */
export function ensureTopicsArray() {
    if (reactiveState.currentClass && !Array.isArray(reactiveState.currentClass.topics)) {
        reactiveState.currentClass.topics = [];
    }
}

/**
 * Tilføj et emne. Findes det allerede (uanset store/små bogstaver), sker der
 * intet. Returnerer true, når emnet blev tilføjet.
 */
export function addClassTopic(text) {
    if (!reactiveState.currentClass) return false;
    ensureTopicsArray();
    // NFC: et emne kopieret ud af en PDF på en Mac (å som a + ring) gemmes
    // som det, et dansk tastatur skriver — som cellerne (normalizeCellText).
    const v = nfc(String(text || '').trim());
    if (!v) return false;
    const topics = reactiveState.currentClass.topics;
    // eqTopic, ikke t.toLowerCase(): et tal i listen (kun muligt fra en
    // håndredigeret backup) fik sammenligningen til at kaste, og "Tilføj"
    // gjorde ingenting.
    if (topics.some(t => eqTopic(t, v))) return false;
    topics.push(v);
    autoSave();
    return true;
}

/**
 * Oprydning, når klassen åbnes (114. gennemsyn, 13/11 2026): klassens
 * emneliste uden dubletter, og stamgruppernes emner med listens stavemåde.
 *
 * HVORFOR: motoren tæller emnerne, som listen står (buildEngineInput), og
 * sammenligner tegn for tegn. Stod "Århus" der to gange — én gang tastet og
 * én gang kopieret ud af en PDF på en Mac (å som a + ring, som appen selv
 * kunne gemme før 1fa350fb) — eller "EU" og "eu" (fra en håndrettet backup),
 * var det to emner: grupperne fik "Århus" og "Århus" som hver sit emne, og
 * gruppeantallet blev rundet til et multiplum af ét emne for meget. På
 * skærmen så de to ens ud.
 *
 * HVAD DEN GØR:
 *   1. Listen flettes med sig selv (mergeClassTopics): første stavemåde
 *      vinder, alt gemmes i NFC, tomme og dubletter falder væk. Intet emne
 *      forsvinder — kun en anden stavemåde af et emne, der står der i forvejen.
 *   2. En stamgruppe, hvis emne er samme emne med en anden stavemåde, får
 *      listens. Ellers står emnevælgeren på gruppekortet tom (den matcher
 *      præcist), og en låst gruppe ville have et emne, listen ikke har.
 *      Emnekortet skrives FØRST (saveTopic); lykkes det ikke, står gruppen,
 *      som den stod.
 *
 * Idempotent: på en klasse i orden ændres intet, og der skrives ingenting.
 * Klassen selv gemmes af selectClass' autoSave (kun hvis noget er ændret).
 * Matrixgruppernes emner hører ikke til listen og røres ikke.
 *
 * @returns {boolean} true, hvis noget blev rettet
 */
export function tidyClassTopics() {
    const cls = reactiveState.currentClass;
    if (!cls || !Array.isArray(cls.topics)) return false;
    const tidy = mergeClassTopics([], cls.topics);
    // Grupperne FØRST, mod den ryddede liste. Kan en gruppes emne ikke
    // skrives (fuldt lager), beholdes listen, som den var: ellers stod
    // gruppens stavemåde ikke længere på listen, og emnevælgeren på kortet
    // viste "— Intet emne —" for en gruppe, der har et emne. Næste åbning
    // prøver igen.
    let groupsChanged = false;
    let allSaved = true;
    for (const g of reactiveState.storedStandardGroups || []) {
        if (!g || typeof g.topic !== 'string' || !g.topic) continue;
        const spelled = classTopicSpelling(tidy, g.topic);
        if (spelled === g.topic) continue;
        if (saveTopic(g.name, spelled, 'S_') === false) { allSaved = false; continue; }
        g.topic = spelled;
        groupsChanged = true;
    }
    if (groupsChanged) saveGroupsToStorage();
    let listChanged = false;
    if (allSaved && (tidy.length !== cls.topics.length || tidy.some((t, i) => t !== cls.topics[i]))) {
        cls.topics = tidy;
        listChanged = true;
    }
    return groupsChanged || listChanged;
}

export function removeClassTopic(index) {
    const topics = reactiveState.currentClass?.topics;
    if (!Array.isArray(topics) || index < 0 || index >= topics.length) return;
    topics.splice(index, 1);
    autoSave();
    // Fjernes det sidste emne, ryddes gruppernes emner med det samme, så
    // gruppekortene holder op med at vise emner uden at der skal dannes nye grupper.
    if (topics.length === 0) wipeGroupTopics();
}

export function clearClassTopics() {
    if (!reactiveState.currentClass) return;
    reactiveState.currentClass.topics = [];
    autoSave();
    wipeGroupTopics();
}

// Ryd gruppernes emner. clearTopics håndterer både topic-map (D), in-memory
// state (B) og groups-blob (C) i ét hug.
//
// NB: en efterfølgende restoreFromHistory kan re-introducere ryddede topics
// til klasse-listen og grupperne, fordi history-restore merger session-
// topics ind i state.currentClass.topics. Det er bevidst — restorer du en
// session, restorer du dens emneopsætning.
//
// Svaret SKAL ses på. clearTopics() rører ikke grupperne, hvis emnekortet
// ikke kunne skrives (fuld lagerplads, Safari i privat browsing) — så står
// listen tom, mens gruppekortene stadig bærer emnerne. Beskeden gives kun,
// når grupperne faktisk HAR emner tilbage: afvises kun den efterfølgende
// gruppe-skrivning, er emnerne væk fra både skærm og emnekort, og så er der
// intet at forklare.
function wipeGroupTopics() {
    if (clearTopics('S_') !== false) return;
    if (!(reactiveState.storedStandardGroups || []).some(g => g && g.topic)) return;
    window.notifyError?.(
        'Emnerne er fjernet fra listen, men grupperne har stadig deres emne på — '
        + 'browserens lagerplads er fuld. Emnerne forsvinder fra grupperne, næste '
        + 'gang du danner grupper. Slet en gammel session eller klasse for at frigøre plads.'
    );
}
