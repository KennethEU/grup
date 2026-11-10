<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref } from 'vue';
import { reactiveState } from '../../js/modules/reactiveState.js';
import { pushUndo, undo, redo, undoShortcut, clearUndoHistory, pruneSelection } from '../../js/modules/state.js';
import { renameColumn } from '../../js/modules/columnActions.js';
import { teacherColumns, debounce, compareCellValues, nfc } from '../../js/modules/utils.js';
import { autoSave } from '../../js/modules/classActions.js';
import { ClipboardList } from 'lucide-vue-next';
import ConfirmModal from '../ConfirmModal.vue';
import PromptModal from '../PromptModal.vue';

// Modal state for rename column
const showRenameCol = ref(false);
const renameColTarget = ref('');

// Modal state for delete row
const showDeleteRow = ref(false);
const deleteRowTarget = ref(null);
const deleteRowName = ref('');

const props = defineProps({
    idColumn: { type: String, required: true }
});

// Selection changes are handled via reactiveState.selectedForAction (reactive Set)

const debouncedAutoSave = debounce(autoSave, 1000);

// Mange kolonner: tabellen ruller vandret, men tre kolonner står fast til
// venstre — Aftale, Mødt og Vis-kolonnen (navnet) — og slet-krydset står fast
// til højre (elevliste.css), så man altid kan se, hvis række man er i.
// Kolonne 2 og 3 skal vide, hvor brede kolonnerne før dem er; det måles her
// og gives videre som --sticky-2 og --sticky-3. Stregerne ved de faste
// kolonner kommer kun, når noget faktisk er rullet ind under dem:
// .cut-left (rullet til højre) og .cut-right (mere at rulle til).
const tableContainer = ref(null);
const cutLeft = ref(false);
const cutRight = ref(false);
const stickyOffsets = ref({ '--sticky-2': '0px', '--sticky-3': '0px' });
function updateScrollEdges() {
    const el = tableContainer.value;
    if (!el) return;
    cutLeft.value = el.scrollLeft > 0;
    cutRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}
function updateStickyOffsets() {
    const heads = tableContainer.value?.querySelector('thead tr')?.children;
    if (!heads || heads.length < 3) return;
    // Rundet NED: bredderne er brøkdele af en pixel, og en sprække på under
    // 1 px mellem to faste kolonner lod det rullende indhold skinne igennem
    // (prikker i Safari). Et overlap på under 1 px ses ikke.
    const first = Math.floor(heads[0].getBoundingClientRect().width);
    const second = Math.floor(heads[0].getBoundingClientRect().width + heads[1].getBoundingClientRect().width) - first;
    const next = { '--sticky-2': `${first}px`, '--sticky-3': `${first + second}px` };
    // Kun ved en rigtig ændring: ellers udløser hver gentegning en ny
    // gentegning (onUpdated → ny værdi → onUpdated …).
    if (next['--sticky-2'] !== stickyOffsets.value['--sticky-2']
        || next['--sticky-3'] !== stickyOffsets.value['--sticky-3']) {
        stickyOffsets.value = next;
    }
}
// Tastaturet og de faste kolonner: tabber man (især med Skift+Tab) gennem en
// række, der er rullet vandret, ruller browseren kun cellen frem, hvis den
// er helt ude af syne — den ved ikke, at de faste kolonner dækker kanten.
// Fokus landede derfor i en celle bag Vis-kolonnen eller slet-krydset, og man
// skrev i en celle, man ikke kunne se (målt i alle tre browsere 4/11 2026).
// Her rulles cellen fri af de faste kolonner i begge sider. Ikke
// scroll-padding i CSS: Firefox følger den ikke ved Tab, og de andre ruller
// ikke en halvt skjult celle. (Lodret, under den faste overskriftsrække, var
// der intet problem — målt med Skift+Tab op gennem 30 rækker.)
function revealFocused(event) {
    const el = tableContainer.value;
    const cell = event.target.closest?.('td, th');
    if (!el || !cell) return;
    const r = cell.getBoundingClientRect();
    const cells = cell.parentElement.children;
    const index = Array.prototype.indexOf.call(cells, cell);
    // De faste celler står altid fremme; kun de rullende skal flyttes vandret
    if (index >= 3 && index < cells.length - 1) {
        const left = cells[2].getBoundingClientRect().right;
        const right = cells[cells.length - 1].getBoundingClientRect().left;
        if (r.left < left) el.scrollLeft -= left - r.left;
        else if (r.right > right) el.scrollLeft += Math.min(r.right - right, r.left - left);
    }
}
function onLayoutChange() {
    updateStickyOffsets();
    updateScrollEdges();
}
let resizeObserver = null;
let observedTable = null;
// Tabellen findes ikke, mens klassen er tom, og kommer først senere — så den
// skal (gen)observeres, hver gang komponenten er tegnet om.
function observeTable() {
    const table = tableContainer.value?.querySelector('table') || null;
    if (!resizeObserver || table === observedTable) return;
    if (observedTable) resizeObserver.unobserve(observedTable);
    if (table) resizeObserver.observe(table);
    observedTable = table;
}
onMounted(() => {
    const el = tableContainer.value;
    if (!el) return;
    el.addEventListener('scroll', updateScrollEdges, { passive: true });
    el.addEventListener('focusin', revealFocused);
    // Både beholderen (vinduets bredde) og tabellen (kolonner tilføjet,
    // omdøbt, skjult) kan ændre bredderne, og om der er noget at rulle til.
    resizeObserver = new ResizeObserver(onLayoutChange);
    resizeObserver.observe(el);
    observeTable();
    onLayoutChange();
});
onUpdated(() => {
    observeTable();
    updateStickyOffsets();
});
onBeforeUnmount(() => {
    tableContainer.value?.removeEventListener('scroll', updateScrollEdges);
    tableContainer.value?.removeEventListener('focusin', revealFocused);
    resizeObserver?.disconnect();
});

