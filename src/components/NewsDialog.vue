<script setup>
// Nyheder — lærervendt ændringslog for Grupper-værktøjet.
// Vises i en native <dialog> der åbnes via Sparkles-knappen i AppTopbar.
//
// 🔔 OBLIGATORISK: Tilføj en entry øverst i NEWS ved HVER user-facing
// ændring (nye funktioner og bugfixes lærerne kan se). Skriv pædagogisk —
// ingen tekniske udtryk ("modal", "view", "regenerering", komponentnavne).
//
// SELVE LISTEN bor i js/modules/news.js — ikke her. "Om Grupper" læser den
// samme liste for at vise, hvornår programmet sidst blev opdateret.
//
// Se fulde retningslinjer i docs/grupper.md → "Nyheder-dialog", inkl.
// forbudte ord, tilladte alternativer, og hvornår der IKKE skal laves entry
// (refactors, build-fixes, tests).

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { X, Sparkles, Wrench } from 'lucide-vue-next';
import { NEWS } from '../js/modules/news.js';
import { NEWS_FILTER_KEY as FILTER_KEY } from '../js/modules/storageKeys.js';

const props = defineProps({
    open: { type: Boolean, default: false }
});
const emit = defineEmits(['close']);

const dialogRef = ref(null);

// Filteret: "Alt" eller "Kun nye funktioner".
//
// HVORFOR: rettelser fylder langt de fleste nyheder, så de nye funktioner
// drukner i dem. Vil man se hvad programmet er blevet i stand til — fx efter
// en sommerferie — er man nødt til at scrolle forbi 20 fejlrettelser for hver
// funktion. Filteret gemmer ikke noget væk permanent; "Alt" er stadig
// udgangspunktet, og knappen siger hvor mange rettelser der er.
const ONLY_NEW = 'features';

// Lageret kan være slået helt fra (nogle skoleprofiler blokerer alt hvad en
// side gemmer lokalt — se App.vue). Et filtervalg er ikke vigtigt nok til at
// vælte noget, så begge veje er pakket ind.
function readChoice() {
    try {
        // Bevar filtervalget fra før de interne værdier blev engelske.
        const saved = localStorage.getItem(FILTER_KEY);
        return saved === ONLY_NEW || saved === 'nye' ? ONLY_NEW : 'all';
    } catch { return 'all'; }
}

const filter = ref(readChoice());

function setFilter(v) {
    filter.value = v;
    try { localStorage.setItem(FILTER_KEY, v); } catch { /* ligegyldigt */ }
}

// NEWS ændrer sig ikke, mens siden er åben — tallet regnes én gang.
const fixCount = NEWS.filter(n => n.type === 'fix').length;
const visibleNews = computed(() =>
    filter.value === ONLY_NEW ? NEWS.filter(n => n.type === 'feature') : NEWS);

// Teksten delt i ændringer: én pr. linje, uden tomme linjer og uden et
// gammelt "– " foran (nogle ældre nyheder skrev selv deres tankestreger).
function bodyLines(entry) {
    return String(entry.body || '').split('\n')
        .map(line => line.replace(/^\s*[–-]\s+/, '').trim())
        .filter(Boolean);
}

function close() {
    emit('close');
}

watch(() => props.open, (val) => {
    if (!dialogRef.value) return;
    if (val && !dialogRef.value.open) {
        dialogRef.value.showModal();
    } else if (!val && dialogRef.value.open) {
        dialogRef.value.close();
    }
});

function onDialogClose() {
    if (props.open) emit('close');
}

// Et tryk der starter inde i teksten (man markerer en nyhed) og slippes uden for
// vinduet rammer også <dialog>-elementet som "klik". Derfor huskes, hvor
// knappen blev trykket NED — kun tryk der både startede og sluttede på
// baggrunden lukker (samme regel som i useModalFocus).
let pressedOnBackdrop = false;
function onBackdropMousedown(e) {
    pressedOnBackdrop = e.target === dialogRef.value;
}
function onBackdropClick(e) {
    if (e.target === dialogRef.value && pressedOnBackdrop) close();
}

const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni',
                'juli', 'august', 'september', 'oktober', 'november', 'december'];
function formatDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d}. ${MONTHS[m - 1]} ${y}`;
}

function onKeydown(e) {
    if (e.key === 'Escape' && props.open) close();
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
    <dialog ref="dialogRef" class="news-dialog" aria-labelledby="dlg-news" @close="onDialogClose"
            @mousedown="onBackdropMousedown" @click="onBackdropClick">
        <div class="news-content" @click.stop>
            <header class="news-header">
                <h2 id="dlg-news"><Sparkles :size="20" class="title-icon" /> Nyheder</h2>
                <button class="close-btn" @click="close" aria-label="Luk"><X :size="18" /></button>
            </header>
            <p class="news-intro">
                Her kan du se hvad der er kommet til af nye funktioner og forbedringer
                i grup.dk. Nyeste øverst.
            </p>
            <div class="news-filter" role="group" aria-label="Vis">
                <button type="button" class="filter-btn" :class="{ active: filter !== ONLY_NEW }"
                        :aria-pressed="filter !== ONLY_NEW" @click="setFilter('all')">
                    Alt
                </button>
                <button type="button" class="filter-btn" :class="{ active: filter === ONLY_NEW }"
                        :aria-pressed="filter === ONLY_NEW" @click="setFilter(ONLY_NEW)">
                    Kun nye funktioner
                </button>
                <span v-if="filter === ONLY_NEW" class="filter-note">
                    {{ fixCount }} rettelser er skjult
                </span>
            </div>
            <ol class="news-list">
                <li v-for="entry in visibleNews" :key="entry.date + entry.title" class="news-entry"
                    :class="{ 'is-fix': entry.type === 'fix', 'is-feature': entry.type === 'feature' }">
                    <div class="news-meta">
                        <span class="news-date">{{ formatDate(entry.date) }}</span>
                        <span class="news-tag">
                            <Sparkles v-if="entry.type === 'feature'" :size="11" />
                            <Wrench v-else :size="11" />
                            {{ entry.type === 'feature' ? 'Ny funktion' : 'Bugfix' }}
                        </span>
                    </div>
                    <h3>{{ entry.title }}</h3>
                    <!-- En samlet rettelse har én linje pr. ændring (\n i teksten):
                         som punkter med luft imellem, så man kan se, hvor den ene
                         ændring slutter og den næste begynder. -->
                    <ul v-if="bodyLines(entry).length > 1" class="news-items">
                        <li v-for="(line, i) in bodyLines(entry)" :key="i">{{ line }}</li>
                    </ul>
                    <p v-else>{{ entry.body }}</p>
                </li>
            </ol>
        </div>
    </dialog>
</template>

<style scoped>
/* Farver, skrift, luft og knappernes udseende står i BetaStyles.vue og
   vinduernes ark (beta/screens/vinduer.css), som vinder over de scoped regler.
   Her står kun opbygningen. */
.news-dialog {
    border: none;
    background: transparent;
    padding: 0;
    max-inline-size: min(640px, 92vw);
    max-block-size: 85vh;
    margin: auto;
}

.news-content {
    display: flex;
    flex-direction: column;
    max-block-size: 85vh;
    overflow: hidden;
}

.news-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.news-header h2 {
    margin: 0;
    display: inline-flex;
    align-items: center;
}
.title-icon {
    color: var(--primary);
}

.news-intro {
    margin: 0;
}

.news-filter {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
}
.filter-btn {
    font: inherit;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
/* Fingerstørrelse på telefon. Knapperne er under det anbefalede 44 px for et
   tryk — og nyhederne læses ofte på telefonen. Kun under 640px, så knapperne
   ikke bliver klodsede på skærmen ved siden af den øvrige tætte brugerflade. */
@media (max-width: 640px) {
    .filter-btn {
        min-block-size: 44px;
    }
}

.filter-note {
    font-size: 11px;
}

.news-list {
    list-style: none;
    margin: 0;
    overflow-y: auto;
}

.news-entry {
    padding: 14px 0;
}

.news-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}
.news-tag {
    display: inline-flex;
    align-items: center;
    text-transform: uppercase;
}

.news-entry h3 {
    margin: 0 0 4px;
}
.news-entry p {
    margin: 0;
    line-height: 1.55;
}
/* Samlede rettelser: én ændring pr. punkt (bodyLines). */
.news-items {
    margin: 0;
    padding-inline-start: 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    line-height: 1.55;
}
.news-items li { padding-inline-start: 2px; }
</style>
