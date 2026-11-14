/**
 * Gendan grupper — fra indsat tekst eller fra en gemt kolonne.
 *
 * To indgange, ét mellemled, én skrivevej. Læreren limer enten en tidligere
 * kopieret gruppeliste ind (appens eget format fra `buildGroupsClipboardText`)
 * eller peger på en kolonne i elevlisten, som "Gem som kolonne" har skrevet.
 * Begge veje ender i den SAMME plan, og planen anvendes ét sted — så der kun
 * er ét sted der kan tage fejl.
 *
 * Alt indtil `applyPlan()` er rene funktioner uden `state`, så de kan
 * afprøves direkte i unit-tests. Se restoreGroups.test.js.
 */

import { state, pushUndo } from './state.js';
import * as storage from './storage.js';
import { saveTopicsOrSettle } from './topicSettle.js';
import { autoSave } from './classActions.js';
import { pushRun, markClean } from './runHistory.js';
import { forgetRunResults } from './setupNotices.js';
import {
    ROW_ID, ensureRowIds, isInternalField, memberDisplayName, groupDisplayName,
    mergeClassTopics, classTopicSpelling, buildStudentIndex, topicKey,
} from './utils.js';
import { MAX_ROWS_PER_CLASS } from './py_bridge.js';

// ────────────────────────────────────────────────────────────────────────
// Navne-normalisering
// ────────────────────────────────────────────────────────────────────────

/**
 * Den form to navne sammenlignes i.
 *
 * NFC først: æ kan komme både som ét tegn og som a+kombinerende tegn, alt
 * efter hvor teksten har været forbi. Indre mellemrum foldes, så "Anna  Quist"
 * og "Anna Quist" er samme person.
 *
 * Accenter foldes IKKE væk. Rørstrøm og Rorstrom er ikke det samme navn, og
 * en fold ville gøre to forskellige elever til én uden at spørge.
 */
export function normalizeName(raw) {
    return String(raw ?? '')
        .normalize('NFC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('da-DK');
}

// ────────────────────────────────────────────────────────────────────────
// Værdi-formaterne
// ────────────────────────────────────────────────────────────────────────

/** "Gruppe 6" / "6" → 6. Alt andet → null. */
function groupNumberOf(raw) {
    const m = String(raw ?? '').trim().match(/^(?:gruppe|group)\s*(\d+)$|^(\d+)$/i);
    if (!m) return null;
    const n = parseInt(m[1] ?? m[2], 10);
    return Number.isFinite(n) ? n : null;
}

/**
 * Læs én celle-værdi eller én overskrift.
 *
 * De fire formater er præcis dem "Gem som kolonne" kan skrive, plus rene tal
 * fra et regneark:
 *
 *   "Gruppe 6"          → { number: 6, topic: null }
 *   "6"                 → { number: 6, topic: null }
 *   "Gruppe 1 - Klima"  → { number: 1, topic: "Klima" }
 *   "Klima"             → { number: null, topic: "Klima" }
 *
 * Bindestregen deler kun, når det der står FØR den er et gruppenavn. Ellers
 * ville et emne som "EU - og Danmark" blive skåret midt over.
 */
export function parseGroupValue(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return { number: null, topic: null };

    const dash = s.match(/^(.*?)\s+[-–—]\s+(.+)$/);
    if (dash) {
        const n = groupNumberOf(dash[1]);
        if (n !== null) return { number: n, topic: dash[2].trim() || null };
    }

    const n = groupNumberOf(s);
    if (n !== null) return { number: n, topic: null };

    return { number: null, topic: s };
}

// ────────────────────────────────────────────────────────────────────────
// Fane 1: indsat tekst
// ────────────────────────────────────────────────────────────────────────

// "Gruppe 3", "Group 3", "Gruppe 3:", "Gruppe 1 - Klima"
const HEADER_RE = /^(?:gruppe|group)\s*(\d+)\s*:?\s*(?:[-–—]\s*(.*))?$/i;

// Bagerst på en linje: " (fraværende)" — appens egen markering.
const ABSENT_RE = /\s*\((?:fraværende|fravaerende|absent)\)\s*$/i;

// Bagerst på en linje: " (Grp 3 - Klima)" — matrix-kopiens kilde-parentes.
const SOURCE_RE = /\s*\((?:grp|gruppe|group)\s*\d+[^)]*\)\s*$/i;

/**
 * Skræl appens egne haler af en navnelinje.
 *
 * Rækkefølgen er ikke ligegyldig: `buildGroupsClipboardText` skriver først
 * kilde-parentesen og DEREFTER "(fraværende)", så den sidste skal af først.
 * En parentes midt i navnet røres ikke — kun den der står yderst til højre.
 */
function cleanMemberLine(line) {
    let s = String(line).trim();
    let absent = false;

    while (ABSENT_RE.test(s)) {
        absent = true;
        s = s.replace(ABSENT_RE, '');
    }
    s = s.replace(SOURCE_RE, '').trim();

    return { raw: s, absent };
}

