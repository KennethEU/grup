<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { reactiveState } from '../../js/modules/reactiveState.js';
import { pushUndo, clearUndoHistory, undo, redo, canUndo, canRedo } from '../../js/modules/state.js';
import { teacherColumns } from '../../js/modules/utils.js';
import { validateColumnName } from '../../js/modules/columnActions.js';
import { modalActions } from '../../js/modules/modalState.js';
import * as classActions from '../../js/modules/classActions.js';
import { autoSave } from '../../js/modules/classActions.js';
import { Eye, EyeOff, Zap, Ban, UserPlus, ListPlus, Trash2, ChevronDown, ArrowDownWideNarrow, Columns3, Link2, Handshake, Undo2, Redo2 } from 'lucide-vue-next';
import PromptModal from '../PromptModal.vue';

const showAddColPrompt = ref(false);
const showAgreementMenu = ref(false);
const agreementMenuRef = ref(null);
const togetherItemRef = ref(null);
const separateItemRef = ref(null);

const columns = computed(() =>
    teacherColumns(reactiveState.currentClass?.columns));

const hasSelection = computed(() => {
    return reactiveState.selectedForAction.size >= 2;
});

const agreementCount = computed(() => {
    const cls = reactiveState.currentClass;
    return (cls?.separations?.length || 0) + (cls?.togetherGroups?.length || 0);
});

const hasHiddenColumns = computed(() => {
    return reactiveState.currentClass?.hiddenColumns?.length > 0;
});

function toggleHiddenContent() {
    reactiveState.showHiddenContent = !reactiveState.showHiddenContent;
}

// "Vis:"-kolonnen ligger i reactiveState, så vælgeren skriver direkte dertil
// (StudentTable og gruppekortene læser den samme sted fra).
//
// Valget gemmes med det samme (autoSave skriver det som klassens
// `id_column`, også i hukommelsen). Før 10/11 2026 skrev vælgeren kun til
// skærmen: elevlistens side tegnes forfra efter Hjælp eller Import & backup
// og sætter Vis-kolonnen ud fra klassens `id_column` — og så stod den gamle
// kolonne der igen.
function onDisplayColumnChange(e) {
    reactiveState.displayColumn = e.target.value;
    autoSave();
}

// Ranger værdier: "Ensartede" og "Balancér" kan kun arbejde med tal. Har
// læreren et niveau skrevet Lav/Middel/Høj, er det her hun fortæller
// programmet rækkefølgen. Anden indgang er handlingsknappen på advarslen om
// netop dét (HintsStack) — den er den vigtigste, men den kræver at fejlen
// allerede er sket.
function onRankValues() {
    modalActions.openColumnOrder('');
}

function onCategorize() {
    modalActions.openCategory();
}

function onSeparate() {
    if (!reactiveState.currentClass) return;
    classActions.handleSeparateAction();
}

function openAgreementModal() {
    showAgreementMenu.value = false;
    // Samme fane som sidst, men uden en markering fra en tidligere advarsel.
    modalActions.openAgreements(reactiveState.agreementTab);
}

function toggleAgreementMenu() {
    if (!hasSelection.value) return;
    showAgreementMenu.value = !showAgreementMenu.value;
    // role="menu" lover tastaturbetjening. Fokus skal derfor FLYTTE ind i
    // menuen, ellers står læreren stadig på knappen med en åben menu foran sig.
    if (showAgreementMenu.value) nextTick(() => togetherItemRef.value?.focus());
}

function moveAgreementMenu() {
    const next = document.activeElement === togetherItemRef.value ? separateItemRef : togetherItemRef;
    next.value?.focus();
}