// BEMÆRK: her lå elevtabellens EGEN beforeunload → autoSave. Den dækkede kun
// denne ene fane, og kun de ændringer der allerede var skrevet ind i klassen
// — ikke den celle læreren stod midt i. Begge dele håndteres nu ét sted, for
// alle faner: flushPendingWrites() i classActions.js, koblet på i main.js.
// (Gennemsyn 2026-09-01.)

const visibleColumns = computed(() =>
    teacherColumns(reactiveState.currentClass?.columns));

// Opslag i O(1) af skjulte kolonner — i stedet for gentagne .includes() pr. celle.
const hiddenSet = computed(() => new Set(reactiveState.currentClass?.hiddenColumns || []));

// Sorterede data til visning. Uden aktiv sortering returneres selve arrayet
// — det sparer en kopi af 30-500 elever ved hver reaktiv berøring.
const displayData = computed(() => {
    const cls = reactiveState.currentClass;
    if (!cls || !cls.data) return [];
    const { col, dir } = reactiveState.sortState;
    if (!col) return cls.data;

    const sorted = cls.data.slice();
    const sign = dir === 'asc' ? 1 : -1;
    // compareCellValues() bor i utils.js sammen med cellNumber(), fordi det er
    // DEN læsning af en celle hele appen deler. Se kommentaren dér for hvad
    // tabellen sorterede efter før.
    sorted.sort((a, b) => sign * compareCellValues(a[col], b[col]));
    return sorted;
});

// "Indsæt fra Excel / Google Sheets" i den tomme liste: land direkte på
// fanen, hvor man indsætter (se ImportSection).
function goToPasteImport() {
    reactiveState.importModeRequest = 'paste';
    reactiveState.navView = 'import';
}

function isHidden(col) {
    return hiddenSet.value.has(col);
}

// Skjult OG "Vis skjult" er slået fra: cellen viser prikker og kan ikke redigeres.
function isMasked(col) {
    return isHidden(col) && !reactiveState.showHiddenContent;
}

function sortIndicator(col) {
    if (reactiveState.sortState.col !== col) return '';
    return reactiveState.sortState.dir === 'asc' ? ' \u25B2' : ' \u25BC';
}

