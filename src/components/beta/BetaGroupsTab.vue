<script setup>
// Grupper-fanen: opskriftens bjælke øverst, grupperne nedenunder.
//
// Opsætningen står i opskriften (RecipePanel); resten er fælles komponenter:
// gruppekortene med træk-og-slip, lås, fravær, efternøler og bjælken i bunden
// (GroupResultsPanel), beskederne over grupperne (HintsStack) og alle vinduer.
// (Den gamle skærm, GroupsTab.vue, blev slettet 2/11 2026.)
//
// Matrix-runden har sin egen opskrift (MatrixRecipePanel) — runde 2.
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { reactiveState } from '../../js/modules/reactiveState.js';
import { debounce } from '../../js/modules/utils.js';
import GroupResultsPanel from '../views/GroupResultsPanel.vue';
import HintsStack from '../HintsStack.vue';
import { isRecipeHint } from '../../js/modules/recipe.js';
import { handleGenerate } from '../../js/modules/generation.js';
import * as groupActions from '../../js/modules/groupActions.js';
import * as classActions from '../../js/modules/classActions.js';
import RecipePanel from './RecipePanel.vue';
import MatrixRecipePanel from './MatrixRecipePanel.vue';
import ClassShow from './ClassShow.vue';
import RecipeGuide from './RecipeGuide.vue';

const props = defineProps({
    idColumn: { type: String, required: true }
});

const isMatrix = computed(() => reactiveState.activeView === 'matrix');
const showingClass = ref(false);

// ── Antal kolonner i gruppenettet ──────────────────────────────────────────
// Med `auto-fill` lavede 6 grupper på en 2560 px bred skærm otte kolonner og
// stod klemt i de venstre 60 %; og 6 grupper i fem kolonner (1366/1920 px)
// efterlod én gruppe alene på sidste række. Her måles bredden, og antallet af
// kolonner vælges, så sidste række bliver så fuld som muligt. Vi vælger ikke
// under halvdelen af det, der kan være plads til (så 7 grupper ikke bliver til
// én lang søjle), og ved lige gode valg vinder det største antal.
const MIN_COL = 280;   // px — samme mindstebredde som før
const COL_GAP = 36;    // px — samme mellemrum som i CSS nedenfor
const root = ref(null);
const groupCount = computed(() => {
    const list = isMatrix.value ? reactiveState.storedMatrixGroups : reactiveState.storedStandardGroups;
    return Array.isArray(list) ? list.length : 0;
});
const hasGroups = computed(() => groupCount.value > 0);

function pickColumns(width, n) {
    const fit = Math.max(1, Math.floor((width + COL_GAP) / (MIN_COL + COL_GAP)));
    if (n <= 1) return 1;
    const most = Math.min(fit, n);
    const least = Math.min(most, Math.max(fit > 1 ? 2 : 1, Math.ceil(fit / 2)));
    let best = most, bestGap = Infinity;
    for (let c = most; c >= least; c--) {
        const gap = (c - (n % c)) % c; // tomme pladser på sidste række
        if (gap < bestGap) { best = c; bestGap = gap; }
    }
    return best;
}
function updateColumns() {
    const el = root.value;
    if (!el) return;
    // Nettets egen bredde (uden sidens kanter): målt på nettet, når det findes
    const grid = el.querySelector('.group-grid');
    const width = grid ? grid.clientWidth : el.clientWidth;
    if (width > 0) el.style.setProperty('--beta-cols', String(pickColumns(width, groupCount.value)));
}
let resizeObserver = null;
onMounted(() => {
    updateColumns();
    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(updateColumns);
        resizeObserver.observe(root.value);
    }
});
onUnmounted(() => resizeObserver?.disconnect());
// Nettet kommer først med de første grupper, og antallet ændres med tilføj/slet
watch([groupCount, isMatrix], () => nextTick(updateColumns));

function onSwitchView(mode) {
    groupActions.setViewMode(mode);
}

