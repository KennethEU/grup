import { brokenTogether, togetherComponents } from './together.js';
// hints.js — beregningen af de kontekstuelle beskeder, ÉT sted.
//
// HVORFOR DEN LIGGER FOR SIG: beskederne vises nu tre steder, og de skal
// komme fra den samme kilde:
//   1. et banner over grupperne — kun de RØDE (kind: 'conflict')
//   2. en markering på den knap, beskeden handler om (anchor)
//   3. en "Bemærk N"-pille i båndet — resten
//
// Lå beregningen stadig inde i HintsStack.vue, skulle indstillingsbåndet enten
// importere en komponent for at læse dens tal, eller regne det samme ud igen.
// Det sidste er præcis den fejl, resten af værktøjet er bygget for at undgå:
// to steder der siger næsten det samme om den samme regel.
//
// Modul-niveau, ikke en composable-funktion: der ER kun én klasse på skærmen
// ad gangen, og alle computeds læser den samme reactiveState. En funktion
// ville lave et nyt sæt pr. kaldsted — altså flere kilder igen.

import { computed, ref, toRaw, watch } from 'vue';
import { reactiveState as state } from './reactiveState.js';
import { modalActions } from './modalState.js';
import { computeTopicAdjustedTarget, plannedNewGroups, poolSizesFor, suggestTopicMultiple, splitByLockedGroups, homeGroupFingerprint, columnIsNumeric, cellNumber,
    brokenSeparations, memberDisplayName, memberIdStr, groupDisplayName, groupCountText, rankingAffectsColumn, rankSteps, valueKey, MATRIX_EXCLUDED_RULES } from './utils.js';
import { ruleTypeLabel, namesText } from './recipe.js';
import { setupNotices } from './setupNotices.js';
import { trialNotes } from './trialRun.js';
import { studentById } from './lookups.js';
import { generateMatrixGroups, generateWithoutTogether } from './generation.js';
import { autoSave } from './classActions.js';
import { engineRowSplit, engineTogetherStop, provideRecipeHintIds, engineCheck, coveredByRecipeHint, issueKey, severityOf, fillMessageText, replacedByResult, isTogetherStop, ruleSources, shownLastNotes } from './nextEngine.js';


// Hvilke beskeder læreren selv har klikket væk i denne session.
const dismissedIds = ref(new Set());
function dismiss(id) {
    dismissedIds.value = new Set([...dismissedIds.value, id]);
}

// Vis Skal sammen-advarslen igen, også hvis læreren har lukket den: når Dan
// grupper stopper på en aftale, ER advarslen forklaringen og har knapperne, så
// den må ikke være væk netop dér — hverken i opskriften (motorens check(),
// "engine:together:") eller over grupperne ("hint:engine-together:").
const TOGETHER_HINT_PREFIXES = ['engine:together:', 'hint:engine-together:'];
function reshowTogetherHint() {
    const kept = [...dismissedIds.value].filter(id => !TOGETHER_HINT_PREFIXES.some(p => id.startsWith(p)));
    if (kept.length !== dismissedIds.value.size) dismissedIds.value = new Set(kept);
}
// Motoren sagde netop, at en Skal sammen ikke kan lade sig gøre (showImpossible
// i nextEngine.js sætter engineTogetherStop).
watch(engineTogetherStop, (stop) => { if (stop) reshowTogetherHint(); });

// Reglernes navne kommer fra ruleTypeLabel() i recipe.js — samme ord som
// regel-menuen, så advarslerne og opskriften siger det samme om en regel.

// Beskeder med en `anchor` hører til en bestemt knap i båndet og vises som en
// markering DÉR, ikke som et banner. Det sparer ikke bare plads: teksten
// siger "brug 6 grupper", og feltet man ville skrive 6 i, er netop det, der
// bliver markeret.
const ANCHOR_TARGET = 'target';   // måltalsfeltet (Størrelse / Antal)

// "1 gruppe" / "3 grupper". Bor i utils.js, så alle beskeder siger det samme.
const groupList = groupCountText;

const isMatrix = computed(() => state.activeView === 'matrix');

const activeRules = computed(() => {
    if (!state.currentClass) return [];
    return isMatrix.value
        ? (state.currentClass.matrixRules || [])
        : (state.currentClass.rules || []);
});

// Opdelingen "med i genereringen" / "låst fast", som alle hints regner på.
// Selve tællingen ligger i utils.js, så hints og generation.js ikke kan drive
// fra hinanden — og så fraværende og spøgelser ikke tæller som låste elever.
function _split(locked) {
    return splitByLockedGroups(
        state.currentClass && state.currentClass.data,
        locked,
        state.idColumn
    );
}

// Tomme celler i visningskolonnen. Ikke længere en blokering — hver elev har
// sit eget _rowId, så gruppedannelsen kører uanset. Men eleven ville stå som
// "(uden navn)" på gruppekortet, og det er værd at kunne nå at rette.
// Samme _excluded-filtrering som generation.js: fraværende tæller ikke med.
const unnamedStudentHint = computed(() => {
    if (!state.currentClass || !Array.isArray(state.currentClass.data)) return null;
    const col = state.displayColumn;
    if (!col) return null;

    const missing = state.currentClass.data
        .filter(s => !s._excluded && String(s[col] ?? '').trim() === '').length;
    if (missing === 0) return null;

    return {
        id: 'hint:unnamed-students',
        kind: 'info',
        text: missing === 1
            ? `1 elev har ingen værdi i "${col}" og står som "(uden navn)" i grupperne.`
            : `${missing} elever har ingen værdi i "${col}" og står som "(uden navn)" i grupperne.`,
    };
});

