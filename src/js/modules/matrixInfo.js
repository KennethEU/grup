// Hvor mange matrixgrupper giver "Fuld" blanding — og hvor store bliver de?
//
// Bruges af matrix-opskriften (MatrixRecipePanel) til skønnet over, hvor
// mange matrixgrupper der bliver. Ren funktion: alt den skal bruge, får den med.
//
// "Fuld" betyder: hver matrixgruppe får én elev fra hver stamgruppe (eller fra
// hvert emne, når stamgrupperne har emner). Antallet af matrixgrupper er derfor
// den MINDSTE stamgruppe (eller det mindste emne) — kun elever der er til stede
// tæller, som i buildEngineInput (nextEngine.js).
import { topicKey } from './utils.js';

/**
 * Antallet er MOTORENS: den danner én ny matrixgruppe pr. elev i den mindste
 * kilde, og kun af de elever, der ikke står i en låst matrixgruppe. De låste
 * grupper bliver stående og tæller med i det, læreren ser bagefter. Før
 * regnede skønnet uden de låste: med stamgrupper på 5 og 4 og én låst
 * matrixgruppe med en elev fra den store stod der "→ 4 matrixgrupper", og
 * der kom 5 (fundet 13/11 2026 med matrixVsEngine.test.js).
 *
 * @param {Object} p
 * @param {Array}  p.groups      stamgrupperne (storedStandardGroups)
 * @param {Array}  p.data        klassens elevrækker
 * @param {string} p.idCol       id-kolonnen
 * @param {'topic'|'group'} p.repType  bygges matrixen på emner eller grupper
 * @param {(g:Object)=>string} p.storedTopic  gruppens gemte emne (getTopic(g.name, 'S_'))
 * @param {Array}  [p.lockedGroups]  de låste matrixgrupper (bliver stående)
 * @returns {null|{numHomeGroups:number, numGroups:number, avgSize:number,
 *          totalStudents:number, isExact:boolean, usingTopics:boolean,
 *          numTopics:number, repType:string}}
 *          numGroups er ALLE matrixgrupper bagefter (nye + låste), eller 0,
 *          når der ingen nye kan dannes (en kilde uden frie elever);
 *          totalStudents og avgSize gælder de elever, der skal fordeles.
 */
export function fullMatrixInfo({ groups, data, idCol, repType, storedTopic, lockedGroups = [] }) {
    if (!Array.isArray(groups) || groups.length === 0) return null;
    const numHomeGroups = groups.length;
    const memberId = (m) => String((typeof m === 'object' && m !== null) ? (m.id ?? m.name ?? '') : m).trim();

    const lockedIds = new Set();
    (lockedGroups || []).forEach(g => (g?.members || []).forEach(m => lockedIds.add(memberId(m))));
    // De elever, motoren får: til stede og ikke i en låst matrixgruppe.
    const freeIds = new Set(
        (data || [])
            .filter(s => !s._excluded)
            .map(s => String(s[idCol]).trim())
            .filter(id => !lockedIds.has(id))
    );
    const countFree = (g) => g.members.reduce((sum, m) => sum + (freeIds.has(memberId(m)) ? 1 : 0), 0);

    // Alle frie elever fordeles — også en, der ikke står i nogen stamgruppe
    // (tilføjet efter dannelsen). Motoren deler dem alle ud på grupperne.
    const totalStudents = freeIds.size;

    let fresh = 0;
    let usingTopics = false;
    let numTopics = 0;

    if (repType === 'topic') {
        // Object.create(null), ikke {}: nøglen er lærerens eget emnenavn, og
        // et almindeligt objekt arver fx "constructor" — så gav tællingen NaN.
        // "t:"/"g:" foran: en stamgruppe uden emne er sin egen kilde og må
        // ikke falde sammen med et emne, der hedder det samme som gruppen.
        const topicCounts = Object.create(null);
        groups.forEach(g => {
            const stored = storedTopic ? storedTopic(g) : '';
            const topic = (stored && stored.trim().length > 0) ? stored.trim()
                : (g.topic && g.topic.trim().length > 0) ? g.topic.trim() : '';
            // Store og små bogstaver er samme emne (eqTopic i utils.js) —
            // buildEngineInput sender dem til motoren under én stavemåde.
            const key = topic ? 't:' + topicKey(topic) : 'g:' + g.name;
            if (!topicCounts[key]) topicCounts[key] = 0;
            topicCounts[key] += countFree(g);
        });
        const topicValues = Object.values(topicCounts);
        numTopics = topicValues.length;
        usingTopics = numTopics < numHomeGroups;
        fresh = Math.min(...topicValues);
    } else {
        fresh = Math.min(...groups.map(g => countFree(g)));
    }

    const numGroups = fresh > 0 ? fresh + (lockedGroups || []).length : 0;
    const avgSize = fresh > 0 ? Math.round(totalStudents / fresh) : 0;
    const isExact = fresh > 0 && (totalStudents % fresh) === 0;
    return { numHomeGroups, numGroups, avgSize, totalStudents, isExact, usingTopics, numTopics, repType };
}
