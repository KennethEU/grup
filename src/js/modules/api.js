// api.js — kommunikation med "backenden" (adapteren i api_adapter.js, lageret i py_bridge.js)

import { cleanupClassStorage, readClassExtras, writeClassExtras } from './storage.js';
import { MAX_ROWS_PER_CLASS } from './py_bridge.js';

export async function fetchClasses() {
    const response = await fetch('/api/classes');
    return await response.json();
}

/**
 * Hent én klasse. `track: true` KUN når klassen skal på skærmen (AppTopbar:
 * valg af klasse og genindlæsning efter omdøbning). Backuppen og andre, der
 * bare læser, lader den være — se getClass() i py_bridge.js.
 */
export async function fetchClass(filename, { track = false } = {}) {
    // Filnavnet kodes, så et ? eller # i et gammelt filnavn ikke bliver til
    // en del af adressen (adapteren afkoder det igen).
    const query = track ? '?track=1' : '';
    const response = await fetch(`/api/classes/${encodeURIComponent(filename)}${query}`);
    return await response.json();
}

export async function deleteClass(filename) {
    const response = await fetch(`/api/classes/${filename}`, { method: 'DELETE' });
    return await response.json();
}

export async function renameClass(filename, newName) {
    const response = await fetch(`/api/classes/${filename}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
    });
    return await response.json();
}

export async function createClassFromPaste(name, content, hasHeaders) {
    const response = await fetch('/api/classes/paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content, has_headers: hasHeaders })
    });
    return await response.json();
}

/**
 * `columnOrders` er rangeringen af tekstkolonner ({ "Niveau": ["Lav", …] }).
 * Den ligger som sit EGET felt og ikke i `settings`, fordi
 * `runHistory.restoreSession()` erstatter `settings` i sin helhed, når læreren
 * går tilbage til en tidligere kørsel med indstillinger — en rangering lavet
 * bagefter ville forsvinde uden en lyd. Rangeringen beskriver kolonnen, ikke
 * kørslen, og skal ikke rulles tilbage.
 *
 * `options.allowCreate` er KUN til gendannelse fra backup: dér SKAL en klasse
 * kunne skrives, selvom den ikke findes i forvejen. Alle andre kald er et gem
 * af en klasse, læreren har åben — findes den ikke længere, er den slettet i
 * en anden fane, og så må gemmet ikke skrive den tilbage. Se updateClass().
 *
 * `options.name` er OGSÅ kun til gendannelse. Klassens VISTE navn ligger uden
 * for `content`, så et almindeligt gem rører det aldrig — men en gendannelse
 * opretter klassen forfra, og uden navnet her fandt updateClass() på et selv
 * ud fra filnavnet. En backup af "3.b Samfundsfag A" kom tilbage som
 * "3_b_samfundsfag_a" i menuen, netop i den browser hvor backuppen var det
 * eneste tilbage. Se updateClass() i py_bridge.js.
 */
// togetherGroups og hiddenColumns følger klassens øvrige indhold; options
// holder den lange argumentliste stabil. hiddenColumns er de kolonner,
// læreren har foldet væk i elevlisten — udelades den, bevarer
// updateClass() det gemte valg frem for at tørre det af.
export async function saveClassData(filename, data, rules, idColumn, separations, settings, matrixSettings, matrixRules, topics, columnOrders, options = {}) {
    const response = await fetch(`/api/classes/${filename}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            allowCreate: options.allowCreate === true,
            name: typeof options.name === 'string' ? options.name : undefined,
            data: data,
            rules: rules,
            id_column: idColumn,
            separations: separations,
            togetherGroups: options.togetherGroups,
            settings: settings,
            matrixSettings: matrixSettings,
            matrixRules: matrixRules,
            topics: topics,
            columnOrders: columnOrders,
            hiddenColumns: options.hiddenColumns
        })
    });
    return await response.json();
}

/**
 * Hent de valgte klasser i den form backup-filen skal have.
 *
 * En klasse er MERE end sit klasse-objekt. Grupperne, emnerne pr. gruppe og
 * de gemte sessioner ligger i deres egne localStorage-nøgler (se
 * readClassExtras i storage.js), og de fulgte ikke med i backuppen. Filen
 * lovede altså "alt data, regler og historik", men en gendannelse gav
 * læreren en klasse uden en eneste gruppe og uden en eneste gemt session —
 * og appen er helt uden server, så filen ER kopien.
 *
 * Felterne lægges ved siden af klassens egne (`groups`, `groupTopics`,
 * `history`, `sessions`). Bemærk at klassens eget `topics` er noget andet:
 * det er klassens EMNELISTE, mens `groupTopics` er kortet fra gruppe til emne.
 */
