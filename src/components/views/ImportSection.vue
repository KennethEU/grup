<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { reactiveState as state } from '../../js/modules/reactiveState.js';
import * as api from '../../js/modules/api.js';
import { compactImportSheet, sheetDataCells } from '../../js/modules/importData.js';
import { plural } from '../../js/modules/plural.js';
import { describePartialRestore } from '../../js/modules/restoreReceipt.js';
import { MAX_ROWS_PER_CLASS } from '../../js/modules/py_bridge.js';
import { isLectioFormat, extractLectioNames } from '../../js/modules/lectio.js';
import { EXCEL_UNAVAILABLE_MESSAGE, NEW_BUILD_MESSAGE, reportPartUnavailable } from '../../js/modules/newBuild.js';
import { FolderUp, ClipboardPaste, FileText, FileUp } from 'lucide-vue-next';

// Når en klasse er skrevet, sendes `classCreated` på document med den
// klasses filnavn i `detail` — AppTopbar åbner så netop den klasse.
function announceClassCreated(filename) {
    document.dispatchEvent(new CustomEvent('classCreated', { detail: { filename } }));
}

// Grænsen for antal elever hentes fra py_bridge — den samme konstant som
// importen selv tjekker mod. Stod den skrevet af her, kunne de to tal drifte
// fra hinanden, og advarslen ville tale om en grænse der ikke findes.
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// Formularens tilstand
// Indsat tekst eller filvalg. Indsæt kommer først og er valgt fra start: de
// fleste lærere kopierer klasselisten fra Lectio eller Excel. Beder en genvej
// om en bestemt form, står ønsket i state.importModeRequest — det bruges her
// én gang og nulstilles.
const activeImportMode = ref(state.importModeRequest === 'drop' ? 'drop' : 'paste');
state.importModeRequest = null;
const uploadClassName = ref('');
const uploadFiles = ref([]);
const errorMessage = ref('');
const isLoading = ref(false);
const createFileInput = ref(null);
const rawData = ref('');
const hasHeaders = ref(true);
// Filer har deres eget valg af overskrifter, så første elev bevares i filer uden overskrift.
const fileHasHeaders = ref(true);
const isDragging = ref(false);
let disposed = false;
// Lukning må ikke efterlade en ventende dialog eller starte næste fil i baggrunden.
onBeforeUnmount(() => {
    disposed = true;
    resolveSheet(null);
    resolveCollision('cancel');
});

// Dialog ved sammenstød med en eksisterende klasse
const collisionDialog = ref({
    open: false,
    valid: [],
    invalid: [],
    collisions: [],
});
const collisionDialogEl = ref(null);

// Et <dialog> følger sit `open`-flag: showModal() når det tændes, close() når
// det slukkes. Bruges af kollisions- og ark-vinduet.
function syncDialog(isOpen, dialogEl) {
    watch(isOpen, async (open) => {
        await nextTick();
        const dlg = dialogEl.value;
        if (!dlg) return;
        if (open && !dlg.open) dlg.showModal();
        else if (!open && dlg.open) dlg.close();
    });
}
syncDialog(() => collisionDialog.value.open, collisionDialogEl);

// Ark-valg: et regneark med flere ark kan ikke gættes rigtigt.
// Et forsideark har også indhold, så "det første ark med data" rammer stadig
// forsiden — og "det største ark" ville gætte på lærerens vegne. Så vi spørger.
const sheetDialog = ref({ open: false, filename: '', sheets: [], selected: '', resolve: null });
const sheetDialogEl = ref(null);
syncDialog(() => sheetDialog.value.open, sheetDialogEl);

/** @returns {Promise<string|null>} arkets navn, eller null hvis filen springes over */
function askForSheet(filename, sheets) {
    return new Promise((resolve) => {
        // INTET forvalgt ark. Stod det første ark valgt på forhånd, ville et
        // hurtigt klik på den blå knap give præcis den gamle fejl igen — og
        // det første ark er netop det, forsiden plejer at ligge på. Dialogen
        // dukker kun op, når valget faktisk skal træffes.
        sheetDialog.value = { open: true, filename, sheets, selected: '', resolve };
    });
}

function resolveSheet(name) {
    const done = sheetDialog.value.resolve;
    sheetDialog.value = { open: false, filename: '', sheets: [], selected: '', resolve: null };
    if (done) done(name);
}

// ── Filvalg og træk fra computeren ──

const triggerFileSelect = () => {
    if (createFileInput.value) createFileInput.value.click();
};

const onFileSelected = (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    addFiles(Array.from(files));
};