function onHeaderClick(col) {
    if (reactiveState.sortState.col === col) {
        reactiveState.sortState.dir = reactiveState.sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
        reactiveState.sortState.col = col;
        reactiveState.sortState.dir = 'asc';
    }
}

// Overskrifterne kunne før kun betjenes med mus (klik, højreklik, dobbeltklik),
// så et tastaturbrugeren kunne hverken sortere, skjule eller omdøbe en kolonne.
// Nu kan overskriften få fokus: Enter/Mellemrum sorterer, F2 omdøber, og
// menutasten (eller Skift+F10) sender browserens egen contextmenu-hændelse,
// som allerede skjuler/viser kolonnen.
function onHeaderKeydown(e, col) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onHeaderClick(col);
    } else if (e.key === 'F2') {
        e.preventDefault();
        onHeaderDblClick(e, col);
    }
}

// Det, tippet viser med musen, skal en skærmlæser også have: hvilke taster
// overskriften kan bruges med, og om kolonnens indhold er skjult. Før stod
// det kun i det visuelle tip (data-tooltip), som skærmlæseren aldrig hører,
// og en skjult kolonne lød præcis som en synlig.
function headerDescription(col) {
    const keys = 'Enter sorterer, menutasten skjuler eller viser indholdet, F2 omdøber.';
    return isHidden(col) ? `Indholdet er skjult. ${keys}` : keys;
}

function ariaSort(col) {
    if (reactiveState.sortState.col !== col) return 'none';
    return reactiveState.sortState.dir === 'asc' ? 'ascending' : 'descending';
}

function onHeaderContextMenu(e, col) {
    e.preventDefault();
    if (!reactiveState.currentClass.hiddenColumns) {
        reactiveState.currentClass.hiddenColumns = [];
    }
    const idx = reactiveState.currentClass.hiddenColumns.indexOf(col);
    if (idx === -1) {
        reactiveState.currentClass.hiddenColumns.push(col);
    } else {
        reactiveState.currentClass.hiddenColumns.splice(idx, 1);
    }
    autoSave();
}

function onHeaderDblClick(e, col) {
    e.stopPropagation();
    renameColTarget.value = col;
    showRenameCol.value = true;
}

function confirmRenameCol(newName) {
    const col = renameColTarget.value;
    showRenameCol.value = false;
    renameColTarget.value = '';
    if (!newName || newName === col) return;

    // Alt der peger på kolonnenavnet flyttes ét sted — se columnActions.js.
    const res = renameColumn(reactiveState.currentClass, reactiveState, col, newName);
    if (!res.ok) {
        if (window.notifyError) window.notifyError(res.error);
        return;
    }

    // Fortryd-stakken indeholder elevrækker med de GAMLE kolonnenavne. Et
    // Ctrl+Z efter et omdøb ville lægge dem tilbage under et navn tabellen
    // ikke længere kender — kolonnen ville stå tom for alle. Snapshots fra
    // før en skema-ændring kan ikke bruges bagefter.
    clearUndoHistory();

    autoSave();
}

function getRowId(row) {
    // props.idColumn er _rowId — altid udfyldt, altid unikt. 'unknown'-
    // fallbacken er ren paranoia nu (før kollapsede alle navnløse elever til
    // den samme nøgle og delte markering/redigering med hinanden).
    return row[props.idColumn] || 'unknown';
}

// Kort fra hver rækkes objekt til dens plads i det underliggende (usorterede)
// data-array. Bruges til at bygge en UNIK Vue-:key, også når to elever har
// samme navn / id-værdi — alene getRowId() ville give nøgler der støder
// sammen, så Vue genbruger den forkerte række (redigering og afkrydsning
// smitter mellem elever med samme navn).
const rowIndexMap = computed(() => {
    const m = new Map();
    const arr = reactiveState.currentClass?.data || [];
    arr.forEach((r, i) => m.set(r, i));
    return m;
});

// Stabil nøgle uden sammenstød, bundet til rækkens identitet (overlever
// sortering; er forskellig for elever med samme navn, fordi deres pladser i
// data-arrayet er forskellige).
function rowKey(row) {
    return `${getRowId(row)}#${rowIndexMap.value.get(row) ?? 'x'}`;
}

