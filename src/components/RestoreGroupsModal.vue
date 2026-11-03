<script setup>
// Gendan grupper — to indgange, én forhåndsvisning, én anvend-knap.
//
// Al logikken bor i restoreGroups.js, hvor den er dækket af unit-tests.
// Det her vindue tegner planen og lader læreren rette de steder, hvor
// programmet ikke må gætte: et navn der passer på to elever, og et navn der
// ikke findes i klassen.
import { ref, computed, watch, onMounted } from 'vue';
import { useModalFocus } from '../composables/useModalFocus.js';
import { reactiveState as state } from '../js/modules/reactiveState.js';
import { memberDisplayName } from '../js/modules/utils.js';
import * as rg from '../js/modules/restoreGroups.js';

const props = defineProps({
    startTab: { type: String, default: 'text' }
});
const emit = defineEmits(['close']);

const tab = ref('text');
const rawText = ref('');
const textError = ref('');
const orphans = ref([]);
const column = ref('');
const markAbsent = ref(true);

// Grupperne som de er slået op i klassen. Items redigeres direkte herfra
// (rowId og action), og planen nedenfor regner sig selv om.
const resolution = ref(null);

const data = computed(() => state.currentClass?.data || []);
const displayColumn = computed(() =>
    state.displayColumn || state.currentClass?.columns?.[0] || '');

// ── Fane 2: kandidatkolonnerne ──
const candidates = computed(() =>
    rg.candidateColumns(data.value, state.currentClass?.columns || [], displayColumn.value));
const selectedCandidate = computed(() =>
    candidates.value.find(c => c.column === column.value) || null);

// ── Planen ──
const plan = computed(() => {
    if (!resolution.value) return null;
    return rg.buildPlan({
        groups: resolution.value.groups,
        data: data.value,
        displayColumn: displayColumn.value,
        markAbsent: markAbsent.value,
        existingGroups: state.storedStandardGroups || [],
        classTopics: state.currentClass?.topics || []
    });
});

const nameOf = (rowId) => memberDisplayName(rowId, data.value, displayColumn.value);

const ambiguousItems = computed(() => flatten(it => it.status === 'ambiguous'));
const unmatchedItems = computed(() => flatten(it => it.status === 'unmatched'));

function flatten(pred) {
    if (!resolution.value) return [];
    const out = [];
    resolution.value.groups.forEach(g => {
        (g.items || []).forEach(it => { if (pred(it)) out.push({ it, groupNo: g.number }); });
    });
    return out;
}

const absentNames = computed(() => (plan.value?.willBeAbsent || []).map(nameOf));
const presentNames = computed(() => (plan.value?.willBePresent || []).map(nameOf));
// Står på listen med "(fraværende)" — placeres i gruppen, men forbliver væk.
const stayAbsentNames = computed(() => (plan.value?.willStayAbsent || []).map(nameOf));

const canRestore = computed(() => !!plan.value && plan.value.blocking.length === 0);

// ── Læs kilden ──

function readText() {
    orphans.value = [];
    const res = rg.parseGroupsText(rawText.value);
    if (res.error) {
        textError.value = res.error;
        resolution.value = null;
        return;
    }
    textError.value = '';
    orphans.value = res.orphans;
    resolution.value = rg.resolveTextGroups(res.groups, data.value, displayColumn.value);
}

function readColumn() {
    if (!column.value) { resolution.value = null; return; }
    resolution.value = rg.parseGroupsColumn(column.value, data.value);
}

// Kun når kolonne-fanen faktisk er fremme. Uden vagten læste `onMounted`s
// forvalg af kolonnen en hel forhåndsvisning frem, mens læreren stod på
// tekst-fanen med et tomt felt — og der stod "2 grupper med 28 elever",
// fordi den bedste kandidat tilfældigvis var en kategori-kolonne.
watch(column, () => { if (tab.value === 'column') readColumn(); });

watch(tab, (t) => {
    resolution.value = null;
    textError.value = '';
    orphans.value = [];
    if (t === 'column') readColumn();
});

// Skriver læreren videre i feltet, passer den gamle oplæsning ikke længere.
watch(rawText, () => {
    if (tab.value === 'text' && resolution.value) resolution.value = null;
});

function restore() {
    if (!canRestore.value) return;
    if (rg.applyPlan(plan.value)) emit('close');
}

onMounted(() => {
    if (!state.currentClass) { emit('close'); return; }
    column.value = rg.bestCandidateColumn(candidates.value);
    tab.value = props.startTab === 'column' && candidates.value.length > 0 ? 'column' : 'text';
    if (tab.value === 'column') readColumn();
});

const overlayRef = ref(null);
const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('close') });
</script>