// ────────────────────────────────────────────────────────────────────────
// Lofterne over den indsatte tekst
// ────────────────────────────────────────────────────────────────────────
//
// HVORFOR DE FINDES: import fra Excel/CSV har altid haft et loft
// (MAX_ROWS_PER_CLASS), og backup-gendannelse fik det samme værn ved
// sikkerhedsreviewet i august. Den indsatte liste havde intet. Læste den en
// tekst der IKKE er en gruppeliste — et helt dokument, et regneark limet ind
// i sin fulde længde — blev hvert eneste afsnit slået op mod hver eneste
// elev med Levenshtein-afstand, på skærmens egen tråd. Målt: 5.000 linjer mod
// en klasse på 300 tog 2,8 sekunder, 50.000 linjer tog 33 sekunder. I de 33
// sekunder er fanen frosset — ingen knapper, ingen Ctrl+Z — og der findes
// ingen kopi af klassen nogen steder, hvis læreren når at lukke den.
//
// Tallene er sat efter hvad en ægte liste kan fylde: en klasse er højst
// MAX_ROWS_PER_CLASS elever, og hver gruppe lægger en overskrift oveni.
// 2.000 linjer er altså rundhåndet — og samtidig langt fra et helt dokument.

/** Højst så mange linjer med indhold i én indsat liste. */
export const MAX_PASTE_LINES = 2000;

/** Højst så mange tegn på én linje. Et elevnavn er aldrig længere. */
export const MAX_PASTE_LINE_CHARS = 200;

/**
 * Læs en indsat gruppeliste.
 *
 * @returns {{ groups: Array, orphans: string[], error: string|null }}
 *   groups: [{ number, topic, names: [{ raw, absent }] }]
 *   orphans: navnelinjer FØR den første overskrift (de hører ingen steder)
 */
export function parseGroupsText(text) {
    const lines = String(text ?? '').split(/\r?\n/);
    const groups = [];
    const orphans = [];
    let current = null;

    // Lofterne tjekkes FØR opslaget, ikke undervejs: det er selve
    // navneopslaget der er dyrt, og en afvisning skal komme med det samme.
    const nonEmptyLines = lines.filter(l => l.trim());
    if (nonEmptyLines.length > MAX_PASTE_LINES) {
        return {
            groups: [], orphans: [],
            error: `Teksten er for lang (${nonEmptyLines.length} linjer, maks ${MAX_PASTE_LINES}). `
                 + 'Det ligner ikke en gruppeliste — indsæt kun selve listen, '
                 + 'ikke hele dokumentet.'
        };
    }
    const tooLong = nonEmptyLines.find(l => l.trim().length > MAX_PASTE_LINE_CHARS);
    if (tooLong) {
        return {
            groups: [], orphans: [],
            error: `En linje er på ${tooLong.trim().length} tegn (maks ${MAX_PASTE_LINE_CHARS}) `
                 + 'og kan ikke være et elevnavn. Står hele listen på én linje, '
                 + 'skal hvert navn have sin egen.'
        };
    }

    for (const line of lines) {
        const t = line.trim();
        if (!t) continue;

        const h = t.match(HEADER_RE);
        if (h) {
            const headingTopic = (h[2] || '').trim() || null;
            current = {
                number: parseInt(h[1], 10),
                topic: headingTopic,
                // Stod emnet efter et gruppenavn ("Gruppe 1 - Klima"), ER det
                // et emne læreren selv har skrevet. Se `explicitTopic` i
                // parseGroupsColumn for hvorfor den skelnen betyder noget.
                explicitTopic: !!headingTopic,
                names: []
            };
            groups.push(current);
            continue;
        }

        const m = cleanMemberLine(t);
        if (!m.raw) continue;
        if (!current) { orphans.push(m.raw); continue; }
        current.names.push(m);
    }

    if (groups.length === 0) {
        return {
            groups: [],
            orphans,
            // Samme tre navne som pladsholderen i feltet (RestoreGroupsModal)
            // OG som de tre første elever i TEST_DATA (DashboardView.vue).
            // Klikker læreren "Prøv med testdata", passer eksemplet altså på
            // den klasse, hun har åben — indsætter hun det råt, virker det.
            // Med opdigtede navne var det et eksempel, der ikke kunne prøves
            // af. BEMÆRK at det er TEST_DATA, ikke public/testdata/*.csv —
            // den sidste hører til Python-testene og har andre navne.
            error: 'Kunne ikke finde nogen gruppeoverskrifter. Teksten skal se '
                 + 'sådan ud:\n\nGruppe 1\nEmma Hansen\nOliver Nielsen\n\n'
                 + 'Gruppe 2\nIda Pedersen'
        };
    }

    return { groups, orphans, error: null };
}

