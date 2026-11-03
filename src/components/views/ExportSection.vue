<script setup>
import { ref, computed, onMounted } from 'vue';
import * as api from '../../js/modules/api.js';
import { isInternalField, groupDisplayName, migrateRefsToRowIds, todayStamp, safeFileName, columnsOfRows } from '../../js/modules/utils.js';
import { Package, FileSpreadsheet } from 'lucide-vue-next';

// --- Tilstand ---
const classes = ref([]);

// Samme sortering som klassemenuen i topbaren. To lister over de samme
// klasser i hver sin rækkefølge er værre end ingen sortering: man leder
// efter 2.b det sted, den stod sidst.
const classCollator = new Intl.Collator('da', { numeric: true });
const sortedClasses = computed(() =>
    [...classes.value].sort((a, b) => classCollator.compare(a.name || '', b.name || '')));
const selectedFilenames = ref(new Set());
const isLoading = ref(false);

onMounted(() => {
    loadClassList();
});

async function loadClassList() {
    try {
        const result = await api.fetchClasses();
        classes.value = result;
    } catch (e) {
        console.error('Failed to load class list', e);
    }
}

// --- Valg af klasser ---

function toggleSelection(filename) {
    if (selectedFilenames.value.has(filename)) {
        selectedFilenames.value.delete(filename);
    } else {
        selectedFilenames.value.add(filename);
    }
    // Giv Vue et nyt sæt, så afkrydsningerne opdateres.
    selectedFilenames.value = new Set(selectedFilenames.value);
}

function toggleAll() {
    if (selectedFilenames.value.size === classes.value.length) {
        selectedFilenames.value = new Set();
    } else {
        selectedFilenames.value = new Set(classes.value.map(c => c.filename));
    }
}

const allSelected = () => classes.value.length > 0 && selectedFilenames.value.size === classes.value.length;

// --- Eksport ---

// todayStamp() og safeFileName() bor i utils.js — Del-menuens Excel-filer
// skal have samme dato-stempel og samme filnavne-regel.

/**
 * Gør klassenavnet til et lovligt filnavn — og hold det UNIKT inden for zip'en.
 *
 * To klasser der kun adskiller sig ved et tegn der bliver renset væk ("3.a" og
 * "3/a" bliver begge til "3_a") ville ellers få samme navn i zip'en, og den ene
 * klasse ville lydløst mangle i backuppen.
 */
function uniqueZipName(rawName, taken) {
    const base = safeFileName(rawName);
    let name = base;
    let n = 2;
    while (taken.has(name.toLowerCase())) name = `${base} (${n++})`;
    taken.add(name.toLowerCase());
    return name;
}

/**
 * Et kolonnenavn der ikke findes i arket i forvejen.
 *
 * Har klassen sin egen kolonne der hedder det samme, ville vi ellers
 * overskrive lærerens data med vores egen. Navnet reserveres i `taken`, så to
 * tilføjede kolonner heller ikke kan kollidere med hinanden.
 */