function addFiles(files) {
    // Filtypen tjekkes også ved træk fra computeren.
    if (isLoading.value) return;
    const allowed = files.filter(f => /\.(xlsx|xls|csv|json)$/i.test(f.name));
    if (allowed.length === 0) {
        errorMessage.value = 'Filtypen understøttes ikke. Brug .xlsx, .csv eller .json.';
        return;
    }

    // Frasorterede filer skal NÆVNES. Trækker læreren fire filer ind og den
    // ene er en .pdf, blev den før tavst væk — og kvitteringen bagefter sagde
    // "3 klasser oprettet!", som om det var alle fire.
    const ignored = files.filter(f => !allowed.includes(f));
    if (ignored.length > 0 && window.notifyInfo) {
        window.notifyInfo(`${plural(ignored.length, 'fil blev', 'filer blev')} sprunget over (understøttes ikke): ` +
            ignored.map(f => f.name).join(', '));
    }

    // Store filer afvises før læsning.
    const oversized = allowed.filter(f => f.size > MAX_FILE_BYTES);
    if (oversized.length > 0) {
        errorMessage.value = `Fil for stor (maks ${MAX_FILE_BYTES / 1024 / 1024} MB): ${oversized.map(f => f.name).join(', ')}`;
        return;
    }

    errorMessage.value = '';
    uploadFiles.value = allowed;

    if (uploadFiles.value.length === 1) {
        if (!uploadClassName.value.trim()) {
            uploadClassName.value = uploadFiles.value[0].name.replace(/\.(xlsx|xls|csv|json)$/i, '');
        }
    } else {
        uploadClassName.value = '';
    }
}

// Både klik og træk understøttes i filfeltet.
function onDragOver(e) {
    e.preventDefault();
    isDragging.value = true;
}
function onDragLeave(e) {
    e.preventDefault();
    isDragging.value = false;
}
function onDrop(e) {
    e.preventDefault();
    isDragging.value = false;
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) {
        addFiles(Array.from(files));
    }
}

async function handleImport() {
    if (isLoading.value || uploadFiles.value.length === 0) return;
    isLoading.value = true;
    errorMessage.value = '';
    // Et fast snapshot: skift i formularen under fil-læsning må ikke ændre importen.
    const files = [...uploadFiles.value];
    const options = {
        hasHeaders: fileHasHeaders.value,
        className: files.length === 1 ? uploadClassName.value.trim() : '',
    };
    // Filnavnene på de klasser, der faktisk blev skrevet — i den rækkefølge.
    const writtenFiles = [];
    try {
        const jsonFiles = files.filter(file => /\.json$/i.test(file.name));
        const excelFiles = files.filter(file => !/\.json$/i.test(file.name));
        for (const file of jsonFiles) {
            if (disposed) break;
            writtenFiles.push(...await processBackupFile(file));
        }
        if (!disposed && excelFiles.length) writtenFiles.push(...await importExcelOrCsv(excelFiles, options));
    } catch (err) {
        errorMessage.value = `Importen blev afbrudt: ${err.message || err}`;
        window.notifyError?.(errorMessage.value);
    } finally {
        isLoading.value = false;
        if (!disposed && writtenFiles.length > 0) {
            uploadFiles.value = [];
            uploadClassName.value = '';
            // Signalet kan lukke/afmontere importen. Send det først, når ALLE
            // valgte filer er færdige, også efter et backup-sammenstød. Den
            // SIDST skrevne klasse åbnes — også når den blev skrevet oven i en
            // eksisterende og derfor ikke står sidst i listen.
            announceClassCreated(writtenFiles.at(-1));
        }
    }
}

/** @returns {Promise<string[]>} filnavnene på de klasser, der blev skrevet */
async function processBackupFile(file) {
    let data;
    try {
        const text = await file.text();
        data = JSON.parse(text);
    } catch (err) {
        console.error(err);
        const reason = err && err.message ? err.message : 'kunne ikke læses';
        if (window.notifyError) {
            window.notifyError(`Ugyldig backup-fil "${file.name}": ${reason}`);
        }
        return [];
    }

    if (disposed) return [];
    const inspected = await api.inspectBackup(data);
    if (disposed) return [];
    if (inspected.error) {
        if (window.notifyError) window.notifyError(`Backup "${file.name}": ${inspected.error}`);
        return [];
    }

    if (inspected.valid.length === 0) {
        if (window.notifyError) {
            const reason = inspected.invalid.length > 0
                ? `${inspected.invalid.length} ugyldige indgange`
                : 'ingen klasser fundet';
            window.notifyError(`Backup "${file.name}" indeholder intet at gendanne (${reason}).`);
        }
        return [];
    }

    let mode = 'overwrite';
    if (inspected.collisions.length > 0) {
        mode = await new Promise(resolve => {
            collisionDialog.value = { open: true, ...inspected, resolve };
        });
    }
    if (disposed || mode === 'cancel') return [];
    // Valget gælder kun de klasser, læreren så på listen. En klasse med samme
    // filnavn, som en anden fane har oprettet, mens vinduet stod åbent,
    // gendannes som kopi i stedet (se shownCollisions i api.restoreBackup).
    return await writeBackupEntries(inspected.valid, mode, file.name, inspected.invalid,
        inspected.collisions);
}

