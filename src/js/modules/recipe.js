// Opskriften i beta (grup.dk/beta): klassens indstillinger og regler læst
// som danske sætninger.
//
// Filen ÆNDRER ingenting. Den oversætter kun det, der allerede står i
// klassen (`settings`, `rules`, `togetherGroups`, `separations`, `topics`),
// til sætningsdele, som RecipePanel tegner. Selve ændringerne sker de samme
// steder som i den almindelige Grupper — så motoren får præcis det samme,
// uanset hvilken skærm læreren bruger.
//
// En sætningsdel er enten almindelig tekst `{ text }` eller et ord, man kan
// klikke på `{ token, text, missing }`. `token` siger, hvad ordet ændrer:
// 'type' (regeltypen), 'column' (kolonnen) eller 'value' (værdien).

import { RULE_TYPES, RULE_OPTIONS, RULES_WITHOUT_VALUES, columnIsNumeric, rankingAffectsColumn, valueKey, canonicalSpellings, computeTopicAdjustedTarget, setupSignature } from './utils.js';

/** Navnet på regeltypen — det samme ord som i den almindelige regelmenu. */
export function ruleTypeLabel(type) {
    if (type === RULE_TYPES.STRICT_SEPARATE) return 'Adskil altid';
    return RULE_OPTIONS.find(o => o.value === type)?.label || 'Regel';
}

// Tegnsætning lige efter et ord ("7 grupper ." / "9-9 grupper , så") må ikke
// stå med mellemrum: ordets bagkant har selv polstring, og punktummet fik den
// oveni. `punct` siger til tegningen, at delen skal rykkes ind til ordet.
const t = (text) => (/^[.,;:!?]/.test(text) ? { text, punct: true } : { text });
const tok = (token, text, missing = false) => ({ token, text, missing });

/**
 * Én regel som en sætning.
 *
 * Mangler kolonnen (eller værdien på Adskil), står der en pladsholder, der er
 * markeret som manglende — så læreren kan se, at linjen ikke gør noget endnu.
 *
 * Med `context` ({ columns, rows }) tjekkes det også, om kolonnen og værdien
 * STADIG findes i klassen. En regel
 * kan pege på noget, der er slettet siden (hentet tilbage fra en ældre kørsel),
 * og så meldte motoren "findes ikke", mens linjen så helt almindelig ud.
 * Værdien sammenlignes uden hensyn til store/små bogstaver (valueKey), som
 * motoren gør det.
 */
export function ruleSentence(rule, context = null) {
    const type = rule?.type;
    const col = String(rule?.column ?? '').trim();
    const val = String(rule?.value ?? '').trim();
    const typeTok = tok('type', ruleTypeLabel(type));
    const colGone = !!col && !!context && !(context.columns || []).includes(col);
    const valGone = !!val && !!context && !RULES_WITHOUT_VALUES.includes(type)
        && !ruleValueExists(context.rows, col, val);
    const colTok = tok('column', col ? (colGone ? `${col} (findes ikke)` : col) : 'vælg kolonne', !col || colGone);
    const valTok = tok('value', val ? (valGone ? `${val} (findes ikke)` : val) : 'vælg værdi', !val || valGone);

    switch (type) {
        case RULE_TYPES.DISTRIBUTE:
            return [typeTok, t(' '), colTok, t(' jævnt i grupperne.')];
        case RULE_TYPES.SEPARATE:
        case RULE_TYPES.STRICT_SEPARATE:
            return [typeTok, t(' elever med '), valTok, t(' i '), colTok, t(', så højst én er i hver gruppe.')];
        case RULE_TYPES.MINIMIZEDIFF:
            return [typeTok, t(' grupper efter '), colTok, t(' — hver gruppe så ens som muligt.')];
        case RULE_TYPES.BALANCE:
            return [typeTok, t(' '), colTok, t(', så grupperne får samme gennemsnit.')];
        case RULE_TYPES.CLUSTER:
            return [typeTok, t(' '), colTok, t(', så ingen står alene med sin værdi.')];
        case RULE_TYPES.GROUP_SORT:
            return [typeTok, t(' elever med samme '), colTok, t(', hvis det kan lade sig gøre.')];
        case RULE_TYPES.AGGREGATE:
            return [typeTok, t(' klassen efter '), colTok, t(' før resten af opskriften.')];
        default:
            return [typeTok, t(' '), colTok, t('.')];
    }
}