// ────────────────────────────────────────────────────────────────────────
// Navne-opslag
// ────────────────────────────────────────────────────────────────────────

/** Levenshtein-afstand, to rækker ad gangen. Ingen ny afhængighed. */
function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    let prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
        const cur = new Array(b.length + 1);
        cur[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        prev = cur;
    }
    return prev[b.length];
}

/** Er alle ord i `short` med i `long` — i samme rækkefølge? */
function tokensAreSubsequence(shortTokens, longTokens) {
    let i = 0;
    for (const t of longTokens) {
        if (i < shortTokens.length && shortTokens[i] === t) i++;
    }
    return i === shortTokens.length;
}

/**
 * Byg opslagstabellen over klassens elever, som den ser ud i lærerens
 * visningskolonne.
 */
export function buildNameIndex(data, displayColumn) {
    const rows = Array.isArray(data) ? data : [];
    const entries = [];
    const byName = new Map();
    // Opslagskortet bygges én gang: uden det gennemløb hvert navneopslag hele
    // klassen (300 elever: ~3 ms pr. "Læs"). Samme svar — første række pr. id.
    const byId = buildStudentIndex(rows);

    for (const r of rows) {
        if (!r || typeof r !== 'object') continue;
        const rowId = String(r[ROW_ID] ?? '').trim();
        if (!rowId) continue;
        const label = memberDisplayName(rowId, rows, displayColumn, byId);
        const norm = normalizeName(label);
        const entry = { rowId, label, norm, tokens: norm ? norm.split(' ') : [] };
        entries.push(entry);
        if (!norm) continue;
        if (!byName.has(norm)) byName.set(norm, []);
        byName.get(norm).push(entry);
    }

    return { entries, byName };
}

/**
 * Find den elev et navn NOK er — eller ingen.
 *
 * To veje ind, og begge skal være tydelige, for et forkert forslag er værre
 * end intet forslag:
 *
 *  1. **Manglende mellemnavn.** Står alle ordene i det korte navn i det lange
 *     i samme rækkefølge ("Sadaq Hagi-Ali" i "Sadaq Liban Abdi Hagi-Ali"), er
 *     det med stor sandsynlighed samme person. Er der to sådanne elever,
 *     foreslås ingen af dem.
 *  2. **Stavefejl.** Levenshtein, men kun når afstanden er lille i forhold til
 *     navnets længde OG næstbedste kandidat er mindst 2 dårligere. To søskende
 *     med samme efternavn ligger tæt på hinanden, og der skal programmet tie.
 */
export function nearestStudent(rawName, index, takenIds = new Set()) {
    const norm = normalizeName(rawName);
    if (!norm) return null;

    const pool = index.entries.filter(e => e.norm && !takenIds.has(e.rowId));
    if (pool.length === 0) return null;

    const tokens = norm.split(' ');

    // 1. Ord-delmængde
    const subs = pool.filter(e => {
        if (e.tokens.length === tokens.length) return false;
        return e.tokens.length > tokens.length
            ? tokensAreSubsequence(tokens, e.tokens)
            : tokensAreSubsequence(e.tokens, tokens);
    });
    if (subs.length === 1) return { rowId: subs[0].rowId, label: subs[0].label, reason: 'navnedele' };
    if (subs.length > 1) return null;

    // 2. Stavefejl
    const scored = pool
        .map(e => ({ e, d: levenshtein(norm, e.norm) }))
        .sort((a, b) => a.d - b.d);

    const best = scored[0];
    const runnerUp = scored[1];
    const limit = Math.max(2, Math.floor(norm.length * 0.15));

    if (best.d > limit) return null;
    if (runnerUp && runnerUp.d - best.d < 2) return null;

    return { rowId: best.e.rowId, label: best.e.label, reason: 'stavemåde' };
}

/**
 * Slå de indsatte navne op i klassen.
 *
 * Gætter ALDRIG ved to elever med samme navn — det er hele grunden til at
 * medlemmer bæres som `_rowId` og ikke som navne. De havner i stedet som
 * `ambiguous`, og læreren vælger.
 *
 * @returns {{ groups: Array }} hver gruppe med `items`, som brugerfladen
 *   redigerer direkte (`rowId` og `action`).
 */
