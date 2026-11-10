import { normalizeImportHeaders } from './importData.js';

// py_bridge.js — klasserne i localStorage: oprette, læse, gemme, omdøbe,
// slette, og importen af en elevliste.
//
// Navnet er historisk: indtil 3/11 2026 var filen også forbindelsen til den
// gamle Python-motor (Pyodide i en Web Worker). Den del er fjernet; grupperne
// dannes nu af motoren i motor/engine (se nextEngine.js). `pyBridge` og
// `isReady` er beholdt, fordi resten af appen og testene bruger dem.

import { parseCSV, stripEmptyColumns, ensureRowIds, isInternalField, columnsOfRows, nfc } from './utils.js';
import { CLASSES_KEY, UNREADABLE_CLASSES_KEY } from './storageKeys.js';
import { removeLegacyClassData, isQuotaError } from './migrateStorage.js';

/** Så mange rækker tages højst med fra én import. Et helt årgangshold er
 *  sjældent over 300; motoren får 30 sekunder over 100 elever
 *  (nextEngine.appBudget), og 500 holder kørslen inden for det. */
export const MAX_ROWS_PER_CLASS = 500;

/**
 * localStorage.setItem, der tåler fuld lagerplads.
 * Viser læreren en besked, når lageret er fuldt.
 * @param {string} key - nøglen
 * @param {string} value - værdien
 * @returns {boolean} true, hvis det blev gemt
 */
function safeStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        if (isQuotaError(e)) {
            console.error('[Storage] Quota exceeded for key:', key);
            const msg = 'Browserens lagerplads er fuld!\n\n' +
                'Forslag:\n' +
                '- Slet gamle klasser eller sessioner\n' +
                '- Eksportér en backup og ryd data\n' +
                '- Ryd historik i Historik-fanen';
            if (window.notifyError) window.notifyError(msg); else console.error(msg);
            return false;
        }
        console.error('[Storage] Error setting item:', e);
        return false;
    }
}

/**
 * Hvor meget af browserens lagerplads er brugt.
 *
 * Tælles med `length` + `key(i)` frem for `for…in`: Storage-objektet lover
 * kun den indekserede adgang, og både nøglen og værdien fylder. Tallet er
 * et estimat — browserne måler ikke helt ens — men det er præcist nok til
 * at advare i tide.
 *
 * Bemærk at ALLE dida.dk-værktøjer deler den samme lagerplads (samme
 * domæne), så tallet dækker mere end Grupper. Det er også det rigtige at
 * måle på: det er den fælles grænse en skrivning støder ind i.
 */
function getStorageUsage() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key === null) continue;
        const value = localStorage.getItem(key) || '';
        total += (key.length + value.length) * 2; // UTF-16
    }
    return { usedBytes: total, usedMB: (total / (1024 * 1024)).toFixed(2) };
}

/**
 * Browserens localStorage er i praksis 5 MB pr. domæne. Advarslen skal
 * komme mens der stadig er plads til at gøre noget ved det — er kvoten
 * først fuld, er den skrivning der opdagede det allerede tabt, og der
 * findes ingen server med en kopi.
 */
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024;
const STORAGE_WARN_RATIO = 0.8;

/**
 * Kig efter fyldt lagerplads. Returnerer en lærervendt besked når der er
 * mindre end 20 % tilbage — ellers `null`.
 */
function getStoragePressureWarning() {
    const { usedBytes, usedMB } = getStorageUsage();
    if (usedBytes < STORAGE_LIMIT_BYTES * STORAGE_WARN_RATIO) return null;
    const pct = Math.min(99, Math.round((usedBytes / STORAGE_LIMIT_BYTES) * 100));
    return `Browserens lagerplads er ${pct} % fuld (${usedMB} MB). ` +
        'Alt om dine klasser ligger i browseren — der er ingen kopi andre steder. ' +
        'Gem en backup under Import & backup, og slet så en gammel klasse eller ' +
        'ryd historikken, mens der stadig er plads.';
}

