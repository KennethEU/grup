import { state } from './state.js';
import * as storage from './storage.js';
import { saveTopicsOrSettle } from './topicSettle.js';
import { ROW_ID, newUuid, memberIdStr, memberDisplayName, homeGroupFingerprint, mergeClassTopics, classTopicSpelling } from './utils.js';
import { pushRun, markClean, markCleanWithInputs } from './runHistory.js';

// Hent reglerne fra den reaktive tilstand (ikke fra DOM'en)
function captureActiveRules() {
    if (!state.currentClass) return [];
    const rules = state.currentClass.rules || [];
    return rules
        .filter(r => r.column)
        .map(r => ({
            name: r.type || 'distribute',
            attribute: r.column,
            values: r.value || ''
        }));
}

// --- OPSLAG AF EN GEMT SESSION I KLASSEN SOM DEN ER NU ---

// En payload er læselig, når den HAR en liste af grupper. `writeClassExtras()`
// tjekker kun at payloaden er et objekt, så en ødelagt eller håndredigeret
// backup kan bære noget andet ind. Før kastede `session.groups.map` en fejl
// midt i gendannelsen — efter pushRun() — og læreren fik ingen besked.
function isReadableSession(session) {
    return !!session && typeof session === 'object' && Array.isArray(session.groups);
}

function readableGroups(groups) {
    return Array.isArray(groups) ? groups.filter(g => g && typeof g === 'object') : [];
}

function membersOf(group) {
    return Array.isArray(group.members) ? group.members : [];
}

// Payloads gemmer `{ id, name }`. En ren streng (ældre format) er både id og navn.
function savedMemberOf(raw) {
    if (typeof raw === 'string') return { id: raw, name: raw };
    return (raw && typeof raw === 'object') ? raw : { id: '', name: '' };
}

/**
 * Byg opslaget for ÉT gruppesæt fra en gemt session (stam- ELLER matrixsættet).
 *
 * Først på identiteten (`_rowId`). Dernæst på navnet — det redder sessioner
 * gemt før `_rowId` fandtes (dengang VAR det gemte id et navn), og sessioner
 * fra før klassen blev importeret på ny. Historik-payloads migreres bevidst
 * ikke; de reddes her.
 *
 * Navnene uddeles fra en PULJE, én elev ad gangen — samme regel som
 * `migrateRefsToRowIds()` i utils.js. Et almindeligt kort (navn → én elev)
 * gav begge "Anna"-referencer den SAMME Anna: hun stod i to grupper på én
 * gang, og den anden Anna forsvandt ud af alle grupper og blev meldt som
 * efternøler. Puljen gælder ét gruppesæt, fordi et sæt er en opdeling —
 * matrixen indeholder de samme elever igen og får sin egen.
 *
 * Et id-match lægger beslag på eleven FØR navnene uddeles, så et navn i
 * gruppe 1 ikke tager den elev, gruppe 2 peger direkte på.
 *
 * @returns {(raw: *) => { saved: {id, name}, student: Object|null }}
 *   student er null for et spøgelse (eleven findes ikke i klassen længere)
 */
function makeSessionResolver(groups, currentStudents) {
    const byId = new Map();
    const byName = new Map();   // navn -> ALLE elever med navnet, i rækkefølge
    currentStudents.forEach(s => {
        if (!s) return;
        if (s[ROW_ID] != null) byId.set(String(s[ROW_ID]), s);
        // Case-SENSITIVT — to elever hvis navn kun adskiller sig i store/små
        // bogstaver er stadig to forskellige elever (samme invariant som
        // canonicalizeCategoricalCasing i py_bridge.js bevidst IKKE anvender
        // på ID-kolonnen).
        const possibleName = s[state.displayColumn] || s.Navn || s.name || s.navn;
        if (!possibleName) return;
        const key = String(possibleName).trim();
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(s);
    });

    const taken = new Set();
    groups.forEach(g => membersOf(g).forEach(raw => {
        const direct = byId.get(String(savedMemberOf(raw).id));
        if (direct) taken.add(direct);
    }));

    return (raw) => {
        const saved = savedMemberOf(raw);
        const direct = byId.get(String(saved.id));
        if (direct) return { saved, student: direct };
        const candidates = saved.name ? byName.get(String(saved.name).trim()) : null;
        const student = (candidates || []).find(s => !taken.has(s)) || null;
        if (student) taken.add(student);
        return { saved, student };
    };
}

