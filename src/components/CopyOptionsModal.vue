<script setup>
import { ref } from 'vue';
import { useModalFocus } from '../composables/useModalFocus.js';
import { reactiveState as state } from '../js/modules/reactiveState.js';
import { buildGroupsClipboardText, writeGroupsToClipboard } from '../js/modules/groupActions.js';

const emit = defineEmits(['close']);

const includeSource = ref(false);

function executeCopy() {
    // Teksten bygges af den DELTE funktion, så matrix-kopien viser de samme
    // navne som stamgruppe-kopien og gruppekortene.
    const text = buildGroupsClipboardText(
        state.activeView === 'matrix',
        includeSource.value
    );

    if (text === null) {
        if (window.notifyInfo) window.notifyInfo('Ingen grupper at kopiere.');
        emit('close');
        return;
    }

    writeGroupsToClipboard(text).then(ok => {
        // Modalen bliver stående ved fejl, så læreren kan prøve igen.
        if (ok) emit('close');
    });
}

// Fokus ind i vinduet ved åbning, fanget mens det er åbent, og tilbage
// til den knap der åbnede det ved luk — se useModalFocus.js.
const overlayRef = ref(null);
const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('close') });
</script>

<template>
  <div ref="overlayRef" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-kopier" @click.self="onBackdropClick">
    <div class="modal-content" style="max-width: 450px;">
      <button class="close-btn" aria-label="Luk" @click="$emit('close')">&times;</button>

      <h2 id="dlg-kopier">Kopieringsindstillinger</h2>

      <p class="subtitle">Hvordan vil du kopiere navnene?</p>

      <div class="option-box">
        <label class="checkbox-label">
          <input type="checkbox" v-model="includeSource">
          <span class="checkbox-text">Inkludér kilde i parentes</span>
        </label>
        <div class="option-hint">
          F.eks.: "Peter (Grp 1 - Biologi)" i stedet for bare "Peter"
        </div>
      </div>

      <div class="actions">
        <button class="btn secondary" @click="$emit('close')">Annuller</button>
        <!-- autofocus: useModalFocus fokuserer ellers det første element, luk-krydset, og
             det fik en kraftig fokusring ved åbning. Hovedhandlingen er det naturlige sted. -->
        <button class="btn primary" autofocus @click="executeCopy">Kopiér nu</button>
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
  background: var(--bg-modal); backdrop-filter: var(--glass-blur-heavy); padding: 32px; border-radius: var(--radius-lg); width: 90%;
  position: relative; box-shadow: var(--shadow-float), var(--glass-inset);
  border: 1px solid var(--border-medium); color: var(--text-main);
}
h2 { margin: 0 0 2px 0; font-size: 16px; font-weight: 700; color: var(--text-heading); }
.subtitle { margin: 0 0 16px 0; color: var(--text-muted); font-size: 12px; }
.option-box {
  margin-bottom: 20px; padding: 10px 14px; background: var(--bg-surface);
  border-radius: 8px; border: 1px solid var(--border-subtle); transition-property: var(--ctl-transition); transition-duration: 0.2s;
}
.option-box:hover { background: var(--bg-select-option); border-color: var(--border-strong); box-shadow: var(--shadow-float); }
.checkbox-label { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.checkbox-label input[type="checkbox"] { width: 15px; height: 15px; accent-color: var(--primary); }
.checkbox-text { font-weight: 600; font-size: 12px; color: var(--text-main); }
.option-hint { margin-left: 25px; margin-top: 4px; font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.btn { height: 34px; padding: 0 18px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; font-size: 12px; transition-property: var(--ctl-transition); transition-duration: 0.2s; }
.btn.primary { background: var(--primary); color: white; }
.btn.primary:hover { background: var(--primary-hover); }
.btn.secondary { background: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border-subtle); }
.btn.secondary:hover { background: var(--bg-select-option); color: var(--text-main); border-color: var(--border-strong); }
</style>
