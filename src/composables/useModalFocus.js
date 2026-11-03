// useModalFocus.js — fokus- og Escape-håndtering for modalvinduer.
//
// Grupper bruger ikke native <dialog> til sine modaler (de er almindelige
// .modal-overlay-divs), og så følger FIRE ting IKKE med af sig selv:
//
//   1. fokus flytter ikke ind i vinduet, når det åbner — det bliver siddende
//      på knappen bagved, så første Tab lander et tilfældigt sted
//   2. fokus kan tabbe UD af vinduet og ned i siden bagved, som er skjult
//      bag et sløret overlay — man taber simpelthen markøren
//   3. fokus vender ikke tilbage til knappen, når vinduet lukkes
//   4. Escape lukker ikke vinduet
//
// Composable'en ordner alle fire. Den kaldes fra det enkelte modal-component
// med en ref til overlay-elementet og den funktion, der lukker vinduet.
//
// ─── HVORFOR ESCAPE BOR HER (og ikke i hvert vindue) ────────────────────────
// Escape lå før to steder: en central kæde i ModalsRoot.vue, der kendte alle
// elleve modal-flag i modalState og lukkede det øverste, PLUS fire vinduer der
// havde deres egen lytter oveni. Det gav tre problemer:
//
//   - Et nyt vindue i ModalsRoot uden en linje i kæden fik i STILHED ingen
//     Escape. Ingen fejl, ingen test — bare en tast der ikke virkede.
//   - Kæden lå i en anden fil end vinduet. Søger man efter "Escape" i
//     LatecomerModal.vue, finder man ingenting og konkluderer, at tasten
//     mangler. Den virkede. (Det skete under gennemsynet 3/9.)
//   - Undgåelser-vinduet i StudentsTab lå helt uden for begge dele: det er
//     ikke et .modal-overlay, så hverken kæden eller de tre lyttere, der
//     spørger "ligger der et vindue ovenpå?", kunne se det. Escape lukkede
//     det aldrig, og Tab gik lige forbi det ned i siden bagved.
//
// Nu er der ét sted. Hvert vindue lukker SIG SELV, og stakken nedenfor
// afgør hvem der ejer tasten: det sidst åbnede vindue. Samme stak svarer på
// `isModalOpen()`, som klassemenuen, de to skuffer og elevmarkeringen spørger
// om, før de selv reagerer på Escape — de lytter alle på document, og uden
// spørgsmålet ville ét tryk lukke to ting på én gang.
import { onBeforeMount, onMounted, onUnmounted, nextTick } from 'vue';

// Alt der kan få fokus. :not([disabled]) og tabindex="-1" filtreres fra, så
// Tab-rækkefølgen bliver den samme som browserens egen.
const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

// Åbne modalvinduer i den rækkefølge de blev åbnet. Sidste element er det
// øverste — både visuelt (alle overlays har samme z-index, så det sidst
// tegnede ligger øverst) og for tastaturet.
const openModals = [];

// Beskederne øverst på skærmen dækkede vinduernes titel, faner og luk-knap —
// målt på 320×740, hvor stakken er næsten skærmbred. De skal blive synlige (en
// fejlbesked bliver stående til den klikkes væk), men de skal ligge et andet
// sted, mens der er et vindue. Klassen er stakkens eneste udadvendte spor;
// NotificationManager flytter selv stakken ned på den.
function syncModalBodyClass() {
    document.body.classList.toggle('has-modal', openModals.length > 0);
}

/**
 * Er der et modalvindue åbent lige nu?
 *
 * Spørges af alt det, der OGSÅ lytter på Escape uden at være modalt:
 * klassemenuen, Regler- og Emner-skufferne og elevmarkeringen. De skal holde
 * fingrene væk, mens et vindue ligger ovenpå. Brug den frem for
 * `document.querySelector('.modal-overlay')` — det opslag kender kun vinduer
 * med netop den klasse og overså Undgåelser-vinduet.
 */
export function isModalOpen() {
    return openModals.length > 0;
}

// ---- Fokusring kun til tastaturet ------------------------------------
// Et tekstfelt får ALTID :focus-visible, også når fokus sættes af kode. Når
// læreren åbner et vindue med musen, og vi flytter fokus ind i feltet, så det
// er klar til at skrive i, ville feltet stå med en blå ring, som om hun
// havde klikket i det. Vi husker derfor, om sidste handling var mus eller
// tastatur, og dæmper ringen (klassen .open-focus-quiet, stylet i style.css)
// indtil første tastetryk — så er hun jo i gang med at skrive.
let lastInputWasKeyboard = false;
if (typeof document !== 'undefined') {
    document.addEventListener('keydown', () => { lastInputWasKeyboard = true; }, true);
    document.addEventListener('pointerdown', () => { lastInputWasKeyboard = false; }, true);
}

