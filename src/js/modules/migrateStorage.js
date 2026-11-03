// migrateStorage.js — flyt lærerens data fra de gamle nøglenavne til de nye.
//
// HVORFOR: indtil november 2026 hed Grupper's nøgler "groupeng_classes",
// "GroupEng_Groups_<fil>" osv. (efter projektet GroupEng, som Grupper engang
// byggede på). Nu hedder de "grupdk_…" (storageKeys.js). Klasserne findes
// KUN i lærerens egen browser — der er ingen kopi på en server — så en
// flytning, der går galt, er data, der er væk for altid. Derfor er alt her
// skrevet efter "hellere for forsigtigt end pænt":
//
//  1. Først læses ALT (et øjebliksbillede), så besluttes, og først så skrives.
//     Kun det nye navn læses igen lige før hver nøgles beslutning (to gamle
//     navne kan pege på samme nye, og en anden ny fane kan have flyttet imens).
//  2. Pr. nøgle: skriv den nye → læs den tilbage og sammenlign → læs den gamle
//     igen (en gammel fane kan have skrevet i mellemtiden) → først DEREFTER
//     slettes den gamle. Afbrydes det midt i (fanen lukkes), står begge med
//     samme indhold, og næste kørsel sletter bare den gamle.
//  3. En klasse under det gamle navn ERSTATTER ALDRIG en klasse under det
//     nye. Findes filnavnet allerede, og er indholdet ikke det samme, bliver
//     den gamle en kopi ("3.b (kopi)") med sine egne grupper, emner og
//     historik. Det sker typisk, når en fane fra før opdateringen stadig står
//     åben: den ser klasselisten forsvinde og lægger klassen ind igen.
//     Kopien husker, hvilket filnavn den kom fra (`legacyFilename`), så den
//     gamle fanes næste skrivninger rammer kopien — og aldrig den rigtige.
//  4. Kan det ikke afgøres, hvilken af to udgaver der er den rigtige (en
//     klasses grupper under begge navne, med forskelligt indhold), slettes
//     INGEN af dem. Begge bliver stående ("uafgjort"), og oprydningen ved
//     opstart holder sig væk, så længe noget står under et gammelt navn.
//  5. Rækkefølgen: grupper, emner, historik, sessioner og indstillinger først,
//     så klasselisten — men kun, hvis intet fejlede indtil da, så næste
//     kørsel stadig har den gamle liste at beslutte ud fra — og til sidst
//     grupper/emner/historik for kopier lavet i denne kørsel (kopien skal
//     findes, før dens nøgler gør).
//  6. Fuldt lager: kan den nye ikke skrives, holdes værdien i hukommelsen,
//     den gamle slettes (det giver plads), den nye skrives — og går det
//     heller ikke, lægges den gamle tilbage. Aldrig ingen af dem. (Kendt
//     grænse: lukkes fanen netop mellem de to, findes værdien kun i den
//     lukkede fanes hukommelse.)
//
// Kernen tager et lager-objekt (getItem/setItem/removeItem/key/length), så
// den kan afprøves uden en browser (migrateStorage.test.js). Opstarten, der
// kalder den, ligger i storageStartup.js.

import {
    CLASSES_KEY, GROUPS_PREFIX, TOPICS_PREFIX, HISTORY_PREFIX, SESSION_PREFIX,
    LAST_CLASS_KEY, LAST_CLASS_INDEX_KEY, NEWS_FILTER_KEY,
    NAV_VIEW_KEY, CLASS_TAB_KEY, STORAGE_WARNED_KEY,
} from './storageKeys.js';

// ─── De gamle navne ─────────────────────────────────────────────────────────
// Det ENESTE sted i appen, de står. dida.dk's flyttesider (public/flyt-*.html)
// og www.dida.dk bruger dem stadig — dér ligger data under de gamle navne —
// så det, der kommer derfra, sendes også gennem flytningen her.