/**
 * Navnet på eleven, som det skal LYDE for en skærmlæser.
 *
 * IKKE props.idColumn — den er rækkens interne id ("r1"), ikke et navn (se
 * state.js: idColumn er ROW_ID). Det læreren har valgt at få vist, står i
 * `displayColumn`; er den ikke sat endnu, er den første kolonne næsten altid
 * navnekolonnen — samme fald tilbage som RestoreGroupsModal bruger.
 *
 * Vis-kolonnen behøver hverken være unik eller udfyldt, så der skal være et
 * sidste fald tilbage: rækkens id er grimt, men entydigt, og det er bedre end
 * en afkrydsning uden navn.
 */
const labelColumn = computed(() =>
    reactiveState.displayColumn || reactiveState.currentClass?.columns?.[0] || '');

// Kolonnerne, som tabellen viser dem: Vis-kolonnen (det, der står på
// gruppekortene) først, så den står lige efter Mødt-knappen og bliver
// stående til venstre, når tabellen ruller (Kenneths valg 4/11 2026). Resten
// står i den rækkefølge, læreren har valgt med Flyt. Kun visningen: klassens
// egen rækkefølge (og Excel-eksporten) er urørt.
const orderedColumns = computed(() => {
    const cols = visibleColumns.value;
    const pinned = labelColumn.value;
    if (!pinned || !cols.includes(pinned) || cols[0] === pinned) return cols;
    return [pinned, ...cols.filter(col => col !== pinned)];
});

function studentLabel(row) {
    const label = labelColumn.value ? row?.[labelColumn.value] : '';
    return (label === undefined || label === null || String(label).trim() === '')
        ? `elev ${getRowId(row)}`
        : String(label).trim();
}

function isSelected(row) {
    return reactiveState.selectedForAction.has(getRowId(row));
}

function toggleSelection(row) {
    const id = getRowId(row);
    if (reactiveState.selectedForAction.has(id)) {
        reactiveState.selectedForAction.delete(id);
    } else {
        reactiveState.selectedForAction.add(id);
    }
}

// Fravær ER data: `_excluded` står på elevrækken, og fortryd-stakken gemmer
// hele rækken. Uden snapshottet her var fluebenet den eneste ændring i
// elevlisten Ctrl+Z ikke kunne tage tilbage — og fejlklikket rammer typisk
// den forkerte elev i en lang liste, hvor det ikke ses igen før grupperne er
// dannet uden hende.
function toggleAttendance(row) {
    pushUndo();
    row._excluded = !row._excluded;
    autoSave();
}

// Fraværs-flueben for hele klassen: tæl de fraværende én gang.
const absentCount = computed(() =>
    (reactiveState.currentClass?.data || []).filter(row => row._excluded).length);
const allPresent = computed(() => absentCount.value === 0);

// Til hjælpeteksten på knappen i overskriften: "15 af 17 er mødt …". Ikke
// som tekst i overskriften: den gjorde Vis-kolonnen så bred, at næste kolonne
// stod langt væk (Kenneth 4/11 2026), og Grupper viser antallet over opskriften.
const studentCount = computed(() => reactiveState.currentClass?.data?.length || 0);
const presentCount = computed(() => studentCount.value - absentCount.value);

// Mindst én til stede og mindst én fraværende: fluebenet står "halvt".
const someAbsent = computed(() =>
    absentCount.value > 0 && absentCount.value < reactiveState.currentClass.data.length);

// Fluebenet i tabelhovedet vender HELE klassen med ét klik — den mest
// vidtrækkende ændring i elevlisten der findes, og den letteste at ramme ved
// et uheld, fordi den sidder lige over den enkelte elevs eget flueben.
function toggleAllAttendance() {
    if (!reactiveState.currentClass || !reactiveState.currentClass.data) return;
    pushUndo();
    const newValue = allPresent.value; // if all present → mark all excluded, else mark all present
    reactiveState.currentClass.data.forEach(row => {
        row._excluded = newValue;
    });
    autoSave();
}

let hasPushedUndo = false;

