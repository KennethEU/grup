<script setup>
// En venlig besked på en smal skærm (en telefon): Grupper er bygget til en
// computer med mus. Den kan lukkes, og så kommer den ikke igen i denne
// browser — programmet virker stadig, man kan bare ikke arbejde lige så godt.
import { onMounted, ref } from 'vue';
import './recipe.css';

const KEY = 'grupper-smal-skaerm-set';
const dialog = ref(null);

onMounted(() => dialog.value?.showModal());

function close() {
    try { localStorage.setItem(KEY, '1'); } catch { /* uden lager: den kommer igen næste gang */ }
    dialog.value?.close();
}
</script>

<template>
    <dialog ref="dialog" class="recipe-dialog small-screen" aria-labelledby="small-screen-title"
            @cancel.prevent="close">
        <div class="recipe-dialog__panel">
            <div class="recipe-dialog__body small-screen__body">
                <h2 id="small-screen-title" class="small-screen__title">grup.dk er lavet til computer</h2>
                <p>Du kan godt kigge og klikke rundt her, men nogle ting — fx at trække elever mellem grupperne — kræver en mus og en større skærm.</p>
            </div>
            <footer class="recipe-dialog__foot small-screen__foot">
                <button type="button" class="recipe__go" autofocus @click="close">OK</button>
            </footer>
        </div>
    </dialog>
</template>

<style>
.small-screen { inline-size: min(420px, 92vw); }
.small-screen__body { padding-block-start: 28px; }
.small-screen__title {
    margin: 0 0 12px;
    font-size: 20px;
    font-weight: 700;
    color: var(--ink);
    text-wrap: balance;
}
.small-screen__body p {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--ink-2);
    text-wrap: pretty;
}
.small-screen__foot { justify-content: flex-end; }
</style>
