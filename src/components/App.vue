<script setup>
import { computed, defineAsyncComponent, nextTick, onErrorCaptured, ref, watch } from 'vue';
import { reactiveState as state } from '../js/modules/reactiveState.js';

import AppTopbar from './AppTopbar.vue';
import ClassView from './views/ClassView.vue';
import DashboardView from './views/DashboardView.vue';
// Sjældent-besøgte views — code-splittes til separate chunks. Spinner-fri:
// med en god forbindelse er chunken klar inden teknik-tabben er åbnet ud.
const HelpView = defineAsyncComponent(() => import('./HelpView.vue'));
const GdprView = defineAsyncComponent(() => import('./GdprView.vue'));
const EduGuideView = defineAsyncComponent(() => import('./EduGuideView.vue'));
const ImportExportTab = defineAsyncComponent(() => import('./views/ImportExportTab.vue'));
import ModalsRoot from './ModalsRoot.vue';
const BetaStyles = defineAsyncComponent(() => import('./beta/BetaStyles.vue'));
const SmallScreenNotice = defineAsyncComponent(() => import('./beta/SmallScreenNotice.vue'));
// Telefonbeskeden ("Grupper er lavet til computer"): kun under 700 px, og
// kun til den lukkes (SmallScreenNotice gemmer det).
const showSmallScreenNotice = (() => {
    if (typeof window === 'undefined' || !window.matchMedia?.('(max-width: 700px)').matches) return false;
    try { return localStorage.getItem('grupper-smal-skaerm-set') !== '1'; } catch { return true; }
})();
import { TriangleAlert, X } from 'lucide-vue-next';
import { cancelGeneration } from '../js/modules/generation.js';
import { nextRun } from '../js/modules/nextEngine.js';
import { setBlockingOverlay } from '../composables/useModalFocus.js';

// Motoren fortæller undervejs, hvor langt den er. Linjen står kun, mens den kører.
const nextProgressText = computed(() => {
    const p = nextRun.value.progress;
    if (!p) return '';
    const parts = [];
    if (p.text) parts.push(p.text);
    if (p.rulesTotal > 0) parts.push(`${p.rulesMet} af ${p.rulesTotal} ${p.rulesTotal === 1 ? 'regel' : 'regler'} opfyldt`);
    if (p.atBestPossible) parts.push('så godt, som det kan blive');
    if (Number.isFinite(p.seconds)) parts.push(`${Math.round(p.seconds)} sek.`);
    return parts.join(' · ');
});
import { checkForNewBuild, isChunkLoadError, PART_UNAVAILABLE_MESSAGE } from '../js/modules/newBuild.js';

// Error boundary — catch uncaught errors in child components
const appError = ref(null);
onErrorCaptured((err, instance, info) => {
    console.error('[App] Uncaught error:', err, info);
    // En side (Hjælp, GDPR, vejledningen, Import & backup) kunne ikke hentes.
    // Browserens egen tekst ("Unable to preload CSS for …") siger læreren
    // intet. Er der kommet en ny udgave, melder newBuild.js det selv; ellers
    // er det forbindelsen.
    if (isChunkLoadError(err)) {
        (checkForNewBuild() || Promise.resolve(false)).then((isNew) => {
            if (!isNew) appError.value = PART_UNAVAILABLE_MESSAGE;
        });
        return false;
    }
    appError.value = err.message || 'Ukendt fejl';
    // Return false to stop propagation
    return false;
});

function dismissError() {
    appError.value = null;
}

function onCancelGeneration() {
    cancelGeneration();
}

// ─── Gruppedannelsen for en skærmlæser ──────────────────────────────────
// Overlayet nedenfor var indtil nu en TEGNING: en sløret flade, en snurrende
// ring og teksten "Genererer grupper...". Intet af det siges. En kørsel på et
// stort hold tager ti sekunder eller mere, og i hele det spand fik en
// skærmlæserbruger ingenting at vide — hverken at der skete noget, eller at
// det var slut. Kun de kørsler, der HAR en bemærkning, endte i en toast.
//
// To ting retter det. Overlayet er nu en rigtig dialog, der er navngivet af
// sin egen tekst, og fokus flyttes til "Stop": så bliver "Genererer
// grupper..., dialog, Stop, knap" læst op af sig selv, og udgangen er ét
// tastetryk væk i stedet for bag hele siden. Og resultatet meldes i feltet
// under — det er ALTID i DOM'en, for et element der indsættes samtidig med
// sin tekst, læses ofte op tomt (samme grund som .pick-status i
// GroupResultsPanel).
const generationDone = ref('');
const stopBtn = ref(null);
let focusBeforeGeneration = null;

// Hvilke grupper stod der, da kørslen gik i gang? Se "Nye grupper?" nedenfor.
let groupsBeforeGeneration = null;
let classBeforeGeneration = null;

function shownGroups() {
    return state.activeView === 'matrix'
        ? state.storedMatrixGroups
        : state.storedStandardGroups;
}