/**
 * Snapshot til fortryd-stakken ved FØRSTE tastetryk i cellen — ikke ved fokus.
 *
 * Før lå kaldet på @focus, og så kostede det et snapshot bare at KLIKKE i en
 * celle eller tabbe forbi den. Stakken er 50 dyb: en lærer der tabber gennem
 * syv kolonner på otte elever for at læse dem igennem, har dermed skubbet
 * hver eneste rigtige ændring ud af stakken og erstattet den med 50 identiske
 * kopier. Ctrl+Z så bagefter ud til ikke at gøre noget som helst — den lagde
 * det samme tilbage, igen og igen.
 *
 * `input` er tidligt nok: cellen er contenteditable, og `row[col]` skrives
 * først ved blur. Klassens data er altså stadig urørt her, og snapshottet
 * viser tilstanden FØR redigeringen.
 */
function onCellInput(event) {
    // Browserens EGEN fortryd i et contenteditable-felt sender også et
    // input-event. Det er ikke lærerens redigering, og et snapshot af det
    // ville bare være en kopi af det, der allerede står. main.js holder
    // tasten væk herfra, men den samme fortryd kan også komme fra
    // Rediger-menuen eller en mus med en fortryd-knap — så vi siger nej her
    // også, hvor vi kan se præcis hvad det var (inputType).
    if (event?.inputType === 'historyUndo' || event?.inputType === 'historyRedo') return;
    if (!hasPushedUndo) {
        pushUndo();
        hasPushedUndo = true;
    }
}

function onCellBlur(row, col, event) {
    // Et Ctrl+Z inde i cellen bytter HELE data-arrayet ud (undo() lægger en
    // klon tilbage), og `row` peger derefter på et objekt der ikke længere er
    // i klassen. Skrivningen nedenfor ville ramme det døde objekt og i samme
    // åndedrag sætte endnu et gem i gang for en ændring der ikke findes.
    //
    // Det er ikke et tab i dag — Vue har allerede tegnet den fortrudte værdi
    // ind i cellen, så det der skrives, er det samme som står der. Men det er
    // en skrivning ud i det blå, og den slags holder ikke, hvis undo en dag
    // begynder at røre mere end `data`. Bedre at sige nej her.
    if (!rowIndexMap.value.has(row)) {
        hasPushedUndo = false;
        return;
    }
    // Gem den endelige værdi ved blur — det udløser reaktivitet og gemning.
    // nfc(): tekst sat ind fra en PDF kan have "å" som a + ring — se utils.js.
    row[col] = nfc(event.target.textContent).trim();
    // Med debounce: en lærer der tabber gennem 30 celler udløste før 30
    // skrivninger af hele klassen som JSON. Nu skrives der én gang efter 1 sek. pause.
    // Flush ved beforeunload dækker, hvis fanen lukkes inden for vinduet.
    debouncedAutoSave();
    hasPushedUndo = false;
}

function getCellText(row, col) {
    if (isMasked(col)) return '\u2022\u2022\u2022\u2022\u2022';
    return row[col] || '';
}

function onCellKeydown(e, rowIndex, colIndex) {
    const shortcut = undoShortcut(e);

    if (shortcut === 'undo') {
        e.preventDefault();
        if (undo()) autoSave();
    } else if (shortcut === 'redo') {
        e.preventDefault();
        if (redo()) autoSave();
    } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        focusCell(rowIndex + 1, colIndex);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusCell(rowIndex - 1, colIndex);
    }
}

function focusCell(rowIndex, colIndex) {
    nextTick(() => {
        const table = document.getElementById('table-container');
        if (!table) return;
        const rows = table.querySelectorAll('tbody tr');
        if (rows[rowIndex]) {
            // +2 offset for checkbox + attendance columns
            const cells = rows[rowIndex].querySelectorAll('td');
            const targetCell = cells[colIndex + 2];
            if (targetCell && targetCell.contentEditable === 'true') {
                targetCell.focus();
                selectCellContents(targetCell);
            }
        }
    });
}