function uniqueColName(base, taken) {
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base} (${n})`;
    taken.add(name);
    return name;
}

/**
 * Byg opslaget "elev-id → gruppenavn (emne)" for ét gruppesæt.
 *
 * @returns {Map<string,string>|null} null hvis klassen ingen grupper har —
 *   så udelades kolonnen helt i stedet for at stå tom på hver eneste række.
 */
function groupLookup(groups, groupTopics, prefix) {
    if (!Array.isArray(groups) || groups.length === 0) return null;
    const map = new Map();
    groups.forEach(g => {
        if (!g || !g.name) return;
        const displayName = groupDisplayName(g.name);
        // Emnekortet er autoritativt, også når et emne er slettet. Gruppekopien
        // kan være ældre, hvis emnet blev gemt, men gemmet af grupperne fejlede.
        const storedTopic = groupTopics?.[`${prefix}${g.name}`];
        const groupTopic = typeof storedTopic === 'string' ? storedTopic.trim() : '';
        const label = groupTopic ? `${displayName} (${groupTopic})` : displayName;
        (g.members || []).forEach(m => {
            // Et medlem er enten et rent id ("r7") eller {id, name} fra en
            // gemt session — begge former findes i lageret.
            const id = (m && typeof m === 'object') ? m.id : m;
            if (id != null) map.set(String(id), label);
        });
    });
    return map.size > 0 ? map : null;
}

async function exportSelected(format = 'json') {
    const filenames = Array.from(selectedFilenames.value);
    if (filenames.length === 0) {
        if (window.notifyInfo) window.notifyInfo('Vælg mindst én klasse.');
        return;
    }

    isLoading.value = true;
    
    // Hent de valgte klassers gemte data, også dem der ikke er åbne.
    const res = await api.exportClasses(filenames);
    if (res.error) {
        if (window.notifyError) window.notifyError(res.error);
        isLoading.value = false;
        return;
    }

    // Bevar de læsbare data, men kald aldrig en ufuldstændig kopi komplet.
    const warningText = (res.warnings || []).map(warning =>
        `${warning.filename}: ${warning.parts.join(', ')}`).join('; ');
    const reportExport = (message) => {
        if (warningText) {
            if (window.notifyError) window.notifyError(
                `${message} Filen er ufuldstændig: ${warningText} kunne ikke læses. `
                + 'Behold en eventuel tidligere backup, og behold dataene i browseren.');
        } else if (window.notifySuccess) window.notifySuccess(message);
    };

    try {
        if (format === 'zip') {
            // Hent først Excel-bibliotekerne, når læreren vælger Excel.
            const JSZip = (await import('jszip')).default;
            const { saveAs } = await import('file-saver');
            // Se src/vendor/README.md for hvorfor biblioteket ligger i repo'et.
            const XLSX = await import('../../vendor/xlsx.mjs');
            
            const zip = new JSZip();
            const takenNames = new Set();
            const skipped = [];
            const staleMatrices = [];

            // Én Excel-fil pr. klasse.
            for (const cls of res.data) {
                // Ældre eksportdata kan stadig have rækkerne under content.
                let sheetData = [];
                if (cls.data && Array.isArray(cls.data) && cls.data.length > 0) {
                   sheetData = cls.data; 
                } else if (cls.content && cls.content.data) {
                    sheetData = cls.content.data;
                }
                
                if (sheetData.length === 0) {
                    // Tom klasse: der er ingen ark at skrive. Husk den, så vi
                    // kan sige det højt i stedet for at aflevere en zip hvor
                    // klassen bare ikke er der.
                    skipped.push(cls.name || cls.filename);
                    continue;
                }

                // En klasse behøver ikke have været åbnet før en samlet eksport.
                // Oversæt derfor ældre navne-referencer med samme puljer som ved
                // klasseåbning, så to elever med samme navn får hver sin plads.
                // Kun eksportkopien ændres; JSON-backup og browserlager bevares.
                sheetData = sheetData.map(row => ({ ...row }));
                const groups = cls.groups ? structuredClone(cls.groups) : null;
                migrateRefsToRowIds({ data: sheetData, columns: cls.columns }, cls.id_column, {
                    groupSets: [groups?.standard, groups?.matrix],
                });

                // Interne felter (_excluded, _rowId, ...) skal ikke med ud i
                // lærerens Excel-fil som rå true/false-kolonner. Fraværet vises
                // i stedet som en læsbar "Til stede"-kolonne.
                //
                // Har klassen allerede sin EGEN kolonne med det navn, ville vi
                // overskrive lærerens data. Vi scanner alle rækker, ikke kun den
                // første — en kolonne kan være tilføjet efter import og mangler
                // derfor på de tidligste rækker.
                const existingCols = new Set(columnsOfRows(sheetData));
                const attendanceCol = uniqueColName('Til stede', existingCols);

                // Grupperne er hele pointen med værktøjet, men de lå kun i
                // localStorage — Excel-filen indeholdt elevlisten som den kom
                // ind, uden et ord om hvem der endte hvor. Findes der grupper
                // for klassen, kommer de med som to kolonner. Emnet står i
                // parentes, når gruppen har et ("Gruppe 2 (Liberalisme)").
                const standardById = groupLookup(groups?.standard, cls.groupTopics, 'S_');
                // En gammel matrix hører ikke til de nye stamgrupper. Bevar den
                // i JSON-backup med sit flag, men giv den ingen Excel-kolonne.
                const matrixStale = groups?.matrixStale && groups.matrix?.length > 0;
                if (matrixStale) staleMatrices.push(cls.name || cls.filename);
                const matrixById = matrixStale ? null : groupLookup(groups?.matrix, cls.groupTopics, 'M_');
                const standardCol = standardById ? uniqueColName('Stamgruppe', existingCols) : null;
                const matrixCol = matrixById ? uniqueColName('Matrixgruppe', existingCols) : null;

                const cleanData = sheetData.map(row => {
                    const o = {};
                    for (const k of Object.keys(row)) {
                        if (isInternalField(k)) continue;
                        o[k] = row[k];
                    }
                    o[attendanceCol] = row._excluded ? 'Nej' : 'Ja';
                    // Opslaget sker på _rowId — elevens identitet. To elever
                    // må gerne hedde det samme.
                    const rowId = row._rowId != null ? String(row._rowId) : null;
                    if (standardById) o[standardCol] = (rowId && standardById.get(rowId)) || '';
                    if (matrixById) o[matrixCol] = (rowId && matrixById.get(rowId)) || '';
                    return o;
                });

                const ws = XLSX.utils.json_to_sheet(cleanData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Elever");
                
                // Skriv arket som bytes til zip-filen.
                const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const validName = uniqueZipName(cls.name || cls.filename, takenNames);
                zip.file(`${validName}.xlsx`, excelBuffer);
            }

            // Ingen ark = ingen brugbar zip. En tom fil med et "Eksporteret!"
            // ovenpå ser ud som om det lykkedes, og læreren opdager først at
            // backuppen er tom den dag den skal bruges.
            if (takenNames.size === 0) {
                if (window.notifyError) window.notifyError(
                    'Ingen af de valgte klasser har elever — der er ikke noget at eksportere.'
                );
                return;
            }

            const content = await zip.generateAsync({type:"blob"});
            saveAs(content, `Klasser_Backup_${todayStamp()}.zip`);
            const notices = [];
            if (skipped.length > 0) notices.push(
                `Filen indeholder ikke ${skipped.join(', ')}, som ikke har nogen elever.`);
            if (staleMatrices.length > 0) notices.push(
                `Matrixgrupperne for ${staleMatrices.join(', ')} er udeladt, fordi stamgrupperne er ændret. `
                + 'Dan matrixgrupperne igen, hvis de skal med.');
            if (notices.length && window.notifyInfo) window.notifyInfo(`Excel-filer eksporteret. ${notices.join(' ')}`);
            if (notices.length === 0 || warningText) reportExport('Excel-filer eksporteret!');

        } else {
            // JSON-backup bevarer klassens data, grupper og historik som gemt.
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `grupdk_backup_${todayStamp()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            reportExport("Backup downloadet!");
        }
    } catch (e) {
        console.error(e);
        if (window.notifyError) window.notifyError("Eksport fejl: " + e.message);
    } finally {
        isLoading.value = false;
    }
}
</script>

