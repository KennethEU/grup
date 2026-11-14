<script setup>
import { computed, ref } from 'vue';
import { reactiveState } from '../../js/modules/reactiveState.js';
import { getHistory } from '../../js/modules/storage.js';
import { deleteSession, restoreSession, renameSession } from '../../js/modules/history.js';
import { modalActions } from '../../js/modules/modalState.js';
import { UI_NAMES } from '../../js/modules/beta.js';
import { topicText } from '../../js/modules/classShape.js';

import { FolderOpen, Eye, Pencil, RefreshCw, Trash2 } from 'lucide-vue-next';
import ConfirmModal from '../ConfirmModal.vue';
import PromptModal from '../PromptModal.vue';

// Tilstand for de tre vinduer
const showRestoreConfirm = ref(false);
const restoreTarget = ref(null);
const showDeleteConfirm = ref(false);
const deleteTarget = ref(null);
const showRenamePrompt = ref(false);
const renameTargetSession = ref(null);

const historyVersion = ref(0);

const historyDataReactive = computed(() => {
    // At læse historyVersion.value gør, at denne computed genberegnes, hver
    // gang tælleren øges. Værdien bruges ikke til noget andet — det er alene
    // en måde at få Vue til at lytte.
    void historyVersion.value;
    if (!reactiveState.currentClass) return [];
    return getHistory();
});

const sortedHistoryReactive = computed(() => {
    // Nyeste først. En ulæselig dato gav `NaN` i sammenligningen, og så er
    // sorteringen ikke længere en sortering — rækkefølgen af ALLE rækker blev
    // vilkårlig. Datoløse sessioner lægger sig nederst i stedet.
    const timeOf = (s) => {
        const t = new Date(s.date).getTime();
        return Number.isNaN(t) ? -Infinity : t;
    };
    return [...historyDataReactive.value].sort((a, b) => timeOf(b) - timeOf(a));
});

// Læs listen igen efter en ændring her i fanen (omdøb, slet).
function updateHistory() {
    historyVersion.value++;
}

// Datoen kan være ulæselig: `storage.saveHistory()` beholder BEVIDST en
// session med en dato den ikke kan tolke (en ulæselig dato er ikke det samme
// som "for gammel"), og en importeret backup kan bære en med ind. Uden det
// her tjek skrev tabellen "Invalid Date" ud til læreren.
function isValidDate(dateStr) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
}

// Ét formateringsobjekt pr. slags i stedet for et nyt ved hver række og hver
// gentegning — samme tekst som toLocaleDateString/-TimeString med de samme valg.
const DATE_FORMAT = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short' });
const TIME_FORMAT = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' });

function formatDate(dateStr) {
    const d = isValidDate(dateStr);
    return d ? DATE_FORMAT.format(d) : '—';
}

function formatTime(dateStr) {
    const d = isValidDate(dateStr);
    return d ? TIME_FORMAT.format(d) : '—';
}

// Sessionens navn, som det kan vises. Navnet er lærerens tekst, men en
// håndrettet backup kan bære et tal, et objekt eller ingenting ind. Før stod
// der "[object Object]" i listen, i skærmlæserens "Omdøb …" og i omdøb-feltet
// (122. gennemsyn, småting (a); rettet i 123.). Kun visningen renses — det
// gemte rører vi ikke, før læreren selv omdøber.
function sessionLabel(session) {
    return topicText(session?.name).trim() || 'Uden navn';
}