// De tre gamle navne, som også bruges uden for tabellerne nedenfor.
const LEGACY_CLASSES_KEY = 'groupeng_classes';
const LEGACY_HISTORY_PREFIX = 'GroupEng_History_';
const LEGACY_SESSION_PREFIX = 'GroupEng_Session_';

/** Hele navne. Slås op FØR præfikserne: "…_Last_Class_Index" begynder med "…_Last_Class". */
const LEGACY_EXACT = new Map([
    [LEGACY_CLASSES_KEY, CLASSES_KEY],
    ['GroupEng_Last_Class', LAST_CLASS_KEY],
    ['GroupEng_Last_Class_Index', LAST_CLASS_INDEX_KEY],
    ['GroupEng_News_Filter', NEWS_FILTER_KEY],
]);

/** Navne med filnavn eller id bagefter. */
const LEGACY_PREFIXES = [
    ['GroupEng_Groups_', GROUPS_PREFIX, 'perClass'],
    ['GroupEng_Topics_', TOPICS_PREFIX, 'perClass'],
    [LEGACY_HISTORY_PREFIX, HISTORY_PREFIX, 'perClass'],
    [LEGACY_SESSION_PREFIX, SESSION_PREFIX, 'session'],
];

/** sessionStorage — kun mens fanen er åben, så ingen fletning. */
const LEGACY_SESSION = new Map([
    ['GroupEng_NavView', NAV_VIEW_KEY],
    ['GroupEng_ClassTab', CLASS_TAB_KEY],
    ['GroupEng_StorageWarned', STORAGE_WARNED_KEY],
]);

/**
 * Hvad hedder et gammelt navn nu? `{ key, kind, suffix, newPrefix }` eller
 * null, hvis navnet ikke er et af de gamle (også de nye navne giver null).
 *   kind: 'classes' | 'perClass' | 'session' | 'setting'
 */
export function legacyTarget(key) {
    if (typeof key !== 'string') return null;
    if (LEGACY_EXACT.has(key)) {
        const target = LEGACY_EXACT.get(key);
        return { key: target, kind: target === CLASSES_KEY ? 'classes' : 'setting', suffix: '', newPrefix: '' };
    }
    for (const [oldPrefix, newPrefix, kind] of LEGACY_PREFIXES) {
        if (key.startsWith(oldPrefix) && key.length > oldPrefix.length) {
            const suffix = key.slice(oldPrefix.length);
            return { key: newPrefix + suffix, kind, suffix, newPrefix };
        }
    }
    return null;
}

/** Det nye navn for et gammelt — eller null. */
export function currentKeyFor(key) {
    return legacyTarget(key)?.key ?? null;
}

/** Det gamle navn for et nyt — eller null (bruges til at se, om noget står der). */
function legacyNameFor(key) {
    for (const [oldKey, newKey] of LEGACY_EXACT) if (newKey === key) return oldKey;
    for (const [oldPrefix, newPrefix] of LEGACY_PREFIXES) {
        if (key.startsWith(newPrefix) && key.length > newPrefix.length) return oldPrefix + key.slice(newPrefix.length);
    }
    return null;
}

/** De nye hele navne (grupdk_classes, grupdk_last_class …). */
const CURRENT_EXACT = new Set(LEGACY_EXACT.values());

/** Filnavnet i en klasses grupper/emner/historik-nøgle (gammelt eller nyt navn) — eller null. */
function perClassFile(key) {
    for (const [oldPrefix, newPrefix, kind] of LEGACY_PREFIXES) {
        if (kind !== 'perClass') continue;
        for (const p of [oldPrefix, newPrefix]) {
            if (key.startsWith(p) && key.length > p.length) return key.slice(p.length);
        }
    }
    return null;
}

/** Hører navnet til de nye (grupdk_…)? */
function isCurrentKey(key) {
    if (typeof key !== 'string') return false;
    if (CURRENT_EXACT.has(key)) return true;
    return LEGACY_PREFIXES.some(([, p]) => key.startsWith(p) && key.length > p.length);
}

/** Begynder navnet som et af de gamle (også dem, vi ikke kender)? */
function looksLegacy(key) {
    return typeof key === 'string' && (key === LEGACY_CLASSES_KEY || key.startsWith('GroupEng_'));
}

