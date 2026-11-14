<script setup>
import { ref, onMounted } from 'vue';
import { useModalFocus } from '../composables/useModalFocus.js';
import * as history from '../js/modules/history.js';
import { groupDisplayName } from '../js/modules/utils.js';
import { topicText } from '../js/modules/classShape.js';

const props = defineProps({
    sessionId: { type: String, required: true }
});

const emit = defineEmits(['close']);

const sessionName = ref('');
const standardGroups = ref([]);
const matrixGroups = ref([]);
const loadError = ref(false);

onMounted(() => {
    const data = history.loadSessionForPreview(props.sessionId);
    if (!data) {
        loadError.value = true;
        if (window.notifyError) window.notifyError('Kunne ikke indlæse sessionen.');
        return;
    }

    // Et navn, der ikke er tekst (fra en håndrettet backup), blev før til
    // "[object Object]" i overskriften — se sessionLabel i HistoryTab.vue.
    sessionName.value = topicText(data.name).trim() || 'Session';
    standardGroups.value = data.standard || [];
    matrixGroups.value = data.matrix || [];
});

function doRestore() {
    emit('close');
    // restoreSession skifter selv til gruppe-fanen, når det lykkes. Her skiftede
    // modalen fanen UANSET — også når sessionen ikke kunne læses, og læreren så
    // blev sendt til en uændret fordeling lige efter fejlbeskeden.
    history.restoreSession(props.sessionId);
}

function formatGroupName(name) {
    return groupDisplayName(name);
}

// Members from loadSessionForPreview are { name, isGhost } objects.
// These helpers stay defensive in case a plain string ever slips through.
function getMemberName(m) {
    if (typeof m === 'object' && m !== null) return m.name || m.id || '';
    return String(m);
}

function isGhostMember(m) {
    return typeof m === 'object' && m !== null && m.isGhost === true;
}

// Fokus ind i vinduet ved åbning, fanget mens det er åbent, og tilbage
// til den knap der åbnede det ved luk — se useModalFocus.js.
const overlayRef = ref(null);
const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('close') });
</script>

<template>
  <div ref="overlayRef" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-forhaandsvis dlg-forhaandsvis-navn" @click.self="onBackdropClick">
    <div class="modal-content preview-modal">
      <button class="close-btn" aria-label="Luk" @click="$emit('close')">&times;</button>
      <!-- Titlen er kun etiketten. Sessionens navn står under i den
           skrivemåde, læreren selv gav det: beta sætter titler med
           store bogstaver, og "2.c samfundsfag" blev til "2.C SAMFUNDSFAG". -->
      <h2 style="margin-top:0;" id="dlg-forhaandsvis">Forhåndsvisning</h2>
      <p class="preview-name" id="dlg-forhaandsvis-navn">{{ sessionName }}</p>

      <div v-if="loadError" class="error-state">
        Kunne ikke indlæse sessionen.
      </div>

      <div v-else class="preview-body">
        <!-- Stamgrupper -->
        <div v-if="standardGroups.length > 0" class="section">
          <h3>Stamgrupper</h3>
          <div class="group-grid">
            <div v-for="g in standardGroups" :key="g.name" class="group-card">
              <div class="card-header">
                <h4>{{ formatGroupName(g.name) }}</h4>
                <span v-if="g.topic" class="topic-badge">{{ g.topic }}</span>
              </div>
              <ul>
                <li v-for="(m, i) in g.members" :key="getMemberName(m) + '-' + i">
                  <span>{{ getMemberName(m) }}</span>
                  <!-- Ghost = elev der ikke længere er i klassen -->
                  <span v-if="isGhostMember(m)" class="ghost-tag">(ikke i klassen)</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p v-else style="color: var(--text-muted); font-style:italic;">Ingen stamgrupper i denne session.</p>

        <!-- Matrixgrupper -->
        <div v-if="matrixGroups.length > 0" class="section">
          <h3>Matrix-grupper</h3>
          <div class="group-grid">
            <div v-for="g in matrixGroups" :key="g.name" class="group-card">
              <div class="card-header">
                <h4>{{ formatGroupName(g.name) }}</h4>
                <span v-if="g.topic" class="topic-badge">{{ g.topic }}</span>
              </div>
              <ul>
                <li v-for="(m, i) in g.members" :key="getMemberName(m) + '-' + i">
                  <span>{{ getMemberName(m) }}</span>
                  <!-- Ghost = elev der ikke længere er i klassen -->
                  <span v-if="isGhostMember(m)" class="ghost-tag">(ikke i klassen)</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn secondary" @click="$emit('close')">Luk</button>
        <button class="btn primary" @click="doRestore">Gendan denne session</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: var(--bg-modal-overlay); display: flex; justify-content: center; align-items: center;
  z-index: 2000; backdrop-filter: blur(6px);
}
.preview-modal {
  background: var(--bg-modal); backdrop-filter: var(--glass-blur-heavy); padding: 32px; border-radius: var(--radius-lg);
  width: 90vw; max-width: 1200px; max-height: 85vh;
  display: flex; flex-direction: column;
  position: relative; box-shadow: var(--shadow-float), var(--glass-inset);
  border: 1px solid var(--border-medium); color: var(--text-main);
}
.preview-name { margin: 0 0 16px; font-size: 16px; font-weight: 600; color: var(--text-heading, var(--text-main)); }
.preview-body {
  flex: 1; overflow-y: auto; padding: 10px;
  background: var(--bg-surface); border: 1px solid var(--border-medium); border-radius: 8px;
  margin-bottom: 20px;
}

.section { margin-bottom: 25px; }
.section h3 {
  border-bottom: 1px solid var(--border-medium); padding-bottom: 8px; margin-bottom: 12px;
}

.group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.group-card {
  background: var(--bg-surface); border: 1px solid var(--border-medium); border-radius: 8px;
  overflow: hidden;
}

.card-header {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--bg-surface); border-bottom: 1px solid var(--border-medium);
  padding: 6px 10px;
}

.card-header h4 {
  margin: 0; padding: 0; background: none; border: none;
  font-size: 0.85rem; font-weight: 600;
}

.topic-badge {
  font-size: 0.75rem; color: var(--text-muted); margin-left: auto;
  background: var(--bg-surface-hover); padding: 2px 6px; border-radius: 4px;
}

.group-card ul {
  list-style: none; padding: 4px 0; margin: 0;
}

.group-card li {
  padding: 2px 10px; font-size: 0.8rem; color: var(--text-main);
  display: flex; align-items: center;
}

.group-card li span {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Dæmpet "(ikke i klassen)" ved elever, der ikke findes i klassen længere (ingen emoji, jf. projektets regel) */
.ghost-tag {
  margin-left: 6px; font-size: 0.7rem; font-style: italic; color: var(--text-muted);
  flex-shrink: 0;
}

.error-state {
  color: var(--color-error); padding: 20px; text-align: center;
}

.actions { display: flex; justify-content: flex-end; gap: 10px; }
.btn { height: 34px; padding: 0 20px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; font-size: 12px; }
.btn.primary { background: var(--primary); color: white; }
.btn.primary:hover { background: var(--primary-hover); }
.btn.secondary { background: var(--bg-surface); color: var(--text-muted); }
.btn.secondary:hover { background: var(--bg-surface-hover); }
</style>
