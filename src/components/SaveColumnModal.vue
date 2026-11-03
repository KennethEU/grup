<script setup>
import { ref, computed, onMounted } from 'vue';
import { useModalFocus } from '../composables/useModalFocus.js';
import { UI_NAMES } from '../js/modules/beta.js';
import { reactiveState as state } from '../js/modules/reactiveState.js';
import { autoSave } from '../js/modules/classActions.js';
import { getTopic } from '../js/modules/storage.js';
import { pushUndo, clearUndoHistory } from '../js/modules/state.js';
import { validateColumnName } from '../js/modules/columnActions.js';
import { groupDisplayName } from '../js/modules/utils.js';

const emit = defineEmits(['close']);

const colName = ref('');
const format = ref('name');

// Skriver vi oven i en kolonne der allerede findes? Så bliver DENS indhold
// erstattet af gruppenavne — også for de elever der ikke er i nogen gruppe
// (de får en tom celle). Skriver læreren "Navn", er hele klasselisten væk.
// Advarslen står mens navnet skrives, og knappen skifter tekst, så et klik
// er et valg og ikke en overraskelse.
const willOverwrite = computed(() => {
    const n = colName.value.trim();
    return !!n && !!state.currentClass
        && Array.isArray(state.currentClass.columns)
        && state.currentClass.columns.includes(n);
});

// Grupperne tages fra den fane der er FREMME, ikke fra lastGeneratedGroups.
// Den sidste kan være forældet, hvis læreren har skiftet fane uden at danne
// grupper igen — og så ville kolonnen gemme en anden fordeling end den, hun
// står og kigger på.
const isMatrix = computed(() => state.activeView === 'matrix');
const topicPrefix = computed(() => isMatrix.value ? 'M_' : 'S_');
const sourceGroups = computed(() => {
    return isMatrix.value
        ? (state.storedMatrixGroups || [])
        : (state.storedStandardGroups || []);
});

function resolveGroupTopic(g) {
    const stored = getTopic(g.name, topicPrefix.value);
    if (stored && stored.trim().length > 0 && stored !== 'MATRIX') return stored.trim();
    if (g.topic && g.topic.trim().length > 0 && g.topic !== 'MATRIX') return g.topic.trim();
    return null;
}

// Er der emner, der er værd at tilbyde som format? Matrixgrupper har som
// regel pladsholderen 'MATRIX' som emne, og den sorterer resolveGroupTopic
// fra — så svaret bliver af sig selv nej, og vinduet falder tilbage til det
// enkle flow med kun et navn.
const exampleGroup = computed(() => {
    return sourceGroups.value.find(g => resolveGroupTopic(g) !== null) || null;
});
const hasTopics = computed(() => exampleGroup.value !== null);

const exampleName = computed(() => {
    if (!exampleGroup.value) return 'Gruppe 1';
    return groupDisplayName(exampleGroup.value.name);
});

const exampleTopic = computed(() => {
    if (!exampleGroup.value) return '';
    return resolveGroupTopic(exampleGroup.value) || '';
});

onMounted(() => {
    colName.value = isMatrix.value ? 'Matrix Runde' : 'Stamgrupper';
    format.value = 'name';
});

function save() {
    const name = colName.value.trim();
    if (!state.currentClass) return;

    // Tom liste med vilje: en kolonne der allerede findes er IKKE en fejl her
    // (det er en bevidst overskrivning, se willOverwrite) — men et tomt navn
    // og et internt "_"-navn er.
    const check = validateColumnName(name, []);
    if (!check.ok) {
        if (window.notifyInfo) window.notifyInfo(check.error);
        return;
    }
    const groups = sourceGroups.value;
    if (!groups || groups.length === 0) {
        if (window.notifyInfo) window.notifyInfo(
            isMatrix.value
                ? `Tryk ${UI_NAMES.generateMatrix} først, så der er matrixgrupper at gemme.`
                : `Tryk ${UI_NAMES.generate} først, så der er stamgrupper at gemme.`
        );
        return;
    }

    // Ny kolonne, hvis navnet ikke findes i forvejen.
    if (!state.currentClass.columns.includes(name)) {
        state.currentClass.columns.push(name);
        // Skemaet ændrer sig: fra nu af har hver elevrække en nøgle mere.
        // Snapshottene på fortryd-stakken er taget FØR kolonnen fandtes, og
        // et Ctrl+Z ville lægge rækker tilbage uden den — mens `columns`
        // stadig nævner den. Kolonnen ville stå tom for hele klassen, og ved
        // næste gem forsvinde helt (updateClass udleder `columns` af
        // nøglerne i data[0]). Læreren ville altså miste den kolonne hun lige
        // gemte, ved at fortryde noget helt andet. Samme regel som
        // "+ Kolonne" i elevlistens værktøjslinje: skema-ændring nulstiller.
        clearUndoHistory();
    } else {
        // Overskrivning: læg det gamle indhold på fortryd-stakken først.
        // Skemaet ændrer sig ikke (kolonnen findes allerede), så et Ctrl+Z
        // i elevlisten lægger værdierne tilbage.
        pushUndo();
    }

    // Kortet fra medlem til værdi.
    // Object.create(null): nøglerne er medlems-id'er, men i grupper gemt før
    // _rowId fandtes er de elevNAVNE. På et almindeligt objekt svarer et
    // opslag på en nøgle der IKKE findes med en arvet funktion — så en elev
    // der ikke stod i nogen gruppe fik `map[navn]` til at være sand, og
    // maskinkode blev skrevet ind i hendes celle i elevlisten.
    const map = Object.create(null);
    groups.forEach(g => {
        const baseName = groupDisplayName(g.name);
        const topic = resolveGroupTopic(g);

        let finalValue = baseName;
        if (format.value === 'topic' && topic) {
            finalValue = topic;
        } else if (format.value === 'name_topic' && topic) {
            finalValue = `${baseName} - ${topic}`;
        }

        g.members.forEach(m => {
            const memberId = (typeof m === 'object' && m !== null) ? (m.id || m.name || '') : m;
            map[String(memberId).trim()] = finalValue;
        });
    });

    // Elevens identitet. state.idColumn er '_rowId'; faldet tilbage på
    // første kolonne dækker klasser gemt før identiteten blev skilt ud.
    const idCol = state.idColumn
        || (state.currentClass.columns && state.currentClass.columns[0]) || '';

    state.currentClass.data.forEach(s => {
        const id = s[idCol];
        if (id && map[String(id).trim()]) {
            s[name] = map[String(id).trim()];
        } else {
            s[name] = '';
        }
    });

    autoSave();
    if (window.notifySuccess) window.notifySuccess(`Kolonne '${name}' gemt!`);
    emit('close');
}