/**
 * Skriv opskriftens indstillinger på klassen. Giver true, hvis noget faktisk
 * blev ændret.
 *
 * Tal og tekst regnes ens: ældre klasser har gruppestørrelsen gemt som
 * tekst ("4"), mens feltet giver et tal (4). Før talte det som en ændring,
 * så bare at klikke i feltet og videre gemte klassen. Med samme klasse åben
 * i to faner skrev den gamle fane så hele sin udgave af klassen over den
 * nye fanes rettelser (målt 10/11 2026, e2e/to_faner.spec.ts).
 */
function sameSettings(a, b) {
    if (!a || !b) return false;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        if (String(a[k] ?? '') !== String(b[k] ?? '')) return false;
    }
    return true;
}

function saveSettings(settings) {
    if (!reactiveState.currentClass) return false;
    const settingsKey = isMatrix.value ? 'matrixSettings' : 'settings';
    const saved = {
        groupMode: settings.groupMode,
        groupTarget: settings.groupTarget,
        groupMod: settings.groupMod
    };
    if (settings.matrixStrategy) saved.matrixStrategy = settings.matrixStrategy;
    if (settings.matrixRepresentationType) saved.matrixRepresentationType = settings.matrixRepresentationType;
    if (sameSettings(reactiveState.currentClass[settingsKey], saved)) return false;
    reactiveState.currentClass[settingsKey] = saved;
    return true;
}

function onGenerate(settings) {
    saveSettings({
        groupMode: settings.mode,
        groupTarget: settings.target,
        groupMod: settings.mod,
        matrixStrategy: settings.matrixStrategy,
        matrixRepresentationType: settings.matrixRepresentationType,
    });
    handleGenerate({
        mode: settings.mode,
        target: settings.target,
        mod: settings.mod,
        matrixStrategy: settings.matrixStrategy,
        matrixRepresentationType: settings.matrixRepresentationType
    });
}

// Mange klik i træk bliver til ét gem.
const debouncedAutoSave = debounce(() => {
    classActions.autoSave();
}, 1000);

function onRulesChanged() {
    debouncedAutoSave();
}

function onSettingsChanged(settings) {
    // Intet nyt (fx et klik i feltet og videre): intet gem.
    if (saveSettings(settings)) debouncedAutoSave();
}

// Over grupperne står kun det, der handler om de dannede grupper. Advarsler om
// opsætningen står i gruppeopskriften — se isRecipeHint i recipe.js.
const isResultHint = (h) => !isRecipeHint(h);
</script>

<template>
    <div id="tab-groups" class="tab-content groups-tab-content beta-groups" ref="root">
        <component :is="isMatrix ? MatrixRecipePanel : RecipePanel"
            :id-column="idColumn"
            :has-groups="hasGroups"
            @generate="onGenerate"
            @rulesChanged="onRulesChanged"
            @settingsChanged="onSettingsChanged"
            @switchView="onSwitchView"
            @showClass="showingClass = true"
        >
            <!-- Bemærkningerne fra sidste dannelse står i opskriftens vindue (RecipeLastRun). -->
            <HintsStack :filter="isResultHint" />
            <div class="groups-scroll-content">
                <GroupResultsPanel
                    :is-matrix="isMatrix"
                    :id-column="idColumn"
                />
            </div>
        </component>

        <ClassShow v-if="showingClass" @close="showingClass = false" />

        <!-- Den korte første-gangs-guide til opskriften (kommer én gang, "Vis guide" i bjælken henter den igen) -->
        <RecipeGuide :has-groups="hasGroups" />
    </div>
</template>

<style>
/* ── Arket: gruppekortene i beta ────────────────────────────────────────────
   Kortene er de almindelige (GroupCard.vue) med al deres træk-og-slip, lås og
   fravær. Her ændres kun udseendet, og kun i beta (html.beta): ingen kasse,
   en streg foroven, navnene som en liste — som et ark man kan læse. Ikke
   scoped, fordi reglerne skal ramme GroupCard's elementer; stilarket hentes
   kun sammen med beta's Grupper-fane. */
