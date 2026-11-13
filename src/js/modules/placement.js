// placement.js — hvor skal ÉN elev (en efternøler eller en fraværende, der
// kommer tilbage) sættes ind i grupper, der allerede er dannet? Bruges af
// LatecomerModal.
//
// Prioritering (vigtigst først — vægtene er adskilt i størrelsesordener,
// så et højere niveau aldrig kan overtrumfes af et lavere):
// 1. Skal sammen (×10.000.000.000) — en aftale er lærerens KRAV, ikke en vægt.
//    Motoren pakker aftaler som hele enheder, før noget andet afgøres; her
//    trækker de eleven hen til dem, hun har en aftale med
// 2. Emne med færrest elever (×100.000.000) — så matrixfordelingen går op.
// 3. Opdel (×20.000.000) — en gruppe må kun rumme én værdi. Strukturel som i
//    motoren, der deler klassen i puljer, før noget andet sker
// 4. "Adskil altid" (×5.000.000) — vejer tungest af REGLERNE, som i motoren,
//    hvor den er det første trin i rangordenen (`levelPlan` i
//    motor/engine/rules.js), før undgåelserne og før matrixens stamgrupper.
//    Opskriften lover: "brydes kun, hvis intet andet er muligt"
// 5. Matrix: én pr. stamgruppe (×500.000). I matrix-visningen findes der
//    ingen emner og ingen Opdel (se placementRules); dér holder dette trin
//    styr på "én pr. kilde", som motoren har som sit eget trin (kilderne)
// 6. Undgåelser OG almindelige Adskil-regler (×50.000) — brydes KUN når et
//    højere hensyn tvinger det. Læreren får så en advarsel i stedet for en
//    blokering (håndteres i LatecomerModal)
// 7. Mindste gruppe (×100) — balance inden for emnet
// 8. Øvrige regler som svag tiebreaker: Fordel, Klyng, Saml, Balancér og
//    Ensartede — leddet er afgrænset til under 100, så det aldrig kan
//    overtrumfe niveau 7 (se nedenfor)
//
// "Adskil altid" lå før på samme vægt som en almindelig Adskil og en
// undgåelse, og i matrix under stamgrupperne. Så kunne en efternøler i
// matrix blive sat ved en, hun ALTID skal holdes fra, for at undgå to fra
// samme stamgruppe (forslag 91, Kenneth sagde ja 13/11 2026).
//
// HVORFOR HELE REGELSÆTTET OG IKKE KUN FORDEL/KLYNG: dialogen lover læreren,
// at systemet "finder den bedste gruppe". Indtil nu så den kun på emne,
// undgåelser, gruppestørrelse, Fordel og Klyng — så en efternøler kunne blive
// sat i en gruppe, der brød en Opdel-regel, en Adskil-regel eller en aftale,
// uden at noget sagde fra. Værst var aftalen: motoren behandler den som et
// krav, og placeringen kendte den slet ikke.
//
// GENNEMGÅENDE: alt der måles på kolonner og pladser (niveau 2-8)
// tæller kun de elever, der FAKTISK sidder i gruppen — se isPresentMember()
// nedenfor. Elev↔elev-aftalerne (niveau 1 og undgåelserne i niveau 6) tæller
// bevidst også de fraværende: de er beslutninger om gruppens sammensætning,
// og stamgrupperne lever videre efter timen.

import { RULE_TYPES, MATRIX_EXCLUDED_RULES, findTopicIndex, memberIdStr, cellNumber, applyColumnOrders, valueKey } from './utils.js';

// Vægtene, samlet ét sted. De skal blive ved med at være adskilt i
// størrelsesordener — ellers kan to lavere hensyn lægge sig sammen og
// overtrumfe et højere, og så holder prioriteringen ovenfor ikke.
const W_TOGETHER  = 10_000_000_000;
const W_TOPIC     = 100_000_000;
const W_AGGREGATE = 20_000_000;
const W_STRICT    = 5_000_000;   // "Adskil altid"
const W_SOURCE    = 500_000;     // matrix: én pr. stamgruppe/emne
const W_AVOID     = 50_000;      // undgåelser og almindelig "Adskil"
const W_SIZE      = 100;
const W_RULES     = 90;          // loft for hele tiebreaker-leddet