export async function exportClasses(filenames) {
    try {
        const classesData = [];
        const warnings = [];
        for (const filename of filenames) {
            // Genbrug fetchClass
            const cls = await fetchClass(filename);
            if (cls.error) throw new Error(`Failed to fetch ${filename}: ${cls.error}`);
            // Filnavnet skal med i objektet, så gendannelsen kender det
            if (!cls.filename) cls.filename = filename;

            const extras = readClassExtras(filename);
            if (extras.failed.length) warnings.push({ filename, parts: extras.failed });
            cls.groups = extras.groups;
            cls.groupTopics = extras.groupTopics;
            cls.history = extras.history;
            cls.sessions = extras.sessions;

            classesData.push(cls);
        }
        return { data: classesData, warnings };
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * Renser et filnavn fra en backup, så en ødelagt eller håndredigeret fil ikke
 * kan snige mærkelige tegn ind, der vælter siden eller rammer vilkårlige
 * nøgler. Svarer til py_bridge._safeFilename.
 */
function sanitizeBackupFilename(name) {
    const stripped = String(name || '').replace(/[^a-z0-9æøåÆØÅ_.]/gi, '_').toLowerCase();
    const trimmed = stripped.replace(/^_+|_+$/g, '');
    if (!trimmed) return null;
    // Altid .csv, så koden bagefter ikke skal tage højde for andre endelser.
    return trimmed.endsWith('.csv') ? trimmed : trimmed.replace(/\.[a-z0-9]+$/i, '') + '.csv';
}

/**
 * Tjekker, at en backup-indgang har den form, vi forventer. Svarer null, hvis
 * alt er i orden, ellers en tekst der siger, hvad der er galt.
 */
function validateBackupEntry(cls) {
    if (!cls || typeof cls !== 'object') return 'ikke et objekt';
    if (!cls.filename || typeof cls.filename !== 'string') return 'mangler filename';
    if (cls.data !== undefined && cls.data !== null && !Array.isArray(cls.data)) {
        return 'data skal være en liste';
    }
    if (Array.isArray(cls.data)) {
        // Import fra Excel/CSV har altid haft de her to værn (se
        // py_bridge.createClass), men gendannelse fra backup gik uden om dem
        // og skrev hvad som helst direkte i lageret.
        //
        // En række der ikke er et objekt vælter senere: ensureRowIds() kan
        // ikke sætte et _rowId på et tal, og gruppedannelsen dør med en
        // teknisk fejl langt fra den fil der var noget galt med. Bedre at
        // sige det her, hvor læreren stadig ved hvilken fil hen valgte.
        if (cls.data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
            return 'elevrækker skal være objekter';
        }
        // Samme grænse som ved import. Uden den kunne en håndredigeret eller
        // ødelagt backup fylde hele browserens lagerplads op med én klasse —
        // og den plads deles med alle de andre dida.dk-værktøjer.
        if (cls.data.length > MAX_ROWS_PER_CLASS) {
            return `for mange elever (${cls.data.length}, maks ${MAX_ROWS_PER_CLASS})`;
        }
    }
    if (cls.rules !== undefined && cls.rules !== null && !Array.isArray(cls.rules)) {
        return 'rules skal være en liste';
    }
    if (cls.togetherGroups != null && (!Array.isArray(cls.togetherGroups)
        || cls.togetherGroups.some(a => !a || !Array.isArray(a.ids)
            || a.ids.some(id => typeof id !== 'string')))) {
        return 'Skal sammen-aftaler skal være en liste med elev-id’er';
    }
    if (cls.separations !== undefined && cls.separations !== null && !Array.isArray(cls.separations)) {
        return 'separations skal være en liste';
    }
    if (cls.matrixRules !== undefined && cls.matrixRules !== null && !Array.isArray(cls.matrixRules)) {
        return 'matrixRules skal være en liste';
    }
    if (cls.topics !== undefined && cls.topics !== null && !Array.isArray(cls.topics)) {
        return 'topics skal være en liste';
    }
    // columnOrders er et opslag (kolonne -> rækkefølge), ikke en liste. En
    // håndredigeret fil med en liste her ville give Object.keys() tal-nøgler
    // og en rangering på kolonner der ikke findes.
    if (cls.columnOrders !== undefined && cls.columnOrders !== null
        && (typeof cls.columnOrders !== 'object' || Array.isArray(cls.columnOrders))) {
        return 'columnOrders skal være et opslag pr. kolonne';
    }
    return null;
}

/** Filnavnene på klasserne, der allerede ligger i lageret (tom, hvis de ikke kan læses). */
async function existingFilenames() {
    let existing = [];
    try {
        existing = await fetchClasses();
    } catch (e) {
        existing = [];
    }
    return new Set((existing || []).map(c => c.filename));
}

/**
 * Gennemgår en backup uden at skrive noget. Svarer { valid, invalid,
 * collisions }, så siden kan vise en bekræftelse, før restoreBackup() skriver.
 *
 *  - valid:      rensede indgange klar til at blive skrevet
 *  - invalid:    indgange der springes over, med en begrundelse
 *  - collisions: filnavne der findes lokalt eller flere gange i backuppen
 */
export async function inspectBackup(data) {
    if (!Array.isArray(data)) {
        return { error: 'Backup-fil skal være en liste af klasser.' };
    }

    const valid = [];
    const invalid = [];
    for (const raw of data) {
        const reason = validateBackupEntry(raw);
        if (reason) {
            invalid.push({ filename: raw && raw.filename, reason });
            continue;
        }
        const safeName = sanitizeBackupFilename(raw.filename);
        if (!safeName) {
            invalid.push({ filename: raw.filename, reason: 'ugyldigt filename' });
            continue;
        }
        valid.push({ ...raw, filename: safeName });
    }

    const existingNames = await existingFilenames();
    // Også to indgange i samme fil kan få samme navn efter normalisering.
    // Læreren skal vælge, før nogen af dem skrives, selv i en tom browser.
    const collisions = new Set();
    for (const entry of valid) {
        if (existingNames.has(entry.filename)) collisions.add(entry.filename);
        existingNames.add(entry.filename);
    }

    return { valid, invalid, collisions: [...collisions] };
}

/**
 * Skriver et allerede tjekket sæt backup-indgange til lageret.
 *
 * @param {Array} entries  Svaret fra inspectBackup().valid (allerede renset)
 * @param {Object} opts
 * @param {'overwrite'|'skip'|'rename'} opts.collisionMode  Hvad der sker med
 *        indgange, hvis filnavn allerede findes. Standard 'overwrite'.
 * @param {string} [opts.renameLabel]  Teksten i parentes efter navnet på en
 *        omdøbt klasse. Default 'gendannet'; flytningen fra www bruger
 *        'fra www.dida.dk' (se adoptWww.js).
 */
export async function restoreBackup(entries, opts = {}) {
    // Bagudkompatibelt: får vi rå backup-data, tjekkes det først.
    if (Array.isArray(entries) && entries.length > 0 && entries[0] && entries[0].__inspected !== true) {
        const inspected = await inspectBackup(entries);
        if (inspected.error) return inspected;
        entries = inspected.valid;
    }

    const collisionMode = opts.collisionMode || 'overwrite';
    const existingNames = await existingFilenames();

    const reservedNames = new Set([...existingNames, ...entries.map(entry => entry.filename)]);
    const results = [];
    const failed = [];
    // Klassen kom ind, men en DEL af den (grupper/emner/historik) kunne ikke
    // skrives — typisk fyldt lagerplads. Det er ikke en fejlet gendannelse,
    // men læreren skal vide det, i stedet for selv at opdage det på et tomt
    // gruppekort.
    const partial = [];
    // Filnavnene, klasserne FAKTISK blev skrevet under — efter en eventuel
    // omdøbning. Den der kalder, skal kunne åbne netop dén klasse bagefter:
    // en klasse der skrives OVEN I en eksisterende, beholder sin plads i
    // listen, så "den sidste i listen" er ikke nødvendigvis den gendannede.
    const writtenFilenames = [];
    let written = 0;
    let skipped = 0;
    let prunedSessions = 0;

    try {
        for (const cls of entries) {
            let target = cls.filename;
            let overwriting = false;
            // Navnet i menuen. Backuppen bærer det med, og uden det her ville
            // klassen komme tilbage under sit filnavn — se saveClassData().
            let displayName = typeof cls.name === 'string' && cls.name.trim()
                ? cls.name.trim() : null;
            if (existingNames.has(target)) {
                if (collisionMode === 'skip') {
                    skipped++;
                    continue;
                }
                if (collisionMode === 'rename') {
                    const base = target.replace(/\.csv$/, '');
                    const restoredBase = `${base}_restored_${Date.now()}`;
                    target = `${restoredBase}.csv`;
                    // Et tidsstempel er ikke et unikt navn: flere indgange
                    // kan blive skrevet i samme millisekund. Reservér også
                    // originalnavnene længere fremme i samme backup.
                    for (let suffix = 2; reservedNames.has(target); suffix++) {
                        target = `${restoredBase}_${suffix}.csv`;
                    }
                    // "Behold begge" giver to klasser med hvert sit filnavn.
                    // Fik de også det SAMME navn i menuen, kunne læreren ikke
                    // se hvilken af dem der var den gendannede — og det er
                    // netop dét, valget handlede om.
                    if (displayName) displayName = `${displayName} (${opts.renameLabel || 'gendannet'})`;
                } else {
                    overwriting = true;
                }
            }

            const res = await saveClassData(
                target,
                cls.data || [],
                Array.isArray(cls.rules) ? cls.rules : [],
                cls.id_column || null,
                Array.isArray(cls.separations) ? cls.separations : [],
                (cls.settings && typeof cls.settings === 'object') ? cls.settings : {},
                (cls.matrixSettings && typeof cls.matrixSettings === 'object') ? cls.matrixSettings : {},
                Array.isArray(cls.matrixRules) ? cls.matrixRules : [],
                Array.isArray(cls.topics) ? cls.topics : [],
                (cls.columnOrders && typeof cls.columnOrders === 'object'
                    && !Array.isArray(cls.columnOrders)) ? cls.columnOrders : {},
                // Gendannelsen er den ene vej, hvor en klasse der ikke findes,
                // SKAL oprettes: backuppen er lærerens sidste udvej, og den
                // gendannes typisk i en browser hvor klassen er væk.
                {
                    allowCreate: true,
                    name: displayName || undefined,
                    togetherGroups: cls.togetherGroups || [],
                    // Backuppen bærer også de skjulte kolonner. Uden dem stod
                    // klassen tilbage med alle Lectio-kolonnerne foldet ud
                    // igen, netop den dag gendannelsen skulle redde dagen.
                    hiddenColumns: Array.isArray(cls.hiddenColumns) ? cls.hiddenColumns : []
                }
            );
            results.push(res);
            if (res && res.error) {
                // Gendannelse er lærerens sidste udvej. Tælles en fejlet
                // skrivning med som gendannet, får hen en grøn kvittering på
                // at data er tilbage — og opdager først at det ikke passer,
                // når klassen skal bruges.
                failed.push({ filename: target, error: res.error });
                continue;
            }
            // Klassen er skrevet. Nu — og kun nu — ryddes de gamle grupper,
            // historik og emner der stod under samme filnavn. De peger på den
            // FORRIGE klasses elever, som har andre _rowId'er, så uden
            // oprydningen ville gruppekortene efter en gendannelse vise
            // forkerte navne uden at nogen kunne se det.
            if (overwriting) {
                try { cleanupClassStorage(target); } catch (e) { console.error(e); }
            }

            // …og så lægges backuppens EGNE grupper, emner og sessioner ind.
            // Uden det her trin var oprydningen ovenfor ren nedrivning: en
            // gendannelse fjernede alt hvad klassen havde af grupper og gemte
            // sessioner, og satte intet i stedet.
            try {
                const extrasRes = writeClassExtras(target, {
                    groups: cls.groups,
                    groupTopics: cls.groupTopics,
                    history: cls.history,
                    sessions: cls.sessions
                });
                if (extrasRes.failed.length > 0) {
                    partial.push({ filename: target, parts: extrasRes.failed });
                }
                // De to lofter (50 sessioner, 90 dage) kan have luget i det
                // filen indeholdt. Det skal med i kvitteringen — ellers
                // gendanner læreren en backup og tror, alt kom med.
                if (extrasRes.prunedSessions > 0) prunedSessions += extrasRes.prunedSessions;
            } catch (e) {
                console.error(e);
                partial.push({ filename: target, parts: ['grupper, emner eller historik'] });
            }

            existingNames.add(target);
            reservedNames.add(target);
            writtenFilenames.push(target);
            written++;
        }
        return { success: failed.length === 0, written, writtenFilenames, skipped, failed, partial, prunedSessions, details: results };
    } catch (e) {
        return { error: e.message };
    }
}