/** Findes værdien i kolonnen (uden hensyn til store/små bogstaver)? */
export function ruleValueExists(rows, column, value) {
    // Kortets nøgler ER valueKey() af cellerne, så ét opslag er nok.
    return !!column && canonicalSpellings(rows, column).has(valueKey(value));
}

/**
 * Er der allerede en TVILLING af reglen i en anden linje? To ens linjer gør
 * intet ekstra (hints.js advarer om netop det). Ens = samme type, samme kolonne
 * og — for de typer der bruger en værdi (Adskil) — samme værdi. "Adskil
 * Rolle=Leder" og "Adskil Rolle=Kasserer" er to forskellige regler og begge
 * lovlige. Returnerer indekset på tvillingen, eller -1.
 */
export function findTwinRule(rules, type, column, value, index) {
    if (!type || !column) return -1;
    const takesValue = !RULES_WITHOUT_VALUES.includes(type);
    const key = valueKey(String(value ?? '').trim());
    return rules.findIndex((r, i) => i !== index && r?.type === type && r?.column === column
        && (!takesValue || valueKey(String(r?.value ?? '').trim()) === key));
}

/** Mangler regeln noget, før den kan bruges? */
export function ruleIsIncomplete(rule) {
    if (!String(rule?.column ?? '').trim()) return true;
    const needsValue = rule?.type === RULE_TYPES.SEPARATE || rule?.type === RULE_TYPES.STRICT_SEPARATE;
    return needsValue && !String(rule?.value ?? '').trim();
}

/**
 * Første linje: hvor store grupperne skal være.
 *
 * `mode` 'size' = elever pr. gruppe, 'number' = antal grupper. `mod` '+' eller
 * '-' gælder kun ved størrelse: går klassen ikke op, får nogle grupper én elev
 * mere ('+') eller én mindre ('-').
 */
export function sizeSentence({ mode = 'size', target = 4, mod = '+' } = {}) {
    const n = Number(target) || 1;
    if (mode === 'number') {
        return [t('Dan '), tok('size', `${n} ${n === 1 ? 'gruppe' : 'grupper'}`), t('.')];
    }
    return [
        t('Dan grupper på '), tok('size', `${n} ${n === 1 ? 'elev' : 'elever'}`),
        t('. Går det ikke op, får nogle grupper '),
        tok('mod', mod === '-' ? 'én elev mindre' : 'én elev ekstra'),
        t('.'),
    ];
}

/**
 * En note fra hints.js under størrelses-linjen, i opskriftens ord.
 * Noterne er skrevet til den almindelige opsætning, hvor man trykker "+1"
 * eller "-1". I opskriften hedder det samme valg "én elev ekstra" / "én elev
 * mindre" (ordet i linje 1), så der står ikke en knap, der ikke findes.
 */
export function recipeHintText(text) {
    return String(text ?? '')
        .replace(/tryk "([+-])1"/g,
            (_, sign) => `vælg "${sign === '-' ? 'én elev mindre' : 'én elev ekstra'}"`)
        // Antal-tilstand: "… og begrænser matrix. Brug 9 grupper for ligelig
        // fordeling." Under stamgrupperne er matrix ikke i spil endnu — det
        // der tæller, er at hvert emne får lige mange grupper.
        .replace(/ og begrænser matrix\. Brug /, '. Brug ')
        .replace(/ for ligelig fordeling\./, ', så hvert emne får lige mange.');
}

/** Navne på eleverne i en aftale, som "Emma og Noah" / "Emma, Ida og Noah". */
export function namesText(names) {
    const list = names.filter(Boolean);
    if (list.length <= 1) return list[0] || '';
    return list.slice(0, -1).join(', ') + ' og ' + list[list.length - 1];
}

/**
 * Den korte udgave, når opskriften er klappet sammen:
 * "4 pr. gruppe · 3 regler · 2 aftaler · 5 emner".
 */
