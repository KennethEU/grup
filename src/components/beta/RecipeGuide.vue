<script setup>
// Den korte guide til gruppeopskriften (coach marks).
//
// Kommer af sig selv ÉN gang pr. browser, første gang læreren åbner
// Grupper-fanen med en klasse — og kan altid hentes igen med "Vis guide" i
// topbjælken (AppTopbar sender beskeden 'recipe-guide:show').
//
// Læreren styrer selv: Tilbage / Næste / Spring over, ingen autoplay. Guiden
// ÆNDRER INTET i klassen — den kan kun åbne og lukke opskriftens vindue, så
// det trin den peger på er synligt (og stiller vinduet tilbage til, som det
// stod, da den begyndte).
//
// Hvorfor kortet flytter ind i <dialog>'et: opskriften er et modalt <dialog>
// (showModal) og står derfor i browserens "top layer", over alt andet — også
// over et almindeligt fixed-lag med nok så høj z-index. Og alt UDEN FOR et
// modalt dialog er inert (kan ikke klikkes), så et Popover-lag ved siden af
// ville stå øverst men være dødt. Derfor teleporteres guiden ind i selve
// dialogen, mens den er åben, og ellers til <body>.
//
// Elevlisten bruger samme guide med sine egne trin (StudentGuide.vue): trin
// uden `dialog` rører aldrig opskriftens vindue, og resten styres af props.
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { isModalOpen } from '../../composables/useModalFocus.js';
import { GENERATE_SHORTCUT } from '../../composables/useGenerateShortcut.js';
import { GUIDE_KEY, hasSeenGuide, markGuideSeen, padRect, placeCard, clampStep } from '../../js/modules/recipeGuide.js';

const props = defineProps({
    /** Er der grupper på arket? Uden grupper springes trinene om dem over. */
    hasGroups: { type: Boolean, default: false },
    /** Andre trin end opskriftens (samme form som STEPS nedenfor). */
    steps: { type: Array, default: null },
    /** Hvor det huskes, at guiden er set. */
    seenKey: { type: String, default: GUIDE_KEY },
    /** Beskeden fra guidens "Vis guide"-knap. */
    showEvent: { type: String, default: 'recipe-guide:show' },
    /** Hvor fokus lander, når guiden lukker. */
    focusOnEnd: { type: String, default: '#topbar-guide-btn' },
    /** Må den komme af sig selv første gang? */
    autoStart: { type: Boolean, default: true },
    /** Opskriften åbner selv uden grupper: vent på den, før guiden kommer. */
    waitForRecipe: { type: Boolean, default: true },
});

const shortcut = GENERATE_SHORTCUT;

const $ = (sel) => document.querySelector(sel);
// Opskriftens vindue findes på sit id, ikke på klassen .recipe-dialog: den
// deler telefonbeskeden (SmallScreenNotice.vue), som står før opskriften på
// siden og bliver liggende lukket, når læreren har trykket OK. Med klassen
// fandt guiden telefonbeskeden og lagde sig i et lukket vindue (usynlig).
const dialogEl = () => $('#recipe-dialog');