const SESSION_STORAGE_FULL = 'Kunne ikke gemme sessionen — browserens lagerplads er fuld. '
    + 'Slet en gammel session eller klasse og prøv igen.';

export function saveCurrentSession(baseName, includeMatrix) {
    const historyMeta = storage.getHistory();
    const id = newUuid();
    const date = new Date().toISOString();

    // Findes navnet i forvejen, får det et tal bag: "Uge 34 (2)"
    let finalName = baseName;
    let counter = 2;
    while (historyMeta.some(s => s.name === finalName)) {
        finalName = `${baseName} (${counter})`;
        counter++;
    }

    // 1. Byg det tunge objekt (Payload)
    // VIGTIGT: Vi gemmer {id, name} snapshot. Navnet slås op NU via lærerens
    // visningskolonne og fryses — id'et (_rowId) siger intet om hvem eleven er,
    // så uden navnet ville en session om en slettet elev blive ulæselig.
    const mapMembers = (members) => members.map(m => ({
        id: memberIdStr(m),
        name: memberDisplayName(m, state.currentClass?.data, state.displayColumn),
    }));
    // Ét gruppesæt som det gemmes; `prefix` er emnernes ('S_' stam, 'M_' matrix).
    const snapshotGroups = (groups, prefix) => groups.map(g => ({
        name: g.name,
        members: mapMembers(g.members),
        locked: !!g.locked,
        topic: storage.getTopic(g.name, prefix) || g.topic || ""
    }));

    // Matrixen kommer kun med, hvis der ER en, og den passer til stamgrupperne.
    // En ny stam-generering lader den gamle matrix blive liggende i state og
    // sætter kun flaget (visningsskiftet danner den forfra). Gemte vi den med,
    // kom sessionen senere tilbage med en matrix fra ANDRE stamgrupper — og
    // restoreSession() markerer den som frisk. Uden matrix overhovedet kastede
    // `null.map` nedenfor en fejl, og gemningen stoppede uden en lyd.
    // SaveSessionModal lukker for valget i begge tilfælde; tjekket her er
    // beslutningen, knappen kun affordancen.
    const withMatrix = includeMatrix && !state.matrixGroupsStale
        && Array.isArray(state.storedMatrixGroups) && state.storedMatrixGroups.length > 0;

    const fullSession = {
        id: id,
        date: date,
        name: finalName,
        type: withMatrix ? "WITH_MATRIX" : "STANDARD_ONLY",
        activeRules: captureActiveRules(),
        // `locked` gemmes med: en låst gruppe er en beslutning læreren har
        // truffet ("de her fire bliver siddende"), præcis som medlemmerne og
        // emnet er det. Uden feltet kom sessionen tilbage helt ulåst, og den
        // næste generering rev de grupper op, som var meningen at holde fast.
        // Gamle payloads uden feltet giver undefined → ulåst, som før.
        groups: snapshotGroups(state.storedStandardGroups, 'S_'),
        matrixGroups: withMatrix ? snapshotGroups(state.storedMatrixGroups, 'M_') : []
    };

    // 2. Gem Payload separat — afbryd hvis lageret er fuldt. Ellers ville vi
    // gemme metadata uden payload og efterlade en "spøgelses-session" i listen
    // der ikke kan gendannes ("Kunne ikke hente session data!").
    const payloadOk = storage.saveSessionPayload(fullSession);
    if (payloadOk === false) {
        if (window.notifyError) window.notifyError(SESSION_STORAGE_FULL);
        return null;
    }

    // 3. Gem letvægts metadata i listen
    const meta = {
        id: id,
        date: date,
        name: finalName,
        type: fullSession.type,
        stats: {
            groupCount: fullSession.groups.length,
            matrixCount: fullSession.matrixGroups.length
        }
    };

    historyMeta.push(meta);
    // Payloaden ligger allerede i lageret (trin 2). Kommer LISTEN ikke med,
    // findes sessionen ikke for nogen: Historik-fanen læser listen, ikke
    // payloadsene. Før returnerede vi `meta` uanset hvad, og læreren fik
    // kvitteringen "Session gemt i historikken!" — for en session der var
    // væk ved næste genindlæsning. Payloaden bliver ryddet med det samme;
    // ellers ville den ligge og fylde netop den plads, der lige slap op.
    if (storage.saveHistory(historyMeta) === false) {
        storage.deleteSessionPayload(id);
        if (window.notifyError) window.notifyError(SESSION_STORAGE_FULL);
        return null;
    }
    return meta;
}

