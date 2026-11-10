<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import StudentToolbar from './StudentToolbar.vue';
import StudentTable from './StudentTable.vue';
import StudentGuide from '../beta/StudentGuide.vue';

defineProps({
    idColumn: { type: String, required: true }       // identitet (_rowId)
});
// "Vis:"-kolonnen (hvad der står på gruppekortene) går ikke gennem her:
// StudentToolbar læser og skriver den direkte i reactiveState.

// Tabellens højde (elevliste.css) trækker værktøjslinjen fra vinduet. Den er
// normalt 49 px, men på en smal skærm med et langt navn i "Vis:" bryder den
// over to rækker (81 px), og så stod tabellens bund — og dens vandrette
// rullebjælke — 24 px under vindueskanten, indtil man rullede siden (målt
// 10/11 2026 ved 1.024 px). Derfor måles linjen her og gives videre som
// --students-toolbar-h. Fanen tegnes forfra, hver gang man kommer tilbage
// til den (v-if i ClassView), så målet sættes igen ved hvert besøg. Et mål
// på 0 px (fx hvis siden endnu ikke er lagt ud) bruges ikke — så gælder
// CSS'ens standard på 49 px.
const root = ref(null);
const toolbar = ref(null);
let resizeObserver = null;
function updateToolbarHeight() {
    const height = toolbar.value?.getBoundingClientRect().height || 0;
    if (height > 0) root.value?.style.setProperty('--students-toolbar-h', `${Math.ceil(height)}px`);
}
onMounted(() => {
    updateToolbarHeight();
    if (typeof ResizeObserver !== 'undefined' && toolbar.value) {
        resizeObserver = new ResizeObserver(updateToolbarHeight);
        resizeObserver.observe(toolbar.value);
    }
});
onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<template>
    <div id="tab-students" ref="root" class="tab-content students-tab-content">
        <div ref="toolbar" class="students-header-sticky">
            <div class="header-inner">
                <StudentToolbar />
            </div>
        </div>
        <div class="students-scroll-content">
            <StudentTable
                :id-column="idColumn"
            />
        </div>
        <StudentGuide />
    </div>
</template>

<style scoped>
.students-header-sticky {
    position: sticky;
    inset-block-start: 0;
    z-index: 100;
    margin-block: -16px 0;
    margin-inline: -32px;
    inline-size: calc(100% + 64px);
    background: var(--bg-surface-glass);
    backdrop-filter: blur(20px) saturate(200%);
    border-block-end: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-subtle);
}

.header-inner {
    max-inline-size: 1400px;
    margin-inline: auto;
    display: flex;
    flex-direction: column;
    padding-inline: 24px;
}

.students-scroll-content {
    padding-block-start: 8px;
}

</style>