export function resolveTextGroups(parsed, data, displayColumn) {
    const index = buildNameIndex(data, displayColumn);

    // Et navn der allerede er brugt entydigt, kan ikke være forslaget til et
    // andet — ellers peger to linjer på den samme elev.
    const taken = new Set();
    const groups = parsed.map(g => ({
        number: g.number,
        topic: g.topic,
        explicitTopic: !!g.explicitTopic,
        items: g.names.map(n => ({ raw: n.raw, absent: n.absent }))
    }));

    // Runde 1: entydige og tvetydige match
    for (const g of groups) {
        for (const it of g.items) {
            const hits = index.byName.get(normalizeName(it.raw)) || [];
            if (hits.length === 1) {
                it.status = 'bound';
                it.rowId = hits[0].rowId;
                it.label = hits[0].label;
                taken.add(it.rowId);
            } else if (hits.length > 1) {
                it.status = 'ambiguous';
                it.rowId = null;
                it.candidates = hits.map(h => ({ rowId: h.rowId, label: h.label }));
            } else {
                it.status = 'unmatched';
                it.rowId = null;
            }
        }
    }

    // Runde 2: forslag til de ufundne — først nu, hvor vi ved hvem der er brugt
    for (const g of groups) {
        for (const it of g.items) {
            if (it.status !== 'unmatched') continue;
            const s = nearestStudent(it.raw, index, taken);
            it.suggestion = s;
            // Er der et forslag, står det som det valgte — men det er synligt
            // på skærmen, og læreren kan skifte til "tilføj" eller "spring over".
            it.action = s ? 'bind' : 'add';
            if (s) it.rowId = s.rowId;
        }
    }

    return { groups };
}

// ────────────────────────────────────────────────────────────────────────
// Fane 2: gemt kolonne
// ────────────────────────────────────────────────────────────────────────

/**
 * Hvilke kolonner ligner en gruppekolonne?
 *
 * Samme slags gæt som `bedsteStartKolonne()` i ColumnOrderModal: vi kan ikke
 * vide det, men vi kan udelukke det håbløse — visningskolonnen, programmets
 * egne felter, og kolonner med for få eller for mange forskellige værdier.
 */
export function candidateColumns(data, columns, displayColumn) {
    const rows = Array.isArray(data) ? data : [];
    const out = [];

    for (const col of (Array.isArray(columns) ? columns : [])) {
        if (!col || isInternalField(col) || col === displayColumn) continue;

        const counts = new Map();
        const values = new Map();
        let filled = 0;
        for (const r of rows) {
            const v = String(r?.[col] ?? '').trim();
            if (!v) continue;
            filled++;
            const k = normalizeName(v);
            counts.set(k, (counts.get(k) || 0) + 1);
            if (!values.has(k)) values.set(k, v);
        }

        const distinct = counts.size;
        if (distinct < 2) continue;                      // én værdi er ikke grupper
        if (distinct > Math.max(2, rows.length - 1)) continue;  // én værdi pr. elev

        const distinctValues = [...values.values()];
        out.push({
            column: col,
            groups: distinct,
            students: filled,
            blank: rows.length - filled,
            singletons: [...counts.values()].filter(n => n === 1).length,
            // Bærer HVER værdi et gruppetal ("Gruppe 3", "6")? Det er det
            // stærkeste tegn på, at kolonnen faktisk er en gruppeopdeling.
            numbered: distinctValues.every(v => parseGroupValue(v).number !== null),
            sample: distinctValues.slice(0, 2)
        });
    }

    return out;
}

/**
 * Hvilken kandidat skal stå forvalgt?
 *
 * Ikke den med flest elever pr. gruppe — det var første bud, og så vandt
 * "Køn" (to værdier, 28 elever) over en rigtig gruppekolonne. En gruppe har
 * FÅ medlemmer. Rækkefølgen er derfor: værdier der bærer et gruppetal først,
 * så en troværdig gruppestørrelse, så færrest enere.
 */
export function bestCandidateColumn(candidates) {
    if (!candidates || candidates.length === 0) return '';
    const score = (c) => {
        let s = c.numbered ? 0 : 100;
        const size = c.students / c.groups;
        if (size < 2 || size > 8) s += 20;
        s += Math.abs(size - 4);
        s += c.singletons;
        return s;
    };
    return [...candidates].sort((a, b) => score(a) - score(b))[0].column;
}

/**
 * Læs grupperne ud af en kolonne.
 *
 * Her er der ingen navne at slå op: kolonnen står PÅ elevrækken, så `_rowId`
 * er kendt med det samme. Kolonne-fanen kan derfor aldrig få en tvetydig
 * eller en ufunden elev.
 *
 * Tallet i værdien bevares — huller og det hele. Din "Gruppe 6" bliver ved med
 * at hedde Gruppe 6, også når 4 og 5 ikke findes.
 */