// ─── Hjælpere ───────────────────────────────────────────────────────────────

/** Fejlen, et fuldt lager giver (navnet varierer mellem browsere). */
export function isQuotaError(e) {
    if (!e) return false;
    return e.name === 'QuotaExceededError'
        || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || e.code === 22 || e.code === 1014;
}

/** Et lager i hukommelsen — til pakker udefra, der skal igennem de samme regler. */
function memoryStorage(init) {
    const map = new Map(Object.entries(init));
    return {
        get length() { return map.size; },
        key: (i) => [...map.keys()][i] ?? null,
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); },
        entries: () => [...map],
    };
}

function parseList(raw) {
    if (raw === null || raw === undefined) return { ok: true, list: null };
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? { ok: true, list: parsed } : { ok: false };
    } catch {
        return { ok: false };
    }
}

const stampOf = (entry) => (entry && typeof entry.last_modified === 'string' ? entry.last_modified : '');
const hasFilename = (entry) => !!entry && typeof entry.filename === 'string';

/**
 * Kopien, en gammel fane allerede har fået for filnavnet `filename` — den
 * sidste, hvis der er flere. Indeks i listen eller -1.
 */
function linkedCopyAt(list, filename) {
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i] && list[i].legacyFilename === filename) return i;
    }
    return -1;
}

/**
 * Et filnavn til en kopi, der ikke er optaget (se `taken` i planClassLists).
 * Ingen tid, ingen tilfældighed: en afbrudt kørsel skal give samme navn
 * næste gang.
 */
function copyFilename(filename, taken) {
    const base = filename.replace(/\.csv$/i, '');
    let candidate = `${base}_kopi.csv`;
    for (let n = 2; taken.has(candidate); n++) candidate = `${base}_kopi_${n}.csv`;
    return candidate;
}

/**
 * Læg den gamle klasseliste ind i den nye — uden at noget i den nye bliver
 * erstattet.
 *
 * Pr. klasse i den gamle liste:
 *  - Har den allerede en kopi (legacyFilename): kopien opdateres, hvis den
 *    gamle er nyere. Aldrig en kopi nummer to.
 *  - Findes filnavnet ikke i den nye: klassen lægges til, som den er.
 *  - Findes det med præcis samme indhold: intet sker.
 *  - Ellers: en kopi med eget filnavn og " (kopi)" efter navnet.
 *
 * @param {Iterable<string>} [keyedFiles]  filnavne med nøgler i lageret
 * @returns {{ list, links: Map, copies: Array, updated: Set }}
 *   links: gammelt filnavn → det filnavn, dets grupper/emner/historik skal
 *   under; copies: kopier lavet nu; updated: kopier, den gamle udgave
 *   har opdateret (dens nøgler hører til det nyeste).
 */
export function planClassLists(newList, oldList, keyedFiles = []) {
    const list = [...newList];
    // Optaget: alle filnavne i BEGGE lister — ellers kunne en kopi tage navnet
    // fra en klasse, der kun findes i den gamle liste ("3b_kopi.csv") — og
    // alle filnavne, der har grupper, emner eller historik i lageret, under
    // det gamle eller det nye navn. Ellers arvede kopien en slettet klasses
    // rester, og to gamle nøgler pegede på samme nye.
    const taken = new Set([...list, ...oldList].filter(hasFilename).map(e => e.filename));
    for (const f of keyedFiles) taken.add(f);
    const links = new Map();
    const copies = [];
    const updated = new Set();
    for (const entry of oldList) {
        if (!hasFilename(entry)) { list.push(entry); continue; }
        const f = entry.filename;
        const linked = linkedCopyAt(list, f);
        if (linked >= 0) {
            const copy = list[linked];
            links.set(f, copy.filename);
            if (stampOf(entry) > stampOf(copy)) {
                list[linked] = { ...entry, filename: copy.filename, name: copy.name, legacyFilename: f };
                updated.add(copy.filename);
            }
            continue;
        }
        const at = list.findIndex(e => hasFilename(e) && e.filename === f);
        if (at < 0) {
            list.push(entry);
            taken.add(f);
            links.set(f, f);
            continue;
        }
        if (JSON.stringify(list[at]) === JSON.stringify(entry)) { links.set(f, f); continue; }
        const target = copyFilename(f, taken);
        taken.add(target);
        const name = `${typeof entry.name === 'string' && entry.name ? entry.name : f.replace(/\.csv$/i, '')} (kopi)`;
        list.push({ ...entry, filename: target, name, legacyFilename: f });
        links.set(f, target);
        copies.push({ from: f, to: target, name });
    }
    return { list, links, copies, updated };
}

