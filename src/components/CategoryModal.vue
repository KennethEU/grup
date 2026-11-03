<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useModalFocus } from '../composables/useModalFocus.js';
import { reactiveState as state } from '../js/modules/reactiveState.js';
import { autoSave } from '../js/modules/classActions.js';
import { pushUndo, clearUndoHistory } from '../js/modules/state.js';
import { teacherColumns, canonicalSpellings, valueKey } from '../js/modules/utils.js';
import { validateColumnName } from '../js/modules/columnActions.js';

const emit = defineEmits(['close']);

const columns = ref([]);
const sourceCol = ref('');
const newColName = ref('');
// `values` er en LISTE af valgte celleværdier — ikke en kommasepareret streng.
//
// HVORFOR: feltet var før et fritekstfelt, hvor værdierne blev skilt ad på
// komma. En celleværdi der SELV indeholder et komma — "Hansen, Bo",
// "Ja, med støtte", karakteren "7,5" — blev derfor til to værdier, der ingen
// af dem findes i klassen, og kategorien ramte ingenting. Læreren fik ingen
// fejl; kolonnen blev bare fyldt med "Andet".
//
// Nu vælges værdierne blandt dem, der FAKTISK står i kildekolonnen. Så er
// kommaet aldrig et skilletegn, og hun kan heller ikke skrive forkert.
const mappings = ref([
    { id: Date.now(), values: [], label: '' }
]);

// Samme faldgrube som i "Gem som kolonne": et navn der allerede findes
// betyder at DEN kolonnes indhold bliver erstattet — og alt der ikke rammer
// en kategori, bliver til "Andet". Skrives kildekolonnens eget navn, er
// originalværdierne væk. Advarslen står mens navnet skrives.
const willOverwrite = computed(() => {
    const n = newColName.value.trim();
    return !!n && !!state.currentClass
        && Array.isArray(state.currentClass.columns)
        && state.currentClass.columns.includes(n);
});

onMounted(() => {
    if (state.currentClass && state.currentClass.columns) {
        columns.value = teacherColumns(state.currentClass.columns);
        // Udgangspunktet er første kolonne med få forskellige værdier (fx Køn).
        // Første kolonne er næsten altid Navn, og så blev reglernes valg til
        // alle elevernes navne — ubrugeligt som kategori. Findes ingen, står
        // vælgeren tom, og læreren vælger selv.
        sourceCol.value = pickDefaultSource(columns.value);
    }
});

const MAX_DEFAULT_VALUES = 8;
function pickDefaultSource(cols) {
    const rows = state.currentClass?.data;
    const idColumn = state.currentClass?.id_column;
    for (const col of cols) {
        if (col === idColumn) continue;
        const distinct = canonicalSpellings(rows, col).size;
        if (distinct >= 2 && distinct <= MAX_DEFAULT_VALUES) return col;
    }
    return '';
}

const addMapping = () => {
    mappings.value.push({ id: Date.now() + Math.random(), values: [], label: '' });
};

const removeMapping = (index) => {
    if (mappings.value.length > 1) {
        mappings.value.splice(index, 1);
    } else {
        // Ryd den sidste række i stedet for at fjerne den
        mappings.value[0].values = [];
        mappings.value[0].label = '';
    }
};

// Kildekolonnens værdier, som de FAKTISK står i klassen.
//
// Store og små bogstaver foldes sammen (samme greb som opskriftens værdi-valg), og
// den hyppigste stavemåde vinder — så "Dreng" og "dreng" er ét valg, ikke to.
// Tomme celler er ikke en kategori og står derfor ikke på listen.
const valueOptions = computed(() => {
    const rows = state.currentClass?.data;
    if (!sourceCol.value || !Array.isArray(rows)) return [];
    return [...canonicalSpellings(rows, sourceCol.value).values()]
        .sort((a, b) => a.localeCompare(b, 'da', { numeric: true }));
});

// Skifter læreren kildekolonne, peger de valgte værdier på en kolonne, der
// ikke er der mere. De ryddes — ellers ville "Opret kolonne" ramme ingenting,
// uden at noget på skærmen røbede hvorfor.
watch(sourceCol, () => {
    mappings.value.forEach(m => { m.values = []; });
});

