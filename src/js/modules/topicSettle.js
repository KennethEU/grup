// topicSettle.js — skriv grupperes emner, og lad grupperne have det, der
// FAKTISK står i lageret, også når lageret er fuldt.
//
// Emnekortet (grupdk_topics_<fil>) er den kilde, næsten alt læser emnerne
// fra: matrix-rundens kilder, eksporten, Vis for klassen, udskriften, en
// genindlæsning (hydrateGroupTopics) og en session, der gemmes bagefter.
// Kan det nye kort ikke skrives, står det FORRIGE kort tilbage — med de
// samme gruppenavne ("Group 1" …). Beholdt grupperne så deres nye emner,
// viste kortet på skærmen ét emne, mens matrix, eksporten og den næste
// gemte session brugte et andet.
//
// Reglen er derfor ét sted (gennemsyn 84 og 85): prøv det nye kort; går det
// ikke, så fjern de gamle emner i stedet (en MINDRE skrivning, som plejer at
// gå); går heller ikke det, får grupperne emnerne fra lageret. Kalderen
// vælger beskeden ud fra svaret. Bruges af landingen (nextEngine.js), Hent
// session (history.js) og Gendan grupper (restoreGroups.js).
import { replaceTopicsForPrefix, hydrateGroupTopics } from './storage.js';

/**
 * @param {'S_'|'M_'} prefix stamgrupper eller matrix
 * @param {Array<{name: string, topic?: string|null}>} groups grupperne med de
 *   emner, de SKAL have. Rettes på stedet, hvis emnerne ikke kunne gemmes.
 * @returns {'saved'|'cleared'|'stale'}
 *   'saved'   — emnerne er gemt, som grupperne har dem
 *   'cleared' — de kunne ikke gemmes; grupperne står nu uden emne, ligesom i lageret
 *   'stale'   — heller ikke det gik; grupperne har emnerne fra lageret (de forrige)
 */
export function saveTopicsOrSettle(prefix, groups) {
    const list = Array.isArray(groups) ? groups : [];
    if (replaceTopicsForPrefix(prefix, list) !== false) return 'saved';
    if (replaceTopicsForPrefix(prefix, []) !== false) {
        list.forEach(g => { if (g) g.topic = null; });
        return 'cleared';
    }
    hydrateGroupTopics(list, prefix);
    // Er kortet ulæseligt, læses det som tomt — så står grupperne reelt uden
    // emne, og beskeden må ikke tale om "de forrige emner".
    return list.some(g => g && g.topic) ? 'stale' : 'cleared';
}