// memberIdStr hentes fra utils.js. Den stod her i en anden, ordret identisk
// kopi, og LatecomerModal hentede den herfra, mens groupActions, overview og
// lookups hentede den fra utils — to steder at rette, hvis reglen for hvad et
// medlem ER nogensinde ændrer sig. Nu er der ét svar.

/**
 * Opslagskort: id → elevrække, bygget på DEN kolonne kalderen bruger som id.
 *
 * `buildStudentIndex()` i utils.js gør det samme, men altid på `_rowId`.
 * placement.js er med vilje skrevet mod en id-kolonne kalderen bestemmer —
 * det er sådan unit-testene kan køre på "Navn" — så kortet bygges her.
 *
 * HVORFOR ET KORT: regel-leddet nedenfor slog hver eneste medlem op med
 * `allStudents.find()`, altså en gennemløbning af HELE elevlisten pr. medlem
 * pr. regel pr. gruppe. Med 500 elever, 20 grupper og tre regler er det ~750
 * tusind sammenligninger for ÉN placering — og læreren kan vælge tyve elever
 * ad gangen. Samme fund som gruppekortene havde (se lookups.js).
 *
 * Første række vinder ved dublet-id — samme svar som `.find()` gav.
 */
function buildIndex(rows, idCol) {
    const map = new Map();
    for (const s of (Array.isArray(rows) ? rows : [])) {
        if (!s) continue;
        const id = String(s[idCol] ?? '').trim();
        if (id && !map.has(id)) map.set(id, s);
    }
    return map;
}

/**
 * Sidder medlemmet der i dag?
 *
 * Fraværende elever bliver STÅENDE i `g.members` — fluebenet sætter
 * `_excluded` på elevrækken, gruppen røres ikke. `g.members.length` er derfor
 * ikke gruppens størrelse i lokalet, og netop denne modal bruges typisk mens
 * flere elever er væk: den er lavet til at sætte en fraværende tilbage.
 * `generation.js` traf det samme valg for sin emne-LPT (`countPresentMembers`)
 * med samme begrundelse — men placeringen her talte alle med, så en gruppe med
 * tre fraværende så ud til at være fuld, og efternøleren blev sendt et andet
 * sted hen.
 *
 * Et medlem vi ikke kan finde en række til (spøgelse) tælles MED. Vi kan ikke
 * spørge en række der ikke findes, og et ctx uden elevrækker ville ellers
 * klappe hver eneste gruppe ned til størrelse nul. Samme valg som
 * `isMemberAbsent()` i utils.js: et spøgelse er ikke fraværende.
 */
const isPresentMember = (mIdStr, byId) => {
    const row = byId.get(mIdStr);
    return !(row && row._excluded);
};

/** Antal medlemmer der faktisk sidder i gruppen. */
function countPresent(group, byId) {
    let n = 0;
    for (const m of (group.members || [])) {
        if (isPresentMember(memberIdStr(m), byId)) n++;
    }
    return n;
}

/**
 * Kategorisk værdi, normaliseret til den ækvivalensklasse gruppedannelsen
 * selv bruger.
 *
 * Motoren sammenligner værdier med `normalizeText()` (motor/engine/values.js):
 * NFC-form, trimmet og med små bogstaver — "Dreng", "dreng" og " Dreng " er
 * ét og samme svar, når grupperne dannes. `valueKey()` i utils.js er appens
 * udgave af samme nøgle. Tiebreakeren her sammenlignede før uden NFC, så et
 * "ø" skrevet som o + streg (fra en Mac-kopi) kunne være to værdier her og én
 * i motoren.
 *
 * En tom celle er IKKE en kategori (samme som motorens `normalizeText`, der
 * svarer null) — den returnerer `null` og tælles hverken som match eller som
 * nævner. `valueKey` selv svarer '' for en tom celle, så det tjekkes her.
 */