/** Er værdien allerede brugt i en ANDEN regelrække? Så kan den ikke vælges her. */
function takenElsewhere(value, index) {
    return mappings.value.some((m, i) => i !== index && m.values.includes(value));
}

function toggleValue(map, index, value) {
    if (takenElsewhere(value, index)) return;
    const at = map.values.indexOf(value);
    if (at === -1) map.values.push(value);
    else map.values.splice(at, 1);
}

const apply = () => {
    const colName = newColName.value.trim();
    if (!state.currentClass) return;

    // Tom liste med vilje — se willOverwrite: en eksisterende kolonne er et
    // valg her, et tomt eller internt "_"-navn er en fejl.
    const check = validateColumnName(colName, []);
    if (!check.ok) {
        if (window.notifyInfo) window.notifyInfo(check.error);
        return;
    }

    if (!sourceCol.value) {
        window.notifyInfo?.('Vælg først den kolonne, du vil kategorisere efter.');
        return;
    }

    // En halvt udfyldt regelrække blev før sprunget stille over. Havde
    // læreren klikket værdierne, men glemt kategoriens navn, blev HELE
    // kolonnen "Andet" — med "oprettet!" som kvittering. Det er den samme
    // tavse fejl, som kommaet gav før 6/9. Nu siges det, før noget skrives.
    for (let i = 0; i < mappings.value.length; i++) {
        const m = mappings.value[i];
        const hasValues = m.values.length > 0;
        const label = m.label.trim();
        if (hasValues && !label) {
            window.notifyInfo?.(`Regel ${i + 1} mangler et navn på kategorien — skriv det i feltet efter pilen.`);
            return;
        }
        if (label && !hasValues) {
            window.notifyInfo?.(`Regel ${i + 1} har ingen værdier — klik de værdier, der skal hedde "${label}".`);
            return;
        }
    }

    // Regelrækkerne som små bogstaver, klar til sammenligning.
    const activeMappings = mappings.value
        .map(m => ({
            // Sammenligningen er stadig uden hensyn til store bogstaver:
            // listen viser ÉN stavemåde pr. værdi, men klassen kan have både
            // "Dreng" og "dreng" stående, og begge skal med.
            vals: m.values.map(valueKey).filter(Boolean),
            label: m.label.trim()
        }))
        .filter(m => m.label && m.vals.length > 0);

    if (activeMappings.length === 0) {
        window.notifyInfo?.('Klik mindst én værdi og skriv et navn på kategorien — ellers bliver hele kolonnen "Andet".');
        return;
    }

    // 1. Kolonnen oprettes, hvis den ikke findes.
    const overwriting = state.currentClass.columns.includes(colName);
    if (!overwriting) {
        state.currentClass.columns.push(colName);
        // Ny kolonne = skema-ændring. Fortryd-stakken indeholder rækker uden
        // den nøgle, og et Ctrl+Z bagefter ville tømme kolonnen for hele
        // klassen og ved næste gem fjerne den helt — se den samme forklaring
        // i SaveColumnModal.vue og i "+ Kolonne" i StudentToolbar.vue.
        clearUndoHistory();
    } else {
        // Overskrivning — skemaet er uændret, så fortryd kan bruges bagefter.
        pushUndo();
    }

    // 2. Hver elev får sin kategori.
    state.currentClass.data.forEach(student => {
        // valueKey: et tal 0 i cellen er en værdi, ikke en tom celle.
        const sourceVal = valueKey(student[sourceCol.value]);

        // En tom celle betyder "ikke udfyldt" — ikke en kategori (VIGTIGT
        // invariant, se docs/grupper.md). Den blev før til "Andet", og så
        // samlede Fordel og Klyng eleverne uden en værdi som en rigtig
        // kategori. Tom ind, tom ud.
        if (sourceVal === '') {
            student[colName] = '';
            return;
        }

        // Første regel, værdien står i, giver kategorien. Ramte ingen regel: "Andet".
        const hit = activeMappings.find(m => m.vals.includes(sourceVal));
        student[colName] = hit ? hit.label : "Andet";
    });

    if (window.notifySuccess) window.notifySuccess(overwriting
        ? `Kolonnen '${colName}' er overskrevet.`
        : `Kolonne '${colName}' oprettet!`);

    // 3. Gem og luk.
    autoSave();
    emit('close');
};