export function recipeSummary({ mode = 'size', target = 4, rules = [], together = 0, separations = 0, topics = 0 } = {}) {
    const n = Number(target) || 1;
    const parts = [mode === 'number' ? `${n} ${n === 1 ? 'gruppe' : 'grupper'}` : `${n} pr. gruppe`];
    const used = rules.filter(r => !ruleIsIncomplete(r)).length;
    if (used) parts.push(`${used} ${used === 1 ? 'regel' : 'regler'}`);
    const agreements = together + separations;
    if (agreements) parts.push(`${agreements} ${agreements === 1 ? 'aftale' : 'aftaler'}`);
    if (topics) parts.push(`${topics} ${topics === 1 ? 'emne' : 'emner'}`);
    return parts.join(' · ');
}

// ─── Ændringer i regellisten ────────────────────────────────────────────────
// Der kan kun være ÉN "Opdel", og den ligger altid øverst, fordi motoren deler klassen op
// før alle andre regler. Funktionerne ændrer listen på stedet (den er klassens
// egen `rules`), og kalderen gemmer bagefter.

export const ONLY_ONE_AGGREGATE =
    'Der kan kun være én "Opdel". Den deler klassen i puljer, og alle ' +
    'de andre regler arbejder inde i puljerne — to opdelinger på én ' +
    'gang findes der ikke. Skal du dele efter to ting, så lav en ' +
    'kolonne der kombinerer dem (fx "A-drenge", "A-piger", "B-drenge") ' +
    'og opdel efter den.';

const isAggregate = (r) => r?.type === RULE_TYPES.AGGREGATE;

/** Ny regel nederst: "Fordel [vælg kolonne] jævnt i grupperne." */
export function addRule(rules) {
    rules.push({ type: RULE_TYPES.DISTRIBUTE, column: '', value: '' });
    return rules.length - 1;
}

/**
 * Ret ét felt i en regel. Skiftes typen til en uden værdi, eller skiftes
 * kolonnen, tømmes værdien — ligesom i regelmenuen. Returnerer en fejltekst,
 * hvis ændringen ikke må laves (en anden "Opdel"), ellers null.
 */
export function updateRuleField(rules, index, field, value) {
    const rule = rules[index];
    if (!rule) return null;
    if (field === 'type' && value === RULE_TYPES.AGGREGATE && !isAggregate(rule)
        && rules.some(isAggregate)) {
        return ONLY_ONE_AGGREGATE;
    }
    const next = { ...rule, [field]: value };
    if (field === 'type' && RULES_WITHOUT_VALUES.includes(value)) next.value = '';
    if (field === 'column' && value !== rule.column) next.value = '';
    Object.assign(rule, next);
    // Blev den en Opdel, løftes den op øverst — listen skal vise det motoren gør.
    if (field === 'type' && value === RULE_TYPES.AGGREGATE && index > 0) {
        const [moved] = rules.splice(index, 1);
        rules.unshift(moved);
    }
    return null;
}

export function deleteRule(rules, index) {
    if (index < 0 || index >= rules.length) return false;
    rules.splice(index, 1);
    return true;
}

// ─── Runde 2: matrix ────────────────────────────────────────────────────────
// Matrixgrupper blander stamgrupperne. Første linje siger hvordan:
//   "Fuld"     (full_strict): hver ny gruppe får én fra hver stamgruppe/emne
//   "Størrelse" (size):       grupper på N elever (+ afrunding)
//   "Antal"     (count):      N grupper
// Samme indstillinger som den almindelige matrix-opsætning (matrixSettings).

/** Ordet man klikker på i matrix-linjen. */
export function matrixMixText({ strategy = 'full_strict', repType = 'group', target = 4 } = {}) {
    const n = Number(target) || 1;
    if (strategy === 'size') return `til grupper på ${n} ${n === 1 ? 'elev' : 'elever'}`;
    if (strategy === 'count') return `til ${n} ${n === 1 ? 'gruppe' : 'grupper'}`;
    return repType === 'topic' ? 'helt — én fra hvert emne' : 'helt — én fra hver stamgruppe';
}

export function matrixSentence({ strategy = 'full_strict', repType = 'group', target = 4, mod = '+' } = {}) {
    const parts = [t('Bland stamgrupperne '), tok('mix', matrixMixText({ strategy, repType, target }))];
    if (strategy === 'size') {
        parts.push(t('. Går det ikke op, får nogle grupper '), tok('mod', mod === '-' ? 'én elev mindre' : 'én elev ekstra'));
    }
    parts.push(t('.'));
    return parts;
}