function chooseAgreement(type) {
    showAgreementMenu.value = false;
    // Menupunktet forsvinder under fingeren, og markøren falder på gulvet —
    // målt 9/9: `document.activeElement` er BODY resten af vejen. Aftale-
    // vinduet, der åbner bagefter, kan heller ikke rette op på det: det husker
    // knappen, der havde fokus, da det åbnede, og den findes ikke længere. Så
    // Escape ud af vinduet lander også på gulvet.
    //
    // "Lav aftale"-knappen kan ikke tage imod: handlingen rydder markeringen,
    // og så er knappen slukket og kan ikke få fokus. "Aftaler" ved siden af
    // kan altid bruges, og den åbner det samme vindue — så det er den, markøren
    // får, både når vinduet åbner og når en konflikt gør, at det ikke gør.
    document.getElementById('together-list-btn')?.focus();
    if (type === 'together') {
        classActions.handleTogetherAction();
    } else {
        onSeparate();
    }
}

function closeAgreementMenuOnOutsideClick(event) {
    if (agreementMenuRef.value && !agreementMenuRef.value.contains(event.target)) {
        showAgreementMenu.value = false;
    }
}

function closeAgreementMenuOnEscape(event) {
    if (event.key !== 'Escape' || !showAgreementMenu.value) return;
    showAgreementMenu.value = false;
    // Tilbage til knappen, som Escape i en menu skal.
    document.getElementById('create-agreement-btn')?.focus();
}

onMounted(() => {
    document.addEventListener('pointerdown', closeAgreementMenuOnOutsideClick);
    document.addEventListener('keydown', closeAgreementMenuOnEscape);
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', closeAgreementMenuOnOutsideClick);
    document.removeEventListener('keydown', closeAgreementMenuOnEscape);
});

function onAddRow() {
    pushUndo();
    classActions.handleAddRow();
}

function onAddCol() {
    showAddColPrompt.value = true;
}

function confirmAddCol(name) {
    showAddColPrompt.value = false;
    if (!name || !reactiveState.currentClass) return;

    const check = validateColumnName(name, reactiveState.currentClass.columns);
    if (!check.ok) {
        if (window.notifyError) window.notifyError(check.error);
        return;
    }

    reactiveState.currentClass.columns.push(check.name);
    reactiveState.currentClass.data.forEach(row => row[check.name] = "");
    // Ikke pushUndo: et snapshot fra FØR kolonnen fandtes, lagt tilbage
    // bagefter, ville efterlade en kolonne uden nøgle i nogen række. En
    // skema-ændring nulstiller fortryd-stakken i stedet — se StudentTable.
    clearUndoHistory();
    autoSave();
}

// Fortryd og Gentag: samme stak som genvejen (Ctrl+Z / ⌘ Z) i main.js. Før
// fandtes kun genvejen, og den skulle man kende — selv om flere beskeder
// lover, at noget kan fortrydes. Knapperne er slukket, når der intet er.
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const undoKey = isMac ? '⌘ Z' : 'Ctrl Z';
const redoKey = isMac ? '⌘ Shift Z' : 'Ctrl Y';
const undoAvailable = computed(() => canUndo());
const redoAvailable = computed(() => canRedo());

function onUndo() {
    if (undo()) autoSave();
}

function onRedo() {
    if (redo()) autoSave();
}

function onDeleteCol() {
    modalActions.openDeleteColumn();
}

function onColumnLayout() {
    modalActions.openColumnLayout();
}

</script>