// Fokus ind i vinduet ved åbning, fanget mens det er åbent, og tilbage
// til den knap der åbnede det ved luk — se useModalFocus.js.
const overlayRef = ref(null);
const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('close') });
</script>

<template>
  <div ref="overlayRef" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-kategoriser" @click.self="onBackdropClick">
    <div class="modal-content">
      <button class="close-btn" aria-label="Luk" @click="$emit('close')">&times;</button>
      
      <h2 id="dlg-kategoriser">Kategorisér Data</h2>
      <p class="subtitle">Opret en ny kolonne baseret på værdier i en eksisterende.</p>
      
      <div class="row">
          <div class="form-group half">
              <label for="kat-kilde">Kildekolonne</label>
              <select id="kat-kilde" v-model="sourceCol" class="full-width">
                  <option value="" disabled>Vælg en kolonne</option>
                  <option v-for="col in columns" :key="col" :value="col">{{ col }}</option>
              </select>
          </div>

          <div class="form-group half">
              <label for="kat-navn">Ny kolonne navn</label>
              <input
                id="kat-navn"
                v-model="newColName"
                type="text"
                placeholder="F.eks. Niveau"
                class="full-width"
                autofocus
              >
          </div>
      </div>

      <div class="mappings-section">
          <!-- Overskrift, ikke etiket: en <label> uden en kontrol at pege på
               er tom luft for en skærmlæser. -->
          <p class="field-heading">Regler (Værdier &rarr; Ny Kategori)</p>
          <p class="field-hint">Klik de værdier, der skal samles under ét navn. Alt du ikke vælger, bliver til "Andet" — tomme celler forbliver tomme.</p>
          <div class="mapping-list">
              <div v-for="(map, index) in mappings" :key="map.id" class="mapping-row">
                  <div class="value-picker" role="group" :aria-label="`Regel ${index + 1}: værdier`">
                      <p v-if="!sourceCol" class="value-empty">
                        Vælg en kildekolonne, så vises dens værdier her.
                      </p>
                      <p v-else-if="valueOptions.length === 0" class="value-empty">
                        Der står ingen værdier i "{{ sourceCol }}".
                      </p>
                      <button
                        v-for="val in valueOptions"
                        :key="val"
                        type="button"
                        class="value-chip"
                        :class="{ picked: map.values.includes(val) }"
                        :disabled="takenElsewhere(val, index)"
                        :aria-pressed="map.values.includes(val)"
                        :title="takenElsewhere(val, index)
                            ? `\u201d${val}\u201d er allerede valgt i en anden regel`
                            : null"
                        @click="toggleValue(map, index, val)"
                      >{{ val }}</button>
                  </div>
                  <span class="arrow" aria-hidden="true">&rarr;</span>
                  <input
                    v-model="map.label"
                    type="text"
                    placeholder="Eks: Høj"
                    class="map-input label"
                    :aria-label="`Regel ${index + 1}: ny kategori`"
                  >
                  <!-- tabindex=-1 er fjernet: den gjorde knappen umulig at nå
                       uden mus, så en regelrække kunne kun tilføjes med
                       tastaturet — aldrig fjernes igen. -->
                  <button
                    class="btn-icon delete"
                    @click="removeMapping(index)"
                    :title="`Fjern regel ${index + 1}`"
                  >&times;</button>
              </div>
          </div>

          <button class="btn small dashed" @click="addMapping">+ Tilføj regel</button>
      </div>

      <p v-if="willOverwrite" class="overwrite-warning">
        Kolonnen "{{ newColName.trim() }}" findes allerede. Dens nuværende
        indhold bliver erstattet — værdier der ikke rammer en regel, bliver
        til "Andet".
      </p>

      <div class="actions">
          <button class="btn secondary" @click="$emit('close')">Annuller</button>
          <button class="btn primary" @click="apply">
            {{ willOverwrite ? `Overskriv "${newColName.trim()}"` : 'Opret kolonne' }}
          </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.overwrite-warning {
  margin: 0 0 12px 0; padding: 10px 12px; border-radius: 8px;
  background: var(--color-warning-bg); border: 1px solid var(--color-warning-border);
  color: var(--text-main); font-size: 12px; line-height: 1.5;
}
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
  max-width: 600px;
  position: relative;
  box-shadow: var(--shadow-float), var(--glass-inset);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-medium);
  color: var(--text-main);
}

