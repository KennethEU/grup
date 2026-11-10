// Kvitteringens "Bemærk:"-del efter en gendannelse, når en klasse kom ind,
// men noget af dens indhold ikke gjorde (api.restoreBackup → partial[]).
//
// Før stod der bare "historik kunne ikke gendannes" — også når 3 af 12
// sessioner faktisk kom ind. Det var ikke sandt, og læreren kunne ikke se,
// hvor meget der manglede. Nu nævnes tallet pr. klasse.
//
// Bruges af både backup-gendannelsen (ImportSection.vue) og flytningen fra
// www.dida.dk (adoptWww.js), så de to siger det samme.

/**
 * Én sætningsdel pr. klasse, fx "for 3.a kom kun 3 af de 12 gemte
 * sessioner med" eller "for 3.a kunne emner ikke gendannes".
 *
 * Tallet efter "af" er det, gendannelsen PRØVEDE at skrive — efter de to
 * lofter (50 sessioner, 90 dage), som kvitteringen nævner for sig. Det
 * manglende kan skyldes fuld lagerplads ELLER en session, filen ikke selv
 * havde indholdet til; derfor siger kvitteringen begge dele bagefter.
 *
 * @param {Array<{filename: string, parts: string[], sessionsRestored?: number,
 *   sessionsMissing?: number}>} partial
 * @param {(filename: string) => string} nameOf klassens navn til læreren
 * @returns {string[]} sætningsdele uden stort begyndelsesbogstav og punktum
 */
export function describePartialRestore(partial, nameOf = (f) => f) {
    const notes = [];
    (Array.isArray(partial) ? partial : []).forEach(p => {
        const name = nameOf(p.filename);
        const restored = Number(p.sessionsRestored) || 0;
        const missing = Number(p.sessionsMissing) || 0;
        let parts = Array.isArray(p.parts) ? p.parts : [];

        // Kendes tallene, siger de mere end ordet "historik".
        if (missing > 0) {
            const total = restored + missing;
            if (restored > 0) {
                notes.push(`for ${name} kom kun ${restored} af de ${total} gemte sessioner med`);
            } else if (total === 1) {
                notes.push(`for ${name} kom den gemte session ikke med`);
            } else {
                notes.push(`for ${name} kom ingen af de ${total} gemte sessioner med`);
            }
            parts = parts.filter(part => part !== 'historik');
        }
        if (parts.length > 0) {
            notes.push(`for ${name} kunne ${parts.join(', ')} ikke gendannes`);
        }
    });
    return notes;
}