// ─── Flere grupper, end der er elever til at fylde dem ─────────────────────
//
// "Antal grupper" gemmes pr. klasse. Et tal valgt til en fuld klasse står der
// stadig den dag, halvdelen er fraværende — og indtil 4/9 blev det sendt råt
// til motoren, som lydigt dannede tomme gruppekort (se LOFTET i
// generation.js). Loftet skærer nu tallet ned, men det er bedre, at læreren
// kan nå at rette det SELV: hun kan låse en gruppe op, markere nogen til
// stede, eller vælge et andet tal. Derfor står beskeden ved måltalsfeltet,
// FØR hun trykker Generér.
//
// Samme visnings-afhængige gruppesæt som feasibilityHints: matrixvisningen
// bruger sit eget "Antal"-felt (strategien `count`), og dens låste grupper er
// nogle andre end stamvisningens.
const tooManyGroupsHint = computed(() => {
    if (!state.currentClass) return null;

    const settings = isMatrix.value
        ? (state.currentClass.matrixSettings || {})
        : (state.currentClass.settings || {});

    // Kun det felt der betyder ANTAL. I størrelses-tilstand betyder tallet
    // noget helt andet, og motoren holder selv gruppetallet nede der.
    const inCountMode = isMatrix.value
        ? settings.matrixStrategy === 'count'
        : state.groupMode === 'number';
    if (!inCountMode) return null;

    const total = parseInt(settings.groupTarget || 0);
    if (!total) return null;

    const groupsForView = isMatrix.value ? state.storedMatrixGroups : state.storedStandardGroups;
    const locked = (groupsForView || []).filter(g => g.locked);
    // De elever gruppedannelsen faktisk skal placere: hverken fraværende
    // eller låst fast i en eksisterende gruppe. Præcis samme udvalg som
    // generation.js's `generationData`, ellers advarer vi om et loft, der
    // ikke er det, motoren møder.
    const free = _split(locked).freeCount;
    if (free <= 0) return null;   // den sag ejes af generation.js' egen besked

    const wantedNew = total - locked.length;
    // `wantedNew <= 0` er en anden sag ("du har låst flere, end du beder om"),
    // og den ejer generation.js allerede med sin egen fejlbesked. To beskeder
    // om det samme tal er én for meget.
    if (wantedNew <= 0) return null;
    if (wantedNew <= free) return null;

    return {
        id: 'hint:too-many-groups',
        kind: 'info',
        anchor: ANCHOR_TARGET,
        // "de 1 gruppe" er ikke dansk. Ental og flertal skrives derfor ud,
        // frem for at lade `groupCountText()` bære hele sætningen — den kan
        // kun bøje substantivet, ikke artiklen foran.
        text: `Du beder om ${groupList(total)}, men der er kun ${free} `
            + `${free === 1 ? 'elev' : 'elever'} til rådighed`
            + (locked.length === 1 ? ' ud over den gruppe, du har låst'
                : locked.length > 1 ? ` ud over de ${locked.length} grupper, du har låst` : '')
            + `. Der dannes højst ${groupList(free + locked.length)} — flere ville stå tomme.`,
    };
});

const topicRoundingHint = computed(() => {
    // I antals-tilstand har læreren selv valgt et tal med vilje, og det har
    // sin egen besked (topicCountMismatchHint). Den her handler kun om den
    // afrunding, størrelses-tilstand foretager.
    if (isMatrix.value || !state.currentClass) return null;
    if (state.groupMode === 'number') return null;

    const topics = (state.currentClass.topics || []).filter(t => t && String(t).trim());
    if (topics.length === 0) return null;

    const settings = state.currentClass.settings || {};
    const sizeNum = parseInt(settings.groupTarget || 0);
    if (!sizeNum) return null;

    const locked = (state.storedStandardGroups || []).filter(g => g.locked);
    const split = _split(locked);
    const studentCount = split.freeCount;
    if (studentCount <= 0) return null;
    // Med en "Opdel" regner motoren pr. pulje — beskeden skal regne på de
    // samme puljer, ellers lover den et antal, motoren ikke danner.
    const poolSizes = poolSizesFor(split.free, state.currentClass.rules);

    // Motorens eget regnestykke (plannedNewGroups i utils.js), så beskeden og
    // motoren ikke kan komme til at sige hver sit tal.
    const adj = computeTopicAdjustedTarget({
        mode: 'size',
        sizeNum,
        // SAMME reserve som buildEngineInput: alt andet end "-" er "+".
        sizeMod: settings.groupMod || '+',
        studentCount,
        poolSizes,
        lockedCount: locked.length,
        topicCount: topics.length,
    });
    if (!adj) return null;

    // "4–5": den mindste og den største af de nye grupper.
    const sizeRange = (sizes) => {
        const lo = Math.min(...sizes);
        const hi = Math.max(...sizes);
        return lo === hi ? `${lo}` : `${lo}–${hi}`;
    };
    // Hvad et fast antal nye grupper betyder for størrelsen (til knapperne,
    // der skifter til "Antal grupper") — også regnet af motorens funktion.
    const perGroup = (groups) => {
        const plan = plannedNewGroups({ mode: 'number', target: groups + locked.length, poolSizes, lockedCount: locked.length });
        return plan ? sizeRange(plan.sizes) : '';
    };
    const countButton = (total, note) => ({
        label: `Brug ${groupList(total)} (${note})`,
        run: () => useGroupCount(total),
    });

    // STØRRELSEN HOLDT, MEN TALLET GÅR IKKE OP. Så er der intet rundet, men
    // læreren skal vide, at nogle emner får flere grupper, og have multiplerne
    // ved hånden, hvis hun vil bruge Matrix med én fra hvert emne. Antallet pr.
    // emne nævnes ikke: emnerne fordeles efter elever, og med låste grupper
    // ville et præcist tal kunne være forkert.
    if (!adj.didAdjust) {
        const total = adj.adjustedTotal;
        if (total < topics.length || total % topics.length === 0) return null;
        const below = Math.floor(total / topics.length) * topics.length;
        const actions = [below, below + topics.length]
            .filter(n => n > locked.length && n - locked.length <= studentCount)
            .map(n => countButton(n, `${perGroup(n - locked.length)} elever`));
        return {
            id: 'hint:topic-uneven',
            kind: 'info',
            anchor: ANCHOR_TARGET,
            text: `${groupList(total)} går ikke lige op med ${topics.length} emner, så nogle emner får flere grupper end andre.`
                + (actions.length ? ' Skal hvert emne have lige mange, fx til Matrix, kan du vælge et andet antal.' : ''),
            actions,
        };
    }

    // FÆRRE GRUPPER END EMNER: her kan størrelsen og emnerne ikke begge holde.
    // Grunden er ikke et "multiplum", men at hvert emne skal have en gruppe.
    // Motoren gør det kun ved "én elev mindre" (Kenneths svar 41 til motoren);
    // ved "én elev ekstra" holder den størrelsen og skriver selv, at et emne
    // ingen gruppe får — så dér er der ingen besked herfra.
    if (adj.naiveTotal < topics.length && adj.adjustedTotal === topics.length) {
        const lost = topics.length - adj.naiveTotal;
        return {
            id: 'hint:topic-floor',
            kind: 'info',
            anchor: ANCHOR_TARGET,
            text: `Du har ${topics.length} emner, så der skal være mindst ${topics.length} grupper. `
                + `Derfor får grupperne ${sizeRange(adj.adjustedSizes)} elever i stedet for ${sizeRange(adj.naiveSizes)}.`,
            actions: [countButton(adj.naiveTotal, `${lost} ${lost === 1 ? 'emne' : 'emner'} udgår`)],
        };
    }

    const dir = adj.direction === 'up' ? 'op' : 'ned';

    // Hvad ville det ANDET flueben give?
    //
    // HVORFOR: banneret sagde kun HVAD der skete ("rundes ned fra 7 til 6"),
    // ikke at læreren selv kan vælge den anden vej. "+1" runder som
    // udgangspunkt ned og "-1" op, så det er præcis dét flueben, der afgør,
    // om 28 elever bliver til 6 grupper à 4-5 eller 9 à 3-4. Uden linjen ser
    // tallet ud som ren aritmetik, og læreren leder efter en knap, hun ikke
    // ved hun har.
    //
    // Regnet ud frem for påstået, og målt på det VALGTE flueben, ikke på
    // retningen: det andet flueben køres gennem den samme hjælper, så linjen
    // aldrig lover et tal, dannelsen ikke giver. (Siden 1/11 2026 runder
    // hjælperen kun, når alle grupper holder lærerens størrelse, så det andet
    // flueben giver ofte slet ingen afrunding.)
    //
    // Er fluebenet blankt, er begge veje mulige, så begge prøves. Og linjen
    // udelades, når alternativet giver det samme tal — et valg der ikke ændrer
    // noget, er ikke et valg læreren skal forstyrres med.
    const currentMod = settings.groupMod || '+';
    const candidates = currentMod === '+' ? ['-'] : (currentMod === '-' ? ['+'] : ['+', '-']);
    let altText = '';
    for (const mod of candidates) {
        const alt = computeTopicAdjustedTarget({
            mode: 'size',
            sizeNum,
            sizeMod: mod,
            studentCount,
            poolSizes,
            lockedCount: locked.length,
            topicCount: topics.length,
        });
        if (alt && alt.adjustedTotal !== adj.adjustedTotal) {
            altText = ` Vil du hellere have ${groupList(alt.adjustedTotal)}, så tryk "${mod}1".`;
            break;
        }
    }

    // Motoren runder kun til et multiplum, der kan dannes (aldrig flere
    // grupper end elever), så totalen ER et multiplum, når vi når hertil. Er
    // der færre grupper end emner, uden at der rundes ("én elev ekstra", eller
    // færre elever end emner), er vi allerede gået ud længere oppe — dér
    // skriver motoren selv, at et emne ingen gruppe får (more-topics-than-groups).
    if (adj.adjustedTotal % topics.length !== 0) return null;

    // Hvad afrundingen betyder for gruppernes størrelse. Uden den står der kun
    // et gruppetal, og at 7 grupper blev til 10 betyder, at gruppen på 4
    // pludselig er en gruppe på 2-3 — det skal stå, FØR hun trykker Dan grupper.
    const sizeText = (() => {
        const n = adj.adjustedNew;
        if (!n || n > studentCount) return '';
        const hi = Math.max(...adj.adjustedSizes);
        const per = sizeRange(adj.adjustedSizes);
        return ` Det giver ${n === adj.adjustedTotal ? '' : 'nye '}${groupList(n)} på ${per} ${hi === 1 ? 'elev' : 'elever'}.`;
    })();

    return {
        id: 'hint:topic-rounding',
        kind: 'info',
        // Beskeden handler om måltalsfeltet, og feltet står 40 px derovre i
        // båndet. Den vises som en markering DÉR i stedet for som et banner
        // over resultatet — se ANCHOR_TARGET nedenfor.
        anchor: ANCHOR_TARGET,
        text: `${topics.length} emner: antal grupper rundes ${dir} fra ${adj.naiveTotal} til `
            + `${adj.adjustedTotal}, så hvert emne får lige mange (multiplum af ${topics.length}).`
            + sizeText
            + altText,
    };
});