html.beta .group-grid {
    /* Antallet af kolonner måles i BetaGroupsTab (--beta-cols), så sidste
       række ikke står med én gruppe alene, og så grupperne bruger hele
       bredden. Ingen kolonne bliver bredere end 640 px: to grupper på en
       stor skærm skal ikke være to enorme søjler. */
    grid-template-columns: repeat(var(--beta-cols, 4), minmax(0, 640px));
    justify-content: start;
    column-gap: 36px;
    row-gap: 28px;
    /* Luft under bjælken, så dens streg og kortenes streg ikke står tæt
       som en dobbeltstreg. */
    padding-block-start: 12px;
}
html.beta .group-card {
    background: transparent;
    border: none;
    /* En tynd, lys streg — kun nok til at skille grupperne ad. En sort streg
       over hvert kort blev til fire tunge vandrette linjer på række. */
    border-block-start: 1px solid var(--rule);
    border-radius: 0;
    box-shadow: none;
}
html.beta .group-card:hover {
    transform: none;
    box-shadow: none;
}
html.beta .group-card.locked {
    background: var(--paper-2);
    border-block-start-color: var(--ink-3);
}
/* Når en elev trækkes hen over en gruppe: kun en svag tone og stregen
   foroven i accentfarven — ingen ramme rundt om. */
html.beta .group-card.drag-over {
    background: color-mix(in oklch, var(--primary) 5%, transparent);
    border-block-start-color: var(--primary);
    box-shadow: none;
}
html.beta .group-header-row {
    background: transparent;
    border-block-end: none;
    border-radius: 0;
    padding: 0;
    block-size: 44px;
}
html.beta .group-title {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--ink);
}
/* `.group-card` foran: Rolig-temaets regel for felter (rolig-tema.css) giver
   alle tekstfelter en streg foroven og er lige så stærk som denne. */
html.beta .group-card .group-topic-input {
    border: none;
    border-block-start: none;
    border-block-end: 1px dashed transparent;
    border-radius: 0;
    /* background-color, ikke background: genvejen nulstiller også
       background-image, og dér ligger emnevælgerens pil (.topic-select i
       GroupCard.vue). Uden pilen lignede valget almindelig tekst. */
    background-color: transparent;
    box-shadow: none;
    text-align: end;
    color: var(--ink-2);
    font-weight: 600;
}
html.beta .group-card .group-topic-input:hover,
html.beta .group-card .group-topic-input:focus {
    border-block-end-color: var(--rule-2);
    box-shadow: none;
}
/* Emnefeltet og emnevælgeren fik ingen synlig markering ved tastaturfokus:
   rolig-temaet fjerner den, og hover-stregen ovenfor er kun for musen. Samme
   ring som på alle andre knapper og felter i beta. */
html.beta .group-card .group-topic-input:focus-visible,
html.beta .group-card .topic-select:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 6px;
}
html.beta .group-topic-input::placeholder { color: var(--ink-4); font-weight: 500; }
html.beta .group-members-list {
    padding: 2px 0 6px;
}
html.beta .group-members-list li {
    font-size: 14.5px;
    padding: 4px 6px;
    margin-inline: -6px;
    border-radius: 6px;
}

/* ── Bundlinjen (Del, Tags, Kopiér … Gem) ───────────────────────────────────
   Den almindelige Grupper har en svævende pille midt på skærmen med glas og
   skygge. I beta er det en flad linje i fuld bredde med en hårlinje foroven —
   som en sidefod på arket. Handlingerne står i midten: med intet i venstre side
   klumpede de sig til højre, og linjen så skæv ud. Knapperne og deres logik er
   de almindelige (GroupResultsPanel.vue) — her ændres kun udseendet. */
