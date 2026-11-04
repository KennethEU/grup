<script setup>
// "Vis for klassen": grupperne som et rent ark til smartboardet.
//
// Kun det eleverne skal bruge: gruppens nummer, emnet og navnene, i en
// størrelse man kan læse bagerst i lokalet. Ingen knapper, ingen tal om køn
// og niveau — det er lærerens. Fraværende elever står ikke på arket.
// Escape (eller et klik på "Luk") går tilbage.
import { computed, onMounted, onUnmounted, ref, nextTick, watch } from 'vue';
import { useModalFocus } from '../../composables/useModalFocus.js';
import { reactiveState as state } from '../../js/modules/reactiveState.js';
import { groupDisplayName, memberDisplayName, isMemberAbsent } from '../../js/modules/utils.js';
import { studentById } from '../../js/modules/lookups.js';
import { getTopic } from '../../js/modules/storage.js';

const emit = defineEmits(['close']);
const closeBtn = ref(null);
const sheet = ref(null);

const isMatrix = computed(() => state.activeView === 'matrix');
const rows = computed(() => state.currentClass?.data || []);

// Nummeret er det samme som på lærerens kort ("Gruppe 4" er "Gruppe 4").
// Grupper uden et eneste fremmødt navn (fx en tom gruppe lavet med "Tilføj
// gruppe", eller hvor alle er væk) vises ikke: en overskrift over et tomt felt
// får klassen til at lede efter en gruppe, der ikke har nogen.
const groups = computed(() => {
    const list = (isMatrix.value ? state.storedMatrixGroups : state.storedStandardGroups) || [];
    const prefix = isMatrix.value ? 'M_' : 'S_';
    return list.map((g, i) => {
        const topic = (getTopic(g.name, prefix) || g.topic || '').trim();
        const label = groupDisplayName(g.name);
        // Nummeret og titlen skal være ÉN sandhed: en låst gruppe beholder sit
        // nummer, og "Tilføj gruppe" giver et nyt — så pladsen i listen kan
        // afvige fra navnet. Nummeret læses derfor af navnet ("Group 7").
        const fromName = String(g.name || '').match(/(\d+)\s*$/);
        return {
            key: g.name || i,
            no: String(fromName ? Number(fromName[1]) : i + 1).padStart(2, '0'),
            // To grupper kan have samme emne — navnet står altid med, så de
            // kan skilles ad.
            title: topic ? `${label} · ${topic}` : label,
            names: (g.members || [])
                .filter(m => !isMemberAbsent(m, rows.value, studentById.value))
                .map(m => memberDisplayName(m, rows.value, state.displayColumn, studentById.value)),
        };
    }).filter(g => g.names.length > 0);
});

const className = computed(() => state.currentClass?.name || '');
const perGroup = computed(() => {
    const sizes = groups.value.map(g => g.names.length).filter(Boolean);
    if (!sizes.length) return '';
    const min = Math.min(...sizes), max = Math.max(...sizes);
    return min === max ? `${min} elever` : `${min}–${max} elever`;
});
// Kolonner: bredere ark med færre grupper, så navnene kan blive store.
const columns = computed(() => {
    const n = groups.value.length;
    if (n <= 4) return Math.max(1, n);
    if (n <= 6) return 3;
    if (n <= 8) return 4;
    return 5;
});

// Arket skal kunne ses i ÉT billede — på smartboardet ruller ingen.
// Størrelserne er skrevet til en almindelig skærm og ganges med --fit. Er der
// for mange navne til højden (en lav bærbar, en stor klasse), skrues --fit ned
// i små trin, til alt er synligt. Den går ikke under 0,55: hellere rulle end
// navne, der ikke kan læses bagerst i lokalet.
async function fitToScreen() {
    const el = sheet.value;
    if (!el) return;
    el.style.setProperty('--fit', '1');
    await nextTick();
    for (let fit = 1; fit > 0.55 && el.scrollHeight > el.clientHeight + 1; ) {
        fit = Math.round((fit - 0.05) * 100) / 100;
        el.style.setProperty('--fit', String(fit));
    }
}
watch(groups, () => fitToScreen(), { flush: 'post' });