function normValue(v) {
    if (v === null || v === undefined) return null;
    const key = valueKey(v);
    return key === '' ? null : key;
}

/**
 * De regler, placeringen skal regne med i den visning, læreren står i.
 *
 * I matrix-visningen sender appen ALDRIG en "Opdel" til motoren
 * (`MATRIX_EXCLUDED_RULES`, kontrakten version 3 — se buildEngineInput i
 * nextEngine.js). Opskriften tilbyder den ikke, men en ældre gemt eller
 * importeret matrixregel kan stadig have den. Placeringen læste den alligevel:
 * en efternøler blev holdt væk fra grupper med en anden værdi i kolonnen (med
 * en vægt over undgåelserne og gruppestørrelsen), og Balancér blev målt mod
 * holdets snit i stedet for klassens — efter en opdeling, motoren aldrig
 * lavede (13/11 2026, 108. gennemsyn).
 */
export function placementRules(rules, isMatrix) {
    const list = Array.isArray(rules) ? rules : [];
    if (!isMatrix) return list;
    return list.filter(r => !MATRIX_EXCLUDED_RULES.includes(r?.type || r?.name));
}

/**
 * "Adskil"-reglerne, der kan sige noget om `student`: dem, hvor eleven har en
 * af de værdier, læreren har valgt. Bruges både af scoringen og af advarslen
 * bagefter (`brokenSeparateRules`), så de to altid er enige.
 */
function separateRulesFor(student, rules) {
    const out = [];
    for (const r of (rules || [])) {
        const type = r?.type || r?.name;
        if (type !== RULE_TYPES.SEPARATE && type !== RULE_TYPES.STRICT_SEPARATE) continue;
        const col = r.column || r.attribute;
        if (!col) continue;
        const studVal = normValue(student[col]);
        if (studVal === null) continue;
        // "Adskil" gælder KUN de værdier, læreren har valgt — det er den
        // eneste regeltype, hvor værdien betyder noget hele vejen ned
        // gennem motoren (se RULES_WITHOUT_VALUES i utils.js). Har eleven
        // ikke en af dem, kan reglen ikke sige noget om hende.
        const values = Array.isArray(r.values) ? r.values : (r.value ? [r.value] : []);
        const wanted = new Set(values.map(normValue).filter(v => v !== null));
        if (!wanted.size || !wanted.has(studVal)) continue;
        out.push({ col, wanted, strict: type === RULE_TYPES.STRICT_SEPARATE });
    }
    return out;
}

/**
 * De "Adskil"-regler, eleven bryder ved at sidde i `group`: for hver regel
 * kolonnen, om det er "Adskil altid", og id'erne på dem i gruppen, der har en
 * af de valgte værdier. Kun dem, der SIDDER der i dag, tæller — samme måling
 * som scoringen nedenfor.
 *
 * Findes, fordi placeringen lovede læreren en advarsel, når en undgåelse
 * ELLER en Adskil-regel må brydes, men LatecomerModal kun advarede om
 * undgåelser og aftaler: to ordstyrere i samme gruppe skete i stilhed.
 */
export function brokenSeparateRules(student, group, { idCol, rules = [], allStudents = [] }) {
    const byId = buildIndex(allStudents, idCol);
    const studId = String(student[idCol] ?? '').trim();
    const out = [];
    for (const r of separateRulesFor(student, rules)) {
        const ids = [];
        for (const m of (group.members || [])) {
            const mIdStr = memberIdStr(m);
            if (mIdStr === studId || !isPresentMember(mIdStr, byId)) continue;
            const mate = byId.get(mIdStr);
            if (!mate) continue;
            const mv = normValue(mate[r.col]);
            if (mv !== null && r.wanted.has(mv)) ids.push(mIdStr);
        }
        if (ids.length) out.push({ column: r.col, strict: r.strict, ids });
    }
    return out;
}