/**
 * Markér hele cellens indhold, når markøren flytter dertil med Enter eller
 * pil op/ned — som i Excel, hvor man skriver OVEN I det, der står.
 *
 * Før lagde focus() markøren FORREST i cellen, og det man skrev, kom foran
 * den gamle tekst: "Bob" blev til "XBob". Tomme celler mærkede ingen forskel,
 * så det sås først, når man rettede en udfyldt kolonne nedad. Vil man rette
 * et enkelt bogstav, virker et klik stadig som før.
 */
function selectCellContents(cell) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(cell);
    selection.removeAllRanges();
    selection.addRange(range);
}

function deleteRow(row) {
    deleteRowTarget.value = row;
    // Samme navn som på knappen ("Slet Anna"): Vis-kolonnen, ikke altid den
    // første kolonne. Før kunne knappen sige ét navn og vinduet et andet,
    // når Vis-kolonnen var fx "Kaldenavn".
    const label = labelColumn.value ? row[labelColumn.value] : '';
    deleteRowName.value = String(label ?? '').trim() || 'denne elev';
    showDeleteRow.value = true;
}

function confirmDeleteRow() {
    const row = deleteRowTarget.value;
    showDeleteRow.value = false;
    deleteRowTarget.value = null;
    if (!row) return;
    pushUndo();
    const idx = reactiveState.currentClass.data.indexOf(row);
    if (idx !== -1) {
        reactiveState.currentClass.data.splice(idx, 1);
    }
    // Markeringen peger på _rowId og overlever eleven. Se pruneSelection() i
    // state.js for hvad et dødt id fik "Lav aftale" til at gøre.
    pruneSelection();
    autoSave();
}
</script>

