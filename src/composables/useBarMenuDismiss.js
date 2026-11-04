// useBarMenuDismiss.js — hvornår en menu over bundbjælken lukker, og hvor
// fokus så skal hen.
//
// HVORFOR DEN LIGGER FOR SIG: bundbjælken har fire menuer — kørselshistorikken,
// afspilningen, Del og Gem — og de skal lukke efter de SAMME regler. Før 4/11
// havde kørselshistorikken og afspilningen hver deres kopi, og begge kopier
// blev rettet for de samme fejl hver for sig (2/9, 4/9 og to gange 4/11).
// Kopier driver fra hinanden: historikken manglede fx stadig spørgsmålet om
// et modalvindue ovenpå (Escape), som afspilningen fik 4/9. Nu bor reglerne
// kun her.
//
// REGLERNE:
//  - Escape lukker — medmindre et modalvindue ligger ovenpå; så ejer det tasten.
//    Uden spørgsmålet lukkede Escape menuen BAG vinduet, mens vinduet blev
//    stående (lytteren sidder i capture-fasen og stopper udbredelsen).
//  - Klik udenfor lukker. Lytter på pointerdown, IKKE click — og det er ikke
//    en detalje. Browseren afvikler et microtask-checkpoint MELLEM to
//    klik-lyttere, så når en knap i menuen har skiftet menuens indhold (fx
//    kørselshistorikkens chip → spørgsmåls-trinnet), har Vue allerede
//    gentegnet og taget knappen ud af DOM'en, inden en click-lytter her ville
//    køre. `contains()` sagde så nej til et element, der lige HAVDE været inde
//    i menuen, og menuen lukkede sig selv. pointerdown falder før alt det.
//  - Fokus der forlader menuen, lukker den. `focusin` på document er den
//    præcise lytter; `onRootFocusOut` (bindes til @focusout på roden) er
//    bagstopperen. <body> tæller ikke som "udenfor": fokus falder dertil et
//    øjeblik, når en knap forsvinder eller slås fra under fingeren.
//  - KNAPPEN der åbnede menuen, regnes som "inde". Ellers lukker pointerdown
//    menuen, og knappens eget klik åbner den igen med det samme — et klik på
//    knappen kunne aldrig lukke menuen. Får knappen fokus, kaldes
//    `onOpenerFocus` (hvis menuen har en): kørselshistorikken slipper dér sin
//    forhåndsvisning, selvom menuen bliver stående.
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
 * @param {Function} [opts.onOpenerFocus]  kaldes når knappen, der åbnede
 *                                     menuen, får fokus (menuen bliver stående)
 * @returns {{ onRootFocusOut: Function }}  bindes til @focusout på roden
 */
export function useBarMenuDismiss(rootRef, { anchorClass, onClose, onOpenerFocus }) {
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
        const root = rootRef.value;
        if (!root) return;
        if (!isInside(e.target)) onClose();
        else if (onOpenerFocus && !root.contains(e.target)) onOpenerFocus();
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
        // focusin lytter FRA FØRSTE ØJEBLIK. Menuens egen fokusflytning i
        // nextTick lander inde i menuen og lukker den derfor ikke. Før 4/11 lå
        // lytteren i timeren nedenfor — men browseren kan lade en
        // setTimeout(…, 0) vente, mens tastetryk kommer hurtigt (målt i
        // Chromium), og så nåede et Tab ud af menuen at ske, før nogen
        // lyttede: menuen blev stående åben med fokus et helt andet sted.
        document.addEventListener('focusin', onFocusOutside);
        nextTick(focusFirstControl);
        // Klik udenfor venter et lille ophold, så det tryk der ÅBNEDE menuen
        // ikke selv lukker den. Timeren gemmes: lukker menuen inden opholdet
        // er ovre, ville lytteren ellers blive tilføjet EFTER oprydningen og
        // aldrig fjernet igen.
        outsideTimer = setTimeout(() => {
            document.addEventListener('pointerdown', onClickOutside);
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