/** Klasserne i localStorage (singletonen `pyBridge` nederst). */
class ClassStore {
    constructor() {
        // Klasserne ligger i localStorage og er klar med det samme. (Flaget
        // stammer fra den gamle Python-motor, der skulle hentes først; e2e-
        // testene og et par steder i appen spørger stadig på det.)
        this.isReady = true;
        this.ready = Promise.resolve();

        // Den parsede `grupdk_classes` gemmes — og smides væk ved hver
        // skrivning. Gør mest gavn, når flere læsninger kommer lige efter
        // hinanden (fx listen på skærmen + getClass + autoSaves fletning).
        // BEMÆRK: cachen er KUN til læsning. Alt der skriver skal gå gennem
        // `_readClassesForWrite()` — se forklaringen dér.
        this._classesCache = null;
        // Den rå tekst, hvis klasselisten ikke kunne læses (ellers null).
        this._unreadableRaw = null;

        // filename -> det `last_modified` DENNE fane sidst så eller skrev.
        // Bruges til at opdage, at en anden fane har ændret samme klasse —
        // se _checkForeignEdit().
        this._seenModified = new Map();
        this._foreignEditWarned = new Set();

        // filename -> klassens indhold (som JSON-tekst), sådan som DENNE fane
        // sidst læste eller skrev det. Bruges til at se, om fanen overhovedet
        // har noget nyt at gemme — se _hasOwnChange().
        this._seenContent = new Map();

        // Klasser denne fane allerede har sagt fra om, fordi de var slettet
        // et andet sted. Én besked pr. klasse — se warnClassDeletedElsewhere().
        this._deletedElsewhereWarned = new Set();

        // Har læreren appen åben i to faner, skriver de i det SAMME
        // localStorage. Uden denne lytter ville fane A's cache aldrig opdage
        // at fane B har oprettet en klasse, og A's næste skrivning ville
        // sende hele den forældede liste tilbage — B's klasse væk.
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('storage', (e) => {
                if (!e.key || e.key === CLASSES_KEY) this._invalidateClassesCache();
            });
        }

    }

    // --- Data Persistence (LocalStorage) ---

    /** Smid den gemte klasseliste væk — kaldes efter hver skrivning. */
    _invalidateClassesCache() {
        this._classesCache = null;
    }

    getClasses() {
        if (this._classesCache !== null) return this._classesCache;
        return this._readClassesForWrite();
    }

    /**
     * Læs klasselisten UDEN om cachen. Skal bruges af alt der ændrer og
     * gemmer listen igen.
     *
     * Grunden er, at hver skrivning gemmer HELE `grupdk_classes` på én
     * gang. Læses udgangspunktet fra en forældet cache, bliver alt hvad
     * andre har skrevet i mellemtiden skrevet væk — typisk når læreren har
     * appen åben i to faner, men også efter en fejlet skrivning. En frisk
     * læsning koster ét JSON.parse pr. gem og fjerner hele klassen af fejl.
     */
    _readClassesForWrite() {
        let data = null;
        try {
            data = localStorage.getItem(CLASSES_KEY);
            const parsed = data ? JSON.parse(data) : [];
            // En læsbar, men forkert form (fx et objekt) må ikke ende som
            // klasselisten — `.findIndex` ville kaste midt i et gem.
            this._classesCache = Array.isArray(parsed) ? parsed : [];
            this._unreadableRaw = Array.isArray(parsed) ? null : data;
            if (!Array.isArray(parsed)) this._warnClassesUnreadable();
            return this._classesCache;
        } catch (e) {
            console.error('[PyBridge] Error reading classes:', e);
            // Klasselisten kunne ikke læses. Vi fortsætter med en tom liste —
            // ellers kan appen slet ikke bruges. Næste gem skriver en ny liste
            // ovenpå, men FØRST lægges de gamle bytes til side (se
            // _keepUnreadableCopy). Læreren skal stadig vide det: der findes
            // ingen server med en kopi.
            this._unreadableRaw = typeof data === 'string' ? data : null;
            this._warnClassesUnreadable();
            this._classesCache = [];
            return this._classesCache;
        }
    }

    /**
     * Læg en ulæselig klasseliste til side, før en ny skrives ovenpå.
     *
     * Uden det her var ALT væk efter første gem: oprettede læreren en ny
     * klasse eller gendannede en backup (det, beskeden om den ulæselige liste
     * selv peger på), skrev gemmet en liste med kun den ene klasse oven i de
     * gamle bytes. Og ved næste opstart kunne listen læses igen, så
     * oprydningen (cleanupOrphanedClassData) slettede grupper, emner,
     * historik og sessioner for alle de klasser, der kun stod i den gamle.
     *
     * Kopien skrives KUN, hvis der ikke allerede ligger en: den første er
     * den oprindelige, og en anden fane må ikke erstatte den med noget nyere.
     * Mens kopien findes, rydder oprydningen ved opstart ikke op (storage.js).
     * Kan kopien ikke skrives (fuldt lager), skrives klasselisten heller
     * ikke — så står de gamle bytes, hvor de stod.
     *
     * @returns {boolean} true, hvis klasselisten må skrives
     */
    _keepUnreadableCopy() {
        if (this._unreadableRaw == null) return true;
        try {
            if (localStorage.getItem(UNREADABLE_CLASSES_KEY) !== null) return true;
        } catch (e) {
            return false;
        }
        return safeStorageSet(UNREADABLE_CLASSES_KEY, this._unreadableRaw);
    }

    /** Skriv hele klasselisten — efter at en ulæselig udgave er lagt til side. */
    _saveClasses(classes) {
        if (!this._keepUnreadableCopy()) return false;
        return safeStorageSet(CLASSES_KEY, JSON.stringify(classes));
    }

    /** Kun én gang pr. fane — beskeden gentaget ved hvert gem er ubrugelig. */
    _warnClassesUnreadable() {
        if (this._classesWarned) return;
        this._classesWarned = true;
        // Den gamle tekst sagde "opret ikke en ny klasse — så overskrives de
        // gamle data". Siden 4/11 2026 lægges listen til side før første gem
        // (_keepUnreadableCopy), så læreren må gerne gendanne en backup.
        const msg = 'Klasselisten i browseren kunne ikke læses, og dine klasser '
            + 'vises derfor ikke.\n\nPrøv først at genindlæse siden. Hjælper det '
            + 'ikke, kan du gendanne dine klasser fra en backup under "Import & backup". '
            + 'Den ulæselige liste bliver lagt til side i browseren, før noget nyt gemmes.';
        if (typeof window !== 'undefined' && window.notifyError) window.notifyError(msg);
        else console.error(msg);
    }

    /**
     * Find én klasse i lageret.
     *
     * `track: true` betyder "den her udgave kommer nu på skærmen": fanen
     * husker den som den udgave, den kender (se _hasOwnChange og
     * _checkForeignEdit). KUN indlæsningen af klassen må sætte det. En
     * backup eller en sammenligning, der bare læser, må ikke: så tror fanen,
     * at den kender lagerets NYE udgave, mens skærmen stadig viser den
     * gamle, og næste gem — fx når fanen lukkes — skriver den gamle over
     * den nye uden advarsel. Målt 10/11 2026 med en backup i en gammel fane.
     *
     * Derfor er standarden at IKKE huske noget. Glemmer en ny indlæsning
     * flaget, får fanen i værste fald en advarsel for meget eller skriver
     * en rigtig ændring — aldrig en stille overskrivning.
     */
    getClass(filename, { track = false } = {}) {
        const classes = this.getClasses();
        const cls = classes.find(c => c.filename === filename);
        // Hold styr på hvilken udgave af klassen VI kender. Se _checkForeignEdit().
        if (cls && track) {
            this._seenModified.set(filename, cls.last_modified || null);
            this._seenContent.set(filename, JSON.stringify(cls.content ?? null));
        }
        return cls;
    }

    /**
     * Har denne fane noget at gemme, som den ikke allerede har læst eller skrevet?
     *
     * Et gem skriver HELE klassen. Før skrev en fane også, når intet var
     * ændret: et klik i en celle og videre, og især når fanen blev LUKKET
     * (flushPendingWrites() gemmer en sidste gang). Med samme klasse åben i
     * to faner — fx et link fra Lectio, der åbner en ny — skrev en gammel,
     * urørt fane så sin gamle udgave over alt, hvad læreren havde lavet i
     * den anden: rettede navne, regler, emner. Målt 10/11 2026.
     *
     * Her lægges det, der skal gemmes, oven på den udgave fanen kender. Står
     * der det samme bagefter, har fanen intet nyt, og intet skrives. Har
     * begge faner rettet, gælder det gamle: sidste gem vinder, og
     * _checkForeignEdit() siger det.
     */
    _hasOwnChange(filename, newContent) {
        const seen = this._seenContent.get(filename);
        if (seen === undefined) return true;
        try {
            const known = JSON.parse(seen);
            if (!known || typeof known !== 'object') return true;
            // En klasse gemt af en ældre udgave mangler nogle af de nyere
            // felter (fx columnOrders). Dem skriver første gem — det ER en
            // ændring, og bagefter kender fanen den fulde udgave.
            return JSON.stringify({ ...known, ...newContent }) !== seen;
        } catch {
            return true;
        }
    }

    /**
     * Har en ANDEN fane ændret klassen, siden vi sidst så den?
     *
     * Hvorfor det er værd at opdage: har læreren Grupper åben i to faner med
     * SAMME klasse, ligger klassen i hukommelsen begge steder. Retter hun en
     * celle i fane A, og bagefter et emne i fane B, skriver B hele sin egen
     * — nu forældede — udgave af klassen tilbage, og A's rettelse er væk.
     * `_readClassesForWrite()` beskytter listen mod at miste ANDRE klasser,
     * men den kan ikke se, at netop denne klasse er blevet ændret under den.
     *
     * `last_modified` sættes ved hver skrivning, så et andet tidsstempel end
     * det, vi selv sidst så eller skrev, kan kun komme fra en anden fane.
     *
     * Vi nægter IKKE at gemme: det læreren har på skærmen, er det hun er i
     * gang med, og at afvise det ville koste hende arbejde uden en vej ud.
     * Men hun skal vide, at den anden fane nu er forældet — ellers fortsætter
     * hun dér og overskriver det her i næste omgang.
     */
    _checkForeignEdit(filename, existing) {
        if (!existing) return;
        const seen = this._seenModified.get(filename);
        // Første gang vi rører klassen i denne fane: intet at sammenligne med.
        if (seen === undefined) return;
        if ((existing.last_modified || null) === seen) return;

        // Kun én gang pr. klasse. Advarslen gentaget ved hvert eneste
        // tastetryk ville dække skærmen, og beskeden er den samme.
        if (this._foreignEditWarned.has(filename)) return;
        this._foreignEditWarned.add(filename);

        const name = existing.name || filename;
        const msg = `"${name}" er også åben i en anden fane, og den blev ændret dér.\n\n`
            + 'Det du har på skærmen her, bliver gemt nu — men den anden fane '
            + 'viser en gammel udgave. Genindlæs den, før du retter mere dér, '
            + 'ellers skriver den det her væk igen.';
        if (typeof window !== 'undefined' && window.notifyError) window.notifyError(msg);
        else console.warn(msg);
    }

    /**
     * Sig ÉN gang, at klassen er slettet et andet sted.
     *
     * Kaldes to steder, og derfor ligger tælleren her og ikke i kaldstedet:
     * fra `updateClass()`, når et gem opdager at klassen er væk, og fra
     * topbarens storage-lytter, når den anden fanes sletning lander mens
     * læreren sidder med klassen åben. Uden det fælles sæt ville de to veje
     * sige det samme to gange om den samme klasse.
     */
    warnClassDeletedElsewhere(filename, name) {
        if (this._deletedElsewhereWarned.has(filename)) return;
        this._deletedElsewhereWarned.add(filename);
        const displayName = name || filename;
        const msg = `"${displayName}" er slettet i en anden fane, og findes ikke længere.\n\n`
            + 'Det du havde på skærmen her, kan ikke gemmes — klassen blev slettet, '
            + 'mens den lå åben. Er sletningen en fejl, kan klassen hentes tilbage '
            + 'fra en backup under "Import & backup".';
        if (typeof window !== 'undefined' && window.notifyError) window.notifyError(msg);
        else console.warn(msg);
    }

    // BEMÆRK: her lå `saveClass(filename, dataObj)` — vejen ind for
    // POST /api/classes. Den blev aldrig kaldt: alle tre importveje
    // (fil, indsæt, ny tom klasse) går gennem `createClass()`, og
    // `api.uploadClass()` havde ingen kaldere. Den gemte klassen som en
    // RÅ CSV-streng i `content` og lagde interne felter (_rowId, _excluded)
    // i kolonnelisten — begge dele ting `updateClass()` udtrykkeligt undgår.
    // En død skrivevej ind i det eneste sted lærerens data findes er
    // farligere end den er nyttig, så den er væk. (Gennemsyn 2026-08-25.)

    /**
     * Gem en klasse der allerede findes.
     *
     * `options.allowCreate` er KUN til gendannelse fra backup. Alle andre
     * veje ind hertil er et gem af en klasse, der allerede står i listen —
     * og findes den ikke, er den slettet et andet sted, ikke ny. Se
     * forklaringen ved `idx === -1` nedenfor.
     *
     * `options.name` sendes KUN med af den samme gendannelse. Navnet i menuen
     * ligger uden for `content`, så et almindeligt gem skal lade det stå — men
     * en gendannelse bærer lærerens eget navn med i backup-filen, og det skal
     * følge med tilbage.
     */
    updateClass(filename, data, rules, idColumn, separations, settings, matrixSettings, matrixRules, topics, columnOrders, options = {}) {
        let classes = this._readClassesForWrite();
        let idx = classes.findIndex(c => c.filename === filename);

        const newContent = {
            data: data,
            rules: rules,
            id_column: idColumn,
            separations: separations,
            togetherGroups: Array.isArray(options.togetherGroups) ? options.togetherGroups
                : (classes[idx]?.content?.togetherGroups || []),
            settings: settings || {},
            matrixSettings: matrixSettings || {},
            matrixRules: matrixRules || [],
            topics: Array.isArray(topics) ? topics : [],
            // Rangering af tekstkolonner. Eget felt — se saveClassData i api.js
            // for hvorfor den ikke ligger i `settings`.
            columnOrders: (columnOrders && typeof columnOrders === 'object'
                && !Array.isArray(columnOrders)) ? columnOrders : {},
            // Kolonner læreren har foldet væk med et højreklik på overskriften.
            // Ligesom togetherGroups falder feltet tilbage på det gemte, når
            // kalderen ikke sender det med — ellers ville et gem fra en vej,
            // der ikke kender feltet, tørre lærerens valg af.
            hiddenColumns: Array.isArray(options.hiddenColumns)
                ? options.hiddenColumns.filter(c => typeof c === 'string')
                : (classes[idx]?.content?.hiddenColumns || [])
        };

        if (data && data.length > 0) {
            // Interne felter (_rowId, _excluded) er ikke kolonner læreren har
            // lavet og må ikke ende i kolonnelisten — de ville dukke op i
            // "Vis:"-menuen og i elevtabellen. Indlæsningen filtrerer dem også,
            // men at gemme dem i første omgang er bare støj i lageret.
            // __MatrixSource__ (dobbelt underscore) er et ægte input og bliver.
            newContent.columns = columnsOfRows(data).filter(h => !isInternalField(h));
        }

        const stamp = new Date().toISOString();

        if (idx === -1 && !options.allowCreate) {
            // Klassen står ikke i listen. Den ENESTE vej hertil, hvor det
            // betyder "ny klasse", er en gendannelse fra backup — al import
            // går gennem createClass(), som skriver klassen selv. Her betyder
            // det derfor: klassen er slettet, mens den lå åben.
            //
            // Det sker med to faner. Læreren sletter 3.b i den ene, og den
            // anden sidder stadig med klassen på skærmen: et tastetryk i en
            // celle — eller bare at lukke fanen, hvor flushPendingWrites()
            // gemmer en sidste gang — skrev før klassen tilbage i listen.
            // Den kom igen UDEN sine grupper, sin historik og sine emner
            // (cleanupClassStorage har slettet dem), så det var ikke engang
            // klassen der kom tilbage, men en halv én. Og elevernes navne var
            // tilbage i browseren, efter at læreren havde slettet dem —
            // præcis det, GDPR-siden lover ikke sker.
            //
            // Vi gemmer ikke. Der er intet at gemme det i.
            this.warnClassDeletedElsewhere(filename, null);
            return { error: 'Klassen er slettet et andet sted og kan ikke gemmes.' };
        }

        if (idx === -1) {
            // Create new class (gendannelse fra backup — se options.allowCreate).
            // Klassen findes igen, så en tidligere advarsel om at den var
            // slettet, skal ikke tie en fremtidig sletning ihjel.
            this._deletedElsewhereWarned.delete(filename);
            const restoredName = typeof options.name === 'string' && options.name.trim()
                ? options.name.trim() : null;
            classes.push({
                filename: filename,
                // Filnavnet er en slug ("3_b_samfundsfag_a"). Det duer som
                // nødnavn, men aldrig når backuppen har lærerens eget med.
                name: restoredName || filename.replace(/\.(json|csv)$/i, ''),
                last_modified: stamp,
                content: newContent
            });
        } else {
            // Intet nyt fra denne fane: lad lageret stå, som det står — også
            // hvis en anden fane har skrevet i det (se _hasOwnChange). Ikke
            // ved en gendannelse (den bærer et navn) eller en kopi fra før
            // navneskiftet (den skal tages i brug ved første gem, nedenfor).
            if (typeof options.name !== 'string' && !classes[idx].legacyFilename
                && !this._hasOwnChange(filename, newContent)) {
                return { success: true, unchanged: true };
            }
            // Har en anden fane ændret klassen, siden vi sidst så den? Så skal
            // læreren høre det — vi er ved at skrive den andens rettelse væk.
            this._checkForeignEdit(filename, classes[idx]);
            // Update existing
            classes[idx].content = {
                ...classes[idx].content,
                ...newContent
            };
            // Kun gendannelsen sender et navn med. "Erstat" betyder at
            // backuppens udgave af klassen træder i stedet for den her —
            // også dens navn. Et almindeligt gem har ingen `name` og lader
            // derfor omdøbninger stå.
            if (typeof options.name === 'string' && options.name.trim()) {
                classes[idx].name = options.name.trim();
            }
            classes[idx].last_modified = stamp;
            // Første gang den nye kode gemmer en kopi fra en fane fra før
            // navneskiftet, er den lærerens: den gamle fane må ikke længere
            // skrive i den (se migrateStorage.js, legacyFilename).
            delete classes[idx].legacyFilename;
        }

        if (!this._saveClasses(classes)) {
            // Skrivningen fejlede — smid den ændrede liste væk igen.
            // Uden dette bliver cachen ved med at vise ændringen som om
            // den var gemt, og læreren opdager først tabet ved næste reload.
            this._invalidateClassesCache();
            return { error: 'Lagerplads fuld! Slet nogle klasser.' };
        }
        // Nu er DET her den udgave, denne fane kender.
        this._seenModified.set(filename, stamp);
        const written = classes.find(c => c.filename === filename);
        if (written) this._seenContent.set(filename, JSON.stringify(written.content ?? null));
        this._invalidateClassesCache();
        return { success: true };
    }

    deleteClass(filename) {
        let classes = this._readClassesForWrite();
        // En kopi fra en fane fra før navneskiftet (se migrateStorage.js) ejer
        // de gamle nøgler under sit oprindelige filnavn. De skal med ud.
        const legacyOf = classes.find(c => c.filename === filename)?.legacyFilename;
        classes = classes.filter(c => c.filename !== filename);
        // Sletningen SKAL rapportere om den lykkedes: den kaldende kode rydder
        // klassens grupper, historik og emner bagefter, og de kan ikke hentes
        // tilbage. Lykkes skrivningen ikke (Safari i privat browsing afviser
        // ALLE skrivninger), skal oprydningen ikke køre.
        if (!this._saveClasses(classes)) {
            this._invalidateClassesCache();
            return { error: 'Klassen kunne ikke slettes — browseren afviste at gemme ændringen.' };
        }
        // Klassen findes ikke længere — bær ikke dens tidsstempel med rundt.
        this._seenModified.delete(filename);
        this._seenContent.delete(filename);
        this._foreignEditWarned.delete(filename);
        // …og glem at vi har advaret om den. Kommer den tilbage fra en backup
        // og bliver slettet igen, skal beskeden kunne komme igen.
        this._deletedElsewhereWarned.delete(filename);
        this._invalidateClassesCache();
        if (typeof legacyOf === 'string') {
            try { removeLegacyClassData(localStorage, legacyOf); } catch (e) { console.error(e); }
        }
        return { success: true };
    }

    renameClass(filename, newName) {
        let classes = this._readClassesForWrite();
        let idx = classes.findIndex(c => c.filename === filename);
        if (idx === -1) return { error: "Class not found" };

        this._checkForeignEdit(filename, classes[idx]);
        const stamp = new Date().toISOString();
        classes[idx].name = newName;
        classes[idx].last_modified = stamp;
        // Læreren har taget kopien i brug: en fane fra før navneskiftet må
        // ikke længere skrive i den (se migrateStorage.js, legacyFilename).
        delete classes[idx].legacyFilename;

        if (!this._saveClasses(classes)) {
            // Skrivningen fejlede — smid den ændrede liste væk igen.
            // Uden dette bliver cachen ved med at vise ændringen som om
            // den var gemt, og læreren opdager først tabet ved næste reload.
            this._invalidateClassesCache();
            return { error: 'Lagerplads fuld!' };
        }
        // Vores egen skrivning må ikke ligne en fremmed fanes næste gang —
        // uden den her linje ville et omdøb udløse advarslen ved næste gem.
        // Den står EFTER skrivningen, ligesom i updateClass(): afviste
        // browseren omdøbet, står det gamle stempel stadig i lageret, og
        // husker vi så det nye, kalder næste gem det "ændret i en anden fane".
        this._seenModified.set(filename, stamp);
        this._invalidateClassesCache();
        return { success: true, name: newName };
    }

    /**
     * Et fast filnavn til lageret ud fra klassens navn, som læreren skrev det.
     * Bliver der intet brugbart tilbage, når tegnene er renset, hedder den "klasse".
     */
    _safeFilename(name) {
        const stripped = String(name || '').replace(/[^a-z0-9æøåÆØÅ]/gi, '_').toLowerCase();
        const trimmed = stripped.replace(/^_+|_+$/g, '');
        const base = trimmed.length > 0 ? trimmed : 'klasse';
        return base + '.csv';
    }

    createClass(name, csvContent, hasHeaders = true) {
        try {
            // RFC 4180-parser: klarer citerede felter over flere linjer,
            // skilletegn inde i felter og dobbelte anførselstegn.
            // NFC før alt andet: "å" skrevet som a + ring (typisk kopieret ud af
            // en PDF) gemmes som det ene tegn, et dansk tastatur skriver. Ellers
            // bliver "Århus" og "Århus" to værdier i hver regel og hver liste.
            const parsed = parseCSV(nfc(csvContent));
            if (parsed.length === 0) return { error: 'Tom fil' };

            // Excel-filer har næsten altid et "brugt område" der er bredere end
            // dataene, så importen slæbte en stribe navnløse tomme kolonner med.
            // Fjern dem FØR overskrifterne udledes — ellers bliver en tom
            // kolonne længst til venstre valgt som ID-kolonne, og så mangler
            // ALLE elever et ID ved gruppedannelse.
            const { rows, removed: emptyColumnsRemoved } = stripEmptyColumns(parsed);
            if (rows.length === 0 || rows[0].length === 0) return { error: 'Tom fil' };

            // Find den bredeste række, så kolonner ikke tabes tavst, når en
            // senere række har flere celler end den første.
            let maxCols = 0;
            for (const r of rows) if (r.length > maxCols) maxCols = r.length;

            let headers;
            let dataRows;
            if (hasHeaders) {
                headers = rows[0].slice();
                dataRows = rows.slice(1);
            } else {
                headers = ['Navn'];
                for (let i = 1; i < maxCols; i++) headers.push(`Info ${i}`);
                dataRows = rows;
            }

            // Fyld overskrifterne op til den bredeste række, så ekstra celler overlever.
            while (headers.length < maxCols) headers.push(`Info ${headers.length}`);

            // Excel/CSV-overskrifter er brugerdata, aldrig interne programfelter.
            const originalHeaders = headers;
            headers = normalizeImportHeaders(headers);
            const renamedHeaders = headers.filter((header, index) => header !== String(originalHeaders[index] ?? '').trim());

            if (dataRows.length > MAX_ROWS_PER_CLASS) {
                return { error: `For mange rækker (${dataRows.length}). Maks ${MAX_ROWS_PER_CLASS} elever pr. klasse.` };
            }

            const data = dataRows.map(cols => {
                const row = {};
                headers.forEach((h, idx) => {
                    row[h] = cols[idx] !== undefined ? cols[idx] : '';
                });
                return row;
            });

            // Hver elev får sin egen interne identitet med det samme. Derfor er
            // hverken et tomt eller et gentaget navn længere et problem: to
            // elever der begge hedder "Anna Hansen" er to forskellige rækker.
            ensureRowIds(data);

            const safeName = this._safeFilename(name);
            let classes = this._readClassesForWrite();
            let finalName = safeName;
            if (classes.find(c => c.filename === finalName)) {
                finalName = safeName.replace(/\.csv$/, '') + '_' + Date.now() + '.csv';
            }

            const createStamp = new Date().toISOString();
            const newClass = {
                filename: finalName,
                name: name,
                last_modified: createStamp,
                content: {
                    columns: headers,
                    data: data,
                    rules: [],
                    id_column: headers[0]
                }
            };

            classes.push(newClass);
            if (!this._saveClasses(classes)) {
                // Se saveClass(): cachen må ikke beholde den ugemte klasse.
                this._invalidateClassesCache();
                return { error: 'Lagerplads fuld! Slet nogle klasser.' };
            }
            this._seenModified.set(finalName, createStamp);
            this._invalidateClassesCache();

            // Advarsler der ikke stopper importen, men vises, så læreren kan
            // rette data lige efter.
            const warnings = [];
            if (parsed.unclosedQuote) {
                warnings.push('Filen har et anførselstegn (") i starten af en celle, der aldrig bliver lukket. ' +
                    'Alt efter det blev læst som én lang celle, så der mangler sandsynligvis elever. Ret tegnet i filen og importér igen.');
            }
            if (renamedHeaders.length) {
                warnings.push(`Kolonnenavne blev omdøbt for at bevare alle data og undgå interne feltnavne: ${renamedHeaders.join(', ')}.`);
            }

            // 0) Tomme kolonner fra Excels oppustede "brugte område" er fjernet.
            // Sig det højt — ellers tror læreren at der mangler noget.
            if (emptyColumnsRemoved > 0) {
                warnings.push(`${emptyColumnsRemoved} helt ${emptyColumnsRemoved === 1 ? 'tom kolonne' : 'tomme kolonner'} blev sprunget over ved importen. ` +
                    `Det er normalt for Excel-filer og betyder ikke at der mangler data.`);
            }

            // 0b) Overskriftsrækken har ÉN udfyldt celle, mens resten af arket
            // har flere. Det er mønstret for en titel-linje ("Klasse 1a —
            // elevliste") øverst i et Excel-ark: så bliver titlen læst som
            // kolonnenavne, den rigtige overskriftsrække bliver til en "elev",
            // og alle kolonner hedder "Info 1", "Info 2" …
            //
            // Der advares kun — der rettes ikke automatisk. En fil hvor kun
            // første kolonne HAR en overskrift ser strukturelt fuldstændig
            // ens ud, og at springe linjen over dér ville æde en rigtig elev.
            if (hasHeaders && maxCols >= 2 && rows.length > 2) {
                const filled = (r) => r.filter(c => String(c ?? '').trim() !== '').length;
                const bodyWithSeveral = rows.slice(1).filter(r => filled(r) >= 2).length;
                if (filled(rows[0]) === 1 && bodyWithSeveral >= 2) {
                    const title = String(rows[0].find(c => String(c ?? '').trim() !== '') ?? '').trim();
                    warnings.push(`Bemærk: første linje ("${title}") har kun én udfyldt celle, mens ` +
                        `resten af arket har flere kolonner. Er det en overskrift over regnearket — ` +
                        `og ikke kolonnenavne — så er kolonnerne læst forkert. Slet linjen i filen ` +
                        `og importér igen.`);
                }
            }

            // 1) Tomme celler i visningskolonnen. Ikke længere en fejl — hver
            // elev har sit eget _rowId, så gruppedannelsen kører uanset. Men
            // eleven ville stå uden navn på gruppekortet, så det er værd at
            // nævne. Dubletter nævnes IKKE: to elever må gerne hedde det samme.
            const displayCol = headers[0];
            let blankNames = 0;
            for (const row of data) {
                if (String(row[displayCol] ?? '').trim() === '') blankNames++;
            }
            if (blankNames > 0) {
                warnings.push(blankNames === 1
                    ? `Bemærk: 1 række har ingen værdi i "${displayCol}" og vil stå uden navn i grupperne.`
                    : `Bemærk: ${blankNames} rækker har ingen værdi i "${displayCol}" og vil stå uden navn i grupperne.`);
            }

            // 2) Uens rækker: nogle rækker har FLERE celler end overskriften.
            // Næsten altid et komma brugt både som skilletegn OG som decimal
            // (fx "7,5"), som tavst deler karakterer ud i ekstra kolonner.
            // Måles på `parsed` (FØR tomme kolonner blev fjernet) — stripEmptyColumns
            // gør alle rækker lige lange, så en måling på `rows` ville aldrig give udslag.
            if (hasHeaders) {
                const headerCount = parsed[0].length;
                const ragged = parsed.slice(1).filter(r => r.length > headerCount).length;
                if (ragged > 0) {
                    warnings.push(`Bemærk: ${ragged} ${ragged === 1 ? 'række har' : 'rækker har'} flere ` +
                        `kolonner end overskrifterne. Det sker ofte når komma bruges både som ` +
                        `skilletegn OG i decimaltal (fx "7,5"). Prøv at gemme filen med semikolon (;) ` +
                        `som skilletegn — så bevares decimaltallene.`);
                }
            }

            const result = { success: true, filename: newClass.filename, rowCount: data.length };
            if (warnings.length) result.warning = warnings.join('\n\n');
            return result;

        } catch (e) {
            return { error: e.message };
        }
    }

}


// --- Exported Singleton ---
export const pyBridge = new ClassStore();

// Exported Globals
export { safeStorageSet, getStorageUsage, getStoragePressureWarning };

