<script setup>
// OPSKRIFTEN — skærmen til at sætte gruppedannelsen op.
//
// Hele opsætningen står som korte, nummererede danske sætninger. De
// fremhævede ord kan klikkes og ændres. Linjens nummer ER prioriteten:
// kan reglerne ikke opfyldes samtidig, giver den nederste efter først.
//
// Panelet sender events til BetaGroupsTab (generate, settingsChanged,
// rulesChanged, switchView), som gemmer og danner grupperne. Selve reglerne
// ændres på klassens egen `rules`-liste via recipe.js (kun én Opdel, øverst).
import { computed, ref, watch, onUnmounted, nextTick } from 'vue';
import { Users, Shuffle } from 'lucide-vue-next';
import { reactiveState as state } from '../../js/modules/reactiveState.js';
import { debounce, splitByLockedGroups } from '../../js/modules/utils.js';
import { sizeSentence, recipeSummary, addRule, revealRule, recipeHintText, expectedNewGroups, clampTarget, isRecipeHint, currentLastNotes, perGroupEstimate } from '../../js/modules/recipe.js';
import { registerPendingWrite } from '../../js/modules/classActions.js';
import { modalActions } from '../../js/modules/modalState.js';
import { hintsFor, ANCHOR_TARGET, bannerHints } from '../../js/modules/hints.js';
import { useGenerateShortcut, GENERATE_SHORTCUT } from '../../composables/useGenerateShortcut.js';
import RecipeTopics from './RecipeTopics.vue';
import RecipeToken from './RecipeToken.vue';
import RecipeRules from './RecipeRules.vue';
import RecipeLayout from './RecipeLayout.vue';
import RecipeLastRun from './RecipeLastRun.vue';
import { setupNotices } from '../../js/modules/setupNotices.js';
import HintsStack from '../HintsStack.vue';
import './recipe.css';
import RuleMark from './RuleMark.vue';
import { runStatusFor } from '../../js/modules/nextEngine.js';

const props = defineProps({
    idColumn: { type: String, default: '' },
    /** Er der grupper på arket lige nu? Så klapper opskriften sammen. */
    hasGroups: { type: Boolean, default: false },
});
const emit = defineEmits(['generate', 'settingsChanged', 'rulesChanged', 'switchView', 'showClass']);

// ─── Størrelse ──────────────────────────────────────────────────────────────
// Tallet må stå tomt et øjeblik, mens læreren taster, men det der gemmes og dannes på er altid
// et helt tal mellem 1 og 999.
const groupMode = computed({
    get: () => state.groupMode || 'size',
    set: (v) => { state.groupMode = v; },
});
const groupTarget = ref(4);
const groupMod = ref('+');

function clampedTarget() {
    return clampTarget(groupTarget.value);
}

function loadSettings() {
    const s = state.currentClass?.settings;
    groupMode.value = s?.groupMode || 'size';
    groupTarget.value = s?.groupTarget || 4;
    groupMod.value = s?.groupMod || '+';
}
watch(() => state.currentClass, loadSettings, { immediate: true });
// En gendannet kørsel kan skrive nye indstillinger ind udefra.
watch(() => state.currentClass?.settings, (s) => {
    if (!s) return;
    const same = (a, b) => String(a ?? '') === String(b ?? '');
    if (same(s.groupMode, groupMode.value) && same(s.groupTarget, clampedTarget()) && same(s.groupMod, groupMod.value)) return;
    loadSettings();
});

const saveSettingsSoon = debounce(() => {
    emit('settingsChanged', { groupMode: groupMode.value, groupTarget: clampedTarget(), groupMod: groupMod.value });
}, 300);
const unregisterPending = registerPendingWrite(saveSettingsSoon.flush);