// Antal grupper i sessionens oversigt. Et tal (eller tal som tekst) vises;
// alt andet bliver 0, som når feltet mangler.
function groupCount(session) {
    const n = Number(session?.stats?.groupCount);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function typeLabel(type) {
    // Lærerens eget ord: stamgrupper og matrixgrupper (ikke "Stam"/"Runde 1")
    return type === 'WITH_MATRIX' ? 'Stamgrupper + matrixgrupper' : 'Stamgrupper';
}

function isMatrix(type) {
    return type === 'WITH_MATRIX';
}

function onPreview(sessionId) {
    modalActions.openPreviewSession(sessionId);
}

function onRestore(sessionId) {
    restoreTarget.value = sessionId;
    showRestoreConfirm.value = true;
}

function confirmRestore() {
    const id = restoreTarget.value;
    showRestoreConfirm.value = false;
    restoreTarget.value = null;
    if (!id) return;
    // restoreSession skifter selv til gruppe-fanen, når det lykkes — ligesom
    // i PreviewSessionModal. Før skiftede fanen her UANSET, så en session,
    // der ikke kunne hentes frem, sendte læreren væk fra Historik til de
    // uændrede grupper lige efter fejlbeskeden (122. gennemsyn).
    restoreSession(id);
}

function onRename(session) {
    renameTargetSession.value = session;
    showRenamePrompt.value = true;
}

function confirmRename(newName) {
    const session = renameTargetSession.value;
    showRenamePrompt.value = false;
    renameTargetSession.value = null;
    if (!session || !newName || newName === topicText(session.name)) return;
    // En afvist skrivning (fuld lagerplads) må ikke se ud som en succes: uden
    // beskeden stod det nye navn i tabellen, indtil siden blev genindlæst.
    if (renameSession(session.id, newName) === false) {
        window.notifyError?.(
            'Kunne ikke gemme det nye navn — browserens lagerplads er fuld. ' +
            'Slet en gammel session eller klasse og prøv igen.'
        );
    }
    updateHistory();
}

function onDelete(sessionId) {
    deleteTarget.value = sessionId;
    showDeleteConfirm.value = true;
}

function confirmDelete() {
    const id = deleteTarget.value;
    showDeleteConfirm.value = false;
    deleteTarget.value = null;
    if (!id) return;
    if (deleteSession(id) === false) {
        window.notifyError?.(
            'Kunne ikke slette sessionen — browserens lagerplads er fuld. ' +
            'Prøv at slette en gammel klasse først.'
        );
    }
    updateHistory();
}
</script>

<template>
    <div id="tab-history" class="tab-content">
        <div class="history-wrapper">
            <!-- Tabellen er bygget af div'er (flex-kolonner), så rollerne skal
                 sættes i hånden — ellers læser en skærmlæser først seks
                 overskrifter og derefter en strøm af værdier, uden at nogen af
                 delene hører sammen. Rollen sættes kun når der ER rækker: en
                 tom tabel med en forklarende tekst indeni er ikke en tabel. -->
            <div id="history-list-view"
                 class="table-container"
                 :role="sortedHistoryReactive.length ? 'table' : null"
                 :aria-label="sortedHistoryReactive.length ? 'Gemte sessioner' : null">
                <div v-if="sortedHistoryReactive.length === 0" class="empty-state">
                    <FolderOpen :size="48" />
                    <strong>Ingen gemte sessioner</strong>
                    <span>Når du har dannet grupper, kan du arkivere dem ved at klikke på <strong>Gem</strong> nederst på Grupper-fanen.</span>
                </div>
                <template v-else>
                    <div class="history-header" role="row">
                        <div class="col-date" role="columnheader">Dato</div>
                        <div class="col-time" role="columnheader">Tid</div>
                        <div class="col-name" role="columnheader">Navn</div>
                        <div class="col-type" role="columnheader">Type</div>
                        <div class="col-count" role="columnheader">Grupper</div>
                        <div class="col-actions" role="columnheader">Handling</div>
                    </div>

                    <TransitionGroup name="history-list" tag="div" role="rowgroup">
                        <div v-for="s in sortedHistoryReactive"
                             :key="s.id"
                             class="history-item-row"
                             role="row">
                            <div class="col-date cell-date" role="cell">{{ formatDate(s.date) }}</div>
                            <div class="col-time cell-time" role="cell">{{ formatTime(s.date) }}</div>
                            <div class="col-name cell-name" role="cell">{{ sessionLabel(s) }}</div>
                            <div class="col-type cell-type" role="cell" :class="{ 'is-matrix': isMatrix(s.type) }">{{ typeLabel(s.type) }}</div>
                            <div class="col-count cell-count" role="cell">{{ groupCount(s) }}</div>
                            <div class="col-actions cell-actions" role="cell">
                                <!-- Sessionens navn hører med i aria-label: uden det hører
                                     en skærmlæser bare "Omdøb session" tolv gange i træk
                                     uden at vide hvilken. Titlen bliver kort, fordi den
                                     vises som tooltip ved siden af navnet i rækken. -->
                                <button class="btn-icon" title="Forhåndsvisning" :aria-label="`Forhåndsvis ${sessionLabel(s)}`" @click="onPreview(s.id)"><Eye :size="14" /></button>
                                <button class="btn-icon" title="Omdøb" :aria-label="`Omdøb ${sessionLabel(s)}`" @click="onRename(s)"><Pencil :size="14" /></button>
                                <button class="btn-icon" title="Gendan" :aria-label="`Gendan ${sessionLabel(s)}`" @click="onRestore(s.id)"><RefreshCw :size="14" /></button>
                                <button class="btn-icon danger" title="Slet" :aria-label="`Slet ${sessionLabel(s)}`" @click="onDelete(s.id)"><Trash2 :size="14" /></button>
                            </div>
                        </div>
                    </TransitionGroup>
                </template>
            </div>
        </div>
    </div>

    <!-- Vinduer -->
    <ConfirmModal
      v-if="showRestoreConfirm"
      title="Gendan session"
      :message="`Det vil overskrive dine nuværende grupper (men ikke din elevliste). Den fordeling du står med nu, bliver lagt øverst i menuen &quot;${UI_NAMES.runHistory}&quot; nederst på Grupper-fanen, så du kan hente den tilbage.`"
      confirm-text="Gendan"
      @confirm="confirmRestore"
      @cancel="showRestoreConfirm = false"
    />

    <ConfirmModal
      v-if="showDeleteConfirm"
      title="Slet session"
      message="Er du sikker på, at du vil slette denne session permanent?"
      confirm-text="Slet"
      variant="danger"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />

    <PromptModal
      v-if="showRenamePrompt"
      title="Omdøb session"
      placeholder="Nyt navn"
      :initial-value="topicText(renameTargetSession?.name)"
      confirm-text="Omdøb"
      @confirm="confirmRename"
      @cancel="showRenamePrompt = false"
    />
</template>

<style scoped>
/* Farver, streger og skrift står i Historiks ark
   (beta/screens/historik-filer.css), som vinder over de scoped regler. Her
   står kun opbygningen: kolonnerne og det, arket ikke sætter. */
.history-wrapper {
    margin: 0 auto;
}

.empty-state {
    text-align: center;
    padding-inline: 40px;
}

/* Tabellens overskriftsrække */
.history-header {
    display: flex;
    padding-block: 10px;
    text-transform: uppercase;
}

/* Kolonnebredder */
.col-date { width: 100px; }
.col-time { width: 60px; }
.col-name { flex: 1; }
.col-type { width: 180px; }
.col-count { width: 80px; text-align: right; }
.col-actions { width: 140px; text-align: right; }

/* Rækkerne */
.history-item-row {
    display: flex;
    align-items: center;
    padding-block: 10px;
    transition: background 0.15s;
}

/* Cellerne */
.cell-date { font-size: var(--font-sm); }
.cell-name {
    font-size: var(--font-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-right: 10px;
}
.cell-actions { display: flex; justify-content: flex-end; }
</style>
