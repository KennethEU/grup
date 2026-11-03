<script setup>
// Et ord i opskriften, man kan klikke på. Ordet er en rigtig knap (Tab når
// den), og klikket åbner en lille menu lige under ordet. Kun én menu er åben
// ad gangen; Escape og et klik ved siden af lukker den.
//
// Menuen står med `position: fixed` ud fra ordets plads på skærmen. Inde i
// opskriftens vindue ruller kroppen, og en almindelig absolut menu blev klippet
// af kanten — de øverste valg i regel-menuen kunne slet ikke ses. Fast placeret
// er det kun skærmens kant, der tæller: menuen åbner nedad, hvis den kan være
// der, ellers opad, og ellers dér hvor der er mest plads (og ruller selv).
// Ruller siden bagved, lukker menuen, så den ikke svæver væk fra ordet.
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

const props = defineProps({
    text: { type: String, required: true },
    /** Ordet er en pladsholder (fx "vælg kolonne"): reglen gør ikke noget endnu. */
    missing: { type: Boolean, default: false },
    /** Hvad ordet ændrer — læses op sammen med ordet ("Kolonne: Køn"). */
    label: { type: String, default: '' },
    /** En bred menu (fx regeltyperne i to spalter). */
    wide: { type: Boolean, default: false },
    /** En stille forklaring ("Hvorfor?") i stedet for et valg: lille tekst med
     *  et spørgsmålstegn, åbner også, når musen holdes over den. */
    quiet: { type: Boolean, default: false },
});

const open = ref(false);
const root = ref(null);
const btn = ref(null);
const pop = ref(null);
const popStyle = ref({});

const GAP = 8;
const EDGE = 12;

function place() {
    const b = btn.value?.getBoundingClientRect();
    const el = pop.value;
    if (!b || !el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.scrollHeight;
    const below = vh - b.bottom - GAP - EDGE;
    const above = b.top - GAP - EDGE;
    const left = Math.max(EDGE, Math.min(b.left, vw - w - EDGE));
    let style;
    if (h <= below || below >= above) {
        style = { insetBlockStart: `${b.bottom + GAP}px`, maxBlockSize: `${Math.max(120, below)}px` };
    } else {
        style = { insetBlockEnd: `${vh - b.top + GAP}px`, maxBlockSize: `${Math.max(120, above)}px` };
    }
    popStyle.value = { ...style, insetInlineStart: `${left}px` };
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled)';

function focusFirst() {
    // Første valgmulighed får fokus, så tastaturet kan gå direkte videre.
    pop.value?.querySelector(FOCUSABLE)?.focus({ preventScroll: true });
}

// `viaHover`: musen åbnede menuen. Så må den ikke tage tastaturfokus fra det,
// man er i gang med at skrive i — kun et klik eller Enter/Mellemrum flytter
// fokus ind.
async function toggle(viaHover = false) {
    open.value = !open.value;
    if (open.value) {
        document.dispatchEvent(new CustomEvent('recipe:token-open', { detail: root.value }));
        popStyle.value = { visibility: 'hidden' };
        await nextTick();
        place();
        // place() fjerner `visibility: hidden`. Menuen er først synlig, når
        // Vue har skrevet stilen ind i DOM'en — og en skjult knap kan ikke få
        // fokus (kaldet gjorde før ingenting, når man åbnede med tastaturet).
        await nextTick();
        if (!viaHover) focusFirst();
    }
}
// Pil op/ned går mellem valgene i menuen (Home/End til første og sidste).
// Kun på knapper: i et tekstfelt eller en liste har pilene deres egen
// betydning.
function onPopKey(e) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    if (e.target.tagName !== 'BUTTON') return;
    const items = [...pop.value.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const at = items.indexOf(e.target);
    let next;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else next = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    e.preventDefault();
    items[next].focus({ preventScroll: false });
}
// Den stille forklaring åbner allerede, når musen holdes over ordet, og
// lukker igen, når musen går væk — men kun hvis det var musen, der åbnede den.
// Et klik (eller Enter) åbner den, så den bliver stående.
let openedByHover = false;
let hoverTimer = null;
function onEnter() {
    if (!props.quiet || open.value) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => { openedByHover = true; toggle(true); }, 250);
}
function onLeave() {
    clearTimeout(hoverTimer);
    if (props.quiet && open.value && openedByHover) close(false);
}
function onClick() {
    clearTimeout(hoverTimer);
    if (openedByHover && open.value) {
        // Musen har allerede åbnet den; klikket gør den stående og flytter
        // fokus ind, som hvis klikket havde åbnet den.
        openedByHover = false;
        focusFirst();
        return;
    }
    openedByHover = false;
    toggle();
}
function close(returnFocus = true) {
    open.value = false;
    if (returnFocus) btn.value?.focus();
}
function onDocClick(e) {
    if (open.value && root.value && !root.value.contains(e.target)) open.value = false;
}
function onOtherOpen(e) {
    if (e.detail !== root.value) open.value = false;
}
// Ruller noget bagved (fx opskriftens krop), lukker menuen — men ikke når det
// er menuen selv, der ruller.
function onScroll(e) {
    if (open.value && !pop.value?.contains(e.target)) open.value = false;
}
function onKey(e) {
    if (e.key === 'Escape' && open.value) {
        // preventDefault, ikke kun stopPropagation: browseren lukker selv et
        // åbent <dialog> på Escape (opskriftens vindue), og det stoppes kun af
        // preventDefault. Ellers lukkede ét tryk både menuen og vinduet.
        e.preventDefault();
        e.stopPropagation();
        // Fokus tilbage på ordet — men kun hvis fokus var i menuen (eller
        // ingen steder). Står læreren i et andet felt, mens musen har åbnet
        // en forklaring, skal Escape ikke trække hende væk derfra.
        const a = document.activeElement;
        close(!a || a === document.body || !!root.value?.contains(a));
    }
}
// Tab ud af menuen lukker den. Ellers blev den stående og svævede over den
// næste linje, mens fokus var gået videre — og et senere Escape hev fokus
// tilbage hertil. `relatedTarget` er tom, når et klik rammer noget, der ikke
// kan få fokus (fx menuens baggrund, eller Safari, der ikke giver knapper
// fokus ved klik), eller når den fokuserede knap forsvinder; så bliver menuen
// stående, og klik udenfor (onDocClick) klarer resten. Det samme, når fokus
// går til noget, der OMSLUTTER ordet: Safari giver ved et klik på en knap i
// menuen fokus til opskriftens vindue — og lukkede menuen her, før klikket
// nåede frem, så valget aldrig blev truffet.
function onFocusOut(e) {
    const to = e.relatedTarget;
    if (!open.value || !to || !root.value) return;
    if (root.value.contains(to) || to.contains(root.value)) return;
    open.value = false;
}
onMounted(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('recipe:token-open', onOtherOpen);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
});
onUnmounted(() => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('recipe:token-open', onOtherOpen);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    clearTimeout(hoverTimer);
});
</script>

