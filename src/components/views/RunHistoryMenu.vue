<script setup>
// Kørselshistorik — en lille menu der folder sig ud lige over historik-knappen
// i bundbjælken. Bevidst IKKE et modalvindue: at kigge på en tidligere kørsel
// skal ikke lægge et lag hen over de grupper man prøver at sammenligne med.
//
// SÅDAN VIRKER DEN:
//   Nu · 1 · 2 · 3 …   — "Nu" er den fordeling der gælder, 1 er den seneste
//                        tidligere kørsel, og så bagud.
//   hover              — gruppekortene skifter MIDLERTIDIGT til den kørsel,
//                        så man ser den i de rigtige kort. Intet gemmes.
//   klik               — først dér spørges der, og først dér hentes den frem.
//
// Forhåndsvisningen sætter kun state.previewRunIndex; GroupResultsPanel læser
// den og tegner snapshottets grupper i stedet for de rigtige. Den rigtige
// tilstand røres aldrig, før læreren har klikket og svaret.

import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useBarPopover } from '../../composables/useBarPopover.js';
import { reactiveState } from '../../js/modules/reactiveState.js';
import { listRuns, restoreRun, hasManualChanges, hasSettingsChanges } from '../../js/modules/runHistory.js';
import { autoSave } from '../../js/modules/classActions.js';
import { groupCountText } from '../../js/modules/utils.js';
import { Undo2, SlidersHorizontal } from 'lucide-vue-next';

const emit = defineEmits(['close']);

const runs = computed(() => listRuns());

// Hvilken kørsel læreren har klikket på og skal svare på. null = chip-rækken.
const selectedIndex = ref(null);
const manualChanges = ref(false);
const settingsChanged = ref(false);
const hiddenSetOnly = ref(false);

const rootRef = ref(null);

// Den kørsel musen peger på — driver info-linjen under chippene.
// Vi bruger IKKE title/tooltip: app'ens tooltip lægger sig hen over
// chippene, og et klik landede så på tooltip'en i stedet for på knappen,
// hvorefter menuen lukkede sig selv som et "klik udenfor".
const hoveredIndex = ref(null);
const hoveredRun = computed(() => {
    const i = hoveredIndex.value !== null ? hoveredIndex.value : reactiveState.previewRunIndex;
    if (i === null) return null;
    return runs.value.find(r => r.index === i) || null;
});

/**
 * Antals-linjen skal tælle DE grupper der står i kortene.
 *
 * Står læreren i matrixvisningen, er det matrixgrupperne hun ser — og havde
 * kørslen slet ingen matrix, er kortene tomme. Så skal linjen sige det, ikke
 * oplyse et antal stamgrupper hun ikke kan se nogen steder.
 */
function countLabel(run) {
    if (reactiveState.activeView !== 'matrix') {
        return groupCountText(run.groupCount);
    }
    if (!run.hasMatrix) return 'Ingen matrix i denne kørsel';
    return `${run.matrixGroupCount} matrixgrupper`;
}

// ─── Hvad kørslen ændrer ────────────────────────────────────────────────────
// En kørsel gemmer BEGGE gruppesæt, men kortene kan kun vise det ene ad gangen.
// Matrixen dannes sjældnere end stamgrupperne, så flere kørsler i træk deler
// som regel den samme matrix — og i matrixvisningen var chippene dermed helt
// identiske at se på, selvom hvert klik skrev stamgrupperne forskelligt om.
// Teksten her siger hvad der sker i BEGGE sæt, og markøren på chippen advarer,
// når hele forskellen ligger i det sæt man ikke kigger på.

const SET_LABELS = { standard: 'stamgrupperne', matrix: 'matrixen' };

/** Hvilket sæt kortene viser lige nu, og hvilket der er skjult. */
const activeSet = computed(() => reactiveState.activeView === 'matrix' ? 'matrix' : 'standard');
const hiddenSet = computed(() => activeSet.value === 'matrix' ? 'standard' : 'matrix');