// Sender kun noget, når en værdi faktisk ændres — et klik på det valgte
// eller i feltet og videre må ikke gemme klassen (to faner, se
// MatrixRecipePanel.vue og sameSettings() i BetaGroupsTab.vue).
function setMode(mode) {
    if (mode === groupMode.value) return;
    groupMode.value = mode;
    saveSettingsSoon();
}
function stepTarget(delta) {
    const next = clampTarget(clampedTarget() + delta);
    if (next === groupTarget.value) return;
    groupTarget.value = next;
    saveSettingsSoon();
}
// Det indtastede er allerede sendt (@input). Blur retter kun et tal uden for
// grænserne — og sender kun, hvis det faktisk blev rettet.
function onTargetBlur() {
    const clamped = clampedTarget();
    if (clamped === groupTarget.value) return;
    groupTarget.value = clamped;
    saveSettingsSoon();
}
function toggleMod() { groupMod.value = groupMod.value === '-' ? '+' : '-'; saveSettingsSoon(); }

const sizeParts = computed(() => sizeSentence({ mode: groupMode.value, target: clampedTarget(), mod: groupMod.value }));
const targetHints = computed(() => hintsFor(ANCHOR_TARGET));

// ─── Eleverne ───────────────────────────────────────────────────────────────
const rows = computed(() => state.currentClass?.data || []);
const presentCount = computed(() => rows.value.filter(r => !r._excluded).length);
const absentCount = computed(() => rows.value.length - presentCount.value);

/** Ca. hvor mange grupper giver størrelsen — kun som hjælp i menuen. */
const estimate = computed(() => {
    const n = presentCount.value;
    const t = clampedTarget();
    if (!n) return '';
    if (groupMode.value === 'number') {
        return perGroupEstimate(n, t);
    }
    // Samme regnestykke som motoren (og emnernes afrunding) — se expectedNewGroups.
    // Låste grupper bliver stående og tæller med i totalen.
    const locked = (state.storedStandardGroups || []).filter(g => g.locked);
    const free = splitByLockedGroups(state.currentClass?.data, locked, state.idColumn).freeCount;
    const fresh = expectedNewGroups({
        mode: 'size', target: t, mod: groupMod.value, students: free,
        lockedGroups: locked.length, topicCount: topicCount.value,
    });
    const groups = Math.max(1, fresh + locked.length);
    return `ca. ${groups} ${groups === 1 ? 'gruppe' : 'grupper'} af ${n} elever`;
});

function goToStudents() { state.classViewTab = 'students'; }

// ─── Regler ─────────────────────────────────────────────────────────────────
const rules = computed(() => {
    const cls = state.currentClass;
    if (!cls) return [];
    if (!cls.rules) cls.rules = [];
    return cls.rules;
});
async function onAddRule() {
    const index = addRule(rules.value);
    emit('rulesChanged');
    await nextTick();
    revealRule(index);
}

// ─── Aftaler om bestemte elever ─────────────────────────────────────────────
// Kun antallet står i opskriften. Med navnene fyldte aftalerne mere end selve
// opskriften (fire elever med lange navne brød over tre linjer); navnene står
// i Aftaler-vinduet, som ordet åbner.
const togetherCount = computed(() => (state.currentClass?.togetherGroups || []).length);
const separationCount = computed(() => (state.currentClass?.separations || []).length);
const agreementCount = computed(() => togetherCount.value + separationCount.value);
function openAgreements() {
    // Opskriften lukkes først: den står i browserens øverste lag (showModal),
    // og Aftaler-vinduet er et almindeligt lag — det åbnede usynligt BAG den.
    window.dispatchEvent(new CustomEvent('recipe-dialog:request', { detail: { open: false } }));
    modalActions.openAgreements(togetherCount.value ? 'together' : 'separate', [], true);
}

