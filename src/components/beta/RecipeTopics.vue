<script setup>
// Emne-linjen i opskriften: "Grupperne får [Liberalisme, Konservatisme og
// Socialisme] som emner." Ordet åbner en lille menu som opskriftens andre ord,
// hvor emnerne tilføjes og fjernes. Selve ændringerne sker i topicActions.js.
import { computed, ref, watch, nextTick, onUnmounted } from 'vue';
import { X } from 'lucide-vue-next';
import { reactiveState as state } from '../../js/modules/reactiveState.js';
import { namesText } from '../../js/modules/recipe.js';
import { ensureTopicsArray, addClassTopic, removeClassTopic, clearClassTopics } from '../../js/modules/topicActions.js';
import RecipeToken from './RecipeToken.vue';

const topics = computed(() => (Array.isArray(state.currentClass?.topics) ? state.currentClass.topics : []));
watch(() => state.currentClass, ensureTopicsArray, { immediate: true });

// Ordet i sætningen: højst tre emner ved navn, ellers "… og 4 til".
const SHOWN = 3;
const tokenText = computed(() => {
    const list = topics.value;
    if (!list.length) return 'ingen emner';
    if (list.length <= SHOWN) return namesText(list);
    return `${list.slice(0, SHOWN - 1).join(', ')} og ${list.length - SHOWN + 1} til`;
});

const input = ref(null);
const newTopic = ref('');
function add() {
    addClassTopic(newTopic.value);
    newTopic.value = '';
    input.value?.focus();
}

// Krydset forsvinder med emnet, og så faldt fokus ud af menuen (til siden
// selv). Nu får næste emnes kryds fokus — det forrige, hvis det var det
// sidste, og feltet, når der ikke er flere.
async function remove(i) {
    const pop = input.value?.closest('.rtok__pop');
    removeClassTopic(i);
    await nextTick();
    const xs = pop ? [...pop.querySelectorAll('.recipe-topics__x')] : [];
    (xs[Math.min(i, xs.length - 1)] || input.value)?.focus();
}

// "Fjern alle" kræver to klik: det fjerner også emnerne fra grupperne.
const confirming = ref(false);
let timer = null;
function clearAll() {
    if (!confirming.value) {
        confirming.value = true;
        clearTimeout(timer);
        timer = setTimeout(() => { confirming.value = false; }, 3500);
        return;
    }
    clearTimeout(timer);
    confirming.value = false;
    clearClassTopics();
    // Knappen forsvinder med emnerne; fokus til feltet i stedet for siden
    input.value?.focus();
}
onUnmounted(() => clearTimeout(timer));
</script>

<template>
    Grupperne får
    <RecipeToken :text="tokenText" label="Emner">
        <span class="recipe-pop-kicker">Emner</span>
        <form class="recipe-topics__add" @submit.prevent="add">
            <input ref="input" v-model="newTopic" type="text" class="recipe-topics__input"
                   placeholder="Skriv et emne" aria-label="Nyt emne" maxlength="60">
            <button type="submit" class="recipe-topics__addbtn" :disabled="!newTopic.trim()">Tilføj</button>
        </form>
        <span v-for="(t, i) in topics" :key="t" class="recipe-topics__row">
            <span class="recipe-topics__name">{{ t }}</span>
            <button type="button" class="recipe-topics__x" :aria-label="`Fjern ${t}`" :title="`Fjern ${t}`" @click="remove(i)"><X :size="14" /></button>
        </span>
        <span v-if="!topics.length" class="recipe-pop-note">Emnerne fordeles på grupperne, når de dannes.</span>
        <button v-else-if="topics.length > 1" type="button" class="recipe-topics__clear" @click="clearAll">
            {{ confirming ? 'Klik igen for at fjerne alle' : 'Fjern alle' }}
        </button>
    </RecipeToken>
    <template v-if="topics.length"> som emner.</template><span v-else class="recipe__punct">.</span>
</template>