// ─── Trinene ────────────────────────────────────────────────────────────────
// find() giver elementet at pege på (eller null, så springes trinet over);
// dialog fortæller, om opskriftens vindue skal stå åbent. En find kan også
// give en anden tekst (reglerne: "Tilføj regel", hvis der ingen regler er).
const STEPS = [
    {
        title: 'Gruppeopskriften',
        text: 'Her står, hvordan grupperne dannes. Klik for at ændre den.',
        dialog: false,
        find: () => ({ el: $('.recipe-bar__open') }),
    },
    {
        title: 'Ordene er knapper',
        text: 'Opskriften er sætninger. De understregede ord er knapper — klik for at vælge.',
        dialog: true,
        find: () => ({ el: $('#recipe-dialog .recipe__lines > li:first-child') }),
    },
    {
        title: 'Regler',
        text: 'Regler bestemmer, hvordan eleverne fordeles — fx lige mange drenge og piger i hver gruppe. Valg, der ikke kan bruges, er grå med en forklaring.',
        dialog: true,
        find: () => {
            const word = $('#recipe-dialog .recipe__line--rule .rtok__btn');
            if (word) return { el: word };
            const add = $('#recipe-dialog .recipe__add button');
            if (!add) return null;
            return { el: add, text: 'Her tilføjer du regler. De bestemmer, hvordan eleverne fordeles — fx lige mange drenge og piger i hver gruppe. Valg, der ikke kan bruges, er grå med en forklaring.' };
        },
    },
    {
        title: 'Emner',
        text: 'Hver gruppe får et emne, når de dannes. Klik på ordet for at tilføje eller fjerne — Enter tilføjer et emne.',
        dialog: true,
        find: () => {
            const lines = Array.from(document.querySelectorAll('#recipe-dialog .recipe__lines > li'));
            const li = lines.find(l => /Grupperne får/.test(l.textContent || ''));
            return li ? { el: li } : null;
        },
    },
    {
        title: 'Dan grupper',
        text: `Dan grupperne — også med ${shortcut}.`,
        dialog: true,
        find: () => ({ el: $('#recipe-dialog .recipe-dialog__foot .recipe__go') }),
    },
    {
        title: 'Bagefter',
        text: 'Del, kopiér eller gem grupperne, når de er dannet. Opskriften viser bagefter, hvilke regler der blev opfyldt.',
        dialog: false,
        needsGroups: true,
        find: () => ({ el: $('.floating-action-bar') }),
    },
    {
        title: 'Smartboardet',
        text: 'Vis for klassen viser grupperne på smartboardet.',
        dialog: false,
        needsGroups: true,
        find: () => {
            const btn = Array.from(document.querySelectorAll('.recipe-bar button'))
                .find(b => /Vis for klassen/.test(b.textContent || ''));
            return btn ? { el: btn } : null;
        },
    },
];

// ─── Tilstand ───────────────────────────────────────────────────────────────
const active = ref(false);
const steps = ref([]);        // de trin, der kan vises lige nu: { def, el, text }
const index = ref(0);
const hole = ref(null);       // udskæringen: { left, top, width, height } eller null
const cardPos = ref(null);    // { left, top }
const host = ref(null);       // hvor guiden bor: <dialog> eller <body>
const moving = ref(false);    // kort glidning mellem trin (ikke ved rul)
const card = ref(null);
const nextBtn = ref(null);

const step = computed(() => steps.value[index.value] || null);
const isLast = computed(() => index.value >= steps.value.length - 1);
const announcement = computed(() => step.value
    ? `Trin ${index.value + 1} af ${steps.value.length}: ${step.value.def.title}`
    : '');

let initialDialogOpen = false;
let unmounted = false;
let token = 0;                // gør forældede asynkrone målinger uskadelige
let movingTimer = null;

const raf = () => new Promise(r => requestAnimationFrame(() => r()));

// Trin uden `dialog` (elevlistens) sender ingen besked: undefined er ikke
// det samme som "luk".
function requestDialog(open) {
    if (open === undefined || !!dialogEl()?.open === open) return;
    window.dispatchEvent(new CustomEvent('recipe-dialog:request', { detail: { open } }));
}

function resolveSteps() {
    const out = [];
    for (const def of (props.steps || STEPS)) {
        if (def.needsGroups && !props.hasGroups) continue;
        const found = def.find();
        if (!found?.el) continue;
        out.push({ def, text: found.text || def.text });
    }
    return out;
}

