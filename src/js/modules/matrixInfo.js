// Hvor mange matrixgrupper giver "Fuld" blanding — og hvor store bliver de?
//
// Bruges af matrix-opskriften (MatrixRecipePanel) til skønnet over, hvor
// mange matrixgrupper der bliver. Ren funktion: alt den skal bruge, får den med.
//
// "Fuld" betyder: hver matrixgruppe får én elev fra hver stamgruppe (eller fra
// hvert emne, når stamgrupperne har emner). Antallet af matrixgrupper er derfor
// den MINDSTE stamgruppe (eller det mindste emne) — kun elever der er til stede
// tæller, som i generation.js.

/**
 * @param {Object} p
 * @param {Array}  p.groups      stamgrupperne (storedStandardGroups)
 * @param {Array}  p.data        klassens elevrækker
 * @param {string} p.idCol       id-kolonnen
 * @param {'topic'|'group'} p.repType  bygges matrixen på emner eller grupper
 * @param {(g:Object)=>string} p.storedTopic  gruppens gemte emne (getTopic(g.name, 'S_'))
 * @returns {null|{numHomeGroups:number, numGroups:number, avgSize:number,
 *          totalStudents:number, isExact:boolean, usingTopics:boolean,
 *          numTopics:number, repType:string}}
 */
export function fullMatrixInfo({ groups, data, idCol, repType, storedTopic }) {
    if (!Array.isArray(groups) || groups.length === 0) return null;
    const numHomeGroups = groups.length;

    const presentIds = new Set(
        (data || [])
            .filter(s => !s._excluded)
            .map(s => String(s[idCol]).trim())
    );
    const countPresent = (g) => g.members.reduce((sum, m) => {
        const memId = (typeof m === 'object' && m !== null) ? (m.id ?? m.name ?? '') : m;
        return sum + (presentIds.has(String(memId).trim()) ? 1 : 0);
    }, 0);

    const totalStudents = groups.reduce((sum, g) => sum + countPresent(g), 0);

    let numGroups = 0;
    let usingTopics = false;
    let numTopics = 0;

    if (repType === 'topic') {
        // Object.create(null), ikke {}: nøglen er lærerens eget emnenavn, og
        // et almindeligt objekt arver fx "constructor" — så gav tællingen NaN.
        const topicCounts = Object.create(null);
        groups.forEach(g => {
            const stored = storedTopic ? storedTopic(g) : '';
            const rawTopic = (stored && stored.trim().length > 0) ? stored.trim()
                : (g.topic && g.topic.trim().length > 0) ? g.topic.trim() : g.name;
            const key = rawTopic.toLowerCase();
            if (!topicCounts[key]) topicCounts[key] = 0;
            topicCounts[key] += countPresent(g);
        });
        const topicValues = Object.values(topicCounts);
        numTopics = topicValues.length;
        usingTopics = numTopics < numHomeGroups;
        numGroups = Math.min(...topicValues);
    } else {
        numGroups = Math.min(...groups.map(g => countPresent(g)));
    }

    const avgSize = numGroups > 0 ? Math.round(totalStudents / numGroups) : 0;
    const isExact = numGroups > 0 && (totalStudents % numGroups) === 0;
    return { numHomeGroups, numGroups, avgSize, totalStudents, isExact, usingTopics, numTopics, repType };
}