/**
 * Id'erne på dem i `group`, eleven skal undgå (undgåelses-aftalerne). Eleven
 * er aldrig i konflikt med sig selv — det tæller, når en fraværende, der
 * stadig står i gruppen, sættes tilbage.
 *
 * BEMÆRK at fraværende medlemmer tæller MED her, i modsætning til de tre
 * andre niveauer. `brokenSeparations()` i utils.js gør det modsatte — men
 * den beskriver lokalet i dag (badget på gruppekortet), mens en undgåelse er
 * en beslutning om gruppens sammensætning, og stamgrupperne lever videre
 * efter timen. Tav vi om en fraværende, ville efternøleren blive sat ved
 * siden af netop den, hun skal undgå — i stilhed, og det er den fejltype
 * undgåelses-advarslerne findes for.
 */
export function separationConflictIds(student, group, { idCol, separations = [] }) {
    const studId = String(student[idCol]).trim();
    const ids = [];
    group.members.forEach(m => {
        const mIdStr = memberIdStr(m);
        if (mIdStr === studId) return;
        if (separations.some(sep => sep.ids.includes(studId) && sep.ids.includes(mIdStr))) {
            ids.push(mIdStr);
        }
    });
    return ids;
}

/**
 * De elever, `student` har en "Skal sammen"-aftale med, og som IKKE sidder i
 * `group`. Tom liste betyder, at aftalen er hel — også når eleven slet ingen
 * aftale har.
 *
 * Bruges to steder: til at trække eleven hen til sine egne (niveau 1) og til
 * at sige det højt, hvis hun alligevel måtte placeres et andet sted — fx fordi
 * de andre sidder i en låst gruppe. En brudt aftale i tavshed er præcis det,
 * motoren gør sig umage for at undgå.
 *
 * `ctx.togetherComponents` er de færdige aftale-klynger med overlap samlet
 * (`mergeTogether()` i together.js). BEMÆRK at fravær IKKE filtreres fra her,
 * i modsætning til gruppedannelsen: modalen er lavet til at sætte en fraværende
 * tilbage, så hun er stadig markeret fraværende, mens placeringen regnes ud —
 * og en fraværende partner sidder stadig i sin gruppe. Samme afvejning som
 * `separationConflictIds()` gør rede for.
 */
export function partnersOutside(student, group, { idCol, togetherComponents = [] }) {
    const studId = String(student[idCol]).trim();
    const component = togetherComponents.find(ids => ids.some(id => String(id).trim() === studId));
    if (!component) return [];
    const inGroup = new Set((group.members || []).map(memberIdStr));
    return component
        .map(id => String(id).trim())
        .filter(id => id !== studId && !inGroup.has(id));
}


/**
 * Balancér, Ensartede og Saml på en RANGERET tekstkolonne ("Lav < Middel <
 * Høj"). Gruppedannelsen regner dem med rangen 1, 2, 3 — buildEngineInput
 * (nextEngine.js) sender trinene til motoren, som selv giver hvert trin sit
 * tal. Placeringen læste
 * cellen direkte, og `cellNumber("Høj")` er ingenting: reglen blev sprunget
 * over, og efternøleren blev sat efter gruppestørrelse og lodtrækning, mens
 * gruppedannelsen havde balanceret på niveauet.
 *
 * Derfor samme trin her som i motorens input (`rankSteps()` i utils.js, som
 * både `applyColumnOrders()` og buildEngineInput bruger), så "hvad tæller som
 * rangeret" (store/små bogstaver, mellemrum, dubletter, ét trin, en rangering
 * ingen elev rammer) ikke kan drive fra gruppedannelsen. Rækkerne kopieres; klassens
 * egne rækker røres ikke.
 *
 * Eleven sendes med i rækkerne, hvis kalderen ikke allerede har hende dér
 * (unit-testene gør det tit), så hun også får sin rang.
 */
