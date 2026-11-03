<script setup>
import { computed, defineAsyncComponent, watch } from 'vue';
import { reactiveState } from '../../js/modules/reactiveState.js';
import { teacherColumns } from '../../js/modules/utils.js';
import StudentsTab from './StudentsTab.vue';
import HistoryTab from './HistoryTab.vue';

// Grupper-fanen: opskriften og gruppekortene. Hentes først, når fanen åbnes.
const GroupsView = defineAsyncComponent(() => import('../beta/BetaGroupsTab.vue'));

// Active tab
const activeTab = computed({
    get: () => reactiveState.classViewTab,
    set: (v) => { reactiveState.classViewTab = v; }
});

// BEMÆRK: her lå en `tabs`-liste og en `switchTab()`. Fanebladene tegnes af
// AppTopbar (`currentTabs`), ikke her, så de to blev aldrig brugt — men de så
// ud som om de var stedet at rette, hvis en fane skulle skifte navn.
// (Gennemsyn 2026-09-06.)

// Vis-kolonnen — hvad der står på gruppekortene — sættes, når klassen
// skifter. Identiteten (_rowId) er ikke lærerens valg og ligger fast i
// reactiveState.idColumn. Denne watch udløses kun, når currentClass-
// *referencen* udskiftes — altså ved en ægte indlæsning/skift af klasse — så
// det er trygt at udlede den her uden at overskrive et valg midt i sessionen
// (de omtildeler ikke currentClass).
watch(() => reactiveState.currentClass, (cls) => {
    const visible = teacherColumns(cls?.columns);
    if (visible.length === 0) {
        reactiveState.displayColumn = '';
    // Prioritet 1: brug den kolonne, læreren gemte MED klassen.
    // `id_column` er det gamle feltnavn; dets værdi HAR altid været
    // lærerens valgte kolonne, så gamle klasser migrerer gratis her.
    } else if (cls.id_column && visible.includes(cls.id_column)) {
        reactiveState.displayColumn = cls.id_column;
    // Prioritet 2: behold et valg, der stadig er gyldigt.
    // Prioritet 3: ellers den første synlige kolonne.
    } else if (!(reactiveState.displayColumn && visible.includes(reactiveState.displayColumn))) {
        reactiveState.displayColumn = visible[0];
    }
}, { immediate: true });

</script>

<template>
    <div id="view-class" class="content-view">
        <div v-if="reactiveState.currentClass">
            <!-- Fanernes indhold, med overgang -->
            <div class="tab-content-wrapper" style="position: relative;">
                    <!-- id-column er identiteten (_rowId, konstant); display-column
                         er lærerens valg af hvad der skal vises. -->
                    <StudentsTab
                        v-if="activeTab === 'students'"
                        key="students"
                        :id-column="reactiveState.idColumn"
                    />

                    <component :is="GroupsView"
                        v-else-if="activeTab === 'groups'"
                        key="groups"
                        :id-column="reactiveState.idColumn"
                    />

                    <HistoryTab
                        v-else-if="activeTab === 'history'"
                        key="history"
                    />
            </div>
        </div>
        <div v-else style="padding:60px 20px; text-align:center; color: var(--text-muted);">
            <!-- Bog-ikon i Lucide-stil (inline SVG, ingen emoji, jf. projektets regel) -->
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px;">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
            <p style="font-size:16px; font-weight:600; color: var(--text-heading); margin:0 0 8px;">Ingen klasse valgt</p>
            <p style="font-size:13px; margin:0;">Vælg en klasse i klassemenuen øverst til højre, eller opret en ny med <strong>+</strong> i menuen.</p>
        </div>
    </div>
</template>