/** @returns {Promise<string[]>} filnavnene på de klasser, der blev skrevet */
async function writeBackupEntries(entries, collisionMode, sourceName, invalid = [], shownCollisions = []) {
    // Indgangene er allerede valideret af inspectBackup().
    const tagged = entries.map(e => ({ ...e, __inspected: true }));
    // Beskeder nævner klassen ved navn, ikke ved den interne filnøgle.
    const nameOf = (filename) => entries.find(e => e.filename === filename)?.name || filename;
    const res = await api.restoreBackup(tagged, { collisionMode, shownCollisions });
    // Har backuppen skrevet oven i den klasse, der er åben, er det, fanen har
    // i hukommelsen, den GAMLE udgave — og lageret kalder nu den gendannede
    // for fanens egen (py_bridge._seenContent). Et gem herfra, fx når fanen
    // lukkes, mens næste fils "Disse klasser findes allerede" står åben,
    // skrev den gamle udgave oven i den gendannede uden en lyd. Så slip den
    // gamle; klassen hentes frisk, når importen er færdig (117. gennemsyn).
    const open = state.currentClass?.filename;
    if (open && Array.isArray(res.writtenFilenames) && res.writtenFilenames.includes(open)) {
        state.currentClass = null;
    }
    if (res.error) {
        if (window.notifyError) window.notifyError(`Backup-fejl: ${res.error}`);
        return [];
    }
    let msg = `Backup "${sourceName}": ${plural(res.written, 'klasse', 'klasser')} gendannet.`;
    if (res.skipped > 0) msg += ` ${res.skipped} sprunget over.`;
    // Klasser, der fandtes, men ikke stod på listen, da læreren valgte
    // (oprettet i en anden fane imens): de er gendannet ved siden af.
    const keptBoth = Array.isArray(res.keptBoth) ? res.keptBoth : [];
    if (keptBoth.length > 0) {
        msg += ` ${keptBoth.map(nameOf).join(', ')} fandtes allerede uden at stå på listen`
            + ` (oprettet i en anden fane imens) og er gendannet som kopi — din egen er urørt.`;
    }
    if (invalid.length > 0) msg += ` ${invalid.length} ugyldige indgange ignoreret.`;

    // Backuppen kan indeholde flere gemte sessioner, end appen selv beholder
    // (højst 50, og ingen ældre end 90 dage). De luges væk ved gendannelsen,
    // og det siges her — en tavs udrensning ligner et tab af data, når
    // læreren tæller sessionerne efter.
    if (res.prunedSessions > 0) {
        msg += ` ${plural(res.prunedSessions, 'gammel session', 'gamle sessioner')} fra filen blev ikke `
            + 'gendannet (over 90 dage eller ud over de 50 nyeste).';
    }

    // Klassen kom ind, men grupper/emner/historik gjorde det ikke helt.
    // Nævnes eksplicit — ellers står læreren med en klasse der ser rigtig ud,
    // men hvor de gemte sessioner mangler uden varsel.
    const partial = Array.isArray(res.partial) ? res.partial : [];
    // Pr. klasse, med tal når de kendes: "for 3.a kom kun 3 af de 12 gemte
    // sessioner med" (se restoreReceipt.js).
    if (partial.length > 0) {
        msg += ` Bemærk: ${describePartialRestore(partial, nameOf).join('; ')}.` +
            ' Behold backup-filen; der kan mangle indhold i filen eller plads i browseren.';
    }

    // En gammel backup uden grupper og gemte sessioner er skrevet oven i en
    // klasse, der havde nogle: de er væk nu (se `emptied` i restoreBackup).
    const emptied = Array.isArray(res.emptied) ? res.emptied : [];
    for (const e of emptied) {
        const what = e.hadGroups && e.hadSessions ? 'grupper og gemte sessioner'
            : (e.hadGroups ? 'grupper' : 'gemte sessioner');
        msg += ` Backuppen af ${nameOf(e.filename)} er fra en ældre udgave af Grupper og havde ingen ${what} med,`
            + ` så klassens ${what} her er fjernet sammen med den gamle udgave af klassen.`;
    }

    // Nogle klasser kunne ikke skrives (typisk fyldt lagerplads). Det MÅ ikke
    // kvitteres som en succes — læreren gendanner netop en backup, fordi
    // hen ikke har dataene andre steder.
    const failed = Array.isArray(res.failed) ? res.failed : [];
    if (failed.length > 0) {
        const names = failed.map(f => nameOf(f.filename)).join(', ');
        msg += ` ${plural(failed.length, 'klasse', 'klasser')} kunne IKKE gendannes: ${names}.` +
            ' Frigør plads (slet en gammel klasse eller ryd historikken) og prøv igen.';
        if (window.notifyError) window.notifyError(msg);
    } else if (partial.length > 0 || res.prunedSessions > 0 || emptied.length > 0 || keptBoth.length > 0) {
        // Grøn kvittering ville skjule at noget mangler — også når det
        // manglende er de sessioner, lofterne lugede væk. notifyInfo bliver
        // stående længe nok til at blive læst.
        if (window.notifyInfo) window.notifyInfo(msg);
    } else if (window.notifySuccess) {
        window.notifySuccess(msg);
    }
    return Array.isArray(res.writtenFilenames) ? res.writtenFilenames : [];
}

