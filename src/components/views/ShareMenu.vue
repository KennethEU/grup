<script setup>
// Del-menuen — vejene ud af programmet: en udskrift (som også kan gemmes som
// PDF i printvinduet) og en Excel-fil med grupperne i kolonner eller rækker.
//
// Hænger over "Del"-knappen i bundbjælken, samme facon som
// kørselshistorikken. Placeringen deles via useBarPopover, lukning og fokus
// via useBarMenuDismiss.
//
// Menuen bestemmer IKKE selv, hvad der står i filen. Det gør
// buildGroupTable() i groupExport.js, som "Kopiér" også bruger — så Excel og
// den kopierede liste ikke kan komme til at vise noget forskelligt.
import { ref, computed, watch } from 'vue';
import { reactiveState } from '../../js/modules/reactiveState.js';
import { useBarPopover } from '../../composables/useBarPopover.js';
import { useBarMenuDismiss } from '../../composables/useBarMenuDismiss.js';
import { openOverview } from '../../js/modules/overview.js';
import { downloadGroupsWorkbook, matrixAvailability } from '../../js/modules/groupExport.js';
import { Printer, Columns3, Rows3 } from 'lucide-vue-next';

const emit = defineEmits(['close']);

const rootRef = ref(null);
const { menuStyle, arrowStyle } = useBarPopover(rootRef, 'share-anchor', 288);
const { onRootFocusOut } = useBarMenuDismiss(rootRef, {
    anchorClass: 'share-anchor',
    onClose: () => emit('close'),
});

// ─── Hvilke grupper Excel-filen skal have ───────────────────────────────────
const hasStandard = computed(() => (reactiveState.storedStandardGroups || []).length > 0);
// state er selv et reactive()-objekt, så Vue ser de felter, funktionen læser.
const matrixStatus = computed(() => matrixAvailability());

const setOptions = computed(() => [
    { value: 'standard', label: 'Stamgrupper', disabled: !hasStandard.value },
    { value: 'matrix', label: 'Matrixgrupper', disabled: matrixStatus.value !== 'ok' },
    { value: 'both', label: 'Begge', disabled: !hasStandard.value || matrixStatus.value !== 'ok' },
]);

// Uden nogen matrix er der intet at vælge imellem, og tre knapper hvor de to
// er slået fra, ville bare være støj for den lærer, der aldrig bruger matrix.
// En FORÆLDET matrix vises derimod — med en forklaring på, hvorfor den ikke
// kan vælges.
const showSetChoice = computed(() => matrixStatus.value !== 'none');

const matrixNote = computed(() => (matrixStatus.value === 'stale'
    ? 'Matrixgrupperne hører til de forrige stamgrupper. Dan dem igen, hvis de skal med.'
    : ''));

/** Den visning læreren står i — ellers det første, der kan vælges. */
function defaultChoice() {
    const wanted = reactiveState.activeView === 'matrix' ? 'matrix' : 'standard';
    const options = setOptions.value;
    const hit = options.find(o => o.value === wanted && !o.disabled);
    return hit ? hit.value : (options.find(o => !o.disabled)?.value ?? null);
}

const choice = ref(defaultChoice());

// Bliver det valgte sæt utilgængeligt, mens menuen står åben (fx fordi
// grupperne dannes forfra), falder valget tilbage i stedet for at pege på en
// knap, der er slået fra.
watch(setOptions, (options) => {
    if (!options.some(o => o.value === choice.value && !o.disabled)) choice.value = defaultChoice();
});

// ─── Handlingerne ───────────────────────────────────────────────────────────
const busy = ref(false);
// Mens grupperne dannes, er de gemte grupper på vej til at blive skiftet ud.
// Samme regel som "Gendan" i bjælken.
const canExcel = computed(() => !busy.value && !reactiveState.isGenerating && choice.value !== null);

function onPrint() {
    openOverview();
    emit('close');
}

async function onExcel(layout) {
    if (!canExcel.value) return;
    busy.value = true;
    const sets = choice.value === 'both' ? ['standard', 'matrix'] : [choice.value];
    try {
        // Menuen bliver stående ved fejl, så læreren kan prøve igen.
        if (await downloadGroupsWorkbook({ sets, layout })) emit('close');
    } finally {
        busy.value = false;
    }
}
</script>

<template>
  <div ref="rootRef" class="share-menu" :style="menuStyle" role="group" aria-label="Del grupperne"
       tabindex="-1" @focusout="onRootFocusOut">

    <button class="share-item" @click="onPrint">
      <Printer :size="15" class="share-icon" aria-hidden="true" />
      <span class="share-text">
        <span class="share-title">Udskriv / gem som PDF</span>
        <span class="share-desc">Oversigten over grupperne. Vælg "Gem som PDF" i printvinduet for at få en fil.</span>
      </span>
    </button>

    <div class="share-sep" aria-hidden="true"></div>

    <fieldset class="share-excel">
      <legend class="share-heading">Excel-fil</legend>

      <div v-if="showSetChoice" class="seg" role="radiogroup" aria-label="Hvilke grupper skal med?">
        <label v-for="opt in setOptions" :key="opt.value" class="seg-opt"
               :class="{ checked: choice === opt.value, disabled: opt.disabled }">
          <input type="radio" name="share-set" :value="opt.value" v-model="choice" :disabled="opt.disabled">
          <span>{{ opt.label }}</span>
        </label>
      </div>
      <p v-if="matrixNote" class="share-note">{{ matrixNote }}</p>

      <button class="share-item" :disabled="!canExcel" @click="onExcel('columns')">
        <Columns3 :size="15" class="share-icon" aria-hidden="true" />
        <span class="share-text">
          <span class="share-title">Grupper i kolonner</span>
          <span class="share-desc">Én kolonne pr. gruppe, eleverne nedenunder.</span>
        </span>
      </button>
      <button class="share-item" :disabled="!canExcel" @click="onExcel('rows')">
        <Rows3 :size="15" class="share-icon" aria-hidden="true" />
        <span class="share-text">
          <span class="share-title">Grupper i rækker</span>
          <span class="share-desc">Én række pr. gruppe, eleverne ud til højre.</span>
        </span>
      </button>

      <p v-if="reactiveState.isGenerating" class="share-note">Vent, til grupperne er dannet.</p>
    </fieldset>

    <span class="arrow" :style="arrowStyle"></span>
  </div>
