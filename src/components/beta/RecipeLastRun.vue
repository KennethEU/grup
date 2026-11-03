<script setup>
// "Sidste dannelse": det, motoren sagde om opsætningen ved sidste kørsel, og
// som opskriften ikke allerede har sagt på forhånd (en regel der ikke kan
// opfyldes, værdier uden for rangeringen, matrix der begrænses af et emne).
//
// HVORFOR HER OG IKKE SOM BESKEDER: i beta bestemmes dannelsen i opskriften, og
// en besked forsvinder igen efter få sekunder — så var det væk, før læreren
// nåede at læse det, og kom først, når grupperne allerede stod der. Her bliver
// det stående, stille, indtil næste dannelse, og tælles i bjælken.
import { computed } from 'vue';
import { setupNotices } from '../../js/modules/setupNotices.js';
import { reactiveState as state } from '../../js/modules/reactiveState.js';
import { currentLastNotes } from '../../js/modules/recipe.js';

const props = defineProps({
    /** Hvilken runde: stamgrupperne eller matrixen. */
    view: { type: String, default: 'standard' },
});
// Kun mens opsætningen er den, kørslen blev lavet med (currentLastNotes).
const notes = computed(() => currentLastNotes(setupNotices, state.currentClass, props.view === 'matrix', state.groupMode));
</script>

<template>
    <section v-if="notes.length" class="recipe__last" aria-label="Sidste dannelse">
        <div class="recipe__lastkicker">Sidste dannelse</div>
        <ul class="recipe__lastlist">
            <li v-for="(n, i) in notes" :key="i" :class="{ 'is-error': n.type === 'error' }">{{ n.text }}</li>
        </ul>
    </section>
</template>