// Sammenstødene vises med klassens navn. Filnøglen ("2_c_samfundsfag.csv")
// er intern og siger læreren ingenting.
const collisionNames = computed(() => (collisionDialog.value.collisions || []).map(filename => ({
    filename,
    name: (collisionDialog.value.valid || []).find(e => e.filename === filename)?.name || filename,
})));

function resolveCollision(mode) {
    const done = collisionDialog.value.resolve;
    collisionDialog.value = { open: false, valid: [], invalid: [], collisions: [] };
    if (done) done(mode);
}

/**
 * Læs en tekstfil med det tegnsæt den faktisk er gemt i.
 *
 * `file.text()` afkoder ALTID som UTF-8. Det er rigtigt for de fleste filer —
 * men Excel på Windows gemmer "CSV (kommasepareret)" i ANSI (windows-1252),
 * og dér er æ, ø og å enkelte bytes der ikke findes i UTF-8. Resultatet var
 * en klasseliste hvor "Søren Kjærgård" stod som "S?ren Kj?rg?rd" — og de
 * ødelagte navne fulgte med hele vejen til gruppekortene og udskriften.
 *
 * Fremgangsmåden er sikker, fordi UTF-8 er selvkontrollerende: er filen
 * gyldig UTF-8, vinder den altid (streng afkodning uden fejl). Først når den
 * strenge afkodning FEJLER, ved vi at filen ikke er UTF-8, og så er
 * windows-1252 det oplagte gæt for en dansk Excel-fil.
 *
 * @returns {{ text: string, note: string|null }}
 */
async function readTextFile(file) {
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 2));

    // UTF-16 har et byte-mærke forrest. Excels "Unicode-tekst" gemmer sådan,
    // og den ville ellers blive læst som windows-1252 og give volapyk.
    if (head[0] === 0xFF && head[1] === 0xFE) {
        return { text: new TextDecoder('utf-16le').decode(buf), note: null };
    }
    if (head[0] === 0xFE && head[1] === 0xFF) {
        return { text: new TextDecoder('utf-16be').decode(buf), note: null };
    }

    try {
        // fatal: true → kaster i stedet for at sætte "?" ind.
        // (ignoreBOM er som standard false, så et UTF-8-BOM fjernes selv.)
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), note: null };
    } catch (e) {
        return {
            text: new TextDecoder('windows-1252').decode(buf),
            note: 'Filen var ikke gemt som UTF-8. Den blev læst som Windows-ANSI, ' +
                'som Excel bruger til "CSV (kommasepareret)". Tjek lige at æ, ø og å ' +
                'ser rigtige ud i elevlisten.',
        };
    }
}

// Formaterede tomme celler gør ikke et tomt ark til en valgmulighed.
function sheetsWithData(wb) {
    return wb.SheetNames.filter(name => sheetDataCells(wb.Sheets[name]).length > 0);
}