/**
 * Slet en gemt session.
 *
 * Rækkefølgen er med vilje: listen først, payloaden bagefter — og kun hvis
 * listen faktisk blev skrevet. Omvendt (eller uden tjekket) ville en afvist
 * liste-skrivning efterlade en session i listen, hvis data er væk: den kan
 * ikke gendannes og siger bare "Kunne ikke hente session data!".
 *
 * @returns {boolean} false hvis sletningen ikke kunne skrives
 */
export function deleteSession(sessionId) {
    // 1. Fjern fra listen
    let history = storage.getHistory();
    history = history.filter(s => s.id !== sessionId);
    if (storage.saveHistory(history) === false) return false;

    // 2. Slet datafilen
    storage.deleteSessionPayload(sessionId);
    return true;
}

/**
 * Omdøb en gemt session. Navnet står to steder — i listen og i payloaden —
 * og BEGGE skal med, ellers viser listen ét navn og forhåndsvisningen et
 * andet. Lykkes den ene skrivning ikke, meldes hele omdøbningen som fejlet;
 * en halv omdøbning må ikke kvitteres som en hel.
 *
 * @returns {boolean} false hvis navnet er tomt, sessionen ikke findes,
 *   eller en af de to skrivninger blev afvist
 */
export function renameSession(sessionId, newName) {
    if (!newName || !newName.trim()) return false;
    const trimmed = newName.trim();

    // 1. Opdater metadata-listen
    const history = storage.getHistory();
    const entry = history.find(s => s.id === sessionId);
    if (!entry) return false;
    entry.name = trimmed;
    if (storage.saveHistory(history) === false) return false;

    // 2. Opdater payload (så preview også viser nyt navn)
    const payload = storage.loadSessionPayload(sessionId);
    if (payload) {
        payload.name = trimmed;
        if (storage.saveSessionPayload(payload) === false) return false;
    }

    return true;
}