// Browserens Tilbage-knap lukker arket. Arket ligger OVEN PÅ siden — det er
// ikke en ny side — men det ligner en, og læreren trykker Tilbage for at komme
// væk fra det. Før førte det helt ud af Grupper (fx til Elevlisten).
// Vi lægger derfor ét skridt i historikken, når arket åbner: Tilbage fjerner
// netop dét skridt, og så lukker vi. Lukkes arket med "Luk" eller Escape,
// fjerner vi selv skridtet igen, så næste Tilbage gør det, læreren forventer.
// Skridtet bærer appens egen navigation videre (navView/classTab), så
// AppTopbar's onPopState lander samme sted, som læreren stod.
let ownHistoryEntry = false;
function onPopState() {
    if (!ownHistoryEntry) return;
    ownHistoryEntry = false;
    emit('close');
}
// Mens arket vises, skjules appens beskeder (NotificationManager). De er til
// læreren — fx "Fordel på Køn kan ikke gå helt op …" — og må ikke stå oven på
// det, klassen ser på smartboardet. Se `html.class-showing` i BetaStyles.vue.
//
// Siden bagved gøres `inert` af useModalFocus, mens arket står — som i alle
// de andre vinduer (se syncInert dér).
onMounted(async () => {
    // Fokus på "Luk" med det samme — FØR useModalFocus' egen onMounted (den
    // er registreret nedenfor og kører derfor efter denne) flytter fokus ind
    // uden preventScroll. "Luk" står nederst: på et lavt vindue (1280×720)
    // rullede browseren før arket ned til knappen, og overskriften var skåret
    // af foroven, før nogen havde rørt noget.
    closeBtn.value?.focus({ preventScroll: true });
    window.addEventListener('resize', fitToScreen);
    history.pushState({ ...(history.state || {}), classShow: true }, '');
    ownHistoryEntry = true;
    window.addEventListener('popstate', onPopState);
    document.documentElement.classList.add('class-showing');
    await nextTick();
    // Skrifterne skal være hentet, før der måles — ellers måles med reserveskriften
    await document.fonts?.ready;
    await fitToScreen();
});
onUnmounted(() => {
    window.removeEventListener('resize', fitToScreen);
    window.removeEventListener('popstate', onPopState);
    // Lukket med "Luk" eller Escape: skridtet ligger der stadig — fjern det
    if (ownHistoryEntry && history.state?.classShow) history.back();
    ownHistoryEntry = false;
    document.documentElement.classList.remove('class-showing');
});

// Arket er et vindue som alle de andre, så det står i deres fælles stak.
// Uden den troede resten af appen, at intet lå ovenpå: Ctrl+Enter dannede nye
// grupper BAG arket (og klassen så dem skifte plads), og Tab gik videre ned i
// de skjulte knapper, hvor Enter kunne trykke på dem. Stakken giver også
// Escape (kun til det øverste vindue), en fokusfælde, en inert side bagved og
// fokus tilbage på "Vis for klassen", når arket lukkes.
useModalFocus(sheet, { onEscape: () => emit('close') });
</script>