html.beta .floating-action-bar {
    inset-block-end: 0;
    inset-inline: 0;
    transform: none;
    animation: none;
    block-size: 52px;
    padding-inline: 24px;
    justify-content: center;
    gap: 6px;
    background: var(--paper);
    backdrop-filter: none;
    border: none;
    border-block-start: 1px solid var(--rule);
    border-radius: 0;
    box-shadow: none;
}
html.beta .floating-action-bar .bar-sep {
    background: var(--rule);
    margin-inline: 6px;
}
html.beta .floating-action-bar .action-pill,
html.beta .floating-action-bar .trash-zone-floating {
    border-radius: 7px;
    color: var(--ink-2);
}
html.beta .floating-action-bar .action-pill {
    font-size: 12.5px;
    font-weight: 600;
}
html.beta .floating-action-bar .action-pill:hover:not(:disabled) {
    background: var(--paper-3);
    color: var(--ink);
    transform: none;
}
/* Telefon: rækken af handlinger er bredere end skærmen, og centreret blev den
   skåret af i BEGGE sider (Del og Tags til venstre, Gem til højre). Her står
   kun ikonerne — teksten er der stadig for skærmlæsere og som tip — og
   `safe center` lægger rækken fra venstre, hvis den alligevel ikke kan være
   der. Ingen overflow-rulning: den klippede Del- og Gem-menuerne væk. */
@media (max-width: 700px) {
    html.beta .floating-action-bar {
        justify-content: safe center;
        padding-inline: 4px;
        gap: 0;
    }
    html.beta .floating-action-bar .bar-sep { display: none; }
    html.beta .floating-action-bar .action-pill-group { gap: 0; }
    html.beta .floating-action-bar .action-pill,
    html.beta .floating-action-bar .trash-zone-floating {
        min-inline-size: 34px;
        inline-size: auto;
        padding-inline: 8px;
        justify-content: center;
        flex-shrink: 0;
    }
    html.beta .floating-action-bar .action-pill > span {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }
}
html.beta .floating-action-bar .action-pill.active {
    background: color-mix(in oklch, var(--primary) 10%, transparent);
    border-color: transparent;
    color: var(--primary);
}

/* ── Advarslerne over grupperne (HintsStack.vue) ────────────────────────────
   I den almindelige Grupper er de farvede kasser med skygge. På arket er de en
   stille linje med en farvet streg i venstre side — de skal kunne ses, men
   ikke råbe højere end grupperne. */
html.beta .hints-stack { gap: 2px; margin-block: 10px 6px; }
html.beta .gh-hint,
html.beta .gh-hint--conflict,
html.beta .gh-hint--info {
    background: transparent;
    border: none;
    border-inline-start: 2px solid var(--color-warning);
    border-radius: 0;
    box-shadow: none;
    padding-block: 3px;
    padding-inline: 10px 4px;
    color: var(--ink-2);
    font-size: 12.5px;
}
html.beta .gh-hint--conflict { border-inline-start-color: var(--color-error); }
html.beta .gh-hint--info { border-inline-start-color: var(--primary); }
html.beta .gh-hint-icon { color: var(--ink-3); }
html.beta .gh-hint-action {
    min-block-size: 30px;
    background: var(--paper-3);
    border: none;
    border-radius: 7px;
    color: var(--ink);
}
html.beta .gh-hint-action:hover:not(:disabled) {
    background: color-mix(in oklch, var(--primary) 12%, transparent);
    color: var(--primary);
}

/* ── Emnet og matrix-mærkerne ───────────────────────────────────────────────
   GroupCard farver emnet og elevernes oprindelses-mærker (matrix) med en
   flade pr. emne (getColorForString, sat som inline style). På arket var det
   de eneste farveflader — en blok i fuld bredde ved hver titel og et farvet
   mærke ved hver elev. Her er de tekst: emnet i ink-2 ved titlen, mærket i
   ink-3 efter navnet. `!important` fordi farven står i style-attributten. */
html.beta .group-card .topic-select {
    background-color: transparent !important;
    color: var(--ink-2) !important;
    border: none;
    box-shadow: none;
    text-align: end;
}
html.beta .group-card .topic-select:hover,
html.beta .group-card .topic-select:focus-visible {
    background-color: var(--paper-3) !important;
    color: var(--ink) !important;
}
html.beta .group-card .badge-origin {
    background: transparent !important;
    color: var(--ink-3) !important;
    border: none;
    padding: 0;
    margin-inline-start: 6px;
    font-size: 11.5px;
    font-weight: 500;
}
</style>
