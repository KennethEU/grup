// Klassens emner — tilføj, fjern og ryd (bruges af opskriftens emne-ord,
// RecipeTopics.vue). Emnerne fordeles på grupperne, når de dannes.
import { reactiveState } from './reactiveState.js';
import { autoSave } from './classActions.js';
import { clearTopics } from './storage.js';
import { eqTopic } from './utils.js';

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
    const v = String(text || '').trim();
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