<template>
    <Teleport to="body">
        <div ref="sheet" class="show" role="dialog" aria-modal="true" aria-label="Grupperne vist for klassen">
            <!-- div, ikke header/footer: inde i et vindue blev de til et ekstra
                 "banner"- og "sidefod"-landemærke for skærmlæseren -->
            <div class="show__head">
                <div>
                    <div class="show__kicker">{{ className }}{{ isMatrix ? ' · matrixgrupper' : '' }}</div>
                    <h1 class="show__title">Find din gruppe</h1>
                </div>
                <div class="show__meta">
                    {{ groups.length }} {{ groups.length === 1 ? 'gruppe' : 'grupper' }}<template v-if="perGroup"> · {{ perGroup }}</template>
                </div>
            </div>

            <div class="show__grid" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
                <section v-for="g in groups" :key="g.key" class="show__group">
                    <h2 class="show__group-title">
                        <!-- Titlen siger allerede "Gruppe 1"; skærmlæseren skal
                             ikke læse "nul et" foran -->
                        <span class="show__no" aria-hidden="true">{{ g.no }}</span>
                        <span>{{ g.title }}</span>
                    </h2>
                    <!-- role="list": Safari (VoiceOver) regner en liste med
                         list-style: none for ikke at være en liste (som udskriften) -->
                    <ul class="show__names" role="list">
                        <li v-for="(n, i) in g.names" :key="i">{{ n }}</li>
                    </ul>
                </section>
            </div>

            <div class="show__foot">
                <span class="show__brand">grup<span>.</span>dk</span>
                <!-- Knappen hedder "Luk" for skærmlæseren; genvejen siges af
                     aria-keyshortcuts i stedet for at blive læst som tekst -->
                <button ref="closeBtn" type="button" class="show__close" aria-keyshortcuts="Escape" @click="emit('close')">Luk<span aria-hidden="true"> · Esc</span></button>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.show {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    /* Luften følger både bredde og højde: på en lav skærm var toppen før en
       hel overskrift høj, og man måtte rulle for at se den sidste gruppe. */
    padding-block: clamp(20px, min(3vw, 4vh), 56px) clamp(16px, min(2vw, 3vh), 36px);
    padding-inline: clamp(32px, 5vw, 96px);
    background: var(--paper);
    color: var(--ink);
    overflow-y: auto;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
}
.show__head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
}
.show__kicker {
    display: flex;
    align-items: center;
    gap: 16px;
    font: 500 clamp(12px, 1vw, 16px) var(--mono, ui-monospace, Menlo, monospace);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-3);
}
.show__kicker::before {
    content: "";
    inline-size: 36px;
    block-size: 2px;
    background: var(--primary);
}
.show__title {
    margin-block: 8px 0;
    margin-inline: 0;
    font-size: calc(clamp(30px, min(3.6vw, 6.5vh), 64px) * var(--fit, 1));
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
}
.show__meta {
    font: 400 clamp(13px, 1vw, 18px) var(--mono, ui-monospace, Menlo, monospace);
    color: var(--ink-3);
    text-align: end;
}
.show__grid {
    flex: 1;
    display: grid;
    column-gap: clamp(24px, 3vw, 56px);
    row-gap: calc(clamp(18px, min(2.6vw, 4vh), 44px) * var(--fit, 1));
    align-content: start;
    margin-block-start: calc(clamp(16px, min(2.6vw, 4vh), 44px) * var(--fit, 1));
}
.show__group {
    border-block-start: 2px solid var(--ink);
    padding-block-start: clamp(10px, 1vw, 16px);
    min-inline-size: 0;
}
.show__group-title {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-block: 0 10px;
    margin-inline: 0;
    font-size: calc(clamp(18px, min(1.9vw, 3.6vh), 34px) * var(--fit, 1));
    font-weight: 700;
    letter-spacing: -0.02em;
}
.show__no {
    font-family: var(--mono, ui-monospace, Menlo, monospace);
    font-weight: 500;
    color: var(--primary);
}
.show__names {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: calc(clamp(16px, min(1.75vw, 3.3vh), 32px) * var(--fit, 1));
    line-height: 1.45;
}
.show__names li { overflow-wrap: anywhere; }
.show__foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-block-start: 12px;
    margin-block-start: 16px;
    border-block-start: 1px solid var(--rule);
}
.show__brand { font-weight: 700; font-size: 18px; letter-spacing: -0.02em; }
.show__brand span { color: var(--primary); }
.show__close {
    border: none;
    border-radius: 8px;
    background: var(--paper-3);
    color: var(--ink-2);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 14px;
    cursor: pointer;
}
.show__close:hover { background: var(--rule); color: var(--ink); }
.show__close:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
</style>