<template>
    <div class="settings-panel ribbon">
        <div class="ribbon-content">
            <!-- Zone 1: visning og data -->
            <div class="ribbon-zone">
                <div class="ribbon-group">
                    <!-- "Vis:"-vælgeren — ligner regel-menuen -->
                    <div class="id-selector-wrapper">
                        <label class="id-drawer-btn" for="id-column-select" title="Vælg hvilken kolonne der skal stå på gruppekortene — fx Navn. Den behøver hverken være unik eller udfyldt.">
                            <span class="id-label">Vis:</span>
                            <span class="id-value">{{ reactiveState.displayColumn }}</span>
                            <ChevronDown :size="14" class="id-chevron" />
                        </label>
                        <select id="id-column-select" class="id-native-select" :value="reactiveState.displayColumn" @change="onDisplayColumnChange">
                            <option v-for="col in columns" :key="col" :value="col">{{ col }}</option>
                        </select>
                    </div>

                    <span class="inline-sep"></span>

                    <!-- Kolonneværktøjer og elev-aftaler deler samme ramme. -->
                    <div class="pill-group">
                        <button class="pill-btn" id="cat-btn" @click="onCategorize" title="Opret en ny kategoriseret kolonne ud fra eksisterende data">
                            <Zap :size="13" />
                            <span>Kategoriser</span>
                        </button>
                        <button class="pill-btn" id="rank-btn" @click="onRankValues" title="Giv en tekstkolonne en rækkefølge — fx Lav, Middel, Høj — så Ensartede og Balancér kan bruge den">
                            <ArrowDownWideNarrow :size="13" />
                            <span>Ranger</span>
                        </button>
                        <!-- Eget ikon: listeknappen stod før med samme ikon og
                             næsten samme navn som handlingen ved siden af. -->
                        <button class="pill-btn" id="together-list-btn" @click="openAgreementModal" title="Vis og administrer alle aftaler">
                            <Handshake :size="13" /><span>Aftaler</span>
                            <span v-if="agreementCount" class="avoid-badge">{{ agreementCount }}</span>
                        </button>
                    </div>
                    <!-- Knappen står altid; før to elever er markeret er den slukket (aria-disabled
                         i stedet for disabled, så tooltippen stadig fortæller hvorfor). -->
                    <div ref="agreementMenuRef" class="agreement-action">
                        <button
                            class="ribbon-btn"
                            id="create-agreement-btn"
                            type="button"
                            aria-haspopup="menu"
                            :aria-expanded="showAgreementMenu"
                            :aria-disabled="!hasSelection"
                            :class="{ 'is-inactive': !hasSelection }"
                            @click="toggleAgreementMenu"
                            :title="hasSelection ? 'Lav en aftale for de markerede elever' : 'Markér mindst to elever'"
                        >
                            <Link2 :size="13" />
                            <span>Lav aftale</span>
                            <ChevronDown :size="13" :class="{ 'menu-chevron-open': showAgreementMenu }" />
                        </button>
                        <div v-if="showAgreementMenu && hasSelection" class="agreement-menu" data-popup-menu role="menu"
                             @keydown.down.prevent="moveAgreementMenu()" @keydown.up.prevent="moveAgreementMenu()">
                            <button ref="togetherItemRef" class="agreement-menu-btn" type="button" role="menuitem" @click="chooseAgreement('together')">
                                <Link2 :size="15" />
                                <span>
                                    <strong>Skal sammen</strong>
                                    <small>Hold eleverne samlet</small>
                                </span>
                            </button>
                            <button ref="separateItemRef" class="agreement-menu-btn agreement-menu-btn--conflict" type="button" role="menuitem" @click="chooseAgreement('separate')">
                                <Ban :size="15" />
                                <span>
                                    <strong>Undgå hinanden</strong>
                                    <small>Hold eleverne adskilt</small>
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Zone 2: rækker og kolonner -->
            <div class="ribbon-zone actions-zone">
                <div class="ribbon-group">
                    <!-- Fortryd/Gentag. aria-disabled frem for disabled (som "Lav aftale"),
                         så tooltippen stadig siger, hvorfor knappen er slukket. -->
                    <div class="pill-group">
                        <button class="pill-btn" id="undo-btn" type="button"
                                :aria-disabled="!undoAvailable" :class="{ 'is-inactive': !undoAvailable }"
                                @click="onUndo"
                                :title="undoAvailable ? `Fortryd den seneste ændring i elevlisten (${undoKey})` : 'Der er intet at fortryde'">
                            <Undo2 :size="13" />
                            <span>Fortryd</span>
                        </button>
                        <button class="pill-btn" id="redo-btn" type="button"
                                :aria-disabled="!redoAvailable" :class="{ 'is-inactive': !redoAvailable }"
                                @click="onRedo"
                                :title="redoAvailable ? `Gentag det, du lige fortrød (${redoKey})` : 'Der er intet at gentage'">
                            <Redo2 :size="13" />
                            <span>Gentag</span>
                        </button>
                    </div>

                    <!-- Elev + Kolonne — én pillegruppe (begge tilføjer noget) -->
                    <div class="pill-group">
                        <button class="pill-btn" id="add-row-btn" @click="onAddRow" title="Tilføj en ny tom elev øverst i listen">
                            <UserPlus :size="13" />
                            <span>Elev</span>
                        </button>
                        <button class="pill-btn" id="add-col-btn" @click="onAddCol" title="Tilføj en ny kolonne til elevlisten">
                            <ListPlus :size="13" />
                            <span>Kolonne</span>
                        </button>
                        <button class="pill-btn" id="col-layout-btn" @click="onColumnLayout" title="Bestem hvilken rækkefølge kolonnerne står i — rækkefølgen følger med til Excel">
                            <Columns3 :size="13" />
                            <span>Flyt</span>
                        </button>
                    </div>

                    <!-- Slet — står alene, fordi den sletter -->
                    <button class="ribbon-btn danger" id="del-col-btn" @click="onDeleteCol" title="Slet en kolonne fra elevlisten">
                        <Trash2 :size="13" />
                        <span>Slet kolonne</span>
                    </button>

                    <!-- Vis/skjul skjulte kolonner — kun når der er nogen -->
                    <Transition name="pill-fade">
                        <button v-if="hasHiddenColumns" class="ribbon-btn" @click="toggleHiddenContent" :title="reactiveState.showHiddenContent ? 'Skjul kolonneindhold igen' : 'Vis skjult kolonneindhold'">
                            <EyeOff v-if="reactiveState.showHiddenContent" :size="13" />
                            <Eye v-else :size="13" />
                            <span>{{ reactiveState.showHiddenContent ? 'Skjul' : 'Vis skjult' }}</span>
                        </button>
                    </Transition>
                </div>
            </div>
        </div>
    </div>

    <!-- Vinduer -->
    <PromptModal
      v-if="showAddColPrompt"
      title="Ny kolonne"
      placeholder="Navn på kolonne"
      confirm-text="Opret"
      @confirm="confirmAddCol"
      @cancel="showAddColPrompt = false"
    />
