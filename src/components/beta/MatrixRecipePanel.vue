<script setup>
// Runde 2: matrix — opskriften for at blande stamgrupperne.
//
// Indstillingerne står i `matrixSettings` (matrixStrategy,
// matrixRepresentationType, groupMode/groupTarget/groupMod) og reglerne i
// `matrixRules` (uden Opdel).
// Første linje siger, hvordan der blandes; resten er reglerne.
import { computed, ref, watch, onUnmounted, onBeforeUnmount, nextTick } from 'vue';
import { Users } from 'lucide-vue-next';
import { reactiveState as state } from '../../js/modules/reactiveState.js';
import { debounce, splitByLockedGroups } from '../../js/modules/utils.js';
import { matrixSentence, matrixSummary, shownMatrixRepType, addRule, revealRule, recipeHintText, clampTarget, namesText, isRecipeHint, expectedNewGroups } from '../../js/modules/recipe.js';
import { fullMatrixInfo } from '../../js/modules/matrixInfo.js';
import { getTopic } from '../../js/modules/storage.js';
import { registerPendingWrite } from '../../js/modules/classActions.js';
import { hintsFor, ANCHOR_TARGET, bannerHints } from '../../js/modules/hints.js';
import { useGenerateShortcut, GENERATE_SHORTCUT } from '../../composables/useGenerateShortcut.js';
import RecipeToken from './RecipeToken.vue';
import RecipeRules from './RecipeRules.vue';
import RecipeLayout from './RecipeLayout.vue';
import HintsStack from '../HintsStack.vue';
import './recipe.css';

const props = defineProps({
    idColumn: { type: String, default: '' },
    hasGroups: { type: Boolean, default: false },
});
const emit = defineEmits(['generate', 'settingsChanged', 'rulesChanged', 'switchView', 'showClass']);

const homeGroups = computed(() => state.storedStandardGroups || []);
const hasHomeGroups = computed(() => homeGroups.value.length > 0);

// ─── Indstillingerne ────────────────────────────────────────────────────────
const groupMode = computed({
    get: () => state.groupMode || 'size',
    set: (v) => { state.groupMode = v; },
});
const groupTarget = ref(4);
const groupMod = ref('+');
const strategy = ref('full_strict');
const repType = ref('topic');

// Uden emner på stamgrupperne kan der ikke blandes på emner.
const hasTopics = computed(() => homeGroups.value.some(g => {
    if (g.topic && g.topic.trim()) return true;
    const stored = getTopic(g.name, 'S_');
    return !!(stored && stored.trim());
}));

function clampedTarget() {
    return clampTarget(groupTarget.value);
}
function defaultTarget() {
    return homeGroups.value.length || 4;
}
function loadSettings() {
    const s = state.currentClass?.matrixSettings;
    groupMode.value = s?.groupMode || 'size';
    groupTarget.value = s?.groupTarget || defaultTarget();
    groupMod.value = s?.groupMod || '+';
    let saved = s?.matrixStrategy || 'full_strict';
    if (saved === 'full' || saved === 'full_flex') saved = 'full_strict';
    strategy.value = saved;
    repType.value = shownMatrixRepType(s?.matrixRepresentationType, hasTopics.value);
}
watch(() => state.currentClass, loadSettings, { immediate: true });
// Indstillingerne kan blive skiftet ud UDEN at klassen gør det: "Ja, tag alt
// med" i kørselshistorikken (restoreRun) sætter et helt nyt matrixSettings-
// objekt. Uden den her lytter stod panelet med de gamle tal, og næste klik
// skrev dem tilbage oven i dem, læreren lige havde hentet frem. Panelets EGEN skrivning kommer
// også retur her (et nyt objekt hver gang) og må ikke læses ind igen: står
// feltet et øjeblik tomt midt i en indtastning, ville det snappe tilbage.
// Derfor sammenlignes VÆRDIERNE med dem, panelet sender (clampedTarget, ikke
// feltets råtekst).
watch(() => state.currentClass?.matrixSettings, (s) => {
    if (!s) return;
    const same = (a, b) => String(a ?? '') === String(b ?? '');
    if (same(s.groupMode, groupMode.value) && same(s.groupTarget, clampedTarget())
        && same(s.groupMod, groupMod.value)
        && same(s.matrixStrategy || 'full_strict', strategy.value)
        && same(shownMatrixRepType(s.matrixRepresentationType, hasTopics.value), repType.value)) return;
    loadSettings();
});