</template>

<style scoped>
/* Samme ramme som kørselshistorikken (RunHistoryMenu.vue) — de to menuer
   hænger på den samme bjælke og skal ligne hinanden. Den faste bredde har
   samme grund som dér: menuen er absolut placeret i et smalt anker. */
.share-menu {
    position: absolute;
    inset-block-end: calc(100% + 10px);
    inset-inline-start: 0;
    z-index: 20;
    inline-size: 288px;
    box-sizing: border-box;
    padding: 6px;
    /* DÆKKENDE baggrund: --bg-modal lagt oven på sidens egen baggrund.
       --bg-modal alene er 95 % dækkende. Kørselsmenuen har kun et par korte
       tal, men her står der beskrivelser i 10,5 px, og elevnavnene fra
       gruppekortene bag menuen kunne læses midt i dem (målt 12/9, 375 px).
       Sløring (backdrop-filter) virker IKKE her: bundbjælken har selv en
       backdrop-filter og er dermed menuens "backdrop root", så en sløring
       inde i den slører kun bjælkens eget indhold — ikke kortene bag den.
       --bg-body er dækkende i både lyst og mørkt tema. */
    background: linear-gradient(var(--bg-modal), var(--bg-modal)), var(--bg-body);
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    box-shadow: 0 10px 30px oklch(0 0 0 / 18%);
    text-align: start;
}
.share-menu:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

.arrow {
    position: absolute;
    inset-block-start: 100%;
    inline-size: 12px;
    block-size: 6px;
    /* Samme dækkende baggrund som menuen, så pilen ikke skiller sig ud. */
    background: linear-gradient(var(--bg-modal), var(--bg-modal)), var(--bg-body);
    border-inline: 1px solid var(--border-strong);
    border-block-end: 1px solid var(--border-strong);
    clip-path: polygon(0 0, 100% 0, 50% 100%);
}

/* ── Menupunkterne ── */
.share-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    inline-size: 100%;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--text-main);
    text-align: start;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
}
.share-item:hover:not(:disabled),
.share-item:focus-visible {
    background: var(--primary-light);
    border-color: var(--primary-border);
}
.share-item:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
.share-item:disabled { opacity: 0.45; cursor: not-allowed; }

.share-icon {
    flex-shrink: 0;
    margin-block-start: 1px;
    color: var(--primary);
}

.share-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
}
.share-title { font-size: 12px; font-weight: 700; }
.share-desc {
    font-size: 10.5px;
    line-height: 1.4;
    color: var(--text-muted);
}

.share-sep {
    block-size: 1px;
    margin: 6px 4px;
    background: var(--border-medium);
}

/* ── Excel-afsnittet ── */
.share-excel {
    margin: 0;
    padding: 0;
    border: 0;
    min-inline-size: 0;
}
.share-heading {
    padding: 2px 10px 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
}

/* Valget af gruppesæt: tre knapper i én pille. Rigtige radioknapper under
   overfladen, så piletasterne flytter mellem dem, og en skærmlæser siger
   "1 af 3". Selve cirklen er klippet væk, men kan stadig få fokus. */
.seg {
    display: flex;
    gap: 2px;
    margin: 0 4px 6px;
    padding: 2px;
    border: 1px solid var(--border-medium);
    border-radius: 100px;
}
.seg-opt {
    position: relative;
    flex: 1 1 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-block-size: 28px;
    padding-inline: 6px;
    border-radius: 100px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
}
.seg-opt input {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    margin: 0;
}
/* Kun de felter der IKKE er valgt. Uden :not(.checked) vandt hover-reglen
   over .checked (højere specificitet), og det valgte felt fik mørk tekst på
   blå baggrund, så snart musen stod over det. */
.seg-opt:hover:not(.disabled):not(.checked) { color: var(--text-main); }
.seg-opt.checked {
    background: var(--primary);
    color: white;
}
.seg-opt:has(input:focus-visible) { outline: 2px solid var(--primary); outline-offset: 1px; }
.seg-opt.disabled { opacity: 0.4; cursor: not-allowed; }

.share-note {
    margin: 0 4px 6px;
    padding: 6px 9px;
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--text-main);
    /* Afledt af temaets advarselsfarve, ikke en fast lys ravfarve. Med den
       faste farve stod --text-main (lys i mørkt tema) på lys baggrund, og
       boksen så tom ud — målt 12/9 i mørkt tema.
       color-mix og ikke oklch(from …): den relative farvesyntaks kom først
       i Safari 18 og Firefox 128, og uden den faldt hele linjen væk — boksen
       stod uden farve. color-mix virker fra Safari 16.2 og giver det samme. */
    background: color-mix(in oklch, var(--color-warning) 14%, transparent);
    border: 1px solid color-mix(in oklch, var(--color-warning) 35%, transparent);
    border-radius: 7px;
}

/* Telefon: fingre er større end en musemarkør. */
@media (max-width: 640px) {
    .share-item,
    .seg-opt { min-block-size: 44px; }
    .share-item { align-items: center; }
}
</style>
