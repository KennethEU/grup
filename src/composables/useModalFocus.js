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
// Composable'en ordner alle fire — og en femte, som kun en skærmlæser mærker:
//
//   5. siden bagved er ikke væk. Fokusfælden holder kun Tab inde; en
//      skærmlæsers læsemarkør (VoiceOver VO+pil, et swipe på en iPad) går
//      uden om Tab og vandrer lige ned i knapperne bag vinduet. aria-modal
//      skulle sige det samme, men browserne følger den ikke ens. Derfor
//      gøres alt UDEN FOR det øverste vindue `inert` (se syncInert nedenfor).
//
// Den kaldes fra det enkelte modal-component
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

/**
 * Det øverste vindues panel (den hvide kasse), eller null uden vindue.
 *
 * Alle vinduerne er bygget ens: en baggrund over hele skærmen (det element,
 * stakken kender) med panelet som første barn — `.modal-content` i de fleste,
 * `.avoid-modal` i Aftaler. Beskedstakken (NotificationManager) spørger, så
 * den kan stille sig ved siden af panelet i stedet for oven på dets knapper.
 */
export function topModalPanel() {
    const top = openModals[openModals.length - 1]?.value;
    if (!top || !top.isConnected) return null;
    return top.firstElementChild || top;
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

// ---- Siden bagved er inert --------------------------------------------
// Vinduerne bor to forskellige steder: de fleste i ModalsRoot INDE i #app,
// men bekræft-, navngiv- og Vis for klassen-vinduerne er teleporteret til
// <body>. Så `inert` på #app duer ikke for alle. I stedet går vi fra det
// øverste vindue op til <body> og gør hvert trins SØSKENDE inerte. Vinduet
// selv og dets forfædre står tilbage; alt andet er låst.
//
// Undtagelser (`data-modal-keep`): beskederne øverst (de ligger ved siden af
// vinduerne i ModalsRoot, skal kunne klikkes væk og læses op) og det fælles
// værktøjstip (det viser tips til knapperne I vinduet). Usynlige elementer
// som <script> og emneforslagenes <datalist> røres ikke.
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META', 'DATALIST']);

// De elementer, VI har gjort inerte — kun dem tager vi det af igen. Et
// element, der allerede var inert (fx gitteret under en afspilning, som Vue
// styrer), lader vi være.
let madeInert = [];

// Laget "Danner grupper …" (App.vue) er også modalt, men det er ikke et
// vindue i stakken: kom det med dér, ville isModalOpen() svare ja under hver
// dannelse og ændre Escape for menuerne. Det melder sig i stedet her og
// tæller kun, når intet vindue står øverst. Samme regnestykke, ét sæt inert.
let blockingOverlay = null;

/** Gør siden uden for `el` inert (null: slip igen). Til lag uden for vindues-stakken. */
export function setBlockingOverlay(el) {
    blockingOverlay = el || null;
    syncInert();
}

// Regner det hele om fra bunden: tag alt vores af, og læg det på igen ud
// fra det vindue, der står øverst NU. Kaldes ved hver åbning og lukning, så
// et vindue, der lukker oven på et andet, giver plads til det nederste — og
// det sidste, der lukker, efterlader en side helt uden inert.
function syncInert() {
    for (const el of madeInert) el.removeAttribute('inert');
    madeInert = [];
    const top = openModals[openModals.length - 1]?.value || blockingOverlay;
    if (!top || !top.isConnected) return;
    for (let node = top; node.parentElement && node !== document.body; node = node.parentElement) {
        for (const sibling of node.parentElement.children) {
            if (sibling === node || SKIP_TAGS.has(sibling.tagName)) continue;
            if (sibling.hasAttribute('inert') || sibling.hasAttribute('data-modal-keep')) continue;
            sibling.setAttribute('inert', '');
            madeInert.push(sibling);
        }
    }
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
        // Er vinduet lukket igen i mellemtiden (to hurtige Escape), har
        // onUnmounted allerede ryddet op — så skal intet låses.
        if (!openModals.includes(containerRef)) return;
        // Har vinduet selv sat fokus (fx PromptModal, der også markerer
        // teksten i feltet), skal vi ikke flytte det igen — så ville
        // markeringen forsvinde.
        if (!containerRef.value?.contains(document.activeElement)) {
            const items = focusableIn(containerRef.value);
            // Et felt med autofocus vinder — ellers det første fokuserbare element.
            const preferred = containerRef.value?.querySelector('[autofocus]');
            focusOnOpen(preferred || items[0]);
        }
        // Først når fokus er inde i vinduet: knappen, der åbnede det, ligger
        // bagved, og et inert element kan ikke have fokus.
        syncInert();
    });

    onUnmounted(() => {
        document.removeEventListener('keydown', onKeydown);
        containerRef.value?.removeEventListener('mousedown', onMousedown);
        const i = openModals.lastIndexOf(containerRef);
        if (i > -1) openModals.splice(i, 1);
        syncModalBodyClass();
        // FØR fokus gives tilbage: knappen ligger i den side, der var inert,
        // og fokus på et inert element ender på <body>.
        syncInert();
        // Fokus tilbage til knappen der åbnede vinduet. isConnected: knappen
        // kan være forsvundet med det den lukkede (fx en slettet klasse).
        if (previouslyFocused && previouslyFocused.isConnected) {
            previouslyFocused.focus();
        }
    });

    return { onBackdropClick };
}
