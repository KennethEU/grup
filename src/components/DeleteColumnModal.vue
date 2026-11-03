<script setup>
import { ref, computed } from 'vue';
import { useModalFocus } from '../composables/useModalFocus.js';
import { reactiveState as state } from '../js/modules/reactiveState.js';
import { autoSave } from '../js/modules/classActions.js';
import { clearUndoHistory } from '../js/modules/state.js';
import { teacherColumns } from '../js/modules/utils.js';
import { deleteColumn } from '../js/modules/columnActions.js';

const emit = defineEmits(['close']);

const selectedCol = ref('');

// Kolonnerne læreren selv har lavet — de interne felter (ét underscore) er
// ikke hendes og står ikke i menuen.
const columns = computed(() => teacherColumns(state.currentClass?.columns));

function confirmDelete() {
    const colName = selectedCol.value;
    if (!colName) return;

    // Selve indgrebet ligger i deleteColumn() i columnActions.js, hvor det er
    // dækket af unit-tests — sammen med omdøbning og flytning. Et kolonnenavn
    // står syv steder, og de tre operationer skal rydde op på de samme.
    const res = deleteColumn(state.currentClass, state, colName);
    if (!res.ok) {
        window.notifyError?.(res.error);
        return;   // vinduet bliver stående, så læreren kan vælge en anden
    }

    // Fortryd-stakken holder rækker MED den slettede kolonne. Lagt
    // tilbage ville de genoplive et felt, `columns` ikke længere nævner —
    // usynligt i tabellen, men med i alt hvad der læser rækkerne.
    clearUndoHistory();

    autoSave();

    if (res.displayMoved) {
        window.notifyInfo?.(
            `"${colName}" blev vist i grupperne. Visningen er nu flyttet til "${res.displayMoved}" — ` +
            `du kan vælge en anden under "Vis:" i elevlisten.`
        );
    }

    if (res.rulesRemoved > 0) {
        window.notifyInfo?.(
            `Kolonnen "${colName}" blev slettet. ${res.rulesRemoved} regel${res.rulesRemoved === 1 ? '' : 'er'} ` +
            `der brugte kolonnen blev også fjernet.`
        );
    }

    emit('close');
}

// Fokus ind i vinduet ved åbning, fanget mens det er åbent, og tilbage
// til den knap der åbnede det ved luk — se useModalFocus.js.
const overlayRef = ref(null);
const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('close') });
</script>

<template>
  <div ref="overlayRef" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-slet-kolonne" @click.self="onBackdropClick">
    <div class="modal-content">
      <button class="close-btn" aria-label="Luk" @click="$emit('close')">&times;</button>
      <h2 id="dlg-slet-kolonne">Slet kolonne</h2>

      <div class="form-group">
        <label for="slet-kol">Kolonne</label>
        <select id="slet-kol" v-model="selectedCol" class="full-width">
          <option value="" disabled>Vælg en kolonne</option>
          <option v-for="col in columns" :key="col" :value="col">{{ col }}</option>
        </select>
      </div>

      <div class="actions">
        <button class="btn secondary" @click="$emit('close')">Annuller</button>
        <button class="btn danger" :disabled="!selectedCol" @click="confirmDelete">Slet kolonne</button>
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
.modal-content {
  background: var(--bg-modal); backdrop-filter: var(--glass-blur-heavy); padding: 32px; border-radius: 16px; width: 90%; max-width: 450px;
  position: relative; box-shadow: var(--shadow-float), var(--glass-inset);
  border: 1px solid var(--border-medium); color: var(--text-main);
}
h2 { margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: var(--text-heading); }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-weight: 700; margin-bottom: 5px; color: var(--text-muted); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; }
.full-width {
  width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--border-subtle); border-radius: 8px;
  font-size: 12px; font-weight: 600; box-sizing: border-box; background: var(--bg-select-option); color: var(--text-main);
  transition-property: var(--ctl-transition);
  transition-duration: 0.2s;
}
.full-width:hover { border-color: var(--primary); background: var(--bg-surface); }
.full-width:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.btn { height: 34px; padding: 0 18px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; font-size: 12px; transition-property: var(--ctl-transition); transition-duration: 0.2s; }
.btn.danger { background: var(--color-error); color: white; }
.btn.danger:hover { background: var(--color-error); filter: brightness(0.9); }
.btn.secondary { background: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border-subtle); }
.btn.secondary:hover { background: var(--bg-select-option); color: var(--text-main); border-color: var(--border-strong); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