// BEMÆRK: her lå `lockedGroupHint` ("Du har låst N grupper"). Den er væk med
// vilje: hvert låst gruppekort tegner allerede en lukket hængelås, så
// beskeden fortalte kun det, man kunne se — og den kostede en hel banner-højde
// hver gang, læreren låste noget. Teksten er ikke flyttet et andet sted hen;
// den var overflødig.

// Knappen i emne-beskederne: skift til et fast antal grupper. Opskriften
// lytter på klassens settings og opdaterer selv sit felt (se RecipePanel).
function useGroupCount(total) {
    const c = state.currentClass;
    if (!c) return;
    c.settings = { ...(c.settings || {}), groupMode: 'number', groupTarget: total };
    state.groupMode = 'number';
    autoSave();
}

// I antals-tilstand: sig til, når lærerens tal ikke går op med antal emner.
// Ét emne får så færre grupper end de andre — og dermed færre matrix-rækker.
// Beskeden peger på det næste tal, der går op.
//
// I antals-tilstand regner generation.js `groupTarget` som det SAMLEDE antal
// grupper (låste iberegnet) og trækker de låste fra: `neededNewGroups =
// total - locked.length`. Beskeden skal regne på samme måde, ellers står der
// forkerte tal i den.
const topicCountMismatchHint = computed(() => {
    if (isMatrix.value || !state.currentClass) return null;
    if (state.groupMode !== 'number') return null; // size-mode handled by rounding hint

    const topics = (state.currentClass.topics || []).filter(t => t && String(t).trim());
    if (topics.length === 0) return null;

    const settings = state.currentClass.settings || {};
    const total = parseInt(settings.groupTarget || 0); // teacher's chosen TOTAL
    if (!total) return null;

    const t = topics.length;
    const locked = (state.storedStandardGroups || []).filter(g => g.locked);

    // Ti stille, når læreren selv har tilføjet eller fjernet grupper, så det
    // faktiske antal allerede går op (fx "+ Gruppe" i bundbjælken).
    const actualTotal = (state.storedStandardGroups || []).length;
    if (actualTotal > 0 && actualTotal % t === 0) return null;

    // Færre grupper end emner har sin egen, tydeligere besked (topicsFewHint).
    if (total < t) return null;

    const sug = suggestTopicMultiple({
        numberTarget: total,
        lockedCount: locked.length,
        topicCount: t,
    });
    if (!sug) return null; // already a perfect multiple

    // ET RÅD MAN IKKE KAN FØLGE, ER IKKE ET RÅD.
    //
    // Forslaget er altid NÆSTE multiplum opad. Er der færre elever end det
    // tal, beder beskeden læreren om noget, loftet i generation.js afviser i
    // samme øjeblik hun gør det: med 8 tilstedeværende elever, 5 emner og 12
    // ønskede grupper stod der "Brug 15 grupper for ligelig fordeling" — 15
    // grupper til 8 elever. Beskeden tier nu i stedet; det ægte problem
    // (for mange grupper til for få elever) siger `tooManyGroupsHint` allerede
    // ved det samme felt.
    const split = _split(locked);
    const free = split.freeCount;
    if (sug.nextNew > free) return null;

    // Giver en "Opdel" flere puljer, end der er bedt om nye grupper, danner
    // motoren én gruppe pr. pulje — altså FLERE end det tastede tal — og siger
    // det selv ("… Opdel giver 4 puljer … Der dannes derfor 4 nye grupper").
    // Regnestykket her bygger på det tastede tal og ville stå ved siden af med
    // et antal grupper, der ikke bliver dannet.
    if (poolSizesFor(split.free, state.currentClass.rules).length > total - locked.length) return null;

    return {
        id: 'hint:topic-count-mismatch',
        kind: 'info',
        anchor: ANCHOR_TARGET,
        text: locked.length > 0
            ? `${total} grupper med ${t} emner: ét emne tildeles kun ${sug.minPerTopic} ${sug.minPerTopic === 1 ? 'gruppe' : 'grupper'} og begrænser matrix. Brug ${sug.nextNew} nye grupper (${sug.nextMultiple} i alt) for ligelig fordeling.`
            : `${total} grupper med ${t} emner: ét emne tildeles kun ${sug.minPerTopic} ${sug.minPerTopic === 1 ? 'gruppe' : 'grupper'} og begrænser matrix. Brug ${sug.nextMultiple} grupper for ligelig fordeling.`,
    };
});