// Mål målet og placér kortet. Kaldes efter hvert trin, og igen ved
// størrelsesændring og rul.
function measure() {
    const s = step.value;
    if (!s) return;
    const found = s.def.find();
    const r = found?.el?.getBoundingClientRect();
    if (!r || (!r.width && !r.height)) { hole.value = null; return; }
    const box = padRect(r, 6);
    hole.value = box;
    const c = card.value;
    if (c) {
        const p = placeCard(box, { width: c.offsetWidth, height: c.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
        cardPos.value = { left: p.left, top: p.top };
    }
}

async function showStep(i) {
    const my = ++token;
    const target = steps.value[i];
    if (!target) return;
    index.value = i;
    // Flyt guiden til det rigtige lag FØR vinduet åbnes/lukkes: lukkes vinduet
    // med guiden indeni, forsvinder guiden med det.
    host.value = target.def.dialog ? dialogEl() : document.body;
    requestDialog(target.def.dialog);
    await nextTick();
    await raf();
    await raf();
    if (my !== token || !active.value) return;
    // Målet kan ligge uden for den rullende del af vinduet.
    target.def.find()?.el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    moving.value = true;
    clearTimeout(movingTimer);
    movingTimer = setTimeout(() => { moving.value = false; }, 220);
    measure();
    await nextTick();
    measure();               // kortets højde kendes først nu
    nextBtn.value?.focus({ preventScroll: true });
}

function start() {
    if (active.value) return;
    const list = resolveSteps();
    if (!list.length) return;
    initialDialogOpen = !!dialogEl()?.open;
    steps.value = list;
    active.value = true;
    showStep(0);
}

function go(delta) {
    if (!active.value) return;
    if (delta > 0 && isLast.value) { end(); return; }
    const next = clampStep(index.value, delta, steps.value.length);
    if (next !== index.value) showStep(next);
}

async function end() {
    if (!active.value) return;
    token++;
    markGuideSeen(undefined, props.seenKey);
    active.value = false;
    hole.value = null;
    cardPos.value = null;
    // Vinduet står som før guiden begyndte (uden grupper åbner opskriften
    // selv, så dér bliver den stående).
    host.value = document.body;
    if (steps.value.some(s => s.def.dialog !== undefined)) requestDialog(initialDialogOpen);
    await nextTick();
    await raf();
    if (initialDialogOpen) {
        dialogEl()?.querySelector('button')?.focus({ preventScroll: true });
    } else {
        $(props.focusOnEnd)?.focus({ preventScroll: true });
    }
}

// ─── Tastatur ───────────────────────────────────────────────────────────────
function onKeydown(e) {
    if (!active.value) return;
    // Guiden ændrer intet: hverken ⌘/Ctrl+Enter (dan grupper) eller
    // ⌘/Ctrl+Z (fortryd) må slå igennem, mens den står.
    if ((e.metaKey || e.ctrlKey) && ['enter', 'z', 'y'].includes(String(e.key).toLowerCase())) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
    }
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        end();
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
    } else if (e.key === 'Tab') {
        // Fokus bliver på kortet, så skærmlæsere og tastatur ikke vandrer
        // rundt bag mørket.
        const buttons = Array.from(card.value?.querySelectorAll('button') || []);
        if (!buttons.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const inside = card.value.contains(document.activeElement);
        if (!inside || (e.shiftKey && document.activeElement === first)) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
}
// Escape i et modalt <dialog> lukker det via 'cancel' — også det stoppes.
// Lytteren står på document (fanger-fasen ser også 'cancel', der ikke bobler),
// så den gælder det vindue, der er der NU: runde 1 og matrix-runden har hver
// sit, og de skiftes ud, mens guiden er monteret.
function onCancel(e) { if (active.value) e.preventDefault(); }

function onResizeOrScroll() { if (active.value) measure(); }
function onShow() { start(); }

let autoTimer = null;
onMounted(() => {
    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('resize', onResizeOrScroll);
    window.addEventListener('scroll', onResizeOrScroll, true);
    window.addEventListener(props.showEvent, onShow);
    document.addEventListener('cancel', onCancel, true);

    // Første gang: lidt ventetid, så opskriftens vindue (der åbner af sig selv
    // uden grupper) og bjælken er på plads. "Set" gemmes, så snart guiden
    // står (så en genindlæsning midt i ikke giver den igen) — men først dér:
    // skifter læreren fane i ventetiden, er komponenten væk, og så skal
    // guiden komme næste gang i stedet for at være "set" uden at være vist.
    if (props.autoStart && !hasSeenGuide(undefined, props.seenKey)) {
        autoTimer = setTimeout(async () => {
            if (hasSeenGuide(undefined, props.seenKey)) return;
            // Uden grupper åbner opskriften selv: vent, til den er åben, så
            // guiden og den automatiske åbning ikke løber om kap.
            for (let i = 0; props.waitForRecipe && i < 20 && !props.hasGroups && !dialogEl()?.open; i++) {
                await new Promise(r => setTimeout(r, 100));
                if (unmounted) return;
            }
            // Står et andet vindue fremme (fx telefonbeskeden eller Aftaler),
            // venter guiden til næste gang i stedet for at lægge sig oven på det.
            if (!props.waitForRecipe && (isModalOpen() || $('dialog[open]'))) return;
            start();
            if (active.value) markGuideSeen(undefined, props.seenKey);
        }, 700);
    }
});
onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('resize', onResizeOrScroll);
    window.removeEventListener('scroll', onResizeOrScroll, true);
    window.removeEventListener(props.showEvent, onShow);
    document.removeEventListener('cancel', onCancel, true);
    unmounted = true;
    clearTimeout(autoTimer);
    clearTimeout(movingTimer);
    token++;
});