watch(() => state.isGenerating, async (running) => {
    if (running) {
        generationDone.value = '';
        focusBeforeGeneration = document.activeElement;
        groupsBeforeGeneration = shownGroups();
        classBeforeGeneration = state.currentClass?.filename || null;
        await nextTick();
        stopBtn.value?.focus();
        // Siden bagved er inert, mens laget står (skærmlæserens læsemarkør
        // går uden om Tab-fastholdelsen). Kun hvis kørslen ikke allerede er
        // slut — ellers ville siden blive hængende inert.
        if (state.isGenerating && stopBtn.value?.isConnected) {
            setBlockingOverlay(stopBtn.value.closest('.processing-overlay'));
        }
        return;
    }
    // FØR fokus gives tilbage nedenfor: knappen ligger i den inerte side
    setBlockingOverlay(null);

    // Fokus tilbage til knappen der startede kørslen — men KUN hvis det stadig
    // står på "Stop". Er markøren endt et andet sted undervejs — en
    // skærmlæser flytter den, og browserens egen søgefelt-genvej gør det
    // også — ville vi ellers rive den væk fra læreren.
    const takeFocusBack = !!stopBtn.value && document.activeElement === stopBtn.value;
    const back = focusBeforeGeneration;
    focusBeforeGeneration = null;

    // NYE GRUPPER? Kun en kørsel, der lykkedes, lægger et NYT gruppesæt i
    // tilstanden (generation.js erstatter hele listen). Før talte vi bare de
    // grupper, der stod på skærmen — men en stoppet kørsel, en motorfejl og
    // et skift til en anden klasse undervejs efterlader alle nogle grupper:
    // de gamle, eller den anden klasses. Så sagde skærmlæseren "6 grupper
    // dannet." lige efter toasten "Gruppedannelsen blev stoppet. Dine
    // nuværende grupper er urørte." Nu siges der kun noget, når listen er
    // skiftet ud i den samme klasse; alt andet siger toasten selv
    // (role=alert/status), og en ekstra melding her ville være forkert.
    const groups = shownGroups();
    const replaced = groups !== groupsBeforeGeneration
        && (state.currentClass?.filename || null) === classBeforeGeneration;
    groupsBeforeGeneration = null;
    classBeforeGeneration = null;
    const count = Array.isArray(groups) ? groups.length : 0;
    generationDone.value = replaced && count > 0
        ? `${count} ${state.activeView === 'matrix' ? 'matrixgrupper' : 'grupper'} dannet.`
        : '';

    await nextTick();
    if (takeFocusBack && back && back.isConnected && !back.disabled) back.focus();
});

const currentViewComponent = computed(() => {
    switch (state.navView) {
        case 'class':
            return ClassView;
        case 'import':
            return ImportExportTab;
        case 'help': return HelpView;
        case 'edu': return EduGuideView;
        case 'gdpr': return GdprView;
        default:
            return DashboardView;
    }
});
</script>

<template>
  <div class="layout">
    <!-- Vinduer -->
    <ModalsRoot />

    <!-- Topbjælken -->
    <AppTopbar />

    <!-- Fælles stil, og telefonbeskeden én gang -->
    <BetaStyles />
    <SmallScreenNotice v-if="showSmallScreenNotice" />

    <!-- Indholdet -->
    <main class="main-content">
        <component :is="currentViewComponent" :key="state.navView" />

        <!-- Fejlbanner -->
        <div v-if="appError" class="error-banner" role="alert">
            <span class="error-content"><TriangleAlert :size="16" /> Der opstod en fejl: {{ appError }}</span>
            <button @click="dismissError" class="error-dismiss" title="Luk"><X :size="16" /></button>
        </div>

        <!-- Lag mens grupperne dannes -->
        <!-- @keydown.tab: dialogen har præcis ÉN knap, og alt andet på siden
             ligger bag den slørede flade. Uden fastholdelsen tabber man ud i
             en side, man ikke kan se — og aria-modal="true" har allerede sagt
             til skærmlæseren, at resten ikke er der. -->
        <div v-if="state.isGenerating" class="processing-overlay"
             role="dialog" aria-modal="true" aria-labelledby="generation-title"
             @keydown.tab.prevent="stopBtn?.focus()">
            <div class="spinner"></div>
            <div class="processing-text" id="generation-title">{{ nextRun.stopping ? 'Stopper …' : 'Danner grupper …' }}</div>
            <!-- Fremgangen fra motoren: læreren kan se, at der sker noget,
                 og stoppe, når grupperne er gode nok. -->
            <p v-if="nextRun.active && nextProgressText" class="processing-progress" role="status" aria-live="polite">{{ nextProgressText }}</p>
            <!-- Udgangen. En kørsel kan tage minutter på et stort hold, og
                 uden den her knap er genindlæsning af fanen det eneste svar
                 på "jeg valgte forkert" og på en motor der er gået i stå. -->
            <button class="cancel-generation" ref="stopBtn" :disabled="nextRun.stopping" @click="onCancelGeneration">{{ nextRun.active ? 'Stop og behold de bedste' : 'Stop' }}</button>
        </div>

        <!-- Resultatet af kørslen, kun for skærmlæsere. Se kommentaren ved
             watch(isGenerating) ovenfor. -->
        <p class="visually-hidden" role="status" aria-live="polite">{{ generationDone }}</p>
    </main>
  </div>