/** Den korte udgave af matrix-runden, når opskriften er klappet sammen. */
export function matrixSummary({ strategy = 'full_strict', repType = 'group', target = 4, rules = [] } = {}) {
    const n = Number(target) || 1;
    const first = strategy === 'size' ? `${n} pr. gruppe`
        : strategy === 'count' ? `${n} ${n === 1 ? 'gruppe' : 'grupper'}`
        : (repType === 'topic' ? 'én fra hvert emne' : 'én fra hver stamgruppe');
    const used = rules.filter(r => !ruleIsIncomplete(r)).length;
    return used ? `${first} · ${used} ${used === 1 ? 'regel' : 'regler'}` : first;
}

// ─── Passer kolonnen til reglen? ────────────────────────────────────────────
// Opskriften skal ikke lade læreren vælge noget, der ikke kan virke, og så
// advare bagefter. Derfor spørger menuerne her først:
//   - Ensartede og Balancér kan kun regne med tal. En tekstkolonne kan bruges,
//     når værdierne er rangeret (Lav < Middel < Høj) — samme regel som
//     advarslen i hints.js (rankingAffectsColumn).
//   - En kolonne, hvor ALLE elever har hver sin værdi (fx navnet), kan ikke
//     fordele, samle, klynge, opdele eller adskille noget.
//   - En tom kolonne kan ingenting.

const NUMBER_TYPES = new Set([RULE_TYPES.BALANCE, RULE_TYPES.MINIMIZEDIFF]);

/**
 * @returns {{ ok: boolean, reason: ''|'tom'|'tekst'|'unik', note: string }}
 */
export function columnFitness(rows, column, type, columnOrders = {}) {
    const fine = { ok: true, reason: '', note: '' };
    if (!column || !Array.isArray(rows) || !rows.length) return fine;
    const filled = rows.map(r => String(r?.[column] ?? '').trim()).filter(Boolean);
    if (!filled.length) return { ok: false, reason: 'tom', note: 'kolonnen er tom' };
    if (NUMBER_TYPES.has(type)) {
        if (columnIsNumeric(rows, column) || rankingAffectsColumn(rows, column, columnOrders?.[column])) return fine;
        return { ok: false, reason: 'tekst', note: 'tekst — ranger værdierne først' };
    }
    const distinct = new Set(filled.map(valueKey)).size;
    if (filled.length > 3 && distinct === filled.length) {
        return { ok: false, reason: 'unik', note: 'alle har hver sin værdi' };
    }
    return fine;
}

// ─── Hvor mange grupper giver størrelsen? ───────────────────────────────────
// Samme regnestykke som motoren:
//   "én elev ekstra" ('+'): ned-afrunding, men en gruppe mere, hvis den største
//                           ellers ville blive over målet + 1.
//   "én elev mindre" ('-'): op-afrunding.
// Har klassen emner, afrundes der yderligere til et multiplum af antal
// emner — det regnes af den SAMME hjælper (computeTopicAdjustedTarget),
// så skønnet og den dannede klasse ikke kan sige hver sit tal.

/**
 * @param {{ mode: 'size'|'number', target: number, mod: '+'|'-', students: number,
 *           lockedGroups?: number, topicCount?: number }} o
 *        students = tilstedeværende elever UDEN for låste grupper
 * @returns {number} antal NYE grupper (de låste kommer oveni)
 */
export function expectedNewGroups({ mode = 'size', target = 4, mod = '+', students = 0, lockedGroups = 0, topicCount = 0 } = {}) {
    const n = Math.max(0, Math.floor(students));
    const t = Math.max(1, Math.floor(Number(target) || 1));
    if (n <= 0) return 0;
    if (topicCount > 0) {
        const adj = computeTopicAdjustedTarget({
            mode, sizeNum: t, sizeMod: mod === '-' ? '-' : '+',
            numberTarget: mode === 'number' ? t : 0,
            studentCount: n, lockedCount: lockedGroups, topicCount,
        });
        if (adj) return adj.adjustedNew;
    }
    // Motoren kan aldrig danne flere grupper end der er elever.
    if (mode === 'number') return Math.min(n, Math.max(1, t - lockedGroups));
    if (mod === '-') return Math.min(n, Math.ceil(n / t));
    let groups = Math.max(1, Math.floor(n / t));
    if (Math.ceil(n / groups) > t + 1 && groups < n) groups += 1;
    return groups;
}