export function parseGroupsColumn(column, data) {
    const rows = Array.isArray(data) ? data : [];
    const buckets = new Map();

    for (const r of rows) {
        if (!r || typeof r !== 'object') continue;
        const raw = String(r[column] ?? '').trim();
        if (!raw) continue;
        const rowId = String(r[ROW_ID] ?? '').trim();
        if (!rowId) continue;

        const key = normalizeName(raw);
        if (!buckets.has(key)) buckets.set(key, { value: raw, rowIds: [] });
        buckets.get(key).rowIds.push(rowId);
    }

    const parsed = [...buckets.values()].map(b => {
        const p = parseGroupValue(b.value);
        // Et emne tæller kun som ET EMNE, hvis værdien OGSÅ bar et gruppetal
        // ("Gruppe 1 - Klima" — formatet "Gem som kolonne" skriver). En ren
        // tekstværdi ("Høj") er bare kolonnens kategori; den må gerne stå som
        // mærkat på kortet, men den må ikke blive til et af klassens emner.
        // Se `explicitTopic` i applyPlan.
        return {
            number: p.number,
            topic: p.topic,
            explicitTopic: p.number !== null && !!p.topic,
            rowIds: b.rowIds
        };
    });

    if (parsed.some(p => p.number !== null)) {
        // Mindst én værdi bærer et tal → tallene gælder, og de der mangler et
        // får de næste ledige numre efter det højeste.
        let next = parsed.reduce((m, p) => Math.max(m, p.number ?? 0), 0) + 1;
        parsed.forEach(p => { if (p.number === null) p.number = next++; });
        parsed.sort((a, b) => a.number - b.number);
    } else {
        // Rene emne-værdier: nummerér efter første forekomst i elevlisten.
        parsed.forEach((p, i) => { p.number = i + 1; });
    }

    const groups = parsed.map(p => ({
        number: p.number,
        topic: p.topic,
        explicitTopic: p.explicitTopic,
        items: p.rowIds.map(id => ({ status: 'bound', rowId: id, raw: null }))
    }));

    return { groups };
}

// ────────────────────────────────────────────────────────────────────────
// Planen — ét mellemled begge faner ender i
// ────────────────────────────────────────────────────────────────────────

/**
 * Læg de opløste grupper sammen til det der faktisk vil ske.
 *
 * Planen er ren data. Brugerfladen tegner den, og `applyPlan()` udfører den —
 * så det der står på skærmen, og det der sker, kommer fra samme kilde.
 */