// Holdt aftalerne ved sidste kørsel? (null, når opskriften, klassen eller
// grupperne er ændret siden — runStatusFor). Kun Undgå hinanden kan brydes i
// et svar med grupper; Skal sammen holder altid.
//
// Uden tal for "af hvor mange": sætningen tæller de aftaler, læreren har lavet,
// mens motoren får dem renset (fraværende ud, Skal sammen-blokke, der deler en
// elev, lagt sammen) — "3 aftaler … 2 af 2 holdt" ville modsige sig selv.
// Mærket følger samme regel som reglernes (ruleMarks.js).
const agreementStatus = computed(() => {
    const a = runStatusFor(false)?.agreements;
    if (!a || !a.total) return null;
    return {
        ...a,
        text: a.broken ? `${a.broken} brudt` : 'alle holdt',
    };
});
function openBrokenAgreements() {
    window.dispatchEvent(new CustomEvent('recipe-dialog:request', { detail: { open: false } }));
    modalActions.openAgreements('separate', agreementStatus.value?.brokenIds || [], true);
}

// ─── Emner ──────────────────────────────────────────────────────────────────
const topicCount = computed(() => (state.currentClass?.topics || []).length);

// ─── Opsummeringen i bjælken ─────────────────────────────────────────────────
const summary = computed(() => recipeSummary({
    mode: groupMode.value, target: clampedTarget(), rules: rules.value,
    together: togetherCount.value, separations: separationCount.value, topics: topicCount.value,
}));

// ─── Dan grupper ────────────────────────────────────────────────────────────
function generate() {
    if (state.isGenerating) return;
    saveSettingsSoon.flush();
    emit('generate', { mode: groupMode.value, target: clampedTarget(), mod: groupMod.value });
}
// ⌘/Ctrl + Enter danner grupper — se useGenerateShortcut.js.
useGenerateShortcut(generate);
const shortcut = GENERATE_SHORTCUT;
onUnmounted(unregisterPending);

// Advarsler om opsætningen (regler, aftaler, hvad der kan gå op) står her i
// opskriften — før man danner grupper — og tælles i bjælken.
const recipeWarnings = computed(() => bannerHints.value.filter(isRecipeHint).length
    + currentLastNotes(setupNotices, state.currentClass, false, state.groupMode).length);
</script>

