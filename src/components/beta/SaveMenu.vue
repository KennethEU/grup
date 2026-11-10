<script setup>
// Gem-menuen i beta — ÉN knap i bundbjælken i stedet for to ("Kolonne" og
// "Gem"), fordi læreren ikke kunne se forskel på dem. Menuen forklarer de to
// slags gem med en linje hjælpetekst hver.
//
// Samme facon som Del-menuen (ShareMenu.vue): placeringen deles via
// useBarPopover, lukning og fokus via useBarMenuDismiss. Menuen vælger ikke selv,
// hvad der sker — den siger bare "historik" eller "kolonne" til
// GroupResultsPanel, som kalder de samme funktioner som før.
import { ref } from 'vue';
import { useBarPopover } from '../../composables/useBarPopover.js';
import { useBarMenuDismiss } from '../../composables/useBarMenuDismiss.js';
import { History, Columns3 } from 'lucide-vue-next';

const emit = defineEmits(['close', 'history', 'column']);

const rootRef = ref(null);
const { menuStyle, arrowStyle } = useBarPopover(rootRef, 'save-anchor', 320);
// useBarMenuDismiss flytter fokus til den første menupunkt-knap, når menuen
// står i DOM'en (den er ikke skjult, så fokus kan lande med det samme), og
// sender det tilbage til Gem-knappen ved Escape.
const { onRootFocusOut } = useBarMenuDismiss(rootRef, {
    anchorClass: 'save-anchor',
    onClose: () => emit('close'),
});

// Piletaster mellem punkterne. Menuen har kun to, så der er ingen Home/End.
function onKeydown(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...rootRef.value.querySelectorAll('[role="menuitem"]')];
    const at = items.indexOf(document.activeElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus();
    e.preventDefault();
}

function pick(kind) {
    emit('close');
    emit(kind);
}
</script>

<template>
  <div ref="rootRef" class="save-menu" data-popup-menu :style="menuStyle" role="menu" aria-label="Gem grupperne"
       tabindex="-1" @focusout="onRootFocusOut" @keydown="onKeydown">

    <button class="save-item" role="menuitem" @click="pick('history')">
      <History :size="16" class="save-icon" aria-hidden="true" />
      <span class="save-text">
        <span class="save-title">Gem i Historik</span>
        <span class="save-desc">Opsætningen og grupperne, som de står nu. Så kan du vende tilbage til dem senere, fx næste time.</span>
      </span>
    </button>

    <button class="save-item" role="menuitem" @click="pick('column')">
      <Columns3 :size="16" class="save-icon" aria-hidden="true" />
      <span class="save-text">
        <span class="save-title">Gem som kolonne i elevlisten</span>
        <span class="save-desc">Hvem der var sammen, bliver en kolonne i elevlisten. Næste gang kan gruppeopskriften sørge for, at de ikke kommer sammen igen (Fordel på kolonnen).</span>
      </span>
    </button>

    <span class="arrow" :style="arrowStyle"></span>
  </div>
</template>

<style scoped>
/* Samme ramme som Del-menuen — de hænger på den samme bjælke. */
.save-menu {
    position: absolute;
    inset-block-end: calc(100% + 10px);
    inset-inline-start: 0;
    z-index: 20;
    inline-size: 320px;
    box-sizing: border-box;
    padding: 6px;
    /* Dækkende baggrund, så gruppekortene bag ikke skinner igennem
       beskrivelserne (se ShareMenu.vue for målingen). */
    background: linear-gradient(var(--bg-modal), var(--bg-modal)), var(--bg-body);
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    box-shadow: 0 10px 30px oklch(0 0 0 / 18%);
    text-align: start;
}
.save-menu:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

.arrow {
    position: absolute;
    inset-block-start: 100%;
    inline-size: 12px;
    block-size: 6px;
    background: linear-gradient(var(--bg-modal), var(--bg-modal)), var(--bg-body);
    border-inline: 1px solid var(--border-strong);
    border-block-end: 1px solid var(--border-strong);
    clip-path: polygon(0 0, 100% 0, 50% 100%);
}

.save-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    inline-size: 100%;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--text-main);
    text-align: start;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
}
.save-item:hover,
.save-item:focus-visible {
    background: var(--primary-light);
    border-color: var(--primary-border);
}
.save-item:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }

.save-icon { flex-shrink: 0; margin-block-start: 1px; color: var(--primary); }
.save-text { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; }
.save-title { font-size: 12.5px; font-weight: 700; }
.save-desc { font-size: 11px; line-height: 1.45; color: var(--text-muted); text-wrap: pretty; }

@media (max-width: 640px) {
    .save-item { min-block-size: 44px; }
}
</style>
