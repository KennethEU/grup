// runHistory.js — de seneste gruppedannelser i DENNE fane.
//
// Historik-fanen gemmer en gruppedannelse, men kun hvis læreren huskede at
// trykke "Gem" FØRST. Det er præcis den forudseenhed man ikke har, når man
// står i klassen og prøver "en gang til". Her lægges et snapshot til side
// automatisk, hver gang en generering er ved at overskrive grupperne.
//
// TO TING DER ER VÆRD AT VIDE OM DESIGNET:
//
// 1. Vi gemmer den UDGÅENDE tilstand — den der er ved at blive smidt væk.
//    Listen bliver dermed bogstaveligt "kørsler du kan gå tilbage til": der
//    er ingen forvirrende "nu"-række, og efter den allerførste generering er
//    listen tom, fordi der ikke ER noget at gå tilbage til.
//
// 2. Et snapshot gemmer ALT om kørslen, men gendanner ikke alt. Grupperne og
//    deres emner ER resultatet og skrives altid tilbage. Regler, indstillinger
//    og undgåelser er INPUTTET og gendannes kun, hvis læreren beder om det
//    (`alsoSettings`) — for det typiske tilfælde er "jeg rettede en
//    regel, genererede, og vil have de gamle grupper tilbage MEN beholde min
//    rettelse". Elevrækkerne gendannes aldrig; se hvorfor ved snapshotData().

import { state } from './state.js';
import * as storage from './storage.js';
import {
    memberDisplayName, memberIdStr, ROW_ID, homeGroupFingerprint, groupCountText,
    mergeClassTopics, classTopicSpelling, newUuid,
} from './utils.js';
import { cancelPickUp } from '../../composables/useDragDrop.js';
import * as replay from './replay.js';

/** Hvor mange kørsler der huskes. Nok til en typisk time. */
export const MAX_RUNS = 5;

/**
 * Dyb kopi via JSON — bevidst IKKE structuredClone.
 *
 * structuredClone kaster DataCloneError på en Vue-proxy, og gruppelisterne
 * INDEHOLDER proxyer: flere steder i appen skrives `state.storedStandardGroups
 * = [...groups]` (LatecomerModal, addEmptyGroup, deleteGroup), og spredning af
 * et reaktivt array lægger proxy-objekter ned i det nye array. toRaw() hjælper
 * ikke — den pakker kun det yderste lag ud, ikke elementerne.
 *
 * JSON.stringify læser derimod gennem proxyen uden at blinke. Snapshottene er
 * små (en klasse ad gangen) og indeholder kun tekst, tal og lister, så
 * JSON-vejen koster intet og kan ikke fejle på den her måde.
 */
const deepClone = (v) => JSON.parse(JSON.stringify(v));

/** Klon der tåler null/undefined (de fleste felter er valgfrie på en klasse). */
function cloneOrNull(v) {
    if (v === null || v === undefined) return null;
    return deepClone(v);
}

/**
 * Navnene på gruppernes medlemmer, slået op NU.
 *
 * Et medlem bæres rundt som _rowId ("r7"), og navnet slås normalt op i
 * elevlisten. Slettes eleven inden læreren går tilbage, er der ingen række
 * at slå op i, og kortet ville vise "(uden navn)". Derfor fryses navnene her
 * — samme greb som saveCurrentSession() bruger i history.js.
 */
function captureNames(groupSets) {
    // Object.create(null): nøglen er medlemmets id, og i grupper gemt før
    // _rowId fandtes er det elevens NAVN. Med et almindeligt objekt svarede
    // `names[id]` med en arvet funktion på et navn der ikke var frosset endnu
    // — så navnet blev aldrig gemt, og withFrozenNames() nedenfor læste
    // funktionen tilbage og satte den som elevens navn på gruppekortet.
    const names = Object.create(null);
    groupSets.forEach(groups => {
        (groups || []).forEach(g => {
            (g.members || []).forEach(m => {
                const id = memberIdStr(m);
                if (!id || names[id]) return;
                const name = memberDisplayName(
                    m, state.currentClass?.data, state.displayColumn);
                if (name) names[id] = name;
            });
        });
    });
    return names;
}