function rankForPlacement(student, rules, allStudents, columnOrders) {
    if (!columnOrders) return { rules, allStudents, student };
    const at = allStudents.indexOf(student);
    const rows = at === -1 ? [...allStudents, student] : allStudents;
    const ranked = applyColumnOrders(rows, rules, columnOrders);
    if (ranked.data === rows) return { rules, allStudents, student };
    return {
        rules: ranked.rules,
        allStudents: at === -1 ? ranked.data.slice(0, -1) : ranked.data,
        student: ranked.data[at === -1 ? ranked.data.length - 1 : at],
    };
}

/**
 * Find den bedste ulåste gruppe til `student`.
 *
 * @param {object} student     - elevens række i klassens data
 * @param {Array}  groups      - alle grupper (en låst gruppe vælges aldrig,
 *                               men dens medlemmer TÆLLER med i emne-optællingen
 *                               — samme valg som generation.js' LPT, der
 *                               begynder optællingen med de låste grupper)
 * @param {object} ctx         - { idCol, rules, separations, classTopics, allStudents,
 *                               togetherComponents, sourceById, columnOrders }
 *                               `togetherComponents`: færdige aftale-klynger
 *                               (se partnersOutside). `sourceById`: Map fra
 *                               elev-id til kilde-mærke i matrix-visningen —
 *                               samme mærke, motoren lægger i
 *                               __MatrixSource__. Begge er valgfri; uden dem
 *                               opfører funktionen sig som før.
 *                               `columnOrders`: klassens rangering af
 *                               tekstkolonner (Lav < Middel < Høj) — se
 *                               rankForPlacement() nedenfor.
 * @returns den valgte gruppe, eller null når ingen gruppe er ulåst
 */