<template>
    <RecipeLayout :warnings="recipeWarnings" kicker="Gruppeopskrift" :summary="summary" :auto-open="!hasGroups">
        <template #actions>
            <span class="recipe__count">
                {{ presentCount }} {{ presentCount === 1 ? 'elev' : 'elever' }}<template v-if="absentCount"> ·
                    <button type="button" class="recipe__textbtn recipe__textbtn--inline" @click="goToStudents">{{ absentCount }} er væk i dag</button>
                </template>
            </span>
            <button v-if="hasGroups" type="button" class="recipe__soft" @click="emit('switchView', 'matrix')" title="Bland grupperne til en matrix-runde">
                <Shuffle :size="14" aria-hidden="true" /> Matrix-runde
            </button>
            <button v-if="hasGroups" type="button" class="recipe__soft" @click="emit('showClass')">
                <Users :size="14" aria-hidden="true" /> Vis for klassen
            </button>
            <button type="button" class="recipe__go" :disabled="state.isGenerating" @click="generate">
                {{ hasGroups ? 'Dan grupper igen' : 'Dan grupper' }}
                <span class="recipe__kbd">{{ shortcut }}</span>
            </button>
        </template>

        <template #side>
            <HintsStack :filter="isRecipeHint" />
            <ol class="recipe__lines">
                <!-- 1. Størrelse -->
                <li class="recipe__line">
                    <span class="recipe__no"></span>
                    <span class="recipe__text">
                        <template v-for="(p, i) in sizeParts" :key="'s' + i">
                            <RecipeToken v-if="p.token === 'size'" :text="p.text" label="Gruppernes størrelse">
                                <div class="recipe-seg" role="group" aria-label="Dan grupper efter">
                                    <button type="button" :class="{ on: groupMode === 'size' }" :aria-pressed="groupMode === 'size'" @click="setMode('size')">Elever pr. gruppe</button>
                                    <button type="button" :class="{ on: groupMode === 'number' }" :aria-pressed="groupMode === 'number'" @click="setMode('number')">Antal grupper</button>
                                </div>
                                <div class="recipe-stepper">
                                    <button type="button" aria-label="Færre" @click="stepTarget(-1)">−</button>
                                    <input type="number" min="1" max="999" v-model.number="groupTarget"
                                           :aria-label="groupMode === 'size' ? 'Elever pr. gruppe' : 'Antal grupper'"
                                           @input="saveSettingsSoon" @blur="onTargetBlur">
                                    <button type="button" aria-label="Flere" @click="stepTarget(1)">+</button>
                                </div>
                                <span v-if="estimate" class="recipe-pop-note">{{ estimate }}</span>
                            </RecipeToken>
                            <button v-else-if="p.token === 'mod'" type="button" class="recipe-flip"
                                    :title="'Skift til ' + (groupMod === '-' ? 'én elev ekstra' : 'én elev mindre')"
                                    @click="toggleMod">{{ p.text }}</button>
                            <span v-else-if="p.punct" class="recipe__punct">{{ p.text }}</span>
                            <template v-else>{{ p.text }}</template>
                        </template>
                    </span>
                    <span v-if="targetHints.length" class="recipe__hints">
                        <span v-for="h in targetHints" :key="h.id">{{ recipeHintText(h.text) }}
                            <span v-if="h.actions?.length" class="recipe__hintbtns">
                                <button v-for="a in h.actions" :key="a.label" type="button" class="recipe__hintbtn" @click="a.run">{{ a.label }}</button>
                            </span>
                        </span>
                    </span>
                </li>

                <!-- 2. Aftaler om bestemte elever: kun antallet (navnene i vinduet). De står
                     FØR reglerne, fordi motoren tager dem først: Skal sammen
                     brydes aldrig, og Undgå vejer lige efter Adskil altid — over Klyng og Adskil. -->
                <li v-if="agreementCount" class="recipe__line recipe__line--agreements">
                    <span class="recipe__no"><RuleMark v-if="agreementStatus" :mark="agreementStatus.mark" /></span>
                    <span class="recipe__text">
                        Der tages først hensyn til
                        <button type="button" class="recipe-tokenlike" @click="openAgreements">{{ agreementCount }} {{ agreementCount === 1 ? 'aftale' : 'aftaler' }} om bestemte elever</button>.
                        <!-- Den nye motor: hvordan det gik ved sidste kørsel -->
                        <span v-if="agreementStatus" class="recipe__agreed">{{ agreementStatus.text }}<template
                            v-if="agreementStatus.broken">.
                            <button type="button" class="recipe__hintbtn" @click="openBrokenAgreements">{{ agreementStatus.broken === 1 ? 'Vis den brudte' : `Vis de ${agreementStatus.broken} brudte` }}</button></template></span>
                    </span>
                </li>

                <!-- 3. Reglerne — én linje pr. regel, i prioriteret rækkefølge -->
                <RecipeRules :rules="rules" :id-column="idColumn" @changed="emit('rulesChanged')" />

                <!-- 4. Emner -->
                <li class="recipe__line recipe__line--section">
                    <span class="recipe__no"></span>
                    <span class="recipe__text"><RecipeTopics /></span>
                </li>
            </ol>

            <!-- Hvad motoren sagde ved sidste dannelse (i stedet for en besked) -->
            <RecipeLastRun view="standard" />
        </template>

        <template #footer="{ close }">
            <button type="button" class="recipe__textbtn" @click="close">Luk</button>
            <!-- I bunden, så den altid kan ses — også med mange regler -->
            <span class="recipe__add"><button type="button" class="recipe__textbtn recipe__textbtn--accent" @click="onAddRule">+ Tilføj regel</button></span>
            <span class="recipe__spacer"></span>
            <button type="button" class="recipe__go" :disabled="state.isGenerating" @click="generate">
                {{ hasGroups ? 'Dan grupper igen' : 'Dan grupper' }}
                <span class="recipe__kbd">{{ shortcut }}</span>
            </button>
        </template>

        <slot />
    </RecipeLayout>
</template>