/** @returns {Promise<string[]>} filnavnene på de klasser, der blev oprettet */
async function importExcelOrCsv(excelFiles, options) {
    const created = [];
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    const warnings = [];

    // Excel-biblioteket ligger i src/vendor/ og ikke i package.json — npm's
    // nyeste udgave (0.18.5) har to kendte huller i netop fil-parsningen.
    // Se src/vendor/README.md.
    let XLSX;
    try {
        XLSX = await import('../../vendor/xlsx.mjs');
    } catch (e) {
        errorMessage.value = (await reportPartUnavailable(e, EXCEL_UNAVAILABLE_MESSAGE)) || NEW_BUILD_MESSAGE;
        return created;
    }

    for (const file of excelFiles) {
        if (disposed) break;
        try {
            const ext = file.name.split('.').pop().toLowerCase();
            const isExcel = ['xlsx', 'xls'].includes(ext);

            let nameToUse = file.name.replace(/\.(xlsx|xls|csv)$/i, '');
            if (options.className) {
                nameToUse = options.className;
            }

            // Beskeder om HVORDAN filen blev læst — de skal frem uanset om
            // createClass() selv har noget at sige om indholdet.
            const fileNotes = [];

            let csvContent;
            if (isExcel) {
                const buffer = await file.arrayBuffer();
                if (disposed) break;
                const wb = XLSX.read(buffer, { type: 'array' });

                const names = sheetsWithData(wb);
                if (names.length === 0) {
                    errors.push(`${file.name}: regnearket indeholder ingen data.`);
                    failCount++;
                    continue;
                }

                // Ét ark med data er normaltilfældet og spørges der ikke om.
                let sheetName = names[0];
                if (names.length > 1) {
                    sheetName = await askForSheet(file.name, names);
                    if (!sheetName) {
                        // Læreren annullerede — filen springes over uden at
                        // tælle som en fejl, det var jo et bevidst valg.
                        continue;
                    }
                    fileNotes.push(`Arket "${sheetName}" blev importeret. De øvrige ` +
                        `${names.length - 1} ark i filen blev ikke rørt.`);
                }
                const sheet = wb.Sheets[sheetName];

                // Tæl rækker med indhold, ikke højeste rækkenummer. CSV'en må
                // kun gennemløbe faktiske rækker/kolonner, aldrig det gamle !ref.
                const compact = compactImportSheet(sheet, XLSX.utils,
                    MAX_ROWS_PER_CLASS + (options.hasHeaders ? 1 : 0));
                csvContent = XLSX.utils.sheet_to_csv(compact, { blankrows: false });
            } else {
                const read = await readTextFile(file);
                csvContent = read.text;
                if (read.note) fileNotes.push(read.note);
            }

            if (disposed) break;
            const res = await api.createClassFromPaste(nameToUse, csvContent, options.hasHeaders);
            if (res.error) {
                console.error(`Fejl ved ${file.name}:`, res.error);
                errors.push(`${file.name}: ${res.error}`);
                failCount++;
            } else {
                successCount++;
                if (res.filename) created.push(res.filename);
                if (res.warning) fileNotes.push(res.warning);
                if (fileNotes.length) warnings.push(`${file.name}: ${fileNotes.join('\n\n')}`);
            }
        } catch (err) {
            console.error(`Fejl ved fil ${file.name}:`, err);
            errors.push(`${file.name}: ${err.message || err}`);
            failCount++;
        }
    }

    if (warnings.length > 0 && window.notifyInfo) window.notifyInfo(warnings.join('\n\n'));

    if (failCount > 0) {
        errorMessage.value = `${successCount} oprettet, men ${failCount} fejlede:\n${errors.join('\n')}`;
        // Beskeden skal overleve at en delvis succes åbner den nye klasse.
        window.notifyError?.(errorMessage.value);
    } else if (successCount > 0) {
        window.notifySuccess?.(`${plural(successCount, 'klasse', 'klasser')} oprettet!`);
    }
    return created;
}

// ── Genkend elevlister fra Lectio ──
// Klassekoden efter navnet fjernes automatisk: "Navn Efternavn, 3se3 01 (3se3)".
// Selve genkendelsen bor i lectio.js, hvor den er testet.

const lectioDetected = computed(() =>
    activeImportMode.value === 'paste' && isLectioFormat(rawData.value)
);

// ── Indsat tekst ──

const handlePasteSubmit = async () => {
    if (isLoading.value) return;
    if (!uploadClassName.value.trim() && activeImportMode.value === 'paste') {
         errorMessage.value = 'Angiv venligst et navn til klassen.';
         return;
    }
    if (!rawData.value.trim()) {
        errorMessage.value = 'Udfyld venligst data.';
        return;
    }

    isLoading.value = true;
    errorMessage.value = '';

    try {
        let contentToImport = rawData.value;
        let headersForImport = hasHeaders.value;

        // Ved Lectio-format importeres kun navnene, uden klassekoder.
        if (isLectioFormat(rawData.value)) {
            contentToImport = extractLectioNames(rawData.value);
            headersForImport = false;
        }

        const res = await api.createClassFromPaste(uploadClassName.value, contentToImport, headersForImport);
        if (res.error) {
            errorMessage.value = res.error;
        } else {
            announceClassCreated(res.filename);
            if (window.notifySuccess) window.notifySuccess('Klasse oprettet!');
            if (res.warning && window.notifyInfo) window.notifyInfo(res.warning);
            // Ryd formularen
            rawData.value = '';
            uploadClassName.value = '';
        }
    } catch (err) {
        errorMessage.value = 'Fejl ved oprettelse: ' + err.message;
    } finally {
        isLoading.value = false;
    }
};

// ── Hent skabelon ──

