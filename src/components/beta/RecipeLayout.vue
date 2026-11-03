<script setup>
// Rammen om opskriften i beta: en rolig bjælke øverst og grupperne i fuld
// bredde. Opskriften selv står i et vindue, der åbnes fra bjælken.
//
// Hvorfor et vindue: opskriften stod først over grupperne og siden i et panel
// ved siden af dem. Med mange regler (fx otte "Fordel" på gamle grupperinger)
// fyldte den enten skærmen eller gjorde siden tæt og uolig. Nu er siden
// grupperne — og opskriften er der, når man vil ændre den. Uden grupper åbner
// vinduet af sig selv (der er intet andet at se), og når grupperne dannes,
// lukker det, så de kan ses.
//
// Bjælken har klassen `groups-header-sticky`, fordi beskederne (toasts) og
// hints lægger sig under netop den (NotificationManager.vue, HintsStack.vue).
//
// Vinduet er et <dialog> med showModal()/close() — ingen overgange, se
// CLAUDE.md (Safari viser ellers ikke dialogen).
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { X } from 'lucide-vue-next';
import { reactiveState as state } from '../../js/modules/reactiveState.js';

const props = defineProps({
    kicker: { type: String, default: 'Gruppeopskrift' },
    summary: { type: String, default: '' },
    /** Antal advarsler om opsætningen; vises i bjælken, så man ser dem uden at åbne. */
    warnings: { type: Number, default: 0 },
    /** Åbn vinduet af sig selv (når der ikke er nogen grupper endnu). */
    autoOpen: { type: Boolean, default: false },
});

const dialog = ref(null);
const isOpen = ref(false);

function open() {
    if (!dialog.value || dialog.value.open) return;
    dialog.value.showModal();
    isOpen.value = true;
}
function close() {
    if (dialog.value?.open) dialog.value.close();
}
function onClose() { isOpen.value = false; }

// Et klik på mørket uden om vinduet lukker det — men kun et klik, der både
// begynder og slutter dér (ikke et træk, der markerer tekst inde i vinduet).
let downOnBackdrop = false;
function onPointerDown(e) { downOnBackdrop = e.target === dialog.value; }
function onClick(e) {
    if (downOnBackdrop && e.target === dialog.value) close();
    downOnBackdrop = false;
}

// Danner læreren grupper, lukker vinduet, så de kan ses.
watch(() => state.isGenerating, (running) => { if (running) close(); });

// Guiden (RecipeGuide.vue) står uden for denne komponent og kan ikke nå
// vinduet direkte. Den beder om at åbne/lukke via en besked på window — så
// isOpen og fokus passer, som når læreren selv klikker. Guiden ændrer aldrig
// noget andet end om vinduet er åbent.
function onDialogRequest(e) {
    if (e.detail?.open) open(); else close();
}

onMounted(async () => {
    window.addEventListener('recipe-dialog:request', onDialogRequest);
    if (props.autoOpen) {
        await nextTick();
        open();
    }
});

onUnmounted(() => window.removeEventListener('recipe-dialog:request', onDialogRequest));
</script>

<template>
    <div class="recipe-layout">
        <div class="groups-header-sticky recipe-bar">
            <button type="button" class="recipe-bar__open" aria-haspopup="dialog" :aria-expanded="isOpen ? 'true' : 'false'" @click="open">
                <span class="recipe__kicker">{{ kicker }}</span>
                <span class="recipe__summary">{{ summary }}</span>
                <span v-if="warnings" class="recipe-bar__warn">{{ warnings }} {{ warnings === 1 ? 'advarsel' : 'advarsler' }}</span>
                <span class="recipe-bar__edit">Rediger</span>
            </button>
            <span class="recipe__spacer"></span>
            <slot name="actions" />
        </div>

        <slot />

        <!-- id'et er guidens greb (RecipeGuide.vue): klassen deles med telefonbeskeden -->
        <dialog ref="dialog" id="recipe-dialog" class="recipe-dialog" :aria-label="kicker"
                @close="onClose" @pointerdown="onPointerDown" @click="onClick">
            <div class="recipe-dialog__panel">
                <header class="recipe-dialog__head">
                    <span class="recipe__kicker">{{ kicker }}</span>
                    <button type="button" class="recipe-dialog__x" aria-label="Luk" @click="close"><X :size="18" /></button>
                </header>
                <div class="recipe-dialog__body">
                    <slot name="side" />
                </div>
                <footer class="recipe-dialog__foot">
                    <slot name="footer" :close="close" />
                </footer>
            </div>
        </dialog>
    </div>
</template>