function safeGet(storage, key) {
    try { return storage.getItem(key); } catch { return undefined; }
}

/** Skriv og læs tilbage. true kun, når lageret siger præcis det, vi skrev. */
function putVerified(storage, key, value) {
    storage.setItem(key, value);
    return storage.getItem(key) === value;
}

/**
 * Fjern den gamle — men kun, hvis den stadig er den, vi læste. Har en gammel
 * fane skrevet i mellemtiden, bliver den stående: dens storage-hændelse
 * sætter en ny kørsel i gang.
 */
function removeIfUnchanged(storage, oldKey, expected, report) {
    if (storage.getItem(oldKey) !== expected) {
        report.changed.push(oldKey);
        return;
    }
    storage.removeItem(oldKey);
}

/**
 * Læg `value` under `newKey` og fjern `oldKey` (hvis den stadig er `oldValue`)
 * — i den rækkefølge, og den gamle kun, når den nye er læst tilbage. Svarer
 * true, når den nye er skrevet.
 */
function transfer(storage, oldKey, newKey, value, oldValue, report) {
    const before = safeGet(storage, newKey);
    try {
        if (putVerified(storage, newKey, value)) {
            removeIfUnchanged(storage, oldKey, oldValue, report);
            return true;
        }
        // Lageret svarede noget andet, end vi skrev. Rør ikke den gamle, og
        // læg den nye tilbage, som den var.
        undoNew(storage, newKey, before);
        report.failed.push({ key: oldKey, reason: 'verify' });
        return false;
    } catch (e) {
        if (!isQuotaError(e)) {
            report.failed.push({ key: oldKey, reason: 'error' });
            return false;
        }
    }

    // Fuldt lager. Den gamle værdi holdes i hukommelsen, den gamle nøgle
    // fjernes for at give plads, og den nye skrives.
    const held = safeGet(storage, oldKey);
    if (held !== oldValue) {
        // Ændret (eller væk) siden øjebliksbilledet: rør den ikke.
        report.failed.push({ key: oldKey, reason: 'quota' });
        return false;
    }
    try { storage.removeItem(oldKey); } catch {
        report.failed.push({ key: oldKey, reason: 'quota' });
        return false;
    }
    try {
        if (putVerified(storage, newKey, value)) {
            report.quotaFallback.push(oldKey);
            return true;
        }
        undoNew(storage, newKey, before);
    } catch { /* heller ikke plads — den gamle lægges tilbage nedenfor */ }
    try {
        storage.setItem(oldKey, held);
        report.failed.push({ key: oldKey, reason: 'quota' });
    } catch {
        // Hverken ny eller gammel kunne skrives. Værdien findes nu kun her —
        // den går med i rapporten, så opstarten kan redde den (se
        // storageStartup.js).
        report.lost.push({ key: oldKey, value: held });
    }
    return false;
}

function undoNew(storage, key, before) {
    try {
        if (typeof before === 'string') storage.setItem(key, before);
        else storage.removeItem(key);
    } catch { /* intet at gøre */ }
}

/** Fjern den gamle — men kun, når den nye står der, og den gamle er uændret. */
function dropOld(storage, oldKey, newKey, oldValue, report) {
    try {
        if (storage.getItem(newKey) === null) return false;
        removeIfUnchanged(storage, oldKey, oldValue, report);
        report.dropped++;
        return true;
    } catch {
        report.failed.push({ key: oldKey, reason: 'error' });
        return false;
    }
}