/* ── Typografi ── */
h2 {
    margin: 0 0 2px 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-heading);
}

.subtitle {
    margin: 0 0 20px 0;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.4;
}

/* ── Formularens opbygning ── */
.row {
    display: flex;
    gap: 12px;
    margin-bottom: 14px;
}
.half { flex: 1; }

.form-group { margin-bottom: 0; }
.form-group label {
    display: block;
    font-weight: 700;
    margin-bottom: 5px;
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

/* ── Felter og rullelister ── */
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
.full-width:hover {
    border-color: var(--primary);
    background: var(--bg-surface);
}
.full-width:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary-light);
}

/* ── Oversættelserne ── */
.mappings-section {
    background: transparent;
    border: none;
    padding: 0;
    margin-bottom: 16px;
    overflow-y: auto;
    flex: 1;
}
.mappings-section > .field-heading {
    display: block;
    font-weight: 700;
    margin: 0 0 8px 0;
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}

.mapping-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
}

.map-input {
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    background: var(--bg-select-option);
    color: var(--text-main);
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}
.map-input:hover { border-color: var(--primary); background: var(--bg-surface); }
.map-input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary-light);
}
.map-input.label { flex: 1; }

/* ── Værdivælgeren ──
   Ruller, når kolonnen har mange værdier: en klasseliste kan have 28
   forskellige navne, og de må ikke skubbe knapperne ud af vinduet. */
.value-picker {
    flex: 2;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 4px;
    min-height: 34px;
    max-height: 96px;
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--bg-select-option);
}

.value-chip {
    border: 1px solid var(--border-subtle);
    background: var(--bg-surface);
    color: var(--text-main);
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition-property: var(--ctl-transition);
    transition-duration: 0.15s;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.value-chip:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.value-chip.picked {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
}
.value-chip:disabled { opacity: 0.35; cursor: not-allowed; }
.value-chip:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--primary-light);
}

.value-empty {
    margin: 0;
    padding: 4px 6px;
    font-size: 11px;
    color: var(--text-muted);
}

.field-hint {
    margin: -4px 0 8px 0;
    font-size: 11px;
    color: var(--text-muted);
}

.arrow {
    color: var(--text-subtle);
    opacity: 0.5;
    font-size: 13px;
    font-weight: 800;
    flex-shrink: 0;
    -webkit-user-select: none;
    user-select: none;
}

.btn-icon.delete {
    background: transparent;
    border: none;
    color: var(--text-subtle);
    font-size: 1rem;
    cursor: pointer;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    flex-shrink: 0;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}
.btn-icon.delete:hover {
    background: color-mix(in oklch, var(--color-error) 10%, transparent);
    color: var(--color-error);
}

.btn.dashed {
    background: none;
    border: none;
    color: var(--text-muted);
    width: 100%;
    margin-top: 2px;
    font-size: 11px;
    font-weight: 600;
    padding: 6px;
    border-radius: 8px;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}
.btn.dashed:hover {
    color: var(--primary);
    background: var(--primary-light);
}

/* ── Knapperne ── */
.actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: auto;
    padding-top: 4px;
}

.btn {
    height: 34px;
    padding: 0 18px;
    border-radius: 8px;
    border: none;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    transition-property: var(--ctl-transition);
    transition-duration: 0.2s;
}
.btn.primary { background: var(--primary); color: white; }
.btn.primary:hover { background: var(--primary-hover); }
.btn.secondary { background: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border-subtle); }
.btn.secondary:hover { background: var(--bg-select-option); color: var(--text-main); border-color: var(--border-strong); }

</style>
