<script setup>
// Guiden til elevlisten: samme guide som til gruppeopskriften (RecipeGuide.vue),
// med sine egne trin. Kommer af sig selv første gang, der står elever på listen,
// og "Vis guide" i topbjælken henter den igen.
import { computed } from 'vue';
import RecipeGuide from './RecipeGuide.vue';
import { reactiveState as state } from '../../js/modules/reactiveState.js';
import { STUDENT_GUIDE_KEY } from '../../js/modules/recipeGuide.js';

const $ = (sel) => document.querySelector(sel);
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const undoKey = isMac ? '⌘ Z' : 'Ctrl Z';

const headerNamed = (text) => Array.from(document.querySelectorAll('#tab-students thead th'))
    .find(th => (th.textContent || '').toLowerCase().includes(text));

// Trin, hvis knap ikke findes, springes over af guiden selv.
const STEPS = [
    {
        title: 'Elevlisten',
        text: `Klik i en celle for at skrive. Enter hopper ned til næste elev, og ${undoKey} fortryder.`,
        find: () => ({ el: $('#tab-students tbody tr') }),
    },
    {
        title: 'Overskrifterne',
        text: 'Klik for at sortere og dobbeltklik for at omdøbe. Højreklik skjuler indholdet, hvis kolonnen ikke skal ses på storskærmen.',
        find: () => ({ el: $('#tab-students thead tr') }),
    },
    {
        title: 'Til stede',
        text: 'Fjern hakket, hvis en elev er væk i dag. Eleven bliver på listen, men kommer ikke med i grupperne.',
        find: () => ({ el: headerNamed('til stede') }),
    },
    {
        title: 'Elever og kolonner',
        text: 'Tilføj en elev eller en kolonne, fx køn eller niveau. Med Flyt bestemmer du kolonnernes rækkefølge.',
        find: () => ({ el: $('#add-row-btn')?.closest('.pill-group') }),
    },
    {
        title: 'Kategoriser og Ranger',
        text: 'Kategoriser laver en ny kolonne ud fra en anden, fx karakterer til lav, middel og høj. Ranger fortæller, hvad der er mest. Under Aftaler ser du alle aftaler.',
        find: () => ({ el: $('#cat-btn')?.closest('.pill-group') }),
    },
    {
        title: 'Lav aftale',
        text: 'Sæt hak ved mindst to elever under Aftale og tryk her. Vælg, om de skal sammen eller undgå hinanden.',
        find: () => ({ el: $('#create-agreement-btn') }),
    },
    {
        title: 'Vis',
        text: 'Her vælger du, hvilken kolonne der står på gruppekortene. Som regel navnet.',
        find: () => ({ el: $('.id-selector-wrapper') }),
    },
];

const hasStudents = computed(() => (state.currentClass?.data?.length || 0) > 0);
</script>

<template>
    <!-- Guiden skal have elever at pege på. -->
    <RecipeGuide
        v-if="hasStudents"
        :steps="STEPS"
        :seen-key="STUDENT_GUIDE_KEY"
        show-event="student-guide:show"
        :wait-for-recipe="false"
    />
</template>