<template>
    <div class="export-container">
        
        <div class="header-section">
            <p class="description">
                Vælg de klasser du vil lave backup af. 
                <br>Du kan enten downloade en samlet backup-fil (til gendannelse her) eller eksportere dem som separate Excel-filer til videre bearbejdning.
                <br>Backup-filen er den eneste kopi der findes — alt ligger i din browser, intet på en server.
            </p>
        </div>

        <div class="list-container">
            <div class="list-header">
                <h3>Vælg klasser ({{ selectedFilenames.size }})</h3>
                <button class="toggle-link" @click="toggleAll">
                    {{ allSelected() ? 'Fravælg alle' : 'Vælg alle' }}
                </button>
            </div>
            
            <div class="class-list">
                <!-- <label> om det hele: så bærer afkrydsningen klassens navn,
                     og hele rækken er stadig et klikmål. Før hed feltet bare
                     "afkrydsning", og navnet stod i en søskende, ingen læste. -->
                <label v-for="c in sortedClasses" :key="c.filename" class="class-item">
                    <input type="checkbox" :checked="selectedFilenames.has(c.filename)" @change="toggleSelection(c.filename)">
                    <span class="class-name">{{ c.name }}</span>
                </label>
                <div v-if="classes.length === 0" class="empty-list">Ingen klasser fundet.</div>
            </div>
        </div>

        <div class="actions-footer">
            <div class="action-group">
                <h4>System-backup</h4>
                <p>Elever, regler, grupper, emner og gemte sessioner i én fil.</p>
                <button class="btn secondary full-width" @click="exportSelected('json')" :disabled="isLoading">
                    <Package :size="16" class="btn-icon-lead" /> Download backup (.json)
                </button>
            </div>

            <div class="action-separator"></div>

            <div class="action-group">
                <h4>Dataeksport</h4>
                <p>Hver klasse som sin egen Excel-fil — med gruppe­kolonner, hvis du har dannet grupper.</p>
                <button class="btn primary full-width" @click="exportSelected('zip')" :disabled="isLoading">
                    <FileSpreadsheet :size="16" class="btn-icon-lead" /> Download Excel-filer (.zip)
                </button>
            </div>
        </div>

    </div>
</template>

<style scoped>
/* Farver, kanter og flader står i Import & backups ark
   (beta/screens/historik-filer.css), som vinder over de scoped regler. Her
   står kun det, arket ikke sætter. */

/* Ikonet foran knapteksten (var inline-style) */
.btn-icon-lead { vertical-align: -3px; }

.export-container {
    margin: 0 auto;
}

/* ── Hovedet ── */
.header-section { margin-bottom: 20px; }

/* ── Klasselisten ── */
.list-container {
    margin-bottom: 20px;
}

.list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-block: 10px;
}

.list-header h3 {
    margin: 0;
    text-transform: uppercase;
}

.toggle-link {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 11px;
}
.toggle-link:hover { text-decoration: underline; }

.class-list {
    max-height: 260px;
    overflow-y: auto;
}

.class-item {
    display: flex;
    align-items: center;
    cursor: pointer;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}

.class-item input {
    margin-right: 10px;
    width: 15px;
    height: 15px;
}

.class-name {
    flex: 1;
    font-size: 13px;
}

.empty-list {
    padding: 20px;
    text-align: center;
    font-size: 12px;
}

/* ── Knapperne nederst ── */
.actions-footer {
    display: flex;
    align-items: stretch;
}

.action-group {
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}

.action-group h4 { font-weight: 700; }
.action-group p { line-height: 1.4; }

.action-separator { display: none; }

/* ── Knapper ── */
.btn {
    padding: 0 18px;
    font-weight: 600;
    cursor: pointer;
    font-size: 12px;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}

.btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