const touches = (state) => state === 'changed' || state === 'removed' || state === 'added';

/** Ændrer kørslen KUN det sæt læreren ikke kan se herfra? */
function onlyHiddenSetChanges(run) {
    if (!run || !run.changes) return false;
    return !touches(run.changes[activeSet.value]) && touches(run.changes[hiddenSet.value]);
}

/** Én sætning om hvad et klik gør ved begge sæt. */
function changeLabel(run) {
    if (!run || !run.changes) return '';
    const inActive = touches(run.changes[activeSet.value]);
    const inHidden = touches(run.changes[hiddenSet.value]);
    if (!inActive && !inHidden) return 'Ingen forskel — magen til det du står med nu.';
    if (inActive && inHidden) return `Henter du den, ændres både ${SET_LABELS.standard} og ${SET_LABELS.matrix}.`;
    if (inActive) return `Henter du den, ændres ${SET_LABELS[activeSet.value]}.`;
    return `Ser ens ud her — forskellen ligger i ${SET_LABELS[hiddenSet.value]}.`;
}

// ─── Forhåndsvisning ────────────────────────────────────────────────────────
function preview(index) {
    hoveredIndex.value = index;
    if (selectedIndex.value !== null) return; // spørgsmålet er stillet — lad kortene stå
    reactiveState.previewRunIndex = index;
}

function clearPreview() {
    hoveredIndex.value = null;
    if (selectedIndex.value !== null) return;
    reactiveState.previewRunIndex = null;
}

// ─── Klik: stil spørgsmålet ─────────────────────────────────────────────────
function select(index) {
    const hasManual = hasManualChanges();
    const hasSettings = hasSettingsChanges(index);
    // Ligger hele forskellen i det sæt kortene ikke viser, har læreren netop
    // IKKE set hvad hun siger ja til — forhåndsvisningen var jo identisk med
    // det der stod i forvejen. Så skal der spørges, også når der hverken er
    // flytninger eller indstillinger på spil.
    const hiddenOnly = onlyHiddenSetChanges(runs.value.find(r => r.index === index));

    // Er der intet af det tre, er bekræftelses-trinnet en tom formalitet:
    // begge svar ville gøre nøjagtig det samme. Læreren har allerede set
    // kørslen i kortene, og den fordeling hun forlader, kan hentes tilbage
    // fra menuen. Så hent den.
    if (!hasManual && !hasSettings && !hiddenOnly) {
        restore(index, false);
        return;
    }

    selectedIndex.value = index;
    manualChanges.value = hasManual;
    settingsChanged.value = hasSettings;
    hiddenSetOnly.value = hiddenOnly;
    // Lad kortene blive stående på den kørsel der spørges om — så ser man
    // hele tiden hvad man er ved at sige ja til.
    reactiveState.previewRunIndex = index;
}

function back() {
    selectedIndex.value = null;
    reactiveState.previewRunIndex = null;
}

function restore(index, alsoSettings) {
    // Ryd forhåndsvisningen FØR gendannelsen, ellers ville kortene et kort
    // øjeblik vise et snapshot der er skubbet én plads ned i stakken.
    reactiveState.previewRunIndex = null;
    selectedIndex.value = null;

    const result = restoreRun(index, alsoSettings);
    if (result) {
        autoSave();
        if (result.saved === false) {
            // Kørslen står på skærmen, men kunne ikke skrives til lageret.
            // En grøn kvittering ville sende læreren videre i den tro at det
            // hele er på plads — og næste genindlæsning ville hente de gamle
            // grupper frem igen.
            window.notifyError?.(
                'Kørslen er hentet frem på skærmen, men kunne IKKE gemmes — ' +
                'lagerpladsen er fuld. Slet en gammel klasse eller ryd historikken, ' +
                'og hent kørslen igen.'
            );
        } else {
            window.notifySuccess?.(alsoSettings
                ? 'Kørslen er hentet frem — også reglerne og indstillingerne.'
                : 'Kørslen er hentet frem.');
        }
    }
    emit('close');
}