function emptyReport() {
    return {
        moved: 0,        // flyttet til et nyt navn, der var ledigt
        replaced: 0,     // en kopis nøgle fik den gamle fanes nyeste udgave
        merged: 0,       // klasselisterne lagt sammen
        dropped: 0,      // den gamle fjernet, fordi den nye allerede havde det
        written: [],     // nye navne, der er skrevet (så fanen kan genlæse dem)
        copies: [],      // { from, to, name } — klasser lagt ind som kopi
        undecided: [],   // gamle navne, hvor begge udgaver bliver stående
        changed: [],     // gamle navne, en anden fane skrev til undervejs
        failed: [],      // { key, reason } — den gamle står stadig
        lost: [],        // { key, value } — kunne hverken skrives nyt eller gammelt
        quotaFallback: [],
        unknown: [],     // gamle-lignende navne, vi ikke kender (røres ikke)
        error: null,
    };
}

// ─── Kernen ─────────────────────────────────────────────────────────────────

/**
 * Flyt alle gamle nøgler i `storage` (localStorage) til de nye navne.
 * Kan køres så tit, det skal være: findes der ingen gamle nøgler, sker der
 * intet. Kaster aldrig.
 *
 * @param {Storage} storage
 * @param {Object} [opts]
 * @param {string} [opts.freshKey]  et gammelt navn, en gammel fane har skrevet
 *   LIGE NU (storage-hændelsen). Det er den nyeste skrivning, der findes, så
 *   den vinder — men KUN for indstillinger og for en kopis nøgler. En rigtig
 *   klasses grupper/emner/historik overskrives aldrig af en gammel fane.
 * @returns {Object} rapport (se emptyReport)
 */