/**
 * Sæt de frosne navne PÅ medlemmerne — ellers bliver de aldrig brugt.
 *
 * Et medlem er en ren streng ("r7"), og gruppekortet slår navnet op i
 * elevlisten (`memberDisplayName`). Er eleven slettet siden kørslen, findes
 * rækken ikke længere, og kortet skriver "(uden navn)" — også selvom
 * snapshottet ved præcis hvad hun hed. Navnene blev altså frosset ned uden
 * nogensinde at nå skærmen.
 *
 * De slettede pakkes derfor ind som spøgelser, nøjagtig som
 * `history.restoreSession()` gør: `{ id, name, isGhost }`. `memberIdStr()`
 * svarer det samme for de to former, så låse, opslag og aftryk er upåvirkede,
 * og `GroupCard` viser spøgelses-mærket, så læreren kan se hvem der ikke er i
 * klassen længere. Elever der stadig findes, røres ikke — deres navn skal
 * komme fra visningskolonnen, så en navnerettelse siden slår igennem.
 */
function withFrozenNames(run, groups) {
    const rows = Array.isArray(state.currentClass?.data) ? state.currentClass.data : [];
    const existingIds = new Set(
        rows.map(r => String(r?.[ROW_ID] ?? '').trim()).filter(Boolean)
    );
    return (groups || []).map(g => ({
        ...g,
        members: (g.members || []).map(m => {
            const id = memberIdStr(m);
            if (!id || existingIds.has(id)) return m;
            const name = (run.names && run.names[id])
                || (typeof m === 'object' && m !== null ? m.name : '');
            if (!name) return m;
            return { id, name: name, isGhost: true, _ghost: true };
        }),
    }));
}

/** Antal elever der er til stede lige nu (til listens "27 elever"-linje). */
function countPresent() {
    const rows = state.currentClass?.data;
    if (!Array.isArray(rows)) return 0;
    return rows.filter(r => r && !r._excluded).length;
}

/**
 * Byg snapshottet af den NUVÆRENDE tilstand.
 *
 * Elevrækkerne (`currentClass.data`) er bevidst IKKE med. Tre grunde:
 * fravær ville rulle tilbage (en elev der er kommet, ville stå fraværende
 * igen), navnerettelser og "Gem som kolonne" ville også ryge, og det ville
 * skrive i den samme liste som Ctrl+Z-stakken allerede ejer. Vil man have
 * elevlisten tilbage, er det Ctrl+Z's opgave — ikke kørselshistorikkens.
 */
/**
 * Det INPUT en gruppedannelse blev lavet med: regler, indstillinger,
 * undgåelser, klasse-emner og gruppetilstand.
 *
 * Skilt ud fra snapshotData(), fordi de to ting skal læses på HVER SIT
 * tidspunkt — se markClean() nedenfor.
 */
function snapshotInputs() {
    const cls = state.currentClass || {};
    return {
        rules: cloneOrNull(cls.rules) || [],
        matrixRules: cloneOrNull(cls.matrixRules) || [],
        settings: cloneOrNull(cls.settings) || {},
        matrixSettings: cloneOrNull(cls.matrixSettings) || {},
        separations: cloneOrNull(cls.separations) || [],
        togetherGroups: cloneOrNull(cls.togetherGroups) || [],
        classTopics: cloneOrNull(cls.topics) || [],
        groupMode: state.groupMode,
    };
}

function snapshotData() {
    const cls = state.currentClass || {};
    const standard = cloneOrNull(state.storedStandardGroups);
    const matrix = cloneOrNull(state.storedMatrixGroups);

    // VIGTIGT: grupperne læses NU, men inputtet hentes fra da grupperne blev
    // dannet. pushRun() kaldes nemlig i begyndelsen af den NÆSTE generering
    // — på et tidspunkt hvor læreren typisk lige HAR ændret en regel eller
    // gruppestørrelsen. Læste vi begge dele nu, ville kørsel 1's grupper
    // blive parret med kørsel 2's indstillinger: info-linjen ville lyve, og
    // "tag alt med" ville hente de forkerte regler frem.
    const input = state._lastRunInputs || snapshotInputs();

    return {
        id: newUuid(),
        time: new Date().toISOString(),
        // Vagt mod klasseskift: et snapshot må aldrig kunne lande i en
        // anden klasse end den, det kom fra.
        classFile: cls.filename || null,

        // ── Resultatet: gendannes altid ──
        standard,
        matrix,
        // Hele emne-kortet under ét. Emner ligger BÅDE på gruppeobjektet og i
        // localStorage; tages kun det ene med, viser kortene ét emne mens
        // badges og matrixfordeling læser et andet.
        topicMap: storage.readTopicMap(),
        names: captureNames([standard, matrix]),

        // ── Inputtet: vises altid, gendannes kun på lærerens ord ──
        ...input,

        // ── Kun til visning ──
        presentCount: countPresent(),
    };
}