</template>

<style scoped>
/* === Båndet over elevlisten === */
.settings-panel {
    display: flex;
    align-items: center;
    padding: 0;
    margin: 0;
    min-height: 44px;
    background: transparent;
    width: 100%;
}

.ribbon-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 0;
}

.ribbon-zone {
    padding: 2px 0;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
}

.ribbon-group {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
}

/* Skillestreg */
.inline-sep {
    width: 1px;
    height: 16px;
    background: var(--border-subtle);
    margin: 0 4px;
    opacity: 0.3;
}

/* === Pillegruppe (knapper, der hører sammen) === */
.pill-group {
    display: flex;
    align-items: center;
    background: var(--bg-pill);
    border: 1px solid var(--border-subtle);
    border-radius: 100px;
    padding: 2px;
    height: 32px;
    box-sizing: border-box;
    gap: 2px;
}

/* === "Vis:"-vælgeren — ligner regel-menuen === */
.id-selector-wrapper {
    position: relative;
    display: inline-flex;
}

.id-drawer-btn {
    height: 30px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    background: var(--bg-pill);
    border: 1px solid var(--border-subtle);
    border-radius: 100px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition-property: var(--ctl-transition);
    transition-duration: 0.25s;
    transition-timing-function: cubic-bezier(0.25, 0.8, 0.25, 1);
}

.id-drawer-btn:hover {
    background: var(--bg-surface-hover);
    border-color: var(--border-strong);
    color: var(--text-main);
}

/* Selve vælgeren er usynlig (opacity 0), så dens egen fokusramme ses heller
   ikke. Tastaturfokus på den lægger derfor rammen om den synlige pille. */
.id-selector-wrapper:has(.id-native-select:focus-visible) .id-drawer-btn {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
}

.id-label {
    color: var(--text-muted);
}

.id-value {
    color: var(--text-main);
    font-weight: 800;
}

.id-chevron {
    color: var(--text-muted);
    opacity: 0.6;
}

/* Den skjulte native select ligger oven på teksten, til klik og tilgængelighed */
.id-native-select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    font-size: 13px;
}

