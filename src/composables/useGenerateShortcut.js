// useGenerateShortcut.js — ⌘/Ctrl + Enter danner grupper.
//
// Stod ord for ord i begge opskrifter (RecipePanel og MatrixRecipePanel);
// den eneste forskel var, hvilken generate() genvejen kalder.
import { onMounted, onUnmounted } from 'vue';
import { isModalOpen } from './useModalFocus.js';
import { typingOutsideRecipe } from '../js/modules/recipe.js';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

/** Genvejen, som den står på knappen og i guiden. */
export const GENERATE_SHORTCUT = isMac ? '⌘ Enter' : 'Ctrl Enter';

/**
 * Lyt efter ⌘/Ctrl + Enter, mens komponenten er på skærmen — men ikke midt i
 * et felt eller et vindue.
 *
 * @param {() => void} generate  det, genvejen skal gøre (panelets "Dan grupper")
 */
export function useGenerateShortcut(generate) {
    function onKey(e) {
        if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
        // Opskriftens eget vindue tæller ikke — dér SKAL genvejen virke. På id'et,
        // ikke klassen: telefonbeskeden har også klassen .recipe-dialog.
        if (isModalOpen() || document.querySelector('dialog[open]:not(#recipe-dialog)')) return;
        // Taster læreren i et felt UDEN for opskriften (gruppens emne, en celle),
        // hører Enter til feltet — ikke til en ny gruppedannelse, der ville
        // overskrive det hun er i gang med.
        if (typingOutsideRecipe(e.target)) return;
        e.preventDefault();
        generate();
    }
    onMounted(() => document.addEventListener('keydown', onKey));
    onUnmounted(() => document.removeEventListener('keydown', onKey));
}