export function migrateLegacyStorage(storage, { freshKey = null } = {}) {
    const report = emptyReport();
    if (!storage) return report;

    // 1. Øjebliksbillede: navne først (en sletning midt i key(i)-løkken ville
    //    flytte de andre), så værdierne.
    const legacy = [];
    const keyedFiles = new Set();   // filnavne med grupper/emner/historik (gamle eller nye navne)
    let currentClassesRaw;
    try {
        const names = [];
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (k !== null) names.push(k);
        }
        for (const oldKey of names) {
            const file = perClassFile(oldKey);
            if (file !== null) keyedFiles.add(file);
            const target = legacyTarget(oldKey);
            if (!target) {
                if (looksLegacy(oldKey) && !isCurrentKey(oldKey)) report.unknown.push(oldKey);
                continue;
            }
            const oldValue = storage.getItem(oldKey);
            if (oldValue === null) continue;
            legacy.push({ ...target, oldKey, newKey: target.key, oldValue });
        }
        if (legacy.length) currentClassesRaw = storage.getItem(CLASSES_KEY);
    } catch (e) {
        // Lageret kan ikke læses (privat vindue, blokeret). Så er der heller
        // intet at flytte — og siden skal virke som før.
        report.error = 'unreadable';
        return report;
    }
    if (legacy.length === 0) return report;

    // 2. Beslut.
    const classesItem = legacy.find(x => x.kind === 'classes');
    const newClasses = parseList(currentClassesRaw);
    const oldClasses = classesItem ? parseList(classesItem.oldValue) : { ok: true, list: null };
    const plan = (newClasses.ok && oldClasses.ok && oldClasses.list)
        ? planClassLists(newClasses.list || [], oldClasses.list, keyedFiles)
        : null;
    const newList = newClasses.ok ? (newClasses.list || []) : [];
    const createdNow = new Set((plan?.copies || []).map(c => c.to));

    /** Hvor hører en klasses grupper/emner/historik hjemme? */
    const homeOf = (filename) => {
        if (plan && plan.links.has(filename)) return plan.links.get(filename);
        const at = linkedCopyAt(newList, filename);
        return at >= 0 ? newList[at].filename : filename;
    };

    const early = [];   // trin 1
    const late = [];    // trin 3: nøgler til kopier lavet nu
    for (const item of legacy) {
        if (item.kind === 'classes') continue;
        if (item.kind === 'perClass') {
            const home = homeOf(item.suffix);
            item.home = home;
            item.newKey = item.newPrefix + home;
            (createdNow.has(home) ? late : early).push(item);
        } else {
            early.push(item);
        }
    }

    const decide = (item) => {
        const { oldKey, newKey, oldValue } = item;
        // Det nye navn læses IGEN lige før beslutningen — ikke fra
        // øjebliksbilledet. To gamle navne kan nemlig pege på samme nye (en
        // kopi kan få et filnavn, der også står under et gammelt navn), og en
        // anden ny fane kan have flyttet imens. Med en gammel læsning troede
        // den anden, at pladsen var ledig, skrev oven i den første — og den
        // første var allerede slettet under sit gamle navn.
        const newValue = safeGet(storage, newKey);
        if (newValue === undefined) { report.failed.push({ key: oldKey, reason: 'error' }); return; }
        if (newValue === null) {
            if (transfer(storage, oldKey, newKey, oldValue, oldValue, report)) { report.moved++; report.written.push(newKey); }
            return;
        }
        if (newValue === oldValue) { dropOld(storage, oldKey, newKey, oldValue, report); return; }

        const toCopy = item.kind === 'perClass' && item.home !== item.suffix;
        const copyWasUpdated = toCopy && plan?.updated.has(item.home);
        if (item.kind === 'setting') {
            // En indstilling (sidste klasse, nyhedsfilteret): den nye bliver —
            // medmindre den gamle fane har sat den lige nu.
            if (oldKey === freshKey) {
                if (transfer(storage, oldKey, newKey, oldValue, oldValue, report)) { report.replaced++; report.written.push(newKey); }
            } else {
                dropOld(storage, oldKey, newKey, oldValue, report);
            }
            return;
        }
        if (toCopy && (oldKey === freshKey || copyWasUpdated)) {
            // Kopien er den gamle fanes egen: dens nyeste skrivning hører dér.
            if (transfer(storage, oldKey, newKey, oldValue, oldValue, report)) { report.replaced++; report.written.push(newKey); }
            return;
        }
        // To forskellige udgaver, og ingen måde at vide, hvilken der er den
        // rigtige. Ingen slettes.
        report.undecided.push(oldKey);
    };

    // 3. Udfør. Trin 1: alt andet end klasselisten og de nye kopiers nøgler.
    for (const item of early) decide(item);

    // Trin 2: klasselisten — kun hvis intet fejlede, så næste kørsel stadig
    // har den gamle liste at beslutte ud fra.
    let classesDone = !classesItem;
    if (classesItem) {
        const { oldKey, oldValue } = classesItem;
        if (report.failed.length || report.lost.length) {
            report.failed.push({ key: oldKey, reason: 'waiting' });
        } else if (!plan) {
            if (!oldClasses.ok && currentClassesRaw === null) {
                // Ulæselig, men intet under det nye navn: flyt den, som den er
                // (appen siger selv, at listen ikke kan læses).
                if (transfer(storage, oldKey, CLASSES_KEY, oldValue, oldValue, report)) {
                    report.moved++; report.written.push(CLASSES_KEY); classesDone = true;
                }
            } else {
                // Én af listerne kan ikke læses: ingen af dem skrives ovenpå
                // den anden.
                report.failed.push({ key: oldKey, reason: 'unreadable' });
            }
        } else {
            const merged = JSON.stringify(plan.list);
            if (merged === currentClassesRaw) {
                dropOld(storage, oldKey, CLASSES_KEY, oldValue, report);
                classesDone = true;
            } else if (transfer(storage, oldKey, CLASSES_KEY, merged, oldValue, report)) {
                if (currentClassesRaw === null) report.moved++; else report.merged++;
                report.written.push(CLASSES_KEY);
                report.copies.push(...plan.copies);
                classesDone = true;
            }
        }
    }

    // Trin 3: nøglerne til kopier lavet nu — først når kopien står i listen.
    if (classesDone) for (const item of late) decide(item);
    return report;
}