// Fokus ind i vinduet ved åbning, fanget mens det er åbent, og tilbage
// til den knap der åbnede det ved luk — se useModalFocus.js.
const overlayRef = ref(null);
const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('close') });
</script>

<template>
  <div ref="overlayRef" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-gem-kolonne" @click.self="onBackdropClick">
    <div class="modal-content" style="max-width: 500px;">
      <button class="close-btn" aria-label="Luk" @click="$emit('close')">&times;</button>
      <h2 id="dlg-gem-kolonne">Gem som kolonne</h2>

      <div class="form-group">
        <label for="gk-navn">Navn på ny kolonne</label>
        <input id="gk-navn" v-model="colName" type="text" class="full-width" placeholder="Runde 2" autofocus>
      </div>

      <div v-if="hasTopics" class="format-section" role="radiogroup" aria-labelledby="gk-format">
        <p id="gk-format" class="format-label">Vælg format for værdier:</p>

        <label class="radio-option">
          <input type="radio" name="kolonneformat" v-model="format" value="name">
          <span><strong>{{ exampleName }}</strong> (Kun navn)</span>
        </label>

        <label class="radio-option">
          <input type="radio" name="kolonneformat" v-model="format" value="name_topic">
          <span><strong>{{ exampleName }} - {{ exampleTopic }}</strong> (Navn + Emne)</span>
        </label>

        <label class="radio-option">
          <input type="radio" name="kolonneformat" v-model="format" value="topic">
          <span><strong>{{ exampleTopic }}</strong> (Kun emne)</span>
        </label>
      </div>

      <p v-if="willOverwrite" class="overwrite-warning">
        Kolonnen "{{ colName.trim() }}" findes allerede. Dens nuværende indhold
        bliver erstattet af gruppenavnene — elever uden gruppe får en tom celle.
      </p>

      <div class="modal-single-action">
        <button class="btn secondary" @click="$emit('close')">Annuller</button>
        <button class="btn primary full-width" @click="save">
          {{ willOverwrite ? `Overskriv "${colName.trim()}"` : 'Gem kolonne' }}
        </button>
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
h2 { margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: var(--text-heading); }
.overwrite-warning {
  margin: 0 0 12px 0; padding: 10px 12px; border-radius: 8px;
  background: var(--color-warning-bg); border: 1px solid var(--color-warning-border);
  color: var(--text-main); font-size: 12px; line-height: 1.5;
}
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
.format-section { margin-bottom: 16px; }
.format-label { display: block; margin-block-start: 0; margin-bottom: 6px; font-weight: 700; color: var(--text-muted); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; }
.radio-option {
  display: flex; align-items: center; gap: 10px; margin-bottom: 6px; cursor: pointer;
  padding: 8px 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 8px;
  transition-property: var(--ctl-transition);
  transition-duration: 0.2s;
}
.radio-option:hover { background: var(--bg-select-option); border-color: var(--border-strong); box-shadow: var(--shadow-float); }
.radio-option input[type="radio"] { accent-color: var(--primary); width: 15px; height: 15px; }
.radio-option span { font-size: 12px; font-weight: 600; color: var(--text-main); }
.btn { height: 34px; padding: 0 18px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; font-size: 12px; transition-property: var(--ctl-transition); transition-duration: 0.2s; }
.btn.primary { background: var(--primary); color: white; }
.btn.primary:hover { background: var(--primary-hover); }
/* Annuller står ved siden af hovedknappen: lille og stille, mens hovedknappen
   tager resten af bredden. (I beta overtager vinduer.css bunden.) */
.modal-single-action { display: flex; align-items: center; gap: 8px; }
.modal-single-action .btn.primary { flex: 1; width: auto; }
</style>