/**
 * "ca. 9,3 elever pr. gruppe" — skønnet i antal-tilstand. Kommaet sættes i
 * TALLET alene: et `.replace('.', ',')` på hele teksten ramte punktummet i
 * "ca." først og gav "ca, 9.3 elever".
 */
export function perGroupEstimate(students, groups) {
    const n = Number(students) || 0;
    const g = Math.max(1, Number(groups) || 1);
    if (n <= 0) return '';
    const per = Math.round((n / g) * 10) / 10;
    return `ca. ${String(per).replace('.', ',')} ${per === 1 ? 'elev' : 'elever'} pr. gruppe`;
}

/**
 * Antal/størrelse som det gemmes og dannes på: altid et helt tal mellem 1 og
 * 999. Feltet må stå tomt et øjeblik, mens læreren taster — så bliver det 1.
 */
export function clampTarget(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, 999);
}

/**
 * Taster læreren i et felt UDEN for opskriftens vindue? Så hører ⌘/Ctrl+Enter
 * til feltet. Felter inde i `.recipe-dialog` (fx antal elever) tæller ikke.
 */
export function typingOutsideRecipe(target) {
    if (!target || typeof target.closest !== 'function') return false;
    const field = target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
    return !!field && !field.closest('.recipe-dialog');
}

// ─── Hvor hører en advarsel hjemme? ─────────────────────────────────────────
// hints.js laver de advarsler, der står i banneret over grupperne. I beta er
// gruppeopskriften stedet, hvor alt om DANNELSEN besluttes, så advarsler om
// opsætningen (regler der modsiger hinanden, mangler en værdi, ikke kan gå op,
// eller som en aftale begrænser) står i opskriften — før man trykker Dan
// grupper. Under arket bliver kun det, der handler om de grupper, der står
// der: elever uden navn, en undgåelse brudt ved en flytning, en forældet matrix.
const RECIPE_HINT_PREFIXES = [
    'conflict:', 'feasibility:', 'hint:no-value:', 'hint:non-numeric:',
    'hint:together:', 'hint:together-cost:',
    // Motorens check() — se engineCheckHints i hints.js.
    'engine:',
];

/**
 * "Sidste dannelse": noterne fra sidste kørsel — men kun mens opsætningen
 * stadig er den, kørslen blev lavet med. Har læreren ændret en regel, en
 * størrelse eller en aftale siden, handler noterne om en anden opskrift: de
 * vises ikke og tælles ikke med i bjælkens "N advarsler".
 */
export function currentLastNotes(notices, cls, isMatrix = false, groupMode = 'size') {
    const view = isMatrix ? 'matrix' : 'standard';
    const list = notices?.last?.[view] || [];
    if (!list.length) return [];
    const signature = notices.lastSignature?.[view];
    return signature && signature === setupSignature(cls, isMatrix, groupMode) ? list : [];
}

/** Hører advarslen til opsætningen (gruppeopskriften) frem for resultatet? */
export function isRecipeHint(hint) {
    const id = String(hint?.id ?? '');
    return RECIPE_HINT_PREFIXES.some(p => id.startsWith(p));
}

// ─── Reglerne i den rækkefølge, motoren bruger ──────────────────────────────
// Motoren ordner reglerne i trin efter type: Opdel deler klassen op først, så
// vejer "Adskil altid", Klyng og Adskil tungt, og Fordel/Balancér/Ensartede er
// mål, der viger for dem; Saml er det letteste mål. Samme trin som
// RULE_WEIGHT_NOTES. Opskriften viser dem i DEN rækkefølge med en lille
// overskrift pr. trin, så læreren kan se prioriteringen i stedet for at læse
// sig til den. Inden for et trin er rækkefølgen lærerens (se nedenfor).
export const RULE_TIERS = Object.freeze([
    { id: 'split', label: 'Deles op først', types: [RULE_TYPES.AGGREGATE] },
    { id: 'strict', label: 'Brydes kun, hvis intet andet er muligt', types: [RULE_TYPES.STRICT_SEPARATE] },
    { id: 'heavy', label: 'Vejer tungt', types: [RULE_TYPES.CLUSTER, RULE_TYPES.SEPARATE] },
    { id: 'goal', label: 'Mål', types: [RULE_TYPES.DISTRIBUTE, RULE_TYPES.BALANCE, RULE_TYPES.MINIMIZEDIFF] },
    { id: 'light', label: 'Hvis det kan lade sig gøre', types: [RULE_TYPES.GROUP_SORT] },
]);