<template>
    <div id="table-container" ref="tableContainer" class="table-container"
         :class="{ 'cut-left': cutLeft, 'cut-right': cutRight }" :style="stickyOffsets">
        <div v-if="!reactiveState.currentClass || !reactiveState.currentClass.data || reactiveState.currentClass.data.length === 0"
             class="empty-state-box">
            <div class="empty-icon"><ClipboardList :size="40" style="opacity: 0.5;" /></div>
            <p class="empty-title">Ingen elever endnu</p>
            <p class="empty-desc">Tilføj elever én ad gangen med <strong>+ Elev</strong> ovenfor, eller importer hele klassen på én gang:</p>
            <button class="empty-import-btn" @click="goToPasteImport">
                <svg class="hi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M12 11v6"/><path d="m9 14 3 3 3-3"/></svg>
                Indsæt fra Excel / Google Sheets
            </button>
        </div>
        <!-- few-columns: højst 4 kolonner får lidt mere luft (se stilen nederst).
             Ikke 6: seks kolonner à 120 px gjorde tabellen 1.110 px bred, så den
             rullede vandret i et vindue på 1.024 px (målt live 4/11). -->
        <!-- aria-label: uden et navn hed tabellen bare "tabel" for en
             skærmlæser (målt i Chromiums tilgængelighedstræ 9/11 2026). -->
        <table v-else :class="{ 'few-columns': visibleColumns.length <= 4 }" aria-label="Elevliste">
            <thead>
                <tr>
                    <!-- Hakket bruges kun til "Lav aftale" (Skal sammen / Undgå) — derfor
                         hedder kolonnen det, og ikke det tomme "Valg". -->
                    <th style="width:40px;" title="Sæt hak ved de elever, aftalen gælder, og tryk Lav aftale">AFTALE</th>
                    <!-- Fremmødet står foran navnet (Kenneths valg 4/11 2026): en
                         rund knap i sin EGEN smalle celle lige før første
                         datakolonne, ikke inde i navnecellen — den kan man skrive
                         i (contenteditable), og en knap derinde ville komme med i
                         teksten og forstyrre Enter/pil-tasterne. Det er et rigtigt
                         afkrydsningsfelt, bare tegnet rundt (elevliste.css), så
                         tastatur, skærmlæser og den halve markering virker som før.
                         Feltet reagerer selv (@change), så det også virker med
                         Tab + Mellemrum. Hvor mange der er mødt, står i knappens
                         hjælpetekst (title). -->
                    <!-- 18px = knappens bredde. Aldrig en %-bredde her: den tager
                         den overskydende plads fra slet-kolonnen (elevliste.css). -->
                    <th class="th-attendance" style="width:18px;">
                        <input type="checkbox" class="presence-toggle"
                               :checked="allPresent" :indeterminate.prop="someAbsent"
                               aria-label="Alle til stede"
                               :title="allPresent ? `Alle ${studentCount} er mødt. Klik for at melde alle væk` : `${presentCount} af ${studentCount} er mødt. Klik for at melde alle mødt`"
                               @change="toggleAllAttendance">
                    </th>
                    <th v-for="(col, colIndex) in orderedColumns"
                        :key="col"
                        class="col-header"
                        :class="{
                            'col-active': reactiveState.sortState.col === col,
                            'col-hidden': isHidden(col)
                        }"
                        tabindex="0"
                        :aria-sort="ariaSort(col)"
                        :aria-description="headerDescription(col)"
                        :data-tooltip="'Venstre-klik / Enter: Sorter\nHøjre-klik / menutast: Skjul/Vis indhold\nDobbelt-klik / F2: Omdøb'"
                        @keydown="onHeaderKeydown($event, col)"
                        @click="onHeaderClick(col)"
                        @contextmenu="onHeaderContextMenu($event, col)"
                        @dblclick="onHeaderDblClick($event, col)">
                        <!-- Pilen er kun til øjet: aria-sort siger det samme, og
                             ellers hed overskriften "NAVN sort pil op". -->
                        {{ col.toUpperCase() }}<span aria-hidden="true">{{ sortIndicator(col) }}</span>
                    </th>
                    <!-- Slet-kolonnen tager den overskydende bredde (elevliste.css).
                         aria-label: en tom overskrift gav kolonnen intet navn. -->
                    <th class="th-delete" aria-label="Slet"></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(row, rowIndex) in displayData"
                    :key="rowKey(row)"
                    :class="{ 'row-excluded': row._excluded, 'selected': isSelected(row) }">
                    <!-- Afkrydsning til markering.
                         aria-label: uden den hed begge felter bare "afkrydsning"
                         — målt. En skærmlæser der gik ned gennem en klasse på 30
                         hørte 60 navnløse felter og kunne ikke vide, hvem hun
                         satte fraværende. -->
                    <td class="cell-checkbox">
                        <input type="checkbox"
                               :aria-label="`${studentLabel(row)} med i aftale`"
                               :checked="isSelected(row)"
                               @change="toggleSelection(row)">
                    </td>
                    <!-- Fremmøde: den runde knap foran navnet. Er eleven væk, er
                         ringen tom og rækken grå (intet "VÆK"-mærke: Kenneth 4/11 2026,
                         ringen og den grå tekst siger det). -->
                    <td class="cell-checkbox cell-attendance">
                        <input type="checkbox" class="presence-toggle"
                               :aria-label="`${studentLabel(row)} er til stede`"
                               :title="row._excluded ? 'Væk. Klik, når eleven er mødt' : 'Mødt. Klik, hvis eleven er væk i dag'"
                               :checked="!row._excluded"
                               @change="toggleAttendance(row)">
                    </td>
                    <!-- Cellerne -->
                    <td v-for="(col, colIndex) in orderedColumns"
                        :key="col"
                        :contenteditable="!isMasked(col)"
                        class="cell-data"
                        :class="{
                            'cell-hidden': isHidden(col),
                            'cell-hidden-masked': isMasked(col)
                        }"
                        :title="isMasked(col) ? 'Indhold skjult. Klik på Vis skjult for at se.' : ''"
                        :aria-label="isMasked(col) ? 'Skjult' : null"
                        @input="onCellInput($event)"
                        @blur="onCellBlur(row, col, $event)"
                        @keydown="onCellKeydown($event, rowIndex, colIndex)"
                        v-text="getCellText(row, col)">
                    </td>
                    <!-- Slet-knap -->
                    <td class="cell-delete">
                        <button class="delete-row-btn" @click="deleteRow(row)" :aria-label="`Slet ${studentLabel(row)}`" title="Slet elev">&times;</button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>

    <!-- Vinduer -->
    <PromptModal
      v-if="showRenameCol"
      title="Omdøb kolonne"
      placeholder="Nyt navn"
      :initial-value="renameColTarget"
      confirm-text="Omdøb"
      @confirm="confirmRenameCol"
      @cancel="showRenameCol = false"
    />

    <ConfirmModal
      v-if="showDeleteRow"
      title="Slet elev"
      :message="`Er du sikker på, at du vil slette '${deleteRowName}'?`"
      confirm-text="Slet"
      variant="danger"
      @confirm="confirmDeleteRow"
      @cancel="showDeleteRow = false"
    />
