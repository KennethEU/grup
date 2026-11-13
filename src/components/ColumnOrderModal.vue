<script setup>
// Ranger værdierne i en tekstkolonne — "Lav < Middel < Høj".
//
// Hvorfor den findes: "Ensartede" og "Balancér" kan kun arbejde med tal, så på
// en tekstkolonne gør de bogstaveligt talt ingenting. Fortæller læreren
// rækkefølgen, lægger generation.js en skjult tal-kolonne ved siden af og peger
// de tre tal-regler over på den (se applyColumnOrders i utils.js).
//
// Rangeringen gemmes på klassen som `columnOrders` — ikke i `settings`, som
// bliver erstattet, når man går tilbage til en tidligere kørsel.
import { ref, computed, onMounted } from 'vue';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-vue-next';
import { useModalFocus } from '../composables/useModalFocus.js';
import { useReorderDrag, useReorderKeys } from '../composables/useReorderDrag.js';
import { reactiveState as state } from '../js/modules/reactiveState.js';
import { autoSave } from '../js/modules/classActions.js';
import { isInternalField, columnIsNumeric, valueKey } from '../js/modules/utils.js';

const props = defineProps({
    // Kolonnen der skal rangeres, hvis vinduet er åbnet fra en advarsel om
    // netop den. Tom = læreren vælger selv.
    column: { type: String, default: '' },
});
const emit = defineEmits(['close']);

// Flere end det, og listen er ikke til at overskue — og en kolonne med så
// mange forskellige værdier er sjældent en skala.
const MAX_VALUES = 12;

const columns = computed(() => {
    const cls = state.currentClass;
    if (!cls || !Array.isArray(cls.columns)) return [];
    return cls.columns.filter(c => !isInternalField(c) && c !== '__MatrixSource__');
});

const selectedColumn = ref('');
const order = ref([]);      // værdierne i den rækkefølge læreren vil have
const overlayRef = ref(null);
const tooMany = ref(false);
const valueCount = ref(0);

/**
 * De værdier eleverne FAKTISK har i kolonnen, i den rækkefølge de foreslås i.
 *
 * `numeric: true` er ikke en detalje. Uden den sorterer localeCompare rent
 * alfabetisk, og så foreslog vinduet den danske karakterskala som
 * "00 → 02 → 10 → 12 → 4 → 7" og fraværsdage som "1 → 10 → 11 → 2 → 3".
 * Listen ser rigtig ud ved første øjekast, og trykker læreren bare "Gem", har
 * hun fortalt motoren at 7 er den højeste karakter — hvorefter kolonnen tæller
 * som rangeret, advarslen tier, og "Ensartede" optimerer stille på en
 * forvansket skala. Det er den værste slags fejl: den ser ud til at virke.
 */
function uniqueValues(col) {
    const set = new Map();   // småt -> lærerens egen stavemåde
    for (const s of (state.currentClass?.data || [])) {
        const v = String(s[col] ?? '').trim();
        if (v === '') continue;
        const key = valueKey(v);
        if (!set.has(key)) set.set(key, v);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b, 'da', { numeric: true }));
}

/**
 * Er kolonnen allerede tal? Så har den ingen brug for en rangering.
 *
 * Reglerne kan bruge den som den er — og en rangering ville gøre skade: den
 * erstatter de rigtige afstande med 1, 2, 3 …, så springet 02→4 og springet
 * 10→12 pludselig vejer det samme. Vinduet siger det, i stedet for at lade
 * læreren opdage det bagefter (eller aldrig).
 */
const columnHasNumbers = computed(() =>
    !!selectedColumn.value && columnIsNumeric(state.currentClass?.data || [], selectedColumn.value));