// ─── Luk ────────────────────────────────────────────────────────────────────
// Escape og klik udenfor. Menuen er ikke modal, så den skal selv rydde op
// efter sig — både lukningen OG forhåndsvisningen.
function onKeydown(e) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
}

/**
 * Luk når der klikkes uden for menuen.
 *
 * Lytter på pointerdown, IKKE på click — og det er ikke en detalje.
 * Browseren afvikler et microtask-checkpoint MELLEM to klik-lyttere, så når
 * chippens egen handler har skiftet menuen til spørgsmåls-trinnet, har Vue
 * allerede gentegnet og taget chippen ud af DOM'en, inden den her lytter
 * kører. `contains()` sagde så nej til et element der lige HAVDE været inde
 * i menuen, og menuen lukkede sig selv i stedet for at stille spørgsmålet.
 * pointerdown falder før alt det.
 */
function onClickOutside(e) {
    if (rootRef.value && !rootRef.value.contains(e.target)) close();
}

/**
 * Luk når TASTATURET forlader menuen.
 *
 * Musen havde altid en vej ud: `@mouseleave` på roden rydder
 * forhåndsvisningen, og et klik udenfor lukker menuen. Tastaturet havde ingen
 * af delene. Chipsene sætter forhåndsvisningen på `@focus`, men intet ryddede
 * den igen, når fokus tabbede videre — og menuen blev stående i DOM'en.
 *
 * Målt (2/9): åbn menuen, tryk Tab otte gange. Fokus står på `.brand-link`
 * øverst i topbaren, menuen er stadig åben, og `previewRunIndex` er 0.
 * Gruppekortene viser kørsel 1, mens `storedStandardGroups` stadig indeholder
 * den fordeling der gælder — og ALLE fire udgange (udskrift, kopiér, gem som
 * kolonne, Excel-eksport) læser `stored*`. Læreren printer altså en anden
 * liste end den, hun kigger på. På den ene klasse jeg målte var det Gruppe 1
 * med "Elev 10, 13, 18, 3" på skærmen og "Elev 1, 15, 17, 9" på papiret.
 *
 * Rettelsen sidder HER frem for i de fire udgange: forhåndsvisningen er et
 * spørgsmål, ikke en tilstand. Slipper den, når man går væk fra menuen, kan
 * ingen udgang længere komme til at være uenig med skærmen.
 *
 * TO LYTTERE, og begge er nødvendige. Denne er `focusin` på document — samme
 * mønster som `onClickOutside` ovenfor — og den er den præcise: den fyrer kun,
 * når noget ANDET tager imod fokus. Bagstopperen er `onRootFocusOut` nedenfor.
 */
function onFocusOutside(e) {
    if (rootRef.value && !rootRef.value.contains(e.target)) close();
}

/**
 * Bagstopper for `onFocusOutside`.
 *
 * `focusin` kræver at et andet element tager imod fokus, og der findes flader
 * hvor browseren flytter markøren uden at en focusin når frem til document.
 * Roden hører altid sin egen `focusout`, så den spørger om det samme.
 *
 * To regler holder den ude af Safari-fælden: svaret udskydes ét tik, og
 * `<body>` tæller IKKE som "udenfor". Klikker læreren på en chip, byttes
 * chip-rækken ud med spørgsmåls-trinnet, og den knap der havde fokus
 * forsvinder under os; fokus falder ned på <body>, og et `focusout` uden
 * efterfølger ser nøjagtig ud som "fokus forlod menuen". Lukkede vi på det,
 * nåede bekræftelsen aldrig at blive vist — målt: 7 af 9 webkit-tests faldt.
 */
