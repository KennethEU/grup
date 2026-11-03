// lookups.js — de opslagskort gruppekortene tegner ud fra.
//
// HVORFOR DE FINDES: et gruppemedlem bæres rundt som `_rowId`, og alt hvad der
// skal STÅ på kortet — navnet, fraværs-markeringen, regel-tags, oprindelsen i
// stamgruppen — kræver et opslag i elevlisten. Skabelonen spurgte seks gange
// pr. elev pr. gennemtegning, og hvert spørgsmål var en gennemløbning af HELE
// elevlisten. Målt i browseren (300 elever, 75 kort, to regler): et skift af
// visningskolonne tegnede alle kort om på 48,5 ms og en tilføjet elevrække på
// 53,7 ms — tre-fire tabte billeder, hver gang. Med kortene her er svaret ét
// Map-opslag, og de samme to handlinger tager 7,6 og 3,5 ms.
//
// De er `computed`, ikke almindelige funktioner: Vue genberegner dem KUN når
// det de læser har ændret sig, og alle kortene deler samme resultat. Bemærk at
// et kort så kun afhænger af SINE EGNE elevers rækker — før afhang hvert kort
// af hver eneste elev i klassen, fordi `.find()` rørte dem alle.
//
// Ligger for sig selv (ikke i utils.js), fordi utils.js med vilje er fri for
// både Vue og state — det er dét, der gør den brugbar fra klasse-lageret
// (py_bridge.js) og fra de gamle JS-moduler uden cirkulære imports.

import { computed } from 'vue';
import { state } from './state.js';
import { buildStudentIndex, memberIdStr, brokenSeparations } from './utils.js';
import { getTopic } from './storage.js';

/** _rowId → elevrække for den klasse, der er åben. */
export const studentById = computed(() => buildStudentIndex(state.currentClass?.data));

/**
 * _rowId → hvad eleven skal have stemplet som oprindelse i Matrix-visningen:
 * stamgruppens emne, ellers dens navn.
 *
 * Før blev ALLE stamgrupper gennemløbet pr. elev pr. gennemtegning — en
 * gruppe fandt sin egen elev efter i snit halvdelen af klassen, og det ganget
 * med antallet af elever er kvadratet på holdets størrelse.
 *
 * BEMÆRK `const topic = sg.topic`: den læses ubetinget, også når emne-kortet i
 * lageret allerede svarede. Vue husker kun de felter, der faktisk blev læst,
 * og hver eneste vej der ændrer et emne (emne-bytte, generering, historik,
 * gendannelse) sætter `g.topic` på de gemte grupper. Læste vi den kun i
 * else-grenen, ville kortet ikke opdage ændringen, og badget blev stående med
 * det gamle emne.
 */
export const homeGroupOriginById = computed(() => {
    const map = new Map();
    for (const sg of state.storedStandardGroups || []) {
        if (!sg) continue;
        const topic = sg.topic;
        const stored = getTopic(sg.name, 'S_');
        const origin = (stored && stored.trim()) ? stored.trim()
            : (topic && String(topic).trim()) ? String(topic).trim()
                : sg.name;
        for (const m of sg.members || []) {
            const id = memberIdStr(m);
            // Første stamgruppe vinder — samme svar som den `break`, det
            // tidligere gennemløb lavede, hvis en elev stod to steder.
            if (id && !map.has(id)) map.set(id, origin);
        }
    }
    return map;
});

/**
 * De elever der lige nu sidder sammen med én, de skulle undgå — som
 * `_rowId`, delt op efter visning.
 *
 * HVORFOR ET KORT OG IKKE ET OPSLAG PR. ELEV: gruppekortene tegner hver
 * eneste elev, og et tjek pr. elev ville løbe hele undgåelses-listen igennem
 * for hver eneste af dem. Sættet bygges én gang og deles af alle kortene —
 * samme disciplin som `studentById` ovenfor.
 *
 * Begge visninger regnes ud, ikke bare den aktive: kortene kender selv deres
 * `variant`, og så kan et matrixkort ikke komme til at læse stamgruppernes
 * svar (eller omvendt) i det øjeblik visningen skifter.
 */
export const avoidConflictIds = computed(() => {
    const cls = state.currentClass;
    const empty = { standard: new Set(), matrix: new Set() };
    if (!cls || !Array.isArray(cls.separations) || cls.separations.length === 0) return empty;

    const byId = studentById.value;
    const collect = (groups) => {
        const out = new Set();
        for (const breach of brokenSeparations(groups, cls.separations, byId)) {
            for (const id of breach.ids) out.add(id);
        }
        return out;
    };
    return {
        standard: collect(state.storedStandardGroups),
        matrix: collect(state.storedMatrixGroups),
    };
});