const payload = () => ({
    groupMode: groupMode.value,
    groupTarget: clampedTarget(),
    groupMod: groupMod.value,
    matrixStrategy: strategy.value,
    matrixRepresentationType: repType.value,
});
const saveSoon = debounce(() => emit('settingsChanged', payload()), 300);
const unregisterPending = registerPendingWrite(saveSoon.flush);

// Hver handling herunder sender KUN noget, når en værdi faktisk ændres. Et
// klik på det, der allerede er valgt, eller et klik i feltet og videre, må
// ikke gemme klassen: med samme klasse åben i to faner skrev den gamle fane
// ellers hele sin udgave over den nye fanes rettelser (målt 10/11 2026,
// e2e/to_faner.spec.ts).
function setStrategy(s) {
    if (s === strategy.value) return;
    strategy.value = s;
    if (s === 'size') groupMode.value = 'size';
    else if (s === 'count') groupMode.value = 'number';
    saveSoon();
}
function setRepType(t) {
    if (t === repType.value) return;
    repType.value = t;
    saveSoon();
}
function stepTarget(d) {
    const next = clampTarget(clampedTarget() + d);
    if (next === groupTarget.value) return;
    groupTarget.value = next;
    saveSoon();
}
// Det indtastede er allerede sendt (@input). Blur retter kun et tal uden for
// grænserne — og sender kun, hvis det faktisk blev rettet.
function onTargetBlur() {
    const clamped = clampedTarget();
    if (clamped === groupTarget.value) return;
    groupTarget.value = clamped;
    saveSoon();
}
function toggleMod() { groupMod.value = groupMod.value === '-' ? '+' : '-'; saveSoon(); }

// Kommer der emner på stamgrupperne (eller forsvinder de), skifter det viste
// valg med — til det samme, som tjekket og prøvekørslen regner på
// (shownMatrixRepType). Kun det viste valg skiftes — der gemmes ikke. Før
// gemte det hele klassen, så snart matrix-opskriften blev vist (klasse uden
// emner), og en gammel fane skrev så sin udgave over den nye fanes rettelser
// bare ved at åbne Matrix-runden (målt 10/11 2026). Dannelsen bruger panelets
// valg (generate()), og valget gemmes med næste rigtige ændring eller dannelse.
watch(hasTopics, (has) => {
    repType.value = shownMatrixRepType(state.currentClass?.matrixSettings?.matrixRepresentationType, has);
});

const info = computed(() => strategy.value !== 'full_strict' ? null : fullMatrixInfo({
    groups: homeGroups.value,
    data: state.currentClass?.data || [],
    idCol: props.idColumn || state.currentClass?.columns?.[0] || '',
    repType: repType.value,
    storedTopic: (g) => getTopic(g.name, 'S_'),
    // De låste matrixgrupper bliver stående: deres elever fordeles ikke, og
    // grupperne tæller med i antallet (som i "Pr. gruppe" og "Antal" herunder).
    lockedGroups: (state.storedMatrixGroups || []).filter(g => g.locked),
}));

// Skønnet "→ N matrixgrupper · ca. M elever" for ALLE tre måder at blande på.
// "Én fra hver" kender matrixInfo (holdt op mod motoren i
// matrixVsEngine.test.js); "Pr. gruppe" og "Antal" regnes af
// expectedNewGroups (samme regnestykke som motoren) på de elever, der ikke
// står i en låst matrixgruppe. Låste grupper bliver stående og tæller med.
const estimate = computed(() => {
    if (strategy.value === 'full_strict') return info.value;
    const locked = (state.storedMatrixGroups || []).filter(g => g.locked);
    const free = splitByLockedGroups(state.currentClass?.data, locked, props.idColumn || state.idColumn).freeCount;
    if (free <= 0) return null;
    const fresh = expectedNewGroups({
        mode: strategy.value === 'size' ? 'size' : 'number',
        target: clampedTarget(), mod: groupMod.value, students: free, lockedGroups: locked.length,
    });
    if (fresh <= 0) return null;
    return { numGroups: fresh + locked.length, avgSize: Math.round(free / fresh) };
});