function onRootFocusOut() {
    clearTimeout(focusOutTimer);
    focusOutTimer = setTimeout(() => {
        const root = rootRef.value;
        if (!root) return;                                  // menuen er væk
        const active = document.activeElement;
        if (!active || active === document.body) return;    // faldt på gulvet
        if (root.contains(active)) return;                  // stadig indeni
        close();
    }, 0);
}

function close() {
    reactiveState.previewRunIndex = null;
    emit('close');
}

// ─── Vandret placering ──────────────────────────────────────────────────────
// Menuen har BUNDBJÆLKEN som holdepunkt, ikke den 34 px brede knap: et
// absolut placeret element krymper til sin containing block, og med knappen
// som holdepunkt blev menuen 13 px bred med ét ord pr. linje. Til gengæld
// skal den så selv finde hen over knappen — det er det, de to mål her gør.
// Placeringen deles med afspilningsmenuen — se useBarPopover.js. Begge menuer
// hænger på den samme bundbjælke og skal stå ens i forhold til hver sin knap.
const { menuStyle, arrowStyle, position } = useBarPopover(rootRef, 'run-history-anchor', 296);

// Knappen der åbnede menuen — fokus skal tilbage dertil, når menuen lukker.
// Ellers falder markøren tilbage til <body>, og næste Tab starter forfra
// øverst på siden. Samme opførsel som modalvinduerne (useModalFocus).
let previouslyFocused = null;
let outsideTimer = null;
let focusOutTimer = null;

onMounted(() => {
    previouslyFocused = document.activeElement;
    nextTick(() => {
        position();
        // Fokus ind i menuen. Uden det åbnede menuen sig usynligt for en
        // skærmlæser: markøren blev på knappen, og der var intet der sagde,
        // at der nu stod fem kørsler at vælge imellem.
        rootRef.value?.querySelector('.chip')?.focus();
    });
    document.addEventListener('keydown', onKeydown, true);
    // Et lille ophold, så det tryk der ÅBNEDE menuen ikke selv lukker den igen.
    // Timeren gemmes: lukker menuen inden opholdet er ovre, ville lytteren
    // blive tilføjet EFTER oprydningen og aldrig blive fjernet igen.
    outsideTimer = setTimeout(() => {
        document.addEventListener('pointerdown', onClickOutside);
        // Samme ophold som pointerdown: menuen giver selv fokus til første
        // chip i nextTick, og den focusin må ikke lukke menuen igen.
        document.addEventListener('focusin', onFocusOutside);
    }, 0);
});

// Skiftet mellem chip-rækken og spørgsmålet ændrer menuens højde og bredde.
watch(selectedIndex, () => nextTick(position));

onUnmounted(() => {
    clearTimeout(outsideTimer);
    clearTimeout(focusOutTimer);
    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('pointerdown', onClickOutside);
    document.removeEventListener('focusin', onFocusOutside);
    reactiveState.previewRunIndex = null;
    // Fokus tilbage til knappen — men KUN hvis det ellers ville gå tabt.
    //
    // Menuen lukker to slags gange: fordi fokus FORSVANDT (Escape, eller en
    // chip der blev byttet ud under fingeren), og fordi tastaturet gik VIDERE
    // et andet sted hen (onFocusOutside). I det andet tilfælde havde læreren
    // netop valgt, hvor markøren skulle stå — og den ubetingede udgave rev den
    // tilbage. Målt 4/9: åbn menuen, tab videre til "Kopiér", tryk Enter.
    // Fokus stod på historik-knappen, så Enter åbnede menuen igen i stedet for
    // at kopiere; knappen kunne i praksis ikke tabbes forbi.
    const active = document.activeElement;
    if (active && active !== document.body) return;
    // isConnected: knappen kan være væk sammen med bundbjælken, hvis
    // kørslen der blev hentet ikke havde nogen grupper i denne visning.
    if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
});
</script>