export function buildPlan({ groups, data, displayColumn, markAbsent = true,
                            existingGroups = [], classTopics = [] }) {
    const rows = Array.isArray(data) ? data : [];
    const byId = buildStudentIndex(rows);   // kun til "findes id'et i klassen?"

    const planGroups = [];
    const byNumber = new Map();    // gruppenummer → posten i planGroups
    const mergedNumbers = [];      // numre der stod mere end ét sted
    const usedIds = new Map();     // rowId → [gruppenumre]
    const newNameGroups = new Map(); // normaliseret navn → [gruppenumre]
    const newStudents = [];
    let unresolved = 0;

    for (const g of (groups || [])) {
        const members = [];
        for (const it of (g.items || [])) {
            // Et tvetydigt navn kunne før KUN afgøres — ikke droppes. Passede
            // navnet på to elever, og var ingen af dem den rigtige, var
            // knappen død for altid, og eneste vej ud var at rette i teksten.
            if (it.status === 'ambiguous') {
                if (it.action === 'skip') continue;
                if (!it.rowId) { unresolved++; continue; }
            }
            if (it.status === 'unmatched') {
                if (it.action === 'skip') continue;
                if (it.action === 'add') {
                    members.push(it.absent ? { addName: it.raw, absent: true } : { addName: it.raw });
                    newStudents.push({ name: it.raw, group: g.number });
                    const normalized = normalizeName(it.raw);
                    if (!newNameGroups.has(normalized)) newNameGroups.set(normalized, []);
                    newNameGroups.get(normalized).push(g.number);
                    continue;
                }
                if (!it.rowId) { unresolved++; continue; }
            }
            const id = String(it.rowId ?? '').trim();
            // En elev der er slettet fra klassen siden listen blev lavet, har
            // ingen række at pege på. Vi lader hende falde ud frem for at
            // lægge et spøgelse i gruppen.
            if (!id || !byId.has(id)) continue;
            // "(fraværende)" bag navnet er appens EGEN markering: den kopierede
            // liste skriver den ved en elev, der står i gruppen, men ikke er i
            // lokalet. Den bæres med, så vejen tilbage ikke melder eleven til stede.
            members.push(it.absent ? { rowId: id, absent: true } : { rowId: id });
            if (!usedIds.has(id)) usedIds.set(id, []);
            usedIds.get(id).push(g.number);
        }
        // Samme nummer to steder ER samme gruppe: nummeret er gruppens
        // identitet i resten af programmet (`name` bliver "Group N", og
        // emnekort, sletning og Vue-nøgler slår alle op på netop det navn).
        // To poster med samme navn gav to kort med samme nøgle, og kun det
        // ene emne overlevede. Sker fx når to lister limes ind efter
        // hinanden, eller når en kolonne har både "Gruppe 1" og "1".
        const alreadyThere = byNumber.get(g.number);
        if (alreadyThere) {
            alreadyThere.members.push(...members);
            if (!alreadyThere.topic && g.topic) {
                alreadyThere.topic = g.topic;
                alreadyThere.explicitTopic = !!g.explicitTopic;
            }
            if (!mergedNumbers.includes(g.number)) mergedNumbers.push(g.number);
            continue;
        }

        const post = {
            number: g.number,
            name: `Group ${g.number}`,
            topic: g.topic || null,
            explicitTopic: !!g.explicitTopic,
            members
        };
        planGroups.push(post);
        byNumber.set(g.number, post);
    }

    // En overskrift uden navne under sig bliver et tomt kort. Det er tro mod
    // listen, men det er også hvad en afklippet indsætning ser ud som — så
    // det skal siges, ikke bare ske.
    const emptyGroups = planGroups.filter(g => g.members.length === 0).map(g => g.number);

    // Samme elev i to grupper: det ville ellers bare være den sidste der vandt.
    const duplicates = [];
    usedIds.forEach((groupNumbers, id) => {
        if (groupNumbers.length < 2) return;
        duplicates.push({
            rowId: id,
            label: memberDisplayName(id, rows, displayColumn),
            groups: groupNumbers
        });
    });

    const placed = new Set([...usedIds.keys()]);
    // Elever der står på listen MED "(fraværende)". De placeres i gruppen
    // som alle andre — fraværende elever bliver i deres gruppe i resten af
    // appen også — men de sættes ikke til stede. Før 23/9 blev markeringen
    // læst og så smidt væk: kopierede læreren grupperne en dag, hvor Bo var
    // syg, og blev listen gendannet, stod Bo pludselig som til stede.
    const listedAbsent = new Set();
    planGroups.forEach(g => g.members.forEach(m => {
        if (m.absent && m.rowId) listedAbsent.add(m.rowId);
    }));
    const willBeAbsent = [];
    const willBePresent = [];
    const willStayAbsent = [];   // på listen med "(fraværende)"
    rows.forEach(r => {
        const id = String(r?.[ROW_ID] ?? '').trim();
        if (!id) return;
        if (listedAbsent.has(id)) {
            willStayAbsent.push(id);
        } else if (placed.has(id)) {
            if (r._excluded) willBePresent.push(id);
        } else if (!r._excluded) {
            willBeAbsent.push(id);
        }
    });

    const memberCount = planGroups.reduce((n, g) => n + g.members.length, 0);

    // Emner der vil BLIVE TILFØJET til klassens emneliste. Kun de eksplicitte
    // — se `explicitTopic`. Det er en indstilling der ændrer noget bagefter
    // (gruppeantallet rundes til et multiplum af antal emner), så det skal
    // stå på skærmen og ikke ske i stilhed.
    // topicKey (som mergeClassTopics, der lægger dem til bagefter): ellers
    // lovede skærmen et "nyt" emne, som klassen allerede havde med å som a + ring.
    const known = new Set(
        (Array.isArray(classTopics) ? classTopics : [])
            .map(t => topicKey(t))
    );
    const newTopics = [];
    planGroups.forEach(g => {
        if (!g.explicitTopic || !g.topic) return;
        const k = topicKey(g.topic);
        if (known.has(k)) return;
        known.add(k);
        newTopics.push(g.topic.trim());
    });

    // Er næsten INGEN af navnene i klassen, er den mest sandsynlige forklaring
    // ikke tyve stavefejl — det er den forkerte klasse, eller en tekst der
    // slet ikke er en gruppeliste (fx to kolonner limet ind fra Excel).
    // Trykker man videre, oprettes hele listen som nye elever, OG den rigtige
    // klasse markeres fraværende fra ende til anden. Hver enkelt står ganske
    // vist i "Se efter her", men tyve rækker er noget man scroller forbi.
    const mostlyUnknown = newStudents.length >= 3
        && memberCount > 0
        && newStudents.length >= memberCount / 2;

    const blocking = [];
    if (memberCount === 0) {
        blocking.push('Der er ingen elever at placere.');
    }
    // Nye navne lægges til elevlisten. Import og backup-gendannelse har
    // begge et loft på klassens størrelse; denne vej havde ingen, og en liste
    // hvor navnene ikke passer (forkert klasse, eller en tekst der slet ikke
    // er en gruppeliste) kunne skrive hundredvis af nye elever ind i én
    // handling — forbi netop det værn, resten af programmet regner med.
    const afterAdding = rows.length + newStudents.length;
    if (afterAdding > MAX_ROWS_PER_CLASS) {
        blocking.push(
            `Klassen ville få ${afterAdding} elever (maks ${MAX_ROWS_PER_CLASS}). `
            + `${newStudents.length} navne står til at blive tilføjet — sæt dem til `
            + '"spring over", eller ret navnene så de passer med klassen.'
        );
    }
    if (unresolved > 0) {
        blocking.push(unresolved === 1
            ? 'Ét navn passer på flere elever — vælg hvem det er.'
            : `${unresolved} navne passer på flere elever — vælg hvem de er.`);
    }
    // To gange i SAMME gruppe (typisk: listen er limet ind to gange) er en
    // anden sætning end to FORSKELLIGE grupper. Før stod der "Anna står i
    // både Gruppe 1 og Gruppe 1".
    const inGroupsText = (name, numbers) => {
        const unique = [...new Set(numbers)];
        if (unique.length === 1) return `${name} står ${numbers.length} gange i Gruppe ${unique[0]}.`;
        return `${name} står i både Gruppe ${unique.slice(0, -1).join(', Gruppe ')}`
            + ` og Gruppe ${unique[unique.length - 1]}.`;
    };
    duplicates.forEach(d => blocking.push(inGroupsText(d.label, d.groups)));
    newNameGroups.forEach((groupNumbers, normalized) => {
        if (groupNumbers.length < 2) return;
        const displayName = newStudents.find(s => normalizeName(s.name) === normalized)?.name || normalized;
        blocking.push(inGroupsText(displayName, groupNumbers));
    });

    const lockedNames = (existingGroups || [])
        .filter(g => g && g.locked)
        .map(g => groupDisplayName(g.name));

    return {
        groups: planGroups,
        memberCount,
        newStudents,
        duplicates,
        willBeAbsent,
        willBePresent,
        willStayAbsent,
        markAbsent: !!markAbsent,
        newTopics,
        mergedNumbers,
        emptyGroups,
        mostlyUnknown,
        replaces: { count: (existingGroups || []).length, lockedNames },
        blocking
    };
}