// ─── Matrixen er dannet på et andet billede, end det der står nu ────────────
// Matrixgrupper dannes PÅ TVÆRS af stamgrupperne. Flytter læreren bagefter en
// elev i hånden, rører det kun stamgrupperne: matrixen bliver stående og er nu
// skæv — to elever fra samme stamgruppe i én matrixgruppe, og en anden
// stamgruppe uden repræsentant.
//
// Vi danner IKKE om af os selv. Læreren kan have rettet i matrixen i hånden
// bagefter, og ét flyttet navn i stamgrupperne må ikke rive det arbejde ned
// uden varsel. Derfor et hint med en knap: hun bestemmer.
//
// Er aftrykket `null`, ved vi ikke hvor matrixen kom fra (typisk efter en
// genindlæsning — aftrykket lever kun i hukommelsen). Så tier vi: en advarsel
// vi ikke kan stå inde for, er værre end ingen.
const matrixDriftHint = computed(() => {
    if (!isMatrix.value) return null;
    if (!state.storedMatrixGroups || state.storedMatrixGroups.length === 0) return null;
    // matrixGroupsStale ejer allerede sagen "matrixen SKAL dannes forfra" og
    // gør det automatisk ved næste visningsskift. To advarsler om samme sag er
    // én for meget.
    if (state.matrixGroupsStale) return null;

    const fingerprint = state.matrixSourceFingerprint;
    if (!fingerprint) return null;

    const currentFingerprint = homeGroupFingerprint(state.storedStandardGroups);
    if (currentFingerprint === fingerprint) return null;

    return {
        // Aftrykket ligger i id'et, så en NY drift giver et nyt hint. Uden det
        // ville ét klik på krydset lukke advarslen for resten af timen — også
        // for de flytninger der kommer bagefter.
        id: `hint:matrix-drift:${currentFingerprint}`,
        kind: 'conflict',
        text: 'Stamgrupperne er ændret, siden matrixen blev dannet. Matrixen her '
            + 'passer derfor ikke længere til dem: nogle matrixgrupper kan have to '
            + 'elever fra samme stamgruppe og ingen fra en anden. Danner du den igen, '
            + 'kan både sammensætningen OG antallet af matrixgrupper ændre sig — '
            + 'og rettelser du har lavet i matrixen i hånden, forsvinder.',
        action: { label: 'Dan matrixen igen', run: () => generateMatrixGroups() },
    };
});

// "Ensartede" og "Balancér" kan KUN arbejde med tal — de har ingen kategorisk
// udgave i motoren, så på en tekstkolonne (fx et niveau skrevet Lav/Middel/Høj)
// gør de bogstaveligt talt ingenting. Læreren skal have det at vide MENS hun
// vælger kolonnen, ikke først efter en kørsel der ser tilfældig ud.
// (Ordlyden er den samme som den gamle Python-motors advarsel
// logic.detect_non_numeric_sort_rules, så lærerne genkender den.)
const NUMERIC_ONLY_TYPES = ['balance', 'minimizediff'];


// En gammel "Opdel" i matrix-reglerne (fra en ældre udgave eller en
// importeret klasse). Opskriften tilbyder den ikke i matrix-runden, og
// motoren får den aldrig (buildEngineInput i nextEngine.js og placement.js
// springer den over) — men den stod i opskriften, som om den virkede.
// Knappen fjerner den; der gemmes ellers intet, før læreren beder om det
// (109. gennemsyn, 13/11 2026).
const matrixExcludedRuleHint = computed(() => {
    if (!isMatrix.value || !state.currentClass) return null;
    const rules = state.currentClass.matrixRules || [];
    const stale = rules.filter(r => MATRIX_EXCLUDED_RULES.includes(r?.type || r?.name));
    if (!stale.length) return null;
    const first = stale[0];
    const col = first.column || first.attribute || '';
    const label = ruleTypeLabel(first.type || first.name);
    return {
        id: `hint:matrix-excluded:${stale.map(r => `${r.type || r.name}:${r.column || r.attribute || ''}`).join(',')}`,
        kind: 'info',
        text: `${label}${col ? ` på "${col}"` : ''} gør ingenting i matrix-runden: matrixen spreder `
            + 'eleverne fra stamgrupperne, så reglen bliver ikke brugt. Den kommer fra en ældre udgave af Grupper.',
        actions: [{
            label: stale.length === 1 ? 'Fjern reglen' : 'Fjern reglerne',
            run: () => {
                const cls = state.currentClass;
                if (!cls) return;
                cls.matrixRules = (cls.matrixRules || [])
                    .filter(r => !MATRIX_EXCLUDED_RULES.includes(r?.type || r?.name));
                autoSave();
            },
        }],
    };
});

// "Adskil" er den ENESTE regel med et værdifelt (RULES_WITHOUT_VALUES i
// utils.js), og feltet står tomt, indtil læreren vælger noget. Uden en værdi
// spreder reglen ingenting — og indtil for nylig meldte resultattabellen den
// endda 100 % opfyldt. Motoren advarer nu også, men dét sker FØRST efter
// kørslen; her står det, mens reglen bliver skrevet.
const ruleWithoutValueHint = computed(() => {
    const out = [];
    const seen = new Set();
    for (const r of activeRules.value) {
        const type = (r.type || r.name || '').toLowerCase();
        if (type !== 'separate' && type !== 'strict_separate') continue;
        const col = r.column || r.attribute || '';
        if (!col || seen.has(col)) continue;
        const values = Array.isArray(r.values) ? r.values : (r.value ? [r.value] : []);
        if (values.some(v => String(v ?? '').trim())) continue;
        seen.add(col);
        out.push({
            id: `hint:no-value:${isMatrix.value ? 'matrix' : 'stam'}:${col}`,
            kind: 'conflict',
            text: `${ruleTypeLabel(type)} på "${col}" gør ingenting: der er ikke valgt `
                + `en værdi. Vælg den værdi, der skal spredes ud over grupperne.`,
        });
    }
    return out;
});

