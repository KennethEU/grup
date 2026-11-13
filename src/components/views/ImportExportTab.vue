<script setup>
import { computed, ref, watch, onMounted, nextTick } from 'vue';
import { reactiveState } from '../../js/modules/reactiveState.js';
import { Upload, Download } from 'lucide-vue-next';
import ImportSection from './ImportSection.vue';
import ExportSection from './ExportSection.vue';
import UnreadableCopyNotice from './UnreadableCopyNotice.vue';

const activeSubTab = computed({
    get: () => reactiveState.importViewTab,
    set: (v) => { reactiveState.importViewTab = v; }
});

// Markeringen, der glider hen under den valgte knap
const pillGroupRef = ref(null);
function updateIndicator() {
    const el = pillGroupRef.value;
    if (!el) return;
    const active = el.querySelector('.pill-btn.active');
    const indicator = el.querySelector('.slide-indicator');
    if (!active || !indicator) return;
    const cRect = el.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    indicator.style.width = `${aRect.width}px`;
    indicator.style.height = `${aRect.height}px`;
    indicator.style.transform = `translateX(${aRect.left - cRect.left - 2}px)`;
    indicator.style.opacity = '1';
}
watch(activeSubTab, () => nextTick(() => requestAnimationFrame(updateIndicator)));
onMounted(() => nextTick(() => requestAnimationFrame(updateIndicator)));
</script>

<template>
    <div id="view-import-export" class="content-view">
        <!-- Værktøjslinjen, der bliver stående øverst (samme mønster som elevlisten) -->
        <div class="ie-header-sticky">
            <div class="header-inner">
                <div class="settings-panel ribbon">
                    <div class="ribbon-content">
                        <div class="ribbon-zone">
                            <div class="ribbon-group">
                                <!-- aria-pressed: "Importer" og "Eksporter" lød
                                     ordret ens for en skærmlæser, uanset hvilken
                                     af dem der var markeret — den eneste forskel
                                     var farven. Samme mønster som båndet i
                                     Grupper; se begrundelsen dér for, hvorfor
                                     det ikke er en role=radiogroup. -->
                                <div class="pill-group" ref="pillGroupRef" role="group" aria-label="Import &amp; backup">
                                    <span class="slide-indicator"></span>
                                    <button class="pill-btn" :class="{ active: activeSubTab === 'import' }" :aria-pressed="activeSubTab === 'import'" @click="activeSubTab = 'import'" title="Importér data fra fil eller indsæt tekst">
                                        <Upload :size="13" /><span>Importér</span>
                                    </button>
                                    <button class="pill-btn" :class="{ active: activeSubTab === 'export' }" :aria-pressed="activeSubTab === 'export'" @click="activeSubTab = 'export'" title="Eksportér klasser som backup eller fil">
                                        <Download :size="13" /><span>Eksportér</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Fanernes indhold -->
        <div class="tab-content-wrapper">
            <!-- Kun når en ulæselig klasseliste ligger gemt til side: står over
                 begge faner, så læreren ser den, uanset hvor hun lander. -->
            <UnreadableCopyNotice />
            <div v-if="activeSubTab === 'import'" key="import" class="tab-content">
                <ImportSection />
            </div>
            <div v-else-if="activeSubTab === 'export'" key="export" class="tab-content">
                <ExportSection />
            </div>
        </div>
    </div>
</template>

<style scoped>
/* ── Hovedet, der bliver stående øverst ── */
.ie-header-sticky {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--bg-surface-glass);
    backdrop-filter: blur(20px) saturate(200%);
    border-bottom: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-subtle);
}

.header-inner {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    justify-content: center;
    padding: 0 24px;
}

/* ── Båndet — nulstiller de fælles .settings-panel-regler ── */
.settings-panel {
    display: flex;
    justify-content: center;
    min-height: 44px;
    margin: 0;
    padding: 0;
}

.ribbon-content {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    gap: 12px;
}

.ribbon-zone {
    display: flex;
    align-items: center;
}

.ribbon-group {
    display: flex;
    align-items: center;
    gap: 6px;
}

/* ── Skifteren med den glidende markering ── */
.pill-group {
    position: relative;
    display: inline-flex;
    border: 1px solid var(--border-subtle);
    border-radius: 100px;
    padding: 2px;
    height: 32px;
    box-sizing: border-box;
    background: var(--bg-pill);
}

.slide-indicator {
    position: absolute;
    top: 2px;
    left: 2px;
    background: var(--primary);
    border-radius: 100px;
    box-shadow: 0 2px 8px var(--primary-glow);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                opacity 0.15s ease;
    z-index: 0;
    pointer-events: none;
    opacity: 0;
}

.pill-btn {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 16px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 100px;
    transition: color 0.25s ease;
    white-space: nowrap;
}

.pill-btn:hover:not(.active) {
    color: var(--text-main);
}

.pill-btn.active {
    color: var(--text-on-primary);
    font-weight: 800;
}

/* ── Indholdet ── */
.tab-content-wrapper {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    background: transparent;
}

.tab-content {
    max-width: 900px;
    margin: 0 auto;
    background: transparent;
    box-shadow: none;
    padding: 0;
}
</style>