<template>
  <div ref="overlayRef" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-restore" @click.self="onBackdropClick">
    <div class="modal-content">
      <button class="close-btn" aria-label="Luk" @click="$emit('close')">&times;</button>

      <h2 id="dlg-restore">Gendan grupper</h2>
      <p class="subtitle">
        Hent en gruppeopdeling du har brugt før — enten fra en liste du har
        kopieret, eller fra en kolonne du har gemt i elevlisten.
      </p>

      <!-- aria-pressed: hvilken af de to kilder der er valgt, lå kun i farven. -->
      <div class="tabs" role="group" aria-label="Hent grupperne fra">
        <button :class="{ active: tab === 'text' }" :aria-pressed="tab === 'text'" @click="tab = 'text'">Fra tekst</button>
        <button :class="{ active: tab === 'column' }" :aria-pressed="tab === 'column'" @click="tab = 'column'">Fra kolonne</button>
      </div>

      <div class="scroll-body">
        <!-- ── Trin 1: kilden ── -->
        <div v-if="tab === 'text'" class="form-group">
          <label for="rg-text">Indsæt listen</label>
          <textarea id="rg-text" v-model="rawText" class="paste-area" rows="8"
                    placeholder="Gruppe 1&#10;Emma Hansen&#10;Oliver Nielsen&#10;&#10;Gruppe 2&#10;Ida Pedersen"></textarea>
          <p v-if="textError" class="error-box">{{ textError }}</p>
          <button class="btn ghost read-list-btn" @click="readText" :disabled="!rawText.trim()">Læs listen</button>
        </div>

        <div v-else class="form-group">
          <label for="rg-col">Kolonne</label>
          <select v-if="candidates.length" id="rg-col" v-model="column" class="full-width">
            <option v-for="c in candidates" :key="c.column" :value="c.column">
              {{ c.column }} — {{ c.groups }} grupper, {{ c.students }} elever ({{ c.sample.join(', ') }} …)
            </option>
          </select>
          <p v-if="selectedCandidate && selectedCandidate.blank > 0" class="section-note">
            {{ selectedCandidate.blank }}
            {{ selectedCandidate.blank === 1 ? 'elev har' : 'elever har' }} en tom celle i
            "{{ column }}" og kommer ikke i nogen gruppe.
          </p>
          <p v-if="!candidates.length" class="note">
            Ingen af kolonnerne i elevlisten ligner en gruppekolonne. Gem en
            gruppeopdeling med "Gem som kolonne" først.
          </p>
        </div>

        <!-- ── Trin 2: forhåndsvisningen ── -->
        <template v-if="plan">
          <div class="preview-head">
            <strong>{{ plan.groups.length }}</strong>
            {{ plan.groups.length === 1 ? 'gruppe' : 'grupper' }} med
            <strong>{{ plan.memberCount }}</strong>
            {{ plan.memberCount === 1 ? 'elev' : 'elever' }}.
            <template v-if="plan.replaces.count > 0">
              {{ plan.replaces.count }} nuværende
              {{ plan.replaces.count === 1 ? 'gruppe' : 'grupper' }} erstattes<template
                v-if="plan.replaces.lockedNames.length">
                — heraf {{ plan.replaces.lockedNames.length === 1 ? 'én låst' : 'låste' }}:
                {{ plan.replaces.lockedNames.join(', ') }}</template>.
            </template>
          </div>

          <p v-if="plan.newTopics.length" class="note">
            {{ plan.newTopics.length === 1 ? 'Emnet' : 'Emnerne' }}
            "{{ plan.newTopics.join('", "') }}" tilføjes til klassens emneliste.
            Så tæller de med, når antallet af grupper regnes ud næste gang.
          </p>

          <p v-if="plan.mostlyUnknown" class="error-box">
            {{ plan.newStudents.length }} af {{ plan.memberCount }} navne står
            ikke i "{{ state.currentClass?.filename }}". Er det den rigtige
            klasse? Trykker du videre, oprettes de som nye elever, og resten af
            klassen markeres fraværende.
          </p>

          <p v-if="plan.mergedNumbers.length" class="note">
            {{ plan.mergedNumbers.length === 1 ? 'Gruppe' : 'Grupperne' }}
            {{ plan.mergedNumbers.join(', ') }} stod mere end ét sted i listen
            og er slået sammen.
          </p>

          <p v-if="plan.emptyGroups.length" class="note">
            {{ plan.emptyGroups.length === 1 ? 'Gruppe' : 'Grupperne' }}
            {{ plan.emptyGroups.join(', ') }} står på listen uden elever og bliver
            {{ plan.emptyGroups.length === 1 ? 'et tomt kort' : 'tomme kort' }}.
          </p>

          <p v-if="orphans.length" class="note">
            {{ orphans.length }} {{ orphans.length === 1 ? 'linje stod' : 'linjer stod' }}
            før den første gruppeoverskrift og kom ikke med:
            {{ orphans.slice(0, 3).join(', ') }}<span v-if="orphans.length > 3"> …</span>
          </p>

          <!-- Hvem er hvem? Programmet gætter aldrig her. -->
          <section v-if="ambiguousItems.length" class="section">
            <p class="field-heading">Hvem er hvem?</p>
            <p class="section-note">
              Navnet passer på flere elever. Vælg hvem det er — programmet må ikke gætte.
            </p>
            <div v-for="(row, i) in ambiguousItems" :key="'amb' + i" class="row">
              <div class="row-name">{{ row.it.raw }} <span class="muted">· Gruppe {{ row.groupNo }}</span></div>
              <select v-model="row.it.rowId" class="full-width" :aria-label="`Hvilken elev er \u201d${row.it.raw}\u201d?`" :disabled="row.it.action === 'skip'">
                <option :value="null">Vælg elev …</option>
                <option v-for="c in row.it.candidates" :key="c.rowId" :value="c.rowId">
                  {{ c.label }} ({{ c.rowId }})
                </option>
              </select>
              <!-- Uden den her var knappen død for altid, hvis ingen af de to
                   elever var den rigtige. -->
              <label class="choice skip-line">
                <input type="checkbox"
                       :checked="row.it.action === 'skip'"
                       @change="row.it.action = $event.target.checked ? 'skip' : 'bind'">
                <span>Spring navnet over</span>
              </label>
            </div>
          </section>

          <!-- Navne der ikke findes i klassen -->
          <section v-if="unmatchedItems.length" class="section">
            <p class="field-heading">Se efter her</p>
            <p class="section-note">
              De her navne står ikke i klassen. En ny elev får kun sit navn —
              de øvrige kolonner er tomme, og reglerne kan ikke måle på eleven.
            </p>
            <div v-for="(row, i) in unmatchedItems" :key="'unm' + i" class="row">
              <div class="row-name">{{ row.it.raw }} <span class="muted">· Gruppe {{ row.groupNo }}</span></div>
              <div class="choices">
                <label v-if="row.it.suggestion" class="choice">
                  <input type="radio" :name="'ukendt-' + i" :value="'bind'" v-model="row.it.action">
                  <span>Er det <strong>{{ row.it.suggestion.label }}</strong>?</span>
                </label>
                <label class="choice">
                  <input type="radio" :name="'ukendt-' + i" :value="'add'" v-model="row.it.action">
                  <span>Tilføj som ny elev</span>
                </label>
                <label class="choice">
                  <input type="radio" :name="'ukendt-' + i" :value="'skip'" v-model="row.it.action">
                  <span>Spring over</span>
                </label>
              </div>
            </div>
          </section>

          <!-- Fravær -->
          <section class="section">
            <p class="field-heading">Fravær</p>
            <label class="checkline">
              <input type="checkbox" v-model="markAbsent">
              <span>
                Markér de elever der ikke står på listen som fraværende
                <template v-if="absentNames.length">({{ absentNames.length }})</template>
              </span>
            </label>
            <p v-if="markAbsent && absentNames.length" class="section-note">
              {{ absentNames.join(', ') }}
            </p>
            <p v-if="markAbsent && presentNames.length" class="section-note">
              {{ presentNames.length }}
              {{ presentNames.length === 1 ? 'elev der stod fraværende, sættes' : 'elever der stod fraværende, sættes' }}
              til stede: {{ presentNames.join(', ') }}
            </p>
            <p v-if="markAbsent && stayAbsentNames.length" class="section-note">
              {{ stayAbsentNames.length }}
              {{ stayAbsentNames.length === 1 ? 'elev står' : 'elever står' }}
              med "(fraværende)" på listen — placeres i gruppen og markeres
              fraværende: {{ stayAbsentNames.join(', ') }}
            </p>
          </section>

          <div v-if="plan.blocking.length" class="error-box">
            <div v-for="(b, i) in plan.blocking" :key="'blk' + i">{{ b }}</div>
          </div>
        </template>
      </div>

      <!-- ── Trin 3 ── -->
      <div class="modal-single-action">
        <button class="btn secondary" @click="$emit('close')">Annuller</button>
        <button class="btn primary full-width" :disabled="!canRestore" @click="restore">
          <template v-if="plan">
            Gendan {{ plan.groups.length }} {{ plan.groups.length === 1 ? 'gruppe' : 'grupper' }}
          </template>
          <template v-else>Gendan grupper</template>
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
  background: var(--bg-modal); backdrop-filter: var(--glass-blur-heavy);
  box-sizing: border-box; padding: 32px; border-radius: var(--radius-lg);
  width: 90%; max-width: 560px; position: relative;
  box-shadow: var(--shadow-float), var(--glass-inset);
  max-height: 88vh; display: flex; flex-direction: column;
  border: 1px solid var(--border-medium); color: var(--text-main);
}
h2 { margin: 0 0 2px 0; font-size: 16px; font-weight: 700; color: var(--text-heading); }
.subtitle { margin: 0 0 16px 0; color: var(--text-muted); font-size: 12px; line-height: 1.5; }