export function restoreSession(sessionId) {
    // 1. Hent Payload
    const session = storage.loadSessionPayload(sessionId);
    // Tjekkes FØR pushRun() og før den første overskrivning: en payload uden
    // grupper skal hverken give en ekstra linje i kørselsmenuen eller en halv
    // gendannelse. Se isReadableSession().
    if (!isReadableSession(session)) { if (window.notifyError) window.notifyError("Kunne ikke hente session data!"); return; }

    // Den fordeling der er ved at blive overskrevet, skal kunne hentes tilbage
    // fra kørselsmenuen — præcis som ved en generering. Uden det her kald var
    // en gendannet session den ENE vej at miste dagens fordeling uden en vej
    // tilbage: "Gem"-sessionen er jo netop hentet frem, fordi man fortrød.
    // Kaldes FØR den første overskrivning nedenfor.
    pushRun();

    // 2. Find status på elever
    const currentStudents = state.currentClass.data; // Alle elever i klassen NU

    // Identiteten er altid _rowId — hverken lærerens valg eller en synlig kolonne.
    // Opslaget (id først, så navnet fra en pulje) bygges pr. gruppesæt af
    // makeSessionResolver() øverst i filen.
    const activeIdCol = ROW_ID;

    // De elever sessionen FANDT i klassen, som de hedder NU. Efternølerne
    // nedenfor tælles på dem — ikke på de gemte id'er. Ved navne-fallbacken
    // er de to forskellige (det gemte id er et navn, eleven har et _rowId), og
    // så blev hver eneste elev meldt som ny: "28 nye elever (efternølere)
    // fundet" om en klasse, hvor alle stod i en gruppe.
    const placedIds = new Set();

    // `resolve` er gruppesættets eget opslag — se makeSessionResolver().
    const mapRestoredMembers = (resolve, savedMembers) => savedMembers.map(raw => {
        const { saved, student: studentObj } = resolve(raw);

        if (studentObj) {
            // Eleven er fundet. Id'et returneres, så GroupCard kan slå eleven
            // op og vise tags.
            const resolvedId = studentObj[activeIdCol] || studentObj.id || saved.id;
            placedIds.add(String(resolvedId).trim());
            return resolvedId;
        } else {
            // Spøgelse: eleven står ikke længere i klasselisten
            return {
                id: saved.id,
                name: saved.name || "Ukendt",
                isGhost: true,
                _ghost: true
            };
        }
    });

    // Ét gemt gruppesæt tilbage som grupper. Hvert sæt er en opdeling for sig
    // og får sin egen pulje i opslaget (makeSessionResolver).
    const restoreSet = (groups) => {
        const set = readableGroups(groups);
        const resolve = makeSessionResolver(set, currentStudents);
        return set.map(g => ({
            name: g.name,
            members: mapRestoredMembers(resolve, membersOf(g)),
            locked: !!g.locked,
            topic: g.topic
        }));
    };
    const restoredStandardGroups = restoreSet(session.groups);

    // Emnerne skrives samlet nedenfor (saveTopicsOrSettle), ikke ét kald
    // pr. gruppe. Før var det N fulde skrivninger af det samme kort plus en
    // pruneTopics() til sidst, og INGEN af svarene blev set på: løb kvoten
    // tør halvvejs, stod kortet med sessionens emner for de første grupper og
    // forgårsdagens for resten — mens skærmen viste sessionens.
    //
    // Kan kortet slet ikke skrives, står det FORRIGE kort tilbage med de
    // samme gruppenavne. Så får grupperne det, der står i lageret (se
    // topicSettle.js) — ellers viste kortet på skærmen sessionens emner,
    // mens matrix-runden, eksporten og en session gemt lige bagefter brugte
    // de forrige (gennemsyn 85, restoreTopics.test.js).
    const topicResults = [];

    // 3. Opdater State
    state.storedStandardGroups = restoredStandardGroups;
    state.lastGeneratedGroups = restoredStandardGroups;

    // Sync klasse-niveau emneliste med de restorede gruppe-topics for at undgå
    // visuel inkonsistens (badges siger X, dropdown siger Y). Brugerens nuværende
    // klasse-liste BEVARES og udvides med eventuelle nye emner fra sessionen.
    // Hvis dropdown'en var tom inden restore, befolkes den nu fra sessionen.
    // Case-insensitivt (som findTopicIndex/eqTopic) — ellers bliver
    // "Liberalisme" og "liberalisme" to emner, og gruppe-antallet rundes så
    // til et multiplum af et kunstigt højt emne-antal. Det gælder OGSÅ to
    // grupper i samme session, der staver emnet hver sin vej.
    const sessionTopics = restoredStandardGroups
        .map(g => g.topic && String(g.topic).trim())
        .filter(t => t);
    if (sessionTopics.length > 0) {
        state.currentClass.topics = mergeClassTopics(state.currentClass.topics, sessionTopics);
    }

    // Gruppens emne får KLASSENS stavemåde, FØR kortet skrives. Emnevælgeren
    // på gruppekortet er en <select>, der matcher præcist: stod der "klima"
    // på gruppen og "Klima" i emnelisten, var vælgeren tom.
    const classTopics = Array.isArray(state.currentClass.topics) ? state.currentClass.topics : [];
    const useClassSpelling = (groups) => groups.forEach(g => {
        if (g.topic) g.topic = classTopicSpelling(classTopics, g.topic);
    });
    useClassSpelling(restoredStandardGroups);

    // Sessionens emner ind, og emner for grupper sessionen ikke har, ud —
    // i én skrivning.
    // Stamgrupperne FØR matrixen: begge ligger i samme nøgle, så matrixens
    // skrivning skal bære stamgruppernes endelige emner med.
    topicResults.push(saveTopicsOrSettle('S_', restoredStandardGroups));

    // Håndter Matrix hvis sessionen har det
    if (session.type === "WITH_MATRIX" && Array.isArray(session.matrixGroups)) {
        state.storedMatrixGroups = restoreSet(session.matrixGroups);
        useClassSpelling(state.storedMatrixGroups);
        // Matrixens emner ind, og de gamle ud — én skrivning, som ovenfor.
        topicResults.push(saveTopicsOrSettle('M_', state.storedMatrixGroups));
        // Matrixen passer nu til de netop gendannede stamgrupper. Havde
        // "forældet"-flaget stået tilbage fra en tidligere generering, ville
        // det første skift væk fra og tilbage til matrixvisningen danne
        // matrixen forfra og kaste den gendannede session væk igen.
        state.matrixGroupsStale = false;
        // Sessionens matrix hører til sessionens EGNE stamgrupper, som lige er
        // skrevet ind ovenfor — så aftrykket tages af dem. Uden det ville
        // hintet enten tie for evigt eller fyre med det samme.
        state.matrixSourceFingerprint = homeGroupFingerprint(state.storedStandardGroups);
    } else {
        state.storedMatrixGroups = null; // Nulstil matrix hvis session kun var standard
        // Ingen matrixgrupper, så ingen matrix-emner. Afvises skrivningen, er
        // der ingen matrixgrupper at vise dem på, og næste matrix-runde
        // rydder dem selv (landAnswer) — så ingen besked om det.
        storage.replaceTopicsForPrefix('M_', []);
        // Sessionen havde ingen matrix, men stamgrupperne er nye — så en
        // matrix skal netop dannes forfra, næste gang læreren går derover.
        state.matrixGroupsStale = true;
        state.matrixSourceFingerprint = null;
    }

    // 5. Gem (Vue tegner selv om, fordi tilstanden er reaktiv)
    //
    // Skrivningen kan blive afvist (fuld lagerplads, Safari i privat browsing).
    // Så står den gendannede session på skærmen UDEN at ligge i lageret, og
    // næste genindlæsning henter de gamle grupper frem igen — uden at nogen
    // har sagt noget. `restoreRun()` i runHistory.js har haft det her værn
    // hele tiden (den melder tilbage til kørselsmenuen); session-gendannelsen
    // blev glemt. Beskeden gives her, fordi begge kaldsteder (HistoryTab og
    // PreviewSessionModal) kalder funktionen uden at se på svaret.
    // Emnekortet får sin egen besked: falder KUN den skrivning, er grupperne
    // gemt og står rigtigt efter en genindlæsning — men uden emne eller med
    // de forrige emner (saveTopicsOrSettle har lagt det samme på grupperne).
    if (storage.saveGroupsToStorage() === false) {
        if (window.notifyError) window.notifyError(
            'Sessionen er hentet frem, men kunne IKKE gemmes — browserens '
            + 'lagerplads er fuld. Grupperne står på skærmen nu, men er væk, '
            + 'når du genindlæser siden. Ryd op og hent sessionen igen.'
        );
    } else if (topicResults.includes('stale')) {
        // Grupperne ER gemt; kun emnerne kunne ikke skrives, og de forrige
        // står tilbage — nu også på grupperne, så alt viser det samme.
        window.notifyError?.(
            'Sessionen er hentet frem, men dens emner kunne ikke gemmes — '
            + 'browserens lagerplads er fuld. Grupperne står med emnerne fra før. '
            + 'Slet en gammel session for at frigøre plads, og hent sessionen igen.'
        );
    } else if (topicResults.includes('cleared')
        && (sessionTopics.length > 0 || readableGroups(session.matrixGroups).some(g => g.topic))) {
        window.notifyError?.(
            'Sessionen er hentet frem, men dens emner kunne ikke gemmes — '
            + 'browserens lagerplads er fuld, så grupperne står uden emne. '
            + 'Slet en gammel session for at frigøre plads, og hent sessionen igen.'
        );
    }

    // Aftrykket skal følge med, ellers peger det stadig på de grupper der lige
    // blev skiftet ud — og så tror kørselsmenuen at læreren har flyttet elever
    // i hånden. Hun fik derefter advarslen "dine flytninger forsvinder" om
    // flytninger, hun aldrig havde lavet.
    //
    // Og reglerne skal med: sessionen gemte selv de regler, den blev dannet
    // med (`activeRules`). Uden dem blev grupperne parret med dagens regler,
    // og næste generering lagde den genoplivede fordeling i kørselsstakken
    // beskrevet med regler, den aldrig kom fra. `captureActiveRules()` gemmer
    // i den gamle form (`name`/`attribute`/`values`), så den pakkes tilbage
    // til UI'ets `{type, column, value}` — ellers ville sammenligningen i
    // `hasSettingsChanges()` se to forskellige former og spørge læreren om
    // indstillinger, der er nøjagtig de samme.
    const sessionRules = Array.isArray(session.activeRules)
        ? session.activeRules.map(r => ({
            type: r.name || r.type || 'distribute',
            column: r.attribute || r.column || '',
            value: r.values ?? r.value ?? '',
        }))
        : null;
    if (sessionRules) markCleanWithInputs({ rules: sessionRules });
    else markClean();

    // Skift til gruppe-fanen via reactive state
    state.classViewTab = 'groups';

    // Sæt activeView baseret på session-type
    // Hvis sessionen kun har stamgrupper, vis stamgrupper (ikke matrix)
    state.activeView = (session.type === "WITH_MATRIX" && session.matrixGroups?.length) ? 'matrix' : 'standard';

    // Efternølere: elever i klassen NU, som hverken en stam- eller en
    // matrixgruppe fandt. Tælles her, EFTER matrixen er slået op, så
    // placedIds har begge sæt med. Fraværende (_excluded) er ikke efternølere.
    const latecomers = currentStudents.filter(s => {
        if (s._excluded) return false;
        const studentId = s[activeIdCol] || s.id;
        return !placedIds.has(String(studentId).trim());
    });
    // Beskeden NÆVNER eleverne (op til tre) og siger, hvad læreren kan gøre.
    // Før stod der kun "1 nye elever (efternølere) fundet." — forkert bøjet
    // ved én elev, "nye" om en elev, der blot var fraværende den dag
    // sessionen blev gemt, og uden navne, så læreren selv måtte lede kortene
    // igennem. Samme mønster som matrix-advarslen i generation.js.
    if (latecomers.length > 0 && window.notifyInfo) {
        const n = latecomers.length;
        const names = latecomers.slice(0, 3)
            .map(s => memberDisplayName(s[ROW_ID], currentStudents, state.displayColumn))
            .filter(Boolean).join(', ');
        window.notifyInfo(
            `${n} ${n === 1 ? 'elev' : 'elever'} fra klassen står ikke i nogen gruppe i sessionen`
            + (names ? ` (${names}${n > 3 ? ' m.fl.' : ''})` : '')
            + `. Sæt ${n === 1 ? 'eleven' : 'dem'} ind med "Tilføj efternøler".`
        );
    }
}