const holeStyle = computed(() => hole.value ? {
    insetInlineStart: hole.value.left + 'px',
    insetBlockStart: hole.value.top + 'px',
    inlineSize: hole.value.width + 'px',
    blockSize: hole.value.height + 'px',
} : { display: 'none' });
const cardStyle = computed(() => cardPos.value
    ? { insetInlineStart: cardPos.value.left + 'px', insetBlockStart: cardPos.value.top + 'px' }
    : { visibility: 'hidden' });
</script>

<template>
    <Teleport v-if="active && host" :to="host">
        <div class="rguide" :class="{ 'is-moving': moving }">
            <!-- Fanger klik, så intet bag mørket kan røres, mens guiden står -->
            <div class="rguide__blocker"></div>
            <div class="rguide__hole" :style="holeStyle" aria-hidden="true"></div>

            <div ref="card" class="rguide__card" :style="cardStyle"
                 role="dialog" aria-labelledby="rguide-title" aria-describedby="rguide-text">
                <div class="rguide__count">{{ index + 1 }} af {{ steps.length }}</div>
                <h2 id="rguide-title" class="rguide__title">{{ step?.def.title }}</h2>
                <p id="rguide-text" class="rguide__text">{{ step?.text }}</p>
                <div class="rguide__actions">
                    <button type="button" class="rguide__skip" @click="end">Spring over</button>
                    <span class="rguide__spacer"></span>
                    <button v-if="index > 0" type="button" class="rguide__back" @click="go(-1)">Tilbage</button>
                    <button ref="nextBtn" type="button" class="rguide__next" @click="go(1)">{{ isLast ? 'Færdig' : 'Næste' }}</button>
                </div>
                <div class="rguide__live" role="status" aria-live="polite">{{ announcement }}</div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
/* Fast lag over det hele. Inde i <dialog>'et ligger det i top layer sammen med
   vinduet; på <body> er z-index nok (bjælken har 100). */
.rguide {
    position: fixed;
    inset: 0;
    z-index: 10000;
}
.rguide__blocker {
    position: absolute;
    inset: 0;
}
/* Udskæringen: en blød, afrundet ramme, hvis enorme skygge mørklægger resten.
   Det er den eneste mørklægning (ingen ekstra lag), så hullet er rent. */
.rguide__hole {
    position: absolute;
    border-radius: 10px;
    box-shadow:
        0 0 0 2px color-mix(in oklch, var(--paper) 85%, transparent),
        0 0 0 100vmax oklch(0.20 0.012 250 / 52%);
    pointer-events: none;
}
@media (prefers-reduced-motion: no-preference) {
    .rguide.is-moving .rguide__hole {
        transition: inset 0.18s ease, inline-size 0.18s ease, block-size 0.18s ease;
    }
}

.rguide__card {
    position: absolute;
    box-sizing: border-box;
    inline-size: 320px;
    padding: 16px 18px 14px;
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--rule);
    border-radius: 12px;
    box-shadow: 0 12px 32px oklch(0 0 0 / 20%);
}
.rguide__count {
    font: 500 11px var(--mono, ui-monospace, monospace);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
}
.rguide__title {
    margin: 6px 0 4px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-wrap: balance;
}
.rguide__text {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--ink-2);
    text-wrap: pretty;
}
.rguide__actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-block-start: 14px;
}
.rguide__spacer { flex: 1; }
.rguide__skip,
.rguide__back,
.rguide__next {
    min-block-size: 34px;
    padding-inline: 12px;
    border: none;
    border-radius: 8px;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
}
.rguide__skip { background: transparent; color: var(--ink-2); padding-inline: 8px; margin-inline-start: -8px; }
.rguide__back { background: transparent; color: var(--ink-2); }
.rguide__skip:hover,
.rguide__back:hover { background: var(--paper-3); color: var(--ink); }
.rguide__next { background: var(--primary); color: var(--paper); }
.rguide__next:hover { background: var(--primary-hover); }
.rguide__skip:focus-visible,
.rguide__back:focus-visible,
.rguide__next:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
/* Kun til skærmlæsere */
.rguide__live {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}
@media (forced-colors: active) {
    .rguide__hole { outline: 2px solid Highlight; }
}
</style>