/* Kun indholdet ruller — overskrift, faner og knappen bliver stående. */
.scroll-body { overflow-y: auto; flex: 1; min-height: 0; margin-bottom: 16px; }
/* Resten må ikke krympe. Uden det blev "Gendan grupper"-knappen klemt til
   20 px (14 px ved 360 px) på en lav skærm eller med 150 % zoom, mens
   listen ovenover stadig havde plads at rulle af. */
.modal-content > :not(.scroll-body) { flex-shrink: 0; }

.tabs { display: flex; gap: 6px; margin-bottom: 16px; }
.tabs button {
  flex: 1; height: 32px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
  background: var(--bg-surface); color: var(--text-muted);
  border: 1px solid var(--border-subtle); transition-property: var(--ctl-transition); transition-duration: 0.2s;
}
.tabs button:hover { border-color: var(--border-strong); color: var(--text-main); }
.tabs button.active { background: var(--primary); border-color: var(--primary); color: var(--text-on-primary); }

.form-group { margin-bottom: 16px; }
.form-group > label, .section > label,
.form-group > .field-heading, .section > .field-heading {
    margin-block: 0;
  display: block; font-weight: 700; margin-bottom: 5px; color: var(--text-muted);
  font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
}
.full-width {
  width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--border-subtle);
  border-radius: 8px; font-size: 12px; font-weight: 600; box-sizing: border-box;
  background: var(--bg-select-option); color: var(--text-main); transition-property: var(--ctl-transition); transition-duration: 0.2s;
}
.full-width:hover { border-color: var(--primary); background: var(--bg-surface); }
.full-width:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); }