export function loadSessionForPreview(sessionId) {
    const session = storage.loadSessionPayload(sessionId);
    // null → PreviewSessionModal viser "Kunne ikke indlæse sessionen." Før
    // kastede en payload uden grupper en fejl i onMounted, og vinduet stod
    // tomt uden en forklaring.
    if (!isReadableSession(session)) return null;

    const currentStudents = state.currentClass.data;

    // De gemte medlemmer bliver til { name, isGhost } til forhåndsvisningen.
    // Spøgelse = en elev, der ikke længere står i klassen. Flaget er det samme
    // som restoreSession sætter — navnet får ikke en emoji (projektets regel:
    // ingen emojis i UI); PreviewSessionModal tegner selv markeringen.
    // Opslaget er det SAMME som gendannelsens (makeSessionResolver) — ellers
    // kunne forhåndsvisningen love noget andet end det "Gendan" gør.
    const mapMembers = (resolve, savedMembers) => savedMembers.map(raw => {
        const { saved, student: studentObj } = resolve(raw);

        if (studentObj) {
            // Aktiv elev: vis lærerens valgte visningskolonne. Før gættede vi
            // på en kolonne der hed "navn"/"name"/"elev" — nu er det et valg.
            const name = memberDisplayName(studentObj[ROW_ID], state.currentClass.data, state.displayColumn);
            return { name, isGhost: false };
        } else {
            // Spøgelse: eleven står ikke længere i klassen
            return { name: saved.name || 'Ukendt', isGhost: true };
        }
    });

    // Ét opslag pr. gruppesæt — se makeSessionResolver().
    const previewSet = (groups) => {
        const set = readableGroups(groups);
        const resolve = makeSessionResolver(set, currentStudents);
        return set.map(g => ({
            name: g.name,
            members: mapMembers(resolve, membersOf(g)),
            topic: g.topic
        }));
    };

    const standard = previewSet(session.groups);

    let matrix = null;
    if (session.type === "WITH_MATRIX" && Array.isArray(session.matrixGroups)) {
        matrix = previewSet(session.matrixGroups);
    }

    return { name: session.name, standard, matrix };
}