export function findBestGroup(student, groups, ctx) {
    if (!groups?.length) return null;

    const unlocked = groups.filter(g => !g.locked);
    if (!unlocked.length) return null;

    // `random` kan sættes af testene, så lodtrækningen nedenfor bliver
    // forudsigelig. I appen er det altid Math.random.
    const { idCol, separations = [], togetherComponents = [], sourceById = null,
            random = Math.random } = ctx;
    // Rækker, regler og eleven selv — med rang-kolonner, hvis klassen har
    // rangeret en tekstkolonne, som en tal-regel bruger.
    const { rules, allStudents, student: stud } = rankForPlacement(
        student, ctx.rules || [], ctx.allStudents || [], ctx.columnOrders);
    student = stud;
    const classTopics = (ctx.classTopics || []).filter(t => t && String(t).trim());
    const byId = buildIndex(allStudents, idCol);

    // Antal elever pr. emne i ALLE grupper (låste og ulåste). Emnet slås op
    // med findTopicIndex, så forskelle i store/små bogstaver mellem klassens
    // emneliste og gruppens emne ikke stille slår prioriteringen fra.
    let topicTotals = null;
    let maxTopicTotal = 0;
    if (classTopics.length > 0) {
        topicTotals = classTopics.map(() => 0);
        groups.forEach(g => {
            const idx = findTopicIndex(classTopics, g.topic);
            if (idx !== -1) topicTotals[idx] += countPresent(g, byId);
        });
        maxTopicTotal = Math.max(...topicTotals);
    }

    // Reglerne sorteres ÉN gang i stedet for pr. gruppe. En regel på en kolonne
    // eleven ikke har svaret i, kan ikke sige noget om hvor hun hører hjemme,
    // og ryger fra her — det gælder alle tre bunker.
    const tieRules = [];      // niveau 8: svag retning (fordel/klyng/saml)
    const numericRules = [];  // niveau 8: Balancér og Ensartede
    const hardRules = [];     // niveau 3, 4 og 6: Opdel og Adskil

    // Hvem Balancér skal ligne: de elever, der er HER i dag (plus eleven selv,
    // som kan stå som fraværende, mens hun sættes tilbage) — og under Opdel
    // kun dem på elevens eget hold. Det er det, gruppedannelsen gør:
    // fraværende sendes aldrig med, og under Opdel dannes hvert hold for sig
    // og måles mod sit eget snit (puljens snit, measureBalance i
    // motor/engine/rules.js). Målt
    // mod hele klassen blev en svag elev på et stærkt hold sat i holdets
    // SVAGESTE gruppe — den, der kom tættest på klassens lavere snit.
    const studId = String(student[idCol] ?? '').trim();
    const countsHere = row => !row._excluded || String(row[idCol] ?? '').trim() === studId;
    const splitRule = rules.find(r => (r.type || r.name) === RULE_TYPES.AGGREGATE);
    const splitCol = splitRule ? (splitRule.column || splitRule.attribute) : null;
    const studSplit = splitCol ? normValue(student[splitCol]) : null;

    for (const r of rules) {
        const col = r.column || r.attribute;
        if (!col) continue;
        const type = r.type || r.name;

        if (type === RULE_TYPES.BALANCE || type === RULE_TYPES.MINIMIZEDIFF) {
            const studNum = cellNumber(student[col]);
            if (studNum === null) continue;
            // Tærsklen for "tæt på" skal betyde det samme på en 1-12-skala og
            // en 0-100-skala, så afstanden måles som en andel af klassens
            // spændvidde — samme greb som motorens tærskel. Spændvidden
            // regnes over hele klassen, snittet kun over elevens hold (se
            // `countsHere` ovenfor) — samme deling som motorens tærskel.
            let min = Infinity;
            let max = -Infinity;
            let sum = 0;
            let count = 0;
            for (const row of allStudents) {
                if (!row || !countsHere(row)) continue;
                const v = cellNumber(row[col]);
                if (v === null) continue;
                if (v < min) min = v;
                if (v > max) max = v;
                if (studSplit !== null && normValue(row[splitCol]) !== studSplit) continue;
                sum += v;
                count += 1;
            }
            if (!count) continue;
            const range = max - min;
            numericRules.push({
                col,
                studNum,
                range: range > 0 ? range : 1,
                targetMean: sum / count,
                balance: type === RULE_TYPES.BALANCE,
            });
            continue;
        }

        const studVal = normValue(student[col]);
        if (studVal === null) continue;

        if (type === RULE_TYPES.AGGREGATE) {
            hardRules.push({ col, studVal, aggregate: true });
        } else if (type === RULE_TYPES.SEPARATE || type === RULE_TYPES.STRICT_SEPARATE) {
            // Samlet nedenfor via separateRulesFor — samme udvalg som advarslen.
            continue;
        } else if (type === RULE_TYPES.DISTRIBUTE) {
            tieRules.push({ col, studVal, weight: -1 });
        } else if (type === RULE_TYPES.CLUSTER) {
            tieRules.push({ col, studVal, weight: 2 });
        } else if (type === RULE_TYPES.GROUP_SORT) {
            // Saml trækker samme vej som Klyng, men blødere — i motoren er
            // Klyng et af de tunge trin og Saml det nederste (levelPlan).
            tieRules.push({ col, studVal, weight: 1 });
        }
    }
    for (const r of separateRulesFor(student, rules)) {
        hardRules.push({ col: r.col, wanted: r.wanted, aggregate: false, strict: r.strict });
    }

    // Elevens aftale-partnere — hentet én gang, ikke pr. gruppe. Den tomme
    // gruppe som andet argument giver netop "alle partnere", uanset hvor de
    // sidder.
    const allPartners = togetherComponents.length
        ? partnersOutside(student, { members: [] }, { idCol, togetherComponents })
        : [];

    // Elevens eget kilde-mærke i matrix-visningen. `null` betyder "ingen
    // matrix" eller "eleven står ikke i nogen stamgruppe" — og så er der ingen
    // kilde at sprede.
    const studentSource = sourceById
        ? (sourceById.get(String(student[idCol]).trim()) ?? null)
        : null;

    // ALLE grupper med den højeste score — der trækkes lod mellem dem til sidst.
    let bestGroups = [];
    let bestScore = -Infinity;

    unlocked.forEach(g => {
        let score = 0;
        const present = countPresent(g, byId);

        // Niveau 1: Skal sammen. Hver partner, der allerede sidder her, trækker
        // eleven hen til gruppen. Kan aftalen ikke opfyldes — partneren sidder
        // i en LÅST gruppe, som ikke er en kandidat — vinder ingen gruppe
        // noget her, og LatecomerModal siger det højt bagefter.
        if (allPartners.length) {
            const here = new Set((g.members || []).map(memberIdStr));
            score += allPartners.filter(id => here.has(id)).length * W_TOGETHER;
        }

        // Niveau 2 og 5: emnet med færrest elever — eller, i matrix-visningen,
        // den gruppe der ikke i forvejen har en elev fra samme stamgruppe.
        if (topicTotals) {
            const idx = findTopicIndex(classTopics, g.topic);
            if (idx !== -1) {
                score += (maxTopicTotal - topicTotals[idx]) * W_TOPIC;
            }
        } else if (sourceById && studentSource !== null) {
            // Matrixens hele pointe: én fra hver stamgruppe. Motoren har det
            // som sit eget trin ("kilderne") ud fra matrix-delen af input, som
            // ikke er en regel i lærerens liste — så her genskabes det ud fra
            // kilde-mærkerne, kalderen sender med (matrixSourceById).
            let sameSource = 0;
            for (const m of g.members) {
                const mIdStr = memberIdStr(m);
                if (!isPresentMember(mIdStr, byId)) continue;
                if (sourceById.get(mIdStr) === studentSource) sameSource++;
            }
            score -= sameSource * W_SOURCE;
        }

        // Niveau 3, 4 og 6: Opdel, "Adskil altid" og Adskil. Alle måles på
        // dem der sidder der.
        for (const r of hardRules) {
            const counts = new Map();
            let matching = 0;
            let valued = 0;
            for (const m of g.members) {
                const mIdStr = memberIdStr(m);
                if (!isPresentMember(mIdStr, byId)) continue;
                const mate = byId.get(mIdStr);
                if (!mate) continue;
                const mv = normValue(mate[r.col]);
                if (mv === null) continue;
                valued++;
                if (r.aggregate) counts.set(mv, (counts.get(mv) || 0) + 1);
                else if (r.wanted.has(mv)) matching++;
            }
            if (r.aggregate) {
                // "Hvor mange sidder ved det forkerte bord". Motoren kan ikke
                // bryde Opdel (puljerne dannes hver for sig), men her er
                // grupperne allerede dannet, så det måles. Forskellen FØR og
                // EFTER eleven sættes ind er det, placeringen koster.
                const before = valued ? valued - Math.max(...counts.values()) : 0;
                counts.set(r.studVal, (counts.get(r.studVal) || 0) + 1);
                const after = (valued + 1) - Math.max(...counts.values());
                score -= (after - before) * W_AGGREGATE;
            } else {
                // "Adskil": højst én med værdien pr. gruppe. Sidder der en i
                // forvejen, er pladsen her et brud. En almindelig Adskil vejer
                // som en undgåelse (samme slags ønske); "Adskil altid" vejer
                // over undgåelserne og stamgrupperne, som i motoren.
                score -= matching * (r.strict ? W_STRICT : W_AVOID);
            }
        }

        // Niveau 6: undgåelser (blødt — et højere hensyn kan tvinge det, og så
        // advarer LatecomerModal i stedet for at blokere)
        score -= separationConflictIds(student, g, { idCol, separations }).length * W_AVOID;

        // Niveau 7: helst den mindste gruppe (balance inden for emnet)
        score -= present * W_SIZE;

        // Niveau 8: reglerne (Fordel spreder, Klyng og Saml samler).
        //
        // Leddet er bevidst AFGRÆNSET til under 100 — ét skridt på
        // gruppestørrelsen. Før talte reglerne rå medlemmer (×10/×20), og så
        // holdt prioriteringen øverst i filen ikke: to klyng-regler i en
        // gruppe på otte gav 8×20×2 = 320 point, nok til at overtrumfe en
        // forskel på tre elever i gruppestørrelse. Efternøleren blev sendt
        // hen i den gruppe der i forvejen var størst, selvom "mindste gruppe"
        // står HØJERE i prioriteringen end reglerne.
        //
        // I stedet måles hver regel som en ANDEL (0-1) af gruppens medlemmer
        // og vægtes 1 for fordel og 2 for klyng — samme indbyrdes forhold som
        // før. Gennemsnittet ganges med 90, så leddet aldrig kan nå 100,
        // uanset hvor mange regler eller hvor stor gruppen er.
        //
        // Nævneren er de medlemmer der SIDDER DER og HAR svaret — ikke
        // gruppestørrelsen: en gruppe på seks, hvor to celler er tomme, skal
        // måles på de fire der har et svar (motoren springer også tomme
        // celler over, measureDistribute).
        let ruleScore = 0;
        let ruleWeight = 0;
        for (const r of tieRules) {
            let sameCount = 0;
            let valued = 0;
            for (const m of g.members) {
                const mIdStr = memberIdStr(m);
                if (!isPresentMember(mIdStr, byId)) continue;
                const mate = byId.get(mIdStr);
                if (!mate) continue;
                const mv = normValue(mate[r.col]);
                if (mv === null) continue;
                valued++;
                if (mv === r.studVal) sameCount++;
            }
            // Ingen at måle på — hverken en tom gruppe eller en gruppe hvor
            // ingen har svaret siger noget om, hvor eleven hører hjemme. Den
            // tomme gruppe er i forvejen den mest attraktive via "mindste
            // gruppe" og skal ikke straffes her.
            const ratio = valued > 0 ? sameCount / valued : 0;
            const weight = Math.abs(r.weight);
            ruleScore += ratio * r.weight;
            ruleWeight += weight;
        }
        // Balancér og Ensartede måler tal og har ingen "samme værdi" at tælle.
        // De regnes som en NÆRHED i 0-1: hvor tæt kommer gruppen på sit mål,
        // hvis eleven sættes ind her. Samme 0-1-skala som de kategoriske, så
        // loftet på hele leddet stadig holder.
        for (const r of numericRules) {
            const vals = [];
            for (const m of g.members) {
                const mIdStr = memberIdStr(m);
                if (!isPresentMember(mIdStr, byId)) continue;
                const mate = byId.get(mIdStr);
                if (!mate) continue;
                const v = cellNumber(mate[r.col]);
                if (v !== null) vals.push(v);
            }
            // En tom gruppe (eller en uden tal) siger intet om, hvor eleven
            // hører hjemme — og skal ikke straffes for det. Samme valg som de
            // kategoriske regler ovenfor.
            if (!vals.length) continue;
            const meanWith = (vals.reduce((a, b) => a + b, 0) + r.studNum) / (vals.length + 1);
            // Balancér: gruppens gennemsnit skal ligne klassens (under Opdel: holdets).
            // Ensartede: gruppen skal ligne sig selv, altså eleven skal ligne
            // dem, der sidder der.
            const target = r.balance ? r.targetMean : (vals.reduce((a, b) => a + b, 0) / vals.length);
            const distance = Math.abs((r.balance ? meanWith : r.studNum) - target) / r.range;
            ruleScore += Math.max(0, 1 - distance);
            ruleWeight += 1;
        }
        if (ruleWeight > 0) score += (ruleScore / ruleWeight) * W_RULES;

        if (score > bestScore) { bestScore = score; bestGroups = [g]; }
        else if (score === bestScore) bestGroups.push(g);
    });

    // Står flere grupper 100 % lige, trækkes der lod. Før vandt den første:
    // uden regler og med lige store grupper gik en efternøler derfor altid
    // til Gruppe 1. Kun helt ens scorer tæller — er én gruppe bare en smule
    // bedre, vinder den stadig.
    return bestGroups[Math.floor(random() * bestGroups.length)] ?? null;
}