const numericRuleOnTextHint = computed(() => {
    if (!state.currentClass || !Array.isArray(state.currentClass.data)) return [];
    const rows = state.currentClass.data;
    if (!rows.length) return [];

    const out = [];
    const seen = new Set();
    for (const r of activeRules.value) {
        const type = (r.type || r.name || '').toLowerCase();
        if (!NUMERIC_ONLY_TYPES.includes(type)) continue;
        const col = r.column || r.attribute || '';
        if (!col || seen.has(type + '|' + col)) continue;
        seen.add(type + '|' + col);
        // Helt tom kolonne er en anden sag — den har sin egen besked fra motoren.
        const hasContent = rows.some(s => String(s[col] ?? '').trim() !== '');
        if (!hasContent) continue;
        // columnIsNumeric, ikke "har kolonnen overhovedet et tal?": ét enkelt
        // "3" midt i Lav/Middel/Høj slukkede før både denne besked OG knappen
        // "Ranger værdierne…", som er den eneste vej ud af problemet. Samme
        // flertals-tærskel som den gamle Python-motors logic.column_has_numbers.
        if (columnIsNumeric(rows, col)) {
            // Kolonnen ER tal for klassen — men motoren ser kun de frie
            // elever (engineRowSplit). Er alle med et tal fraværende eller
            // låst fast, har motoren kun tekst tilbage, og reglen gør
            // ingenting. Motoren siger det selv (text-only-column), men dén
            // besked viser appen aldrig (APP_OWNED_CODES), og den ville sige
            // "kolonnen har ingen tal" om en kolonne fuld af tal. Så siger
            // appen det her, med den rigtige grund (hullet fra 101.
            // gennemsyn, lukket i 111.). Ingen "Ranger"-knap: kolonnen skal
            // ikke rangeres; det er eleverne med tallene, der mangler.
            const free = engineRowSplit(rows, isMatrix.value ? state.storedMatrixGroups : state.storedStandardGroups).free;
            const freeText = free.some(s => String(s[col] ?? '').trim() !== '');
            const freeNumber = free.some(s => cellNumber(s[col]) !== null);
            if (!freeText || freeNumber) continue;
            if (rankingAffectsColumn(rows, col, (state.currentClass.columnOrders || {})[col])) continue;
            out.push({
                id: `hint:non-numeric:${isMatrix.value ? 'matrix' : 'stam'}:${type}:${col}`,
                // Info, ikke rød: der er intet at rette i opskriften (det er
                // fraværet eller låsningen), og motorens egen note er info.
                kind: 'info',
                text: `${ruleTypeLabel(type)} på "${col}" gør ingenting lige nu: alle elever med et tal `
                    + `i kolonnen er fraværende eller låst fast i en gruppe, og resten har tekst. `
                    + `Reglen virker igen, når elever med et tal skal placeres.`,
            });
            continue;
        }
        // Har læreren allerede rangeret kolonnen, VIRKER reglen: buildEngineInput
        // sender trinene til motoren, som regner med rangen (1, 2, 3 …).
        // Bliver advarslen stående alligevel, skælder den ud over noget hun
        // lige har ordnet — og så holder man op med at læse hints.
        //
        // Men rangeringen skal RAMME noget. Er klasselisten skiftet ud med en,
        // der bruger andre ord, står rækkefølgen der stadig uden at passe på en
        // eneste elev — og så gør reglen lige så lidt som før. Dét skal hintet
        // blive ved med at sige (og buildEngineInput i nextEngine.js sender
        // ikke rækkefølgen i netop det tilfælde — samme prøve — så motoren
        // regner på kolonnen, som om den ikke var rangeret).
        if (rankingAffectsColumn(rows, col, (state.currentClass.columnOrders || {})[col])) continue;
        // Står der et tal i NOGLE få celler, gør reglen ikke "ingenting":
        // motoren regner med tal, så snart én celle er et tal (`hasNumbers` i
        // motor/engine/task.js), bruger reglen på netop de elever og placerer
        // resten frit. Beskeden skal sige det, motoren gør (og den afløser
        // motorens egen note om det samme, se coveredByRecipeHint).
        const someNumbers = rows.some(s => cellNumber(s[col]) !== null);
        const way = `Giv værdierne en rækkefølge — `
            + `eller brug ${ruleTypeLabel('group_sort')} eller ${ruleTypeLabel('cluster')} i stedet.`;
        out.push({
            id: `hint:non-numeric:${isMatrix.value ? 'matrix' : 'stam'}:${type}:${col}`,
            kind: 'conflict',
            text: someNumbers
                ? `${ruleTypeLabel(type)} på "${col}" virker kun for de få elever, der har et tal `
                    + `i kolonnen: reglen kan kun arbejde med tal, og resten har tekst og placeres frit. ${way}`
                : `${ruleTypeLabel(type)} på "${col}" gør ingenting: reglen kan kun arbejde `
                    + `med tal, og der står tekst i kolonnen. ${way}`,
            // Advarslen peger på sin egen udvej. Uden knappen skal læreren selv
            // gætte hvor rangeringen bor.
            action: { label: 'Ranger værdierne…', run: () => modalActions.openColumnOrder(col) },
        });
    }
    return out;
});