.paste-area {
  width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px;
  border: 1px solid var(--border-subtle); background: var(--bg-select-option);
  color: var(--text-main); font-size: 12px; line-height: 1.5; resize: vertical;
  margin-bottom: 8px; font-family: inherit;
}
.paste-area:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-light); }

.preview-head {
  padding: 10px 12px; border-radius: 8px; font-size: 12px; line-height: 1.6;
  background: var(--bg-surface); border: 1px solid var(--border-subtle); margin-bottom: 12px;
}
.section { margin-bottom: 16px; }
.section-note { margin: 4px 0 8px 0; font-size: 11px; line-height: 1.5; color: var(--text-muted); }

.row {
  padding: 10px 12px; border-radius: 8px; margin-bottom: 6px;
  background: var(--bg-surface); border: 1px solid var(--border-subtle);
}
.row-name { font-size: 12px; font-weight: 700; margin-bottom: 6px; }
.muted { color: var(--text-muted); font-weight: 500; }
.choices { display: flex; flex-direction: column; gap: 4px; }
.choice, .checkline {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  font-size: 12px; font-weight: 600; color: var(--text-main);
}
.choice input, .checkline input { accent-color: var(--primary); width: 15px; height: 15px; }
.skip-line { margin-block-start: 6px; }
select:disabled { opacity: 0.5; }

.note {
  margin: 0 0 12px 0; padding: 10px 12px; border-radius: 8px; font-size: 11px; line-height: 1.5;
  background: var(--color-warning-bg); border: 1px solid var(--color-warning-border);
  color: var(--text-main);
}
.error-box {
  margin: 0 0 12px 0; padding: 10px 12px; border-radius: 8px;
  font-size: 12px; line-height: 1.5; white-space: pre-line;
  background: var(--color-error-bg); border: 1px solid var(--color-error-border);
  color: var(--text-main);
}

.btn {
  height: 34px; padding: 0 18px; border-radius: 8px; border: none;
  font-weight: 600; cursor: pointer; font-size: 12px; transition-property: var(--ctl-transition); transition-duration: 0.2s;
}
.btn.primary { background: var(--primary); color: var(--text-on-primary); }
.btn.primary:hover:not(:disabled) { background: var(--primary-hover); }
.btn.ghost {
  background: var(--bg-surface); color: var(--text-main); border: 1px solid var(--border-subtle);
}
.btn.ghost:hover:not(:disabled) { border-color: var(--primary); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
/* Annuller står ved siden af hovedknappen: lille og stille, mens hovedknappen
   tager resten af bredden. (I beta overtager vinduer.css bunden.) */
.modal-single-action { display: flex; align-items: center; gap: 8px; }
.modal-single-action .btn.primary { flex: 1; width: auto; }
</style>