const parts = computed(() => matrixSentence({
    strategy: strategy.value, repType: repType.value, target: clampedTarget(), mod: groupMod.value,
}));
const targetHints = computed(() => hintsFor(ANCHOR_TARGET));

// Klassens emner kommer fra stamgrupperne og ændres dér — her vises de kun.
const classTopics = computed(() => (state.currentClass?.topics || []).filter(t => t && String(t).trim()));
const topicsLine = computed(() => namesText(classTopics.value));

// ─── Reglerne ───────────────────────────────────────────────────────────────
const rules = computed(() => {
    const cls = state.currentClass;
    if (!cls) return [];
    if (!cls.matrixRules) cls.matrixRules = [];
    return cls.matrixRules;
});
async function onAddRule() {
    const index = addRule(rules.value);
    emit('rulesChanged');
    await nextTick();
    revealRule(index);
}

// ─── Opsummeringen i bjælken ─────────────────────────────────────────────────
const summary = computed(() => matrixSummary({
    strategy: strategy.value, repType: repType.value, target: clampedTarget(), rules: rules.value,
}));

function generate() {
    if (state.isGenerating || !hasHomeGroups.value) return;
    saveSoon.flush();
    emit('generate', {
        mode: groupMode.value, target: clampedTarget(), mod: groupMod.value,
        matrixStrategy: strategy.value, matrixRepresentationType: repType.value,
    });
}
// ⌘/Ctrl + Enter danner matrixgrupper — se useGenerateShortcut.js.
useGenerateShortcut(generate);
const shortcut = GENERATE_SHORTCUT;
// Forlader læreren Grupper-fanen (Elevliste, Historik, Import) inden for
// 0,3 sek., skal ændringen med. I onBeforeUnmount, ikke onUnmounted: Vue
// sender ikke et emit fra en komponent, der allerede er væk (117. gennemsyn).
onBeforeUnmount(() => { saveSoon.flush(); });
onUnmounted(unregisterPending);

// Advarsler om opsætningen (regler, aftaler, hvad der kan gå op) står her i
// opskriften — før man danner grupper — og tælles i bjælken.
// Noterne fra sidste dannelse er med i stakken (lastRunHints i hints.js).
const recipeWarnings = computed(() => bannerHints.value.filter(isRecipeHint).length);
</script>