// ─── En undgåelse er brudt i de grupper der står her nu ────────────────────
// Advarslerne ovenfor kigger på REGLERNE, før grupperne dannes. Det her kigger
// på RESULTATET, og det er en anden sag: undgåelsen er en blød regel for
// motoren, og der er mindst tre veje uden om den bagefter — læreren flytter
// selv en elev, begge elever står i en låst gruppe (så dropper generation.js
// undgåelsen tavst), eller en gemt session kommer ind fra dengang undgåelsen
// ikke fandtes. Fælles for dem alle: der stod ikke ét ord om det nogen steder.
//
// Måles på grupperne selv, så alle tre veje er dækket af ét tjek.
const brokenAvoidHint = computed(() => {
    if (!state.currentClass) return null;
    const groups = isMatrix.value ? state.storedMatrixGroups : state.storedStandardGroups;
    if (!groups || !groups.length) return null;

    const byId = studentById.value;
    const brokenList = brokenSeparations(groups, state.currentClass.separations, byId);
    if (!brokenList.length) return null;

    const data = state.currentClass.data;
    const nameOf = (id) => memberDisplayName(id, data, state.displayColumn, byId);
    // "Anna og Bo", "Anna, Bo og Cecilie" — dansk opremsning (namesText).
    // groupDisplayName, ikke b.groupName: internt hedder gruppen "Group 1",
    // og advarslen skal sige det samme som kortet ("Gruppe 1").
    const describe = (b) => `${namesText(b.ids.map(nameOf))} i ${groupDisplayName(b.groupName)}`;

    const shown = brokenList.slice(0, 3).map(describe).join('; ');
    const rest = brokenList.length > 3 ? ` (og ${brokenList.length - 3} mere)` : '';
    const anyLocked = brokenList.some(b => b.locked)
        ? ' Mindst én af grupperne er låst — en ny gruppedannelse retter den ikke.'
        : '';

    return {
        // Aftrykket ligger i id'et: retter læreren den ene og bryder en anden,
        // er det et NYT hint. Uden det ville ét klik på krydset lukke
        // advarslen for resten af timen — også for de brud der kommer bagefter.
        id: `hint:avoid-broken:${brokenList.map(b => b.groupName + ':' + b.ids.join(',')).join('|')}`,
        kind: 'conflict',
        text: brokenList.length === 1
            ? `Undgåelse brudt: ${shown} står sammen — de er markeret med rødt på kortet.${anyLocked} `
                + `Flyt den ene, eller fjern undgåelsen under Elevliste.`
            : `${brokenList.length} undgåelser er brudt: ${shown}${rest} — eleverne er markeret med rødt på kortene.${anyLocked} `
                + `Flyt dem, eller fjern undgåelserne under Elevliste.`,
    };
});

// ─── En Skal sammen-aftale er brudt i de grupper der står her nu ────────────
// Modstykket til brokenAvoidHint: læreren flytter selv en elev, eller en gemt
// session kommer ind fra før aftalen fandtes. Før stod der kun en forældet
// besked fra sidste dannelse. Måles på grupperne selv. Hører til RESULTATET
// (står over grupperne), ikke til opskriften: id'et starter med
// `hint:together-broken:`, som ikke er et opskrifts-præfiks.
const brokenTogetherHint = computed(() => {
    const cls = state.currentClass;
    if (!cls || isMatrix.value) return null;
    const groups = state.storedStandardGroups;
    if (!groups || !groups.length) return null;
    const broken = brokenTogether(groups, cls.togetherGroups, cls.data || []);
    if (!broken.length) return null;

    const nameOf = (id) => memberDisplayName(id, cls.data, state.displayColumn);
    const listNames = (list) => list.length <= 1
        ? (list[0] || '')
        : `${list.slice(0, -1).join(', ')} og ${list[list.length - 1]}`;
    const where = new Map();
    groups.forEach(g => (g.members || []).forEach(m => where.set(memberIdStr(m), g)));
    const describe = (ids) => {
        const spread = [...new Set(ids.map(id => where.get(id)).filter(Boolean))];
        const places = spread.map(g => groupDisplayName(g.name));
        return `${listNames(ids.map(nameOf))} (${places.length ? 'i ' + listNames(places) : 'står ikke i nogen gruppe'})`;
    };
    const shown = broken.slice(0, 3).map(describe).join('; ');
    const rest = broken.length > 3 ? ` (og ${broken.length - 3} mere)` : '';
    return {
        id: `hint:together-broken:${broken.map(describe).join('|')}`,
        kind: 'conflict',
        actions: [{ label: 'Vis aftalen', run: () => modalActions.openAgreements('together', broken[0]) }],
        text: broken.length === 1
            ? `Skal sammen er brudt: ${shown} står ikke samlet. Flyt dem sammen, dan grupper igen, eller fjern aftalen under Elevliste → Aftaler.`
            : `${broken.length} Skal sammen-aftaler er brudt: ${shown}${rest}. Flyt eleverne sammen, dan grupper igen, eller fjern aftalerne under Elevliste → Aftaler.`,
    };
});

// Knapperne på en Skal sammen, der ikke kan lade sig gøre — de samme på
// motorens stop og på check()-advarslen.
function togetherActions(ids) {
    return [
        { label: 'Vis aftalen', run: () => modalActions.openAgreements('together', ids) },
        { label: 'Dan grupper uden aftalen', disabled: state.isGenerating, run: () => generateWithoutTogether(ids) },
    ];
}

// Motoren sagde ved sidste kørsel, at en eller flere Skal sammen-blokke ikke
// kan lade sig gøre. Knappen fjerner ALLE de umulige blokke på én gang.
const engineTogetherHint = computed(() => {
    const stop = engineTogetherStop.value;
    if (!stop || isMatrix.value) return null;
    if (stop.filename !== (state.currentClass?.filename || null)) return null;
    return {
        id: `hint:engine-together:${stop.ids.join(',')}`,
        kind: 'conflict',
        actions: togetherActions(stop.ids),
        text: stop.text,
    };
});