/** Sæt fokus i et felt ved åbning; ringen vises kun, hvis tastaturet åbnede vinduet. */
export function focusOnOpen(el) {
    if (!el) return;
    el.focus();
    const isText = el.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea');
    if (!isText || lastInputWasKeyboard) return;
    el.classList.add('open-focus-quiet');
    const loud = () => {
        el.classList.remove('open-focus-quiet');
        el.removeEventListener('keydown', loud);
        el.removeEventListener('blur', loud);
    };
    el.addEventListener('keydown', loud);
    el.addEventListener('blur', loud);
}

function focusableIn(root) {
    if (!root) return [];
    return [...root.querySelectorAll(FOCUSABLE)]
        // offsetParent er null for skjulte elementer (display:none og
        // forældre-skjulte). Uden filteret kunne Tab lande i et element
        // læreren ikke kan se.
        .filter(el => el.offsetParent !== null || el === document.activeElement);
}

/**
 * @param {import('vue').Ref<HTMLElement|null>} containerRef  ref til overlay-elementet
 * @param {{ onEscape?: () => void }} [options]  onEscape kaldes, når Escape
 *        trykkes, OG dette vindue er det øverste. Udelades den, gør Escape
 *        ingenting for vinduet (men det tæller stadig med i `isModalOpen()`).
 */
export function useModalFocus(containerRef, options = {}) {
    const { onEscape } = options;
    let previouslyFocused = null;

    // Klik på det slørede overlay lukker vinduet. Men et klik, der STARTER i et
    // felt og slippes uden for vinduet (man trækker for at markere tekst og
    // overskyder), rammer også overlayet — browseren sender klikket til
    // nærmeste fælles forælder. Så lukkede vinduet med det indtastede. Derfor
    // huskes, hvor knappen blev trykket NED; kun et tryk der både startede og
    // sluttede på overlayet tæller som "klik udenfor".
    let pressedOnBackdrop = false;
    const onMousedown = (e) => {
        pressedOnBackdrop = e.target === containerRef.value;
    };
    function onBackdropClick(e) {
        if (e.target !== e.currentTarget || !pressedOnBackdrop) return;
        onEscape?.();
    }

    // Kun det øverste vindue reagerer. Alle vinduer lytter på document, så
    // uden tjekket ville et vindue nedenunder lukke sig selv samtidig.
    const isTopmost = () => openModals[openModals.length - 1] === containerRef;

    function onKeydown(e) {
        if (e.key === 'Escape') {
            if (!onEscape || !isTopmost()) return;
            onEscape();
            return;
        }
        if (e.key !== 'Tab' || !isTopmost()) return;
        const items = focusableIn(containerRef.value);
        if (items.length === 0) return;

        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;

        // Er fokus røget helt uden for vinduet (fx efter en re-render),
        // hentes det ind igen frem for at lade det løbe videre i baggrunden.
        if (!containerRef.value?.contains(active)) {
            e.preventDefault();
            first.focus();
            return;
        }
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    }

    // Knappen der åbnede vinduet huskes i onBeforeMount, IKKE i onMounted.
    // Et vindue må gerne selv sætte fokus i sin egen onMounted — PromptModal
    // gør, så teksten i feltet er markeret — og den krog er registreret FØR
    // vores og kører derfor først. Huskede vi først her, var "det der havde
    // fokus før" feltet i vinduet selv; det forsvinder ved luk, og markøren
    // endte på <body> i alle fem PromptModal-vinduer. onBeforeMount kører før
    // ALLE komponentens onMounted-kroge, uanset rækkefølgen de er skrevet i.
    onBeforeMount(() => {
        previouslyFocused = document.activeElement;
    });

    onMounted(async () => {
        openModals.push(containerRef);
        syncModalBodyClass();
        document.addEventListener('keydown', onKeydown);
        containerRef.value?.addEventListener('mousedown', onMousedown);
        // nextTick: indholdet er først i DOM'en efter den første render.
        await nextTick();
        // Har vinduet selv sat fokus (fx PromptModal, der også markerer
        // teksten i feltet), skal vi ikke flytte det igen — så ville
        // markeringen forsvinde.
        if (containerRef.value?.contains(document.activeElement)) return;
        const items = focusableIn(containerRef.value);
        // Et felt med autofocus vinder — ellers det første fokuserbare element.
        const preferred = containerRef.value?.querySelector('[autofocus]');
        focusOnOpen(preferred || items[0]);
    });

    onUnmounted(() => {
        document.removeEventListener('keydown', onKeydown);
        containerRef.value?.removeEventListener('mousedown', onMousedown);
        const i = openModals.lastIndexOf(containerRef);
        if (i > -1) openModals.splice(i, 1);
        syncModalBodyClass();
        // Fokus tilbage til knappen der åbnede vinduet. isConnected: knappen
        // kan være forsvundet med det den lukkede (fx en slettet klasse).
        if (previouslyFocused && previouslyFocused.isConnected) {
            previouslyFocused.focus();
        }
    });

    return { onBackdropClick };
}