/**
 * Aftryk af grupperne som de så ud, da snapshottet blev taget.
 * Bruges af hasManualChanges() til at opdage, om læreren har rørt grupperne i
 * hånden siden — så vi kun advarer, når der faktisk er noget at miste.
 *
 * Aftrykket skal dække ALT hvad restoreRun() overskriver. EMNET er med af
 * netop den grund: gendannelsen lægger hele emnekortet tilbage
 * (replaceTopicMap), så et emne læreren har rettet eller byttet rundt på
 * bagefter, forsvinder lige så stille som en flyttet elev. Uden emnet i
 * aftrykket sagde hasManualChanges() "ingen ændringer", og advarslen udeblev.
 *
 * Emnet læses samme sted som gruppekortet viser det: emnekortet i lageret er
 * autoritet, gruppeobjektets eget felt er reserven.
 */
function setFingerprint(groups, topicLookup) {
    return (groups || []).map(g => {
        const topic = topicLookup(g) || '';
        return `${g.name}:${g.locked ? 'L' : ''}:${topic}:${(g.members || []).map(memberIdStr).join(',')}`;
    }).join('|');
}

/** Emnet som det står NU — lageret er autoritet, gruppens eget felt reserven. */
const currentTopic = (prefix) => (g) => storage.getTopic(g.name, prefix) || g.topic || '';

/**
 * Emnet som det stod i KØRSLEN. En kørsel bærer sit eget emnekort med sig, og
 * det er dét der lægges tilbage ved en gendannelse — ikke det der ligger i
 * lageret lige nu. Slog vi emnet op i lageret for begge sider, ville to
 * kørsler med hvert sit emne se ens ud.
 */
const topicInRun = (run, prefix) => (g) =>
    (run.topicMap && run.topicMap[`${prefix}${g.name}`]) || g.topic || '';

function fingerprint(standard, matrix) {
    return `${setFingerprint(standard, currentTopic('S_'))}#${setFingerprint(matrix, currentTopic('M_'))}`;
}

/**
 * Hvad sker der med ÉT gruppesæt, hvis kørslen hentes frem?
 *
 * 'unchanged'   — sættet er magen til det der står nu
 * 'changed'    — samme slags sæt, men en anden fordeling
 * 'removed' — kørslen har ingen, du har en (matrixen tømmes)
 * 'added'     — kørslen har en, du har ingen
 * 'none'       — hverken før eller efter
 */
function diffSets(runGroups, currentGroups, run, prefix) {
    const runHasSet = !!(runGroups && runGroups.length);
    const currentHasSet = !!(currentGroups && currentGroups.length);
    if (!runHasSet && !currentHasSet) return 'none';
    if (!runHasSet) return 'removed';
    if (!currentHasSet) return 'added';
    return setFingerprint(runGroups, topicInRun(run, prefix))
        === setFingerprint(currentGroups, currentTopic(prefix))
        ? 'unchanged' : 'changed';
}

/**
 * Hvad en kørsel ændrer — PR. GRUPPESÆT, målt mod det der står på skærmen nu.
 *
 * HVORFOR det skal siges højt: kørselshistorikken gemmer stamgrupper OG matrix
 * i ÉT snapshot, men forhåndsvisningen kan kun tegne det sæt læreren står i.
 * Matrixen dannes sjældnere end stamgrupperne, så flere kørsler i træk deler
 * som regel den SAMME matrix — og i matrixvisningen er de chips så helt
 * identiske: samme kort, samme info-linje. Læreren kunne hverken se forskel på
 * dem eller se, at et klik skrev stamgrupperne om bag skærmen. Hele forskellen
 * lå i det halve af snapshottet, der ikke var tegnet nogen steder.
 */
export function runChanges(index) {
    const fn = state.currentClass?.filename || null;
    const run = state._runHistory.filter(r => r.classFile === fn)[index];
    if (!run) return { standard: 'none', matrix: 'none' };
    return {
        standard: diffSets(run.standard, state.storedStandardGroups, run, 'S_'),
        matrix: diffSets(run.matrix, state.storedMatrixGroups, run, 'M_'),
    };
}