// ─── Motorens check(): advarslerne før kørslen ──────────────────────────────
//
// Opskriftens advarsler om REGLERNE og AFTALERNE kommer fra motorens check()
// — de samme regelmoduler, der danner grupperne, så "før" og "efter" ikke kan
// sige hvert sit (konflikter, Klyng/Adskil/Undgå, der ikke kan gå op, Fordel,
// der ikke går lige op, Opdel-puljer, celler, der ikke er tal, Skal sammen,
// for mange emner, matrix-kilderne). Appens egne hints ovenfor er dem med en
// knap eller uden for motorens felt: unnamedStudentHint, ruleWithoutValueHint,
// matrixDriftHint, brokenAvoidHint, brokenTogetherHint, togetherRuleCostHint,
// numericRuleOnTextHint ("Ranger værdierne…"), tooManyGroupsHint,
// topicRoundingHint, topicCountMismatchHint — motorens koder for de sidste
// fire (APP_OWNED_CODES i nextEngine.js) vises ikke.
//
// (Før 3/11 2026 regnede appen selv det samme ud for den gamle motor:
// ruleConflicts, feasibilityHints, separateTooManyHints, unevenDistributeHints,
// aggregatePoolHints, clusterSingleHints, mixedNumericHints, togetherHint og
// topicsFewHint. De er fjernet sammen med den gamle motor.)
//
// Har "Sidste dannelse" resultatet af en sag (samme issueKey, eller for en
// advarsel om en regel: et resultat på samme plads — resultSlot i
// nextEngine.js), står motorens varsel om den ikke også her.
// Det gælder kun, mens kørslen fik det input, der står nu.
const engineCheckHints = computed(() => {
    const chk = engineCheck.value;
    if (!chk) return null;
    const cls = state.currentClass;
    const data = cls?.data || [];
    const fill = {
        studentName: (id) => memberDisplayName(id, data, state.displayColumn),
        groupName: () => null,
    };
    // Kun mens sidste kørsel fik præcis det input, der står nu: et resultat
    // fra før en låsning eller en rettet celle må ikke skjule en ny advarsel
    // (shownLastNotes / lastRunApplies i nextEngine.js).
    const lastKeys = new Set(shownLastNotes(isMatrix.value).flatMap(n => n.keys || []));
    const out = [];

    // Skal sammen: alle de umulige blokke i én advarsel, som appens egen —
    // og "Dan grupper uden aftalen" fjerner dem alle på én gang.
    const together = chk.messages.filter(isTogetherStop);
    if (together.length && !isMatrix.value) {
        const ids = [...new Set(together.flatMap(m => m.students || []))].sort();
        out.push({
            id: `engine:together:${ids.join(',')}`,
            kind: 'conflict',
            actions: togetherActions(ids),
            text: together.map(m => fillMessageText(m, fill)).join(' '),
        });
    }

    // Svaret ligger i en ref, så input er Vues proxy — WeakMap'en kender kun
    // det rå objekt (toRaw), ellers fandt ingen note sin linje.
    const sources = ruleSources.get(toRaw(chk.input)) || [];
    // "N elever har en værdi, der ikke er et tal" står ikke ved siden af
    // appens egen advarsel om samme regel og kolonne (den med "Ranger
    // værdierne…"). Efter kørslen og i prøvekørslen blev den allerede sorteret
    // fra (coveredByRecipeHint); her i det hurtige tjek stod de to side om
    // side til 13/11 2026. Har læreren lukket appens advarsel, vises motorens.
    const ownIds = numericRuleOnTextHint.value.map(h => h.id).filter(id => !dismissedIds.value.has(id));
    for (const m of chk.messages) {
        if (isTogetherStop(m)) continue;
        if (coveredByRecipeHint(m, chk.input, ownIds)) continue;
        const key = issueKey(m);
        if (lastKeys.has(key) || replacedByResult(m, lastKeys)) continue;
        const text = fillMessageText(m, fill);
        const red = severityOf(m, chk.status) === 'error';
        out.push({
            id: `engine:${key}|${text}`,
            kind: red ? 'conflict' : 'info',
            text,
            anchor: red ? undefined : ruleAnchorFor(m, sources),
        });
    }
    return out;
});

// Prøvekørslen i baggrunden (trialRun.js): det, en kort gruppedannelse fandt
// ud over tjekket. Står i SAMME stak og ser ud som de andre advarsler —
// Kenneth 12/11: advarsler skal stå ét sted, og læreren skal ikke kunne se
// forskel på, hvor de kommer fra. Derfor samme id-forstavelse ("engine:", se
// isRecipeHint i recipe.js) og samme farver som tjekkets.
const trialHints = computed(() => trialNotes(isMatrix.value).map(n => ({
    id: `engine:trial:${n.key}|${n.text}`,
    kind: n.type === 'error' ? 'conflict' : 'info',
    text: n.text,
})));

// Noterne fra sidste dannelse: hvad motoren sagde om opsætningen og om de
// grupper, kørslen gav. Stod før under "Sidste dannelse" nederst i
// opskriften; Kenneth sagde ja 13/11 2026 til at samle dem i stakken øverst,
// så alt, læreren skal være opmærksom på, står ét sted — før og efter Dan
// grupper. Kun mens sidste kørsel stadig gælder (shownLastNotes). Står aldrig
// samtidig med prøvekørslens (trialHints): den holder pause netop dér.
//
// Id'et har kørslens nummer (lastRunNo) med: lukker læreren en note med
// krydset, gælder det DEN kørsel. Ved næste dannelse kommer den igen, også
// med samme tekst. `source: 'last'` giver stakken en klasse, så testene kan
// skelne dem fra tjekkets advarsler; læreren ser ingen forskel.
//
// Tallet efter kørslens nummer tæller kun noter med SAMME tekst (0 for den
// første), ikke pladsen i listen. Pladsen flytter sig, når noterne om
// resultatet fjernes (forgetRunResults: en gendannet session, Gendan
// grupper, "Hent de nye grupper"), og så kom en lukket note om opsætningen
// tilbage, fordi dens id var et andet (109. gennemsyn, 13/11 2026).
const lastRunHints = computed(() => {
    const view = isMatrix.value ? 'matrix' : 'standard';
    const runNo = setupNotices.lastRunNo[view];
    const seenTexts = new Map();
    return shownLastNotes(isMatrix.value).map((n) => {
        const nth = seenTexts.get(n.text) || 0;
        seenTexts.set(n.text, nth + 1);
        return {
            id: `engine:last:${view}:${runNo}:${nth}|${n.text}`,
            kind: n.type === 'error' ? 'conflict' : 'info',
            text: n.text,
            source: 'last',
        };
    });
});

// "Fordel på X kan ikke gå helt lige op" står ved reglens linje som et lille
// i i stedet for i stakken over opskriften. Kenneth 4/11: syv af dem stod
// over opskriften og skubbede den ned — og de beder ikke læreren om noget,
// det er bare regnestykket (3 elever på 4 grupper). Kun den slags: en blå
// note, motoren selv kalder uundgåelig, om én bestemt regel. Kan reglens
// linje ikke findes (sources mangler), bliver beskeden i stakken, så den
// aldrig forsvinder helt.
const ANCHOR_RULE = 'rule:';
function ruleAnchorFor(m, sources) {
    if (m.code !== 'rule-not-met' || m.unavoidable !== true || !Number.isInteger(m.rule)) return undefined;
    const at = sources[m.rule];
    return Number.isInteger(at) ? ANCHOR_RULE + at : undefined;
}