// ────────────────────────────────────────────────────────────────────────
// Skrivevejen
// ────────────────────────────────────────────────────────────────────────

/**
 * Udfør planen.
 *
 * Rækkefølgen er den samme som `history.restoreSession()` bruger, og den er
 * ikke tilfældig:
 *
 *   1. `pushUndo()` FØR elevlisten røres — fravær og nye elever skal kunne
 *      tages tilbage med Ctrl+Z i ét greb.
 *   2. `pushRun()` FØR den første overskrivning — ellers er dagens fordeling
 *      væk uden en vej tilbage, og det er netop den man fortryder.
 *
 * @returns {boolean} true hvis planen blev udført
 */
export function applyPlan(plan) {
    if (!plan || !state.currentClass || !Array.isArray(state.currentClass.data)) return false;
    if (plan.blocking && plan.blocking.length > 0) return false;

    pushUndo();
    pushRun();
    // Noterne om sidste kørsels RESULTAT handler ikke om grupperne herefter. Kun
    // stamgrupperne skiftes ud; matrixen står, og dens noter passer stadig
    // (forgetRunResults i setupNotices.js).
    forgetRunResults(['standard']);

    const data = state.currentClass.data;
    const displayColumn = state.displayColumn
        || (state.currentClass.columns && state.currentClass.columns[0])
        || '';

    // 1. Nye elever. Samlet unshift, så de står i lærerens rækkefølge øverst
    // — ikke bagvendt, som ét unshift pr. elev ville give.
    const created = new Map();   // navn → række
    const newRows = [];
    plan.groups.forEach(g => {
        g.members.forEach(m => {
            if (!m.addName || created.has(m.addName)) return;
            const row = {};
            (state.currentClass.columns || []).forEach(c => { row[c] = ''; });
            if (displayColumn) row[displayColumn] = m.addName;
            created.set(m.addName, row);
            newRows.push(row);
        });
    });
    if (newRows.length > 0) {
        data.unshift(...newRows);
        ensureRowIds(data);
    }

    // 2. Grupperne
    const groups = plan.groups.map(g => ({
        name: g.name,
        members: g.members
            .map(m => m.rowId || String(created.get(m.addName)?.[ROW_ID] ?? ''))
            .filter(Boolean),
        locked: false,
        topic: g.topic || null
    }));

    state.storedStandardGroups = groups;
    state.lastGeneratedGroups = groups;

    // 3. Emnerne. KUN de emner læreren selv har skrevet som emner ("Gruppe 1 - Klima").
    // En kolonne med rene kategorier ("Høj"/"Middel"/"Lav") giver gruppen sin
    // mærkat på kortet, men må ikke blive til klassens emner: emnelisten
    // runder gruppeantallet til et multiplum af antal emner ved HVER senere
    // generering, og så stod der pludselig "3 emner: antal grupper rundes ned
    // fra 7 til 6" efter en gendannelse, læreren troede kun flyttede elever.
    const restoredTopics = [...new Set(
        plan.groups
            .filter(g => g.explicitTopic)
            .map(g => g.topic && String(g.topic).trim())
            .filter(Boolean)
    )];
    if (restoredTopics.length > 0) {
        // Case-ufølsomt, som findTopicIndex/eqTopic — ellers bliver "Klima"
        // og "klima" to emner, og gruppe-antallet rundes til et multiplum af
        // et kunstigt højt emne-antal. Fletningen husker også de emner, den
        // lige har lagt til: "Gruppe 1 - Klima" og "Gruppe 2 - klima" er ÉT
        // emne, som forhåndsvisningen (newTopics i buildPlan) også siger.
        state.currentClass.topics = mergeClassTopics(state.currentClass.topics, restoredTopics);
    }

    // Gruppens emne får KLASSENS stavemåde. Emnevælgeren på kortet er en
    // <select> med klassens emner som valgmuligheder, og den matcher præcist:
    // stod der "klima" på gruppen og "Klima" i emnelisten, var mærkatet
    // TOMT, selv om gruppen havde et emne. Det skete, når klassen i forvejen
    // havde emnet med en anden skrivemåde, og når to grupper på listen stavede
    // det forskelligt (fletningen ovenfor beholder kun den første).
    const classTopics = Array.isArray(state.currentClass.topics) ? state.currentClass.topics : [];
    groups.forEach(g => {
        if (g.topic) g.topic = classTopicSpelling(classTopics, g.topic);
    });

    // Emnekortet i lageret skal stemme med gruppeobjekterne (og med
    // emnelisten ovenfor — uden den rydder næste generering emnekortet,
    // fordi klassen ingen emner har). Én skrivning, ikke én pr. gruppe plus en udrensning: kortet er ÉN nøgle,
    // og en halvskreven gendannelse er værre end en der ikke skete.
    // Kan kortet ikke skrives, står det FORRIGE kort tilbage med de samme
    // gruppenavne — så får grupperne det, der står i lageret, ellers viste
    // skærmen ét emne og matrix-runden, eksporten og en senere gemt session
    // et andet (topicSettle.js, gennemsyn 85).
    const topicResult = saveTopicsOrSettle('S_', groups);

    // 4. Fraværet. Ét felt, to indgange — her sættes begge veje på én gang,
    // og det er derfor forhåndsvisningen nævner eleverne ved navn først.
    let absentCount = 0;
    if (plan.markAbsent) {
        const placed = new Set();
        groups.forEach(g => g.members.forEach(id => placed.add(id)));
        // Placeret, men med "(fraværende)" på listen — se willStayAbsent.
        // Nye elever står der ikke (de havde intet id, da planen blev lagt),
        // så deres markering hentes fra planens medlemmer.
        const listedAbsent = new Set(plan.willStayAbsent || []);
        plan.groups.forEach(g => g.members.forEach(m => {
            if (m.absent && m.addName) {
                const id = String(created.get(m.addName)?.[ROW_ID] ?? '');
                if (id) listedAbsent.add(id);
            }
        }));
        data.forEach(r => {
            const id = String(r?.[ROW_ID] ?? '').trim();
            if (!id) return;
            const shouldBeAbsent = !placed.has(id) || listedAbsent.has(id);
            if (shouldBeAbsent && !r._excluded) absentCount++;
            r._excluded = shouldBeAbsent;
        });
    }

    // 5. Matrixen er dannet ud fra ANDRE stamgrupper og må ikke blive stående
    // og lyve. Stale-flaget danner den om ved næste skift til matrixvisningen.
    state.matrixGroupsStale = true;
    state.matrixSourceFingerprint = null;

    const saved = storage.saveGroupsToStorage();
    autoSave();
    markClean();

    state.activeView = 'standard';
    state.classViewTab = 'groups';

    if (saved === false) {
        window.notifyError?.(
            'Grupperne står på skærmen, men lagerpladsen er fuld — de er ikke gemt. '
            + 'Slet en gammel session for at frigøre plads.'
        );
    } else if (topicResult === 'stale') {
        window.notifyError?.(
            'Grupperne er gendannet, men deres emner kunne ikke gemmes — lagerpladsen '
            + 'er fuld. Grupperne står med emnerne fra før. Slet en gammel session '
            + 'for at frigøre plads, og gendan grupperne igen.'
        );
    } else if (topicResult === 'cleared' && plan.groups.some(g => g.topic)) {
        window.notifyError?.(
            'Grupperne er gendannet, men deres emner kunne ikke gemmes — lagerpladsen '
            + 'er fuld, så grupperne står uden emne. Slet en gammel session for at '
            + 'frigøre plads, og gendan grupperne igen.'
        );
    } else {
        const parts = [`${groups.length} ${groups.length === 1 ? 'gruppe' : 'grupper'} gendannet`];
        if (newRows.length > 0) {
            parts.push(`${newRows.length} ${newRows.length === 1 ? 'ny elev' : 'nye elever'} tilføjet`);
        }
        if (absentCount > 0) {
            parts.push(`${absentCount} markeret fraværende`);
        }
        window.notifySuccess?.(parts.join(', ') + '.');
    }

    return true;
}