<template>
  <div ref="rootRef" class="run-menu" :style="menuStyle" @mouseleave="clearPreview" @focusout="onRootFocusOut">

    <!-- Trin 2: spørgsmålet -->
    <div v-if="selectedIndex !== null" class="confirm-box">
      <p class="confirm-title">Hent kørsel {{ selectedIndex + 1 }}?</p>
      <p v-if="hiddenSetOnly" class="confirm-warning">
        Kortene ser ens ud, fordi du står i den anden visning — forskellen
        ligger i {{ SET_LABELS[hiddenSet] }}. Henter du kørslen, ændres {{ SET_LABELS[hiddenSet] }},
        uden at du kan se det herfra.
      </p>
      <p v-if="manualChanges" class="confirm-warning">
        Du har rettet i grupperne i hånden siden — flyttet elever, låst
        grupper eller ændret emner. Det forsvinder — men den fordeling du står
        med nu, bliver lagt øverst, så du kan hente den tilbage igen.
      </p>
      <!-- Spørgsmålet stilles KUN når reglerne eller indstillingerne
           faktisk er anderledes i dag end dengang. Er de ens, gør de to svar
           det samme, og så er der kun én knap. -->
      <p v-if="settingsChanged" class="confirm-text">
        Reglerne eller indstillingerne er ændret siden. Skal de fra dengang også med?
      </p>
      <div class="confirm-actions">
        <button class="k-back" @click="back">Tilbage</button>
        <button v-if="settingsChanged" class="k-alt" @click="restore(selectedIndex, true)">
          <SlidersHorizontal :size="11" /> Ja, tag alt med
        </button>
        <button class="btn-primary-confirm" @click="restore(selectedIndex, false)">
          <Undo2 :size="11" />
          {{ settingsChanged ? 'Nej, kun grupperne' : 'Hent kørslen' }}
        </button>
      </div>
    </div>

    <!-- Trin 1: Nu · 1 · 2 · 3 … -->
    <div v-else class="step-1">
      <div class="chips">
        <button
          class="chip chip-now"
          :class="{ active: reactiveState.previewRunIndex === null }"
          aria-label="Den fordeling der gælder nu"
          @mouseenter="clearPreview"
          @focus="clearPreview"
          @click="close">Nu</button>

        <span class="chip-divider"></span>

        <button
          v-for="run in runs"
          :key="run.id"
          class="chip"
          :class="{ active: reactiveState.previewRunIndex === run.index }"
          :aria-label="`Kørsel ${run.index + 1}: ${countLabel(run)}, ${run.rulesLabel}. ${changeLabel(run)}`"
          @mouseenter="preview(run.index)"
          @focus="preview(run.index)"
          @click="select(run.index)">{{ run.index + 1 }}<span
            v-if="onlyHiddenSetChanges(run)" class="dot" aria-hidden="true"></span></button>
      </div>

      <!-- Info om den kørsel musen peger på. Står HER i menuen, ikke i en
           tooltip — se pegetRun i scriptet for hvorfor. -->
      <p class="info">
        <template v-if="hoveredRun">
          {{ countLabel(hoveredRun) }} · {{ hoveredRun.presentCount }} elever · {{ hoveredRun.rulesLabel }}
        </template>
        <template v-else>Peg på et tal for at se kørslen i kortene</template>
      </p>
      <!-- Hvad et klik ændrer — i BEGGE gruppesæt, ikke kun det kortene viser.
           Uden den linje var to kørsler med samme matrix umulige at kende fra
           hinanden i matrixvisningen. -->
      <p v-if="hoveredRun" class="run-delta" :class="{ hiddenOnly: onlyHiddenSetChanges(hoveredRun) }">
        {{ changeLabel(hoveredRun) }}
      </p>
    </div>

    <span class="arrow" :style="arrowStyle"></span>
  </div>
</template>