<template>
    <span class="rtok" ref="root" @mouseenter="onEnter" @mouseleave="onLeave" @focusout="onFocusOut">
        <button ref="btn" type="button" class="rtok__btn"
                :class="{ 'is-missing': missing, 'is-open': open, 'is-quiet': quiet }"
                aria-haspopup="dialog" :aria-expanded="open ? 'true' : 'false'"
                :aria-label="label ? `${label}: ${text}` : undefined"
                @click.stop="onClick"><span v-if="quiet" class="rtok__q" aria-hidden="true">?</span>{{ text }}</button>
        <span v-if="open" ref="pop" class="rtok__pop" :class="{ 'is-wide': wide }" :style="popStyle" role="dialog" :aria-label="label || text" @click.stop @keydown="onPopKey">
            <slot :close="close" />
        </span>
    </span>
</template>

<style scoped>
.rtok {
    position: relative;
    display: inline-block;
}
.rtok__btn {
    font: inherit;
    font-weight: 600;
    color: var(--ink);
    background: color-mix(in oklch, var(--primary) 8%, transparent);
    border: none;
    border-bottom: 2px solid var(--primary);
    border-radius: 5px 5px 0 0;
    padding: 0 6px;
    margin: 0 1px;
    cursor: pointer;
    line-height: inherit;
}
.rtok__btn:hover,
.rtok__btn.is-open {
    background: color-mix(in oklch, var(--primary) 15%, transparent);
}
.rtok__btn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
}
/* Den stille forklaring: tekst i ink-3 med et lille spørgsmålstegn i en ring */
.rtok__btn.is-quiet {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 0 4px;
    font-weight: 500;
    color: var(--ink-3);
}
.rtok__btn.is-quiet:hover,
.rtok__btn.is-quiet.is-open { color: var(--ink); background: var(--paper-3); }
.rtok__q {
    display: inline-grid;
    place-items: center;
    inline-size: 15px;
    block-size: 15px;
    border: 1px solid currentColor;
    border-radius: 50%;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
}
/* En pladsholder: reglen mangler noget og gør ingenting endnu */
.rtok__btn.is-missing {
    color: var(--color-warning);
    background: color-mix(in oklch, var(--color-warning) 9%, transparent);
    border-bottom-style: dashed;
    border-bottom-color: var(--color-warning);
    font-weight: 500;
}
.rtok__pop {
    /* Placeringen (inset og højden) sættes af place() */
    position: fixed;
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 2px;
    inline-size: max-content;
    min-inline-size: 220px;
    max-inline-size: min(340px, calc(100vw - 24px));
    overflow-y: auto;
    box-sizing: border-box;
    padding: 6px;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 12px;
    box-shadow: 0 12px 32px oklch(0 0 0 / 12%);
    font-size: 13px;
    font-weight: 400;
    letter-spacing: normal;
    line-height: 1.4;
    color: var(--ink);
    text-align: start;
    white-space: normal;
}
.rtok__pop.is-wide {
    display: grid;
    grid-template-columns: 1fr 1fr;
    inline-size: min(560px, calc(100vw - 24px));
    max-inline-size: none;
}
</style>
