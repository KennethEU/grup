<script setup>
import StudentToolbar from './StudentToolbar.vue';
import StudentTable from './StudentTable.vue';
import StudentGuide from '../beta/StudentGuide.vue';

defineProps({
    idColumn: { type: String, required: true }       // identitet (_rowId)
});
// "Vis:"-kolonnen (hvad der står på gruppekortene) går ikke gennem her:
// StudentToolbar læser og skriver den direkte i reactiveState.

</script>

<template>
    <div id="tab-students" class="tab-content students-tab-content">
        <div class="students-header-sticky">
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
    top: 0;
    z-index: 100;
    margin: -16px -32px 0 -32px;
    width: calc(100% + 64px);
    background: var(--bg-surface-glass);
    backdrop-filter: blur(20px) saturate(200%);
    border-bottom: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-subtle);
}

.header-inner {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    padding: 0 24px;
}

.students-scroll-content {
    padding-top: 8px;
}

</style>