function tierOf(type) {
    const at = RULE_TIERS.findIndex(t => t.types.includes(type));
    return at < 0 ? RULE_TIERS.findIndex(t => t.id === 'goal') : at;
}

/**
 * Linjerne i den rækkefølge, de skal vises. Hver linje husker sin plads i den
 * gemte liste (`index`), så ændringer stadig rammer den rigtige regel.
 * Sorteret efter trin (stabilt: inden for et trin som i listen), og
 * `heading` er sat på den første linje i hvert trin.
 */
export function ruleDisplayOrder(rules) {
    const list = (rules || []).map((rule, index) => ({ rule, index }));
    const sorted = list
        .map(x => ({ ...x, tierAt: tierOf(x.rule?.type) }))
        .sort((a, b) => a.tierAt - b.tierAt || a.index - b.index);
    let prev = -1;
    return sorted.map(({ rule, index, tierAt }) => {
        const heading = tierAt !== prev ? RULE_TIERS[tierAt].label : '';
        prev = tierAt;
        return { rule, index, tier: RULE_TIERS[tierAt].id, heading };
    });
}

// ─── Rækkefølgen inden for et trin ──────────────────────────────────────────
// INDEN FOR et trin er rækkefølgen lærerens prioritering (Kenneths svar 1–3
// til motorens side):
// de tunge (Adskil, Klyng) sammenlignes i opskriftens rækkefølge, og den
// øverste vinder altid; målene (Fordel, Balancér, Ensartede) vægtes trinvist,
// den øverste mest. Adskil altid står altid først, Saml altid sidst. Opdel
// er der kun én af. En flytning på tværs af trin gør intet, så den findes ikke.

/** Trinnets id for en regeltype ('strict', 'heavy', 'goal' …). */
export function ruleTier(type) {
    return RULE_TIERS[tierOf(type)].id;
}

/** Kan reglerne i dette trin byttes om? (Opdel er der kun én af.) */
export function tierIsOrdered(tier) {
    return tier !== 'split';
}

/** Pladserne i listen for reglerne i samme trin som `index`, i rækkefølge. */
export function tierPositions(rules, index) {
    const tier = ruleTier(rules[index]?.type);
    return (rules || []).map((r, i) => (ruleTier(r?.type) === tier ? i : -1)).filter(i => i >= 0);
}

/**
 * Pil op/ned: byt plads med naboen i SAMME trin (ikke
 * nødvendigvis naboen i listen). De andre regler bliver, hvor de er.
 * Svarer med reglens nye plads, eller -1, når den ikke kan flytte.
 */
export function moveRuleInTier(rules, index, delta) {
    if (!tierIsOrdered(ruleTier(rules[index]?.type))) return -1;
    const positions = tierPositions(rules, index);
    const target = positions[positions.indexOf(index) + delta];
    if (target === undefined) return -1;
    const moved = rules[index];
    rules.splice(index, 1, rules[target]);
    rules.splice(target, 1, moved);
    return target;
}

/**
 * Træk-og-slip: læg trinnets regler tilbage på trinnets
 * pladser i listen i den nye rækkefølge (`ordered`). Reglerne i de andre
 * trin rører sig ikke.
 */
export function setTierOrder(rules, positions, ordered) {
    positions.forEach((at, k) => { if (rules[at] !== ordered[k]) rules.splice(at, 1, ordered[k]); });
}

/**
 * Efter "+ Tilføj regel": rul den nye regel frem i vinduet og sæt fokus på
 * dens første ord. Knappen står i vinduets bund, og med mange regler kom den
 * nye linje ellers ind et sted, man ikke kunne se. Reglerne står i motorens
 * rækkefølge, så den nye er ikke altid nederst — den findes på sit indeks.
 */
export function revealRule(index) {
    const row = document.querySelector(`.recipe-dialog [data-rule-index="${index}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    row.querySelector('button')?.focus({ preventScroll: true });
}