</template>

<style scoped>
.layout {
    display: flex;
    flex-direction: column;
    /* dvh, ikke vh: ellers æder adresselinjen i iOS Safari 60-100 px af
       højden. 100 % i bredden, ikke 100vw, som med en rullebjælke bliver
       bredere end vinduet. */
    block-size: 100dvh;
    inline-size: 100%;
    overflow: hidden;
    background: var(--bg-body);
}

.main-content {
    flex: 1;
    overflow-y: auto;
    background: transparent;
    position: relative;
    background-image: radial-gradient(circle, var(--primary-bg-light) 1px, transparent 1px);
    background-size: 40px 40px;
}

/* Læses op, ses ikke. Ikke display:none og ikke hidden — begge dele tager
   teksten ud af skærmlæserens verden, og så melder den ingenting. */
.visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}

/* FIXED, IKKE ABSOLUTE — og det er ikke en smagssag.
 *
 * Overlayet lå med `position: absolute` inde i `.main-content`, som selv
 * ruller (`overflow-y: auto`). Så er `top: 0` toppen af INDHOLDET, ikke af
 * skærmen, og `height: 100%` er kun én skærmfuld. Målt i browseren med 60
 * elever: rul 600 px ned midt i en kørsel, og overlayet stod fra -535 til
 * 120 px — altså over skærmkanten. Fra 120 px og ned lå elevtabellen fri:
 * `elementFromPoint()` svarede `td.cell-data "Elev 16"`. Læreren kunne rette
 * et navn, sætte flueben ved fraværende eller slette en elev, MENS motoren
 * regnede på den liste — og resultatet lander bagefter med en elev, der ikke
 * findes længere (hun står som sit interne id, `r7`, på gruppekortet).
 * Samtidig var "Stop" rullet ud af skærmen, så en lang kørsel ikke kunne
 * standses uden at rulle op igen.
 *
 * `position: fixed` + `inset: 0` binder overlayet til skærmen i stedet for
 * til indholdet: det dækker alt, uanset hvor der er rullet hen, og "Stop" er
 * altid at se. Det er også først nu, at `aria-modal="true"` på dialogen taler
 * sandt — topbaren lå før uden for fladen og kunne klikkes.
 *
 * z-index 2500: over regel- og emneskufferne (2100/2200) og over vinduerne
 * (2000), men under indlæseren (9999) og notifikationerne (10000), som skal
 * kunne ses ovenpå. */
.processing-overlay {
    position: fixed;
    inset: 0;
    background: var(--border-subtle);
    backdrop-filter: blur(12px) saturate(160%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 2500;
    animation: fade-in 0.3s ease-out;
}

/* Kun opaciteten animeres. Et animeret backdrop-filter tegner baggrunden
   om i hvert billede og gør rulning tung på telefoner og gamle Chromebooks. */
@keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
}

.cancel-generation {
    margin-block-start: 24px;
    padding: 8px 22px;
    min-block-size: 44px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    background: transparent;
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease;
}

.cancel-generation:hover {
    color: var(--text-main);
    border-color: var(--text-muted);
}

.processing-progress {
    margin-block: 10px 0;
    font: 500 12px var(--mono);
    color: var(--text-muted);
    text-align: center;
    max-inline-size: 36em;
}

.cancel-generation:disabled { opacity: 0.6; cursor: default; }

.processing-text {
    margin-top: 20px;
    font-size: 14px;
    font-weight: 700;
    color: var(--primary);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    animation: text-pulse 1.5s ease-in-out infinite;
}

@keyframes text-pulse {
    0%, 100% { opacity: 0.6; transform: scale(0.98); }
    50% { opacity: 1; transform: scale(1); }
}

.spinner {
    width: 48px;
    height: 48px;
    border: 3px solid var(--primary-light);
    border-top: 3px solid var(--primary);
    border-right: 3px solid var(--primary);
    border-radius: 50%;
    animation: spin-premium 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    box-shadow: 0 0 15px var(--primary-border);
}

@keyframes spin-premium {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.error-banner {
    /* Lige UNDER topbjælken og over siden. Banneret stod før med top: 0 og
       z-index 100 — men topbjælken er sticky med z-index 1000, så banneret lå
       BAG den: i siden, men aldrig på skærmen (målt 24/9: midtpunktet ramte
       .nav-center). Enhver fejl, som fejlfangeren i App.vue tog, var tavs.
       Under bjælken i stedet for oven på den, så klassevælger og menuer
       stadig kan nås, mens beskeden står. Modaler (2000) ligger stadig over. */
    position: fixed;
    top: var(--header-height);
    left: 0;
    right: 0;
    z-index: 1001;
    background: var(--color-error-bg);
    border-bottom: 2px solid var(--color-error-border);
    color: var(--color-error);
    padding: 10px 16px;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    backdrop-filter: blur(12px);
}

.error-dismiss {
    background: none;
    border: none;
    color: var(--color-error);
    font-size: 16px;
    cursor: pointer;
    padding: 2px 6px;
}

.error-dismiss:hover {
    color: var(--color-error);
}
</style>
