<script setup>
// Flyt kolonner — rækkefølgen på SPALTERNE i elevlisten.
//
// IKKE at forveksle med "Ranger værdier" (ColumnOrderModal), der handler om
// rækkefølgen på værdierne INDE i én kolonne (Lav < Middel < Høj). To
// forskellige ting, to forskellige knapper — derfor to navne der ikke ligner
// hinanden.
//
// Hele indgrebet ligger i reorderColumns() i columnActions.js, hvor det er
// dækket af unit-tests. Grunden til at det ikke bare er en sortering af
// `columns`: den rækkefølge der overlever en genindlæsning, er nøglerne i
// elevrækkerne. Se funktionens egen forklaring.
import { ref, computed, onMounted } from 'vue';
import { GripVertical, ChevronUp, ChevronDown, EyeOff } from 'lucide-vue-next';
import { useModalFocus } from '../composables/useModalFocus.js';
import { useReorderDrag, useReorderKeys } from '../composables/useReorderDrag.js';
import { reactiveState as state } from '../js/modules/reactiveState.js';
import { pushUndo } from '../js/modules/state.js';
import { autoSave } from '../js/modules/classActions.js';
import { movableColumns, reorderColumns } from '../js/modules/columnActions.js';

const emit = defineEmits(['close']);

// Arbejdskopien. Tabellen ændrer sig først, når læreren trykker Gem —
// samme valg som "Ranger værdier", så et fortrudt træk ikke efterlader
// elevlisten i en halv tilstand.
const order = ref([]);
const overlayRef = ref(null);

const hasStudents = computed(() => (state.currentClass?.data || []).length > 0);
const hiddenSet = computed(() => new Set(state.currentClass?.hiddenColumns || []));
const displayColumn = computed(() =>
    state.displayColumn || state.currentClass?.columns?.[0] || '');

const unchanged = computed(() => {
    const current = movableColumns(state.currentClass?.columns || []);
    return order.value.length === current.length
        && order.value.every((c, i) => c === current[i]);
});

// Træk-og-slip virker hverken på touch eller tastatur, så pilene er den
// primære vej — trækket er en genvej for musen.
//
// Listen SKUBBER undervejs (useReorderDrag), som gruppekortene gør, når man
// flytter en elev. Før stod den helt stille under trækket, og man opdagede
// først ved at slippe, om man ramte rigtigt.
const { draggedIndex, onDragStart, onDragOver, onDrop, onDragEnd } = useReorderDrag(order);
const { move, onHandleKey } = useReorderKeys(order, overlayRef);


function save() {
    if (unchanged.value) { emit('close'); return; }

    // Fortryd-stakken gemmer en kopi af elevrækkerne, og nøglerækkefølgen
    // følger med i kopien — så Ctrl+Z tager flytningen tilbage uden at vi
    // skal bygge noget selv.
    pushUndo();

    const res = reorderColumns(state.currentClass, order.value);
    if (!res.ok) {
        window.notifyError?.(res.error);
        return;
    }
    autoSave();
    window.notifySuccess?.(`Kolonnerne står nu i rækkefølgen: ${order.value.join(', ')}.`);
    emit('close');
}

onMounted(() => {
    order.value = movableColumns(state.currentClass?.columns || []);
});

const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('close') });
</script>

<template>
  <div ref="overlayRef" class="modal-overlay" role="dialog" aria-modal="true"
       aria-labelledby="dlg-flyt-kolonner" @click.self="onBackdropClick">
    <div class="modal-content">
      <button class="close-btn" aria-label="Luk" @click="$emit('close')">&times;</button>

      <h2 id="dlg-flyt-kolonner">Flyt kolonner</h2>
      <p class="subtitle">
        Bestem kolonnernes rækkefølge i elevlisten — fx så
        <strong>Navn</strong> står først, uanset hvordan regnearket var sat op.
        Rækkefølgen følger med, når du eksporterer til Excel.
      </p>

      <p v-if="!hasStudents" class="note">
        Klassen har ingen elever endnu. Kolonnernes rækkefølge gemmes sammen med
        elevrækkerne, så der skal være mindst én elev, før den kan flyttes.
      </p>

      <p v-else-if="order.length < 2" class="note">
        Der er kun én kolonne i elevlisten. Der er ikke noget at flytte rundt på.
      </p>

      <div v-else class="order-section">
        <p class="field-heading">Rækkefølge — øverst står længst til venstre</p>
        <!-- TransitionGroup: det er DEN der får de øvrige rækker til at glide
             på plads, når useReorderDrag flytter elementet undervejs. Uden
             den hopper de bare. -->
        <TransitionGroup tag="ul" name="reorder" class="order-list">
          <li v-for="(col, i) in order" :key="col"
              class="order-row"
              :class="{ dragging: draggedIndex === i }"
              @dragover="onDragOver(i, $event)"
              @drop="onDrop($event)">
            <button class="drag-handle" type="button" draggable="true"
                    :title="`Flyt &quot;${col}&quot; — eller brug pil op/ned`"
                    :aria-label="`Flyt ${col}`"
                    @dragstart="onDragStart(i, $event)"
                    @dragend="onDragEnd"
                    @keydown="onHandleKey(i, $event)">
              <GripVertical :size="13" />
            </button>
            <!-- Ingen rækkenumre her: pladsen er det, du ser på listen. Tal hører til i
                 Ranger, hvor de er en rang. -->
            <span class="col-name">{{ col }}</span>
            <!-- Mærkaterne er OPLYSNING, ikke en regel: skjulte kolonner kan
                 flyttes som alle andre. En automatisk "skjulte nederst"-regel
                 ville rykke tingene tilbage, lige når man havde flyttet dem. -->
            <span v-if="col === displayColumn" class="badge badge-display" title="Denne kolonne er den, elevernes navne læses fra på gruppekortene">Vises på kortene</span>
            <span v-if="hiddenSet.has(col)" class="badge" title="Indholdet er skjult">
              <EyeOff :size="10" aria-hidden="true" /> Skjult
            </span>
            <button class="step" type="button" :disabled="i === 0"
                    :aria-label="`Flyt ${col} op`" @click="move(i, -1)">
              <ChevronUp :size="13" />
            </button>
            <button class="step" type="button" :disabled="i === order.length - 1"
                    :aria-label="`Flyt ${col} ned`" @click="move(i, 1)">
              <ChevronDown :size="13" />
            </button>
          </li>
        </TransitionGroup>
        <p class="hint-line">
          Fortryder du, mens vinduet er åbent, så tryk <strong>Annuller</strong>.
          Har du gemt, tager Ctrl+Z flytningen tilbage. Reglerne, de skjulte
          kolonner og rangeringerne følger med af sig selv — de peger på
          kolonnens navn, ikke på dens plads.
        </p>
      </div>

      <div class="actions">
        <button class="btn secondary" @click="$emit('close')">Annuller</button>
        <button class="btn primary" :disabled="order.length < 2 || unchanged" @click="save">
          Gem rækkefølge
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./reorderModal.css"></style>

<style scoped>
/* Kun her: overskriften over listen, mærkerne ved navnet og pilenes hover. */
.order-section > .field-heading {
  margin-block: 0 5px;
  display: block;
  font-weight: 700;
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.col-name { min-inline-size: 0; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  font: 600 9px var(--mono, ui-monospace, monospace);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 1px 5px;
}
.badge-display {
  color: var(--text-link);
  border-color: var(--primary);
  background: var(--primary-light);
}

.step:hover:not(:disabled) { background: var(--bg-surface-hover); color: var(--text-main); }
</style>