/* === Knapperne i en pillegruppe === */
.pill-btn {
    flex: 1;
    height: 100%;
    padding: 0 14px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 100px;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}

.pill-btn:hover {
    color: var(--text-main);
    background: var(--surface-tint-hover);
}

/* === Knapper, der står alene === */
.ribbon-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 32px;
    border: 1px solid transparent;
    border-radius: 100px;
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
}

.ribbon-btn:hover {
    color: var(--text-main);
    background: var(--bg-surface-hover);
    border-color: var(--border-medium);
}

.agreement-action .ribbon-btn.is-inactive,
.pill-btn.is-inactive {
    opacity: 0.45;
    cursor: not-allowed;
}

/* En slukket Fortryd/Gentag skal ikke lyse op, som om den kunne trykkes */
.pill-btn.is-inactive:hover {
    color: var(--text-muted);
    background: transparent;
}
.agreement-action {
    position: relative;
}

.agreement-menu {
    position: absolute;
    inset-block-start: calc(100% + 8px);
    inset-inline-start: 0;
    z-index: 20;
    min-inline-size: 224px;
    padding-block: 6px;
    padding-inline: 6px;
    background: var(--bg-surface, oklch(1 0 0));
    border: 1px solid var(--border-medium);
    border-radius: var(--radius-md, 12px);
    box-shadow: var(--shadow-float, 0 8px 24px oklch(0 0 0 / 12%));
}

.agreement-menu-btn {
    display: flex;
    align-items: center;
    inline-size: 100%;
    min-block-size: 44px;
    gap: 10px;
    padding-block: 8px;
    padding-inline: 10px;
    border: 0;
    border-radius: var(--radius-sm, 6px);
    background: transparent;
    color: var(--text-main);
    text-align: start;
    cursor: pointer;
}

.agreement-menu-btn:hover,
.agreement-menu-btn:focus-visible {
    background: var(--bg-surface-hover);
}

.agreement-menu-btn span {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
}

.agreement-menu-btn strong {
    font-size: 11px;
    font-weight: 700;
}

.agreement-menu-btn small {
    color: var(--text-muted);
    font-size: 10px;
}

.agreement-menu-btn--conflict {
    color: var(--color-warning);
}

.agreement-menu-btn--conflict small {
    color: var(--color-warning);
}

.menu-chevron-open {
    transform: rotate(180deg);
}

/* Fare-farve */
.ribbon-btn.danger {
    color: var(--color-error);
    border-color: var(--color-error-border);
    background: var(--color-error-bg);
}

.ribbon-btn.danger:hover {
    background: var(--color-error-hover);
}

/* === Overgang for knapper, der kommer og går === */
.pill-fade-enter-active,
.pill-fade-leave-active {
    transition: opacity 0.2s, transform 0.2s;
}

.pill-fade-enter-from,
.pill-fade-leave-to {
    opacity: 0;
    transform: scale(0.9);
}

/* === Tælleren på Aftaler === */
.avoid-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 9999px;
    background: var(--color-warning-light, oklch(0.80 0.16 75 / 15%));
    color: var(--color-warning, oklch(0.65 0.16 75));
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
}

/* === Smalle vinduer === */
@media (max-width: 1000px) {
    .ribbon-content {
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }
}

/* Telefon: rækkerne er bredere end skærmen. Centreret blev den første
   skåret af i VENSTRE kant ("Vis: Navn" stod som "avn"), hvor man ikke kan
   rulle hen. Nu brydes knapperne over på flere linjer fra venstre. */
@media (max-width: 700px) {
    .ribbon-content { align-items: stretch; gap: 4px; }
    .ribbon-zone { justify-content: flex-start; flex-shrink: 1; min-inline-size: 0; }
    .ribbon-group { flex-wrap: wrap; row-gap: 4px; }
}

/* Den kompakte 32 px form er en visuel størrelse. På touch-enheder skal
   markeringshandlingen stadig kunne rammes med mindst 44 px. */
@media (pointer: coarse) {
    #create-agreement-btn {
        min-block-size: 44px;
    }
}
</style>