// Aftaler begrænser hvilke elever motoren må flytte, men et par værdier
// beviser ikke, at en regel er umulig. To ens værdier kan netop være den
// rigtige andel i Fordel, og Klyng tillader flere værdier, når ingen er alene.
// Derfor kun en mulig afvejning for Fordel/Saml/Ensartede — ingen påstand
// om opfyldelsesprocent eller om årsagen til motorens resultat.
const togetherRuleCostHint = computed(() => {
    const cls = state.currentClass;
    if (!cls || isMatrix.value) return null;
    const components = togetherComponents(cls.togetherGroups, cls.data || []);
    if (!components.length) return null;

    const byId = studentById.value;
    const notes = [];
    for (const rule of activeRules.value) {
        const attr = rule.column || rule.attribute || '';
        const type = (rule.type || rule.name || '').toLowerCase();
        if (!attr || !['group_sort', 'minimizediff', 'distribute'].includes(type)) continue;
        const spreading = type === 'distribute';
        // En RANGERET tekstkolonne (Lav < Middel < Høj) sammenlignes på
        // teksten: gruppedannelsen regner den om til rangen, og to forskellige
        // ord er to forskellige rang. Læst som tal var hvert ord "ingenting",
        // og hintet tav om en aftale, der binder Ensartede på niveauet.
        const order = (cls.columnOrders || {})[attr];
        // Kun en rækkefølge, der rammer noget, sendes til motoren (se
        // buildEngineInput); en forældet tæller ikke som rangeret her heller.
        // Kun Saml og Ensartede: motoren læser rangeringen alene for tal-
        // reglerne (NUMERIC_TYPES i motor/engine/task.js); Fordel bruger
        // altid teksten, rangeret eller ej.
        const ranked = !spreading && rankingAffectsColumn(cls.data || [], attr, order);
        // Saml regner med tal, så snart ÉN celle i kolonnen er et tal (motorens
        // `mode` i motor/engine/task.js), ikke først når flertallet er det.
        // Med flertals-tærsklen (columnIsNumeric) sammenlignede beskeden ord,
        // som motoren slet ikke ser på i en kolonne med nogle få tal.
        // Og kun blandt de FRIE elever (engineRowSplit): motoren får hverken de
        // fraværende eller dem i en låst gruppe. Stod det eneste tal hos en
        // fraværende elev, regnede motoren Saml som tekst, mens rådet læste
        // aftalens ord som "intet tal" og tav (113. gennemsyn, rettet i 116.).
        const free = type === 'group_sort' ? engineRowSplit(cls.data, state.storedStandardGroups).free : [];
        const numeric = !ranked && (type === 'minimizediff'
            || (type === 'group_sort' && free.some(row => cellNumber(row?.[attr]) !== null)));
        // Rangeret: kun rangeringens trin har en værdi (rangen), som i motorens
        // prepareRule — et ord uden for rangeringen er en tom celle dér og
        // binder ingenting. Ellers sagde hintet "forskellige værdier" om
        // "Lav" og "Ukendt". Tekst sammenlignes med valueKey (NFC, småt), som
        // motorens normalizeText.
        const rankOf = ranked ? new Map(rankSteps(order).map((v, i) => [valueKey(v), i + 1])) : null;
        const valueOf = raw => {
            if (numeric) return cellNumber(raw);
            const key = valueKey(raw);
            if (!key) return null;
            return rankOf ? (rankOf.get(key) ?? null) : key;
        };
        // Ingen indsnævring på en valgt værdi: de tre regeltyper her arbejder
        // alle på HELE kolonnen (RULES_WITHOUT_VALUES i utils.js), og feltet
        // findes ikke længere i brugerfladen. Læste hintet stadig en gammel,
        // gemt værdi, ville det tie om en aftale, motoren rent faktisk bliver
        // begrænset af.
        for (const ids of components) {
            // Tomme/ugyldige celler er ingen kategori. Tal læses gennem den
            // delte helper, så fx 1 og 1,0 ikke bliver til to niveauer.
            const values = ids.map(id => valueOf(byId.get(id)?.[attr])).filter(value => value !== null);
            const distinct = new Set(values);
            const sharesValue = values.some((value, index) => values.indexOf(value) !== index);
            if (spreading ? !sharesValue : distinct.size < 2) continue;
            const names = ids.map(id => memberDisplayName(id, cls.data, state.displayColumn)).join(', ');
            notes.push(`${ruleTypeLabel(type)} på "${attr}": ${names} skal sammen, og `
                + (spreading ? 'mindst to deler samme værdi' : 'de har forskellige værdier')
                + ' i kolonnen.');
            break;
        }
    }
    if (!notes.length) return null;
    return {
        id: `hint:together-cost:${notes.join('|')}`,
        kind: 'info',
        text: `${notes.join(' ')} Aftalen kan begrænse fordelingen. Om reglen kan opfyldes, `
            + 'afhænger også af resten af klassen og gruppestørrelsen.',
    };
});

// Alle beskeder i fast rækkefølge; de tomme (null) falder fra til sidst.
const allHints = computed(() => [
    unnamedStudentHint.value,
    ...numericRuleOnTextHint.value,
    ...ruleWithoutValueHint.value,
    matrixExcludedRuleHint.value,
    tooManyGroupsHint.value,
    topicRoundingHint.value,
    topicCountMismatchHint.value,
    matrixDriftHint.value,
    // Efter en umulig kørsel står Skal sammen-advarslen også OVER grupperne
    // (beskeden peger dér hen); opskriftens udgave kommer fra check().
    engineTogetherHint.value,
    togetherRuleCostHint.value,
    brokenAvoidHint.value,
    brokenTogetherHint.value,
    // Motorens check(): advarslerne om reglerne og aftalerne (listen ved
    // engineCheckHints ovenfor). null, mens motoren hentes første gang.
    ...(engineCheckHints.value || []),
    // … og det, prøvekørslen i baggrunden fandt oveni (trialHints ovenfor),
    // eller, efter Dan grupper, det sidste kørsel sagde (lastRunHints).
    ...trialHints.value,
    ...lastRunHints.value,
].filter(Boolean));

// Vis kun de beskeder, læreren ikke har klikket væk.
const hints = computed(() => allHints.value.filter(h => !dismissedIds.value.has(h.id)));
// Den nye motor ser på dem, så en besked ikke står to gange (nextEngine.js).
provideRecipeHintIds(() => hints.value.map(h => h.id));

// ─── De to udsnit, brugerfladen viser ──────────────────────────────────────
// Beskeder med en `anchor` hører til en knap i båndet og vises som en
// markering DÉR. Alt andet bliver i banneret over grupperne.
//
// HVORFOR IKKE OGSÅ EN "BEMÆRK N"-SKUFFE til resten: efter forankringen af de
// to måltals-beskeder og fjernelsen af "Du har låst N grupper" er der ÉN
// info-besked tilbage — at N elever står som "(uden navn)" på hvert eneste
// kort. Den er ikke en bagatel, man kan folde sammen; den betyder, at
// gruppekortene er ulæselige. En skuffe til én besked, der alligevel skal ses
// med det samme, er en knap for meget.
const bannerHints = computed(() => hints.value.filter(h => !h.anchor));

/** Beskeder forankret ved ét bestemt sted, fx ANCHOR_TARGET. */
function hintsFor(anchor) {
    return hints.value.filter(h => h.anchor === anchor);
}

/** Noterne ved hver regellinje: { [plads i klassens regelliste]: [hint, …] }. */
const ruleHints = computed(() => {
    const out = {};
    for (const h of hints.value) {
        if (!h.anchor?.startsWith(ANCHOR_RULE)) continue;
        const at = Number(h.anchor.slice(ANCHOR_RULE.length));
        (out[at] ||= []).push(h);
    }
    return out;
});

export {
    allHints, hints, dismissedIds, dismiss, reshowTogetherHint,
    bannerHints, hintsFor, ruleHints, ANCHOR_TARGET,
};