function load(col) {
    selectedColumn.value = col;
    order.value = [];
    tooMany.value = false;
    valueCount.value = 0;
    if (!col) return;

    const found = uniqueValues(col);
    valueCount.value = found.length;
    if (found.length > MAX_VALUES) {
        tooMany.value = true;
        return;
    }

    // En gemt rangering er lærerens egen sortering og skal respekteres. Værdier
    // der er kommet til bagefter lægges nederst frem for at forsvinde — så kan
    // hun flytte dem på plads i stedet for at starte forfra.
    const saved = (state.currentClass?.columnOrders || {})[col];
    if (Array.isArray(saved) && saved.length) {
        // Samme værdi kun ÉN gang (første vinder). En rangering fra en
        // håndredigeret backup kan have "Lav" og "lav" som to trin; motoren
        // giver rangen efter PLADSEN i listen, så dubletten ville give et hul
        // i skalaen (Lav 1, Høj 3) — og listen to rækker med samme værdi.
        const set = new Set(found.map(valueKey));
        const seen = new Set();
        const known = saved.filter(v => {
            const key = valueKey(v);
            if (!set.has(key) || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const added = found.filter(v => !seen.has(valueKey(v)));
        order.value = [...known, ...added];
    } else {
        order.value = found;
    }
}

const hasSavedRanking = computed(() =>
    Array.isArray((state.currentClass?.columnOrders || {})[selectedColumn.value]));

// Træk-og-slip virker hverken på touch eller tastatur, så pilene er den
// primære vej.
//
// Listen SKUBBER undervejs (useReorderDrag), som gruppekortene gør. Før stod
// den helt stille under trækket: det eneste tegn på liv var at det trukne blev
// halvgennemsigtigt, og man opdagede først ved at slippe, om man ramte rigtigt.
const { draggedIndex, onDragStart, onDragOver, onDrop, onDragEnd } = useReorderDrag(order);
const { move, onHandleKey } = useReorderKeys(order, overlayRef);

function save() {
    const col = selectedColumn.value;
    if (!col || order.value.length < 2) return;
    if (!state.currentClass.columnOrders) state.currentClass.columnOrders = {};
    state.currentClass.columnOrders[col] = [...order.value];
    autoSave();
    if (window.notifySuccess) {
        window.notifySuccess(`"${col}" er nu rangeret: ${order.value.join(' → ')} (lavest først).`);
    }
    emit('close');
}

function remove() {
    const col = selectedColumn.value;
    if (!col || !state.currentClass?.columnOrders) return;
    delete state.currentClass.columnOrders[col];
    autoSave();
    if (window.notifyInfo) window.notifyInfo(`Rangeringen af "${col}" er fjernet.`);
    emit('close');
}

/**
 * Hvilken kolonne skal stå fremme, når vinduet åbner?
 *
 * Kommer læreren fra advarslen, er svaret givet. Kommer hun fra knappen i
 * elevlisten, er den første kolonne næsten altid navnekolonnen — 28
 * forskellige værdier og "kan ikke rangeres". Det er en dårlig første
 * oplevelse af et vindue, hun selv har åbnet. Derfor: en kolonne der allerede
 * ER rangeret, ellers den første der overhovedet KAN rangeres.
 */
function bestStartColumn() {
    if (props.column && columns.value.includes(props.column)) return props.column;
    const orders = state.currentClass?.columnOrders || {};
    const ranked = columns.value.find(c => Array.isArray(orders[c]) && orders[c].length >= 2);
    if (ranked) return ranked;
    const canBeRanked = columns.value.find(c => {
        const n = uniqueValues(c).length;
        return n >= 2 && n <= MAX_VALUES;
    });
    return canBeRanked || columns.value[0] || '';
}

onMounted(() => {
    load(bestStartColumn());
});

const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('close') });
</script>

<template>
  <div ref="overlayRef" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dlg-ranger" @click.self="onBackdropClick">
    <div class="modal-content">
      <button class="close-btn" aria-label="Luk" @click="$emit('close')">&times;</button>

      <h2 id="dlg-ranger">Ranger værdier</h2>
      <p class="subtitle">
        Fortæl programmet hvilken rækkefølge værdierne står i — fx Lav, Middel, Høj.
        Så kan reglerne <strong>Ensartede</strong>, <strong>Balancér</strong> og
        <strong>Saml</strong> bruge kolonnen. Uden en rækkefølge kan de ikke:
        de regner med tal.
      </p>

      <div class="form-group">
        <label for="order-col">Kolonne</label>
        <select id="order-col" class="full-width" :value="selectedColumn"
                @change="load($event.target.value)">
          <option v-for="col in columns" :key="col" :value="col">{{ col }}</option>
        </select>
      </div>

      <p v-if="tooMany" class="note">
        "{{ selectedColumn }}" har {{ valueCount }} forskellige værdier. Så mange kan
        ikke sættes i en rækkefølge her — og en kolonne med så mange værdier er
        sjældent en skala. Er det tal, virker reglerne allerede af sig selv.
      </p>

      <p v-else-if="order.length < 2" class="note">
        "{{ selectedColumn }}" har
        {{ valueCount === 0 ? 'ingen udfyldte værdier' : 'kun én værdi' }}.
        Der er ikke noget at rangere.
      </p>

      <div v-else class="order-section">
        <!-- Advarsel OVER listen, ikke i stedet for den: da noten stod i
             v-if-kæden, forsvandt hele rækkefølgen fra skærmen — mens knappen
             "Gem rækkefølge" blev ved med at være aktiv og ville gemme en
             rækkefølge, læreren aldrig havde set. -->
        <p v-if="columnHasNumbers && !hasSavedRanking" class="note">
          "{{ selectedColumn }}" indeholder allerede tal. <strong>Ensartede</strong>,
          <strong>Balancér</strong> og <strong>Saml</strong> kan bruge kolonnen som
          den er — du behøver ikke rangere den. Gør du det alligevel, regner
          programmet med rækkefølgen 1, 2, 3 … i stedet for de rigtige tal, så
          springet fra 02 til 4 kommer til at veje det samme som springet fra
          10 til 12.
        </p>
        <p class="field-heading">Rækkefølge — øverst er lavest</p>
        <!-- TransitionGroup: det er DEN der får de øvrige rækker til at glide
             på plads, mens man trækker. -->
        <TransitionGroup tag="ul" name="reorder" class="order-list">
          <li v-for="(v, i) in order" :key="v"
              class="order-row"
              :class="{ dragging: draggedIndex === i }"
              @dragover="onDragOver(i, $event)"
              @drop="onDrop($event)">
            <button class="drag-handle" type="button" draggable="true"
                    :title="`Flyt &quot;${v}&quot; — eller brug pil op/ned`"
                    :aria-label="`Flyt ${v}`"
                    @dragstart="onDragStart(i, $event)"
                    @dragend="onDragEnd"
                    @keydown="onHandleKey(i, $event)">
              <GripVertical :size="13" />
            </button>
            <span class="rank">{{ i + 1 }}</span>
            <span class="col-name">{{ v }}</span>
            <button class="step" type="button" :disabled="i === 0"
                    :aria-label="`Flyt ${v} op`" @click="move(i, -1)">
              <ChevronUp :size="13" />
            </button>
            <button class="step" type="button" :disabled="i === order.length - 1"
                    :aria-label="`Flyt ${v} ned`" @click="move(i, 1)">
              <ChevronDown :size="13" />
            </button>
          </li>
        </TransitionGroup>
        <p class="hint-line">Tallet er den værdi programmet regner med — 1 er lavest.
          Elever med en værdi, der ikke står her, behandles som om feltet var tomt.</p>
      </div>

      <div class="actions">
        <button v-if="hasSavedRanking" class="btn ghost" @click="remove">Fjern rangering</button>
        <button class="btn secondary" @click="$emit('close')">Annuller</button>
        <button class="btn primary" :disabled="tooMany || order.length < 2" @click="save">
          Gem rækkefølge
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./reorderModal.css"></style>

<style scoped>
/* Kun her: kolonnevælgeren, rangtallene, pilenes hover og "Fjern rangering". */
.form-group { margin-bottom: 16px; }
.form-group label,
.order-section > .field-heading {
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

.rank {
  font: 700 10px var(--mono, ui-monospace, monospace);
  color: var(--text-muted);
  min-width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.step:hover:not(:disabled) { color: var(--primary); background: var(--primary-light); }
.btn.ghost { background: transparent; color: var(--text-muted); margin-right: auto; padding-inline: 0; }
.btn.ghost:hover { color: var(--color-error); }
</style>