<style scoped>
.run-menu {
    position: absolute;
    /* Lige over knappen — 100 % af knappens højde plus lidt luft. */
    inset-block-end: calc(100% + 10px);
    /* Vandret placering sættes i JS (se placer()) — den skal ligge over
       knappen, ikke midt i bjælken. */
    inset-inline-start: 0;
    z-index: 20;
    /* DÆKKENDE baggrund: --bg-modal lagt oven på sidens egen baggrund, samme
       løsning som Del-menuen (ShareMenu.vue). --bg-modal alene dækker kun
       92 % i mørkt tema, og gruppekortenes overskrifter kunne ses gennem
       bekræftelsen (målt 12/9). backdrop-filter virker ikke her: bundbjælken
       har selv en og er dermed menuens "backdrop root". */
    background: linear-gradient(var(--bg-modal), var(--bg-modal)), var(--bg-body);
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    box-shadow: 0 10px 30px oklch(0 0 0 / 18%);
    padding: 6px;
    box-sizing: border-box;
    /* FAST bredde, ikke shrink-to-fit. Menuen er absolut placeret inde i
       ankeret, som kun er 34 px bredt (ikon-knappen), og med
       inset-inline-start: 50% er den plads en automatisk bredde har at
       arbejde med kun det halve af det — 17 px. Både auto og max-content
       endte derfor med ét-to ord pr. linje. En fast bredde er ikke elegant,
       men den er forudsigelig; loftet holder menuen inden for en telefon. */
    /* Bredden sættes også i JS (placer()), som skrumper den på en smal
       skærm. Den står her, så menuen har en fornuftig bredde allerede i
       første billede, før målingen er kørt. */
    inline-size: 296px;
}

/* Den lille pil ned mod knappen */
.arrow {
    position: absolute;
    inset-block-start: 100%;
    /* Sættes i JS, så pilen bliver ved knappen, også når menuen er skubbet
       ind fra skærmkanten. */
    inline-size: 12px;
    block-size: 6px;
    /* Samme dækkende baggrund som menuen, så pilen ikke skiller sig ud. */
    background: linear-gradient(var(--bg-modal), var(--bg-modal)), var(--bg-body);
    border-inline: 1px solid var(--border-strong);
    border-block-end: 1px solid var(--border-strong);
    /* Trekant via clip-path — ingen ekstra elementer, ingen border-tricks. */
    clip-path: polygon(0 0, 100% 0, 50% 100%);
}

/* ── Trin 1: chips ── */
.chips {
    display: flex;
    align-items: center;
    gap: 3px;
    /* Menuen er bredere end chippene — hold dem samlet i midten. */
    justify-content: center;
    flex-wrap: wrap;
}

.chip {
    /* 34px: samme mål som pillerne i bundbjælken, så rækken flugter. */
    min-inline-size: 34px;
    block-size: 34px;
    padding: 0 9px;
    border-radius: 100px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.chip:hover,
.chip:focus-visible {
    background: var(--primary-light);
    color: var(--primary);
    border-color: var(--primary-border);
}
.chip.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
}
.chip-now { font-size: 11px; }

/* Chippen skal kunne bære prikken i sit eget hjørne. */
.chip { position: relative; }

/* Markør: hele forskellen ligger i det gruppesæt kortene IKKE viser, så
   forhåndsvisningen ser ud som om der ikke sker noget. Prikken er det eneste
   sted forskellen er synlig på selve chippen — teksten under rækken siger
   hvad det er. */
.dot {
    position: absolute;
    inset-block-start: 4px;
    inset-inline-end: 4px;
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    /* Samme temafølgende ravfarve som linjen under chippene (.run-delta.hiddenOnly).
       Den faste oklch(0.72 0.16 60) stod med kontrast 2,6:1 på lyst tema —
       under de 3:1 et mærke uden tekst skal have. Blandingen giver 5,8:1 på
       lyst og 12:1 på mørkt tema (målt 12/9). */
    background: color-mix(in oklch, var(--color-warning), var(--text-main) 40%);
}
.chip.active .dot { background: white; }

