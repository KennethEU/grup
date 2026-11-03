// ruleMarks.js — hvad blev opfyldt ved sidste kørsel?
//
// Kenneth spurgte 3/11: "er der et sted, man kan se, hvad der blev opfyldt?"
// Før stod kun det, der IKKE gik op ("Sidste dannelse"). Motoren svarer med
// en linje pr. regel ({ rule, met: true | false | null }, kontrakten 3.5) og
// med beskederne; her bliver det til et lille mærke pr. regel i opskriften og
// "4 af 4 aftaler holdt" ved aftalerne.
//
// Ren omregning uden Vue og uden tilstand, så den kan prøves for sig
// (ruleMarks.test.js). Om mærkerne stadig hører til det, der står på skærmen,
// afgør nextEngine.js (runStatusFor).

import { RULE_TYPES, valueKey } from './utils.js';

/** Regler, motoren giver ét resultat pr. pulje med Opdel (spørgsmål 50). */
const PER_POOL_TYPES = new Set([RULE_TYPES.SEPARATE, RULE_TYPES.STRICT_SEPARATE, RULE_TYPES.CLUSTER, RULE_TYPES.DISTRIBUTE]);

/**
 * Hvor mange Opdel-puljer har input'et? (Kombinationen af alle Opdel-kolonner.)
 * Værdierne sammenlignes som motoren gør (valueKey: mellemrum, tegnform og
 * store/små bogstaver tæller ikke), så "Klima" og "klima" er én pulje.
 */
export function poolCount(input) {
    const columns = (input?.rules || []).filter(r => r.type === RULE_TYPES.AGGREGATE).map(r => r.column);
    if (!columns.length) return 0;
    return new Set((input.students || []).map(s => columns.map(c => valueKey(s[c] ?? '')).join('\u0000'))).size;
}

/**
 * Hvor slemt er et "ikke opfyldt"? Rødt ('fix') kun for det, læreren skal
 * rette; 'best', når alle brud var uundgåelige (eller nok det bedste); ellers
 * 'open' (blå pil — en ny dannelse kan måske gøre det bedre). Fælles for
 * reglerne og aftalerne.
 */
function failureState(messages, severityOf, status) {
    if (messages.some(m => severityOf(m, status) === 'error')) return 'fix';
    const best = messages.length > 0 && messages.every(m => m.unavoidable === true || m.likelyBest === true);
    return best ? 'best' : 'open';
}

/** Halen på teksten, der siger det samme som mærkets farve. */
const STATE_TAIL = { best: ' — det bedst mulige', fix: ' — skal rettes', open: '' };

/**
 * Mærket for én regel.
 *   state 'met'        opfyldt
 *   state 'best'       ikke helt, men det bedst mulige (unavoidable/likelyBest)
 *   state 'open'       ikke opfyldt — en ny dannelse kan måske gøre det bedre
 *   state 'fix'        ikke opfyldt, og det er noget, læreren skal rette (rød)
 *   state 'unmeasured' ikke målt (fx en talregel uden tal)
 * `label` er teksten til skærmlæseren og værktøjstippet.
 */
function markFor(rule, met, messages, pools, severityOf, status) {
    if (met === true) return { state: 'met', label: 'Opfyldt' };
    if (met !== false) return { state: 'unmeasured', label: 'Ikke målt' };
    const state = failureState(messages, severityOf, status);
    const failedPools = new Set(messages.filter(m => m.pool != null).map(m => m.pool)).size;
    if (pools > 1 && failedPools > 0 && PER_POOL_TYPES.has(rule?.type)) {
        return { state, label: `Opfyldt i ${Math.max(0, pools - failedPools)} af ${pools} puljer${STATE_TAIL[state]}`, pools: { met: pools - failedPools, total: pools } };
    }
    if (state === 'best') return { state, label: 'Ikke helt — det bedst mulige' };
    if (state === 'fix') return { state, label: 'Ikke opfyldt — skal rettes' };
    return { state, label: 'Ikke opfyldt' };
}

/**
 * Svaret → mærker pr. regel i klassens liste og status for aftalerne.
 *
 * @param input       det input, motoren fik
 * @param answer      motorens svar ("ok" eller "stopped")
 * @param sources     for hver regel i input: dens plads i klassens liste
 * @param severityOf  nextEngine.severityOf (rød/blå) — sendt med for at
 *                    undgå en import-kreds
 * @returns {{ rules: Object<number, mark>, agreements: { total, broken, brokenIds, mark } }}
 */
export function ruleMarks(input, answer, sources, severityOf) {
    const pools = poolCount(input);
    const messages = answer?.messages || [];
    const rules = {};
    for (const line of answer?.rules || []) {
        const at = sources?.[line.rule];
        if (!Number.isInteger(at)) continue;
        const own = messages.filter(m => m.code === 'rule-not-met' && m.rule === line.rule);
        rules[at] = markFor(input.rules[line.rule], line.met, own, pools, severityOf, answer.status);
    }
    // Aftalerne: Skal sammen brydes aldrig i et svar med grupper (så er det
    // "impossible"). Undgå hinanden giver én rule-not-met pr. brudt aftale og
    // pulje, med aftalens elever (spørgsmål 50).
    // Tælles på de aftaler, motoren fik (to ens Undgå-aftaler er to aftaler,
    // selv om motoren kun sender én besked om dem).
    const together = input?.agreements?.together || [];
    const avoid = input?.agreements?.avoid || [];
    const results = messages.filter(m => m.code === 'rule-not-met' && !Number.isInteger(m.rule) && (m.students || []).length);
    const brokenKeys = new Set(results.map(m => [...m.students].map(String).sort().join(',')));
    const brokenAvoid = avoid.filter(ids => brokenKeys.has([...ids].map(String).sort().join(',')));
    const broken = brokenAvoid.length;
    // Mærket som for en regel (se failureState).
    const state = !broken ? 'met' : failureState(results, severityOf, answer.status);
    const label = !broken ? 'Alle aftaler holdt'
        : `${broken === 1 ? '1 aftale' : `${broken} aftaler`} brudt${STATE_TAIL[state]}`;
    return {
        rules,
        agreements: {
            total: together.length + avoid.length,
            broken,
            brokenIds: [...new Set(brokenAvoid.flat().map(String))],
            mark: { state, label },
        },
    };
}