/**
 * sessionStorage: kun mens fanen er åben, så den nye vinder, hvis begge findes.
 */
export function migrateLegacySession(storage) {
    const report = emptyReport();
    if (!storage) return report;
    for (const [oldKey, newKey] of LEGACY_SESSION) {
        let oldValue, newValue;
        try {
            oldValue = storage.getItem(oldKey);
            if (oldValue === null) continue;
            newValue = storage.getItem(newKey);
        } catch {
            report.error = 'unreadable';
            return report;
        }
        if (newValue === null) {
            if (transfer(storage, oldKey, newKey, oldValue, oldValue, report)) { report.moved++; report.written.push(newKey); }
        } else {
            dropOld(storage, oldKey, newKey, oldValue, report);
        }
    }
    return report;
}

/** Ligger der stadig data under et gammelt navn (fx fordi flytningen fejlede)? */
export function hasLegacyData(storage) {
    try {
        for (let i = 0; i < storage.length; i++) {
            if (legacyTarget(storage.key(i))) return true;
        }
        return false;
    } catch {
        return true;   // kan ikke se efter — så antag det værste
    }
}

/**
 * En pakke nøgler udefra (www.dida.dk, dida.dk/grupper) med de nye navne.
 * Pakken kan have de gamle navne, de nye eller begge (?bliv=1 på de adresser
 * kører den samme app). Den sendes gennem PRÆCIS samme flytning som lageret —
 * i et lager i hukommelsen — så de samme regler gælder overalt. Ukendte
 * nøgler kommer ikke med.
 *
 * @param {Object} entries  navn → rå streng
 * @returns {Object} navn → rå streng (uden prototype: et filnavn som
 *   "__proto__" er bare et navn)
 */
export function toCurrentEntries(entries) {
    const out = Object.create(null);
    if (!entries || typeof entries !== 'object') return out;
    const grupper = {};
    for (const k of Object.keys(entries)) {
        if ((isCurrentKey(k) || legacyTarget(k)) && typeof entries[k] === 'string') grupper[k] = entries[k];
    }
    const mem = memoryStorage(grupper);
    migrateLegacyStorage(mem);
    for (const [k, v] of mem.entries()) if (isCurrentKey(k)) out[k] = v;
    return out;
}

/**
 * Flytningen fra dida.dk/grupper (?migrate=<token>): skriv pakken under de
 * nye navne — men kun hvor intet ligger i forvejen, under hverken det nye
 * eller det gamle navn. Sådan var det også før navneskiftet: det, der
 * allerede står på grup.dk, overskrives aldrig.
 *
 * @returns {number} antal nøgler skrevet
 */
export function adoptTransferEntries(storage, entries) {
    let written = 0;
    if (!storage || !entries || typeof entries !== 'object') return written;
    const current = toCurrentEntries(entries);
    for (const key of Object.keys(current)) {
        try {
            if (storage.getItem(key) !== null) continue;
            const old = legacyNameFor(key);
            if (old && storage.getItem(old) !== null) continue;
            storage.setItem(key, current[key]);
            written++;
        } catch { /* fuldt eller låst lager: resten prøves stadig */ }
    }
    return written;
}

// ─── Når en klasse slettes ──────────────────────────────────────────────────

/**
 * Fjern ALT, der står under de gamle navne for klassen `filename`: grupper,
 * emner, historik, de sessioner den gamle historik nævner, og klassens linje i
 * en gammel klasseliste, der endnu ikke er flyttet. Kaldes af
 * cleanupClassStorage() i storage.js, når en klasse slettes.
 *
 * HVORFOR: en nøgle, der stod "uafgjort" under det gamle navn, overlevede
 * ellers sletningen. Lagde læreren så en ny klasse ind med samme filnavn
 * (næste års 3.b), flyttede næste opstart den gamle historik over på den — med
 * slettede elevers navne. GDPR-siden lover, at en slettet klasse er væk.
 */