/**
 * Læg den nuværende tilstand i stakken.
 *
 * Kaldes fra executeGeneration() lige FØR grupperne overskrives — efter
 * stale-vagterne, så et forældet resultat aldrig lægger noget i stakken.
 * Har klassen ingen grupper endnu (allerførste generering), er der intet at
 * gemme, og stakken forbliver tom.
 */
export function pushRun() {
    if (!state.currentClass) return null;

    // En markeret elev hører til DEN fordeling, hun blev markeret i — og
    // pushRun() kaldes præcis ét sted: lige før fordelingen bliver skiftet ud
    // (generering, hent en tidligere kørsel, gendan grupper, gendan session,
    // "Hent de nye grupper").
    // Derfor ryddes markeringen her, ét sted, i stedet for på fem kaldesteder
    // der hver især kunne blive glemt.
    //
    // HVAD DER SKETE UDEN: markeringen overlevede en Generér. `isPicked()`
    // kræver både elev-id OG gruppenavn, så eleven lå et andet sted i den nye
    // fordeling og blev IKKE fremhævet — men `canReceivePicked` ser kun på
    // gruppeNAVNET, så "Flyt hertil" stod på alle kort undtagen det, der
    // tilfældigvis hed det samme som den gamle kildegruppe. Læreren så altså
    // fem knapper der lovede at flytte en elev, uden at nogen var markeret,
    // og et klik gjorde INTET: `moveMember()` leder efter elev-id'et i den
    // gamle gruppe, finder det ikke, og returnerer false. En død knap, der
    // blev stående til man trykkede Esc. (Ingen elev blev flyttet forkert —
    // id-opslaget holder — men tilbuddet var falsk.)
    //
    // Bemærk: dette gælder KUN når fordelingen skiftes ud. Forhåndsvisningen
    // fra kørselsmenuen (musen hen over et tal) rører ikke fordelingen, og
    // dér skal markeringen netop overleve — se isPreviewing i GroupCard.vue.
    cancelPickUp();

    // Samme tanke for en afspilning: den viser, hvordan DEN fordeling blev
    // til, der er ved at blive skiftet ud. Genereringen og "Hent de nye
    // grupper" stopper den også selv (genereringen allerede før arbejdet går
    // i gang). I dag lukker afspilleren sig, når læreren trykker et andet
    // sted, så ingen kendt vej når herind med en afspilning kørende — det her
    // er værnet for den næste vej, der skifter fordelingen ud.
    replay.stop();

    const hasGroups = (state.storedStandardGroups && state.storedStandardGroups.length)
        || (state.storedMatrixGroups && state.storedMatrixGroups.length);
    if (!hasGroups) return null;

    const snap = snapshotData();
    snap.fingerprint = fingerprint(snap.standard, snap.matrix);

    // Hopper læreren frem og tilbage mellem to kørsler, lægger hver
    // gendannelse den forladte tilstand i stakken. Er den identisk med den
    // der allerede ligger øverst, ville listen fyldes med kopier af det
    // samme — og skubbe de rigtigt gamle kørsler ud. At gå tilbage til en
    // tilstand vi allerede har, er alligevel et nulskridt.
    const newest = state._runHistory[0];
    if (newest && newest.classFile === snap.classFile && newest.fingerprint === snap.fingerprint) {
        return newest;
    }

    // Nyeste forrest, ældste ud. Vi muterer arrayet frem for at erstatte det,
    // så markRaw-referencen fra state.js bevares.
    state._runHistory.unshift(snap);
    while (state._runHistory.length > MAX_RUNS) state._runHistory.pop();
    return snap;
}

/** Er der noget at gå tilbage til i den aktuelle klasse? */
export function hasRuns() {
    return listRuns().length > 0;
}

/**
 * Letvægts-metadata til popup'en — aldrig snapshottene selv.
 * Filtreret på klasse, så en kørsel fra 2.a ikke kan vises i 3.b.
 */
export function listRuns() {
    const fn = state.currentClass?.filename || null;
    return state._runHistory
        .filter(r => r.classFile === fn)
        .map((r, i) => ({
            index: i,
            id: r.id,
            time: r.time,
            groupCount: (r.standard || []).length,
            matrixGroupCount: (r.matrix || []).length,
            hasMatrix: !!(r.matrix && r.matrix.length),
            presentCount: r.presentCount,
            rulesLabel: describeRules(r),
            // Hvad kørslen ændrer i HVERT sæt — se runChanges().
            changes: runChanges(i),
        }));
}

