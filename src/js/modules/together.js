// Aftaler om bestemte elever. Overlap samles FØR fravær filtreres fra:
// Anna+Bo og Bo+Sara betyder også Anna+Sara den dag Bo er fraværende.
import { ROW_ID, memberIdStr } from './utils.js';

export function mergeTogether(agreements = []) {
    const components = [];
    for (const agreement of agreements) {
        const ids = new Set((agreement?.ids || []).map(id => String(id).trim()).filter(Boolean));
        if (ids.size < 2) continue;
        for (let i = components.length - 1; i >= 0; i--) {
            if (components[i].some(id => ids.has(id))) {
                components[i].forEach(id => ids.add(id));
                components.splice(i, 1);
            }
        }
        components.push([...ids]);
    }
    return components;
}

/**
 * De aftaler, der ikke gør noget længere — og derfor må ryddes op.
 *
 * En "Undgå hinanden" er død, når under to af dens elever står i klassen.
 * En "Skal sammen" er det IKKE nødvendigvis: overlap samles på tværs af
 * aftalerne, også gennem en slettet elev (se togetherComponents nedenfor).
 * Anna+Bo og Bo+Sara holder Anna og Sara sammen, selv når Bo er slettet —
 * og så har hver af de to aftaler kun én elev tilbage i klassen, men fjerner
 * man dem, skilles Anna og Sara. Aftalevinduet kaldte dem "Gælder ikke
 * længere" og tilbød at fjerne dem, mens motoren stadig brugte dem.
 *
 * Reglen her: under to elever i klassen, OG ingen af aftalens slettede
 * elever nævnes i en anden aftale — for kun gennem dem kan den binde noget.
 * Det gør også den samlede oprydning sikker: en død aftales slettede elever
 * står ingen andre steder, så at fjerne den rører ikke de andre.
 *
 * Fraværende elever står stadig i klassen og tæller med.
 *
 * @param {Array<{ids: string[]}>} agreements  klassens Skal sammen-aftaler
 * @param {Array<Object>} classRows            ALLE klassens elevrækker
 * @returns {Set<number>}                      indeks på de døde aftaler
 */
export function deadTogetherIndexes(agreements = [], classRows = []) {
    const inClass = new Set(classRows.map(s => String(s?.[ROW_ID] ?? '').trim()));
    const idsOf = (agreement) => [...new Set((agreement?.ids || [])
        .map(id => String(id).trim()).filter(Boolean))];

    // Hvor mange aftaler nævner hver slettet elev?
    const goneUses = new Map();
    agreements.forEach(agreement => idsOf(agreement).forEach(id => {
        if (!inClass.has(id)) goneUses.set(id, (goneUses.get(id) || 0) + 1);
    }));

    const dead = new Set();
    agreements.forEach((agreement, index) => {
        const ids = idsOf(agreement);
        const stillHere = ids.filter(id => inClass.has(id)).length;
        const bridges = ids.some(id => !inClass.has(id) && goneUses.get(id) > 1);
        if (stillHere < 2 && !bridges) dead.add(index);
    });
    return dead;
}

export function togetherComponents(agreements = [], students = []) {
    const components = mergeTogether(agreements);
    const present = new Set(students.filter(s => !s._excluded).map(s => String(s[ROW_ID])));
    return components.map(ids => ids.filter(id => present.has(id))).filter(ids => ids.length > 1);
}

export function togetherConflict(components, separations = [], lockedGroups = []) {
    for (const ids of components) {
        const members = new Set(ids);
        for (const sep of separations) {
            const inside = [...new Set((sep.ids || []).map(String).filter(id => members.has(id)))];
            if (inside.length > 1) {
                // `pair`: de to elever, aftalerne er uenige om — så en besked kan
                // nævne netop dem i stedet for hele aftalens elever.
                return { ids, pair: [inside[0], inside[1]], reason: 'Eleverne har både en Skal sammen-aftale og en undgåelse. Ret en af aftalerne under Elevliste → Aftaler.' };
            }
        }
        const locks = lockedGroups.filter(g => g.members.some(m => members.has(memberIdStr(m))));
        if (locks.length && (locks.length > 1 || !ids.every(id => locks[0].members.some(m => memberIdStr(m) === id)))) {
            return { ids, reason: 'En Skal sammen-aftale går på tværs af en låst gruppe. Saml eleverne i gruppen, eller lås den op før du danner nye grupper.' };
        }
    }
    return null;
}

// HER lå `togetherRuleConflict()` og `togetherRuleConflictText()`: Skal
// sammen mod en Adskil-regel, tjekket i appen for at give navnene, som den
// gamle motor (Python) ikke kunne. Ingen kaldte dem efter 3/11 2026 — motoren
// i JavaScript finder selv konflikten (`together-vs-separate` i
// motor/engine/feasibility.js) og siger navnene (messages.js). Fjernet i
// 165. gennemsyn, så ingen tror, at tjekket stadig kører her.

export function brokenTogether(groups, agreements, students) {
    if (!groups?.length) return [];
    const locations = new Map();
    groups.forEach((g, index) => g.members.forEach(m => locations.set(memberIdStr(m), index)));
    return togetherComponents(agreements, students).filter(ids =>
        ids.some(id => !locations.has(id)) || new Set(ids.map(id => locations.get(id))).size > 1);
}

/**
 * Hvem binder to elever sammen gennem Skal sammen-aftalerne? Svaret er de
 * elever MELLEM dem på den korteste vej ([] = de står i samme aftale, `null` =
 * ingen vej). Bruges til at sige "Anna og Emil skal sammen via Mads" i stedet
 * for at nævne alle aftalens elever.
 */
export function togetherPath(agreements = [], from, to) {
    const a = String(from), b = String(to);
    const neighbours = new Map();
    for (const agreement of agreements) {
        const ids = [...new Set((agreement?.ids || []).map(id => String(id).trim()).filter(Boolean))];
        for (const x of ids) {
            if (!neighbours.has(x)) neighbours.set(x, new Set());
            ids.forEach(y => { if (y !== x) neighbours.get(x).add(y); });
        }
    }
    const previous = new Map([[a, null]]);
    const queue = [a];
    while (queue.length) {
        const here = queue.shift();
        if (here === b) {
            const middle = [];
            for (let at = previous.get(b); at !== null && at !== a; at = previous.get(at)) middle.unshift(at);
            return middle;
        }
        for (const next of neighbours.get(here) || []) {
            if (!previous.has(next)) { previous.set(next, here); queue.push(next); }
        }
    }
    return null;
}