/* BEMÆRK — `margin`, ikke `gap`. De seks margin-erklæringer i denne
   stilblok (her, .run-delta, .chip-divider, .confirm-title, .confirm-warning
   og .confirm-text) blev 27/8 alle omdøbt til `gap` sammen med en JS-variabel
   af samme navn i placeringskoden ovenfor. `gap` tager højst to værdier og
   virker kun i en flex/grid-beholder — de er `<p>` og `<span>` — så alle seks
   erklæringer var ugyldige og faldt lydløst bort. Målt i browseren: `.info`
   og `.run-delta` stod med browserens egen afsnitsmargen (10px 0) i stedet
   for 6px 6px 2px og 0 6px 2px. Ingen fejl noget sted. Værn:
   `e2e/css_gyldighed.spec.ts` prøver hver erklæring i kilden af med
   CSS.supports() i alle tre browsere. */
.info {
    margin: 6px 6px 2px;
    font-size: 10px;
    line-height: 1.4;
    color: var(--text-muted);
    text-align: center;
    overflow-wrap: anywhere;
}

/* Ændrings-linjen. Lidt mørkere end .info, fordi den siger noget om
   KONSEKVENSEN af et klik og ikke bare beskriver kørslen. */
.run-delta {
    margin: 0 6px 2px;
    font-size: 10px;
    line-height: 1.4;
    color: var(--text-muted);
    text-align: center;
    overflow-wrap: anywhere;
}
.run-delta.hiddenOnly {
    /* Temaets advarselsfarve blandet med tekstfarven: mørkere ravfarve på lyst
       tema, lysere på mørkt. Den faste oklch(0.52 0.13 60) gav kun 3,2:1 i
       mørkt tema, og ren --color-warning ville give 2,9:1 i lyst — begge under
       de 4,5:1, som 10 px tekst skal have. Blandingen: 5,8:1 / 12:1 (målt 12/9). */
    color: color-mix(in oklch, var(--color-warning), var(--text-main) 40%);
    font-weight: 600;
}

.chip-divider {
    inline-size: 1px;
    block-size: 18px;
    background: var(--border-medium);
    margin-inline: 3px;
    flex-shrink: 0;
}

/* ── Trin 2: spørgsmålet ── */
.confirm-box {
    padding: 8px 10px 6px;
}

.confirm-title {
    margin: 0 0 5px;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-main);
}

.confirm-warning {
    margin: 0 0 8px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-main);
    /* Afledt af temaets advarselsfarve, ikke en fast lys ravfarve — samme
       løsning som .share-note i Del-menuen. Med den faste farve stod
       --text-main (lys i mørkt tema) på lys baggrund med kontrast 1,03:1, og
       advarslen "Du har rettet i grupperne i hånden…" så ud som en tom
       boks. Nu 12,9:1 på mørkt og 12,7:1 på lyst tema (målt 12/9).
       color-mix og ikke oklch(from …): den relative farvesyntaks kom først
       i Safari 18 og Firefox 128, og uden den faldt hele linjen væk — boksen
       stod uden farve. color-mix virker fra Safari 16.2 og giver det samme. */
    background: color-mix(in oklch, var(--color-warning) 14%, transparent);
    border: 1px solid color-mix(in oklch, var(--color-warning) 35%, transparent);
    border-radius: 7px;
    padding: 7px 9px;
}

.confirm-text {
    margin: 0 0 9px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-muted);
}

.confirm-actions {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    justify-content: flex-end;
}

.k-back,
.k-alt,
.btn-primary-confirm {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    block-size: 30px;
    padding: 0 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--border-medium);
    transition: background 0.15s, border-color 0.15s;
}

.k-back,
.k-alt {
    background: transparent;
    color: var(--text-muted);
}
.k-back:hover,
.k-alt:hover {
    background: var(--bg-surface-hover);
    color: var(--text-main);
    border-color: var(--border-strong);
}

.btn-primary-confirm {
    background: var(--primary);
    border-color: var(--primary);
    color: white;
}
.btn-primary-confirm:hover { background: var(--primary-hover); }
</style>