export function removeLegacyClassData(storage, filename) {
    if (!storage || typeof filename !== 'string' || !filename) return;
    // Har en kopi overtaget det gamle filnavn (legacyFilename), hører de gamle
    // nøgler til KOPIEN — de fjernes, når kopien slettes, ikke den rigtige.
    try {
        const current = parseList(storage.getItem(CLASSES_KEY));
        if (!current.ok || (current.list || []).some(e => e && e.legacyFilename === filename)) return;
    } catch { return; }
    const historyKey = LEGACY_HISTORY_PREFIX + filename;
    let sessionIds = [];
    try {
        const list = JSON.parse(storage.getItem(historyKey));
        if (Array.isArray(list)) sessionIds = list.filter(e => e && typeof e.id === 'string').map(e => e.id);
    } catch { /* ulæselig: kun selve nøglen fjernes */ }

    // Sessionerne under det nye navn fjernes kun, hvis ingen nuværende
    // historik nævner dem (de kan være flyttet og bruges af en anden klasse).
    const stillUsed = new Set();
    try {
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (!k || !k.startsWith(HISTORY_PREFIX)) continue;
            try {
                const list = JSON.parse(storage.getItem(k));
                if (Array.isArray(list)) list.forEach(e => e && e.id && stillUsed.add(e.id));
            } catch { /* ulæselig: så rører vi ingen af de nye sessioner */ sessionIds.forEach(id => stillUsed.add(id)); }
        }
    } catch { sessionIds.forEach(id => stillUsed.add(id)); }

    const remove = (k) => { try { storage.removeItem(k); } catch { /* låst lager */ } };
    for (const id of sessionIds) {
        remove(LEGACY_SESSION_PREFIX + id);
        if (!stillUsed.has(id)) remove(SESSION_PREFIX + id);
    }
    for (const [oldPrefix, , kind] of LEGACY_PREFIXES) {
        if (kind === 'perClass') remove(oldPrefix + filename);
    }

    // Står klassen stadig i en gammel klasseliste (flytningen kunne ikke
    // gøre det færdigt), ville den komme igen ved næste opstart.
    try {
        const raw = storage.getItem(LEGACY_CLASSES_KEY);
        if (raw !== null) {
            const list = JSON.parse(raw);
            if (Array.isArray(list) && list.some(e => e && e.filename === filename)) {
                const kept = list.filter(e => !(e && e.filename === filename));
                if (kept.length) storage.setItem(LEGACY_CLASSES_KEY, JSON.stringify(kept));
                else storage.removeItem(LEGACY_CLASSES_KEY);
            }
        }
    } catch { /* ulæselig liste: rør den ikke */ }
}

/**
 * Hvad oprydningen ved opstart skal holde sig fra, fordi det har en udgave
 * under et gammelt navn, som flytningen endnu ikke har afgjort.
 *   files:    filnavne med gamle nøgler (eller i en gammel klasseliste)
 *   sessions: session-id'er under det gamle navn eller i en gammel historik
 *   all:      noget kunne ikke læses — så ryddes der slet ikke op
 */
export function legacyProtection(storage) {
    const files = new Set();
    const sessions = new Set();
    try {
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            const t = legacyTarget(key);
            if (!t) continue;
            const value = storage.getItem(key);
            if (t.kind === 'perClass') {
                files.add(t.suffix);
                if (key.startsWith(LEGACY_HISTORY_PREFIX)) {
                    const parsed = parseList(value);
                    if (!parsed.ok) return { all: true, files, sessions };
                    for (const e of parsed.list || []) if (e && typeof e.id === 'string') sessions.add(e.id);
                }
            } else if (t.kind === 'session') {
                sessions.add(t.suffix);
            } else if (t.kind === 'classes') {
                const parsed = parseList(value);
                if (!parsed.ok) return { all: true, files, sessions };
                for (const e of parsed.list || []) if (hasFilename(e)) files.add(e.filename);
            }
        }
    } catch {
        return { all: true, files, sessions };
    }
    return { all: false, files, sessions };
}
