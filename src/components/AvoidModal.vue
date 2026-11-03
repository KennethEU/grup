<script setup>
// Undgåelser-vinduet. Lå før inde i StudentsTab.vue som en løs
// `<Teleport><div class="avoid-modal-backdrop">`, og manglede alt det, de
// øvrige vinduer får af useModalFocus:
//
//   - Escape lukkede det ikke. Tasten lå på `@keydown.escape` på selve
//     backdrop-div'en, som ikke kan få fokus — så den kunne kun affyres, hvis
//     læreren tilfældigvis stod i noget INDE i vinduet. Målt: fokus blev
//     siddende på "Undgåelser"-knappen bagved, og Escape gjorde ingenting.
//   - Fokus flyttede ikke ind, og Tab gik lige forbi vinduet ned i siden
//     bagved — målt: første Tab landede på næste knap i værktøjslinjen,
//     under det slørede overlay.
//   - Og fordi backdroppen ikke hedder `.modal-overlay`, kunne hverken
//     klassemenuen, de to skuffer eller elevmarkeringen se, at der lå et
//     vindue ovenpå. Deres Escape-tjek slog op på netop den klasse.
//
// Som selvstændig komponent bliver den v-if'et ude fra, og så følger
// useModalFocus' livscyklus vinduet i stedet for fanen — det var derfor,
// composable'en ikke bare kunne kaldes fra StudentsTab.
//
// ÉT vindue, to faner. Undgåelser lå før i deres eget vindue uden faner, så
// "Lav aftale" førte to steder hen alt efter hvilket menupunkt læreren valgte
// — og kun det ene af vinduerne var dækket af Escape-testen.
import { computed, nextTick, ref } from 'vue';
import { useModalFocus } from '../composables/useModalFocus.js';
import AvoidTab from './views/AvoidTab.vue';
import { reactiveState } from '../js/modules/reactiveState.js';

const emit = defineEmits(['close']);

const overlayRef = ref(null);
const togetherTabRef = ref(null);
const separateTabRef = ref(null);

// Fanen står i state, så den der åbner vinduet bestemmer hvilken slags aftale
// læreren kigger på. Den overlever ikke et klasseskift (se classMemory.js).
const activeTab = computed({
    get: () => (reactiveState.agreementTab === 'separate' ? 'separate' : 'together'),
    set: (v) => { reactiveState.agreementTab = v; }
});
const togetherCount = computed(() => reactiveState.currentClass?.togetherGroups?.length || 0);
const separationCount = computed(() => reactiveState.currentClass?.separations?.length || 0);

// Piletaster mellem fanerne, som en fanerække skal kunne. Uden dem er
// role="tablist" et løfte, tastaturet ikke kan indfri. Med kun to faner er
// venstre og højre den samme bevægelse: skift til den anden.
function moveTab() {
    const next = activeTab.value === 'together' ? 'separate' : 'together';
    activeTab.value = next;
    nextTick(() => (next === 'together' ? togetherTabRef : separateTabRef).value?.focus());
}

const { onBackdropClick } = useModalFocus(overlayRef, { onEscape: () => emit('close') });
</script>