/** Kort menneskelig opsummering af hvad kørslen blev dannet med. */
export function describeRules(run) {
    const parts = [];
    const RULE_LABELS = {
        distribute: 'Fordel', cluster: 'Klyng', separate: 'Adskil',
        group_sort: 'Saml', split: 'Opdel', balance: 'Balancér',
    };
    (run.rules || []).forEach(r => {
        if (!r || !r.column) return;
        const name = RULE_LABELS[r.type] || r.type || 'Regel';
        parts.push(`${name} ${r.column}`);
    });

    const s = run.settings || {};
    if (run.groupMode === 'number' && s.groupTarget) {
        parts.push(groupCountText(s.groupTarget));
    } else if (s.groupTarget) {
        parts.push(`${s.groupTarget} pr. gruppe`);
    }

    if ((run.classTopics || []).length > 0) {
        parts.push(`${run.classTopics.length} emner`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'Ingen regler';
}

/**
 * Er grupperne rørt i hånden, siden det nyeste snapshot blev taget?
 * Bruges til kun at spørge "er du sikker?", når der faktisk er noget at miste.
 */
export function hasManualChanges() {
    const runs = state._runHistory.filter(r => r.classFile === (state.currentClass?.filename || null));
    if (runs.length === 0) return false;
    // Det nyeste snapshot er tilstanden FØR den seneste generering, så vi
    // kan ikke sammenligne med det. Vi sammenligner i stedet med aftrykket
    // af den nuværende tilstand, som blev lagt ned ved sidste gendannelse
    // eller generering.
    if (!state._lastGeneratedFingerprint) return false;
    return fingerprint(state.storedStandardGroups, state.storedMatrixGroups)
        !== state._lastGeneratedFingerprint;
}

/**
 * Husk hvordan grupperne så ud, OG hvad de blev dannet med, da de sidst kom
 * fra motoren. Kaldes til sidst i executeGeneration().
 *
 * Aftrykket bruges til at opdage manuelle flytninger. Inputtet gemmes her —
 * og ikke i pushRun() — fordi det er NU, det passer til grupperne på skærmen.
 */
export function markClean() {
    state._lastGeneratedFingerprint =
        fingerprint(state.storedStandardGroups, state.storedMatrixGroups);
    state._lastRunInputs = snapshotInputs();
}

/**
 * Som markClean(), men hvor kaldstedet KENDER en del af det input, grupperne
 * kom fra — og hvor det ikke er det samme som det, der står i båndet lige nu.
 *
 * Det gælder en genoplivet session (`restoreSession()`): grupperne er lavet i
 * sidste uge, men `markClean()` ville parre dem med dagens regler. Næste
 * generering lægger så den genoplivede fordeling i kørselsstakken med et
 * input, den aldrig blev dannet med — info-linjen lyver, og "tag alt med"
 * henter de forkerte regler frem. Præcis den fejl `restoreRun()` retter for
 * sig selv; det her er den fælles vej.
 *
 * Felter der IKKE er med i `knownInputs`, beholder de nuværende værdier —
 * for en gemt session gælder det gruppestørrelse, undgåelser og emneliste,
 * som sessionen aldrig har gemt. Det er det bedste vi ved.
 *
 * @param {object} knownInputs  delmængde af snapshotInputs()' felter
 */
export function markCleanWithInputs(knownInputs = {}) {
    markClean();
    state._lastRunInputs = { ...state._lastRunInputs, ...knownInputs };
}

/**
 * Stabil tekst-udgave af en værdi, til sammenligning af BETYDNING.
 *
 * To ting normaliseres:
 *   - nøglerækkefølge, så to ens objekter skrevet i forskellig orden ligner
 *     hinanden
 *   - tal skrives som tekst, fordi indstillingerne ikke er konsekvente:
 *     gruppestørrelsen gemmes som "4" fra genereringen, men som 4 når
 *     +/−-knappen skriver den tilbage (v-model.number). Uden det ville
 *     læreren blive spurgt om indstillinger, hun aldrig havde rørt.
 */
function stableString(v) {
    return JSON.stringify(v, (_, val) => {
        if (typeof val === 'number') return String(val);
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            return Object.keys(val).sort().reduce((o, k) => { o[k] = val[k]; return o; }, {});
        }
        return val;
    });
}

/**
 * Er regler, indstillinger, undgåelser, emner eller gruppetilstand anderledes
 * i dag, end da kørslen blev dannet?
 *
 * Bruges til KUN at stille spørgsmålet "skal indstillingerne også med?", når
 * der faktisk er noget at svare på. Er der ingen forskel, gør de to svar
 * nøjagtig det samme, og spørgsmålet er en tom formalitet.
 *
 * @param {number} index    plads i listen fra listRuns()
 */
export function hasSettingsChanges(index) {
    const fn = state.currentClass?.filename || null;
    const run = state._runHistory.filter(r => r.classFile === fn)[index];
    if (!run || !state.currentClass) return false;

    const nowInputs = snapshotInputs();
    return Object.keys(nowInputs).some(k => stableString(run[k]) !== stableString(nowInputs[k]));
}

/**
 * Hent en kørsel tilbage.
 *
 * @param {number}  index                plads i listen fra listRuns()
 * @param {boolean} alsoSettings   gendan også regler, indstillinger,
 *                                       undgåelser og gruppetilstand
 * @returns {false|{restored: true, saved: boolean}} false hvis der ikke var
 *          nogen kørsel at hente. Ellers `saved: false`, hvis kørslen nok kom
 *          frem på skærmen, men ikke kunne skrives til lageret.
 */
export function restoreRun(index, alsoSettings = false) {
    const fn = state.currentClass?.filename || null;
    const runs = state._runHistory.filter(r => r.classFile === fn);
    const run = runs[index];
    if (!run) return false;

    // Læg den tilstand vi FORLADER i stakken, så et skridt for langt tilbage
    // kan fortrydes. Uden den kunne et fejlklik koste en kørsel.
    pushRun();

    // Snapshottet ligger stadig i stakken — pushRun() ovenfor har skubbet
    // pladserne én ned, så vi finder det igen på id frem for på index.
    const fresh = state._runHistory.find(r => r.id === run.id) || run;

    // ── Grupperne ──
    // Frosne navne sættes på undervejs, så en elev der er slettet siden
    // kommer tilbage med sit navn og et spøgelses-mærke frem for "(uden navn)".
    state.storedStandardGroups = fresh.standard
        ? withFrozenNames(fresh, cloneOrNull(fresh.standard)) : null;
    state.storedMatrixGroups = fresh.matrix
        ? withFrozenNames(fresh, cloneOrNull(fresh.matrix)) : null;
    state.lastGeneratedGroups = state.storedStandardGroups;

    // ── Emnerne ──
    // Klasse-emnelisten FLETTES, den erstattes ikke — læreren kan have
    // tilføjet et emne siden, og det skal ikke forsvinde, fordi hun henter en
    // gammel kørsel. Case-ufølsomt, så "Liberalisme" og "liberalisme" ikke
    // bliver to emner (samme regel som restoreSession()).
    if (Array.isArray(fresh.classTopics) && fresh.classTopics.length > 0) {
        state.currentClass.topics = mergeClassTopics(state.currentClass.topics, fresh.classTopics);
    }

    // Derefter hele kortet, og samme kort ud på gruppeobjekterne. Kortet får
    // KLASSENS stavemåde først: fletningen ovenfor beholder klassens
    // "Klima", og stod der "klima" i kørslens kort, var emnevælgeren på
    // kortet tom (den matcher præcist). Derfor fletning FØR skrivning.
    const classTopics = state.currentClass.topics;
    const topicMap = {};
    Object.entries(fresh.topicMap || {}).forEach(([key, topic]) => {
        topicMap[key] = classTopicSpelling(classTopics, topic);
    });
    const topicsSaved = storage.replaceTopicMap(topicMap);
    if (state.storedStandardGroups) storage.hydrateGroupTopics(state.storedStandardGroups, 'S_');
    if (state.storedMatrixGroups) storage.hydrateGroupTopics(state.storedMatrixGroups, 'M_');

    // ── Inputtet: kun hvis læreren bad om det ──
    if (alsoSettings) {
        state.currentClass.rules = cloneOrNull(fresh.rules) || [];
        state.currentClass.matrixRules = cloneOrNull(fresh.matrixRules) || [];
        state.currentClass.settings = cloneOrNull(fresh.settings) || {};
        state.currentClass.matrixSettings = cloneOrNull(fresh.matrixSettings) || {};
        state.currentClass.separations = cloneOrNull(fresh.separations) || [];
        state.currentClass.togetherGroups = cloneOrNull(fresh.togetherGroups) || [];
        state.groupMode = fresh.groupMode || state.groupMode;
    }

    // Matrixen i snapshottet hører til netop disse stamgrupper, så den er
    // ikke forældet. Havde kørslen ingen matrix, ER den forældet i forhold
    // til de gendannede stamgrupper. Samme regel som restoreSession().
    state.matrixGroupsStale = !(fresh.matrix && fresh.matrix.length);
    // Kørslens matrix hører til kørslens EGNE stamgrupper — begge dele kom fra
    // samme snapshot. Havde kørslen ingen matrix, er der intet at holde øje med.
    state.matrixSourceFingerprint = (fresh.matrix && fresh.matrix.length)
        ? homeGroupFingerprint(state.storedStandardGroups)
        : null;

    const groupsSaved = storage.saveGroupsToStorage() !== false;
    markClean();
    // Grupperne på skærmen kommer nu fra kørslen — så det er OGSÅ kørslens
    // input, de er dannet med. markClean() lige ovenfor gemte de nuværende
    // indstillinger; her rettes det til kørslens egne, så et senere snapshot
    // af netop disse grupper får det rigtige input med.
    state._lastRunInputs = {
        rules: cloneOrNull(fresh.rules) || [],
        matrixRules: cloneOrNull(fresh.matrixRules) || [],
        settings: cloneOrNull(fresh.settings) || {},
        matrixSettings: cloneOrNull(fresh.matrixSettings) || {},
        separations: cloneOrNull(fresh.separations) || [],
        togetherGroups: cloneOrNull(fresh.togetherGroups) || [],
        classTopics: cloneOrNull(fresh.classTopics) || [],
        groupMode: fresh.groupMode,
    };
    // Skrivningen kan være afvist (fuld lagerplads, Safari i privat browsing).
    // Så står kørslen på skærmen, men ikke i lageret, og næste genindlæsning
    // henter de gamle grupper frem igen. Det MÅ ikke kvitteres som en succes
    // — samme regel som resten af persistens-stien.
    return { restored: true, saved: groupsSaved && topicsSaved !== false };
}

/**
 * Ryd stakken. Kaldes fra clearClassMemory() ved klasseskift — sammen med
 * resten af det, der kun beskriver den klasse, vi forlader.
 *
 * Uden den kunne en kørsel fra én klasse hentes ind i en anden — præcis den
 * fejl der blev lukket for genereringsresultater i august. `listRuns()` og
 * `restoreRun()` filtrerer også på klassenavn, så der er to spærringer.
 */
export function clearRuns() {
    state._runHistory.length = 0;
    // Aftrykket hører til ÉN klasses matrix. Uden nulstillingen kunne 2.a's
    // aftryk sammenlignes med 3.b's stamgrupper og udløse en advarsel om en
    // drift, der aldrig har fundet sted.
    state.matrixSourceFingerprint = null;
    state._lastGeneratedFingerprint = null;
    state._lastRunInputs = null;
}

/**
 * Grupperne fra en kørsel som RÅ gruppeobjekter — til at tegne direkte på
 * gruppekortene som forhåndsvisning.
 *
 * Returnerer en KOPI. Kortene må gerne pege på dem, men intet af det læreren
 * gør under en forhåndsvisning må kunne sive ind i det rigtige snapshot.
 *
 * `null` betyder ÉN ting: der er ingen kørsel på den plads. Havde kørslen
 * ingen matrix, er svaret en TOM liste — ikke `null`. Forskellen er hele
 * pointen: kaldstedet falder tilbage på de nuværende grupper, når det får
 * `null`, så en kørsel uden matrix viste den matrix der står på skærmen lige
 * nu. Forhåndsvisningen sagde altså "der sker ingenting", og først klikket
 * afslørede at matrixen forsvandt.
 *
 * @param {number} index    plads i listen fra listRuns()
 * @param {boolean} matrix  matrix- eller stamgrupper
 */
export function previewRunGroups(index, matrix = false) {
    const fn = state.currentClass?.filename || null;
    const run = state._runHistory.filter(r => r.classFile === fn)[index];
    if (!run) return null;
    const groups = matrix ? run.matrix : run.standard;
    return withFrozenNames(run, deepClone(groups || []));
}