<template>
    <RecipeLayout :warnings="recipeWarnings" kicker="Runde 2 · matrix" :summary="hasHomeGroups ? summary : ''" :auto-open="!hasGroups || state.matrixGroupsStale">
        <template #actions>
            <button type="button" class="recipe__textbtn" @click="emit('switchView', 'standard')">← Stamgrupperne</button>
            <button v-if="hasGroups" type="button" class="recipe__soft" @click="emit('showClass')">
                <Users :size="14" aria-hidden="true" /> Vis for klassen
            </button>
            <button type="button" class="recipe__go" :disabled="state.isGenerating || !hasHomeGroups" @click="generate">
                {{ hasGroups ? 'Dan matrixgrupper igen' : 'Dan matrixgrupper' }}
                <span class="recipe__kbd">{{ shortcut }}</span>
            </button>
        </template>

        <template #side>
            <HintsStack :filter="isRecipeHint" />
            <p v-if="!hasHomeGroups" class="recipe__empty">
                En matrix blander stamgrupperne. Dan stamgrupperne først — så kan de blandes her.
            </p>
            <template v-else>
                <ol class="recipe__lines">
                    <li class="recipe__line">
                        <span class="recipe__no"></span>
                        <span class="recipe__text">
                            <template v-for="(p, i) in parts" :key="'m' + i">
                                <RecipeToken v-if="p.token === 'mix'" :text="p.text" label="Sådan blandes der">
                                    <div class="recipe-seg recipe-seg--3" role="group" aria-label="Sådan blandes der">
                                        <button type="button" :class="{ on: strategy === 'full_strict' }" :aria-pressed="strategy === 'full_strict'" @click="setStrategy('full_strict')">Én fra hver</button>
                                        <button type="button" :class="{ on: strategy === 'size' }" :aria-pressed="strategy === 'size'" @click="setStrategy('size')">Pr. gruppe</button>
                                        <button type="button" :class="{ on: strategy === 'count' }" :aria-pressed="strategy === 'count'" @click="setStrategy('count')">Antal</button>
                                    </div>
                                    <template v-if="strategy === 'full_strict'">
                                        <span class="recipe-pop-kicker">Én fra hver</span>
                                        <div class="recipe-seg" role="group" aria-label="Matrixen bygges på">
                                            <button type="button" :class="{ on: repType === 'group' }" :aria-pressed="repType === 'group'" @click="setRepType('group')">Stamgruppe</button>
                                            <button type="button" :class="{ on: repType === 'topic' }" :aria-pressed="repType === 'topic'" :disabled="!hasTopics" @click="setRepType('topic')">Emne</button>
                                        </div>
                                        <span v-if="!hasTopics" class="recipe-pop-note">Stamgrupperne har ingen emner, så der blandes på grupperne.</span>
                                    </template>
                                    <div v-else class="recipe-stepper">
                                        <button type="button" aria-label="Færre" @click="stepTarget(-1)">−</button>
                                        <input type="number" min="1" max="999" v-model.number="groupTarget"
                                               :aria-label="strategy === 'size' ? 'Elever pr. matrixgruppe' : 'Antal matrixgrupper'"
                                               @input="saveSoon" @blur="onTargetBlur">
                                        <button type="button" aria-label="Flere" @click="stepTarget(1)">+</button>
                                    </div>
                                </RecipeToken>
                                <button v-else-if="p.token === 'mod'" type="button" class="recipe-flip" @click="toggleMod">{{ p.text }}</button>
                                <span v-else-if="p.punct" class="recipe__punct">{{ p.text }}</span>
                            <template v-else>{{ p.text }}</template>
                            </template>
                        </span>
                        <span v-if="estimate" class="recipe__hints recipe__note" :class="{ 'is-warning': estimate.numGroups <= 0 }">
                            → {{ estimate.numGroups }} {{ estimate.numGroups === 1 ? 'matrixgruppe' : 'matrixgrupper' }}<template v-if="estimate.numGroups > 0"> · ca. {{ estimate.avgSize }} elever</template>
                        </span>
                        <span v-if="targetHints.length" class="recipe__hints">
                            <span v-for="h in targetHints" :key="h.id">{{ recipeHintText(h.text) }}</span>
                        </span>
                    </li>
                    <RecipeRules :rules="rules" :is-matrix="true" :id-column="idColumn" @changed="emit('rulesChanged')" />
                    <li v-if="classTopics.length" class="recipe__line recipe__line--quiet">
                        <span class="recipe__no"></span>
                        <span class="recipe__text recipe__topicsnote">Emner fra stamgrupperne: {{ topicsLine }}</span>
                    </li>
                </ol>
            </template>
        </template>

        <template #footer="{ close }">
            <button type="button" class="recipe__textbtn" @click="close">Luk</button>
            <!-- I bunden, så den altid kan ses — også med mange regler -->
            <span v-if="hasHomeGroups" class="recipe__add"><button type="button" class="recipe__textbtn recipe__textbtn--accent" @click="onAddRule">+ Tilføj regel</button></span>
            <span class="recipe__spacer"></span>
            <button type="button" class="recipe__go" :disabled="state.isGenerating || !hasHomeGroups" @click="generate">
                {{ hasGroups ? 'Dan matrixgrupper igen' : 'Dan matrixgrupper' }}
                <span class="recipe__kbd">{{ shortcut }}</span>
            </button>
        </template>

        <slot />
    </RecipeLayout>
</template>