<template>
    <div ref="overlayRef" class="avoid-modal-backdrop" role="dialog" aria-modal="true"
         aria-labelledby="dlg-aftaler" @click.self="onBackdropClick">
        <div class="avoid-modal">
            <div class="avoid-modal-header">
                <h3 class="avoid-modal-title" id="dlg-aftaler">Aftaler</h3>
                <button class="avoid-modal-close" aria-label="Luk" @click="$emit('close')">&times;</button>
            </div>
            <div class="agreement-tabs" role="tablist" aria-label="Aftaletyper"
                 @keydown.left.prevent="moveTab()" @keydown.right.prevent="moveTab()">
                <button
                    ref="togetherTabRef"
                    id="tab-together"
                    class="agreement-tab"
                    :class="{ 'agreement-tab--active': activeTab === 'together' }"
                    type="button"
                    role="tab"
                    aria-controls="panel-aftaler"
                    :aria-selected="activeTab === 'together'"
                    :tabindex="activeTab === 'together' ? 0 : -1"
                    @click="activeTab = 'together'"
                >
                    Skal sammen
                    <span v-if="togetherCount" class="agreement-count">{{ togetherCount }}</span>
                </button>
                <button
                    ref="separateTabRef"
                    id="tab-separate"
                    class="agreement-tab agreement-tab--conflict"
                    :class="{ 'agreement-tab--active': activeTab === 'separate' }"
                    type="button"
                    role="tab"
                    aria-controls="panel-aftaler"
                    :aria-selected="activeTab === 'separate'"
                    :tabindex="activeTab === 'separate' ? 0 : -1"
                    @click="activeTab = 'separate'"
                >
                    Undgå hinanden
                    <span v-if="separationCount" class="agreement-count">{{ separationCount }}</span>
                </button>
            </div>
            <div class="avoid-modal-body" id="panel-aftaler" role="tabpanel"
                 :aria-labelledby="activeTab === 'together' ? 'tab-together' : 'tab-separate'">
                <AvoidTab v-if="activeTab === 'together'" together />
                <AvoidTab v-else />
            </div>
        </div>
    </div>
</template>

<style scoped>
.avoid-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-block-start: clamp(56px, 10dvh, 112px);
    padding-block-end: 24px;
    box-sizing: border-box;
    overflow-y: auto;
    background: oklch(0 0 0 / 40%);
    backdrop-filter: blur(4px);
}

.avoid-modal {
    background: var(--bg-modal, var(--bg-surface));
    border: 1px solid var(--border-medium);
    border-radius: var(--radius-md, 12px);
    box-shadow: var(--shadow-float, 0 8px 32px oklch(0 0 0 / 15%));
    inline-size: 90%;
    max-inline-size: 520px;
    max-block-size: min(70dvh, calc(100dvh - 88px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.avoid-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-subtle);
}

.avoid-modal-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-heading, var(--text-main));
}

.avoid-modal-close {
    background: none;
    border: none;
    font-size: 22px;
    color: var(--text-muted);
    cursor: pointer;
    padding-block: 0;
    padding-inline: 4px;
    min-inline-size: 44px;
    min-block-size: 44px;
    line-height: 1;
    border-radius: var(--radius-sm, 6px);
    transition-property: var(--ctl-transition);
    transition-duration: 0.15s;
}

.avoid-modal-close:hover {
    background: var(--bg-surface-hover);
    color: var(--text-main);
}

.avoid-modal-body {
    padding: 16px 20px;
    overflow-y: auto;
}

.agreement-tabs {
    display: flex;
    gap: 4px;
    padding-block: 8px 0;
    padding-inline: 20px;
    border-block-end: 1px solid var(--border-subtle);
}

.agreement-tab {
    display: inline-flex;
    align-items: center;
    min-block-size: 40px;
    gap: 6px;
    padding-block: 0;
    padding-inline: 10px;
    border: 0;
    border-block-end: 2px solid transparent;
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
}

.agreement-tab--active {
    border-block-end-color: var(--primary);
    color: var(--text-main);
}

.agreement-tab--conflict.agreement-tab--active {
    border-block-end-color: var(--color-warning);
    color: var(--color-warning);
}

.agreement-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 18px;
    min-block-size: 18px;
    padding-inline: 4px;
    border-radius: 9999px;
    background: var(--bg-surface-hover);
    font-size: 10px;
}

/* Ind- og ud-toningen. <Transition> står i ModalsRoot, men klasserne lander
   på DETTE vindues rod-element, så reglerne skal bo her: en scoped regel i
   forælderen når ikke ind til .avoid-modal inde i komponenten. */
.modal-fade-enter-active,
.modal-fade-leave-active {
    transition: opacity 0.2s ease;
}

.modal-fade-enter-active .avoid-modal,
.modal-fade-leave-active .avoid-modal {
    transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
    opacity: 0;
}

.modal-fade-enter-from .avoid-modal,
.modal-fade-leave-to .avoid-modal {
    transform: scale(0.95);
    opacity: 0;
}
</style>
