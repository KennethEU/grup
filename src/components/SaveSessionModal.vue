<script setup>
import { ref, computed, onMounted } from 'vue';
import { useModalFocus } from '../composables/useModalFocus.js';
import * as history from '../js/modules/history.js';
import { reactiveState as state } from '../js/modules/reactiveState.js';

const emit = defineEmits(['close']);

const sessionName = ref('');
const sessionType = ref('standard');

// "Matrixgrupper" kan kun vælges, når der ER en matrix, og den passer til
// stamgrupperne. Før stod valget altid åbent: uden matrix kastede gemningen
// en fejl og vinduet blev bare stående, og med en forældet matrix blev den
// gemt med og kom senere tilbage som gyldig. saveCurrentSession() tjekker
// det samme — dér er beslutningen, her er det bare knappen.
//
// Flaget alene siger ikke, at der ER en gammel matrix: en stam-generering
// sætter det altid — også i en klasse, der aldrig har haft en. Uden tjekket
// fik den lærer at vide, at "matrixen er dannet ud fra dine forrige
// stamgrupper", om en matrix, der ikke fandtes.
const hasMatrix = computed(() =>
    Array.isArray(state.storedMatrixGroups) && state.storedMatrixGroups.length > 0);
const matrixStale = computed(() => hasMatrix.value && !!state.matrixGroupsStale);
const matrixAvailable = computed(() => hasMatrix.value && !state.matrixGroupsStale);

// Start med et standardnavn
onMounted(() => {
    const date = new Date().toLocaleDateString('da-DK', { day: 'numeric', month: 'long' });
    const className = state.currentClass ? state.currentClass.name : 'Session';
    sessionName.value = `${className} - ${date}`;
});

const save = () => {
    const name = sessionName.value.trim() || "Uden navn";
    const isMatrix = sessionType.value === 'matrix';

    // Giver null, når gemningen fejlede (fx fuldt lager) — så har history.js
    // allerede vist en fejlbesked, og vi må hverken melde succes eller gå til
    // en session, der ikke blev gemt.
    const saved = history.saveCurrentSession(name, isMatrix);
    if (!saved) {
        return;
    }

    // Gå til historik-fanen, så læreren kan se den gemte session. FØR
    // kvitteringen: et faneskift rydder de beskeder, der allerede står
    // (NotificationManager.vue), så kom kvitteringen først, forsvandt den
    // i samme øjeblik.
    state.classViewTab = 'history';

    if (window.notifySuccess) {
        window.notifySuccess(`Session "${name}" gemt i historikken!`);
    }

    emit('close');
};

// Fokus ind i vinduet ved åbning, fanget mens det er åbent, og tilbage
// til den knap der åbnede det ved luk — se useModalFocus.js.
const overlayRef = ref(null);
const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('close') });
</script>

<template>
  <div ref="overlayRef" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-gem-session" @click.self="onBackdropClick">
    <div class="modal-content">
      <button class="close-btn" aria-label="Luk" @click="$emit('close')">&times;</button>
      
      <h2 id="dlg-gem-session">Gem session</h2>
      
      <div class="form-group">
          <label for="gs-navn">Navn på session</label>
          <input
            id="gs-navn"
            v-model="sessionName"
            type="text"
            class="full-width"
            autofocus
          >
      </div>

      <div class="form-group">
          <!-- role=radiogroup + aria-labelledby: nu hører man spørgsmålet, når
               man lander på den første valgmulighed. En løs <label> uden en
               kontrol at pege på blev sprunget over. -->
          <p id="gs-type" class="field-heading">Hvilket hold grupper vil du gemme?</p>

          <div class="radio-group" role="radiogroup" aria-labelledby="gs-type">
              <label class="radio-option">
                  <input type="radio" name="sessionstype" v-model="sessionType" value="standard">
                  <span class="radio-label">
                      <strong>Stamgrupper</strong> (Runde 1)
                  </span>
              </label>

              <label class="radio-option" :class="{ disabled: !matrixAvailable }">
                  <input
                    type="radio"
                    name="sessionstype"
                    v-model="sessionType"
                    value="matrix"
                    :disabled="!matrixAvailable"
                    :aria-describedby="matrixAvailable ? null : 'gs-matrix-note'"
                  >
                  <span class="radio-label">
                      <strong>Matrixgrupper</strong> (Runde 2)
                      <span v-if="!matrixAvailable" id="gs-matrix-note" class="radio-note">
                          {{ matrixStale
                              ? 'Matrixen er dannet ud fra dine forrige stamgrupper. Åbn "Matrix", så dannes den forfra.'
                              : 'Der er ingen matrixgrupper endnu.' }}
                      </span>
                  </span>
              </label>
          </div>
      </div>

      <div class="actions">
          <button class="btn secondary" @click="$emit('close')">Annuller</button>
          <button class="btn primary" @click="save">Gem session</button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--bg-modal-overlay);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  backdrop-filter: blur(6px);
}

.modal-content {
  background: var(--bg-modal);
  backdrop-filter: var(--glass-blur-heavy);
  padding: 32px;
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 450px;
  position: relative;
  box-shadow: var(--shadow-float), var(--glass-inset);
  border: 1px solid var(--border-medium);
  color: var(--text-main);
}

h2 { margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: var(--text-heading); }

.form-group {
    margin-bottom: 16px;
}

.form-group > label,
.form-group > .field-heading {
    margin-block: 0;
    display: block;
    font-weight: 700;
    margin-bottom: 5px;
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.full-width {
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    box-sizing: border-box;
    background: var(--bg-select-option);
    color: var(--text-main);
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}
.full-width:hover { border-color: var(--primary); background: var(--bg-surface); }
.full-width:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary-light);
}

.radio-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.radio-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    cursor: pointer;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}

.radio-option:hover {
    background: var(--bg-select-option);
    border-color: var(--border-strong);
    box-shadow: var(--shadow-float);
}

.radio-option input[type="radio"] {
    accent-color: var(--primary);
    width: 15px;
    height: 15px;
}

.radio-label { font-size: 12px; font-weight: 600; color: var(--text-main); }
.radio-label strong { font-weight: 700; }

/* Et valg der ikke kan tages, skal se sådan ud — og sige hvorfor lige under. */
.radio-option.disabled { cursor: not-allowed; }
.radio-option.disabled:hover { background: var(--bg-surface); border-color: var(--border-subtle); box-shadow: none; }
.radio-option.disabled strong { opacity: 0.55; }
/* Appens label-stil sætter versaler og spærring på alt i en label — fint til
   "STAMGRUPPER", ulæseligt til en hel sætning. Forklaringen skrives normalt. */
.radio-note {
    display: block;
    margin-block-start: 2px;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.4;
    text-transform: none;
    letter-spacing: normal;
    color: var(--text-muted);
}

.actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
}

.btn {
    height: 34px;
    padding: 0 18px;
    border-radius: 8px;
    border: none;
    font-weight: 600;
    cursor: pointer;
    font-size: 12px;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}

.btn.primary { background: var(--primary); color: white; }
.btn.primary:hover { background: var(--primary-hover); }

.btn.secondary { background: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border-subtle); }
.btn.secondary:hover { background: var(--bg-select-option); color: var(--text-main); border-color: var(--border-strong); }
</style>