async function downloadTemplate() {
    // Se src/vendor/README.md for hvorfor biblioteket ligger i repo'et.
    // Kan delen ikke hentes (ingen forbindelse, eller en gammel fane efter en
    // ny udgave), gjorde linket før ingenting — fejlen gik tabt i konsollen.
    let XLSX;
    try {
        XLSX = await import('../../vendor/xlsx.mjs');
    } catch (e) {
        console.error(e);
        await reportPartUnavailable(e, EXCEL_UNAVAILABLE_MESSAGE);
        return;
    }
    const wb = XLSX.utils.book_new();

    const templateData = [
        // Tredje kolonne er et eksempel på en almindelig datakolonne, som
        // regler kan bruge. Den hed før "Emne", men det ord bruger Grupper
        // allerede om gruppernes emner, så eksemplet lignede en funktion.
        ['Navn', 'Køn', 'Fag'],
        ['Anna Jensen', 'K', 'Biologi'],
        ['Mikkel Hansen', 'M', 'Fysik'],
        ['Sofie Nielsen', 'K', 'Biologi'],
        ['Oliver Pedersen', 'M', 'Kemi'],
        ['Ida Larsen', 'K', 'Fysik'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws['!cols'] = [{ wch: 20 }, { wch: 6 }, { wch: 12 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Elever');
    XLSX.writeFile(wb, 'Grupper_skabelon.xlsx');
}

</script>

<template>
<div class="import-container">

    <div class="actions-header">
        <p class="description">
            Vælg hvordan du vil importere data. Du kan altid tilføje/rette data senere.
        </p>
        <!-- aria-pressed: de to knapper skifter hele importformen, men kun
             farven sagde hvilken der var valgt. -->
        <div class="toggle-mode" role="group" aria-label="Sådan importeres data">
            <button :class="{ active: activeImportMode === 'paste' }" :aria-pressed="activeImportMode === 'paste'" :disabled="isLoading" @click="activeImportMode = 'paste'">
                 <ClipboardPaste :size="16" style="margin-right:6px; vertical-align:-3px;" /> Indsæt tekst / Excel
            </button>
            <button :class="{ active: activeImportMode === 'drop' }" :aria-pressed="activeImportMode === 'drop'" :disabled="isLoading" @click="activeImportMode = 'drop'">
                <FileUp :size="16" style="margin-right:6px; vertical-align:-3px;" /> Upload fil eller gendan backup
            </button>
        </div>
    </div>

    <!-- 1. Slip filer -->
    <div v-if="activeImportMode === 'drop'" class="import-body">
         <input type="file" ref="createFileInput" accept=".json, .csv, .xlsx, .xls" multiple style="display:none" @change="onFileSelected">

         <!-- Ingen filer endnu -->
         <div v-if="uploadFiles.length === 0"
              class="drop-zone"
              :class="{ 'drag-over': isDragging }"
              @click="triggerFileSelect"
              @dragover="onDragOver"
              @dragenter="onDragOver"
              @dragleave="onDragLeave"
              @drop="onDrop">
            <div class="drop-icon"><FolderUp :size="48" style="opacity:0.8;" /></div>
            <h3>Klik eller træk filer her</h3>
            <p class="drop-hint">Understøtter: Excel (.xlsx), CSV, eller Backup (.json) — maks 10 MB</p>
            <button class="btn secondary">Vælg filer fra computer</button>
         </div>

         <!-- Valgte filer -->
         <div v-else class="file-list">
            <div class="file-header">
                <strong>{{ plural(uploadFiles.length, 'fil', 'filer') }} valgt</strong>
                <button class="text-btn" :disabled="isLoading" @click="uploadFiles = []; triggerFileSelect()">Skift filer</button>
            </div>

            <div class="files-preview">
                <div v-for="f in uploadFiles" :key="f.name" class="file-item">
                    <FileText :size="14" style="margin-right:6px; vertical-align:-2px;" /> {{ f.name }}
                </div>
            </div>

            <!-- Backup (.json) bærer selv klassens navn; feltet gælder kun Excel/CSV -->
            <div class="form-group" v-if="uploadFiles.length === 1 && !/\.json$/i.test(uploadFiles[0].name)">
               <label for="import-class-name-file">Klassens navn (valgfrit — ellers bruges filnavnet)</label>
               <input id="import-class-name-file" v-model="uploadClassName" :disabled="isLoading" type="text" class="input-full" placeholder="F.eks. 1.g Dansk">
            </div>

            <!-- Header-toggle gælder kun for Excel/CSV-filer (JSON-backup ignorerer den) -->
            <div class="form-group" v-if="uploadFiles.some(f => /\.(xlsx|xls|csv)$/i.test(f.name))">
                <label class="checkbox-label">
                    <input type="checkbox" v-model="fileHasHeaders" :disabled="isLoading">
                    <span>Første linje er overskrifter (kolonnenavne)</span>
                </label>
            </div>
         </div>

         <div class="bottom-actions">
            <div class="template-section">
                <span>Mangler du en skabelon?</span>
                <a href="#" @click.prevent="downloadTemplate">Download Excel-skabelon</a>
            </div>
             <button class="btn primary large" @click="handleImport" :disabled="isLoading || uploadFiles.length === 0">
                {{ isLoading ? 'Behandler...' : 'Importér filer' }}
            </button>
         </div>
    </div>

    <!-- Vinduet, når en backup rammer en klasse, der findes -->
    <dialog ref="collisionDialogEl" class="collision-dialog" @cancel.prevent="resolveCollision('cancel')" @keydown.esc.stop @keydown.tab.stop>
        <div v-if="collisionDialog.open" class="collision-content">
            <h3>Disse klasser findes allerede</h3>
            <p>
                Klasserne findes allerede i browseren, eller de står flere gange i backup-filen:
            </p>
            <ul class="collision-list">
                <li v-for="c in collisionNames" :key="c.filename">{{ c.name }}</li>
            </ul>
            <p>Hvad skal der ske med dem?</p>
            <div class="collision-actions">
                <button class="btn secondary" @click="resolveCollision('skip')">Spring over (behold mine)</button>
                <button class="btn secondary" @click="resolveCollision('rename')">Importér som kopi</button>
                <button class="btn primary" @click="resolveCollision('overwrite')">Overskriv mine</button>
                <button class="btn ghost" @click="resolveCollision('cancel')">Annuller</button>
            </div>
        </div>
    </dialog>

    <!-- Ark-vælger: kun når regnearket har mere end ét ark med indhold -->
    <dialog ref="sheetDialogEl" class="collision-dialog" @cancel.prevent="resolveSheet(null)" @keydown.esc.stop @keydown.tab.stop>
        <div v-if="sheetDialog.open" class="collision-content">
            <h3>Hvilket ark indeholder klassen?</h3>
            <p>
                "{{ sheetDialog.filename }}" indeholder {{ sheetDialog.sheets.length }} ark med data.
                Vælg det ark eleverne står på — de øvrige rører vi ikke.
            </p>
            <ul class="collision-list sheet-choices">
                <li v-for="name in sheetDialog.sheets" :key="name">
                    <label>
                        <input type="radio" name="sheet-choice" :value="name" v-model="sheetDialog.selected">
                        <span>{{ name }}</span>
                    </label>
                </li>
            </ul>
            <div class="collision-actions">
                <button class="btn primary" :disabled="!sheetDialog.selected"
                        @click="resolveSheet(sheetDialog.selected)">Importér dette ark</button>
                <button class="btn ghost" @click="resolveSheet(null)">Spring filen over</button>
            </div>
        </div>
    </dialog>

    <!-- 2. Indsæt tekst -->
    <div v-if="activeImportMode === 'paste'" class="import-body">
          <div class="form-group">
            <label for="import-class-name-paste">Klassens navn</label>
            <input id="import-class-name-paste" v-model="uploadClassName" :disabled="isLoading" type="text" placeholder="F.eks. 1.g Dansk" autofocus class="input-full">
          </div>

          <div class="form-group">
            <label for="import-raw-data">Data (Indsæt celler fra Excel/Sheets eller Lectio)</label>
            <p class="data-hint">
                Format: Hver linje er en elev. Kolonner adskilles med tabulator (fra Excel/Sheets), komma eller semikolon.
                <br>Eksempel: <code>Navn [TAB] Køn [TAB] Info</code> eller <code>Navn, Køn, Info</code>
                <br>Lectio-format understøttes også — indsæt direkte fra elevlisten.
            </p>
            <textarea id="import-raw-data" v-model="rawData" placeholder="Navn	Køn	Info
Elev 1	M	...
Elev 2	K	..." class="input-full textarea-data"></textarea>
            <div v-if="lectioDetected" class="lectio-badge">
                <svg class="hi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;flex-shrink:0;vertical-align:-2px;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                Lectio-format registreret — klassekoder fjernes automatisk, kun navne importeres
            </div>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="hasHeaders">
              <span>Første linje er overskrifter (kolonnenavne)</span>
            </label>
          </div>

          <div class="bottom-actions">
            <button class="btn primary large" @click="handlePasteSubmit" :disabled="isLoading">
              {{ isLoading ? 'Opretter...' : 'Opret klasse' }}
            </button>
          </div>
    </div>

    <div v-if="errorMessage" class="error-msg">{{ errorMessage }}</div>

</div>
</template>

<style scoped>
/* Formularens farver, kanter og flader står i Import & backups ark
   (beta/screens/historik-filer.css), som vinder over de scoped regler. Her
   står kun det, arket ikke sætter. Vinduerne nederst (sammenstød, ark-valg)
   styles derimod helt herfra. */
.import-container {
    margin: 0 auto;
}

/* ── Hovedet ── */
.description { margin-bottom: 16px; }

.toggle-mode {
    border-radius: 10px;
}

.toggle-mode button {
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}

/* ── Slip-feltet ── */
.drop-zone {
    padding-inline: 40px;
    text-align: center;
    cursor: pointer;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}

.drop-zone h3 { font-size: 14px; margin: 0 0 6px 0; }

.drop-icon { margin-bottom: 10px; }

.drop-hint { margin-bottom: 16px; font-size: 12px; }

/* ── Fillisten ── */
.file-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    font-size: 13px;
    font-weight: 600;
}

.text-btn {
    background: none;
    border: none;
    color: var(--primary);
    cursor: pointer;
    font-weight: 600;
    font-size: 12px;
}

.files-preview {
    display: flex;
    flex-direction: column;
    margin-bottom: 14px;
}

.file-item {
    font-size: 12px;
}

/* ── Felterne ── */
.form-group { margin-bottom: 16px; }
.form-group label {
    display: block;
    margin-bottom: 5px;
    text-transform: uppercase;
}

.input-full {
    width: 100%;
    height: 34px;
    padding: 0 12px;
    border-radius: 8px;
    font-size: 13px;
    box-sizing: border-box;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}
.input-full:focus { outline: none; }

.textarea-data {
    height: 180px;
    padding: 10px 12px;
    font-family: 'SF Mono', monospace;
    font-size: 12px;
    resize: vertical;
}

.data-hint {
    font-size: 11px;
    margin-bottom: 6px;
    border-radius: 8px;
    line-height: 1.5;
}

code {
    background: var(--border-subtle);
    padding: 1px 4px;
    border-radius: 4px;
    font-family: 'SF Mono', monospace;
    font-size: 10px;
}

.checkbox-label {
    align-items: center;
    cursor: pointer;
}
.checkbox-label input { width: 15px; height: 15px; flex: none; }
/* ".form-group label" er en lille versaletiket (display: block); et
   afkrydsningsfelts tekst står på linje med fluebenet */
.form-group label.checkbox-label {
    display: flex;
    margin-bottom: 0;
}

/* ── Knapperne nederst ── */
.bottom-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 20px;
    padding-top: 16px;
    gap: 16px;
}

.template-section { font-size: 12px; }

.template-section a {
    font-weight: 600;
    text-decoration: none;
    margin-left: 4px;
}
.template-section a:hover { text-decoration: underline; }

/* ── Knapper ── */
.btn {
    height: 36px;
    padding: 0 20px;
    font-weight: 600;
    cursor: pointer;
    font-size: 12px;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}

.btn.primary:disabled { cursor: not-allowed; }

.btn.large { height: 38px; padding: 0 28px; font-size: 13px; width: auto; flex-shrink: 0; }

.error-msg {
    margin-top: 16px;
    padding: 10px 14px;
    font-size: 12px;
    font-weight: 600;
}

/* ── Vinduet, når en backup rammer en klasse, der findes ── */
.collision-dialog {
    inline-size: min(480px, 92vw);
    max-block-size: 80dvh;
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: 0;
    background: var(--bg-surface);
    box-shadow: 0 16px 48px oklch(0 0 0 / 18%);
}
.collision-dialog::backdrop {
    background: oklch(0.208 0.04 265.75 / 55%);
    backdrop-filter: blur(2px);
}
.collision-content {
    padding: 20px;
}
.collision-content h3 {
    margin: 0 0 8px 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-heading);
}
.collision-content p {
    margin: 6px 0;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
}
.collision-list {
    margin: 8px 0 12px 0;
    padding: 8px 12px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    list-style: none;
    max-block-size: 140px;
    overflow-y: auto;
    font-size: 12px;
    /* klassenavne og arknavne er almindelig tekst, ikke filnavne */
    font-family: inherit;
    color: var(--text-main);
}
.collision-list li {
    padding: 2px 0;
}
.collision-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 14px;
}
.collision-actions .btn {
    inline-size: 100%;
    block-size: 38px;
    text-align: center;
}
.collision-actions .btn.ghost {
    background: transparent;
    color: var(--text-muted);
    border: none;
    margin-block-start: 4px;
}
.collision-actions .btn.ghost:hover {
    color: var(--text-main);
    text-decoration: underline;
}

.sheet-choices li {
    padding: 4px 0;
}
.sheet-choices label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    /* Touch-mål: hele linjen skal kunne rammes, ikke kun prikken */
    min-block-size: 28px;
}

.lectio-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    padding-block: 6px;
    font-size: 11px;
    line-height: 1.4;
}
</style>
