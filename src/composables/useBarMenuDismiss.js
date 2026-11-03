// useBarMenuDismiss.js — hvornår en menu over bundbjælken lukker, og hvor
// fokus så skal hen.
//
// HVORFOR DEN LIGGER FOR SIG: kørselshistorikken og afspilningen har hver
// deres kopi af de samme regler, og begge kopier er rettet for de SAMME fejl
// (2/9 og 4/9 — se kommentarerne i RunHistoryMenu.vue). Del-menuen er den
// tredje menu på bjælken. En tredje kopi ville drive fra de to andre, præcis
// som kopierne af placeringen gjorde, før useBarPopover.js samlede dem.
// De to ældre menuer er IKKE flyttet over endnu — det skal ske for sig, med
// deres egne tests.
//
// REGLERNE:
//  - Escape lukker — medmindre et modalvindue ligger ovenpå; så ejer det tasten.
//  - Klik udenfor lukker. Lytter på pointerdown, ikke click (se RunHistoryMenu).
//  - Fokus der forlader menuen, lukker den. `focusin` på document er den
//    præcise lytter; `onRootFocusOut` (bindes til @focusout på roden) er
//    bagstopperen. <body> tæller ikke som "udenfor": fokus falder dertil et
//    øjeblik, når en knap forsvinder eller slås fra under fingeren.
//  - KNAPPEN der åbnede menuen, regnes som "inde". Ellers lukker pointerdown
//    menuen, og knappens eget klik åbner den igen med det samme — et klik på
//    knappen kunne aldrig lukke menuen.
//  - Fokus ind i menuen ved åbning, og tilbage til knappen ved lukning — men
//    KUN hvis det ellers ville falde på <body>. Har læreren tabbet videre til
//    noget andet, står markøren dér, hvor hun satte den.

import { onMounted, onUnmounted, nextTick } from 'vue';
import { isModalOpen } from './useModalFocus.js';

/**
 * @param {import('vue').Ref} rootRef  menuens rod-element
 * @param {Object} opts
 * @param {string} opts.anchorClass    klassen på indpakningen om knap + menu
 * @param {Function} opts.onClose      kaldes når menuen skal lukke
 * @returns {{ onRootFocusOut: Function }}  bindes til @focusout på roden
 */
export function useBarMenuDismiss(rootRef, { anchorClass, onClose }) {
    let previouslyFocused = null;
    let outsideTimer = null;
    let focusOutTimer = null;

    /** Ligger elementet i menuen eller i knappens indpakning? */
    function isInside(el) {
        const root = rootRef.value;
        if (!root || !el) return false;
        const zone = (anchorClass && root.closest(`.${anchorClass}`)) || root;
        return zone.contains(el);
    }

    function onKeydown(e) {
        if (e.key !== 'Escape') return;
        if (isModalOpen()) return;
        e.stopPropagation();
        onClose();
    }

    function onClickOutside(e) {
        if (rootRef.value && !isInside(e.target)) onClose();
    }

    function onFocusOutside(e) {
        if (rootRef.value && !isInside(e.target)) onClose();
    }

    function onRootFocusOut() {
        clearTimeout(focusOutTimer);
        focusOutTimer = setTimeout(() => {
            if (!rootRef.value) return;                         // menuen er væk
            const active = document.activeElement;
            if (!active || active === document.body) return;    // faldt på gulvet
            if (isInside(active)) return;                       // stadig indeni
            onClose();
        }, 0);
    }

    /**
     * Første knap der kan bruges. Er alle slået fra, tager roden selv imod
     * fokus (den skal have tabindex="-1" og et navn), så menuen ikke åbner
     * sig tavst for en skærmlæser.
     */
    function focusFirstControl() {
        const root = rootRef.value;
        if (!root) return;
        const control = root.querySelector('button:not([disabled]), input:not([disabled])');
        (control || root).focus();
    }

    onMounted(() => {
        previouslyFocused = document.activeElement;
        document.addEventListener('keydown', onKeydown, true);
        nextTick(focusFirstControl);
        // Et lille ophold, så det tryk der ÅBNEDE menuen ikke selv lukker den,
        // og så menuens egen fokusflytning i nextTick ikke tæller som "udenfor".
        // Timeren gemmes: lukker menuen inden opholdet er ovre, ville lytterne
        // ellers blive tilføjet EFTER oprydningen og aldrig fjernet igen.
        outsideTimer = setTimeout(() => {
            document.addEventListener('pointerdown', onClickOutside);
            document.addEventListener('focusin', onFocusOutside);
        }, 0);
    });

    onUnmounted(() => {
        clearTimeout(outsideTimer);
        clearTimeout(focusOutTimer);
        document.removeEventListener('keydown', onKeydown, true);
        document.removeEventListener('pointerdown', onClickOutside);
        document.removeEventListener('focusin', onFocusOutside);

        const active = document.activeElement;
        if (active && active !== document.body) return;
        // isConnected: knappen kan være væk sammen med bundbjælken, hvis den
        // sidste gruppe blev fjernet, mens menuen stod åben.
        if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus();
    });

    return { onRootFocusOut };
}