</template>

<style scoped>
.empty-state-box {
    text-align: center;
    padding: 48px 20px;
    color: var(--text-muted);
}
.empty-icon { font-size: 2.5rem; margin-bottom: 12px; }
.empty-title { font-size: 16px; font-weight: 600; color: var(--text-main); margin: 0 0 8px; }
.empty-desc { font-size: 13px; max-width: 340px; margin: 0 auto 16px; line-height: 1.5; }
.empty-import-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 9px 18px;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 8px;
    /* Tre erklæringer, ikke `font: 600 13px inherit`. Skrifttypen i
       `font`-genvejen skal være et NAVN — `inherit` er ikke lovligt dér, og
       så falder HELE genvejen bort: knappen stod med browserens egen
       knapskrift i stedet for sidens, i både vægt og størrelse. */
    font-weight: 600;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.15s;
}
.empty-import-btn:hover { opacity: 0.88; transform: translateY(-1px); }
.empty-import-btn .hi { width: 15px; height: 15px; flex-shrink: 0; }

/* Erstatter inline :style-objekter pr. celle — Vue oprettede før ca. 240
   style-objekter pr. rendering i en tabel på 30×8. CSS-klasser overlader
   styling helt til browseren. */
.col-header {
    cursor: pointer;
    text-align: left;
    min-inline-size: 84px;
}
.col-header:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
}
.col-header.col-hidden {
    background: oklch(1 0 0 / 2%);
    /* --text-muted: navnet på en skjult kolonne skal stadig kunne læses */
    color: var(--text-muted);
    font-style: italic;
}

.row-excluded {
    opacity: 0.4;
    background: oklch(1 0 0 / 2%);
}

/* Mange kolonner: tabellen rullede ikke, så de sidste kolonner blev klippet af
   uden nogen vej hen til dem, og navnet blev presset ned til 2-4 linjer. Nu
   ruller beholderen vandret, og de datakolonner har en mindstebredde — navnet
   (første datakolonne) står på én linje. */
.table-container {
    overflow-x: auto;
}
.cell-data {
    min-inline-size: 84px;
}
/* Få kolonner: datakolonnerne er kun så brede som indholdet (elevliste.css),
   så en kort kolonne som KØN får lidt mere luft. Ikke ved mange kolonner, hvor det
   bare ville give mere vandret rulning (målt: 415 px mere med 12 kolonner). */
.few-columns .cell-data {
    min-inline-size: 120px;
}
/* Vis-kolonnen (navnet, altid første datakolonne): på én linje og kun så
   bred som det længste navn. Før havde den 170 px som mindstebredde, så korte
   fornavne som "Amalie" stod med 130 px luft til næste kolonne (Kenneth 4/11
   2026). nowrap holder i forvejen navnet på én linje, og den ekstra luft for
   få kolonner (ovenfor) gælder ikke her: navnene er sjældent så korte som KØN. */
.cell-data:nth-child(3),
.few-columns .cell-data:nth-child(3) {
    min-inline-size: 84px;
    white-space: nowrap;
}
.cell-checkbox,
.cell-delete {
    text-align: center;
}
.cell-data.cell-hidden {
    background: oklch(1 0 0 / 2%);
    color: var(--text-muted);
}
.cell-data.cell-hidden-masked {
    color: var(--text-subtle);
    -webkit-user-select: none;
    user-select: none;
    cursor: not-allowed;
}
</style>
